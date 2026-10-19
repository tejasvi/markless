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
 * Ranges of each decoration in the parsed text, with the range around which the cursor reveals it
 * @type {Map<import('vscode').TextEditorDecorationType, [import('vscode').Range, import('vscode').Range][]>}
 */
const decorationRanges = undefined;

/**
 * Decorations set on an editor since they were last cleared from all editors
 * @type {Set<import('vscode').TextEditorDecorationType>}
 */
const appliedDecorations = new Set();

/**
 * Decorations each editor shows, so that images still shown elsewhere are not disposed
 * @type {Map<import('vscode').TextEditor, Set<import('vscode').TextEditorDecorationType>>}
 */
const editorDecorations = new Map();

/**
 * Ranges last set for each decoration on each editor, written as a string
 * @type {Map<import('vscode').TextEditor, Map<import('vscode').TextEditorDecorationType, string>>}
 */
const setRanges = new Map();

/**
 * Decorations that only style the text (code block background, highlight) and stay when the
 * cursor is inside them.
 * @type {Set<import('vscode').TextEditorDecorationType>}
 */
const persistentDecorations = new Set();

/**
 * The parse behind decorationRanges: editor, document version and parsed lines
 * @type {{editor: import('vscode').TextEditor, key: string, version: number, lines: [number, number][] | undefined} | undefined}
 */
const build = undefined;

/**
 * Lines where parsing a long document can start, for one version of it
 * @type {{document: import('vscode').TextDocument, version: number, starts: number[]} | undefined}
 */
const blockStarts = undefined;

/**
 * Link reference definitions of one version of a document: url by normalized label
 * @type {{document: import('vscode').TextDocument, version: number, urls: Map<string, string>} | undefined}
 */
const definitions = undefined;

/**
 * Length of the parsed part of the document in `text`, which may be followed by definitions
 * @type {number}
 */
const textLength = undefined;

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
    appliedDecorations,
    editorDecorations,
    setRanges,
    persistentDecorations,
    build,
    blockStarts,
    definitions,
    textLength,
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
