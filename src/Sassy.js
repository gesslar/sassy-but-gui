import {Cache, FileObject, FileSystem as FS, Glog, Promised} from "@gesslar/toolkit"
import * as vscode from "vscode"
import {Lint, Proof, Theme} from "@gesslar/sassy"
import {Validator, VSCodeSchema} from "@gesslar/vscode-theme-schema"

import DataService from "./DataService.js"
import EventService from "./EventService.js"
import FileService from "./FileService.js"
import {SassyDataProvider} from "./SassyTree.js"

const vscodeSchema = (await VSCodeSchema.new()).map

// yoink!
const {commands, languages, window, workspace} = vscode
const {Range, TabInputText, Uri, ViewColumn} = vscode
const {Selection, TextDocument} = vscode
const {Diagnostic, DiagnosticSeverity, Position, TextEditorRevealType} = vscode

/**
 * @import {DiagnosticCollection} from vscode
 * @import {FileSystemWatcher} from vscode
 */

/**
 * @typedef {object} ThemeMap
 * @property {Theme} theme - Theme object
 * @property {Array<Uri>} dependencies - All dependencies, excluding theme definition file
 * @property {Uri} output - The output file
 */

class Sassy {
  /** An instance of Glog. @type {Glog} */
  #glog
  /** Event controller for messaging, etc. @type {EventService} */
  #eventProvider
  /** Data manipulation things. @type {DataService} */
  #dataService
  /** Tree data provider. @type {SassyDataProvider} */
  #dataProvider
  /** File watchers per theme path. @type {Map<string, FileSystemWatcher[]>} */
  #watchers = new Map()
  /** Output file watchers per theme path. @type {Map<string, FileSystemWatcher[]>} */
  #outputWatchers = new Map()
  /** Diagnostics collection for lint issues. @type {DiagnosticCollection} */
  #diagnostics
  /** Tracks which diagnostic URIs belong to each theme. @type {Map<string, Uri[]>} */
  #diagnosticUris = new Map()
  /** Themes map tracks all theme definitions, deps, and outputs @type {Map<Uri, ThemeMap} */
  #themeMap = new Map()
  /** Theme file and depedency cache. @type {Cache} */
  #cache = new Cache()

