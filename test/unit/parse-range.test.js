const assert = require('assert');
const { getBlockStarts, getParseRange } = require('../../src/parse-range');

const blockStarts = (text) => {
	const lines = text.split('\n');
	return getBlockStarts(line => lines[line], lines.length);
};

suite('getBlockStarts', () => {
	test('unindented lines after blank lines', () => {
		assert.deepStrictEqual(blockStarts('# a\n\npara\ngraph\n\n- list\n  more\n\n  indented\n\nlast'), [0, 2, 5, 10]);
	});

	test('nothing inside fenced code', () => {
		assert.deepStrictEqual(blockStarts('```js\n\nx\n\n```\n\nafter'), [0, 6]);
		assert.deepStrictEqual(blockStarts('~~~~\n\n```\n\n~~~\n\nstill code\n~~~~\n\nafter'), [0, 9]);
	});

	test('inline code spans are not fences', () => {
		assert.deepStrictEqual(blockStarts('```a``` text\n\nnext'), [0, 2]);
	});

	test('nothing inside math blocks (#22)', () => {
		assert.deepStrictEqual(blockStarts('$$\n\\frac{1}{2}\n\n$$\n\ntext'), [0, 5]);
		assert.deepStrictEqual(blockStarts('$$x$$\n\ntext'), [0, 2]);
	});

	test('nothing inside front matter and html comments', () => {
		assert.deepStrictEqual(blockStarts('---\na: 1\n\nb: 2\n---\n\ntext'), [0, 6]);
		assert.deepStrictEqual(blockStarts('<!--\n\nhidden\n\n-->\n\ntext'), [0, 6]);
	});

	test('nothing inside pre, script, style and textarea blocks', () => {
		assert.deepStrictEqual(blockStarts('<pre>\n\ncode\n\n</pre>\n\ntext'), [0, 6]);
		assert.deepStrictEqual(blockStarts('<script src="x.js"></script>\n\ntext'), [0, 2]);
	});

	test('fences in list items and block quotes', () => {
		assert.deepStrictEqual(blockStarts('- ```bash\n\n  echo\n\n  ```\n\ntext'), [0, 6]);
		assert.deepStrictEqual(blockStarts('> ```\n>\n> x\n> ```\n\ntext'), [0, 5]);
	});

	test('an indented fence inside code does not close it', () => {
		const python = ['```python', 'def f():', '    """', '    ```', '', 'example', '    ```', '    """', '```', '', 'text'];
		assert.deepStrictEqual(blockStarts(python.join('\n')), [0, 10]);
	});
});

suite('getParseRange', () => {
	// 4 lines per block: $$, \frac{1}{2}, $$, Normal text (the document in #22)
	const lines = ['# Title', ''];
	for (let i = 0; i < 300; ++i) lines.push('$$', '\\frac{1}{2}', '$$', 'Normal text', '');
	const starts = getBlockStarts(line => lines[line], lines.length);

	test('starts at a math block, not inside one', () => {
		for (const first of [700, 701, 702, 703, 704, 705]) {
			const [start, end] = getParseRange(starts, lines.length, first, first + 40, 200);
			assert.ok(start <= first - 200 && first - 200 - start < 5, `start ${start} for ${first}`);
			assert.strictEqual(lines[start], '$$');
			assert.ok(end >= first + 240 && end - (first + 240) < 6, `end ${end}`);
			assert.strictEqual(lines[end - 1], '');
		}
	});

	test('covers the document edges', () => {
		assert.deepStrictEqual(getParseRange(starts, lines.length, 0, 40, 200), [0, 242]);
		assert.deepStrictEqual(getParseRange(starts, lines.length, lines.length - 40, lines.length - 1, 200), [1262, lines.length]);
	});

	test('cuts an unclosed fence after the margin', () => {
		const open = ['text', '', '```', ...Array(1000).fill('code')];
		const openStarts = getBlockStarts(line => open[line], open.length);
		assert.deepStrictEqual(getParseRange(openStarts, open.length, 500, 540, 200), [2, 741]);
	});
});
