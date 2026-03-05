import {Data, FileObject} from "@gesslar/toolkit"
import * as vscode from "vscode"
import {Lint, Theme} from "@gesslar/sassy"
import {Validator, VSCodeSchema} from "@gesslar/vscode-theme-schema"

const {Uri} = vscode
const {window, ViewColumn} = vscode
const vscodeSchema = (await VSCodeSchema.new()).map

const $resources = {
  base: {
    directory: ["src", "webview"]
  },
  codicons: {
    directory: ["node_modules", "@vscode", "codicons", "dist"],
    file: ["node_modules", "@vscode", "codicons", "dist", "codicon.css"],
  },
  webview: {
    file: ["webview.html"]
  }
}

export default class SassyPanel {
  #glog
  #state
  #eventProvider
  #context
  /** The webview panel. @type {vscode.WebviewPanel} */
  #webviewPanel
  #file

  constructor({context, glog, eventProvider}) {
    this.#context = context
    this.#state = {}
    this.#glog = glog
    this.#eventProvider = eventProvider
  }

  async showWebviewPanel({context=this.#context, file=null, content=null}) {
    if(this.#webviewPanel) {
      this.#webviewPanel.reveal()
    } else {
      await this.#createWebviewPanel(context)
    }

    if(!this.#webviewPanel)
      return

    this.#file = file

    if(file)
      await this.#processFile(context, file, content)
  }

  async #createWebviewPanel(context) {
    try {
      const localResourceRoots = Array.from(Object.values($resources))
        .filter(e => Object.hasOwn(e, "directory"))
        .map(e => this.#extPathToUri(e.directory))

      this.#webviewPanel = window.createWebviewPanel(
        "Sassy",
        "Sassy",
        ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots,
          retainContextWhenHidden: true
        }
      )

      this.#webviewPanel.onDidDispose(
        () => {
          this.dispose()
        }, null, context.subscriptions
      )

      this.#webviewPanel.onDidChangeViewState(_ => {
        // nothing to see here
      })

      this.#webviewPanel.webview.html = await this.#getWebviewContent()

      // Handle messages from webview
      this.#webviewPanel.webview.onDidReceiveMessage(
        async message => this.#processMessage(message),
        null,
        this.#context.subscriptions
      )

      context.subscriptions.push(this.#webviewPanel)
    } catch(error) {
      this.#glog.error(error)
    }
  }

  async #processFile(context, file) {
    try {
      // First, set the title
      this.#webviewPanel.title = `Sassy - ${file.name}`

      const theme = await new Theme().setThemeFile(file).load()
      const build = (await theme.build()).getOutput() ?? {}
      const lint = await new Lint().run(theme)
      const validation = await Validator.validate(vscodeSchema, build.colors)
      const message = {lint, validation}

      // Now pass the information along to the webview!
      this.#webviewPanel?.webview.postMessage({
        type: "content",
        message
      })
    } catch(error) {
      this.#glog.error(error.message, error.stack)
    }
  }

  async #processMessage(message) {
    this.#glog.info(`Got ${message.type}`)

    switch(message.type) {
      case "refresh": {
        this.#webviewPanel.webview.html = await this.#getWebviewContent()
        break
      }

      case "error": {
        this.#glog.error(message.message)
        break
      }

      default:
        break
    }
  }

  #extPathToUri(parts) {
    return Uri.joinPath(this.#context.extensionUri, ...parts)
  }

  async #getWebviewContent() {
    try {
      const wv = this.#webviewPanel.webview
      const {base, codicons, webview} = $resources

      // Now setup the base
      const baseDir = this.#extPathToWebviewUri(base.directory)
      const codiFile = this.#extPathToWebviewUri(codicons.file)

      // Now find things
      const thisFile = new FileObject(import.meta.filename)

      // Get the html
      const htmlFile = thisFile.parent.getFile(`src/webview/${webview.file}`)
      const html = await htmlFile.read()

      // Replace placeholders in the html file
      const subbed = html
        .replace(/\{\{BASE_URI\}\}/g, Data.append(baseDir.toString(), "/"))
        .replace(/\{\{CSP_SOURCE\}\}/g, wv.cspSource)
        .replace(/\{\{CODICON_CSS\}\}/g, codiFile.toString())

      // yeet
      return subbed
    } catch(error) {
      this.#glog.error(error.stack)

      const safe = error.message
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")

      return `<div class="error">Error loading webview content: ${safe}</div>`
    }
  }

  #extPathToWebviewUri(parts) {
    if(!this.#webviewPanel?.webview)
      throw new Error("No such thing as a webview.")

    return this.#webviewPanel.webview.asWebviewUri(this.#extPathToUri(parts))
  }

  dispose() {
    this.#webviewPanel = null
    this.#eventProvider.emit("panel.disposed", this.#file)
  }
}
