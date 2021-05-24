// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in the code below
const vscode = require('vscode');
const { hideDecoration, transparentDecoration, getUrlDecoration, getSvgDecoration } = require('./common-decorations');
const { state } = require('./state');
const { texToSvg } = require('./texToSvg');
const {  memoize, nodeToHtml, svgToUri, htmlToSvg, DefaultMap } = require('./util');
const { triggerUpdateDecorations, addDecoration, posToRange }  = require('./runner');
const cheerio = require('cheerio');
const { default: axios } = require('axios');

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

function setState(context){
    state.enabled = true;
    state.context = context;
    state.context.subscriptions.push(vscode.commands.registerCommand("markdown.wysiwyg.toggle", toggle));
    state.decorationRanges = new DefaultMap(() => []);
    state.config = vscode.workspace.getConfiguration("markdown.wysiwyg");
    state.darkMode = vscode.window.activeColorTheme.kind == vscode.ColorThemeKind.Dark;
    state.fontSize = vscode.workspace.getConfiguration("editor").get("fontSize", 14);
    state.fontFamily = vscode.workspace.getConfiguration("editor").get("fontFamily", "Courier New");
	if (!state.imageList) state.imageList = [];

    const lineHeight = vscode.workspace.getConfiguration("editor").get("lineHeight", 0);
    // https://github.com/microsoft/vscode/blob/45aafeb326d0d3d56cbc9e2932f87e368dbf652d/src/vs/editor/common/config/fontInfo.ts#L54
    if (lineHeight === 0) {
        state.lineHeight = Math.round(process.platform == "darwin" ? 1.5 : 1.35 * state.fontSize);
    } else if (lineHeight < 8) {
        state.lineHeight = 8;
    }
    state.autoImagePreview = state.config.get('inlineImage.autoPreview');

    state.commentController = vscode.comments.createCommentController("inlineImage", "Show images inline");
    state.context.subscriptions.push(state.commentController);

	// @ts-ignore
	state.types = new Map([
		["heading", ["heading", (() => {
			const getEnlargeDecoration = memoize((size) => vscode.window.createTextEditorDecorationType({
				textDecoration: `; font-size: ${size}px; position: relative; top: 0.3em;`,
			}));
			return (start, end, node) => {
				console.log("Heading node", node);
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
					textDecoration: "none; position: absolute; background: #ffaa00; top: 0.49em; bottom: 0.49em; width: 100%; mix-blend-mode: luminosity;",
				}
			});
			return (start, end) => {
				addDecoration(horizontalRuleDecoration, start, end);
			};
		})()]],
		["quote", ["blockquote", (() => {
			const quoteDecoration = vscode.window.createTextEditorDecorationType({
				textDecoration: "none; filter: drop-shadow(0px 0px 20px);",
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
					console.log("Quote: ", match);
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
						contentText: checked ? "☑" : "☐ ",
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
				console.log("decorate list", listLevel);
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
					const svgUri = svgToUri(texToSvg(texString, display, fontSize, height));
					return getSvgDecoration(svgUri, darkMode);
				});
				return (texString, display, numLines) => _getTexDecoration(texString, display, state.darkMode, state.fontSize, (numLines + 0.5) * state.lineHeight);
			})();
			return (start, end) => {
				const latexText = state.text.slice(start, end);
				const match = /^(\$+)([^]+)\1/.exec(latexText);
				if (!match) return;
				console.log("math", latexText);
				const numLines = 1 + (match[2].match(/\n/g)||[]).length;
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

			context.subscriptions.push(vscode.window.registerWebviewViewProvider("test.webview", {
				resolveWebviewView: (webviewView, webviewContext, _token) => {
					webviewView.webview.options = { enableScripts: true, localResourceRoots: [ context.extensionUri ]};
					const mermaidScriptUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'));
					webviewView.webview.html = `
					<!DOCTYPE html>
					<html lang="en">
						<body>
						<script src="${mermaidScriptUri}"></script> <!-- https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js -->
						<h1>Webview</h1>
						<script>
						console.log("WEBVIEW ENTER");

						const vscode = acquireVsCodeApi();
						vscode.postMessage("WEBVIEW POST FROM WEBVIEW");
						window.addEventListener('message', event => {
							const data = event.data;
							mermaid.mermaidAPI.initialize({
								theme: data.darkMode? "dark":"default",
								fontFamily: data.fontFamily,
								startOnLoad: false
							});
							console.log("init done");
							console.log("WEBVIEW RECIEVE FROM EXTENSION", event)
							vscode.postMessage(mermaid.mermaidAPI.render('mermaid', data.source));
						});

						</script>
						</body>
						</html>
						`;
					webviewView.show();
					webviewView.webview.onDidReceiveMessage(data => {
						console.log("WEBVIEW RECIEVE FROM webview", data);
					}, null, context.subscriptions);
					context.subscriptions.push(
						vscode.commands.registerCommand('test.eval', () => {
							vscode.window.showInputBox().then(s => {
								s = s.replace(/\\n/g, "\n");
								webviewView.webview.postMessage({
									source: s,
									darkMode: false,
									fontFamily: `'Operator Pro', 'Bookerly', Consolas, 'Courier New', monospace`,
								});
							});
						}));
				}
			}, { webviewOptions: {retainContextWhenHidden: true}}));




			const getMermaidDecoration = (() => {
				const _getTexDecoration = memoize(async (source, darkMode, height) => {
					const mermaidSource = JSON.stringify({
						code: source,
						mermaid: {theme: darkMode? "dark":"default"}
					})
					const url = `https://mermaid.ink/svg/${Buffer.from(mermaidSource).toString('base64').replace("+", "-").replace("/", "_")}`;
					const response = await axios.get(url, { responseType: 'arraybuffer' });
					if (response.status != 200) {
						console.log("Can't reach mermaid", source, url);
						return;
					}
					const svgNode = cheerio.load(Buffer.from(response.data, 'binary').toString())('svg');
					const maxWidth = parseFloat(svgNode.css('max-width')) * height / parseFloat(svgNode.attr('height'));
					const svg = svgNode
						.css('max-width', `${maxWidth}px`)
						.attr('height', `${height}px`)
						.attr("preserveAspectRatio", "xMinYMin meet")
						.toString()
					const svgUri = svgToUri(svg);
					console.log("SSSSSSSVVVVGGGG:  ")
					console.log('%c ', `font-size:400px; background:url(${svgUri}) no-repeat; background-size: contain;`);
					return getSvgDecoration(svgUri, darkMode);
				});
				return (source, numLines) => _getTexDecoration(source, state.darkMode, (numLines + 2) * state.lineHeight);
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
					textDecoration: "none; font-size: xx-small; vertical-align: middle;",
				},
			})
			return (start, end) => {
				addDecoration(htmlDecoration, start, end);
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
				const css = `
				table { border-collapse: collapse; }
				td, th { border: ridge; }
				body {
					font-family:${fontFamily.replace(/(?<!\\)"/g, "'")};
					font-size: ${fontSize}px;
				}
				`;
				const numRows = 1 + (html.match(/<tr>/g) || []).length;
				const maxLength = Math.max(...(html.match(/<tr>[^]+?<\/tr>/g) || [""]).map(e => e.replace(/<\/?("[^"]*"|'[^']*'|[^>])*(>|$)/g, "").length));
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
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	setState(context);

	if (state.config.get('hoverImage')) {
		require('./hover-image.js')();
	}
	require('./reveal-line.js')();

	bootstrap();

	vscode.window.onDidChangeTextEditorVisibleRanges(event => {
		console.log("onDidChangeTextEditorVisibleRanges");
		if (state.activeEditor && state.activeEditor.document.lineCount > 500 && event.textEditor.document === state.activeEditor.document) {
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

module.exports = {
	activate,
};