// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in the code below
const vscode = require('vscode');
const { state } = require('./state');
const { triggerUpdateDecorations, DefaultMap } = require('./util');

// this method is called when the extension is activated
// the extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	state.context = context;
	state.activeEditor = vscode.window.activeTextEditor;
	state.decorationRanges = new DefaultMap(()=>[]);

	state.decorators = [
		require('./decorators/code.js'),
		require('./decorators/emphasis.js'),
		require('./decorators/heading.js'),
		require('./decorators/horizontal-rule.js'),
		require('./decorators/inline-image.js'),
		require('./decorators/latex.js'),
		require('./decorators/list.js'),
		require('./decorators/quote.js'),
		require('./decorators/url.js'),
	]

	require('./hover-image.js')();
	require('./reveal-line.js')();

	if (state.activeEditor) {
        if (state.activeEditor.document.languageId == "markdown") {
		triggerUpdateDecorations();
        } else {
            state.activeEditor = undefined;
        }
	}

	vscode.window.onDidChangeTextEditorVisibleRanges(event => {
		console.log("onDidChangeTextEditorVisibleRanges");
		if (state.activeEditor && event.textEditor.document === state.activeEditor.document) {
			triggerUpdateDecorations();
		}
	}, null, state.context.subscriptions);

	vscode.window.onDidChangeActiveTextEditor(editor => {
		console.log("onDidChangeActiveTextEditor");
		if (editor && editor.document.languageId == "markdown") {
			state.activeEditor = editor;
			triggerUpdateDecorations();
		} else {
			state.activeEditor = undefined;
		}
	}, null, state.context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		console.log("onDidChangeTextDocument");
		if (state.activeEditor && event.document === state.activeEditor.document) {
			triggerUpdateDecorations();
		}
	}, null, state.context.subscriptions);
}

// this method is called when the extension is deactivated
function deactivate() { }

module.exports = {
	activate,
	deactivate
};
