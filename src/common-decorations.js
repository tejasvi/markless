const vscode = require('vscode');

const hideDecoration = vscode.window.createTextEditorDecorationType({
    color: "transparent",
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    textDecoration: "none; display: inline-block; width: 0;",
});

const transparentDecoration = vscode.window.createTextEditorDecorationType({
    color: "transparent",
});

module.exports = { hideDecoration, transparentDecoration };