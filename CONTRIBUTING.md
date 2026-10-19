I started writing this extension with almost no Javascript experience and it shows. For navigation, folding will come handy (search folding under Keyboard Shortcuts).
If certain piece of code is unclear, feel free to open an issue.

# Setup

1. Install [Node.js](https://nodejs.org/) 22 or newer, clone the repository and run `npm install` in it.
2. Open the folder in VS Code and press <kbd>F5</kbd> (the **Run Extension** launch configuration). It builds the extension into `out/` and opens a second VS Code window with it loaded. Open a markdown file there. Breakpoints in `src/` work.
3. After changing the code, run `npm run esbuild` (or keep `npm run esbuild-watch` running) and reload the second window with **Developer: Reload Window**.

# Tests

`npm test` runs the linter, the unit tests in `test/unit` and the integration tests in `test/suite`. The integration tests download VS Code into `.vscode-test/` and open `test/fixtures` in it. On Linux without a display, run `xvfb-run -a npm test`. The **Extension Tests** launch configuration runs the integration tests in the debugger.

# Packaging

`npm run package` writes `markless-<version>.vsix`, which can be installed with **Extensions: Install from VSIX...**. The extension is bundled into `out/main.js`, so the package does not need `node_modules`.

# Code map

- `src/extension.js`: activation, settings, and in `bootstrap()` one decorator per markdown node type
- `src/runner.js`: parses the document (only the part around the visible lines for long documents), runs the decorators, applies the decorations and shows the images
- `src/parse-range.js`: picks the lines to parse in long documents
- `src/mermaid.js`: renders mermaid diagrams in a webview
- `src/util.js`: the markdown parser, LaTeX to SVG, image paths, hover previews
