// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in the code below
const vscode = require('vscode');
const { state } = require('./state');
const { triggerUpdateDecorations, DefaultMap } = require('./util');

function bootstrap() {
	state.activeEditor = vscode.window.activeTextEditor;
	if (state.activeEditor) {
        if (state.activeEditor.document.languageId == "markdown") {
			state.selection = state.activeEditor.selection;
			triggerUpdateDecorations();
        } else {
            state.activeEditor = undefined;
        }
	}
}

function toggle() {
	if (state.enabled) {
		for (let decoration of state.decorationRanges.keys()) {
			state.activeEditor.setDecorations(decoration, []);
		}
		state.enabled = false;
	} else {
		state.enabled = true;
		bootstrap();
	}
}

// this method is called when the extension is activated
// the extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	state.enabled = true;
	state.context = context;
	state.context.subscriptions.push(vscode.commands.registerCommand("markdown.wysiwyg.toggle", toggle))
	state.decorationRanges = new DefaultMap(()=>[]);
	state.config = vscode.workspace.getConfiguration("markdown.wysiwyg");
	state.darkMode = vscode.window.activeColorTheme.kind == vscode.ColorThemeKind.Dark;
	state.fontSize = vscode.workspace.getConfiguration("editor").get("fontSize", 14);

	state.decorators = [
		['emphasis', './decorators/emphasis.js'],
		// ['heading', './decorators/heading.js'],
		['horizontalRule', './decorators/horizontal-rule.js'],
		['inlineCode', './decorators/inline-code.js'],
		['inlineImage.enabled', './decorators/inline-image.js'],
		['latex', './decorators/latex.js'],
		['list', './decorators/list.js'],
		['quote', './decorators/quote.js'],
		['url', './decorators/url.js'],
	].filter(e => state.config.get(e[0]))
		.map(e => require(e[1]));

	if (state.config.get('hoverImage')) {
		require('./hover-image.js')();
	}
	require('./reveal-line.js')();

	bootstrap();

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
			if (event.contentChanges.length == 1) {
				state.changeRangeOffset = event.contentChanges[0].rangeOffset;
			}
			triggerUpdateDecorations();
			state.changeRangeOffset = undefined;
		}
	}, null, state.context.subscriptions);

	vscode.workspace.onDidChangeConfiguration(e => {
		if (['markdown.wysiwyg', 'workbench.colorTheme', 'editor.fontSize'].some(c=>e.affectsConfiguration(c))) {
			if (!state.context) return;
			for (let subscription of state.context.subscriptions) {
				subscription.dispose();
			}
			// Clear old decorations
			if (state.activeEditor){
				toggle(); toggle();
			}
			activate(state.context);
		}
	}, null, state.context.subscriptions);

	vscode.window.onDidChangeTextEditorSelection((e) => {
		if (state.activeEditor) {
			state.selection = e.selections[0];
			triggerUpdateDecorations();
		}
	}, null, state.context.subscriptions)
}

// this method is called when the extension is deactivated
function deactivate() {
}

module.exports = {
	activate,
	deactivate
};
