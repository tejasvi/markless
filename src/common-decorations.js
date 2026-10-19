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

function getSvgDecoration (svgUri, darkMode) {
    return vscode.window.createTextEditorDecorationType({
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
module.exports = { hiddenText, hideDecoration, transparentDecoration, getUrlDecoration, getSvgDecoration };
