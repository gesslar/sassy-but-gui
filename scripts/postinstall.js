import {copyFile, mkdir} from "node:fs/promises"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const src = join(root, "node_modules", "@gesslar", "toolkit", "vendor", "toolkit.esm.js")
const dest = join(root, "src", "vendor", "toolkit.esm.js")

await mkdir(dirname(dest), {recursive: true})
await copyFile(src, dest)

console.log("Copied toolkit.esm.js to src/vendor/")
