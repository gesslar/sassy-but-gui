class ToolButton extends HTMLElement {
  constructor() {
    super()
  }

  connectedCallback() {
    const icon = this.getAttribute("icon")
    const kind = this.getAttribute("kind") ?? "primary"

    this.innerHTML = `
    <button class="toolbutton ${kind}">
      <i class="codicon codicon-${icon}"></i>
    </button>
    `
  }
}

customElements.define("sassy-toolbutton", ToolButton)
