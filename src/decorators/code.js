const vscode = require('vscode');
const { state } = require('../state');
const {transparentDecoration} = require('../common-decorations');
const { posToRange } = require('../util');

const codeDecoration = vscode.window.createTextEditorDecorationType({
    // outline: "1px dotted"
    border: "outset",
    borderRadius: "5px",
})

function decorateCode() {
    const decorationRanges = state.decorationRanges;
    const regEx = /`(?:[^`].*?)`/g;
    let match;
    while ((match = regEx.exec(state.text))) {
        console.log("CODE: ", match);
        decorationRanges.get(transparentDecoration).push(posToRange(match.index, match.index + 1));
        decorationRanges.get(codeDecoration).push(posToRange(match.index, match.index + match[0].length));
        decorationRanges.get(transparentDecoration).push(posToRange(match.index + match[0].length - 1, match.index + match[0].length));
    }
}


module.exports = decorateCode;