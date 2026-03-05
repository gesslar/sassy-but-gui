class ValidationPanel extends HTMLElement {
  connectedCallback() {
    setTimeout(() => this.#replace(), 0)
  }

  #replace() {
    const parent = this.parentElement
    const children = Array.from(this.children)
    const newParent = document.createElement("div")
    newParent.classList.add("validation-panel")
    newParent.setAttribute("kind", this.getAttribute("kind"))
    parent.appendChild(newParent)

    // Build a header
    const panelHeader = document.createElement("div")
    panelHeader.classList.add("validation-panel-header")
    const h2 = document.createElement("h2")
    h2.innerText = this.getAttribute("kind")
    panelHeader.appendChild(h2)
    newParent.appendChild(panelHeader)

    // Build the body
    const panelBody = document.createElement("div")
    panelBody.classList.add("validation-panel-body")
    newParent.appendChild(panelBody)

    children.forEach(element => {
      const child = element.querySelector("div")
      panelBody.appendChild(child)
    })

    console.log(parent)
    parent.removeChild(this)
  }
}

customElements.define("sassy-validation-panel", ValidationPanel)
