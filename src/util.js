const { state } = require('./state');
const vscode = require('vscode');
const { hideDecoration } = require('./common-decorations');

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

/**
 * @param {string} url
 */
function urlToUri(url) {
    if (url.includes(":")) {
        if (url.match(/^[A-Z]:\\[^\\]/)) {
            return vscode.Uri.file(url);
        } else {
            return vscode.Uri.parse(url, true);
        }
    } else if (url.startsWith("/")) {
        return vscode.Uri.file(url);
    } else {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const cwd = workspaceFolders ? workspaceFolders[0].uri : vscode.Uri.file("/");
        return vscode.Uri.joinPath(cwd, url);
    }
}

function setDecorations() {
    for (let [decoration, ranges] of state.decorationRanges) {
        console.log("decoration RANGES", [decoration, ranges]);
        if (state.config.cursorDisables) {
            ranges = ranges.filter((r) => !state.selection.intersection(r));
        }
        state.activeEditor.setDecorations(decoration, ranges);
        if (ranges.length == 0) {
            state.decorationRanges.delete(decoration); // Unused decoration. Still exist in memoized decoration provider
        }
    }
}

function normalizeList() {
    const regExPattern = "^( {2,})(\\*|\\d+(?:\\.|\\))|-|\\+) .";
    const match = new RegExp(regExPattern, "m").exec(state.text);
    if (match) {
        let spacesPerLevel = 4;
        const nextMatch = new RegExp(regExPattern.replace("2", String(match[1].length + 2)), "m").exec(state.text);
        if (nextMatch) {
            spacesPerLevel = nextMatch[1].length - match[1].length;
        }
        const maxLevel = Math.floor(match[1].length / spacesPerLevel);
        const listItem = match[2].length > 1 ? "1. a\n" : "* a\n";
        let prefix = "";
        for (let level = 0; level < maxLevel; ++level) {
            prefix += " ".repeat(spacesPerLevel * level) + listItem;
        }
        prefix += '\n';
        if (state.offset >= prefix.length) {
            state.offset -= prefix.length;
            state.text = prefix + state.text;
        }
    }
}

const parser = require('unified')()
    .use(require('remark-math'))
    .use(require('remark-parse'))
    .use(require('remark-gfm'))
    .parse;

const nodeToHtml = (() => {
    // Need
    // "hast-util-to-html": "^7.1.3",
    // "mdast-util-to-hast": "^10.2.0",
    // else https://stackoverflow.com/a/63719868/8211365
    const toHast = require('mdast-util-to-hast');
    const toHtml = require('hast-util-to-html');
    return (/** @type {import("unist").Node} */ node) => toHtml(toHast(node));
})();


function visitNodes(node) {
    const stack = [[node, 0]];
    while (stack.length) {
        let [curNode, listLevel] = stack.pop()
        const dec = types.get(curNode.type);
        if (dec) {
            if (curNode.type == "listItem") {
                dec(curNode, listLevel);
                listLevel += 1;
            } else {
                dec(curNode);
            }
        }
        if (curNode.children) {
            stack.push(...curNode.children.map(c => [c, listLevel]));
        }
    }
}

const getEnlargeDecoration = memoize((size) => vscode.window.createTextEditorDecorationType({
    textDecoration: `; font-size: ${size}px; position: relative; top: 0.3em;`,
}));

const types = new Map([
    ["heading", (node) => {
        console.log("Heading node", node);
        const decorationRanges = state.decorationRanges;
        decorationRanges.get(getEnlargeDecoration(8 * state.fontSize / (2 + node.depth))).push(posToRange(node.position.start.offset + node.depth + 1, node.position.end.offset));
        decorationRanges.get(hideDecoration).push(posToRange(node.position.start.offset, node.position.start.offset + node.depth + 1));
    }],
    ["thematicBreak", (node) => {
        console.log(node);

    }],
    ["blockquote", (node) => {
        console.log(node);

    }],
    ["listItem", (node, listLevel) => {
        console.log(node, listLevel);

    }],
    ["math", (node) => {
        console.log(node);

    }],
    ["mathInline", (node) => {
        console.log(node);

    }],
    ["emphasis", (node) => {
        console.log(node);

    }],
    ["strong", (node) => {
        console.log(node);

    }],
    ["inlineCode", (node) => {
        console.log(node);

    }],
    ["link", (node) => {
        console.log(node);

    }],
    ["image", (node) => {
        console.log(node);

    }],
    ["delete", (node) => {
        console.log(node);

    }]
]);

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
        normalizeList();
        const node = parser(state.text);
        console.log("PARSING", node, visitNodes(node), nodeToHtml(node));
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
    if (!state.enabled) return;
    console.log("triggerUpdateDecorations");
    if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
    }
    timeout = setTimeout(updateDecorations, 100);
}


module.exports = { DefaultMap, memoize, posToRange, triggerUpdateDecorations, urlToUri };