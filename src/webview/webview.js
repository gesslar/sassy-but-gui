import * as TK from "./vendor/toolkit.esm.js"
import * as Elements from "https://file%2B.vscode-resource.vscode-cdn.net/projects/git/sassy-but-gui/node_modules/%40vscode-elements/elements/dist/bundled.js"

const vscode = acquireVsCodeApi()

const {postMessage} = vscode
const {Notify} = TK

class WebSassy {
  // debugger
  #elements = {}
  #diagnostics = []
  #output = {}
  #resolveLookup = {}
  #diagnosticDisposer = new TK.DisposerClass()
  #resolveDisposer = new TK.DisposerClass()

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
    } = this.#elements

    Notify.on("input", evt => this.#applyDiagFilter(evt), diagFilter)
    Notify.on("click", evt => this.#applyDiagFilter(evt), filterErrors)
    Notify.on("click", evt => this.#applyDiagFilter(evt), filterWarnings)
    Notify.on("click", evt => this.#applyDiagFilter(evt), filterInfo)

    const {
      resolveKey,
      resolveType,
    } = this.#elements

    Notify.on("change", ctx => this.#resolveTypeChanged(ctx), resolveType)
    Notify.on("change", ctx => this.#doResolve(ctx), resolveKey)

    // Building things
    const {
      switchAutobuild,
      btnBuild
    } = this.#elements

    Notify.on("change", evt => postMessage({type: "toggleAutoBuild", enabled: evt.target.checked}), switchAutobuild)
    Notify.on("click", () => postMessage({type: "requestBuild"}), btnBuild)

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

    this.#output = {
      colors: data.colors,
      tokenColors: data.tokenColors,
      semanticTokenColors: data.semanticTokenColors,
    }

    const resolveType = this.#elements.resolveType.value || "colors"
    const options = this.#getResolveOptions(resolveType)
    this.#updateResolveOptions(options)

    this.#setDirty(data.dirty)
  }

  #jump(element) {
    if(!element?.dataset.location)
      return

    vscode.postMessage({
      type: "jumpToLocation",
      location: element.dataset.location
    })
  }

  #updateDiagnostics(data) {
    if(!data)
      return

    this.#diagnostics = []

    const container = this.#elements.diagList
    container.textContent = ""
    this.#diagnosticDisposer.dispose()

    const generators = {
      variables:
        issues => this.#generateVariablesChildren(issues),
      colors:
        issues => this.#generateColorsChildren(issues),
      tokenColors:
        issues => this.#generateTokenColorsChildren(issues),
      semanticTokenColors:
        issues => this.#generateSemanticTokenColorsChildren(issues),
    }

    ;["variables", "colors", "tokenColors", "semanticTokenColors"].forEach(category => {
      const group = document.createElement("vscode-tree-item")
      group.textContent = category

      const issues = data[category] ?? []
      if(!issues.length) {
        group.branch = false

        return
      }

      group.branch = true
      group.open = true

      const groupCount = document.createElement("vscode-badge")
      groupCount.variant = "counter"
      groupCount.textContent = issues.length
      group.appendChild(groupCount)

      const children = generators[category](issues)
      children.forEach(({el, severity, issue, jumps}) => {
        group.appendChild(el)
        this.#diagnostics.push({el, severity, issue})
        jumps.forEach(jump =>
          this.#diagnosticDisposer.register(Notify.on("click", () => this.#jump(jump), jump))
        )
      })

      container.appendChild(group)
    })

    // this.#elements.diagEmpty.removeAttribute("hidden")
  }

  #createDiagScaffold(issue, labelText) {
    const jumps = []
    const severity = this.#mapSeverity(issue.severity)

    const child = document.createElement("vscode-tree-item")
    child.branch = true
    child.open = false
    child.hideArrows = true
    child.indentGuides = "none"

    // The icon for when this tree item is closed
    const iconClosed = document.createElement("vscode-icon")
    iconClosed.slot = "icon-branch"
    iconClosed.name = severity
    iconClosed.className = `diag-icon ${severity}`
    child.appendChild(iconClosed)

    // The icon for when this tree item is open
    const iconOpen = document.createElement("vscode-icon")
    iconOpen.slot = "icon-branch-opened"
    iconOpen.name = severity
    iconOpen.className = `diag-icon ${severity}`
    child.appendChild(iconOpen)

    // The message that is this tree item's display
    const label = document.createElement("span")
    label.className = "diag-message"
    label.textContent = labelText
    label.title = labelText
    child.appendChild(label)

    // This card is a child of this issue and contains all of the
    // more meta information.
    const card = document.createElement("vscode-tree-item")
    card.className = "diag-card"
    child.appendChild(card)

    // We have to do a div here to wrap the entire card because
    // vscode-tree-item is display: inline-block. Which is
    // tedious af and makes everything weird. No, thank you.
    const inner = document.createElement("div")
    inner.className = "diag-card-inner"
    card.appendChild(inner)

    return {child, inner, severity, jumps}
  }

  #createLocationRow(loc, jumps, container) {
    const locationRow = document.createElement("div")
    locationRow.className = "diag-card-location-row"
    container.append(locationRow)

    // This is an icon. It is also a button. You will like it. This is non-
    // negotiable.
    const linkIcon = document.createElement("vscode-icon")
    linkIcon.actionIcon = true
    linkIcon.name = "open-in-product"
    linkIcon.title = `Jump to issue.`
    linkIcon.className = "jump-link"
    linkIcon.dataset.location = loc
    jumps.push(linkIcon)
    locationRow.appendChild(linkIcon)

    const {file, line, column} =
      /^(?<file>.*):(?<line>\d+):(?<column>\d+)$/.exec(loc)?.groups ?? {}

    const lint = `${file} [L ${line}, C ${column}]`

    const variableLocation = document.createElement("span")
    variableLocation.className = "diag-card-location"
    variableLocation.textContent = lint
    variableLocation.title = lint
    locationRow.appendChild(variableLocation)
  }

  #generateVariablesChildren(issues) {
    return issues.map(issue => {
      const {child, inner, severity, jumps} =
        this.#createDiagScaffold(issue, `${issue.type} '${issue.variable}'`)

      const variableMessage = document.createElement("div")
      variableMessage.textContent = issue.message
      variableMessage.className = "diag-card-description"
      inner.appendChild(variableMessage)

      this.#createLocationRow(issue.location, jumps, inner)

      return {el: child, severity, issue, jumps}
    })
  }

  #generateColorsChildren(issues) {
    return issues.map(issue => {
      const {child, inner, severity, jumps} =
        this.#createDiagScaffold(issue, `${issue.message}`)

      if(issue.description) {
        const propertyDescription = document.createElement("div")
        propertyDescription.className = "diag-card-description"
        propertyDescription.textContent = issue.description
        propertyDescription.title = issue.description
        inner.appendChild(propertyDescription)
      }

      const property = document.createElement("div")
      property.className = "diag-card-property"
      inner.appendChild(property)

      const propertyName = document.createElement("span")
      propertyName.textContent = issue.property
      propertyName.className = "diag-card-name"
      property.appendChild(propertyName)

      if(issue.value) {
        const propertyValue = document.createElement("span")
        propertyValue.textContent = issue.value
        propertyValue.className = "diag-card-value"
        property.appendChild(propertyValue)

        const swatch = document.createElement("span")
        swatch.className = "diag-card-swatch"
        swatch.style.backgroundColor = issue.value
        property.appendChild(swatch)
      }

      return {el: child, severity, issue, jumps}
    })
  }

  #generateTokenColorsChildren(issues) {
    return issues.map(issue => {
      const {child, inner, severity, jumps} =
        this.#createDiagScaffold(issue, `${issue.message}`)

      const locs = issue.occurrences
        ? issue.occurrences.map(e => e.location)
        : [issue.location]

      locs.forEach(loc => this.#createLocationRow(loc, jumps, inner))

      return {el: child, severity, issue, jumps}
    })
  }

  #generateSemanticTokenColorsChildren(issues) {
    return issues.map(issue => {
      const {child, inner, severity, jumps} =
        this.#createDiagScaffold(issue, `${issue.message}`)

      const locs = issue.occurrences
        ? issue.occurrences.map(e => e.location)
        : [issue.location]

      locs.forEach(loc => this.#createLocationRow(loc, jumps, inner))

      return {el: child, severity, issue, jumps}
    })
  }

  #applyDiagFilter(evt) {
    // debugger
    const {target} = evt ?? {}

    console.log(TK.Data.typeOf(target ?? {}))

    if(target && target instanceof Elements.VscodeToolbarButton)
      target.checked = !target.checked

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

        if(visible && filterText) {
          const text = (issue.message || "") + (issue.location || "")

          visible = text.toLowerCase().includes(filterText)
        }
      } else {
        visible = false
      }

      if(visible)
        el.removeAttribute("hidden")
      else
        el.setAttribute("hidden", "")
    }
  }

  #resolveTypeChanged(ctx) {
    // debugger
    const {target} = ctx
    const {value} = target
    const options = this.#getResolveOptions(value)

    this.#updateResolveOptions(options)
  }

  #getResolveOptions(type) {
    const keys = this.#extractResolveKeys(type)

    return keys.map(key => {
      const option = document.createElement("vscode-option")
      option.value = key
      option.textContent = key

      return option
    })
  }

  #extractResolveKeys(type) {
    switch(type) {
      case "colors":
        return Object.keys(this.#output?.colors ?? {})

      case "tokenColors": {
        const all =
          (this.#output?.tokenColors ?? [])
            .flatMap(({scope}) => {
              if(!scope)
                return []

              return scope
                .split(",")
                .map(e => e.trim())
                .filter(Boolean)
            })

        const deduped = Array.from(new Set(all))
        const result = []

        // Deduped will be the same size or smaller, so we can iterate
        // over that.
        for(const e of deduped) {
          const count = all.filter(test => test === e).length

          if(count === 1) {
            result.push(e)
          } else {
            for(let i = 1; i <= count; i++)
              result.push(`${e}:${i}`)
          }
        }

        return result
      }

      case "semanticTokenColors":
        return Object.keys(this.#output?.semanticTokenColors ?? {})
    }

    return []
  }

  #updateResolveOptions(options) {
    // debugger
    const {resolveKey} = this.#elements
    resolveKey.replaceChildren()

    options.forEach(option => resolveKey.appendChild(option))
  }

  #doResolve(ctx) {
    // debugger
    const {target} = ctx

    const resolveType = this.#elements.resolveType.value
    const key = target.value?.trim()

    if(!key)
      return

    vscode.postMessage({type: "requestResolve", resolveType, key})
  }

  #showResolveResult(data) {
    // Always clear
    this.#resolveDisposer.dispose()
    const trail = this.#elements.resolveTrail
    trail.replaceChildren()

    if(!data?.found) {
      this.#elements.resolveResult.hidden = true
      this.#showError("Could not resolve the specified key.")

      return
    }

    this.#elements.resolveResult.hidden = false

    this.#elements.resolveResultTitle.textContent =
      `Resolution: ${data.key || ""}`

    const template = document.getElementById("resolve-step-template")

    if(data.trail?.length) {
      for(const step of data.trail) {
        const clone = template.content.cloneNode(true)
        const el = clone.querySelector(".resolve-step")

        el.style.paddingLeft = `${(step.depth ?? 0) * 1}rem`

        el.querySelector(".step-type").textContent = step.type || ""
        el.querySelector(".step-value").textContent = step.value || ""

        if(step.location) {
          const linkIcon = document.createElement("vscode-icon")
          linkIcon.actionIcon = true
          linkIcon.name = "open-in-product"
          linkIcon.title = step.location
          linkIcon.className = "jump-link"
          linkIcon.dataset.location = step.location
          el.querySelector(".step-link").appendChild(linkIcon)

          this.#resolveDisposer.register(
            Notify.on("click", () => this.#jump(linkIcon), linkIcon)
          )
        }

        const swatch = el.querySelector(".step-swatch")

        if(isHexColor(step.value))
          swatch.style.backgroundColor = step.value

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
