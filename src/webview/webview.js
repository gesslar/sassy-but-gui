import * as TK from "./vendor/toolkit.esm.js"

const vscode = acquireVsCodeApi()

const {postMessage} = vscode
const {Notify} = TK

class WebSassy {
  // debugger
  #elements = {}
  #diagnostics = []

  constructor() {
    // Register all elements with IDs
    document
      .querySelectorAll("*[id]")
      .forEach(e => this.#elements[toCamelCase(e.id)] = e)

    // Diagnostics filter
    const {
      diagFilter,
      filterErrors,
      filterWarnings,
      filterInfo,
      btnResolve,
      resolveKey
    } = this.#elements

    Notify.on("input", () => this.#applyDiagFilter(), diagFilter)
    Notify.on("change", () => this.#applyDiagFilter(), filterErrors)
    Notify.on("input", () => this.#applyDiagFilter(), filterWarnings)
    Notify.on("input", () => this.#applyDiagFilter(), filterInfo)
    Notify.on("click", () => this.#doResolve(), btnResolve)
    Notify.on("keydown", evt => evt.key === "ENter" && this.#doResolve(), resolveKey)

    // Building things
    const {
      switchAutobuild,
      btnBuild
    } = this.#elements

    Notify.on("change", evt => postMessage({type: "toggleAutoBuild", enabled: evt.target.checked}), switchAutobuild)
    Notify.on("click", () => postMessage({type: "requestBuild"}), btnBuild)

    // Diagnostics list click
    // this.#elements.diagList.addEventListener("click", evt => {
    //   const item = evt.target.closest(".diag-item")

    //   if(!item?.dataset.location)
    //     return

    //   vscode.postMessage({type: "jumpToLocation", location: item.dataset.location})
    // })

    // Messages from extension
    Notify.on("message", evt => this.#onMessage(evt))

    // Signal ready
    postMessage({type: "ready"})
  }

  #onMessage(event) {
    const message = event.data

    switch(message.type) {
      case "themeData":
        this.#updateThemeData(message.data)
        break
      case "diagnostics":
        this.#updateDiagnostics(message.data)
        break
      case "resolveResult":
        this.#showResolveResult(message.data)
        break
      case "proofResult":
        this.#showProof(message.data)
        break
      case "paletteData":
        this.#showPalette(message.data)
        break
      case "buildStatus":
        this.#buildStatus(message.data)
        break
      case "error":
        this.#showError(message.message)
        break
    }
  }

  #buildStatus(data) {
    this.#setDirty(false)

    if(data.success === false)
      console.error(
        data.error?.message
        ??
        "A unknown problem occurred during theme compilation."
      )
  }

  #debounced = null
  #dirtyDebouncer(dirty) {
    TK.Time.cancel(this.#debounced)

    // Don't debounce if we get a not dirty. idk if this is a good idea,
    // but I think it is. at this time. maybe. we'll see.
    if(dirty === false) {
      this.#setDirty(dirty, true)

      return
    }

    this.#debounced = TK.Time.after(
      30,
      () => {
        this.#setDirty(dirty, true)
      }
    )
  }

  #aborter
  #setDirty(status, debounced=false) {
    // debugger

    this.#aborter?.abort()

    console.info("#setDirty", status, debounced)

    if(!debounced) {
      this.#dirtyDebouncer(status)

      return
    }

    if(status) {
      this.#aborter = new AbortController()
      const els = document.querySelectorAll(".dirty-theme")

      els.forEach(e => {
        e.classList.contains("dirty") && e.classList.remove("dirty")
        e.classList.add("dirty")
        e.addEventListener(
          "transitionend",
          ({target}) => setTimeout(() => target.classList.toggle("two"), 250),
          {signal: this.#aborter.signal}
        )
      })
    } else {
      document.
        querySelectorAll(".dirty-theme").
        forEach(e => e.classList.remove("dirty"))
    }
  }

  #updateThemeData(data) {
    // debugger
    if(!data) {
      this.#elements.themeInfo.hidden = true

      return
    }

    this.#elements.themeInfo.hidden = false

    this.#elements.themePath.textContent = data.relativePath || ""
    this.#elements.switchAutobuild.checked = !!data.autoBuild

    this.#setDirty(data.dirty)
  }

  #updateDiagnostics(data) {
    // debugger

    if(!data)
      return

    this.#diagnostics = []

    const container = this.#elements.diagList
    container.textContent = ""

    const categories = ["variables", "colors", "tokenColors", "semanticTokenColors"]

    for(const category of categories) {
      const items = data[category]
      const group = document.createElement("vscode-tree-item")
      group.setAttribute("open", "")
      const groupName = document.createElement("div")
      groupName.textContent = category.toLocaleUpperCase()
      group.appendChild(groupName)

      if(items.length > 0) {
        const groupCount = document.createElement("vscode-badge")
        groupCount.variant = "counter"
        groupCount.textContent = items.length
        group.appendChild(groupCount)
      }

      if(!items?.length)
        continue

      for(const issue of items) {
        const severity = this.#mapSeverity(issue.severity)

        // if(issue.location)
        //   el.dataset.location = issue.location

        const item = document.createElement("vscode-tree-item")

        if(issue.location)
          item.dataset.location = issue.location

        const message = document.createElement("div")
        message.className = "diag-card"

        const actions = document.createElement("div")
        actions.className = `diag-card-icon ${severity}`
        const itemIcon = document.createElement("vscode-icon")
        itemIcon.setAttribute("name", severity)
        actions.appendChild(itemIcon)
        message.appendChild(actions)

        const btn = document.createElement("vscode-toolbar-button")
        btn.setAttribute("icon", "chevron-up")
        btn.className="toggle-button"
        message.appendChild(btn)

        const details = document.createElement("div")
        details.className = "diag-card-details"

        const msgLine = document.createElement("div")
        msgLine.className = "diag-card-message"
        msgLine.textContent = issue.message
          || `${issue.type}: ${issue.variable || issue.scope || issue.selector || ((issue.broadScope && issue.specificScope) && issue.broadScope + " > " + issue.specificScope) || ""}`
        details.appendChild(msgLine)

        // Category-specific enrichment
        const meta = document.createElement("div")
        meta.className = "diag-card-meta toggleable"

        if(category === "colors") {
          if(issue.value && isHexColor(issue.value)) {
            const label = document.createElement("span")
            label.textContent = "Value:"
            label.className = "diag-card-value-label muted toggleable"
            meta.appendChild(label)

            const val = document.createElement("span")
            val.className = "diag-card-value muted toggleable"
            val.textContent = issue.value
            meta.appendChild(val)

            const swatch = document.createElement("span")
            swatch.className = "diag-card-swatch toggleable"
            swatch.style.backgroundColor = issue.value
            meta.appendChild(swatch)
          }

          if(issue.description) {
            const desc = document.createElement("div")
            desc.className = "diag-card-description muted toggleable"
            desc.textContent = issue.description
            details.appendChild(desc)
          }
        } else if(category === "variables") {
          // everything is already fine here.
        } else if(category === "tokenColors") {
          if(issue.scope) {
            const scopeTag = document.createElement("span")
            scopeTag.className = "diag-card-tag toggleable"
            scopeTag.textContent = issue.scope
            meta.appendChild(scopeTag)
          }

          if(issue.rule) {
            const ruleTag = document.createElement("span")
            ruleTag.className = "diag-card-value toggleable"
            ruleTag.textContent = issue.rule
            meta.appendChild(ruleTag)
          }

          if(issue.broadScope && issue.specificScope) {
            const precDiv = document.createElement("div")
            precDiv.className = "diag-card-precedence toggleable"
            precDiv.innerHTML =
              `<span class="diag-card-tag">${issue.broadScope}</span>`
              + ` masks <span class="diag-card-tag">${issue.specificScope}</span>`
            details.appendChild(precDiv)
          }
        } else if(category === "semanticTokenColors") {
          if(issue.selector) {
            const selTag = document.createElement("span")
            selTag.className = "diag-card-tag toggleable"
            selTag.textContent = issue.selector
            meta.appendChild(selTag)
          }

          if(issue.property) {
            const propTag = document.createElement("span")
            propTag.className = "diag-card-value toggleable"
            propTag.textContent = issue.property
            meta.appendChild(propTag)
          }
        }

        if(meta.childNodes.length > 0)
          details.appendChild(meta)

        if(issue.location) {
          const locLine = document.createElement("div")
          locLine.className = "diag-card-location toggleable"
          locLine.textContent = issue.location
          details.appendChild(locLine)
        }

        btn.addEventListener("click", () => {
          btn.classList.toggle("open")
          const toggleable = item.querySelectorAll(".toggleable")
          toggleable.forEach(e => e.classList.toggle("open"))
        })

        message.appendChild(details)
        item.appendChild(message)
        group.appendChild(item)

        this.#diagnostics.push({el: item, severity, issue})
      }

      container.appendChild(group)
    }

    const hasDiags = this.#diagnostics.length > 0

    this.#elements.diagEmpty.hidden = hasDiags
    this.#applyDiagFilter()

    this.#setDirty(data.dirty)
  }

  #applyDiagFilter() {
    const filterText = this.#elements.diagFilter?.value?.toLowerCase() ?? ""
    const showErrors = this.#elements.filterErrors.checked
    const showWarnings = this.#elements.filterWarnings.checked
    const showInfo = this.#elements.filterInfo.checked
    const anyFilterActive = showErrors || showWarnings || showInfo

    for(const {el, severity, issue} of this.#diagnostics) {
      let visible = true

      if(anyFilterActive) {
        if(severity === "error" && !showErrors)
          visible = false

        if(severity === "warning" && !showWarnings)
          visible = false

        if(severity === "info" && !showInfo)
          visible = false
      }

      if(visible && filterText) {
        const text = (issue.message || "") + (issue.location || "")

        visible = text.toLowerCase().includes(filterText)
      }

      el.classList.toggle("hidden", !visible)
    }
  }

  #doResolve() {
    const resolveType = this.#elements.resolveType.value
    const key = this.#elements.resolveKey.value?.trim()

    if(!key)
      return

    vscode.postMessage({type: "requestResolve", resolveType, key})
  }

  #showResolveResult(data) {
    if(!data?.found) {
      this.#elements.resolveResult.hidden = true
      this.#showError("Could not resolve the specified key.")

      return
    }

    this.#elements.resolveResult.hidden = false

    this.#elements.resolveResultTitle.textContent =
      `Resolution: ${data.key || ""}`

    // Trail
    const trail = this.#elements.resolveTrail

    trail.innerHTML = ""

    const template = document.getElementById("resolve-step-template")

    if(data.trail?.length) {
      for(const step of data.trail) {
        const clone = template.content.cloneNode(true)
        const el = clone.querySelector(".resolve-step")

        el.style.paddingLeft = `${(step.depth ?? 0) * 1}rem`

        el.querySelector(".step-type").textContent = step.type || ""
        el.querySelector(".step-value").textContent = step.value || ""

        const swatch = el.querySelector(".step-swatch")

        if(isHexColor(step.value)) {
          swatch.style.backgroundColor = step.value
        }

        trail.appendChild(el)
      }
    }

    // Final resolution
    const final = this.#elements.resolveFinal

    final.innerHTML = ""

    if(data.resolution) {
      const label = document.createElement("span")

      label.textContent = data.resolution

      final.appendChild(label)

      if(isHexColor(data.resolution)) {
        const swatch = document.createElement("span")

        swatch.className = "resolve-final-swatch"
        swatch.style.backgroundColor = data.resolution
        final.appendChild(swatch)
      }
    }
  }

