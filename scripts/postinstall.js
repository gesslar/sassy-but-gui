import {copyFile, mkdir} from "node:fs/promises"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const copies = [
  ["@gesslar/toolkit/vendor/toolkit.esm.js", "toolkit.esm.js"],
  ["@vscode/codicons/dist/codicon.css", "codicons/codicon.css"],
  ["@vscode/codicons/dist/codicon.ttf", "codicons/codicon.ttf"],
  ["@vscode-elements/elements/dist/bundled.js", "elements/bundled.js"],
]

for(const [from, to] of copies) {
  const src = join(root, "node_modules", from)
  const dest = join(root, "src", "webview", "vendor", to)

  await mkdir(dirname(dest), {recursive: true})
  await copyFile(src, dest)

  console.log(`Copied ${from} -> src/webview/vendor/${to}`)
}
