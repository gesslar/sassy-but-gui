import * as vscode from "vscode"

const SEVERITY_ICONS = {
  high: new vscode.ThemeIcon("error", new vscode.ThemeColor("problemsErrorIcon.foreground")),
  medium: new vscode.ThemeIcon("warning", new vscode.ThemeColor("problemsWarningIcon.foreground")),
  low: new vscode.ThemeIcon("info", new vscode.ThemeColor("problemsInfoIcon.foreground")),
}

class ThemeNode {
  constructor(file, fileMap, validation, outputFile) {
    this.file = file           // the root .sassy.yaml Uri/file object
    this.fileMap = fileMap     // Map<filePath, {variables, tokenColors, semanticTokenColors}>
    this.validation = validation
    this.outputFile = outputFile
  }
}

class FileNode {
  constructor(filePath, lint, parent, outputFile) {
    this.filePath = filePath
    this.file = {name: filePath.split("/").pop(), path: filePath}
    this.lint = lint           // {variables, tokenColors, semanticTokenColors}
    this.parent = parent       // ThemeNode
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

function groupLintByFile(lint) {
  const fileMap = new Map()

  const ensure = filePath => {
    if(!fileMap.has(filePath))
      fileMap.set(filePath, {
        variables: [], tokenColors: [], semanticTokenColors: []
      })

    return fileMap.get(filePath)
  }

  const fileOf = issue => issue.location?.split(":")[0]

  for(const issue of lint.variables ?? []) {
    const f = fileOf(issue)
    if(f)
      ensure(f).variables.push(issue)
  }

  for(const issue of lint.tokenColors ?? []) {
    const f = fileOf(issue)
    if(f)
      ensure(f).tokenColors.push(issue)
  }

  for(const issue of lint.semanticTokenColors ?? []) {
    const f = fileOf(issue)
    if(f)
      ensure(f).semanticTokenColors.push(issue)
  }

  return fileMap
}

export class DiagnosticTreeProvider {
  #themes = new Map() // themePath → {file, fileMap, validation, outputFile}
  #onDidChangeTreeData = new vscode.EventEmitter()
  onDidChangeTreeData = this.#onDidChangeTreeData.event

  addFile(file, lint) {
    const fileMap = groupLintByFile(lint)

    this.#themes.set(file.path, {file, fileMap, lint})
    this.#onDidChangeTreeData.fire()
  }

  setValidation(themePath, validation, outputFile) {
    const entry = this.#themes.get(themePath)

    if(!entry)
      return

    entry.validation = validation
    entry.outputFile = outputFile
    this.#onDidChangeTreeData.fire()
  }

  clearValidation(themePath) {
    const entry = this.#themes.get(themePath)

    if(!entry)
      return

    delete entry.validation
    delete entry.outputFile
    this.#onDidChangeTreeData.fire()
  }

  removeFile(path) {
    this.#themes.delete(path)
    this.#onDidChangeTreeData.fire()
  }

  clearAll() {
    this.#themes.clear()
    this.#onDidChangeTreeData.fire()
  }

  getTreeItem(element) {
    if(element instanceof ThemeNode) {
      const item = new vscode.TreeItem(
        element.file.name,
        vscode.TreeItemCollapsibleState.Expanded
      )

      item.iconPath = new vscode.ThemeIcon("color-mode")
      item.contextValue = "sassyTheme"
      item.id = element.file.path

      return item
    }

    if(element instanceof FileNode) {
      const item = new vscode.TreeItem(
        element.file.name,
        vscode.TreeItemCollapsibleState.Expanded
      )

      item.iconPath = new vscode.ThemeIcon("file")
      item.contextValue = "sassyFile"
      item.id = element.filePath
      item.description = element.filePath
        .replace(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "", "")
        .replace(/^\//, "")

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
        const themeNode = element.parent?.parent?.parent
        const outputFile = themeNode?.outputFile

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
    if(element instanceof FileNode)
      return element.parent

    if(element instanceof CategoryNode)
      return element.parent

    if(element instanceof IssueNode)
      return element.parent

    return undefined
  }

  getChildren(element) {
    if(!element) {
      return [...this.#themes.values()].map(
        ({file, fileMap, validation, outputFile}) =>
          new ThemeNode(file, fileMap, validation, outputFile)
      )
    }

    if(element instanceof ThemeNode) {
      return [...element.fileMap.entries()].map(
        ([filePath, lint]) => new FileNode(
          filePath, lint, element, element.outputFile
        )
      )
    }

    if(element instanceof FileNode) {
      const {lint} = element
      const categories = [
        new CategoryNode("Variables", lint.variables ?? [], element),
        new CategoryNode("Token Colors", lint.tokenColors ?? [], element),
        new CategoryNode("Semantic Token Colors", lint.semanticTokenColors ?? [], element),
      ]

      // Validation lives on the ThemeNode, only show on the root theme file
      const themeNode = element.parent
      if(themeNode?.validation && element.filePath === themeNode.file.path) {
        const invalidColors = themeNode.validation.filter(v => v.status !== "valid")

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
    if(issue.variable) {
      return [new IssueNode(
        `${issue.type}: ${issue.variable}`,
        issue.severity,
        issue.occurrence ?? undefined,
        parent,
        issue.location
      )]
    }

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

    if(issue.tokenType) {
      return [new IssueNode(
        `${issue.type}: ${issue.tokenType}`,
        issue.severity,
        issue.message,
        parent,
        issue.location
      )]
    }

    if(issue.property) {
      return [new IssueNode(
        issue.property,
        issue.status === "invalid" ? "high" : "medium",
        issue.message || issue.description,
        parent
      )]
    }

    return [new IssueNode(
      issue.type || issue.message || "unknown issue",
      issue.severity ?? "low",
      issue.message,
      parent,
      issue.location
    )]
  }
}
