const vscode = require('vscode');
const { memoize } = require('./util');

// Concealed text has no width, even inside an enlarged heading. The letterSpacing option tells
// VS Code that the decoration changes the width of the text, so it measures the rendered line to
// place the cursor and highlights instead of assuming every character is as wide as in a
// monospace font (#19, #21).
const hiddenText = {
    color: "transparent",
    textDecoration: "none; font-size: 0 !important;",
    letterSpacing: "0",
};

// Decoration types made for the current settings and theme, disposed together when these change
// so that no editor keeps showing them.
const generation = new Set();

function createDecorationType(options) {
    const decoration = vscode.window.createTextEditorDecorationType(options);
    generation.add(decoration);
    return decoration;
}

function disposeDecorationTypes() {
    for (const decoration of generation) {
        decoration.dispose();
    }
    generation.clear();
}

function getSvgDecoration (svgUri, darkMode) {
    return createDecorationType({
        ...hiddenText,
        before: {
            contentIconPath: vscode.Uri.parse(svgUri),
            textDecoration: `none; vertical-align: top;${darkMode ? " filter: invert(1)" : ""}`,
        },
    });
}

const hideDecoration = vscode.window.createTextEditorDecorationType({
    ...hiddenText,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

const transparentDecoration = vscode.window.createTextEditorDecorationType({
    color: "transparent",
});

const getUrlDecoration = memoize((isImage) => vscode.window.createTextEditorDecorationType({
    ...hiddenText,
    before: {
        contentText: isImage ? "🌄" : " 🔗",
        fontWeight: "bold",
        color: "cyan",
    },
}));
module.exports = { hiddenText, hideDecoration, transparentDecoration, getUrlDecoration, getSvgDecoration, createDecorationType, disposeDecorationTypes };