  #showProof(data) {
    if(!data?.yaml) {
      this.#elements.proofEmpty.hidden = false
      this.#elements.proofScroll.hidden = true
      this.#elements.proofContent.textContent = ""

      return
    }

    this.#elements.proofEmpty.hidden = true
    this.#elements.proofScroll.hidden = false
    this.#elements.proofContent.textContent = data.yaml
  }

  #showPalette(data) {
    if(!data?.colors) {
      this.#elements.paletteEmpty.hidden = false
      this.#elements.paletteGrid.hidden = true

      return
    }

    this.#elements.paletteEmpty.hidden = true
    this.#elements.paletteGrid.hidden = false

    const grid = this.#elements.paletteGrid

    grid.innerHTML = ""

    const template = document.getElementById("palette-swatch-template")

    this.#appendGroup(grid, template, data.colors)
  }

  #mapSeverity(severity) {
    if(severity === "high")
      return "error"

    if(severity === "medium")
      return "warning"

    return "info"
  }

  #appendGroup(grid, template, entries, prefix = "") {
    const isLeaf = v => typeof v?.raw === "string" && typeof v?.value === "string"

    this.#appendSectionHeader(grid, prefix)

    for(const [k, v] of Object.entries(entries)) {
      const label = prefix ? `${prefix}.${k}` : k

      if(isLeaf(v)) {
        // debugger
        this.#appendSwatch(grid, template, k, v)
      } else {
        // debugger
        this.#appendGroup(grid, template, v, label)
      }
    }
  }

  #appendSwatch(grid, template, name, {raw, value}) {
    const clone = template.content.cloneNode(true)
    const el = clone.querySelector(".palette-swatch")

    el.querySelector(".swatch-color").style.backgroundColor = value || ""
    el.querySelector(".swatch-name").textContent = name
    el.querySelector(".swatch-value").textContent = raw || ""

    grid.appendChild(el)
  }

  #appendSectionHeader(grid, name) {
    const header = document.createElement("div")
    header.className = "palette-section-header"
    header.textContent = name
    grid.appendChild(header)
  }

  #showError(message) {
    console.error("[Sassy webview]", message)
  }
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value)
}

function toCamelCase(string) {
  if(/[-_ #$]/.test(string))
    return string
      .split(/[-_ #$]/)
      .map(a => a.trim())
      .filter(Boolean)
      .map((a, i) => i === 0
        ? a.toLowerCase()
        : a.charAt(0).toUpperCase() + a.slice(1).toLowerCase())
      .join("")

  return string
}

document.addEventListener("DOMContentLoaded", () => new WebSassy())
