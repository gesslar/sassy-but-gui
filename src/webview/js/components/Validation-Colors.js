class ValidationColorsItem extends HTMLElement {
  connectedCallback() {
    const severity = this.getAttribute("severity")
    const type = this.getAttribute("type")
    const value = this.getAttribute("value")
    const property = this.getAttribute("property")
    const message = this.getAttribute("message")
    const description = this.getAttribute("description")

    const html  = `
    <div class="validation-lint-item">
      <span class="validation-severity"><sassy-severity-icon level="${severity}"/></span>
      <span class="validation-property">${property}</span>
      <span class="validation-value">${value}</span>
      <span class="validation-detail">
        <div class="validation-description">${description}</div>
        <div class="validation-message">${message}</div>
      </span>
      <span class="validation-type">${type}</span>
    </div>
    `

    this.innerHTML = html
  }
}

customElements.define("sassy-validation-colors-item", ValidationColorsItem)
