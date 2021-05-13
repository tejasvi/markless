const { state } = require('./state');
const vscode = require('vscode');

class DefaultMap extends Map {
    get(key) {
        if (!this.has(key)) {
            this.set(key, this.defaultMethod());
        }
        return super.get(key);
    }
    constructor(defaultMethod) {
        super();
        this.defaultMethod = defaultMethod;
    }
}

function memoize(func) {
    const cache = new Map();
    return (...args) => {
        const key = args.toString();
        if (!cache.has(key)) {
            cache.set(key, func(...args));
        }
        return cache.get(key);
    };
}

function posToRange(start, end) {
    const offsetToPos = state.activeEditor.document.positionAt;
    const rangeStart = offsetToPos(start + state.offset);
    const rangeEnd = offsetToPos(end + state.offset);
    return new vscode.Range(rangeStart, rangeEnd);
}

function setDecorations() {
    for (let [decoration, ranges] of state.decorationRanges) {
        console.log("decoration RANGES", [decoration, ranges]);
        state.activeEditor.setDecorations(decoration, ranges);
        if (ranges.length == 0) {
            state.decorationRanges.delete(decoration); // Unused decoration. Still exist in memoized decoration provider
        }
    }
}

function constructDecorations() {
    for (let decoration of state.decorationRanges.keys()) {
        state.decorationRanges.set(decoration, []); // Reduce failed lookups instead of .clear()
    }
    const activeEditor = state.activeEditor;
    for (let range of activeEditor.visibleRanges) {
        range = new vscode.Range(Math.max(range.start.line - 50, 0), 0, range.end.line + 50, 0);
        console.log("Range: ", range.start.line, range.end.line);
        state.offset = activeEditor.document.offsetAt(range.start);
        state.text = activeEditor.document.getText(range);
        for (let decorator of state.decorators) {
            decorator();
        }
    }
}

function updateDecorations() {
    console.log("updateDecorations");
    constructDecorations();
    setDecorations();
    console.log("updateDecorationsEnd");
}

let timeout;
function triggerUpdateDecorations() {
    console.log("triggerUpdateDecorations");
    if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
    }
    timeout = setTimeout(updateDecorations, 100);
}


module.exports = { DefaultMap, memoize, posToRange, triggerUpdateDecorations };