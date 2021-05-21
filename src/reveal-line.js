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
            const visibleRangePos = state.activeEditor.document.offsetAt(cursorPosition) - state.offset;

            let latexElement = undefined;
            const texRegEx = /(?<!`)(\${1,2})([^ `][^`]+?[^ `])(\1)(?!`)/g;
            let match;
            while ((match = texRegEx.exec(state.text))) {
                if (match.index <= visibleRangePos && visibleRangePos <= match.index + match[0].length) {
                    latexElement = `![latexPreview](${svgToUri(texToSvg(match[2]))})`;
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