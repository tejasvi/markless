const vscode = require('vscode');
const { hiddenText, hideDecoration, transparentDecoration, getUrlDecoration, getImageDecorations, hasImageDecorations, createDecorationType, disposeDecorationTypes, imageCount } = require('./common-decorations');
const { moveUrlsToDefinitions, closingBracket } = require('./references');
const { state } = require('./state');
const { memoize, nodeToHtml, svgToUri, htmlToSvg, texToSvg, enableHoverImage, urlToUri, tagRegEx, parseImgTag } = require('./util');
const { triggerUpdateDecorations, addDecoration, addDecorationRange, posToRange, clearDecorations, removeInlineImages, imageThreadMap } = require('./runner');
const { toString } = require('mdast-util-to-string');
const { registerMermaidRenderer, renderMermaid } = require('./mermaid');

function enableLineRevealAsSignature(context) {
    context.subscriptions.push(vscode.languages.registerSignatureHelpProvider('markdown', {
        provideSignatureHelp: (document, position) => {
            if (!state.activeEditor) return;
            // console.log('Signature Help');
            const cursorPosition = state.activeEditor.selection.active;
            // Math does not span paragraphs: look between the blank lines around the cursor
            let firstLine = cursorPosition.line, lastLine = cursorPosition.line;
            while (firstLine > 0 && cursorPosition.line - firstLine < 50 && !document.lineAt(firstLine - 1).isEmptyOrWhitespace) firstLine--;
            while (lastLine < document.lineCount - 1 && lastLine - cursorPosition.line < 50 && !document.lineAt(lastLine + 1).isEmptyOrWhitespace) lastLine++;
            const blockStart = document.offsetAt(new vscode.Position(firstLine, 0));
            const text = document.getText(new vscode.Range(firstLine, 0, lastLine + 1, 0));

            let latexElement = undefined;
            let start = document.offsetAt(cursorPosition) - blockStart + 2;
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

/**
 * Lines wrap by their whole text, hidden link urls included, so long links leave lines short
 * (#19). This moves urls to reference definitions at the end of the document, for the links in a
 * range or the whole document.
 */
function enableMoveUrls(context) {
	const move = async (uri, range) => {
		const editor = uri ? vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString()) : vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== "markdown") return;
		const document = editor.document;
		range = range || (editor.selection.isEmpty ? undefined : editor.selection);
		const edits = moveUrlsToDefinitions(document.getText(), range && document.offsetAt(range.start), range && document.offsetAt(range.end));
		if (!edits.length) {
			vscode.window.showInformationMessage("Markless: no link URLs to move here.");
			return;
		}
		await editor.edit(builder => {
			for (const edit of edits) {
				builder.replace(new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end)), edit.text);
			}
		});
	};
	context.subscriptions.push(vscode.commands.registerCommand("markless.moveUrlsToDefinitions", move));
	context.subscriptions.push(vscode.languages.registerCodeActionsProvider("markdown", {
		provideCodeActions: (document, range) => {
			// Offered on links written as [text](url)
			const line = document.lineAt(range.start.line).text;
			const onLink = [...line.matchAll(/!?\[[^\]]*\]\([^)]*\)/g)].some(match => match.index <= range.start.character && range.start.character <= match.index + match[0].length);
			if (!onLink) return;
			const action = (title, moveRange) => {
				const codeAction = new vscode.CodeAction(title, vscode.CodeActionKind.RefactorRewrite);
				codeAction.command = { title, command: "markless.moveUrlsToDefinitions", arguments: [document.uri, moveRange] };
				return codeAction;
			};
			// VS Code's "Extract to link definition" moves one url
			return [action("Move all link URLs to the end of the document", new vscode.Range(0, 0, document.lineCount, 0))];
		}
	}, { providedCodeActionKinds: [vscode.CodeActionKind.RefactorRewrite] }));
}

