import {Lint, Resolve, Theme} from "@gesslar/sassy"
import {Cache, Data, FileObject, FileSystem as FS, Glog} from "@gesslar/toolkit"
import * as vscode from "vscode"

import {Sass} from "@gesslar/toolkit/browser"
import EventService from "./EventService.js"
import SassyPanel from "./SassyPanel.js"
import {Validator, VSCodeSchema} from "@gesslar/vscode-theme-schema"

const {commands, window, workspace} = vscode
const {Range, Selection, TabInputText, Uri, ViewColumn} = vscode
const {Position, TextEditorRevealType} = vscode

class Sassy {
  /** @type {Glog} */
  #glog
  /** @type {EventService} */
  #eventProvider
  /** @type {SassyPanel} */
  #panel
  /** @type {Map<string, {watcher: vscode.FileSystemWatcher, themes: Set<string>}>} */
  #watchers = new Map()
  /** @type {Map<string, Theme>} */
  #themeMap = new Map()
  /** @type {Set<string>} */
  #autoBuildThemes = new Set()
  /** @type {Cache} */
  #cache = new Cache()
  #schema

  #sassyFileExtension = ".sassy.yaml"
  #sassyFileExtensionRegex = new RegExp(`${this.#sassyFileExtension.replaceAll(/\./g, "\\.")}$`)

