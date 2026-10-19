const assert = require('assert');
const { moveUrlsToDefinitions, applyEdits } = require('../../src/references');

const move = (text, from, to) => applyEdits(text, moveUrlsToDefinitions(text, from, to));

suite('moveUrlsToDefinitions', () => {
	test('links and images get numbered definitions at the end', () => {
		assert.strictEqual(move('A [link](https://a.com) and ![img](a.png "Title").\n'),
			'A [link][1] and ![img][2].\n\n[1]: https://a.com\n[2]: a.png "Title"\n');
	});

	test('a url used twice gets one definition', () => {
		assert.strictEqual(move('[a](u) [b](u)'), '[a][1] [b][1]\n\n[1]: u\n');
	});

	test('existing definitions are reused and kept together', () => {
		assert.strictEqual(move('[a](u) [b](v)\n\n[1]: v\n'), '[a][2] [b][1]\n\n[1]: v\n[2]: u\n');
	});

	test('only links in the range', () => {
		assert.strictEqual(move('[a](u) [b](v)', 8, 8), '[a](u) [b][1]\n\n[1]: v\n');
	});

	test('autolinks, references and code are left alone', () => {
		const text = '<https://x.com> https://y.com [r][1] `[c](d)`\n\n[1]: z\n';
		assert.deepStrictEqual(moveUrlsToDefinitions(text), []);
	});

	test('brackets in code spans, links in images, destinations over lines', () => {
		assert.strictEqual(move('[`a]`](u)'), '[`a]`][1]\n\n[1]: u\n');
		assert.strictEqual(move('[![i](s.png)](h)'), '[![i][2]][1]\n\n[1]: h\n[2]: s.png\n');
		assert.strictEqual(move('[a](\nhttp://x.com\n) b'), '[a][1] b\n\n[1]: http://x.com\n');
		assert.strictEqual(move('[a](<my file.png>)'), '[a][1]\n\n[1]: <my file.png>\n');
	});
});
