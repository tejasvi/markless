const { state } = require('./state');
const { parser, urlToUri, imageMarkdown, DefaultMap } = require('./util');
const { getBlockStarts, getParseRange } = require('./parse-range');
const vscode = require('vscode')

const { addInlineImages, removeInlineImages, imageThreadMap } = (() => {
    class ImageComment {
        constructor(uri, documentUri) {
            this.mode = vscode.CommentMode.Preview;
            this.author = { name: "" };
            this.body = imageMarkdown(uri, documentUri, "inlinePreview");
        }
    }
    // Threads are looked up by image so that editing above an image moves its preview instead
    // of recreating it.
    const imageThreadMap = new Map();
    const addInlineImages = () => {
        const documentUri = state.activeEditor.document.uri;
        const documentUriString = documentUri.toString();
        const lastImageThreadMap = imageThreadMap.get(documentUriString) || new Map();
        const newImageThreadMap = new DefaultMap(() => []);

        for (const [matchRange, url, alt] of state.imageList) {
            const uri = urlToUri(url, documentUri);
            const key = uri.toString();
            // console.log("Image comment key: ", key);
            const lastThreads = lastImageThreadMap.get(key);
            let thread;
            if (lastThreads && lastThreads.length) {
                thread = lastThreads.pop();
                if (!thread.range.isEqual(matchRange)) {
                    thread.range = matchRange;
                }
            } else {
                thread = state.commentController.createCommentThread(documentUri, matchRange, [new ImageComment(uri, documentUri)]);
                thread.canReply = false;
                if (state.autoImagePreview) {
                    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
                }
            }
            if (thread.label !== alt) {
                thread.label = alt;
            }
            newImageThreadMap.get(key).push(thread);
        }
        state.imageList = [];
        for (const threads of lastImageThreadMap.values()) {
            for (const thread of threads) {
                thread.dispose();
            }
        }
        imageThreadMap.set(documentUriString, newImageThreadMap);
    };
    const removeInlineImages = () => {
        for (const threadMap of imageThreadMap.values()) {
            for (const threads of threadMap.values()) {
                for (const thread of threads) {
                    thread.dispose();
                }
            }
        }
        imageThreadMap.clear();
    };
    return { addInlineImages, removeInlineImages, imageThreadMap };
})();

function posToRange(start, end) {
    const document = state.activeEditor.document;
    const rangeStart = document.positionAt(start + state.offset);
    const rangeEnd = document.positionAt(end + state.offset);
    return new vscode.Range(rangeStart, rangeEnd);
}

/**
 * Text around which the cursor reveals the decorations added by the current node; the whole
 * node unless a decorator passes its own range to addDecoration.
 * @type {vscode.Range}
 */
let revealRange;

function addDecoration(decoration, startOffset, endOffset, revealStartOffset, revealEndOffset) {
    const range = posToRange(startOffset, endOffset);
    state.decorationRanges.get(decoration).push([range, revealStartOffset === undefined ? revealRange : posToRange(revealStartOffset, revealEndOffset)]);
}

function setDecorations() {
    const editor = state.activeEditor;
    const cursorDisables = state.config.get('cursorDisables');
    for (const [decoration, ranges] of state.decorationRanges) {
        // console.log("decoration RANGES", [decoration, ranges]);
        let shown = ranges;
        if (cursorDisables && !state.persistentDecorations.has(decoration)) {
            shown = ranges.filter(([, reveal]) => !editor.selections.some(selection => selection.intersection(reveal)));
        }
        editor.setDecorations(decoration, shown.map(([range]) => range));
        if (ranges.length == 0) {
            state.decorationRanges.delete(decoration); // Unused decoration. Still exist in memoized decoration provider
        }
    }
}

/**
 * Run the decorators of the node types in the tree. Asynchronous decorators (mermaid) return a
 * promise that settles once they added their decorations.
 */
function visitNodes(node) {
    const pending = [];
    const stack = [[node, 0, undefined]];
    while (stack.length) {
        let [curNode, listLevel, parent] = stack.pop()
        const decorators = state.types.get(curNode.type);
        const position = curNode.position;
        if (decorators) {
            revealRange = posToRange(position.start.offset, position.end.offset);
            for (const dec of decorators) {
                try {
                    const result = dec(position.start.offset, position.end.offset, curNode, listLevel, parent);
                    if (result) {
                        pending.push(result);
                    }
                } catch (error) {
                    console.error(`Markless: failed to decorate ${curNode.type}`, error);
                }
            }
            if (curNode.type == "listItem") {
                listLevel += 1;
            }
        }
        if (curNode.children) {
            for (const child of curNode.children) {
                stack.push([child, listLevel, curNode]);
            }
        }
    }
    return pending;
}

/**
 * Lines to parse: all of a small document, the visible part of a large one.
 * @param {vscode.TextEditor} editor
 */
function getParsedLines(editor) {
    const document = editor.document;
    if (document.lineCount <= 500 || !editor.visibleRanges.length) {
        return undefined;
    }
    if (!state.blockStarts || state.blockStarts.document !== document || state.blockStarts.version !== document.version) {
        state.blockStarts = {
            document,
            version: document.version,
            starts: getBlockStarts(line => document.lineAt(line).text, document.lineCount),
        };
    }
    const first = Math.min(...editor.visibleRanges.map(r => r.start.line));
    const last = Math.max(...editor.visibleRanges.map(r => r.end.line));
    return getParseRange(state.blockStarts.starts, document.lineCount, first, last, 200);
}

function updateDecorations() {
    const editor = state.activeEditor;
    if (!editor) return;
    if (editor.document.languageId !== "markdown") {
        clearDecorations();
        state.activeEditor = undefined;
        return;
    }
    // console.log("updateDecorations");
    const document = editor.document;
    const lines = getParsedLines(editor);
    const key = [document.uri, document.version, lines].join(" ");
    if (state.build && state.build.editor === editor && state.build.key === key) {
        setDecorations(); // only the selection changed
        return;
    }
    const build = { editor, key };
    state.build = build;
    for (let decoration of state.decorationRanges.keys()) {
        state.decorationRanges.set(decoration, []); // Reduce failed lookups instead of .clear()
    }
    state.imageList = [];
    const range = lines && new vscode.Range(lines[0], 0, lines[1], 0);
    state.text = document.getText(range);
    state.offset = range ? document.offsetAt(range.start) : 0;
    const pending = visitNodes(parser(state.text));
    setDecorations();
    addInlineImages();
    if (pending.length) {
        Promise.all(pending).then(() => {
            if (state.build === build) {
                setDecorations();
            }
        });
    }
    // console.log("updateDecorationsEnd");
}

function clearDecorations() {
    if (state.activeEditor && state.decorationRanges) {
        for (let decoration of state.decorationRanges.keys()) {
            state.activeEditor.setDecorations(decoration, []);
        }
    }
    state.decorationRanges = new DefaultMap(() => []);
    state.build = undefined;
    removeInlineImages();
}

let timeout;
function triggerUpdateDecorations() {
    if (!state.enabled) return;
    // console.log("triggerUpdateDecorations");
    if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
    }
    timeout = setTimeout(() => {
        timeout = undefined;
        try {
            updateDecorations();
        } catch (error) {
            console.error("Markless: failed to update decorations", error);
        }
    }, 10);
}

module.exports = { triggerUpdateDecorations, addDecoration, posToRange, clearDecorations, imageThreadMap }
