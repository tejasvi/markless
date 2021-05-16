const vscode = require('vscode');

/**
 * @type {vscode.TextEditor}
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
 * @type {vscode.ExtensionContext}
 */
const context = undefined;

/**
 * @type {Map<vscode.TextEditorDecorationType, vscode.Range[]>}
 */
const decorationRanges = undefined;

/**
 * @type {(() => void)[]}
 */
const decorators = undefined;

/**
 * @type {vscode.WorkspaceConfiguration}
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
 * @type {vscode.Selection}
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

const state = {
    activeEditor,
    offset,
    text,
    context,
    decorationRanges,
    darkMode,
    fontSize,
    decorators,
    config,
    selection,
    enabled,
    changeRangeOffset
};

module.exports = { state };