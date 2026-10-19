const vscode = require('vscode');
const { memoize, svgToUri } = require('./util');

// Concealed text has no width, even inside an enlarged heading. The letterSpacing option tells
// VS Code that the decoration changes the width of the text, so it measures the rendered line to
// place the cursor and highlights instead of assuming every character is as wide as in a
// monospace font (#19, #21).
const hiddenText = {
    color: "transparent",
    textDecoration: "none; font-size: 0 !important;",
    letterSpacing: "0",
};

// Decoration types made for the current settings and theme, disposed together when these change
// so that no editor keeps showing them.
const generation = new Set();

function createDecorationType(options) {
    const decoration = vscode.window.createTextEditorDecorationType(options);
    generation.add(decoration);
    return decoration;
}

function disposeDecorationTypes() {
    for (const decoration of generation) {
        decoration.dispose();
    }
    generation.clear();
    images.clear();
}

// Images of formulas, tables and diagrams. An image taller than a line is cut into one slice per
// line: the editor only draws the lines in view, so an image hanging down from its first line
// vanished once that line was scrolled away. Images no longer used are disposed, so that editing a
// formula does not pile up decoration types.
const images = new Map();
const imageDecorations = new WeakSet();
let parses = 0;

/**
 * Decorations showing an image over `numLines` lines, one for each line.
 * @param {string} key identifies the image
 * @param {() => string} makeSvg svg with width and height in px, `numLines * lineHeight` tall
 * @param {number} numLines
 * @param {number} lineHeight
 * @param {boolean} darkMode invert the image
 * @returns {vscode.TextEditorDecorationType[]}
 */
function getImageDecorations(key, makeSvg, numLines, lineHeight, darkMode) {
    let image = images.get(key);
    if (!image) {
        const svg = makeSvg();
        const svgUri = svgToUri(svg);
        const width = parseFloat(/^\s*<svg[^>]*?\swidth="([\d.]+)/.exec(svg)[1]);
        // Every slice shows the same image moved up, so the image is decoded once
        image = {
            decorations: Array.from({ length: numLines }, (_, line) => createDecorationType({
                ...hiddenText,
                before: {
                    contentText: "",
                    width: `${width}px`,
                    height: `${lineHeight}px`,
                    textDecoration: `none; display: inline-block; vertical-align: top; background: url("${svgUri}") no-repeat 0 ${-line * lineHeight}px / ${width}px ${numLines * lineHeight}px;${darkMode ? " filter: invert(1);" : ""}`,
                },
            })),
        };
        image.decorations.forEach(decoration => imageDecorations.add(decoration));
        images.set(key, image);
    }
    image.used = parses;
    return image.decorations;
}

function hasImageDecorations(key) {
    return images.has(key);
}

const imageCount = () => images.size;
const isImageDecoration = (decoration) => imageDecorations.has(decoration);

/**
 * Called after each parse: dispose the images not used by the last few parses (kept for undo) that
 * no editor shows.
 * @param {Set<vscode.TextEditorDecorationType>} shown
 * @returns {vscode.TextEditorDecorationType[]} the disposed decorations
 */
function disposeUnusedImages(shown) {
    parses++;
    const disposed = [];
    for (const [key, image] of images) {
        if (parses - image.used > 3 && !image.decorations.some(decoration => shown.has(decoration))) {
            for (const decoration of image.decorations) {
                decoration.dispose();
                generation.delete(decoration);
                disposed.push(decoration);
            }
            images.delete(key);
        }
    }
    return disposed;
}

const hideDecoration = vscode.window.createTextEditorDecorationType({
    ...hiddenText,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

const transparentDecoration = vscode.window.createTextEditorDecorationType({
    color: "transparent",
});

const getUrlDecoration = memoize((isImage) => vscode.window.createTextEditorDecorationType({
    ...hiddenText,
    before: {
        contentText: isImage ? "🌄" : " 🔗",
        fontWeight: "bold",
        color: "cyan",
    },
}));
module.exports = { imageCount, isImageDecoration, hiddenText, hideDecoration, transparentDecoration, getUrlDecoration, getImageDecorations, hasImageDecorations, disposeUnusedImages, createDecorationType, disposeDecorationTypes };
