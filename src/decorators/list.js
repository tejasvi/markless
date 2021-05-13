const vscode = require('vscode');
const {memoize, posToRange} = require('../util');
const { state } = require('../state');

const getBulletDecoration = memoize((level) => {
const listBullets = ["❧", "☯", "♠", "❀", "♚", "☬", "♣", "♥", "🙤", "⚜", "⚛", "⛇", "⚓", "☘", "☔"];
    return vscode.window.createTextEditorDecorationType({
        color: "transparent",
        textDecoration: "none; display: inline-block; width: 0;",
        after: {
            contentText: listBullets[level % listBullets.length],
            fontWeight: "bold"
        },
    });
});


const getlistRainbowDecoration = (() => {
    const hueRotationMultiplier = [0, 5, 9, 2, 6, 7];
    const getNonCyclicDecoration = memoize((level) => vscode.window.createTextEditorDecorationType({
        // base color: #6c7500
        textDecoration: (`; filter: hue-rotate(${hueRotationMultiplier[level] * 360 / 12}deg);`),
    }));
    return (level) => {
        level = level % hueRotationMultiplier.length;
        return getNonCyclicDecoration(level);
    }
})();

function decorateLists() {
    console.log("decorate list");
    const decorationRanges = state.decorationRanges;
    const regEx = /^( *)(\*|-|\d+)\.? (.*)/mg;
    let match;
    while ((match = regEx.exec(state.text))) {
        console.log(`match: ${match}`, match);
        const level = Math.ceil(match[1].length / 4);

        const numOrNan = parseInt(match[2]);
        if (isNaN(numOrNan)) {
            decorationRanges.get(getBulletDecoration(level))
                .push(posToRange(match.index + match[1].length, match.index + match[1].length + 1));
        }

        decorationRanges.get(getlistRainbowDecoration(level))
            .push(posToRange(match.index + match[0].length - match[3].length, match.index + match[0].length));
    }
}

module.exports = decorateLists;