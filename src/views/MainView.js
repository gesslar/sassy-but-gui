import {Data, FileObject} from "@gesslar/toolkit"
import * as vscode from "vscode"

const {Uri} = vscode
const {window, ViewColumn} = vscode

const $resources = {
  base: {
    directory: ["src", "webview"]
  },
  codicons: {
    directory: ["node_modules", "@vscode", "codicons", "dist"],
    file: ["node_modules", "@vscode", "codicons", "dist", "codicon.css"],
  }
}

export default class MainView {
  #glog
  #state
  #eventProvider
  #context
  #webviewView

  constructor({context, glog, eventProvider}) {
    this.#context = context
    this.#state = {}
    this.#glog = glog
    this.#eventProvider = eventProvider
  }

  async showWebview({context=this.#context, file=null}) {
    if(this.#webviewView) {
      this.#webviewView.reveal()
    } else {
      await this.#createWebview(context)
    }

    if(this.#webviewView && file)
      this.#webviewView.title = `Sassy - ${file.name}`
  }

  async #createWebview(context) {
    try {
      const localResourceRoots = Array.from(Object.values($resources))
        .map(e => this.#extPathToUri(e.directory))

      this.#webviewView = window.createWebviewPanel(
        "Sassy",
        "Sassy",
        ViewColumn.Beside,
        {
          enableScripts: true,
          localResourceRoots,
          retainContextWhenHidden: true
        }
      )

      this.#webviewView.onDidDispose(
        () => {
          this.dispose()
        }, null, context.subscriptions
      )

      this.#webviewView.onDidChangeViewState(_ => {
        // nothing to see here
      })

      this.#webviewView.webview.html = await this.#getWebviewContent()

      // Handle messages from webview
      this.#webviewView.webview.onDidReceiveMessage(
        async message => this.#processMessage(message),
        null,
        this.#context.subscriptions
      )

    } catch(error) {
      this.#glog.error(error)
    }
  }

  async #processMessage(message) {
    switch(message.type) {
      default:
        break
    }
  }

  #extPathToUri(parts) {
    return Uri.joinPath(this.#context.extensionUri, ...parts)
  }

  async #getWebviewContent() {
    try {
      const webview = this.#webviewView.webview
      const {base, codicons} = $resources

      // Now setup the base
      const baseDir = this.#extPathToWebviewUri(base.directory)
      const codiFile = this.#extPathToWebviewUri(codicons.file)

      // Get the html
      const thisFile = new FileObject(import.meta.filename)
      const htmlFile = thisFile.parent.parent.getFile("webview/webview.html")
      const html = await htmlFile.read()

      // Replace placeholders in the html file
      const subbed = html
        .replace(/\{\{BASE_URI\}\}/g, Data.append(baseDir.toString(), "/"))
        .replace(/\{\{CSP_SOURCE\}\}/g, webview.cspSource)
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
    if(!this.#webviewView?.webview)
      throw new Error("No such thing as a webview.")

    return this.#webviewView.webview.asWebviewUri(this.#extPathToUri(parts))
  }
}
