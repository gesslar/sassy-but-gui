import {Lint, Resolve, Theme} from "@gesslar/sassy"
import {Cache, FileObject, FileSystem as FS, Glog} from "@gesslar/toolkit"
import {Validator, VSCodeSchema} from "@gesslar/vscode-theme-schema"
import * as vscode from "vscode"

import EventService from "./EventService.js"
import {DiagnosticTreeProvider} from "./DiagnosticTreeProvider.js"

const vscodeSchema = (await VSCodeSchema.new()).map

// yoink!
const {commands, languages, window, workspace} = vscode
const {Range, TabInputText, Uri, ViewColumn} = vscode
const {Selection, TextDocument} = vscode
const {Diagnostic, DiagnosticSeverity, Position, TextEditorRevealType} = vscode

class Sassy {
  /** An instance of Glog. @type {Glog} */
  #glog
  /** Event controller for messaging, etc. @type {EventService} */
  #eventProvider
  /** @type {DiagnosticTreeProvider} */
  #diagnosticTreeProvider
  /** Shared file watchers. @type {Map<string, {watcher: vscode.FileSystemWatcher, themes: Set<string>}>} */
  #watchers = new Map()
  /** Diagnostics collection per theme. @type {Map<string, vscode.DiagnosticCollection>} */
  #diagnostics = new Map()
  /** Themes map tracks all theme definitions, deps, and outputs @type {Map<string, Theme}>} */
  #themeMap = new Map()
  /** Themes with auto-build enabled. @type {Set<string>} */
  #autoBuildThemes = new Set()

  /** Theme file and depedency cache. @type {Cache} */
  #cache = new Cache()

  /** The file extension supported by this VS Code extension @type {string} */
  #sassyFileExtension = ".sassy.yaml"
  /** The file extension supported by this VS Code extension @type {RegExp} */
  #sassyFileExtensionRegex = new RegExp(`${this.#sassyFileExtension.replaceAll(/\./g, "\\.")}$`)

  /** @type {vscode.CommentController} */
  #commentController
  /** Active resolve threads. @type {Map<string, vscode.CommentThread>} */
  #resolveThreads = new Map()

  #subscriptions

