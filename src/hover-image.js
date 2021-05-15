const vscode = require('vscode');
const { state } = require('./state');
const { urlToUri } = require('./util');

function enableHoverImage() {
    state.context.subscriptions.push(vscode.languages.registerHoverProvider('markdown', {
        provideHover: (document, position) => {
            const line = document.lineAt(position).text;
            console.log("HHOOVVEERR: ", line);
            const regEx = /(!?)\[[^\]]*\]\((.+?)\)/g;
            let match;
            while ((match = regEx.exec(line))) {
                console.log("HHOOVVEERR: match ", match);
                if (match.index - 1 <= position.character && position.character <= match.index + match[0].length) {
                    const range = new vscode.Range(position.line, match.index, position.line, match.index + match[0].length + 1);
                    const parsedUri = urlToUri(match[2]);
                    if (match[1].length == 1) {
                        return new vscode.Hover(new vscode.MarkdownString(`[![hoverPreview](${parsedUri})](${parsedUri})`), range);
                    } else {
                        return new vscode.Hover(new vscode.MarkdownString(`**[${match[2]}](${parsedUri})**`), range);
                    }
                }
            }
        }
    }));
}

module.exports = enableHoverImage;