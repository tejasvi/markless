const vscode = require('vscode');
const { hideDecoration, transparentDecoration, getUrlDecoration, getSvgDecoration } = require('./common-decorations');
const { state } = require('./state');
const {  memoize, nodeToHtml, svgToUri, htmlToSvg, DefaultMap, texToSvg, enableHoverImage } = require('./util');
const { triggerUpdateDecorations, addDecoration, posToRange }  = require('./runner');
const cheerio = require('cheerio');

let config = vscode.workspace.getConfiguration("markdown.wysiwyg");

function enableLineRevealAsSignature(context) {
    context.subscriptions.push(vscode.languages.registerSignatureHelpProvider('markdown', {
        provideSignatureHelp: (document, position) => {
            if (!state.activeEditor) return;
            // console.log('Signature Help');
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
            // console.log("signature", ms);
            return {
                activeParameter: 0,
                activeSignature: 0,
                signatures: [new vscode.SignatureInformation("", ms)],
            };
        }
    }, '\\'));
}

let requestSvg, webviewLoaded;
function registerWebviewViewProvider (context) {
	let resolveWebviewLoaded, resolveSvg;
	webviewLoaded = new Promise(resolve => { resolveWebviewLoaded = resolve; });
	context.subscriptions.push(vscode.window.registerWebviewViewProvider("test.webview", {
		resolveWebviewView: (webviewView) => {
			webviewView.webview.options = { enableScripts: true };
			const mermaidScriptUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'));
			webviewView.webview.html = `
					<!DOCTYPE html>
					<html lang="en">
						<body>
						<script src="${mermaidScriptUri}"></script>
						<script>
						// console.log("WEBVIEW ENTER");

						const vscode = acquireVsCodeApi();
						window.addEventListener('message', event => {
							const data = event.data;
							mermaid.mermaidAPI.initialize({
								theme: data.darkMode? "dark":"default",
								fontFamily: data.fontFamily,
								startOnLoad: false
							});
							// console.log("init done");
							// console.log("WEBVIEW RECIEVE FROM EXTENSION", event)
							vscode.postMessage(mermaid.mermaidAPI.render('mermaid', data.source));
						});

						</script>
						</body>
						</html>
						`;
			webviewView.webview.onDidReceiveMessage((svgString) => {
				// console.log(svgString);
				resolveSvg(svgString);
			}, null, context.subscriptions);
			requestSvg = x => {
				webviewView.webview.postMessage(x);
				return new Promise(resolve => { resolveSvg = resolve; });
			};
			resolveWebviewLoaded();
		}
	}, { webviewOptions: { retainContextWhenHidden: true } }));
	vscode.commands.executeCommand('workbench.view.extension.markdownWysiwyg')
		.then(() => vscode.commands.executeCommand('workbench.view.explorer'));
}


function clearDecorations() {
	if (!state.decorationRanges) return;
	for (let decoration of state.decorationRanges.keys()) {
		state.activeEditor.setDecorations(decoration, []);
	}
}

function toggle() {
	if (state.enabled) {
		clearDecorations();
		state.enabled = false;
	} else {
		state.enabled = true;
		triggerUpdateDecorations();
	}
}

