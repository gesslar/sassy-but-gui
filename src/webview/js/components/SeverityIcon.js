class SeverityIcon extends HTMLElement {
  constructor() {
    super()
  }

  connectedCallback() {
    const level = this.getAttribute("level")

    this.innerHTML = `
      <span class="severity-icon">
        <i class="codicon codicon-circle-small-filled severity-${level}"></i>
      </span>
    `
  }
}

customElements.define("sassy-severity-icon", SeverityIcon)
