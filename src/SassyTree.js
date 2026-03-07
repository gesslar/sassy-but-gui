import * as vscode from "vscode"

const SEVERITY_ICONS = {
  high: new vscode.ThemeIcon("error", new vscode.ThemeColor("problemsErrorIcon.foreground")),
  medium: new vscode.ThemeIcon("warning", new vscode.ThemeColor("problemsWarningIcon.foreground")),
  low: new vscode.ThemeIcon("info", new vscode.ThemeColor("problemsInfoIcon.foreground")),
}

class FileNode {
  constructor(file, lint, validation, outputFile) {
    this.file = file
    this.lint = lint
    this.validation = validation
    this.outputFile = outputFile
  }
}

class CategoryNode {
  constructor(label, issues, parent) {
    this.label = label
    this.issues = issues
    this.parent = parent
  }
}

class IssueNode {
  constructor(label, severity, description, parent, location) {
    this.label = label
    this.severity = severity
    this.description = description
    this.parent = parent
    this.location = location
  }
}

class PlaceholderNode {}

export class SassyDataProvider {
  #files = new Map()
  #fileNodes = []
  #onDidChangeTreeData = new vscode.EventEmitter()
  onDidChangeTreeData = this.#onDidChangeTreeData.event

  // Drag and drop support
  dropMimeTypes = ["text/uri-list"]
  dragMimeTypes = []

  /** @type {((uri: vscode.Uri) => void)|null} */
  onFileDrop = null

  handleDrag() {}

  async handleDrop(_target, dataTransfer) {
    const uriList = dataTransfer.get("text/uri-list")

    if(!uriList)
      return

    const value = await uriList.asString()
    const uris = value.split("\r\n")
      .filter(line => line && !line.startsWith("#"))
      .map(line => vscode.Uri.parse(line))
      .filter(uri => /\.sassy\.(yaml|json5?)$/.test(uri.fsPath))

    for(const uri of uris) {
      this.onFileDrop?.(uri)
    }
  }

  addFile(file, lint) {
    this.#files.set(file.path, {file, lint})
    this.#onDidChangeTreeData.fire()
  }

  setValidation(filePath, validation, outputFile) {
    const entry = this.#files.get(filePath)

    if(!entry)
      return

    entry.validation = validation
    entry.outputFile = outputFile
    this.#onDidChangeTreeData.fire()
  }

  clearValidation(filePath) {
    const entry = this.#files.get(filePath)

    if(!entry)
      return

    delete entry.validation
    delete entry.outputFile
    this.#onDidChangeTreeData.fire()
  }

  removeFile(path) {
    this.#files.delete(path)
    this.#onDidChangeTreeData.fire()
  }

  clearAll() {
    this.#files.clear()
    this.#onDidChangeTreeData.fire()
  }

  getFileNodes() {
    return this.#fileNodes
  }

  getTreeItem(element) {
    if(element instanceof PlaceholderNode) {
      const item = new vscode.TreeItem(
        "No theme loaded",
        vscode.TreeItemCollapsibleState.None
      )

      item.description = "Open or drag a .sassy.yaml file"

      return item
    }

    if(element instanceof FileNode) {
      const item = new vscode.TreeItem(
        element.file.name,
        vscode.TreeItemCollapsibleState.Expanded
      )

      item.iconPath = new vscode.ThemeIcon("file")
      item.contextValue = "sassyFile"
      item.id = element.file.path

      return item
    }

    if(element instanceof CategoryNode) {
      const count = element.issues.length
      const item = new vscode.TreeItem(
        element.label,
        count > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None
      )

      item.description = `${count} issue${count !== 1 ? "s" : ""}`

      return item
    }

    if(element instanceof IssueNode) {
      const item = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.None
      )

      item.iconPath = SEVERITY_ICONS[element.severity] ?? SEVERITY_ICONS.low
      item.description = element.description
      item.tooltip = element.description
        ? `${element.label} — ${element.description}`
        : element.label

      if(element.location) {
        item.command = {
          command: "sassy.gotoLocation",
          title: "Go to Source",
          arguments: [element.location],
        }
      } else {
        const fileNode = element.parent?.parent
        const outputFile = fileNode?.outputFile

        if(outputFile) {
          item.command = {
            command: "sassy.gotoProperty",
            title: "Go to Property",
            arguments: [outputFile, element.label],
          }
        }
      }

      return item
    }

    return element
  }

  getParent(element) {
    if(element instanceof CategoryNode)
      return element.parent

    if(element instanceof IssueNode)
      return element.parent

    return undefined
  }

  getChildren(element) {
    if(!element) {
      if(this.#files.size === 0)
        return [new PlaceholderNode()]

      this.#fileNodes = [...this.#files.values()].map(
        ({file, lint, validation, outputFile}) =>
          new FileNode(file, lint, validation, outputFile)
      )

      return this.#fileNodes
    }

    if(element instanceof FileNode) {
      const {lint, validation} = element
      const categories = [
        new CategoryNode("Variables", lint.variables ?? [], element),
        new CategoryNode("Token Colors", lint.tokenColors ?? [], element),
        new CategoryNode("Semantic Token Colors", lint.semanticTokenColors ?? [], element),
      ]

      if(validation) {
        const invalidColors = validation.filter(v => v.status !== "valid")

        categories.push(new CategoryNode("Colors", invalidColors, element))
      }

      return categories
    }

    if(element instanceof CategoryNode) {
      return element.issues.flatMap(
        issue => this.#issueToNodes(issue, element)
      )
    }

    return []
  }

  #issueToNodes(issue, parent) {
    // Lint: variables
    if(issue.variable) {
      return [new IssueNode(
        `${issue.type}: ${issue.variable}`,
        issue.severity,
        issue.occurrence ?? undefined,
        parent,
        issue.location
      )]
    }

    // Lint: tokenColors (expand occurrences)
    if(issue.scope) {
      if(Array.isArray(issue.occurrences) && issue.occurrences.length > 0) {
        return issue.occurrences.map(o => new IssueNode(
          `${issue.type}: ${issue.scope}`,
          issue.severity,
          o.name ?? o,
          parent,
          o.location ?? issue.location
        ))
      }

      return [new IssueNode(
        `${issue.type}: ${issue.scope}`,
        issue.severity,
        undefined,
        parent,
        issue.location
      )]
    }

    // Lint: semanticTokenColors
    if(issue.tokenType) {
      return [new IssueNode(
        `${issue.type}: ${issue.tokenType}`,
        issue.severity,
        issue.message,
        parent,
        issue.location
      )]
    }

    // Validation colors
    if(issue.property) {
      return [new IssueNode(
        issue.property,
        issue.status === "invalid" ? "high" : "medium",
        issue.message || issue.description,
        parent
      )]
    }

    // Fallback
    return [new IssueNode(
      issue.type || issue.message || "unknown issue",
      issue.severity ?? "low",
      issue.message,
      parent,
      issue.location
    )]
  }
}
