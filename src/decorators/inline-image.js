const vscode = require('vscode');
const { posToRange, DefaultMap } = require('../util');
const { state } = require('../state');

class ImageComment {
    constructor(url) {
        this.mode = vscode.CommentMode.Preview;
        this.author = { name: "" };
        console.log("Image comment: ", url)
        const parsedUri = vscode.Uri.parse(url);
        this.body = new vscode.MarkdownString(`[![inlinePreview](${parsedUri})](${parsedUri})`);
    }
}

const commentController = vscode.comments.createCommentController("inlineImage", "Show images inline");
state.context.subscriptions.push(commentController);

const imageThreadMap = new DefaultMap(()=>new Map());

function showInlineImages() {
    const documentUri = state.activeEditor.document.uri;
    
    const lastImageThreadMap = imageThreadMap.get(documentUri.toString());
    const newImageThreadMap = new Map();
    
    const regEx = /!\[([^\]]*)\]\((https?:\/\/[^ ]+)\)/g;
    let match;
    while ((match = regEx.exec(state.text))) {
        console.log("Image comment: match ", match);
        const matchRange = posToRange(match.index, match.index + match[0].length);
        if (!matchRange) continue;
        const url = match[2];
        const key = [documentUri, matchRange.start.line, url].toString();
        console.log("Image comment key: ", key);

        if (lastImageThreadMap.has(key)) {
            console.log("Image comment has key: ", key)
            newImageThreadMap.set(key, lastImageThreadMap.get(key));
            lastImageThreadMap.delete(key);
        } else {
            const thread = commentController.createCommentThread(documentUri, matchRange, [new ImageComment(url)]);
            thread.canReply = false;
            thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
            thread.label = match[1];
            newImageThreadMap.set(key, thread);
        }
    } 
    for (let thread of lastImageThreadMap.values()) {
        thread.dispose();
    }
    imageThreadMap.set(documentUri.toString(), newImageThreadMap);
}

module.exports = showInlineImages;