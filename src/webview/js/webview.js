const vscode = acquireVsCodeApi()

import {Notify, Util} from "./vendor/toolkit-3.31.0.js"

class Sassy {
  #elements = {}

  constructor() {
    // Find everything that has an id and register it for easy use!
    document.querySelectorAll("*[id]")
      .forEach(e => {
        e.dataset.elementName = toCamelCase(e.id)
        this.#elements[e.dataset.elementName] = e
      })

    // const refreshButton =
    Notify.on("click", this.#refresh, this.#elements.refreshButton)
  }

  #refresh() {
    vscode.postMessage({type: "refresh"})
  }
}

function toCamelCase(string) {
  if(/[-_ #$]/.test(string))
    return string
      .split(/[-_ #$]/)
      .map(a => a.trim())
      .filter(Boolean)
      .map(a => a
        .split("")
        .filter(b => /[\w]/.test(b))
        .filter(Boolean)
        .join("")
      )
      .map(a => a.toLowerCase())
      .map((a, i) => i === 0 ? a : Util.capitalize(a))
      .join("")

  return string
}

Notify.on("DOMContentLoaded", () => new Sassy())
