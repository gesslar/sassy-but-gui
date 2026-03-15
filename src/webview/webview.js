const vscode = acquireVsCodeApi()
const {setState, getState} = vscode

class WebSassy {
  // debugger
  #elements = {}
  #activeTab = "dashboard"
  #diagnostics = []

  constructor() {
    // Register all elements with IDs
    document.querySelectorAll("*[id]")
      .forEach(e => {
        this.#elements[toCamelCase(e.id)] = e
      })

    // Dashboard actions
    this.#elements.btnBuild.addEventListener("click", () =>
      vscode.postMessage({type: "requestBuild"})
    )

    this.#elements.btnLint.addEventListener("click", () =>
      vscode.postMessage({type: "requestLint"})
    )

    this.#elements.switchAutobuild.addEventListener("change", evt =>
      vscode.postMessage({type: "toggleAutoBuild", enabled: evt.target.checked})
    )

    // Diagnostics filter
    this.#elements.diagFilter.addEventListener("input", () => this.#applyDiagFilter())
    this.#elements.filterErrors.addEventListener("change", () => this.#applyDiagFilter())
    this.#elements.filterWarnings.addEventListener("change", () => this.#applyDiagFilter())
    this.#elements.filterInfo.addEventListener("change", () => this.#applyDiagFilter())

    // Diagnostics list click
    this.#elements.diagList.addEventListener("click", evt => {
      const item = evt.target.closest(".diag-item")

      if(!item?.dataset.location)
        return

      vscode.postMessage({type: "jumpToLocation", location: item.dataset.location})
    })

    // Resolve
    this.#elements.btnResolve.addEventListener("click", () => this.#doResolve())
    this.#elements.resolveKey.addEventListener("keydown", evt => {
      if(evt.key === "Enter")
        this.#doResolve()
    })

    // Messages from extension
    window.addEventListener("message", evt => this.#onMessage(evt))

    // Signal ready
    vscode.postMessage({type: "ready"})
  }

  #save(ob) {
    setState({...getState(), ...ob})
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
        this.#updateBuildStatus(message.data)
        break
      case "error":
        this.#showError(message.message)
        break
    }
  }

  #updateThemeData(data) {
    if(!data) {
      this.#elements.noTheme.hidden = false
      this.#elements.themeInfo.hidden = true

      return
    }

    this.#elements.noTheme.hidden = true
    this.#elements.themeInfo.hidden = false

    this.#elements.themeName.textContent = data.name || "Unnamed Theme"
    this.#elements.themePath.textContent = data.path || ""
    this.#elements.switchAutobuild.selected = !!data.autoBuild
  }

  #updateDiagnostics(data) {
    debugger

    if(!data)
      return

    this.#diagnostics = []
    const container = this.#elements.diagList

    container.innerHTML = ""

    const categories = ["variables", "tokenColors", "semanticTokenColors", "colors"]

    for(const category of categories) {
      const items = data[category]

      if(!items?.length)
        continue

      // Category header
      const header = document.createElement("div")

      header.className = "diag-group-header"
      header.textContent = category
      container.appendChild(header)

      const template = document.getElementById("diag-item-template")

      for(const issue of items) {
        const clone = template.content.cloneNode(true)
        const el = clone.querySelector(".diag-item")
        const severity = this.#mapSeverity(issue.severity)

        el.classList.add(`severity-${severity}`)

        if(issue.location)
          el.dataset.location = issue.location

        const icon = el.querySelector(".diag-icon")

        icon.classList.add(`codicon-${severity}`)

        const msg = el.querySelector(".diag-message")

        msg.textContent = issue.message
          || `${issue.type}: ${issue.variable || issue.scope || issue.selector || ""}`

        const badge = el.querySelector(".diag-category")

        badge.textContent = category

        const loc = el.querySelector(".diag-location")

        loc.textContent = issue.location || ""

        this.#diagnostics.push({issue, el, severity, category})
        container.appendChild(el)
      }
    }

    const hasDiags = this.#diagnostics.length > 0

    this.#elements.diagEmpty.hidden = hasDiags
    this.#applyDiagFilter()
  }

  #mapSeverity(severity) {
    if(severity === "high")
      return "error"

    if(severity === "medium")
      return "warning"

    return "info"
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

  #updateBuildStatus(data) {
    const el = this.#elements.buildStatus

    el.hidden = false
    el.className = `status-card ${data.success ? "success" : "error"}`

    el.querySelector(".status-icon").className =
      `codicon status-icon codicon-${data.success ? "check" : "error"}`

    this.#elements.buildStatusText.textContent = data.message || "Done"
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
