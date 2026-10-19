// The markdown parser, without VS Code dependencies so that it can be tested in node.

const parser = (() => {
    const plugins = (frontmatter) => {
        let processor = require('unified').unified().use(require('remark-parse').default);
        if (frontmatter) {
            processor = processor.use(require('remark-frontmatter').default, ['yaml', 'toml']);
        }
        return processor
            .use(require('remark-gfm').default)
            .use(require('remark-math').default)
            .use(require('remark-highlight-mark').remarkHighlightMark)
            .freeze();
    };
    const processors = [plugins(false), plugins(true)];
    /**
     * Front matter only exists at the start of a document; elsewhere `---` is a horizontal rule.
     * @param {string} text
     * @param {boolean} frontmatter
     */
    return (text, frontmatter) => processors[frontmatter ? 1 : 0].parse(text);
})();

/**
 * Label of a link reference definition as it is matched: case and runs of whitespace do not matter.
 * @param {string} label
 */
function normalizeLabel(label) {
    return label.replace(/[\t\n\r ]+/g, " ").trim().toLowerCase();
}

/**
 * Link reference definitions (`[label]: url`) of a document, found line by line so that the
 * parts of a long document that are parsed on their own can still resolve `[text][label]`.
 * @param {(line: number) => string} lineAt
 * @param {number} lineCount
 * @returns {Map<string, string>} url by normalized label
 */
function getDefinitions(lineAt, lineCount) {
    const definitions = new Map();
    for (let line = 0; line < lineCount; ++line) {
        const match = /^ {0,3}\[((?:[^\\[\]]|\\.)+)\]:[ \t]*(?:<([^>]*)>|(\S+))?/.exec(lineAt(line));
        if (match && !definitions.has(normalizeLabel(match[1]))) {
            definitions.set(normalizeLabel(match[1]), match[2] ?? match[3] ?? "");
        }
    }
    return definitions;
}

module.exports = { parser, normalizeLabel, getDefinitions };
