const assert = require('assert');
const path = require('path');
const vscode = require('vscode');

const fixtures = path.resolve(__dirname, '../fixtures');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const global = vscode.ConfigurationTarget.Global;

/** @type {any} */
let api;

async function waitFor(condition, what, timeout = 10000) {
	for (const start = Date.now(); Date.now() - start < timeout; await sleep(50)) {
		if (condition()) return;
	}
	throw new Error(`Timed out waiting for ${what}`);
}

/**
 * Show the document with the cursor on `line` and wait for its decorations.
 */
async function show(document, line = document.lineCount - 1) {
	const editor = await vscode.window.showTextDocument(document);
	editor.selection = new vscode.Selection(line, 0, line, 0);
	await waitFor(() => api.state.build && api.state.build.editor === editor && api.state.build.key.split(' ')[1] === String(document.version), 'decorations');
	return editor;
}

async function rebuilt(change) {
	const build = api.state.build;
	await change();
	await waitFor(() => api.state.build && api.state.build !== build, 'decorations to update');
}

/**
 * Decorated ranges, all of them or those of one decoration.
 * @returns {vscode.Range[]}
 */
function ranges(decoration) {
	const entries = decoration ? [api.state.decorationRanges.get(decoration) || []] : [...api.state.decorationRanges.values()];
	return entries.flatMap(list => list.map(([range]) => range));
}

/**
 * Whether each line from `first` to `last` has a decoration of its own from `column` to its end,
 * as an image cut into one slice per line has.
 */
function sliced(document, first, last, column = 0) {
	for (let line = first; line <= last; line++) {
		if (!ranges().some(r => r.isEqual(new vscode.Range(line, column, line, document.lineAt(line).text.length)))) return false;
	}
	return true;
}

const covers = (range, line, character) => {
	const position = new vscode.Position(line, character);
	return range.start.isBeforeOrEqual(position) && position.isBefore(range.end);
};

