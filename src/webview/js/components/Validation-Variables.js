class ValidationVariablesItem extends HTMLElement {
  connectedCallback() {
    const severity = this.getAttribute("severity")
    const type = this.getAttribute("type")
    const name = this.getAttribute("name")
    const occurrence = this.getAttribute("occurrence")

    const html  = `
    <div class="validation-lint-item">
      <span class="validation-severity"><sassy-severity-icon level="${severity}"/></span>
      <span class="validation-variable">${name}</span>
      <span class="validation-occurrences">
        <span class="validation-occurrence">${occurrence}</span>
      </span>
      <span class="validation-type">${type}</span>
    </div>
    `

    this.innerHTML = html
  }
}

customElements.define("sassy-validation-variables-item", ValidationVariablesItem)
