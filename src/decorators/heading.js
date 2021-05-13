const vscode = require('vscode');
const { hideDecoration } = require('../common-decorations');
const { state } = require('../state');
const {memoize, posToRange} = require('../util');

const getEnlargeDecoration = memoize( (size) => vscode.window.createTextEditorDecorationType({
        textDecoration: `; font-size: ${size}px; position: relative; top: 0.3em;`,
}));


function decorateHeadings() {
    const regEx = /^(#{1,9} )(.+)/mg;
    let match;
    const decorationRanges = state.decorationRanges;
    while ((match = regEx.exec(state.text))) {
        console.log(`match: ${match}`, match);
        decorationRanges.get(hideDecoration).push(posToRange(match.index, match.index + match[1].length));

        const headerDecoration = getEnlargeDecoration(Math.ceil(8 * state.fontSize / (2 + match[1].length)));
        if (!decorationRanges.has(headerDecoration)) {
            decorationRanges.set(headerDecoration, []);
        }

        decorationRanges.get(headerDecoration).push(posToRange(match.index + match[1].length, match.index + match[0].length));
    }
}

module.exports = decorateHeadings;