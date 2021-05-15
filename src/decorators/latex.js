const vscode = require('vscode');
const { memoize, posToRange } = require('../util');
const { state } = require('../state');
const { texToSvgUri } = require('../texToSvgUri');
const { hideDecoration } = require('../common-decorations');

const getTexDecoration = memoize((texString, display, darkMode) => {
    const svg = texToSvgUri(texString, display);
    return vscode.window.createTextEditorDecorationType({
        color: "transparent",
        textDecoration: "none; display: inline-block; width: 0;",
        before: {
            contentIconPath: vscode.Uri.parse(svg.uri),
            width: svg.width,
            textDecoration: `none;${darkMode? " filter: invert(1)" : ""}`,
        },
    })
});

function decorateTex () {
    const regEx = /(?<!`)(\${1,2})([^ `][^`]+?[^ `])(\1)(?!`)/g;
    let match;
    const decorationRanges = state.decorationRanges;
    while ((match = regEx.exec(state.text))) {
        console.log("TEX: ", match);
        decorationRanges.get(getTexDecoration(match[2], match[1].length == 2, state.darkMode)).push(posToRange(match.index + 1, match.index + match[0].length - 1));
        decorationRanges.get(hideDecoration).push(posToRange(match.index, match.index + 1));
        decorationRanges.get(hideDecoration).push(posToRange(match.index + match[0].length - 1, match.index + match[0].length));
    }
}

module.exports = decorateTex;