const vscode = require('vscode');
const { state } = require('../state');
const { posToRange } = require('../util');

const horizontalRuleDecoration = vscode.window.createTextEditorDecorationType({
    color: "transparent",
    textDecoration: "none; display: inline-block; width: 0;",
    before: {
        contentText: "",
        textDecoration: "none; position: absolute; background: #ffaa00; top: 0.49em; bottom: 0.49em; width: 100%; mix-blend-mode: luminosity;",
    }
});

function decorateHorizontalRule() {
    const regEx = /^ {0,3}[-_*]{3,}\s*/mg;
    let match;
    while ((match = regEx.exec(state.text))) {
        console.log("HR: ", match);
        state.decorationRanges.get(horizontalRuleDecoration).push(posToRange(match.index, match.index + match[0].length));
    }
}

module.exports = decorateHorizontalRule;