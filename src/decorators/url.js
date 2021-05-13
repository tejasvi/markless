const vscode = require('vscode');
const { hideDecoration } = require('../common-decorations');
const { state } = require('../state');
const { memoize, posToRange } = require('../util');

const getUrlDecoration = memoize((isImage) => vscode.window.createTextEditorDecorationType({
    color: "transparent",
    textDecoration: "none; display: inline-block; width: 0;",
    after: {
        contentText: isImage ? "🌄" : " 🔗",
        fontWeight: "bold",
        color: "cyan",
    },
}));

function decorateURL() {
    const decorationRanges = state.decorationRanges;
    const regEx = /(!?)(\[)[^\]]*(\])(\(https?:\/\/[^ ]+\))/mg;
    let match;
    while ((match = regEx.exec(state.text))) {
        console.log(`URL match: ${match}`, match);
        decorationRanges.get(hideDecoration).push(posToRange(match.index, match.index + match[1].length + 1));
        decorationRanges.get(getUrlDecoration(match[1].length == 1)).push(posToRange(match.index + match[0].length - match[4].length - 1, match.index + match[0].length));
    }
}

module.exports = decorateURL;