  /**
   * Activates the Sassy extension and registers commands and things.
   */
  async activate(context) {
    this.#subscriptions = context.subscriptions

    this.#glog = new Glog({
      displayName: false,
      name: "Sassy",
      prefix: "[SASSY]",
      vscode,
    })

    this.#eventProvider = new EventService({glog: this.#glog})

    this.#diagnosticTreeProvider = new DiagnosticTreeProvider()

    this.#commentController = vscode.comments.createCommentController(
      "sassy.resolve", "Sassy Color Resolution"
    )

    this.#commentController.commentingRangeProvider = null

    context.subscriptions.push(
      this.#commentController,
      commands.registerCommand("sassy.gotoProperty",
        (filePath, property) => this.#gotoProperty(filePath, property)
      ),
      commands.registerCommand("sassy.gotoLocation",
        location => this.#gotoLocation(location)
      ),
      commands.registerCommand("sassy.buildTheme",
        uri => this.#buildThemeToDisk(uri)
      ),
      commands.registerCommand("sassy.enableAutoBuild",
        () => this.#setAutoBuild(true)
      ),
      commands.registerCommand("sassy.disableAutoBuild",
        () => this.#setAutoBuild(false)
      ),
      commands.registerCommand("sassy.resolveColor",
        (themePath, colorName, uri, line) =>
          this.#resolveColor(themePath, colorName, uri, line)
      ),
      commands.registerCommand("sassy.dismissResolve",
        threadKey => this.#dismissResolve(threadKey)
      ),
      languages.registerCodeActionsProvider(
        {pattern: "**/*"},
        {
          provideCodeActions: (doc, range, ctx) =>
            this.#provideResolveActions(doc, range, ctx),
        },
        {providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]}
      ),

      workspace.onDidOpenTextDocument(
        async ctx => await this.#documentOpened(ctx)
      ),
      workspace.onDidCloseTextDocument(
        async ctx => await this.#documentClosed(ctx)
      ),
      window.onDidChangeActiveTextEditor(
        () => this.#updateAutoBuildContext()
      ),
    )

    this.#eventProvider.on("file.loaded", ctx => this.#build(ctx))
    this.#eventProvider.on("theme.built", ctx => this.#lint(ctx))
    this.#eventProvider.on("theme.built", ctx => this.#autoBuildToDisk(ctx))
    this.#eventProvider.on("theme.linted", ctx => this.#publishDiagnostics(ctx))
  }

  /**
   * Build a theme from its Uri. Looks up the value from {@link Sassy.#themeMap},
   * and if present, performs a build. If the theme does not exist, this is a
   * no-op.
   *
   * Emits `theme.built` asynchronously with the theme's Uri upon completion.
   *
   * @async
   * @param {Uri} uri - The theme's Uri.
   * @returns {Promise<undefined>} What it says on the tin.
   */
  async #build(uri) {
    try {
      const fileName = uri.fsPath
      const theme = this.#themeMap.get(fileName)

      if(!theme)
        return

      await theme.build()

      this.#eventProvider.asyncEmit("theme.built", uri)
    } catch(error) {
      this.#glog.error(error)
    }
  }

  /**
   * Lints a theme from its Uri. Looks up the value from
   * {@link Sassy.#themeMap}, and if present, performs a lint operation. If
   * the theme does not exist, or is not ready, this is a no-op.
   *
   * Although this method is called #lint, it is also resolution validation.
   * There's no reason this cannot fall under the same umbrella-ella-ella, eh,
   * eh, eh-eh. Normies don't know the difference. We'll just use a read-only
   * document probably later if there's a click-to-jump-to-bad-choices need.
   *
   * @param {Uri} uri - The theme's Uri.
   * @returns {Promise<undefined>} What it says on the tin.
   */
  async #lint(uri) {
    try {
      const theme = this.#themeMap.get(uri.fsPath)

      if(!theme)
        return

      if(!theme.isReady)
        return

      const lint = await new Lint().run(theme)

      this.#eventProvider.emit("theme.linted", {uri, lint})
    } catch(error) {
      this.#glog.error(error)
    }
  }

  /**
   * Remove a theme from all its watched paths. Disposes watchers that
   * no longer have any themes depending on them.
   *
   * @param {string} themePath - The theme's file path
   */
  #stopWatching(themePath) {
    for(const [watchedPath, entry] of this.#watchers) {
      entry.themes.delete(themePath)

      if(entry.themes.size === 0) {
        entry.watcher.dispose()
        this.#watchers.delete(watchedPath)
      }
    }
  }

  /**
   * Update shared watchers for the theme and its dependencies. Adds
   * the theme to existing watchers or creates new ones as needed.
   * Removes the theme from watchers it no longer depends on.
   *
   * @param {Theme} theme - The Theme object
   */
  #setWatchers(theme) {
    const themePath = theme.getSourceFile().path

    const newPaths = new Set(
      [...theme.getDependencies()].map(d => d.getSourceFile().path)
    )

    newPaths.add(themePath)

    // Remove this theme from watchers it no longer needs
    for(const [watchedPath, entry] of this.#watchers) {
      if(!newPaths.has(watchedPath)) {
        entry.themes.delete(themePath)

        if(entry.themes.size === 0) {
          entry.watcher.dispose()
          this.#watchers.delete(watchedPath)
        }
      }
    }

    // Add or join watchers for current deps
    for(const depPath of newPaths) {
      const existing = this.#watchers.get(depPath)

      if(existing) {
        existing.themes.add(themePath)
        continue
      }

      const watcher = workspace.createFileSystemWatcher(depPath)

      watcher.onDidChange(() => {
        const entry = this.#watchers.get(depPath)

        if(!entry)
          return

        for(const tp of entry.themes)
          this.#eventProvider.asyncEmit("file.loaded", Uri.file(tp))
      })

      this.#watchers.set(depPath, {watcher, themes: new Set([themePath])})
    }
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

  async #publishDiagnostics({uri, lint}) {
    const theme = this.#themeMap.get(uri.fsPath)

    if(!theme)
      return

    if(!this.#diagnostics.has(uri.fsPath)) {
      const diag = languages.createDiagnosticCollection(`sassy - ${theme.getName()}`)

      this.#subscriptions.push(diag)
      this.#diagnostics.set(uri.fsPath, diag)
    }

    this.#stopWatching(uri.fsPath)
    this.#setWatchers(theme)

    const collection = this.#diagnostics.get(uri.fsPath)

    collection.clear()

    const severityMap = {
      high: DiagnosticSeverity.Error,
      medium: DiagnosticSeverity.Warning,
      low: DiagnosticSeverity.Information,
    }

    const themeName = theme.getName()
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

      diag.source = `sassy: ${themeName} (${category})`

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

    // Color validation against VS Code schema
    const output = theme.getOutput()
    const colors = output?.colors
    const configOutputPath = theme.getSource().config?.output

    if(colors && configOutputPath) {
      const outputDir = FS.resolvePath(
        new FileObject(uri.fsPath).parentPath,
        configOutputPath
      )
      const outputFile = FS.resolvePath(outputDir, `${themeName}.color-theme.json`)
      const outputExists = await workspace.fs.stat(Uri.file(outputFile))
        .then(() => true, () => false)

      if(outputExists) {
        const validation = await Validator.validate(vscodeSchema, colors)
        const invalidColors = validation.filter(v => v.status !== "valid")
        const outputJson = JSON.stringify(output, null, 2)

        const colorDiags = invalidColors.map(v => {
          const line = this.#findPropertyLine(outputJson, v.property)
          const range = new Range(line, 0, line, 0)
          const severity = v.status === "invalid"
            ? DiagnosticSeverity.Error
            : DiagnosticSeverity.Warning
          const diag = new Diagnostic(range, v.message || v.property, severity)

          diag.source = `sassy: ${themeName} (colors)`
          diag.code = v.property

          return diag
        })

        byFile.set(outputFile, colorDiags)
      }
    }

    for(const [file, diags] of byFile)
      collection.set(Uri.file(file), diags)

    const themeFile = {name: theme.name ?? uri.fsPath.split("/").pop(), path: uri.fsPath}
    this.#diagnosticTreeProvider.addFile(themeFile, lint)
  }

  /**
   * Fired when a {@link vscode.TextDocument} is opened
   *
   * @param {TextDocument} document
   */
  async #documentOpened(document) {
    try {
      if(!this.#isSassyDefinitionFile(document.uri))
        return

      const theme =
        this.#themeMap.get(document.uri.fsPath)
        ?? await this.#loadTheme(document.uri)

      if(!this.#themeMap.has(document.uri.fsPath))
        this.#themeMap.set(document.uri.fsPath, theme)

      this.#eventProvider.asyncEmit("file.loaded", document.uri)
    } catch(error) {
      this.#glog.error(error)
    }
  }

  async #documentClosed(document) {
    try {
      if(!this.#isSassyDefinitionFile(document.uri))
        return

      const filePath = document.uri.fsPath
      const collection = this.#diagnostics.get(filePath)

      if(collection) {
        collection.clear()
        collection.dispose()
        this.#diagnostics.delete(filePath)
      }

      this.#stopWatching(filePath)
      this.#themeMap.delete(filePath)
      this.#diagnosticTreeProvider.removeFile(filePath)
    } catch(error) {
      this.#glog.error(error)
    }
  }

  async #buildThemeToDisk(explorerUri) {
    try {
      const themeUri = explorerUri
        ?? window.activeTextEditor?.document.uri

      if(!themeUri || !this.#isSassyDefinitionFile(themeUri))
        return

      // Ensure theme is loaded
      let theme = this.#themeMap.get(themeUri.fsPath)

      if(!theme) {
        theme = await this.#loadTheme(themeUri)

        if(!theme)
          return

        this.#themeMap.set(themeUri.fsPath, theme)
        await theme.build()
      }

      const output = theme.getOutput()

      if(!output)
        return

      const configOutputPath = theme.getSource().config?.output

      if(!configOutputPath) {
        window.showWarningMessage("No output path configured in theme file.")

        return
      }

      const outputDir = FS.resolvePath(
        new FileObject(themeUri.fsPath).parentPath,
        configOutputPath
      )
      const outputFile = FS.resolvePath(outputDir, `${theme.getName()}.color-theme.json`)
      const outputUri = Uri.file(outputFile)
      const encoded = Buffer.from(JSON.stringify(output, null, 2), "utf-8")

      await workspace.fs.writeFile(outputUri, encoded)

      window.showInformationMessage(`Built theme to ${outputFile}`)
    } catch(error) {
      this.#glog.error(`Failed to build theme: ${error.message}`)
    }
  }

  #setAutoBuild(enabled) {
    const uri = window.activeTextEditor?.document.uri

    if(!uri || !this.#isSassyDefinitionFile(uri))
      return

    const themePath = uri.fsPath

    if(enabled) {
      this.#autoBuildThemes.add(themePath)
    } else {
      this.#autoBuildThemes.delete(themePath)
    }

    this.#updateAutoBuildContext()
  }

  #updateAutoBuildContext() {
    const uri = window.activeTextEditor?.document.uri
    const active = uri
      && this.#isSassyDefinitionFile(uri)
      && this.#autoBuildThemes.has(uri.fsPath)

    commands.executeCommand("setContext", "sassy.autoBuildActive", !!active)
  }

  async #autoBuildToDisk(uri) {
    if(!this.#autoBuildThemes.has(uri.fsPath))
      return

    await this.#buildThemeToDisk(uri)
  }

  #provideResolveActions(document, range, context) {
    const actions = []

    for(const diag of context.diagnostics) {
      if(!diag.source?.startsWith("sassy:"))
        continue

      // Extract color name from color diagnostics
      if(diag.source.includes("(colors)") && diag.code) {
        const colorName = diag.code

        // Find which theme this belongs to
        const themePath = this.#findThemeForDiagnostic(diag.source)

        if(!themePath)
          continue

        const action = new vscode.CodeAction(
          `Resolve color: ${colorName}`,
          vscode.CodeActionKind.QuickFix
        )

        action.command = {
          command: "sassy.resolveColor",
          title: "Resolve Color",
          arguments: [themePath, colorName, document.uri, range.start.line],
        }

        action.diagnostics = [diag]
        actions.push(action)
      }
    }

    return actions
  }

  #findThemeForDiagnostic(source) {
    const match = source.match(/^sassy:\s*(.+?)\s*\(/)

    if(!match)
      return null

    const themeName = match[1]

    for(const [path, theme] of this.#themeMap) {
      if(theme.getName() === themeName)
        return path
    }

    return null
  }

  async #resolveColor(themePath, colorName, uri, line) {
    try {
      const theme = this.#themeMap.get(themePath)

      if(!theme)
        return

      const resolver = new Resolve()
      const data = await resolver.color(theme, colorName)

      if(!data?.found)
        return

      const threadKey = `${uri.toString()}:${line}:${colorName}`

      // Dismiss existing thread at this location
      this.#dismissResolve(threadKey)

      const comments = []

      // Build the trail as comments
      if(data.trail?.length > 0) {
        for(const step of data.trail) {
          const indent = "  ".repeat(step.depth ?? 0)
          const body = `${indent}${step.type}: ${step.value}`

          comments.push({
            body: new vscode.MarkdownString(`\`${body}\``),
            mode: vscode.CommentMode.Preview,
            author: {name: "sassy"},
          })
        }
      }

      if(data.resolution) {
        comments.push({
          body: new vscode.MarkdownString(
            `**Resolution:** \`${data.resolution}\``
          ),
          mode: vscode.CommentMode.Preview,
          author: {name: "sassy"},
        })
      }

      const thread = this.#commentController.createCommentThread(
        uri,
        new Range(line, 0, line, 0),
        comments
      )

      thread.label = `Resolve: ${colorName}`
      thread.canReply = false
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded

      this.#resolveThreads.set(threadKey, thread)
    } catch(error) {
      this.#glog.error(`Failed to resolve color: ${error.message}`)
    }
  }

  #dismissResolve(threadKey) {
    const existing = this.#resolveThreads.get(threadKey)

    if(existing) {
      existing.dispose()
      this.#resolveThreads.delete(threadKey)
    }
  }

  #findPropertyLine(json, property) {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const pattern = new RegExp(`^\\s*"${escaped}"\\s*:`, "m")
    const match = pattern.exec(json)

    if(!match)
      return 0

    return json.slice(0, match.index).split("\n").length - 1
  }

  #isSassyDefinitionFile(uri) {
    return this.#sassyFileExtensionRegex.test(uri.fsPath)
  }

  async #loadTheme(uri) {
    try {
      const file = new FileObject(uri.fsPath)
      const theme = new Theme().setCache(this.#cache).setThemeFile(file)

      await theme.load()

      const configOutputPath = theme.getSource().config?.output
      const outputPath = FS.resolvePath(
        new FileObject(uri.fsPath).parentPath,
        configOutputPath
      )

      theme.withOptions({outputDir: outputPath})

      return theme
    } catch(error) {
      this.#glog.error(error)
    }
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

  async deactivate() {
    this.#diagnostics.forEach(v => v.dispose())
  }
}

export default Sassy
