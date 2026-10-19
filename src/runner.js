const { state } = require('./state');
const { parser, imageMarkdown, DefaultMap } = require('./util');
const { getBlockStarts, getParseRange } = require('./parse-range');
const vscode = require('vscode')

const { addInlineImages, removeInlineImages, imageThreadMap } = (() => {
    class ImageComment {
        constructor(body) {
            this.mode = vscode.CommentMode.Preview;
            this.author = { name: "" };
            this.body = body;
        }
    }
    // Threads are looked up by image so that editing above an image moves its preview instead
    // of recreating it.
    const imageThreadMap = new Map();
    const addInlineImages = (document) => {
        const documentUri = document.uri;
        const documentUriString = documentUri.toString();
        const lastImageThreadMap = imageThreadMap.get(documentUriString) || new Map();
        const newImageThreadMap = new DefaultMap(() => []);

        // In document order, so that copies of an image keep their previews
        state.imageList.sort(([a], [b]) => a.start.compareTo(b.start));
        for (const [matchRange, url, alt] of state.imageList) {
            const body = imageMarkdown(url, documentUri, "inlinePreview");
            if (!body) continue;
            const key = body.value;
            // console.log("Image comment key: ", key);
            const lastThreads = lastImageThreadMap.get(key);
            let thread;
            if (lastThreads && lastThreads.length) {
                thread = lastThreads.shift();
                if (!thread.range.isEqual(matchRange)) {
                    thread.range = matchRange;
                }
            } else {
                thread = state.commentController.createCommentThread(documentUri, matchRange, [new ImageComment(body)]);
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
    // Remove the previews of a document, or of all documents
    const removeInlineImages = (documentUri) => {
        for (const [uri, threadMap] of imageThreadMap) {
            if (documentUri && uri !== documentUri.toString()) continue;
            for (const threads of threadMap.values()) {
                for (const thread of threads) {
                    thread.dispose();
                }
            }
            imageThreadMap.delete(uri);
        }
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

/**
 * Add a decoration from ranges taken during the parse, for decorators that finish later.
 * @param {vscode.TextEditorDecorationType} decoration
 * @param {vscode.Range} range
 * @param {vscode.Range} reveal
 */
function addDecorationRange(decoration, range, reveal) {
    state.decorationRanges.get(decoration).push([range, reveal]);
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
        state.appliedDecorations.add(decoration);
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
    const stack = [[node, 0, undefined, false]];
    while (stack.length) {
        let [curNode, listLevel, parent, inTable] = stack.pop()
        const decorators = state.types.get(curNode.type);
        const position = curNode.position;
        // Nodes made up by the parser, like some autolinks, have no position
        if (decorators && position) {
            revealRange = posToRange(position.start.offset, position.end.offset);
            for (const dec of decorators) {
                // A rendered table is one image: the markup in its cells is not decorated on top
                // of it, only images are previewed.
                if (inTable && !dec.insideTables) continue;
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
            const childrenInTable = inTable || (curNode.type === "table" && !!decorators);
            for (const child of curNode.children) {
                stack.push([child, listLevel, curNode, childrenInTable]);
            }
        }
    }
    return pending;
}

/**
 * Lines `[start, end)` to parse: all of a small document, the parts around the visible ranges of
 * a large one.
 * @param {vscode.TextEditor} editor
 * @returns {[number, number][] | undefined}
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
    // Lines around the visible ones are parsed ahead for scrolling, which shows more lines at the
    // top and the bottom. Next to folded regions a few lines are enough.
    const visible = [...editor.visibleRanges].sort((a, b) => a.start.line - b.start.line);
    const margins = visible.map((_, i) => [i === 0 ? 200 : 20, i === visible.length - 1 ? 200 : 20]);
    // Scrolling a little keeps the parsed lines while the visible ones stay well inside them
    const previous = state.build && state.build.editor === editor && state.build.version === document.version && state.build.lines;
    const inside = (range, [before, after]) => previous.some(([start, end]) =>
        start <= Math.max(range.start.line - before / 4, 0) && Math.min(range.end.line + after / 4, document.lineCount - 1) < end);
    if (previous && visible.every((range, i) => inside(range, margins[i]))) {
        return previous;
    }
    // Each visible range separately, so that a large folded region in between is not parsed
    const ranges = visible
        .map((range, i) => getParseRange(state.blockStarts.starts, document.lineCount, range.start.line, range.end.line, ...margins[i]))
        .sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const range of ranges) {
        const last = merged[merged.length - 1];
        if (last && range[0] <= last[1]) {
            last[1] = Math.max(last[1], range[1]);
        } else {
            merged.push(range);
        }
    }
    return merged;
}

function updateDecorations() {
    const editor = state.activeEditor;
    if (!state.enabled || !editor) return;
    if (editor.document.languageId !== "markdown") {
        clearDecorations(editor);
        removeInlineImages(editor.document.uri);
        state.activeEditor = undefined;
        return;
    }
    // console.log("updateDecorations");
    const document = editor.document;
    const lines = getParsedLines(editor);
    const key = [document.uri, document.version, JSON.stringify(lines)].join(" ");
    if (state.build && state.build.editor === editor && state.build.key === key) {
        setDecorations(); // only the selection changed
        return;
    }
    const build = { editor, key, version: document.version, lines };
    state.build = build;
    for (let decoration of state.decorationRanges.keys()) {
        state.decorationRanges.set(decoration, []); // Reduce failed lookups instead of .clear()
    }
    state.imageList = [];
    const pending = [];
    try {
        for (const [start, end] of lines || [[0, document.lineCount]]) {
            const range = lines && new vscode.Range(start, 0, end, 0);
            state.text = document.getText(range);
            state.offset = range ? document.offsetAt(range.start) : 0;
            pending.push(...visitNodes(parser(state.text, state.offset === 0)));
        }
    } catch (error) {
        state.build = undefined; // parse again on the next update
        throw error;
    }
    setDecorations();
    addInlineImages(document);
    // Diagrams are shown as each of them is ready
    for (const promise of pending) {
        promise.then(() => {
            if (state.build === build && state.activeEditor === editor) {
                setDecorations();
            }
        });
    }
    // console.log("updateDecorationsEnd");
}

let timeout;

/**
 * Remove the decorations from an editor, or from all visible editors, and forget the parse.
 * @param {vscode.TextEditor} [editor]
 */
function clearDecorations(editor) {
    clearTimeout(timeout);
    for (const visibleEditor of editor ? [editor] : vscode.window.visibleTextEditors) {
        for (const decoration of state.appliedDecorations) {
            visibleEditor.setDecorations(decoration, []);
        }
    }
    if (!editor) {
        state.appliedDecorations.clear();
    }
    state.decorationRanges = new DefaultMap(() => []);
    state.build = undefined;
}

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

module.exports = { triggerUpdateDecorations, addDecoration, addDecorationRange, posToRange, clearDecorations, removeInlineImages, imageThreadMap }
