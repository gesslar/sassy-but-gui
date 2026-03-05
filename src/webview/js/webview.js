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

    Notify.on("message", this.#onMessage)
    Notify.on("content-updated", this.#onNewContent)
    Notify.on("updated-validation", ctx => this.#onUpdatedValidation(ctx))
    Notify.on("updated-lint", ctx => this.#onUpdatedLint(ctx))
  }

  #onMessage(evt) {
    try {
      const message = evt.data

      switch(message.type) {
        case "content": {
          Notify.emit("content-updated", message.message)
          break
        }
      }
    } catch(error) {
      vscode.postMessage({
        type: "error",
        message: error.message
      })
    }
  }

  #onNewContent({detail: content}) {
    const {lint, resolved, validation} = content

    lint && Notify.emit("updated-lint", lint)
    resolved && Notify.emit("updated-resolved", resolved)
    validation && Notify.emit("updated-validation", validation)
  }

  #onUpdatedLint({detail}) {
    const mainElement = document.querySelector("main")
    const {tokenColors, semanticTokenColors, variables} = detail

    const variablesPanel = document.createElement(`sassy-validation-panel`)
    variablesPanel.setAttribute("kind", "variables")
    mainElement.appendChild(variablesPanel)

    for(const variable of variables) {
      const {severity, type, variable: name, occurrence} = variable
      const el = document.createElement("sassy-validation-variables-item")

      el.setAttribute("severity", severity)
      el.setAttribute("type", type)
      el.setAttribute("name", name)
      el.setAttribute("occurrence", occurrence)

      variablesPanel.appendChild(el)
    }

    console.log(mainElement)

    const tokenColorsPanel = document.createElement(`sassy-validation-panel`)
    tokenColorsPanel.setAttribute("kind", "tokenColors")
    mainElement.appendChild(tokenColorsPanel)

    for(const tokenColor of tokenColors) {
      const {severity, type, scope, occurrences} = tokenColor
      const el = document.createElement("sassy-validation-tokencolors-item")

      el.setAttribute("severity", severity)
      el.setAttribute("type", type)
      el.setAttribute("scope", scope)
      el.setAttribute("occurrences", JSON.stringify(occurrences.map(e => e.name)))

      tokenColorsPanel.appendChild(el)
    }

    const semanticTokenColorsPanel = document.createElement(`sassy-validation-panel`)
    semanticTokenColorsPanel.setAttribute("kind", "semanticTokenColors")
    mainElement.appendChild(semanticTokenColorsPanel)

    for(const tokenColor of semanticTokenColors) {
      const {severity, type, tokenType, message} = tokenColor
      const el = document.createElement("sassy-validation-semantictokencolors-item")

      el.setAttribute("severity", severity)
      el.setAttribute("type", type)
      el.setAttribute("tokenType", tokenType)
      el.setAttribute("message", message)

      semanticTokenColorsPanel.appendChild(el)
    }

  }

  #onUpdatedValidation({detail}) {
    const mainElement = document.querySelector("main")
    const colors = detail.filter(e => e.status !== "valid")

    const colorsPanel = document.createElement(`sassy-validation-panel`)
    colorsPanel.setAttribute("kind", "colors")
    mainElement.appendChild(colorsPanel)

    for(const color of colors) {
      const {property, message, description, value} = color

      const el = document.createElement("sassy-validation-colors-item")

      el.setAttribute("severity", "medium")
      el.setAttribute("type", "validation error")
      el.setAttribute("property", property)
      el.setAttribute("message", message)
      el.setAttribute("description", description)
      el.setAttribute("value", value)

      colorsPanel.appendChild(el)
    }
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
