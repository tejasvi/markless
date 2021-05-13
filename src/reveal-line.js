const vscode = require('vscode');
const { state } = require('./state');

function enableLineRevealAsSignature() {
    state.context.subscriptions.push(vscode.languages.registerSignatureHelpProvider('markdown', {
        provideSignatureHelp: (document, position) => {
            if (!state.activeEditor) return;
            console.log('Signature Help');
            const text = document.lineAt(state.activeEditor.selection.active).text
                .replace(new RegExp(`(?<=^.{${position.character}})`), "█");
            const ms = new vscode.MarkdownString();
            ms.appendCodeblock(text, "markdown");
            console.log("signature", ms.value);
            ms.isTrusted = true;
            return {
                activeParameter: 0,
                activeSignature: 0,
                signatures: [new vscode.SignatureInformation("", ms)],
            };
        }
    }, '\\'));
}

module.exports = enableLineRevealAsSignature;