suite('Markless', () => {
	suiteSetup(async () => {
		api = await vscode.extensions.getExtension('tejasvi.markless').activate();
	});

	suite('Rendering', () => {
		/** @type {vscode.TextDocument} */
		let document;
		suiteSetup(async () => {
			document = await vscode.workspace.openTextDocument(path.join(fixtures, 'notes/sub/issues.md'));
			await show(document);
		});

		test('front matter is left as it is (#11, #16)', () => {
			assert.deepStrictEqual(ranges().filter(r => r.start.line <= 4), []);
		});

		test('heading markers are hidden, heading text is not', () => {
			const hidden = ranges(api.hideDecoration);
			assert.ok(hidden.some(r => r.isEqual(new vscode.Range(6, 0, 6, 2))));
			// setext heading: the underline is hidden instead of the start of the text
			assert.ok(!hidden.some(r => r.start.line === 8 && r.start.character < 14));
			assert.ok(hidden.some(r => r.isEqual(new vscode.Range(8, 14, 9, 14))));
		});

		test('ordered lists keep their numbers (#7)', () => {
			for (const [line, character] of [[19, 0], [20, 0], [21, 4]]) {
				assert.deepStrictEqual(ranges().filter(r => covers(r, line, character)), [], `line ${line}`);
			}
			assert.ok(ranges().some(r => covers(r, 13, 0)), 'bullet of an unordered list');
		});

		test('list bullets can be kept as typed (#7, #17)', async () => {
			try {
				await rebuilt(() => vscode.workspace.getConfiguration('markless').update('listBullets', [], global));
				assert.deepStrictEqual(ranges().filter(r => covers(r, 13, 0) || covers(r, 14, 4)), []);
			} finally {
				await rebuilt(() => vscode.workspace.getConfiguration('markless').update('listBullets', undefined, global));
			}
			assert.ok(ranges().some(r => covers(r, 13, 0)));
		});

		test('==highlighted text== (#15)', () => {
			const line = document.lineAt(11).text;
			const hidden = ranges(api.hideDecoration);
			for (const start of [line.indexOf('=='), line.lastIndexOf('==')]) {
				assert.ok(hidden.some(r => r.isEqual(new vscode.Range(11, start, 11, start + 2))), `== at ${start}`);
			}
		});

		test('code blocks (#6)', () => {
			assert.ok(ranges().some(r => r.isEqual(new vscode.Range(23, 0, 27, 3))), 'background');
			assert.ok(ranges().some(r => r.isEqual(new vscode.Range(23, 0, 23, 5))), 'opening fence');
			assert.ok(ranges(api.hideDecoration).some(r => r.isEqual(new vscode.Range(27, 0, 27, 3))), 'closing fence');
			assert.ok(ranges(api.hideDecoration).some(r => r.isEqual(new vscode.Range(64, 0, 64, 7))), 'closing fence in a list item');
		});

		test('math and tables, cut into one slice per line so that they stay when scrolled', () => {
			assert.ok(sliced(document, 38, 40), 'display math');
			assert.ok(ranges().some(r => r.isEqual(new vscode.Range(36, 12, 36, 22))), 'inline math');
			assert.ok(sliced(document, 42, 46), 'table');
			// nothing is drawn over a table from the markup in its cells
			assert.deepStrictEqual(ranges().filter(r => r.start.line >= 66).map(r => [r.start.line, r.start.character, r.end.line, r.end.character]), [[66, 0, 66, 9], [67, 0, 67, 9], [68, 0, 68, 40]]);
		});

		test('images are found relative to the markdown file (#9, #12)', () => {
			const threads = [...api.imageThreadMap.get(document.uri.toString()).values()].flat();
			for (const [line, file] of [[50, 'images/pic.png'], [52, 'attachments/att.png']]) {
				const thread = threads.find(t => t.range.start.line === line);
				assert.ok(thread, `preview of line ${line}`);
				const body = thread.comments[0].body;
				assert.strictEqual(body.baseUri.toString(), document.uri.toString());
				// VS Code resolves the relative path against baseUri without decoding it
				const src = /\]\(<([^>]*)>\)/.exec(body.value)[1];
				assert.strictEqual(vscode.Uri.joinPath(document.uri, '..', src).fsPath, path.join(fixtures, file));
			}
		});

		test('image urls', () => {
			const uri = document.uri;
			assert.strictEqual(api.urlToUri('../../images/pic.png', uri).fsPath, path.join(fixtures, 'images/pic.png'));
			assert.strictEqual(api.urlToUri('/images/pic.png', uri).fsPath, path.join(fixtures, 'images/pic.png'));
			assert.strictEqual(api.urlToUri('a%20b.png', uri).fsPath, path.join(fixtures, 'notes/sub/a b.png'));
			assert.strictEqual(api.urlToUri('https://example.com/a.png?x=1', uri).toString(true), 'https://example.com/a.png?x=1');
			assert.strictEqual(api.urlToUri('C:\\images\\a.png', uri).toString(), 'file:///c%3A/images/a.png');
		});

		test('mermaid diagrams (#10)', async () => {
			await waitFor(() => sliced(document, 29, 34), 'the diagram', 30000);
		});

		test('toggle', async () => {
			await vscode.commands.executeCommand('markless.toggle');
			assert.deepStrictEqual(ranges(), []);
			assert.strictEqual(api.imageThreadMap.size, 0);
			await vscode.commands.executeCommand('markless.toggle');
			await waitFor(() => ranges().length > 0 && api.imageThreadMap.size > 0, 'decorations');
		});
	});

	suite('Edge cases', () => {
		/** @type {vscode.TextDocument} */
		let document;
		suiteSetup(async () => {
			document = await vscode.workspace.openTextDocument(path.join(fixtures, 'edge-cases.md'));
			await show(document);
		});
		const threads = () => [...api.imageThreadMap.get(document.uri.toString()).values()].flat();

		test('a bracketed url, which has no position in the tree, does not stop the rendering', () => {
			const hidden = ranges(api.hideDecoration);
			assert.ok(hidden.some(r => r.isEqual(new vscode.Range(2, 30, 2, 32))));
		});

		test('equations with \\tag', () => {
			assert.ok(sliced(document, 4, 6));
		});

		test('task list checkboxes before markup', () => {
			assert.ok(ranges().some(r => r.isEqual(new vscode.Range(8, 0, 8, 5))), '- [ ]');
			assert.ok(ranges().some(r => r.isEqual(new vscode.Range(9, 3, 9, 6))), '[x] after 1.');
		});

		test('<img> attributes', () => {
			const line = threads().filter(t => t.range.start.line === 11);
			assert.strictEqual(line.length, 1, 'the empty src has no preview');
			assert.ok(line[0].comments[0].body.value.includes('(<images/pic with space.png>)'), line[0].comments[0].body.value);
		});

		test('tables: no markup drawn over them, images still previewed', () => {
			const inTable = ranges().filter(r => r.start.line >= 13 && r.start.line <= 15);
			assert.strictEqual(inTable.length, 3);
			assert.ok(sliced(document, 13, 15));
			assert.ok(threads().some(t => t.range.start.line === 15));
		});

		test('reference links and images', () => {
			const hidden = ranges(api.hideDecoration);
			for (const [start, end] of [[10, 11], [25, 27], [47, 48]]) {
				assert.ok(hidden.some(r => r.isEqual(new vscode.Range(27, start, 27, end))), `hidden ${start}`);
			}
			for (const [start, end] of [[19, 23], [36, 42], [53, 54]]) {
				assert.ok(ranges().some(r => r.isEqual(new vscode.Range(27, start, 27, end))), `icon ${start}`);
			}
			const thread = threads().find(t => t.range.start.line === 27);
			assert.ok(thread && thread.comments[0].body.value.includes('(<images/pic.png>)'));
		});

		test('quotes in lists', () => {
			for (const line of [20, 21]) {
				assert.ok(ranges().some(r => r.isEqual(new vscode.Range(line, 4, line, 5))), `line ${line}`);
			}
		});

		test('data: images', () => {
			const thread = threads().find(t => t.range.start.line === 23);
			assert.ok(thread.comments[0].body.value.includes('(<data:image/png;base64,iVBORw0KGgo=>)'));
		});
	});

	test('mermaid diagrams with html in labels, and errors (#10)', async () => {
		const document = await vscode.workspace.openTextDocument(path.join(fixtures, 'mermaid.md'));
		await show(document);
		for (const [start, end] of [[2, 5], [9, 15], [17, 27], [29, 32]]) {
			await waitFor(() => sliced(document, start, end), `the diagram on lines ${start}-${end}`, 30000);
		}
		await waitFor(() => ranges().some(r => r.isEqual(new vscode.Range(34, 0, 34, 10))), 'the error of the invalid diagram', 30000);
	});

	test('moving link URLs to the end of the document (#19)', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'A [link](https://example.com/a/long/path) and ![img](images/pic.png "Title") here.\n' });
		const editor = await show(document);
		await vscode.commands.executeCommand('markless.moveUrlsToDefinitions');
		assert.strictEqual(document.getText(), 'A [link][1] and ![img][2] here.\n\n[1]: https://example.com/a/long/path\n[2]: images/pic.png "Title"\n');
		await waitFor(() => api.state.build && api.state.build.key.split(' ')[1] === String(document.version), 'decorations');
		assert.ok(ranges(api.hideDecoration).some(r => r.isEqual(new vscode.Range(0, 2, 0, 3))));
		const actions = await vscode.commands.executeCommand('vscode.executeCodeActionProvider', document.uri, new vscode.Range(0, 1, 0, 1));
		assert.ok(!actions.some(a => a.title.startsWith('Move')), 'no action once the urls are gone');
		await editor.edit(e => e.insert(new vscode.Position(0, 0), '[x](y) '));
		const offered = await vscode.commands.executeCommand('vscode.executeCodeActionProvider', document.uri, new vscode.Range(0, 2, 0, 2));
		assert.ok(offered.some(a => a.title === 'Move all link URLs to the end of the document'));
	});

	test('references in a long document resolve with definitions outside the parsed part', async () => {
		const lines = ['# Long', ''];
		for (let i = 0; i < 300; i++) lines.push(`Paragraph ${i} with [a reference][r].`, '');
		lines.push('[r]: https://example.com');
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
		const editor = await show(document, 0);
		await rebuilt(() => editor.revealRange(new vscode.Range(300, 0, 300, 0), vscode.TextEditorRevealType.AtTop));
		assert.ok(!api.state.build.key.endsWith(' '), 'parses the visible part only');
		const column = document.lineAt(310).text.indexOf('[');
		assert.ok(ranges(api.hideDecoration).some(r => r.isEqual(new vscode.Range(310, column, 310, column + 1))));
	});

	test('images no longer used are disposed', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: '$$\nx\n$$\n\ntext\n' });
		const editor = await show(document);
		const before = api.imageCount();
		for (let i = 0; i < 10; i++) {
			await rebuilt(() => editor.edit(e => e.insert(new vscode.Position(1, 1), 'x')));
		}
		assert.ok(api.imageCount() <= before + 5, `${api.imageCount()} images`);
	});

	test('large documents render math after line 500 (#22)', async () => {
		const lines = ['# Big document', ''];
		for (let i = 0; i < 150; i++) lines.push('$$', '\\frac{1}{2}', '$$', 'Normal text');
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: lines.join('\n') });
		const editor = await show(document, 0);
		await rebuilt(() => editor.revealRange(new vscode.Range(300, 0, 300, 0), vscode.TextEditorRevealType.AtTop));
		assert.ok(!api.state.build.key.endsWith(' '), 'parses the visible part only');
		for (let line = 290; line < 340; line++) {
			const text = document.lineAt(line).text;
			assert.strictEqual(ranges().some(r => covers(r, line, 0)), text !== 'Normal text', `line ${line}: ${text}`);
		}
	});

	test('documents that stop being markdown lose their decorations (#20)', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: '/passive `\nAssociateFiles=1 `\n**bold**\n' });
		await show(document);
		assert.ok(ranges().length > 0);
		await vscode.languages.setTextDocumentLanguage(document, 'plaintext');
		await waitFor(() => !api.state.activeEditor && ranges().length === 0, 'decorations to clear');
		await vscode.languages.setTextDocumentLanguage(document, 'markdown');
		await waitFor(() => ranges().length > 0, 'decorations to come back');
	});

	test('line height follows the editor settings (#13, #18)', async () => {
		assert.strictEqual(api.getLineHeight(0, 14), process.platform === 'darwin' ? 21 : 19);
		assert.strictEqual(api.getLineHeight(1.5, 14), 21);
		assert.strictEqual(api.getLineHeight(30, 14), 30);
		assert.strictEqual(api.getLineHeight(0, 4), 8);
		try {
			await vscode.workspace.getConfiguration('editor').update('lineHeight', 26, global);
			await waitFor(() => api.state.lineHeight === 26, 'the new line height');
		} finally {
			await vscode.workspace.getConfiguration('editor').update('lineHeight', undefined, global);
		}
		await waitFor(() => api.state.lineHeight === api.getLineHeight(0, api.state.fontSize), 'the default line height');
	});
});
