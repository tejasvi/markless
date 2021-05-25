const vscode = require('vscode');
const { state } = require('./state');
const { texToSvg } = require('./texToSvg');
const { svgToUri } = require('./util');

function enableLineRevealAsSignature() {
    state.context.subscriptions.push(vscode.languages.registerSignatureHelpProvider('markdown', {
        provideSignatureHelp: (document, position) => {
            if (!state.activeEditor) return;
            console.log('Signature Help');
            const cursorPosition = state.activeEditor.selection.active;

            let latexElement = undefined;
            let start = state.activeEditor.document.offsetAt(cursorPosition)+2;
            let end = start-3;
            while (--start > 0) {
                if (state.text[start-1] === '$' && state.text[start] !== ' ') {
                    while (++end < state.text.length) {
                        if (state.text[end] === '$' && state.text[end-1] !== ' ') {
                            if (start < end)
                                latexElement = `![latexPreview](${svgToUri(texToSvg(state.text.slice(start, end)))})`;
                            break;
                        }
                    }
                    break;
                }
            }

            const text = document.lineAt(cursorPosition).text
                .replace(new RegExp(`(?<=^.{${position.character}})`), "█");
            const ms = new vscode.MarkdownString(latexElement);
            ms.isTrusted = true;
            if (!latexElement) {
                ms.appendCodeblock(text, "markdown");
            }
            console.log("signature", ms);
            return {
                activeParameter: 0,
                activeSignature: 0,
                signatures: [new vscode.SignatureInformation("", ms)],
            };
        }
    }, '\\'));
}

module.exports = enableLineRevealAsSignature;