/**
 * @type {import('vscode').TextEditor}
 */
const activeEditor = undefined;

/**
 * @type {Number}
 */
const offset = undefined;

/**
 * @type {string}
 */
const text = undefined;

/**
 * @type {import('vscode').ExtensionContext}
 */
const context = undefined;

/**
 * @type {Map<import('vscode').TextEditorDecorationType, import('vscode').Range[]>}
 */
const decorationRanges = undefined;

/**
 * @type {(() => void)[]}
 */
const decorators = undefined;

/**
 * @type {import('vscode').WorkspaceConfiguration}
 */
const config = undefined;

/**
 * @type {boolean}
 */
const darkMode = undefined;

/**
 * @type {number}
 */
const fontSize = undefined;

/**
 * @type {string}
 */
const fontFamily = undefined;

/**
 * @type {number}
 */
const lineHeight = undefined;

/**
 * @type {import('vscode').Selection}
 */
const selection = undefined;

/**
 * @type {boolean}
 */
const enabled = undefined;

/**
 * @type {number}
 */
const changeRangeOffset = undefined;

/**
 * @type {any}//Map<string, (start: number, end: number, node?: import("unist").Node, listLevel?: number) => void>}
 */
const types = undefined;

/**
 * @type {Boolean}
 */
const autoImagePreview = undefined;


/**
 * @type {import('vscode').CommentController}
 */
const commentController = undefined;

/**
 * @type {Array<[import('vscode').Range, string, string]>}
 */
const imageList = undefined;

const state = {
    activeEditor,
    offset,
    text,
    context,
    decorationRanges,
    darkMode,
    fontSize,
    fontFamily,
    lineHeight,
    decorators,
    config,
    selection,
    enabled,
    types,
    autoImagePreview,
    commentController,
    imageList,
    changeRangeOffset
};

module.exports = { state };