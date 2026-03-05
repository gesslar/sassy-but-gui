class ValidationTokenColorsItem extends HTMLElement {
  connectedCallback() {
    const severity = this.getAttribute("severity")
    const type = this.getAttribute("type")
    const scope = this.getAttribute("scope")

    let html  = `
      <div class="validation-lint-item">
      <span class="validation-severity"><sassy-severity-icon level="${severity}"/></span>
    `

    const occurrence = JSON.parse(this.getAttribute("occurrences"))
      .map(e => `<span class=\"validation-occurrence\">${e}</span>`)
      .join(", ")

    html += `
        <span class="validation-variable">${scope}</span>
        <span class="validation-occurrences">
          ${occurrence}
        </span>
        <span class="validation-type">${type}</span>
      </div>
    `

    this.innerHTML = html
  }
}

customElements.define("sassy-validation-tokencolors-item", ValidationTokenColorsItem)
