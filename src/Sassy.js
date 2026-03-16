import {Lint, Resolve, Theme, WriteStatus} from "@gesslar/sassy"
import {Cache, Data, FileObject, FileSystem as FS, Glog} from "@gesslar/toolkit"
import * as vscode from "vscode"

import EventService from "./EventService.js"
import SassyPanel from "./SassyPanel.js"
import {Validator, VSCodeSchema} from "@gesslar/vscode-theme-schema"

const {commands, window, workspace} = vscode
const {Range, Selection, TabInputText, Uri, ViewColumn} = vscode
const {Position, TextEditorRevealType} = vscode

class Sassy {
  /** @type {vscode.ExtensionContext} */
  #context
  /** @type {Glog} */
  #glog
  /** @type {EventService} */
  #eventProvider
  /** @type {Map<string, SassyPanel>} */
  #panels = new Map()
  /** @type {Map<string, {watcher: vscode.FileSystemWatcher, themes: Set<string>}>} */
  #watchers = new Map()
  /** @type {Map<string, Theme>} */
  #themeMap = new Map()
  /** @type {Set<string>} */
  #autoBuildThemes = new Set()
  /** @type {Set<string>} */
  #dirtyThemes = new Set()
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
    this.#context = context
    this.#glog = new Glog({
      displayName: false,
      name: "Sassy",
      prefix: "[SASSY]",
      vscode,
    })

    this.#schema = await VSCodeSchema.new()
    this.#eventProvider = new EventService({glog: this.#glog})

    context.subscriptions.push(
      commands.registerCommand("sassy.showPanel",
        uri => this.#showPanel(uri)
      ),
      commands.registerCommand("sassy.buildTheme",
        uri => this.#buildThemeToDisk(uri)
      ),
      commands.registerCommand("sassy.enableAutoBuild",
        () => this.#setAutoBuild(window.activeTextEditor?.document.uri, true)
      ),
      commands.registerCommand("sassy.disableAutoBuild",
        () => this.#setAutoBuild(window.activeTextEditor?.document.uri, false)
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
    this.#eventProvider.on("theme.built", ctx => this.#sendThemeData(ctx))
    this.#eventProvider.on("theme.built", ctx => this.#sendPaletteData(ctx))
    this.#eventProvider.on("theme.built", ctx => this.#sendProof(ctx))
    this.#eventProvider.on("theme.linted", ctx => this.#sendDiagnostics(ctx))
  }

  /**
   * Shows a panel for the given theme URI, creating one if needed.
   *
   * @param {Uri} [explorerUri] - The theme URI from explorer context menu.
   */
  async #showPanel(explorerUri) {
    const uri = explorerUri ?? window.activeTextEditor?.document.uri

    if(!uri || !this.#isSassyDefinitionFile(uri))
      return

    const existing = this.#panels.get(uri.fsPath)

    if(existing) {
      await existing.show()

      return
    }

    const theme = await this.#ensureTheme(uri)

    if(!theme)
      return

    if(!this.#autoBuildThemes.has(uri.fsPath))
      this.#autoBuildThemes.add(uri.fsPath)

    this.#updateAutoBuildContext()

    const title = theme.getName() ?? "Sassy"
    const panel = new SassyPanel({
      context: this.#context,
      glog: this.#glog,
      messageHandler: msg => this.#handleWebviewMessage(uri, msg),
      title,
      themeUri: uri,
      onDispose: () => this.#panels.delete(uri.fsPath),
    })

    this.#panels.set(uri.fsPath, panel)
    await panel.show()
  }

  /**
   * Gets the panel associated with a theme URI.
   *
   * @param {Uri} uri - The theme URI.
   * @returns {SassyPanel|undefined}
   */
  #getPanelForTheme(uri) {
    return this.#panels.get(uri.fsPath)
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
      this.#dirtyThemes.add(uri.fsPath)

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
      const theme = await this.#ensureTheme(uri)

      if(!theme)
        return

      const lint = await new Lint().run(theme)
      lint.colors = (await Validator.validate(
        this.#schema.map,
        theme.getOutput()?.colors
      ))
        .filter(e => e.status !== "valid")

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
      const theme = await this.#ensureTheme(uri)

      if(!theme)
        return

      const panel = this.#getPanelForTheme(uri)

      if(panel) {
        panel.setTitle(theme.getName())
        panel.postMessage({
          type: "themeData",
          data: {
            name: theme.getName(),
            path: uri.fsPath,
            relativePath: workspace.asRelativePath(uri),
            proof: theme.getProof(),
            autoBuild: this.#autoBuildThemes.has(uri.fsPath) || false,
            dirty: this.#dirtyThemes.has(uri.fsPath),
          }
        })
      }
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

      this.#getPanelForTheme(uri)?.postMessage({
        type: "diagnostics",
        data: {
          themeName: theme.getName(),
          dirty: this.#dirtyThemes.has(uri.fsPath),
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
      const theme = await this.#ensureTheme(uri)

      if(!theme)
        return

      const pool = theme.getPool()
      const tokens = pool.getTokens().entries().filter(([name, _]) => name.startsWith("palette.") && !name.includes("__prior__"))
      const resolvedPalette = {}

      for(const [name, token] of tokens) {
        const key = name.slice("palette.".length)
        Data.setNestedValue(resolvedPalette, key.split("."), {raw: token.getRawValue(), value: token.getValue()})
      }

      this.#getPanelForTheme(uri)?.postMessage({type: "paletteData", data: {colors: resolvedPalette}})
    } catch(error) {
      this.#glog.error(error)
    }
  }

  /**
   * Handles messages from the webview.
   *
   * @param {Uri} themeUri - The theme URI this panel is bound to.
   * @param {object} message - The message from the webview.
   */
  async #handleWebviewMessage(themeUri, message) {
    switch(message.type) {
      case "ready":
        await this.#sendCurrentState(themeUri)
        break
      case "requestBuild":
        await this.#buildThemeToDisk(themeUri)
        break
      case "requestResolve":
        await this.#resolveForWebview(themeUri, message)
        break
      case "requestProof":
        await this.#sendProof(themeUri)
        break
      case "jumpToLocation":
        await this.#gotoLocation(message.location)
        break
      case "toggleAutoBuild":
        this.#setAutoBuild(themeUri, message.enabled)
        break
      case "log":
        this.#glog.info(`[webview]: ${message.msg}`)
        break
    }
  }

  /**
   * Sends current state to the webview on ready.
   *
   * @param {Uri} uri - The theme URI.
   */
  async #sendCurrentState(uri) {
    const theme = this.#themeMap.get(uri.fsPath)

    if(!theme)
      return

    await this.#sendThemeData(uri)
    this.#eventProvider.asyncEmit("file.loaded", uri)
  }

  /**
   * Resolves a color/token/semantic and sends the result to the webview.
   *
   * @param {Uri} uri - The theme URI.
   * @param {object} param1 - The resolve request.
   */
  async #resolveForWebview(uri, {resolveType, key}) {
    try {
      const theme = await this.#ensureTheme(uri)

      if(!theme)
        return

      const panel = this.#getPanelForTheme(uri)
      const resolver = new Resolve()
      let data

      if(resolveType === "color")
        data = await resolver.color(theme, key)
      else if(resolveType === "tokenColor")
        data = await resolver.tokenColor(theme, key)
      else if(resolveType === "semanticTokenColor")
        data = await resolver.semanticTokenColor(theme, key)

      panel?.postMessage({
        type: "resolveResult",
        data: {...data, key, resolveType}
      })
    } catch(error) {
      this.#glog.error(error)
      this.#getPanelForTheme(uri)?.postMessage({type: "error", message: error.message})
    }
  }

  /**
   * Generates and sends the proof (composed YAML) to the webview.
   *
   * @param {Uri} uri - The theme URI.
   */
  async #sendProof(uri) {
    try {
      const theme = await this.#ensureTheme(uri)

      if(!theme)
        return

      this.#getPanelForTheme(uri)?.postMessage({
        type: "proofResult",
        data: {yaml: theme.getProof()}
      })
    } catch(error) {
      this.#glog.error(error)
      this.#getPanelForTheme(uri)?.postMessage({type: "error", message: error.message})
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

      await this.#ensureTheme(document.uri)
      this.#autoBuildThemes.add(document.uri.fsPath)
      this.#updateAutoBuildContext()
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
      this.#dirtyThemes.delete(filePath)
      this.#autoBuildThemes.delete(filePath)
    } catch(error) {
      this.#glog.error(error)
    }
  }

  async #buildThemeToDisk(explorerUri) {
    try {
      // debugger
      const themeUri = explorerUri
        ?? window.activeTextEditor?.document.uri

      if(!themeUri || !this.#isSassyDefinitionFile(themeUri))
        return

      const theme = await this.#ensureTheme(themeUri)

      if(!theme)
        return

      if(!theme.canWrite())
        return

      const result = await theme.write()

      this.#dirtyThemes.delete(themeUri.fsPath)

      const message = result.status === WriteStatus.SKIPPED
        ? `No changes to write`
        : `Built to ${result.file.path}`

      this.#glog.info("Posting message about a build status.")

      this.#getPanelForTheme(themeUri)?.postMessage({
        type: "buildStatus",
        data: {success: true, message}
      })

      this.#sendThemeData(themeUri)
    } catch(error) {
      const uri = explorerUri ?? window.activeTextEditor?.document.uri

      this.#glog.error(`Failed to build theme: ${error.message}`)
      this.#getPanelForTheme(uri)?.postMessage({
        type: "buildStatus",
        data: {success: false, message: error.message}
      })
    }
  }

  #setAutoBuild(uri, enabled) {
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

    const theme = this.#themeMap.get(uri.fsPath)

    if(!theme?.canWrite())
      return

    try {
      this.#buildThemeToDisk(uri)
    } catch(error) {
      this.#glog.error(`Auto-build failed: ${error.message}`)
    }
  }

  /**
   * Ensures a theme is loaded and built for the given URI.
   *
   * @param {Uri} uri - The theme file URI.
   * @returns {Promise<Theme|undefined>}
   */
  async #ensureTheme(uri) {
    let theme = this.#themeMap.get(uri.fsPath)

    if(!theme) {
      theme = await this.#loadTheme(uri)

      if(!theme)
        return

      this.#themeMap.set(uri.fsPath, theme)
    }

    if(!theme.isCompiled())
      await theme.build()

    return theme
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
    this.#panels.forEach(p => p.dispose())
    this.#panels.clear()
  }
}

export default Sassy