  /**
   * Activates the Sassy extension and registers commands and things.
   */
  async activate(context) {
    this.#glog = new Glog({
      displayName: false,
      name: "Sassy",
      prefix: "[SASSY]",
      vscode,
    })

    this.#eventProvider = new EventService({
      glog: this.#glog
    })
    new FileService({
      glog: this.#glog,
      eventProvider: this.#eventProvider
    })
    this.#dataService = new DataService({
      glog: this.#glog
    })
    this.#diagnostics = languages.createDiagnosticCollection("sassy")

    context.subscriptions.push(
      this.#diagnostics,
      commands.registerCommand("sassy.gotoProperty",
        (filePath, property) => this.#gotoProperty(filePath, property)
      ),
      commands.registerCommand("sassy.gotoLocation",
        location => this.#gotoLocation(location)
      ),

      workspace.onDidOpenTextDocument(
        async ctx => await this.#documentOpened(ctx)
      ),
      workspace.onDidCloseTextDocument(
        async ctx => await this.#documentClosed(ctx)
      ),
    )

    this.#eventProvider.on("file.loaded", payload => this.#fileLoaded(payload))

    this.#dataProvider = new SassyDataProvider()
  }

  async #gotoProperty(filePath, property) {
    try {
      const uri = Uri.file(filePath)
      const doc = await workspace.openTextDocument(uri)
      const text = doc.getText()

      const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const pattern = new RegExp(`"${escaped}"\\s*:`)
      const match = pattern.exec(text)

      if(!match)
        return

      const uriStr = uri.toString()
      const existingTab = window.tabGroups.all
        .flatMap(g => g.tabs.map(tab => ({tab, group: g})))
        .find(({tab}) =>
          tab.input instanceof TabInputText
          && tab.input.uri.toString() === uriStr
        )

      const viewColumn = existingTab?.group.viewColumn ?? ViewColumn.One

      const pos = doc.positionAt(match.index + 1)
      const editor = await window
        .showTextDocument(doc, {viewColumn, preview: false})

      editor.revealRange(
        new Range(pos, pos),
        TextEditorRevealType.InCenterIfOutsideViewport
      )

      editor.selection = new Selection(
        pos, pos.translate(0, property.length)
      )
    } catch(error) {
      this.#glog.error(
        `Failed to navigate to ${property}: ${error.message}`
      )
    }
  }

  async #loadBuildAndValidate(node, {lint = false, silent = false} = {}) {
    const {file: themeFile} = node
    const filePath = themeFile.path
    const themeData = await themeFile.loadData()
    const configOutputPath = themeData?.config?.output
    const themeDir = FS.pathParts(themeFile.path).dir

    const outputDir = configOutputPath
      ? FS.resolvePath(themeDir, configOutputPath)
      : undefined

    const theme = await new Theme()
      .setThemeFile(themeFile)
      .withOptions({outputDir})
      .load()

    await theme.build()

    if(outputDir) {
      await theme.write()
    } else {
      this.#glog.warn(`Missing 'config.output' in '${themeFile.name}', skipping write.`)
    }

    if(lint) {
      const lintResult = await new Lint().run(theme)

      this.#dataProvider.addFile(themeFile, lintResult)
      this.#publishDiagnostics(filePath, lintResult)
    }

    const build = theme.getOutput() ?? {}
    const validation = await Validator.validate(vscodeSchema, build.colors)

    let outputPath
    if(outputDir) {
      const outputName = theme.getOutputFileName()

      outputPath = FS.resolvePath(outputDir, outputName)
    }

    this.#dataProvider.setValidation(filePath, validation, outputPath)
    this.#watchOutput(filePath, outputPath)

    if(!silent)
      this.#glog.info(`Compiled ${themeFile.name}`)

    return theme
  }

  #stopWatching(filePath) {
    const watchers = this.#watchers.get(filePath)

    if(watchers) {
      watchers.forEach(w => w.dispose())
      this.#watchers.delete(filePath)
    }
  }

  #watchOutput(filePath, outputPath) {
    if(!outputPath)
      return

    // Dispose old output watcher if targeting a different path
    this.#stopOutputWatching(filePath)

    const outputUri = Uri.file(outputPath)
    const fileWatcher = workspace.createFileSystemWatcher(outputPath)

    fileWatcher.onDidChange(async() => {
      try {
        const raw = await workspace.fs.readFile(outputUri)
        const data = JSON.parse(Buffer.from(raw).toString("utf-8"))
        const validation = await Validator.validate(
          vscodeSchema, data?.colors
        )

        this.#dataProvider.setValidation(filePath, validation, outputPath)
      } catch(error) {
        this.#glog.error(
          `Failed to re-validate output for ${filePath}: ${error.message}`
        )
      }
    })

    fileWatcher.onDidDelete(() => {
      this.#dataProvider.clearValidation(filePath)
    })

    // Watch parent directory deletion (file watcher
    // won't fire if a parent directory is removed)
    const parentPath = FS.pathParts(outputPath).dir
    const dirWatcher = workspace.createFileSystemWatcher(parentPath)

    dirWatcher.onDidDelete(() => {
      this.#dataProvider.clearValidation(filePath)
    })

    this.#outputWatchers.set(filePath, [fileWatcher, dirWatcher])
  }

  #stopOutputWatching(filePath) {
    const watchers = this.#outputWatchers.get(filePath)

    if(watchers) {
      watchers.forEach(w => w.dispose())
      this.#outputWatchers.delete(filePath)
    }
  }

  async #onWatchedFileChange(node) {
    const {file: themeFile} = node

    try {
      const theme = await new Theme()
        .setThemeFile(themeFile).load()

      await theme.build()

      const lint = await new Lint().run(theme)

      this.#dataProvider.addFile(themeFile, lint)
      this.#publishDiagnostics(themeFile.path, lint)

      this.#stopWatching(themeFile.path)
      this.#setWatchers(node, theme)
    } catch(error) {
      this.#glog.error(
        `Re-lint failed for ${themeFile.name}: ${error.message}`
      )
    }
  }

  #setWatchers(node, theme) {
    const {file: themeFile} = node
    const filePath = themeFile.path

    const depPaths = [...theme.getDependencies()]
      .map(d => d.getSourceFile().path)

    const allPaths = [filePath, ...depPaths]
    const watchers = allPaths.map(p => {
      const watcher = workspace.createFileSystemWatcher(p)

      watcher.onDidChange(
        () => this.#onWatchedFileChange(node)
      )

      return watcher
    })

    this.#watchers.set(filePath, watchers)
  }

  async #gotoLocation(location) {
    try {
      const [filePath, lineStr, colStr] = location.split(":")
      const line = Math.max(0, parseInt(lineStr, 10) - 1)
      const col = Math.max(0, parseInt(colStr, 10) - 1)

      const uri = Uri.file(filePath)
      const doc = await workspace.openTextDocument(uri)

      const uriStr = uri.toString()
      const existingTab = window.tabGroups.all
        .flatMap(g => g.tabs.map(tab => ({tab, group: g})))
        .find(({tab}) =>
          tab.input instanceof TabInputText
          && tab.input.uri.toString() === uriStr
        )

      const viewColumn = existingTab?.group.viewColumn
        ?? ViewColumn.One

      const pos = new Position(line, col)
      const editor = await window
        .showTextDocument(doc, {viewColumn, preview: false})

      editor.revealRange(
        new Range(pos, pos),
        TextEditorRevealType.InCenterIfOutsideViewport
      )

      editor.selection = new Selection(pos, pos)
    } catch(error) {
      this.#glog.error(
        `Failed to navigate to location: ${error.message}`
      )
    }
  }

  #publishDiagnostics(filePath, lint) {
    const severityMap = {
      high: DiagnosticSeverity.Error,
      medium: DiagnosticSeverity.Warning,
      low: DiagnosticSeverity.Information,
    }

    const byFile = new Map()

    const addIssue = (issue, category) => {
      if(!issue.location)
        return

      const parts = issue.location.split(":")
      const file = parts[0]
      const line = Math.max(0, parseInt(parts[1], 10) - 1)
      const col = Math.max(0, parseInt(parts[2], 10) - 1)

      const message = issue.message
        || `${issue.type}: ${issue.variable || issue.scope || issue.selector || ""}`
      const severity = severityMap[issue.severity] ?? severityMap.low

      const range = new Range(line, col, line, col)
      const diag = new Diagnostic(range, message, severity)

      diag.source = `sassy (${category})`

      if(!byFile.has(file))
        byFile.set(file, [])

      byFile.get(file).push(diag)
    }

    for(const issue of lint.variables ?? [])
      addIssue(issue, "variables")

    for(const issue of lint.tokenColors ?? []) {
      if(Array.isArray(issue.occurrences) && issue.occurrences.length > 0) {
        for(const o of issue.occurrences) {
          addIssue({
            ...issue,
            location: o.location ?? issue.location,
            message: issue.message
              || `${issue.type}: ${issue.scope} (${o.name ?? o})`,
          }, "tokenColors")
        }
      } else {
        addIssue(issue, "tokenColors")
      }
    }

    for(const issue of lint.semanticTokenColors ?? [])
      addIssue(issue, "semanticTokenColors")

    this.#clearDiagnosticsForTheme(filePath)

    const uris = []

    for(const [file, diags] of byFile) {
      const uri = Uri.file(file)

      uris.push(uri)
      this.#diagnostics.set(uri, diags)
    }

    this.#diagnosticUris.set(filePath, uris)
  }

  #clearDiagnosticsForTheme(filePath) {
    const uris = this.#diagnosticUris.get(filePath)

    if(uris) {
      uris.forEach(uri => this.#diagnostics.delete(uri))
      this.#diagnosticUris.delete(filePath)
    }
  }

  async #fileLoaded(payload) {
    const {file, content} = payload
    if(!this.#dataService.validThemeSource(file, content))
      return

    try {
      const theme = await new Theme().setThemeFile(file).load()

      await theme.build()

      const lint = await new Lint().run(theme)

      this.#dataProvider.addFile(file, lint)
      this.#publishDiagnostics(file.path, lint)

      this.#stopWatching(file.path)
      this.#setWatchers({file}, theme)
    } catch(error) {
      this.#glog.error(error.message, error.stack)
    }
  }

  /**
   * Fired when a {@link TextDocument} is opened
   *
   * @param {TextDocument} document
   */
  async #documentOpened(document) {
    try {
      if(!document.uri.fsPath.endsWith("yaml"))
        return

      await this.#buildThemeMap(document.uri)

      const file = new FileObject(document.fileName)
      const content = await file.loadData()

      this.#eventProvider.emit("file.loaded", {file, content})
    } catch(error) {
      this.#glog.error(error)
    }
  }

  async #documentClosed(document) {
    try {
      if(!this.#isSassyDefinitionFile(document))
        return

      const file = new FileObject(document.fileName)
      const content = await file.loadData()

      this.#eventProvider.emit("file.loaded", {file, content})
    } catch(error) {
      this.#glog.error(error)
    }
  }

  #sassyFileExtension = /\.sassy\.yaml$/

  #isSassyDefinitionFile(uri) {
    return this.#sassyFileExtension.test(uri.fsPath)
  }

  #findThemeInfo(uri) {
    for(const [file, map] of this.#themeMap.entries()) {
      if(file.fsPath === uri.fsPath)
        return map

      const {deps} = map
      if(deps.find(e => e.fsPath === uri.fsPath))
        return map
    }
  }

  async #buildThemeMap() {
    try {
      const defs = await workspace.findFiles("*.sassy.yaml")
      const settled = await Promised.settle(
        defs.map(async uri => {
          const file = new FileObject(uri.fsPath)
          const theme = new Theme().setCache(this.#cache).setThemeFile(file)
          const proof = await new Proof().run(theme, true)
          const dependencies = proof.config.import.map(e => {
            const resolved = FS.resolvePath(file.parentPath, e)

            return Uri.file(resolved)
          })

          return {uri, theme, dependencies}
        })
      )

      this.#themeMap.clear()

      for(const element of Promised.values(settled)) {
        this.#themeMap.set(element.uri, {
          theme: element.theme,
          dependencies: element.dependencies
        })
      }

    } catch(error) {
      this.#glog.error(error)
    }
  }
}

export default Sassy
