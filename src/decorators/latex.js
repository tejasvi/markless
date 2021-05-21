const vscode = require('vscode');
const { memoize, posToRange, svgToUri } = require('../util');
const { state } = require('../state');
const { texToSvg } = require('../texToSvg');
const { hideDecoration } = require('../common-decorations');

const getTexDecoration = memoize((texString, display, darkMode, fontSize) => {
    const svgUri = svgToUri(texToSvg(texString, display, fontSize));
    return vscode.window.createTextEditorDecorationType({
        color: "transparent",
        textDecoration: "none; display: inline-block; width: 0;",
        before: {
            contentIconPath: vscode.Uri.parse(svgUri),
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
        decorationRanges.get(getTexDecoration(match[2], match[1].length == 2, state.darkMode, state.fontSize)).push(posToRange(match.index + 1, match.index + match[0].length - 1));
        decorationRanges.get(hideDecoration).push(posToRange(match.index, match.index + 1));
        decorationRanges.get(hideDecoration).push(posToRange(match.index + match[0].length - 1, match.index + match[0].length));
    }
}

module.exports = decorateTex;