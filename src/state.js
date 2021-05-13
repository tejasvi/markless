const vscode = require('vscode');
// eslint-disable-next-line no-unused-vars
// const { DefaultMap } = require('./util');

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
 * @type {DefaultMap}
 */
const decorationRanges = undefined;

/**
 * @type {(() => void)[]}
 */
const decorators = undefined;

const darkMode = vscode.window.activeColorTheme.kind == vscode.ColorThemeKind.Dark;
const fontSize = vscode.workspace.getConfiguration("editor").get("fontSize", 14);

const state = { activeEditor, offset, text, context, decorationRanges, darkMode, fontSize, decorators };

module.exports = { state };