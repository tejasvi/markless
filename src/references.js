const { parser } = require('./parser');

/**
 * Offset of the `]` closing the `[` just before `from`, before `end`, or -1. Escaped brackets and
 * brackets in code spans do not count.
 * @param {string} text
 * @param {number} from
 * @param {number} end
 */
function closingBracket(text, from, end) {
    let depth = 0;
    for (let i = from; i < end; i++) {
        if (text[i] === '\\') {
            i++;
        } else if (text[i] === '`') {
            const ticks = /^`+/.exec(text.slice(i, end))[0];
            const close = text.slice(i + ticks.length, end).search(new RegExp(`(?<!\`)${ticks}(?!\`)`));
            i += ticks.length - 1 + (close === -1 ? 0 : close + ticks.length);
        } else if (text[i] === '[') {
            depth++;
        } else if (text[i] === ']' && depth-- === 0) {
            return i;
        }
    }
    return -1;
}

/**
 * Edits that move the destinations of the inline links and images touching `[from, to]` to link
 * reference definitions at the end of the document: `[text](url "title")` becomes `[text][1]` and
 * `[1]: url "title"` is added. VS Code wraps lines by their whole text, hidden urls included, so
 * without the urls lines wrap where the rendered text says they should (#19).
 * @param {string} text the document
 * @param {number} [from]
 * @param {number} [to]
 * @returns {{start: number, end: number, text: string}[]} sorted edits, offsets into `text`
 */
function moveUrlsToDefinitions(text, from = 0, to = text.length) {
    const tree = parser(text, true);
    const labels = new Set();
    const labelByDestination = new Map();
    const links = [];
    const visit = (node) => {
        if (node.type === "definition") {
            labels.add(node.identifier.toLowerCase());
            const source = text.slice(node.position.start.offset, node.position.end.offset);
            const destination = source.slice(closingBracket(source, 1, source.length) + 2).trim().replace(/\s+/g, " ");
            if (!labelByDestination.has(destination)) {
                labelByDestination.set(destination, node.label);
            }
        } else if ((node.type === "link" || node.type === "image") && node.position && node.position.start.offset <= to && from <= node.position.end.offset) {
            links.push(node);
        }
        (node.children || []).forEach(visit);
    };
    visit(tree);

    const edits = [];
    const definitions = [];
    let next = 1;
    for (const node of links) {
        const { start: { offset: start }, end: { offset: end } } = node.position;
        const close = closingBracket(text, start + (node.type === "image" ? 2 : 1), end);
        if (close === -1 || text[close + 1] !== "(" || text[end - 1] !== ")") continue; // autolink or reference
        const destination = text.slice(close + 2, end - 1).trim().replace(/\s+/g, " ") || "<>";
        let label = labelByDestination.get(destination);
        if (label === undefined) {
            while (labels.has(String(next))) next++;
            label = String(next);
            labels.add(label);
            labelByDestination.set(destination, label);
            definitions.push(`[${label}]: ${destination}`);
        }
        edits.push({ start: close + 1, end, text: `[${label}]` });
    }
    if (definitions.length) {
        // After the definitions already at the end, otherwise after a blank line
        const lastLine = text.replace(/\s+$/, "").split("\n").pop();
        const separator = /^ {0,3}\[(?:[^\\[\]]|\\.)+\]:/.test(lastLine) ? "\n" : "\n\n";
        const trimmed = text.replace(/\s+$/, "").length;
        edits.push({ start: trimmed, end: text.length, text: separator + definitions.join("\n") + "\n" });
    }
    return edits.sort((a, b) => a.start - b.start);
}

/**
 * Apply edits from moveUrlsToDefinitions to the text.
 * @param {string} text
 * @param {{start: number, end: number, text: string}[]} edits
 */
function applyEdits(text, edits) {
    for (const edit of [...edits].reverse()) {
        text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    }
    return text;
}

module.exports = { moveUrlsToDefinitions, applyEdits, closingBracket };
