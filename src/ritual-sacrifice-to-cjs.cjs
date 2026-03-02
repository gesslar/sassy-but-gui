// src/ritual-sacrifice-to-cjs.cjs
//
// This file is the entry point for VS Code (see package.json "main")

let esm

const WhatWeCameHereFor = "./Sassy.js"

/**
 * Ensures the ESM module is loaded.
 *
 * @returns {Promise<any>} The imported ESM module.
 */
async function ensureESM() {
  if(!esm)
    esm = await import(WhatWeCameHereFor)

  return esm
}

/**
 * Activates the extension by delegating to the ESM module.
 *
 * @param {import('vscode').ExtensionContext} context - The VS Code extension context.
 * @returns {Promise<void>}
 */
async function activate(context) {
  const mode = await ensureESM()

  await mode?.activate(context)
}

/**
 * Deactivates the extension by delegating to the ESM module.
 *
 * @returns {Promise<void>}
 */
async function deactivate() {
  const mode = await ensureESM()

  if(mode.deactivate)
    return mode.deactivate()
}

// VS Code expects CommonJS exports
module.exports = {
  activate,
  deactivate
}
