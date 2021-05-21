const vscode = require('vscode');
const { posToRange } = require('../runner');
const { state } = require('../state');

const quoteDecoration = vscode.window.createTextEditorDecorationType({
    textDecoration: "none; filter: drop-shadow(0px 0px 20px);",
});

const quoteBarDecoration = vscode.window.createTextEditorDecorationType({
    color: "transparent",
    // textDecoration: "none; display: inline-block; width: 0;",
    before: {
        contentText: "",
        textDecoration: "none; position: absolute; background: #ffaa00; top: -0.2em; bottom: -0.2em; width: 5px; border-radius: 10px; mix-blend-mode: luminosity;",
    }
});

function decorateQuote() {
    const decorationRanges = state.decorationRanges;
    const regEx = /^( {0,3})>(?: .*)?/mg;
    let match;
    while ((match = regEx.exec(state.text))) {
        console.log("Quote: ", match);
        decorationRanges.get(quoteBarDecoration).push(posToRange(match.index + match[1].length, match.index + match[1].length + 1));
        decorationRanges.get(quoteDecoration).push(posToRange(match.index + match[1].length, match.index + match[0].length));
    }
}

module.exports = decorateQuote;