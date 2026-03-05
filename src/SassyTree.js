import * as vscode from "vscode"

export class MyTreeItem extends vscode.TreeItem {
  // eslint-disable-next-line no-unused-vars
  constructor(label, version, collapsibleState, command) {
    super(label, collapsibleState)
    this.tooltip = `${this.label}-${this.version}`
    this.description = this.version
  }
}

export class MyDataProvider  {
  getTreeItem(element) {
    return element
  }

  getChildren(element) {
    // Return child items for a given element, or root items if no element is provided
    if(!element) {
      // Example static data
      return Promise.resolve([
        new MyTreeItem("Item 1", "1.0", vscode.TreeItemCollapsibleState.None),
        new MyTreeItem("Item 2", "1.1", vscode.TreeItemCollapsibleState.None)
      ])
    }

    return Promise.resolve([])
  }
}
