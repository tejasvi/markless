/**
 * Large documents are parsed only around the visible lines. The parsed text must start and end
 * between top-level blocks: started inside a ```/~~~ code block or a $$ math block, the parser
 * pairs the fences the wrong way round and renders the text between blocks as code or math (#22).
 */

/**
 * Lines where parsing can safely start: unindented lines after a blank line (or the first line)
 * that are not inside a fenced code block, math block, front matter or html comment.
 * @param {(line: number) => string} lineAt
 * @param {number} lineCount
 * @returns {number[]}
 */
function getBlockStarts(lineAt, lineCount) {
    const starts = [0];
    let closing; // regex matching the line that ends the current fenced block
    let previousBlank = true;
    for (let line = 0; line < lineCount; ++line) {
        const text = lineAt(line);
        if (closing) {
            if (closing.test(text)) {
                closing = undefined;
            }
            previousBlank = false;
            continue;
        }
        if (line > 0 && previousBlank && /^\S/.test(text)) {
            starts.push(line);
        }
        let match;
        if (line === 0 && /^(-{3}|\+{3})\s*$/.test(text)) {
            closing = text[0] === '-' ? /^(-{3}|\.{3})\s*$/ : /^\+{3}\s*$/;
        } else if ((match = /^\s*(`{3,}|~{3,})/.exec(text)) && !(match[1][0] === '`' && text.slice(match.index + match[0].length).includes('`'))) {
            closing = new RegExp(`^\\s*${match[1][0] === '`' ? '`' : '~'}{${match[1].length},}\\s*$`);
        } else if ((match = /^\s*(\${2,})[^$]*$/.exec(text))) {
            closing = new RegExp(`^\\s*\\\${${match[1].length},}\\s*$`);
        } else if (/^\s*<!--/.test(text) && !/-->/.test(text.slice(text.indexOf('<!--') + 4))) {
            closing = /-->/;
        }
        previousBlank = !/\S/.test(text);
    }
    return starts;
}

/**
 * Lines `[start, end)` to parse so that lines `first` to `last` and `margin` lines around them
 * are covered. The range begins at a block start. It also ends at one unless that is more than
 * `margin` lines further: a block cut there is at least `margin` lines away from the visible
 * ones, and an unclosed fence would otherwise drag in the rest of the document.
 * @param {number[]} blockStarts ascending, as returned by getBlockStarts
 * @param {number} lineCount
 * @param {number} first
 * @param {number} last
 * @param {number} margin
 * @returns {[number, number]}
 */
function getParseRange(blockStarts, lineCount, first, last, margin) {
    const from = Math.max(first - margin, 0);
    const to = Math.min(last + margin, lineCount - 1);
    let low = 0, high = blockStarts.length - 1;
    while (low < high) { // last block start <= from
        const mid = (low + high + 1) >> 1;
        if (blockStarts[mid] <= from) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    let next = low + 1;
    while (next < blockStarts.length && blockStarts[next] <= to) {
        ++next;
    }
    const end = next < blockStarts.length ? blockStarts[next] : lineCount;
    return [blockStarts[low], end - to - 1 <= margin ? end : to + 1];
}

module.exports = { getBlockStarts, getParseRange };
