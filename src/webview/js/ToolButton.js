class ToolButton extends HTMLElement {
  constructor() {
    super()
  }

  connectedCallback() {
    const icon = this.getAttribute("icon")

    this.innerHTML = `
    <button class="toolbutton">
      <i class="codicon codicon-${icon}"></i>
    </button>
    `
  }
}

customElements.define("sassy-toolbutton", ToolButton)
