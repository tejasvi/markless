const vscode = require('vscode');
const { hiddenText, hideDecoration, transparentDecoration, getUrlDecoration, getSvgDecoration } = require('./common-decorations');
const { state } = require('./state');
const { memoize, nodeToHtml, svgToUri, htmlToSvg, texToSvg, enableHoverImage, cleanUrl, urlToUri } = require('./util');
const { triggerUpdateDecorations, addDecoration, posToRange, clearDecorations, imageThreadMap } = require('./runner');
const { registerMermaidRenderer, renderMermaid } = require('./mermaid');

function enableLineRevealAsSignature(context) {
    context.subscriptions.push(vscode.languages.registerSignatureHelpProvider('markdown', {
        provideSignatureHelp: (document, position) => {
            if (!state.activeEditor) return;
            // console.log('Signature Help');
            const cursorPosition = state.activeEditor.selection.active;
            const text = document.getText();

            let latexElement = undefined;
            let start = document.offsetAt(cursorPosition)+2;
            let end = start-3;
            while (--start > 0) {
                if (text[start-1] === '$' && text[start] !== ' ') {
                    while (++end < text.length) {
                        if (text[end] === '$' && text[end-1] !== ' ') {
                            if (start < end) {
                                const svg = texToSvg(text.slice(start, end), true, 2 * state.fontSize);
                                latexElement = `![latexPreview](${svgToUri(state.darkMode ? svg.replace(/^<svg /, '<svg color="white" ') : svg)})`;
                            }
                            break;
                        }
                    }
                    break;
                }
            }

            const lineText = document.lineAt(cursorPosition).text
                .replace(new RegExp(`(?<=^.{${position.character}})`), "█");
            const ms = new vscode.MarkdownString(latexElement);
            ms.isTrusted = true;
            if (!latexElement) {
                ms.appendCodeblock(lineText, "markdown");
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

function toggle() {
	if (state.enabled) {
		clearDecorations();
		state.enabled = false;
	} else {
		state.enabled = true;
		triggerUpdateDecorations();
	}
}

// BareFontInfo._create in https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/config/fontInfo.ts
function getLineHeight(lineHeight, fontSize) {
    if (lineHeight === 0) {
        lineHeight = (process.platform == "darwin" ? 1.5 : 1.35) * fontSize;
    } else if (lineHeight < 8) {
        lineHeight = lineHeight * fontSize;
    }
    return Math.max(8, Math.round(lineHeight));
}

/**
 * Offsets of the text between the markers of an inline node like `**text**`.
 */
function getTextOffsets(start, end, node) {
    if (!node.children || node.children.length === 0) return [start, end];
    return [node.children[0].position.start.offset, node.children[node.children.length - 1].position.end.offset];
}

function hideMarkers(start, end, node) {
    const [textStart, textEnd] = getTextOffsets(start, end, node);
    if (start < textStart) {
        addDecoration(hideDecoration, start, textStart);
    }
    if (textEnd < end) {
        addDecoration(hideDecoration, textEnd, end);
    }
    return [textStart, textEnd];
}

/**
 * Call `callback(tagStart, tagEnd, tag)` for the tags and comments of an html node.
 */
function forEachTag(start, end, callback) {
    const text = state.text.slice(start, end);
    const tagRegEx = /<!--[^]*?-->|<\/?[a-zA-Z][^>]*>/g;
    let match;
    while ((match = tagRegEx.exec(text))) {
        callback(start + match.index, start + match.index + match[0].length, match[0]);
    }
}

/**
 * Offset of the `]` closing the `[` just before `from` in the parsed text.
 */
function closingBracket(from) {
    let depth = 0;
    for (let i = from; i < state.text.length; i++) {
        if (state.text[i] === '\\') {
            i++;
        } else if (state.text[i] === '[') {
            depth++;
        } else if (state.text[i] === ']' && depth-- === 0) {
            return i;
        }
    }
    return -1;
}

function bootstrap() {
	clearDecorations();
    state.config = vscode.workspace.getConfiguration("markless");
    state.darkMode = [vscode.ColorThemeKind.Dark, vscode.ColorThemeKind.HighContrast].includes(vscode.window.activeColorTheme.kind);
    const editorConfig = vscode.workspace.getConfiguration("editor", { languageId: "markdown" });
    state.fontSize = editorConfig.get("fontSize", 14);
    state.fontFamily = editorConfig.get("fontFamily", "Courier New");
    state.lineHeight = getLineHeight(editorConfig.get("lineHeight", 0), state.fontSize);
    state.autoImagePreview = state.config.get('inlineImage.autoPreview');
    state.persistentDecorations.clear();

	const decorators = [
		["heading", ["heading", (() => {
			const getEnlargeDecoration = memoize((size) => {
				const decoration = vscode.window.createTextEditorDecorationType({
					textDecoration: `; font-size: ${size}px; position: relative; top: 0.1em;`,
					letterSpacing: "inherit", // see hiddenText
				});
				state.persistentDecorations.add(decoration); // the line does not change size as the cursor moves
				return decoration;
			});
			return (start, end, node) => {
				// console.log("Heading node", node);
				if (node.children.length === 0) return;
				// Hides `## ` (and closing `##`) of atx headings and the underline of setext headings
				const [textStart, textEnd] = hideMarkers(start, end, node);
				addDecoration(getEnlargeDecoration(Math.max(state.fontSize, 5 * state.fontSize / (2 + node.depth))), textStart, textEnd);
			};
		})()]],
		["horizontalRule", ["thematicBreak", (() => {
			const horizontalRuleDecoration = vscode.window.createTextEditorDecorationType({
				...hiddenText,
				before: {
					contentText: "",
					textDecoration: "none; position: absolute; background: #ffaa00; top: 0.49em; bottom: 0.49em; width: 100vw; mix-blend-mode: luminosity; border: outset;",
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
			state.persistentDecorations.add(quoteDecoration);
			return (start, end) => {
				addDecoration(quoteDecoration, start, end);
				const text = state.text.slice(start, end);
				const regEx = /^ {0,3}>/mg;
				let match;
				while ((match = regEx.exec(text))) {
					// console.log("Quote: ", match);
					const barStart = start + match.index + match[0].length - 1;
					const lineEnd = text.indexOf("\n", match.index);
					addDecoration(quoteBarDecoration, barStart, barStart + 1, start + match.index, lineEnd === -1 ? end : start + lineEnd);
				}
			};
		})()]],
		["list", ["listItem", (() => {
			const getBulletDecoration = memoize((bullet) => {
				return vscode.window.createTextEditorDecorationType({
					...hiddenText,
					after: {
						contentText: bullet,
						fontWeight: "bold"
					},
				});
			});
			const getCheckedDecoration = memoize((checked) => {
				return vscode.window.createTextEditorDecorationType({
					...hiddenText,
					after: {
						contentText: checked ? "☑" : "☐",
						fontWeight: "bold"
					},
				});
			});
			const getlistRainbowDecoration = (() => {
				const hueRotationMultiplier = [0, 5, 9, 2, 6, 7];
				const getNonCyclicDecoration = memoize((level) => {
					const decoration = vscode.window.createTextEditorDecorationType({
						textDecoration: (`; filter: hue-rotate(${hueRotationMultiplier[level] * 360 / 12}deg);`),
					});
					state.persistentDecorations.add(decoration);
					return decoration;
				});
				return (level) => {
					level = level % hueRotationMultiplier.length;
					return getNonCyclicDecoration(level);
				};
			})();
			const listBullets = state.config.get("listBullets") || [];
			return (start, _end, node, listLevel, list) => {
				// console.log("decorate list", listLevel);
				if (node.children.length === 0) return;
				const textPosition = node.children[0].position;
				const textStart = textPosition.start.offset;
				const textEnd = textPosition.end.offset;
				if (node.checked != null) {
					// Ordered lists keep their numbers in front of the checkbox
					const checkboxStart = list.ordered ? state.text.indexOf("[", start) : start;
					addDecoration(getCheckedDecoration(node.checked), checkboxStart, textStart - 1, start, textStart);
				} else if (!list.ordered && listBullets.length) {
					addDecoration(getBulletDecoration(listBullets[listLevel % listBullets.length]), start, textStart - 1, start, textStart);
				}
				addDecoration(getlistRainbowDecoration(listLevel), textStart, textEnd);
			};
		})()]],
		...(() => {
			const getTexDecoration = memoize((texString, display, darkMode, fontSize, height, baseline) => {
				const svgUri = svgToUri(texToSvg(texString, display, fontSize, height, baseline));
				return getSvgDecoration(svgUri, darkMode);
			});
			const decorate = (start, end, node) => {
				const numLines = node.position.end.line - node.position.start.line + 1;
				const display = node.type === "math" || state.text.startsWith("$$", start);
				// Math is typeset a bit larger than the editor font, whose letters are bigger for its size.
				// Inline math sits on the baseline of the text when it fits in the line.
				addDecoration(getTexDecoration(node.value, display, state.darkMode, 1.2 * state.fontSize, numLines * state.lineHeight,
					node.type === "inlineMath" && numLines === 1 ? Math.round(state.lineHeight / 2 + 0.3 * state.fontSize) : undefined), start, end);
			};
			return [["latex", ["math", decorate]], ["latex", ["inlineMath", decorate]]];
		})(),
		["emphasis", ["emphasis", (start, end, node) => {
			hideMarkers(start, end, node);
		}]],
		["emphasis", ["strong", (start, end, node) => {
			hideMarkers(start, end, node);
		}]],
		["highlight", ["highlight", (() => {
			const highlightDecoration = vscode.window.createTextEditorDecorationType({
				backgroundColor: new vscode.ThemeColor("markless.highlightBackground"),
			});
			state.persistentDecorations.add(highlightDecoration);
			return (start, end, node) => {
				const [textStart, textEnd] = hideMarkers(start, end, node);
				addDecoration(highlightDecoration, textStart, textEnd);
			};
		})()]],
		["inlineCode", ["inlineCode", (() => {
			const codeDecoration = vscode.window.createTextEditorDecorationType({
				// outline: "1px dotted"
				border: "outset",
				borderRadius: "5px",
			})
			return (start, end) => {
				const text = state.text.slice(start, end);
				const ticks = /^`+/.exec(text)[0].length;
				addDecoration(codeDecoration, start, end);
				addDecoration(transparentDecoration, start, start + ticks);
				addDecoration(transparentDecoration, end - ticks, end);
			};
		})()]],
		["codeBlock", ["code", (() => {
			const codeBlockDecoration = vscode.window.createTextEditorDecorationType({
				isWholeLine: true,
				backgroundColor: new vscode.ThemeColor("textCodeBlock.background"),
			});
			state.persistentDecorations.add(codeBlockDecoration);
			const getLanguageDecoration = memoize((lang) => vscode.window.createTextEditorDecorationType({
				...hiddenText,
				after: {
					contentText: lang,
					color: new vscode.ThemeColor("descriptionForeground"),
					fontStyle: "italic",
				},
			}));
			return (start, end, node) => {
				if (node.lang === "mermaid" && state.config.get("mermaid")) return;
				addDecoration(codeBlockDecoration, start, end);
				const text = state.text.slice(start, end);
				const fence = /^ {0,3}(`{3,}|~{3,})/.exec(text);
				if (!fence) return; // indented code block
				const firstLineEnd = text.includes("\n") ? text.indexOf("\n") : text.length;
				addDecoration(node.lang ? getLanguageDecoration(node.lang) : hideDecoration, start, start + firstLineEnd);
				const closingFence = new RegExp(`\\n[ \\t>]*${fence[1][0]}{${fence[1].length},}[ \\t]*$`).exec(text); // also nested in lists and quotes
				if (closingFence) {
					addDecoration(hideDecoration, start + closingFence.index + 1, end);
				}
			};
		})()]],
		["mermaid", ["code", (() => {
			const getErrorDecoration = memoize((message) => vscode.window.createTextEditorDecorationType({
				after: {
					contentText: ` ⚠ ${message}`,
					color: new vscode.ThemeColor("errorForeground"),
				},
			}));
			// Rendered diagrams and the errors mermaid reported for them
			const results = new Map();
			const rendering = new Map();
			return (start, end, node) => {
				if (node.lang !== "mermaid") return;
				const text = state.text.slice(start, end);
				const firstLineEnd = start + (text.includes("\n") ? text.indexOf("\n") : text.length);
				const numLines = node.position.end.line - node.position.start.line + 1;
				const diagram = { source: node.value, darkMode: state.darkMode, height: numLines * state.lineHeight, fontFamily: state.fontFamily };
				const key = JSON.stringify(diagram);
				const addResult = (result) => {
					if (result.decoration) {
						addDecoration(result.decoration, start, end, start, end);
					} else {
						addDecoration(getErrorDecoration(result.error), start, firstLineEnd, start, end);
					}
				};
				if (results.has(key)) { // Added right away so that diagrams do not flicker while typing
					addResult(results.get(key));
					return;
				}
				if (!rendering.has(key)) {
					rendering.set(key, renderMermaid(diagram).then(
						svg => results.set(key, { decoration: getSvgDecoration(svgToUri(svg), false) }), // Using mermaid theme instead
						error => error.fromMermaid ? results.set(key, { error: error.message.split("\n")[0] }) : console.error("Markless:", error),
					).finally(() => rendering.delete(key)));
				}
				const build = state.build;
				return rendering.get(key).then(() => {
					if (state.build === build && results.has(key)) {
						addResult(results.get(key));
					}
				});
			};
		})()]],
		["link", ["link", (start, end, node) => {
			if (state.text[start] !== "[") return; // autolink
			const [textStart, textEnd] = getTextOffsets(start, end, node);
			if (state.text[textEnd] !== "]" || state.text[textEnd + 1] !== "(") return; // not an inline link
			addDecoration(hideDecoration, start, textStart);
			addDecoration(getUrlDecoration(false), textEnd, end);
		}]],
		["html", ["html", (() => {
			const htmlDecoration = vscode.window.createTextEditorDecorationType({
				...hiddenText,
				before: {
					contentText: "</>",
					fontWeight: "bold",
					textDecoration: "none; font-size: small; vertical-align: middle;",
					color: "cyan"
				},
			});
			return (start, end) => {
				// Each tag is replaced by an icon
				forEachTag(start, end, (tagStart, tagEnd, tag) => {
					addDecoration(/^<img\s/i.test(tag) ? getUrlDecoration(true) : htmlDecoration, tagStart, tagEnd, tagStart, tagEnd);
				});
			}
		})()]],
		["inlineImage.enabled", ["html", (start, end) => {
			// Images in html are previewed like markdown images (#9)
			forEachTag(start, end, (tagStart, tagEnd, tag) => {
				const image = /^<img\s[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
				if (!image) return;
				const alt = /\salt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
				state.imageList.push([posToRange(tagStart, tagEnd), cleanUrl(image[1] || image[2] || image[3]), (alt && (alt[1] || alt[2])) || " "]);
			});
		}]],
		["link", ["image", (start, end) => {
			const altEnd = closingBracket(start + 2);
			if (altEnd === -1) return;
			addDecoration(hideDecoration, start, start + 2);
			addDecoration(getUrlDecoration(true), altEnd, end);
		}]],
		["inlineImage.enabled", ["image", (start, end, node) => {
			state.imageList.push([posToRange(start, end), node.url, node.alt || " "]);
		}]],
		["emphasis", ["delete", (() => {
			const strikeDecoration = vscode.window.createTextEditorDecorationType({
				textDecoration: "line-through"
			});
			return (start, end, node) => {
				const [textStart, textEnd] = hideMarkers(start, end, node);
				addDecoration(strikeDecoration, textStart, textEnd);
			};
		})()]],
		["table", ["table", (() => {
			// Columns are sized by counting characters; wide (CJK, emoji) ones count twice.
			const textWidth = (text) => [...text].reduce((width, c) => width + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u.test(c) ? 2 : 1), 0);
			const getTableDecoration = memoize((html, numRows, numChars, numColumns, darkMode, fontFamily, fontSize, lineHeight) => {
				// The header row also covers the delimiter row so that each row is drawn over its own line
				const css = `
				table { border-collapse: collapse; }
				th { border-bottom : groove; height: ${2 * lineHeight}px; }
				td { border-bottom : inset; height: ${lineHeight}px; }
				td, th { padding: 0 0.5em; box-sizing: border-box; white-space: nowrap; }
				body {
					margin: 0;
					font-family:${fontFamily.replace(/(?<!\\)"/g, "'")};
					font-size: ${fontSize*0.9}px;
				}
				`;
				const width = Math.ceil((numChars * 0.65 + numColumns) * fontSize * 0.9) + 2;
				const tableUri = svgToUri(htmlToSvg((numRows + 1) * lineHeight, width, html, css));
				return getSvgDecoration(tableUri, darkMode);
			});
			return (start, end, node) => {
				const html = nodeToHtml(node);
				const columnWidths = [];
				for (const row of node.children) {
					row.children.forEach((cell, column) => {
						const cellText = state.text.slice(cell.position.start.offset, cell.position.end.offset).replace(/^\|/, "").replace(/\|$/, "").trim();
						columnWidths[column] = Math.max(columnWidths[column] || 0, textWidth(cellText));
					});
				}
				const numChars = columnWidths.reduce((acc, cur) => acc + cur, 0);
				addDecoration(getTableDecoration(html, node.children.length, numChars, columnWidths.length, state.darkMode, state.fontFamily, state.fontSize, state.lineHeight), start, end);
			};
		})()]]
	];
	state.types = new Map();
	for (const [setting, [type, decorate]] of decorators) {
		if (!state.config.get(setting)) continue;
		if (!state.types.has(type)) {
			state.types.set(type, []);
		}
		state.types.get(type).push(decorate);
	}

	const editor = vscode.window.activeTextEditor;
	state.activeEditor = editor && editor.document.languageId == "markdown" ? editor : undefined;
	triggerUpdateDecorations();
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	state.context = context;
	state.enabled = true;
	registerMermaidRenderer(context);
	enableHoverImage(context);
	enableLineRevealAsSignature(context);
    context.subscriptions.push(vscode.commands.registerCommand("markless.toggle", toggle));
	state.imageList = [];
    state.commentController = vscode.comments.createCommentController("inlineImage", "Show images inline");
    context.subscriptions.push(state.commentController);
	bootstrap();

	vscode.window.onDidChangeTextEditorVisibleRanges(event => {
		// console.log("onDidChangeTextEditorVisibleRanges");
		if (state.activeEditor && state.activeEditor.document.lineCount > 500 && event.textEditor === state.activeEditor) {
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

	// Also fired when the language of a document changes (#20)
	vscode.workspace.onDidOpenTextDocument(document => {
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document === document) {
			if (document.languageId == "markdown") {
				state.activeEditor = editor;
			}
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		// console.log("onDidChangeTextDocument");
		if (state.activeEditor && event.document === state.activeEditor.document) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeConfiguration(e => {
		if (['markless', 'editor.fontSize', 'editor.fontFamily', 'editor.lineHeight'].some(c=>e.affectsConfiguration(c, { languageId: "markdown" }))) {
			bootstrap();
		}
	}, null, context.subscriptions);

	vscode.window.onDidChangeActiveColorTheme(() => bootstrap(), null, context.subscriptions);

	vscode.window.onDidChangeTextEditorSelection((e) => {
		if (state.activeEditor && e.textEditor === state.activeEditor) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions)

	if (context.extensionMode === vscode.ExtensionMode.Test) {
		return { state, hideDecoration, imageThreadMap, getLineHeight, urlToUri };
	}
}

module.exports = {
	activate,
};
