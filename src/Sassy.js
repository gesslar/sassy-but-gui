import {Glog} from "@gesslar/toolkit"
import * as vscode from "vscode"

import EventService from "./services/EventService.js"
import FileService from "./services/FileService.js"
import DataService from "./services/DataService.js"
import MainView from "./views/MainView.js"

class Sassy {
  #glog
  #eventProvider
  #fileProvider
  #dataService
  #mainView

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
  }

  async #fileLoaded(context, payload) {
    const {file, content} = payload

    if(!this.#dataService.validThemeSource(file, content))
      return

    if(this.#mainView)
      return

    this.#mainView = new MainView({
      context,
      glog: this.#glog,
      eventProvider: this.#eventProvider
    })

    await this.#mainView.showWebview(payload)
  }
}

export default Sassy
