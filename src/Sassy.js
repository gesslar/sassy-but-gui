import {Glog} from "@gesslar/toolkit"
import * as vscode from "vscode"

import DataService from "./DataService.js"
import EventService from "./EventService.js"
import FileService from "./FileService.js"
import SassyPanel from "./SassyPanel.js"
import * as MyTree from "./SassyTree.js"

/** A panel for each file @type {Map<FileObject, SassyPanel>} */
const panels = new Map()

/**
 * @import {FileObject} from "@gesslar/toolkit"
 */

class Sassy {
  /** An instance of Glog. @type {Glog} */
  #glog
  /** Event controller for messaging, etc. @type {EventService} */
  #eventProvider
  /** File operations. @type {FileService} */
  #fileProvider
  /** Data manipulation things. @type {DataService} */
  #dataService

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
    this.#fileProvider = new FileService({
      glog: this.#glog,
      eventProvider: this.#eventProvider
    })
    this.#dataService = new DataService({
      glog: this.#glog
    })

    context.subscriptions.push(
      vscode.commands
        .registerCommand("sassy.open", () => this.#eventProvider.emit("file.open"))
    )

    this.#eventProvider.on("file.loaded", payload => this.#fileLoaded(context, payload))
    this.#eventProvider.on("panel.disposed", file => panels.delete(file.path))

    const myDataProvider = new MyTree.MyDataProvider()
    vscode.window.registerTreeDataProvider("myTreeView", myDataProvider)

  }

  async #fileLoaded(context, payload) {
    const {file, content} = payload

    if(!this.#dataService.validThemeSource(file, content))
      return

    if(panels.get(file.path))
      return

    const panel = new SassyPanel({
      context,
      glog: this.#glog,
      eventProvider: this.#eventProvider
    })

    context.subscriptions.push(panel)
    panels.set(file.path, panel)

    await panel.showWebviewPanel({context, file, content})
  }
}

export default Sassy