  /**
   * Activates the Sassy extension.
   *
   * @param {vscode.ExtensionContext} context - The extension context.
   */
  async activate(context) {
    this.#glog = new Glog({
      displayName: false,
      name: "Sassy",
      prefix: "[SASSY]",
      vscode,
    })

    this.#schema = await VSCodeSchema.new()
    this.#eventProvider = new EventService({glog: this.#glog})

    this.#panel = new SassyPanel(
      context, this.#glog, msg => this.#handleWebviewMessage(msg)
    )

    context.subscriptions.push(
      commands.registerCommand("sassy.showPanel",
        () => this.#panel.show()
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

    // Register webview panel serializer for persistence
    window.registerWebviewPanelSerializer(SassyPanel.viewType, {
      deserializeWebviewPanel: async panel => {
        await this.#panel.restore(panel)
      }
    })

    this.#eventProvider.on("file.loaded", ctx => this.#build(ctx))
    this.#eventProvider.on("theme.built", ctx => this.#lint(ctx))
    this.#eventProvider.on("theme.built", ctx => this.#autoBuildToDisk(ctx))
    this.#eventProvider.on("theme.built", ctx => this.#sendThemeData(ctx))
    this.#eventProvider.on("theme.built", ctx => this.#sendPaletteData(ctx))
    this.#eventProvider.on("theme.built", ctx => this.#sendProof(ctx))
    this.#eventProvider.on("theme.linted", ctx => this.#sendDiagnostics(ctx))
  }

  /**
   * Builds a theme from its Uri.
   *
   * @param {Uri} uri - The theme's Uri.
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
      // this.#panel.postMessage({type: "error", message: error.message})
    }
  }

  /**
   * Lints a theme from its Uri.
   *
   * @param {Uri} uri - The theme's Uri.
   */
  async #lint(uri) {
    try {
      const theme = this.#themeMap.get(uri.fsPath)

      if(!theme)
        return

      if(!theme.canBuild())
        return

      const lint = await new Lint().run(theme)
      lint.colors = await Validator.validate(
        this.#schema.map,
        theme.getOutput()?.colors
      )

      this.#eventProvider.emit("theme.linted", {uri, lint})
    } catch(error) {
      this.#glog.error(error, error.stack)
    }
  }

  /**
   * Sends theme data to the webview after a build.
   *
   * @param {Uri} uri - The theme's Uri.
   */
  async #sendThemeData(uri) {
    try {
    /** @type {Theme} */
      const theme = this.#themeMap.get(uri.fsPath)

      if(!theme)
        return

      if(!theme.isCompiled())
        throw Sassy.new("Theme has not been built yet.")

      this.#panel.postMessage({
        type: "themeData",
        data: {
          name: theme.getName(),
          path: uri.fsPath,
          proof: theme.getProof(),
          autoBuild: this.#autoBuildThemes.has(uri.fsPath) || false,
        }
      })
    } catch(error) {
      this.#glog.error(error, error.stack)
    }
  }

  /**
   * Sends lint diagnostics to the webview.
   *
   * @param {object} ctx - The context with uri and lint results.
   */
  #sendDiagnostics({uri, lint}) {
    try {
      const theme = this.#themeMap.get(uri.fsPath)

      if(!theme)
        return

      this.#panel.postMessage({
        type: "diagnostics",
        data: {
          themeName: theme.getName(),
          variables: lint.variables ?? [],
          tokenColors: this.#flattenTokenColorIssues(lint.tokenColors ?? []),
          semanticTokenColors: lint.semanticTokenColors ?? [],
          colors: lint.colors ?? [],
        }
      })

      // Update watcher registrations
      this.#stopWatching(uri.fsPath)
      this.#setWatchers(theme)
    } catch(error) {
      this.#glog.error(error, error.stack)
    }
  }

  /**
   * Flattens token color issues that have nested occurrences.
   *
   * @param {Array} issues - Token color lint issues.
   * @returns {Array} Flattened issues.
   */
  #flattenTokenColorIssues(issues) {
    const result = []

    for(const issue of issues) {
      if(Array.isArray(issue.occurrences) && issue.occurrences.length > 0) {
        for(const o of issue.occurrences) {
          result.push({
            ...issue,
            location: o.location ?? issue.location,
            message: issue.message
              || `${issue.type}: ${issue.scope} (${o.name ?? o})`,
          })
        }
      } else {
        result.push(issue)
      }
    }

    return result
  }

  /**
   * Extracts palette data from a theme and sends it to the webview.
   *
   * @param {Theme} theme - The Theme object.
   */
  async #sendPaletteData(uri) {
    try {
      const theme = this.#themeMap.get(uri.fsPath)

      if(!theme)
        return

      if(!theme.isCompiled())
        throw Sass.new("Theme has not been built yet.")

      const pool = theme.getPool()
      const tokens = pool.getTokens().entries().filter(([name, _]) => name.startsWith("palette.") && !name.includes("__prior__"))
      const resolvedPalette = {}

      for(const [name, token] of tokens) {
        const key = name.slice("palette.".length)
        Data.setNestedValue(resolvedPalette, key.split("."), {raw: token.getRawValue(), value: token.getValue()})
      }

      this.#panel.postMessage({type: "paletteData", data: {colors: resolvedPalette}})
    } catch(error) {
      this.#glog.error(error)
    }
  }

  /**
   * Handles messages from the webview.
   *
   * @param {object} message - The message from the webview.
   */
  async #handleWebviewMessage(message) {
    switch(message.type) {
      case "ready":
        await this.#sendCurrentState()
        break
      case "requestBuild":
        await this.#buildThemeToDisk()
        break
      case "requestLint": {
        const uri = this.#getActiveThemeUri()

        if(uri)
          await this.#lint(uri)

        break
      }

      case "requestResolve":
        await this.#resolveForWebview(message)
        break
      case "requestProof":
        await this.#sendProof()
        break
      case "jumpToLocation":
        await this.#gotoLocation(message.location)
        break
      case "toggleAutoBuild":
        this.#setAutoBuild(message.enabled)
        break
      case "log":
        this.#glog.info(`[webview]: ${message.msg}`)
        break
    }
  }

  /**
   * Sends current state to the webview on ready.
   */
  async #sendCurrentState() {
    const uri = this.#getActiveThemeUri()

    if(!uri)
      return

    const theme = this.#themeMap.get(uri.fsPath)

    if(!theme)
      return

    await this.#sendThemeData(uri)
    this.#eventProvider.asyncEmit("file.loaded", uri)
  }

  /**
   * Gets the URI of the currently active sassy theme.
   *
   * @returns {Uri|null}
   */
  #getActiveThemeUri() {
    const uri = window.activeTextEditor?.document.uri

    if(uri && this.#isSassyDefinitionFile(uri))
      return uri

    // Fallback to first loaded theme
    const first = this.#themeMap.keys().next().value

    return first ? Uri.file(first) : null
  }

  /**
   * Resolves a color/token/semantic and sends the result to the webview.
   *
   * @param {object} param0 - The resolve request.
   */
  async #resolveForWebview({resolveType, key}) {
    try {
      const uri = this.#getActiveThemeUri()

      if(!uri)
        return

      const theme = this.#themeMap.get(uri.fsPath)

      if(!theme)
        return

      const resolver = new Resolve()
      let data

      if(resolveType === "color")
        data = await resolver.color(theme, key)
      else if(resolveType === "tokenColor")
        data = await resolver.tokenColor(theme, key)
      else if(resolveType === "semanticTokenColor")
        data = await resolver.semanticTokenColor(theme, key)

      this.#panel.postMessage({
        type: "resolveResult",
        data: {...data, key, resolveType}
      })
    } catch(error) {
      this.#glog.error(error)
      this.#panel.postMessage({type: "error", message: error.message})
    }
  }

  /**
   * Generates and sends the proof (composed YAML) to the webview.
   */
  async #sendProof() {
    try {
      const uri = this.#getActiveThemeUri()

      if(!uri)
        return

      const theme = this.#themeMap.get(uri.fsPath)

      if(!theme)
        return

      this.#panel.postMessage({
        type: "proofResult",
        data: {yaml: theme.getProof()}
      })
    } catch(error) {
      this.#glog.error(error)
      this.#panel.postMessage({type: "error", message: error.message})
    }
  }

  /**
   * Remove a theme from all its watched paths.
   *
   * @param {string} themePath - The theme's file path.
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
   * Update shared watchers for the theme and its dependencies.
   *
   * @param {Theme} theme - The Theme object.
   */
  #setWatchers(theme) {
    const themePath = theme.getSourceFile().path

    const newPaths = new Set(
      [...theme.getDependencies()].map(d => d.getSourceFile().path)
    )

    newPaths.add(themePath)

    for(const [watchedPath, entry] of this.#watchers) {
      if(!newPaths.has(watchedPath)) {
        entry.themes.delete(themePath)

        if(entry.themes.size === 0) {
          entry.watcher.dispose()
          this.#watchers.delete(watchedPath)
        }
      }
    }

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

  /**
   * Navigates to a file:line:col location in the editor.
   *
   * @param {string} location - Location string in file:line:col format.
   */
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

  /**
   * Fired when a document is opened.
   *
   * @param {vscode.TextDocument} document
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

      this.#stopWatching(filePath)
      this.#themeMap.delete(filePath)
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

      this.#panel.postMessage({
        type: "buildStatus",
        data: {success: true, message: `Built to ${outputFile}`}
      })
    } catch(error) {
      this.#glog.error(`Failed to build theme: ${error.message}`)
      this.#panel.postMessage({
        type: "buildStatus",
        data: {success: false, message: error.message}
      })
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

      theme.setOptions({outputDir: outputPath})

      return theme
    } catch(error) {
      this.#glog.error(error)
    }
  }

  async deactivate() {
    this.#watchers.forEach(v => v.watcher.dispose())
  }
}

export default Sassy