function bootstrap(context) {
    state.enabled = true;
    state.context = context;
	clearDecorations();
    state.decorationRanges = new DefaultMap(() => []);
    state.config = config;
    state.darkMode = vscode.window.activeColorTheme.kind == vscode.ColorThemeKind.Dark;
    state.fontSize = vscode.workspace.getConfiguration("editor").get("fontSize", 14);
    state.fontFamily = vscode.workspace.getConfiguration("editor").get("fontFamily", "Courier New");

    const lineHeight = vscode.workspace.getConfiguration("editor").get("lineHeight", 0);
    // https://github.com/microsoft/vscode/blob/45aafeb326d0d3d56cbc9e2932f87e368dbf652d/src/vs/editor/common/config/fontInfo.ts#L54
    if (lineHeight === 0) {
        state.lineHeight = Math.round(process.platform == "darwin" ? 1.5 : 1.35 * state.fontSize);
    } else if (lineHeight < 8) {
        state.lineHeight = 8;
    }
    state.autoImagePreview = state.config.get('inlineImage.autoPreview');

	// @ts-ignore
	state.types = new Map([
		["heading", ["heading", (() => {
			const getEnlargeDecoration = memoize((size) => vscode.window.createTextEditorDecorationType({
				textDecoration: `; font-size: ${size}px; position: relative; top: 0.2em;`,
			}));
			return (start, end, node) => {
				// console.log("Heading node", node);
				addDecoration(getEnlargeDecoration(8 * state.fontSize / (2 + node.depth)), start + node.depth + 1, end);
				addDecoration(hideDecoration, start, start + node.depth + 1);
			};
		})()]],
		["horizontalRule", ["thematicBreak", (() => {
			const horizontalRuleDecoration = vscode.window.createTextEditorDecorationType({
				color: "transparent",
				textDecoration: "none; display: inline-block; width: 0;",
				before: {
					contentText: "",
					textDecoration: "none; position: absolute; background: #ffaa00; top: 0.49em; bottom: 0.49em; width: 100%; mix-blend-mode: luminosity; border: outset;",
				}
			});
			return (start, end) => {
				addDecoration(horizontalRuleDecoration, start, end);
			};
		})()]],
		["quote", ["blockquote", (() => {
			const quoteDecoration = vscode.window.createTextEditorDecorationType({
				textDecoration: "none; filter: drop-shadow(0px 0px 40px);",
			});
			const quoteBarDecoration = vscode.window.createTextEditorDecorationType({
				color: "transparent",
				before: {
					contentText: "",
					textDecoration: "none; position: absolute; background: #ffaa00; top: -0.2em; bottom: -0.2em; width: 3px; border-radius: 99px; mix-blend-mode: luminosity;",
				}
			});
			return (start, end) => {
				addDecoration(quoteDecoration, start, end);
				const text = state.text.slice(start, end);
				const regEx = /^ {0,3}>/mg;
				let match;
				while ((match = regEx.exec(text))) {
					// console.log("Quote: ", match);
					addDecoration(quoteBarDecoration, start + match.index + match[0].length - 1, start + match.index + match[0].length);
				}
			};
		})()]],
		["list", ["listItem", (() => {
			const getBulletDecoration = memoize((level) => {
				const listBullets = ["❧", "☯", "♠", "❀", "♚", "☬", "♣", "♥", "🙤", "⚜", "⚛", "⛇", "⚓", "☘", "☔"];
				return vscode.window.createTextEditorDecorationType({
					color: "transparent",
					textDecoration: "none; display: inline-block; width: 0;",
					after: {
						contentText: listBullets[level % listBullets.length],
						fontWeight: "bold"
					},
				});
			});
			const getCheckedDecoration = memoize((checked) => {
				return vscode.window.createTextEditorDecorationType({
					color: "transparent",
					textDecoration: "none; display: inline-block; width: 0;",
					after: {
						contentText: checked ? "☑" : "☐",
						fontWeight: "bold"
					},
				});
			});
			const getlistRainbowDecoration = (() => {
				const hueRotationMultiplier = [0, 5, 9, 2, 6, 7];
				const getNonCyclicDecoration = memoize((level) => vscode.window.createTextEditorDecorationType({
					textDecoration: (`; filter: hue-rotate(${hueRotationMultiplier[level] * 360 / 12}deg);`),
				}));
				return (level) => {
					level = level % hueRotationMultiplier.length;
					return getNonCyclicDecoration(level);
				};
			})();
			return (start, _end, node, listLevel) => {
				// console.log("decorate list", listLevel);
				if (node.children.length === 0) return;
				const textPosition = node.children[0].position;
				const textStart = textPosition.start.offset;
				const textEnd = textPosition.end.offset;
				addDecoration(node.checked == null ? getBulletDecoration(listLevel) : getCheckedDecoration(node.checked), start, textStart - 1);
				addDecoration(getlistRainbowDecoration(listLevel), textStart, textEnd);
			};
		})()]],
		["latex", ["math", (() => {
			const getTexDecoration = (() => {
				const _getTexDecoration = memoize((texString, display, darkMode, fontSize, height) => {
					const svgUri = svgToUri(texToSvg(texString, display, height));
					return getSvgDecoration(svgUri, darkMode);
				});
				return (texString, display, numLines) => _getTexDecoration(texString, display, state.darkMode, state.fontSize, numLines * state.lineHeight);
			})();
			return (start, end) => {
				const latexText = state.text.slice(start, end);
				const match = /^(\$+)([^]+)\1/.exec(latexText);
				if (!match) return;
				// console.log("math", latexText);
				const numLines = 1 + (latexText.match(/\n/g)||[]).length;
				addDecoration(getTexDecoration(match[2], match[1].length > 1, numLines), start, end);
			};
		})()]],
		["latex", ["inlineMath", (start, end) => state.types.get("math")(start, end)]],
		["emphasis", ["emphasis", (start, end) => {
			addDecoration(hideDecoration, start, start + 1);
			addDecoration(hideDecoration, end - 1, end);
		}]],
		["emphasis", ["strong", (start, end) => {
			addDecoration(hideDecoration, start, start + 2);
			addDecoration(hideDecoration, end - 2, end);
		}]],
		["inlineCode", ["inlineCode", (() => {
			const codeDecoration = vscode.window.createTextEditorDecorationType({
				// outline: "1px dotted"
				border: "outset",
				borderRadius: "5px",
			})
			return (start, end) => {
				addDecoration(codeDecoration, start, end);
				addDecoration(transparentDecoration, start, start + 1);
				addDecoration(transparentDecoration, end - 1, end);
			};
		})()]],
		["mermaid", ["code", (() => {
			const getMermaidDecoration = (() => {
				const _getTexDecoration = memoize(async (source, darkMode, height, fontFamily) => {
					await webviewLoaded;
					const svgString = await requestSvg({ source: source, darkMode: darkMode, fontFamily: fontFamily });
					const svgNode = cheerio.load(svgString)('svg');
					const maxWidth = parseFloat(svgNode.css('max-width')) * height / parseFloat(svgNode.attr('height'));
					const svg = svgNode
						.css('max-width', `${maxWidth}px`)
						.attr('height', `${height}px`)
						.attr("preserveAspectRatio", "xMinYMin meet")
						.toString()
					const svgUri = svgToUri(svg);
					// console.log("SSSSSSSVVVVGGGG:  ")
					// console.log('%c ', `font-size:400px; background:url(${svgUri}) no-repeat; background-size: contain;`);
					return getSvgDecoration(svgUri, false); // Using mermaid theme instead
				});
				return (source, numLines) => _getTexDecoration(source, state.darkMode, (numLines + 2) * state.lineHeight, state.fontFamily);
			})();
			return async (start, end, node) => {
				if (!(node.lang === "mermaid")) return;
				const match = state.text.slice(start, end).match(/^(.)(\1{2,}).*?\n([^]+)\n\1{3,}$/);
				if (!match) return;
				const source = match[3]
					, numLines = 1 + (source.match(/\n/g) || []).length;
				const decoration = await getMermaidDecoration(source, numLines);
				if (decoration) {
					addDecoration(decoration, start, end);
				}
			};
		})()]],
		["link", ["link", (start, end) => {
			const text = state.text.slice(start, end);
			const match = /\[(.+)\]\(.+?\)/.exec(text);
			if (!match) return;
			addDecoration(hideDecoration, start, start + 1);
			addDecoration(getUrlDecoration(false), start + match[1].length + 1, end);
		}]],
		["html", ["html", (() => {
			const htmlDecoration = vscode.window.createTextEditorDecorationType({
				color: "transparent",
				textDecoration: "none; display: inline-block; width: 0;",
				before: {
					contentText: "</>",
					fontWeight: "bold",
					textDecoration: "none; font-size: small; vertical-align: middle;",
					color: "cyan"
				},
			});
			return (start, end) => {
				const text = state.text.slice(start, end);
				const match = /(<.+?>).+(<\/.+?>)/.exec(text);
				if (match) {
					addDecoration(htmlDecoration, start, start + match[1].length);
					addDecoration(htmlDecoration, end - match[2].length, end);
				} else {
					addDecoration(htmlDecoration, start, end);
				}
			}
		})()]],
		["link", ["image", (start, end, node) => {
			const text = state.text.slice(start, end);
			const match = /!\[(.+)\]\(.+?\)/.exec(text);
			if (!match) return;
			addDecoration(hideDecoration, start, start + 2);
			addDecoration(getUrlDecoration(true), start + match[1].length + 2, end);
			state.imageList.push([posToRange(start, end), node.url, node.alt]);
		}]],
		["emphasis", ["delete", (() => {
			const strikeDecoration = vscode.window.createTextEditorDecorationType({
				textDecoration: "line-through"
			});
			return (start, end) => {
				addDecoration(hideDecoration, start, start + 2);
				addDecoration(hideDecoration, end - 2, end);
				addDecoration(strikeDecoration, start + 2, end - 2);
			};
		})()]],
		["table", ["table", (() => {
			const getTableDecoration = memoize((html, darkMode, fontFamily, fontSize, lineHeight) => {
				const numRows = 1 + (html.match(/<tr>/g) || []).length;
				const css = `
				table { border-collapse: collapse; }
				th { border-bottom : groove; }
				td { border-bottom : inset; }
				td, th {padding:${fontSize*0.1}px 0.5em;}
				/*td,th { height: ${lineHeight*0.9}px;}*/
				body {
					font-family:${fontFamily.replace(/(?<!\\)"/g, "'")};
					font-size: ${fontSize*0.9}px;
				}
				`;
				const temp = html.match(/<tr>[^]+?<\/tr>/g)
					.map(r => r.replace(/^<tr>\n<t[dh]>/, '').split(/<t[dh]>/)
						.map(c => c.replace(/<\/?("[^"]*"|'[^']*'|[^>])*(>|$)/g, "")))
				const maxLength = temp.reduce((acc, cur) => acc.map((val, idx) => Math.max(val, cur[idx].length)), Array(temp[0].length).fill(0))
					.reduce((acc, cur)=>acc+cur);

				const tableUri = svgToUri(htmlToSvg(numRows * lineHeight, maxLength * fontSize, html, css));
				return vscode.window.createTextEditorDecorationType({
					color: "transparent",
					textDecoration: "none; display: inline-block; width: 0;",
					before: {
						contentIconPath: vscode.Uri.parse(tableUri),
						textDecoration: `none;${darkMode ? " filter: invert(1)" : ""}`,
					},
				});
			});
			return (start, end, node) => {
				const html = nodeToHtml(node);
				addDecoration(getTableDecoration(html, state.darkMode, state.fontFamily, state.fontSize, state.lineHeight), start, end);
			};
		})()]]
	// @ts-ignore
	].filter(e=>state.config.get(e[0])).map(e => e[1]));

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

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	if (config.get('mermaid')) {
		registerWebviewViewProvider(context);
	}
	if (config.get("hoverImage")) {
		enableHoverImage(context);
	}
	enableLineRevealAsSignature(context);
    context.subscriptions.push(vscode.commands.registerCommand("markdown.wysiwyg.toggle", toggle));
	state.imageList = [];
    state.commentController = vscode.comments.createCommentController("inlineImage", "Show images inline");
    context.subscriptions.push(state.commentController);
	bootstrap(context);

	vscode.window.onDidChangeTextEditorVisibleRanges(event => {
		// console.log("onDidChangeTextEditorVisibleRanges");
		if (state.activeEditor && state.activeEditor.document.lineCount > 500 && event.textEditor.document === state.activeEditor.document) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	vscode.window.onDidChangeActiveTextEditor(editor => {
		// console.log("onDidChangeActiveTextEditor");
		if (editor && editor.document.languageId == "markdown") {
			state.activeEditor = editor;
			triggerUpdateDecorations();
		} else {
			state.activeEditor = undefined;
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		// console.log("onDidChangeTextDocument");
		if (state.activeEditor && event.document === state.activeEditor.document) {
			if (event.contentChanges.length == 1) {
				state.changeRangeOffset = event.contentChanges[0].rangeOffset;
			}
			triggerUpdateDecorations();
			state.changeRangeOffset = undefined;
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeConfiguration(e => {
		if (['markdown.wysiwyg', 'workbench.colorTheme', 'editor.fontSize'].some(c=>e.affectsConfiguration(c))) {
			bootstrap();
		}
	}, null, context.subscriptions);

	vscode.window.onDidChangeTextEditorSelection((e) => {
		if (state.activeEditor) {
			state.selection = e.selections[0];
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions)
}

module.exports = {
	activate,
};