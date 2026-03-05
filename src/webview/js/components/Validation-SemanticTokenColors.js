class ValidationSemanticTokenColorsItem extends HTMLElement {
  connectedCallback() {
    const severity = this.getAttribute("severity")
    const type = this.getAttribute("type")
    const tokenType = this.getAttribute("tokenType")
    const message = this.getAttribute("message")

    const html  = `
    <div class="validation-lint-item">
      <span class="validation-severity"><sassy-severity-icon level="${severity}"/></span>
      <span class="validation-variable">${tokenType}</span>
      <span class="validation-occurrences">
        <span class="validation-occurrence">${message}</span>
      </span>
      <span class="validation-type">${type}</span>
      </div>
    `

    this.innerHTML = html
  }
}

customElements.define("sassy-validation-semantictokencolors-item", ValidationSemanticTokenColorsItem)
