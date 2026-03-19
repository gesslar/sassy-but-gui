import uglify from "@gesslar/uglier"

export default [
  ...uglify({
    options: {
      ignores: ["**/vendor/**"]
    },
    with: [
      "lints-js", // default files: ["src/**/*.{js,mjs,cjs}"]
      "lints-jsdoc", // default files: ["src/**/*.{js,mjs,cjs}"]
      "vscode-extension", // default files: ["src/**/*.{js,mjs,cjs}"]
    ]
  })
]
