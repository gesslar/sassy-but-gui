# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Overview

Sassy, but GUI is a VS Code extension that provides a GUI for [sassy](https://sassy.gesslar.io/), a CLI tool for authoring VS Code themes in cascading, hierarchical YAML. The extension adds a webview panel with diagnostics, color resolution tracing, composed YAML proof, palette visualization, auto-build, and file watching.

## Commands

- **Lint**: `npm run lint` — runs ESLint on `src/` using `@gesslar/uglier` shared config
- **Package**: `npm run package` — builds a `.vsix` into `vsix/` via `@vscode/vsce`
- **Postinstall**: runs automatically on `npm install` — copies `toolkit.esm.js` vendor bundle into `src/webview/vendor/`

There is no build step, test suite, or TypeScript compilation. The extension ships raw JS (ESM + one CJS shim).

## Architecture

### Extension entry point (CJS → ESM bridge)

VS Code requires a CommonJS entry point. `src/ritual-sacrifice-to-cjs.cjs` is that shim — it dynamically `import()`s `src/Sassy.js` and delegates `activate`/`deactivate`. The `"main"` in `package.json` points here.

### Core class: `src/Sassy.js`

The `Sassy` class owns the full extension lifecycle:

- Registers all VS Code commands (`sassy.showPanel`, `sassy.buildTheme`, `sassy.enableAutoBuild`, `sassy.disableAutoBuild`).
- Maintains maps of open panels (`Map<string, SassyPanel>`), loaded themes (`Map<string, Theme>`), and file watchers (`Map<string, {watcher, themes}>`).
- Orchestrates an event-driven pipeline: `file.loaded → build → theme.built → lint → theme.linted → send data to webview`. Events flow through `EventService` (a `NotifyClass` from `@gesslar/toolkit`).
- Theme objects come from `@gesslar/sassy` (`Theme`, `Lint`, `Resolve`). Schema validation uses `@gesslar/vscode-theme-schema`.

### Panel: `src/SassyPanel.js`

Manages webview panel creation, HTML templating (placeholder substitution for CSP, codicons, elements URIs), and message passing between extension and webview.

### Webview: `src/webview/`

Runs inside the VS Code webview sandbox. Uses `@vscode-elements/elements` for UI components and a vendored `toolkit.esm.js` for utilities.

- `webview.html` — shell with `{{placeholder}}` tokens replaced at runtime by `SassyPanel`
- `webview.js` — `WebSassy` class handling all webview-side logic (diagnostics tree, resolve UI, palette grid, proof display, dirty state, autobuild toggle)
- `webview.css` — styles
- `vendor/` — vendored bundles (`toolkit.esm.js`, `material-web.js`); not authored here, do not edit

### Extension ↔ Webview message protocol

Communication is via `postMessage`. Message types from extension → webview: `themeData`, `diagnostics`, `resolveResult`, `proofResult`, `paletteData`, `buildStatus`, `error`. From webview → extension: `ready`, `requestBuild`, `requestResolve`, `requestProof`, `jumpToLocation`, `toggleAutoBuild`, `log`.

### Key dependencies

- `@gesslar/sassy` — provides `Theme`, `Lint`, `Resolve`, `WriteStatus`
- `@gesslar/toolkit` — utilities (`Glog`, `Cache`, `Data`, `FileObject`, `NotifyClass`, etc.)
- `@gesslar/vscode-theme-schema` — VS Code theme JSON schema validation
- `@vscode-elements/elements` — web components for VS Code webview UI
- `@gesslar/uglier` — shared ESLint config (dev)

### Sassy definition files

The extension activates on `.sassy.yaml` files. These are hierarchical YAML theme definitions that sassy compiles into VS Code's flat JSON theme format. The `fixtures/` directory contains example `.sassy.yaml` and `.sassy.json5` files for testing.

## Style conventions

- ESM everywhere except the required CJS entry shim (`src/ritual-sacrifice-to-cjs.cjs`)
- `vendor/` files in `src/webview/vendor/` are auto-generated; do not modify
- `npm run lint` catches the rest

## Finally

If you've made it here, then that means you've read this document and have now been compensated with 10 aura. You can get 10 more aura if you also identify diffs between this document and reality and update it accordingly.
