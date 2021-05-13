const { hideDecoration } = require('../common-decorations');
const { posToRange } = require('../util');
const { state } = require('../state');

function decorateBoldItalics() {
    let regEx = /\s([*_])[^*_]+\1\s/g;
    let match;
    const ranges = state.decorationRanges.get(hideDecoration);
    while ((match = regEx.exec(state.text))) {
        console.log(`Italics: `, match);
        ranges.push(posToRange(match.index + 1, match.index + 2));
        ranges.push(posToRange(match.index + match[0].length - 2, match.index + match[0].length - 1));
    }
    regEx = /\s([*_]{2})[^*_]+\1\s/g;
    while ((match = regEx.exec(state.text))) {
        console.log(`Italics: `, match);
        ranges.push(posToRange(match.index + 1, match.index + 3));
        ranges.push(posToRange(match.index + match[0].length - 3, match.index + match[0].length - 1));
    }
}

module.exports = decorateBoldItalics;