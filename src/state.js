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
 * Decorations that only style the text (code block background, highlight) and stay when the
 * cursor is inside them.
 * @type {Set<import('vscode').TextEditorDecorationType>}
 */
const persistentDecorations = new Set();

/**
 * Identifies the parse behind decorationRanges: document version and parsed lines.
 * @type {{key: string} | undefined}
 */
const build = undefined;

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
 * @type {boolean}
 */
const enabled = undefined;

/**
 * @type {Map<string, ((start: number, end: number, node?: any, listLevel?: number, parent?: any) => void | Promise<void>)[]>}
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
    persistentDecorations,
    build,
    darkMode,
    fontSize,
    fontFamily,
    lineHeight,
    config,
    enabled,
    types,
    autoImagePreview,
    commentController,
    imageList,
};

module.exports = { state };