function toggle() {
	if (state.enabled) {
		state.enabled = false;
		clearDecorations();
		removeInlineImages();
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
    const regEx = new RegExp(tagRegEx.source, "g");
    let match;
    while ((match = regEx.exec(text))) {
        callback(start + match.index, start + match.index + match[0].length, match[0]);
    }
}

/**
 * Offsets `[from, to]` of each line of a node, from the column the node starts in: markers of
 * containers in front of it (like `> `) stay visible.
 */
function lineSpans(start, end) {
    const column = start - (state.text.lastIndexOf("\n", start - 1) + 1);
    const spans = [];
    for (let lineStart = start - column; lineStart <= end; ) {
        const newline = state.text.indexOf("\n", lineStart);
        const lineEnd = newline === -1 || newline > end ? end : newline;
        spans.push([spans.length ? Math.min(lineStart + column, lineEnd) : start, lineEnd]);
        if (newline === -1 || newline >= end) break;
        lineStart = newline + 1;
    }
    return spans;
}

/**
 * Show an image made of one decoration per line over a node; the cursor in the node reveals it.
 */
function addImage(decorations, start, end) {
    lineSpans(start, end).forEach(([from, to], line) => {
        if (decorations[line]) {
            addDecoration(decorations[line], from, to, start, end);
        }
    });
}

/**
 * Make the decorators for the current settings and theme.
 * @param {boolean} [removeImages] also recreate the image previews
 */
function bootstrap(removeImages) {
	clearDecorations();
	disposeDecorationTypes();
	if (removeImages) {
		removeInlineImages();
	}
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
				const decoration = createDecorationType({
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
			const horizontalRuleDecoration = createDecorationType({
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
			const quoteDecoration = createDecorationType({
				textDecoration: "none; filter: drop-shadow(0px 0px 40px);",
			});
			const quoteBarDecoration = createDecorationType({
				color: "transparent",
				before: {
					contentText: "",
					textDecoration: "none; position: absolute; background: #ffaa00; top: -0.2em; bottom: -0.2em; width: 3px; border-radius: 99px; mix-blend-mode: luminosity;",
				}
			});
			state.persistentDecorations.add(quoteDecoration);
			return (start, end) => {
				addDecoration(quoteDecoration, start, end);
				// The `>` of every line is in the column of the first one, also in nested lists
				const column = start - (state.text.lastIndexOf("\n", start - 1) + 1);
				for (let lineStart = start - column; lineStart < end; lineStart = state.text.indexOf("\n", lineStart) + 1 || end) {
					const lineEnd = state.text.indexOf("\n", lineStart);
					if (state.text[lineStart + column] === ">") {
						addDecoration(quoteBarDecoration, lineStart + column, lineStart + column + 1, lineStart, lineEnd === -1 ? end : Math.min(lineEnd, end));
					}
				}
			};
		})()]],
		["list", ["listItem", (() => {
			const getBulletDecoration = memoize((bullet) => {
				return createDecorationType({
					...hiddenText,
					after: {
						contentText: bullet,
						fontWeight: "bold"
					},
				});
			});
			const getCheckedDecoration = memoize((checked) => {
				return createDecorationType({
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
					const decoration = createDecorationType({
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
				const checkbox = node.checked != null && /^(?:[-*+]|\d{1,9}[.)])[ \t]+\[[ xX]\]/.exec(state.text.slice(start, Math.min(_end, start + 20)));
				if (checkbox) {
					// Ordered lists keep their numbers in front of the checkbox
					const checkboxEnd = start + checkbox[0].length;
					addDecoration(getCheckedDecoration(node.checked), list.ordered ? checkboxEnd - 3 : start, checkboxEnd, start, checkboxEnd + 1);
				} else if (!list.ordered && listBullets.length) {
					addDecoration(getBulletDecoration(listBullets[listLevel % listBullets.length]), start, textStart - 1, start, textStart);
				}
				addDecoration(getlistRainbowDecoration(listLevel), textStart, textEnd);
			};
		})()]],
		...(() => {
			const decorate = (start, end, node) => {
				const numLines = node.position.end.line - node.position.start.line + 1;
				const display = node.type === "math" || state.text.startsWith("$$", start);
				// Math is typeset a bit larger than the editor font, whose letters are bigger for its size.
				// Inline math sits on the baseline of the text when it fits in the line.
				const formula = [node.value, display, 1.2 * state.fontSize, numLines * state.lineHeight,
					node.type === "inlineMath" && numLines === 1 ? Math.round(state.lineHeight / 2 + 0.3 * state.fontSize) : undefined];
				addImage(getImageDecorations(JSON.stringify(formula), () => texToSvg(...formula), numLines, state.lineHeight, state.darkMode), start, end);
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
			const highlightDecoration = createDecorationType({
				backgroundColor: new vscode.ThemeColor("markless.highlightBackground"),
			});
			state.persistentDecorations.add(highlightDecoration);
			return (start, end, node) => {
				const [textStart, textEnd] = hideMarkers(start, end, node);
				addDecoration(highlightDecoration, textStart, textEnd);
			};
		})()]],
		["inlineCode", ["inlineCode", (() => {
			const codeDecoration = createDecorationType({
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
			const codeBlockDecoration = createDecorationType({
				isWholeLine: true,
				backgroundColor: new vscode.ThemeColor("textCodeBlock.background"),
			});
			state.persistentDecorations.add(codeBlockDecoration);
			const getLanguageDecoration = memoize((lang) => createDecorationType({
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
			const getErrorDecoration = memoize((message) => createDecorationType({
				after: {
					contentText: ` ⚠ ${message}`,
					color: new vscode.ThemeColor("errorForeground"),
				},
			}));
			// Errors mermaid reported for diagrams; rendered diagrams are images
			const errors = new Map();
			const rendering = new Map();
			return (start, end, node) => {
				if (node.lang !== "mermaid") return;
				const numLines = node.position.end.line - node.position.start.line + 1;
				const diagram = { source: node.value, darkMode: state.darkMode, height: numLines * state.lineHeight, fontFamily: state.fontFamily };
				const key = JSON.stringify(diagram);
				// Ranges are taken now: the text and its offset are another part's when the diagram is ready
				const range = posToRange(start, end);
				const lineRanges = lineSpans(start, end).map(([from, to]) => posToRange(from, to));
				const addResult = () => {
					if (hasImageDecorations(key)) {
						getImageDecorations(key, undefined, numLines, state.lineHeight, false) // Using mermaid theme instead
							.forEach((decoration, line) => lineRanges[line] && addDecorationRange(decoration, lineRanges[line], range));
					} else if (errors.has(key)) {
						addDecorationRange(getErrorDecoration(errors.get(key).message), lineRanges[0], range);
					}
				};
				if (hasImageDecorations(key) || (errors.has(key) && !errors.get(key).retry)) { // Added right away so that diagrams do not flicker while typing
					addResult();
					return;
				}
				if (!rendering.has(key)) {
					errors.delete(key);
					rendering.set(key, renderMermaid(diagram).then(
						svg => getImageDecorations(key, () => svg, numLines, state.lineHeight, false),
						// Errors of the renderer itself are shown too, and the diagram is tried again on the next change
						error => {
							errors.set(key, { message: error.message.split("\n")[0], retry: !error.fromMermaid });
							if (errors.size > 100) {
								errors.delete(errors.keys().next().value);
							}
						},
					).finally(() => rendering.delete(key)));
				}
				const build = state.build;
				return rendering.get(key).then(() => {
					if (state.build === build) {
						addResult();
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
			const htmlDecoration = createDecorationType({
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
		["inlineImage.enabled", ["html", Object.assign((start, end) => {
			// Images in html are previewed like markdown images (#9)
			forEachTag(start, end, (tagStart, tagEnd, tag) => {
				const image = parseImgTag(tag);
				if (image) {
					state.imageList.push([posToRange(tagStart, tagEnd), image.src, image.alt]);
				}
			});
		}, { insideTables: true })]],
		["link", ["image", (start, end) => {
			const altEnd = closingBracket(state.text, start + 2, end);
			if (altEnd === -1 || state.text[altEnd + 1] !== "(") return;
			addDecoration(hideDecoration, start, start + 2);
			addDecoration(getUrlDecoration(true), altEnd, end);
		}]],
		["inlineImage.enabled", ["image", Object.assign((start, end, node) => {
			state.imageList.push([posToRange(start, end), node.url, node.alt || " "]);
		}, { insideTables: true })]],
		// [text][label], [text][] and [text] with a definition elsewhere
		["link", ["linkReference", (start, end, node) => {
			const [textStart, textEnd] = getTextOffsets(start, end, node);
			if (state.text[start] !== "[" || textStart === start) return;
			addDecoration(hideDecoration, start, textStart);
			addDecoration(getUrlDecoration(false), textEnd, end);
		}]],
		["link", ["imageReference", (start, end) => {
			const altEnd = closingBracket(state.text, start + 2, end);
			if (altEnd === -1) return;
			addDecoration(hideDecoration, start, start + 2);
			addDecoration(getUrlDecoration(true), altEnd, end);
		}]],
		["inlineImage.enabled", ["imageReference", Object.assign((start, end, node) => {
			const url = state.definitions.urls.get(node.identifier);
			if (url) {
				state.imageList.push([posToRange(start, end), url, node.alt || " "]);
			}
		}, { insideTables: true })]],
		["emphasis", ["delete", (() => {
			const strikeDecoration = createDecorationType({
				textDecoration: "line-through"
			});
			return (start, end, node) => {
				const [textStart, textEnd] = hideMarkers(start, end, node);
				addDecoration(strikeDecoration, textStart, textEnd);
			};
		})()]],
		["table", ["table", (() => {
			// Columns are sized by counting characters; wide (CJK, emoji) ones count twice.
			const textWidth = (text) => [...text].reduce((width, c) => width + (/\p{Emoji_Presentation}|[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}]/u.test(c) ? 2 : 1), 0);
			const makeTable = (html, numRows, numChars, numColumns, darkMode, fontFamily, fontSize, lineHeight) => {
				// The header row also covers the delimiter row so that each row is drawn over its own line
				const css = `
				table { border-collapse: collapse; }
				th { border-bottom : groove; height: ${2 * lineHeight}px; }
				td { border-bottom : inset; height: ${lineHeight}px; }
				td, th { padding: 0 0.5em; box-sizing: border-box; white-space: nowrap; }
				mark { color: inherit; background: ${darkMode ? "rgba(0, 40, 255, 0.3)" : "rgba(255, 242, 0, 0.5)"}; } /* inverted in dark themes */
				body {
					margin: 0;
					font-family:${fontFamily.replace(/(?<!\\)"/g, "'")};
					font-size: ${fontSize*0.9}px;
				}
				`;
				const width = Math.ceil((numChars * 0.65 + numColumns) * fontSize * 0.9) + 2;
				return htmlToSvg((numRows + 1) * lineHeight, width, html, css);
			};
			return (start, end, node) => {
				const html = nodeToHtml(node);
				const columnWidths = [];
				for (const row of node.children) {
					row.children.forEach((cell, column) => {
						columnWidths[column] = Math.max(columnWidths[column] || 0, textWidth(toString(cell)));
					});
				}
				const numChars = columnWidths.reduce((acc, cur) => acc + cur, 0);
				const table = [html, node.children.length, numChars, columnWidths.length, state.darkMode, state.fontFamily, state.fontSize, state.lineHeight];
				addImage(getImageDecorations(JSON.stringify(table), () => makeTable(...table), node.children.length + 1, state.lineHeight, state.darkMode), start, end);
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
	enableMoveUrls(context);
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
			state.build = undefined; // parse again when coming back
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
			bootstrap(e.affectsConfiguration("markless.inlineImage"));
		}
	}, null, context.subscriptions);

	vscode.window.onDidChangeActiveColorTheme(() => bootstrap(), null, context.subscriptions);

	vscode.window.onDidChangeTextEditorSelection((e) => {
		if (state.activeEditor && e.textEditor === state.activeEditor) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions)

	if (context.extensionMode === vscode.ExtensionMode.Test) {
		return { state, hideDecoration, imageThreadMap, getLineHeight, urlToUri, imageCount };
	}
}

module.exports = {
	activate,
};
