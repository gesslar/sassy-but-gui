import * as vscode from "vscode"

import {FileObject} from "@gesslar/toolkit"

// Aliases
const {window, workspace} = vscode

export default class FileService {
  #glog
  #eventProvider

  constructor({glog, eventProvider}) {
    this.#glog = glog
    this.#eventProvider = eventProvider

    this.#eventProvider.on("file.open", this.#openFile)
  }

  #openFile = async() => {
    try {
      const fileUri = await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          "Sassy theme file": ["sassy.yaml"]
        },
        defaultUri: workspace.workspaceFolders?.[0]?.uri
      })

      const resourceUri = fileUri?.[0]

      if(resourceUri) {
        const file = new FileObject(resourceUri.fsPath)
        const content = await file.loadData()

        this.#eventProvider.emit("file.loaded", {file, content})
      }
    } catch(error) {
      console.error("Nope", error)
      // throw error
    }
  }
}
