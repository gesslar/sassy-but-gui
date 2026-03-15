import {Data, FileObject, Glog} from "@gesslar/toolkit"
import * as vscode from "vscode"

const {Uri, ViewColumn, window} = vscode

const $resources = {
  base: {
    directory: ["src", "webview"]
  },
  codicons: {
    directory: ["node_modules", "@vscode", "codicons", "dist"],
    file: ["node_modules", "@vscode", "codicons", "dist", "codicon.css"],
  },
  elements: {
    directory: ["node_modules", "@vscode-elements", "elements", "dist"],
    file: ["node_modules", "@vscode-elements", "elements", "dist", "bundled.js"],
  }
}

/**
 * Manages the Sassy webview panel lifecycle and communication.
 */
export default class SassyPanel {
  static viewType = "sassy.panel"

  /** @type {Glog} */
  #glog
  /** @type {vscode.ExtensionContext} */
  #context
  /** @type {vscode.WebviewPanel|null} */
  #panel = null
  /** @type {(unknown) => {}} */
  #messageHandler

  /**
   * Creates a new SassyPanel instance.
   *
   * @param {vscode.ExtensionContext} context - The extension context.
   * @param {Glog} glog - Logger instance.
   * @param {(unknown) => {}} messageHandler - Callback for webview messages.
   */
  constructor(context, glog, messageHandler) {
    this.#context = context
    this.#glog = glog
    this.#messageHandler = messageHandler
  }

  /**
   * Shows the webview panel, creating it if needed.
   */
  async show() {
    if(this.#panel) {
      this.#panel.reveal()
    } else {
      await this.#createPanel()
    }
  }

  /**
   * Posts a message to the webview.
   *
   * @param {object} message - The message to send.
   */
  postMessage(message) {
    this.#panel?.webview.postMessage(message)
  }

  /**
   * Whether the panel is currently visible.
   *
   * @returns {boolean}
   */
  get isVisible() {
    return !!this.#panel?.visible
  }

  /**
   * Restores a serialized webview panel.
   *
   * @param {vscode.WebviewPanel} panel - The panel to restore.
   */
  async restore(panel) {
    this.#panel = panel
    this.#wirePanel()
    panel.webview.html = await this.#getWebviewContent()
  }

  /**
   * Disposes the panel and cleans up.
   */
  dispose() {
    this.#panel = null
  }

  async #createPanel() {
    try {
      const localResourceRoots = Object.values($resources)
        .map(e => this.#extPathToUri(e.directory))

      this.#panel = window.createWebviewPanel(
        SassyPanel.viewType,
        "Sassy",
        ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots,
          retainContextWhenHidden: true
        }
      )

      this.#wirePanel()
      this.#panel.webview.html = await this.#getWebviewContent()
    } catch(error) {
      this.#glog.error(error)
    }
  }

  #wirePanel() {
    this.#panel.onDidDispose(
      () => this.dispose(),
      null,
      this.#context.subscriptions
    )

    this.#panel.webview.onDidReceiveMessage(
      async message => this.#messageHandler(message),
      null,
      this.#context.subscriptions
    )
  }

  /**
   * Loads the HTML content from the webview.html file and replaces
   * placeholders with actual URIs.
   *
   * @returns {Promise<string>} The processed HTML.
   */
  async #getWebviewContent() {
    try {
      const webview = this.#panel.webview
      const {base, codicons, elements} = $resources

      const baseDir = this.#extPathToWebviewUri(base.directory)
      const codiFile = this.#extPathToWebviewUri(codicons.file)
      const eleFile = this.#extPathToWebviewUri(elements.file)

      const thisFile = new FileObject(import.meta.filename)
      const htmlFile = thisFile.parent.getFile("webview/webview.html")
      const html = await htmlFile.read()

      return html
        .replace(/\{\{BASE_URI\}\}/g, Data.append(baseDir.toString(), "/"))
        .replace(/\{\{CSP_SOURCE\}\}/g, webview.cspSource)
        .replace(/\{\{CODICON_CSS\}\}/g, codiFile.toString())
        .replace(/\{\{ELEMENTS_JS\}\}/g, eleFile.toString())
    } catch(error) {
      this.#glog.error(error.stack)

      const safe = error.message
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")

      return `<div class="error">Error loading webview content: ${safe}</div>`
    }
  }

  #extPathToUri(parts) {
    return Uri.joinPath(this.#context.extensionUri, ...parts)
  }

  #extPathToWebviewUri(parts) {
    return this.#panel.webview.asWebviewUri(this.#extPathToUri(parts))
  }
}
