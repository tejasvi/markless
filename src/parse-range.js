/**
 * Large documents are parsed only around the visible lines. The parsed text must start and end
 * between top-level blocks: started inside a ```/~~~ code block or a $$ math block, the parser
 * pairs the fences the wrong way round and renders the text between blocks as code or math (#22).
 */

/**
 * Lines where parsing can safely start: unindented lines after a blank line (or the first line)
 * that are not inside a fenced code block, math block, front matter, html block or comment.
 * @param {(line: number) => string} lineAt
 * @param {number} lineCount
 * @returns {number[]}
 */
function getBlockStarts(lineAt, lineCount) {
    const starts = [0];
    let closing; // tests for the line that ends the current fenced block
    let previousBlank = true;
    for (let line = 0; line < lineCount; ++line) {
        const text = lineAt(line);
        if (closing) {
            if (closing(text)) {
                closing = undefined;
            }
            previousBlank = false;
            continue;
        }
        if (line > 0 && previousBlank && /^\S/.test(text)) {
            starts.push(line);
        }
        closing = getClosing(text, line);
        previousBlank = !/\S/.test(text);
    }
    return starts;
}

const quoteMarkers = /^(?:[ \t]*>[ \t]?)*/;
// A ```, ~~~ or $$ fence, also after the markers of block quotes and list items
const fence = /^((?:[ \t]*(?:>[ \t]?|(?:[-*+]|\d{1,9}[.)])[ \t]+))*)([ \t]*)(`{3,}|~{3,}|\${2,})(.*)$/;

/**
 * Test for the line that ends the block `text` opens, when that block can contain blank lines.
 * @param {string} text
 * @param {number} line
 * @returns {((text: string) => boolean) | undefined}
 */
function getClosing(text, line) {
    let match;
    if (line === 0 && /^(-{3}|\+{3})\s*$/.test(text)) {
        const end = text[0] === '-' ? /^(-{3}|\.{3})\s*$/ : /^\+{3}\s*$/;
        return t => end.test(t);
    } else if ((match = fence.exec(text))) {
        const [, markers, indent, sequence, info] = match;
        if (sequence[0] !== '~' && info.includes(sequence[0])) return; // inline code or math
        // Closed by a sequence of the same character at least as long, indented less than 4
        // columns more than the opening one (so not by ``` in an indented example inside the code)
        const column = markers.replace(quoteMarkers, "").length + indent.length;
        const end = new RegExp(`^( *)\\${sequence[0]}{${sequence.length},}[ \\t]*$`);
        return t => {
            const closingMatch = end.exec(t.replace(quoteMarkers, ""));
            return Boolean(closingMatch) && closingMatch[1].length <= column + 3;
        };
    } else if ((match = /^ {0,3}<(pre|script|style|textarea)(?=[\s>]|$)/i.exec(text)) && !new RegExp(`</${match[1]}>`, "i").test(text)) {
        const end = new RegExp(`</${match[1]}>`, "i");
        return t => end.test(t);
    } else if (/^\s*<!--/.test(text) && !/-->/.test(text.slice(text.indexOf('<!--') + 4))) {
        return t => /-->/.test(t);
    }
}

/**
 * Lines `[start, end)` to parse so that lines `first` to `last`, `margin` lines before them and
 * `marginAfter` lines after them are covered. The range begins at a block start. It also ends at
 * one unless that is more than `marginAfter` lines further: a block cut there is that far from
 * the visible lines, and an unclosed fence would otherwise drag in the rest of the document.
 * @param {number[]} blockStarts ascending, as returned by getBlockStarts
 * @param {number} lineCount
 * @param {number} first
 * @param {number} last
 * @param {number} margin
 * @param {number} [marginAfter]
 * @returns {[number, number]}
 */
function getParseRange(blockStarts, lineCount, first, last, margin, marginAfter = margin) {
    const from = Math.max(first - margin, 0);
    const to = Math.min(last + marginAfter, lineCount - 1);
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
    return [blockStarts[low], end - to - 1 <= marginAfter ? end : to + 1];
}

module.exports = { getBlockStarts, getParseRange };
