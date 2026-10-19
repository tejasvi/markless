const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * Url in the destination of a markdown link or image: `[text](url "title")`.
 * @param {string} destination
 */
function cleanUrl(destination) {
    destination = destination.trim();
    const match = /^<([^>]*)>/.exec(destination) || /^\S*/.exec(destination);
    return match[1] === undefined ? match[0] : match[1];
}

// An html tag (attribute values may contain `>`) or comment
const tagRegEx = /<!--[^]*?-->|<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g;

function decodeEntities(text) {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    return text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (match, hex, decimal, name) =>
        hex ? String.fromCodePoint(parseInt(hex, 16)) : decimal ? String.fromCodePoint(parseInt(decimal, 10)) : named[name.toLowerCase()] || match);
}

/**
 * `src` and `alt` of an `<img>` tag, if it has a `src`.
 * @param {string} tag
 */
function parseImgTag(tag) {
    if (!/^<img\s/i.test(tag)) return;
    const attributes = {};
    const attributeRegEx = /\s([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let match;
    while ((match = attributeRegEx.exec(tag))) {
        const name = match[1].toLowerCase();
        if (!(name in attributes)) {
            attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
        }
    }
    const src = (attributes.src || "").trim();
    return src ? { src, alt: attributes.alt || " " } : undefined;
}

function enableHoverImage(context) {
    context.subscriptions.push(vscode.languages.registerHoverProvider('markdown', {
        provideHover: (document, position) => {
            if (!vscode.workspace.getConfiguration("markless").get("hoverImage")) return;
            const line = document.lineAt(position).text;
            // console.log("HHOOVVEERR: ", line);
            const regEx = new RegExp(`(!?)\\[[^\\]]*\\]\\(([^)]+)\\)|${tagRegEx.source}`, "g");
            let match;
            while ((match = regEx.exec(line))) {
                // console.log("HHOOVVEERR: match ", match);
                if (match.index - 1 <= position.character && position.character <= match.index + match[0].length) {
                    const range = new vscode.Range(position.line, match.index, position.line, match.index + match[0].length + 1);
                    const image = match[1] === undefined ? parseImgTag(match[0]) : undefined;
                    const url = image ? image.src : match[1] === undefined ? undefined : cleanUrl(match[2]);
                    if (!url) continue;
                    const markdown = image || match[1].length == 1 ? imageMarkdown(url, document.uri, "hoverPreview") : linkMarkdown(url, document.uri);
                    if (markdown) {
                        return new vscode.Hover(markdown, range);
                    }
                }
            }
        }
    }));
}


const texToSvg = (() => {
    const { mathjax } = require('mathjax-full/js/mathjax.js');
    const { TeX } = require('mathjax-full/js/input/tex.js');
    const { SVG } = require('mathjax-full/js/output/svg.js');
    const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
    const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
    const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');
    const CSS = [
        'svg a{fill:blue;stroke:blue}',
        '[data-mml-node="merror"]>g{fill:red;stroke:red}',
        '[data-mml-node="merror"]>rect[data-background]{fill:yellow;stroke:none}',
        '[data-frame],[data-line]{stroke-width:70px;fill:none}',
        '.mjx-dashed{stroke-dasharray:140}',
        '.mjx-dotted{stroke-linecap:round;stroke-dasharray:0,140}',
        'use[data-c]{stroke-width:3px}'
    ].join('');
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const packages = { packages: AllPackages.sort().join(', ').split(/\s*,\s*/) };

    const tex = new TeX(packages);
    const svg = new SVG({ fontCache: 'local' });
    const html = mathjax.document('', { InputJax: tex, OutputJax: svg });

    /**
     * Typeset `texString` with an em of `fontSize` px into a box `height` px tall (by default as
     * tall as the formula). The formula is shrunk only if it does not fit, then centered
     * vertically, or put on the text baseline `baseline` px from the top when it fits there.
     * @param {string} texString
     * @param {boolean} display
     * @param {number} fontSize
     * @param {number} [height]
     * @param {number} [baseline]
     */
    return (texString, display, fontSize, height, baseline) => {
        tex.reset(); // forget the \label names of formulas typeset before
        const node = html.convert(texString, { display: display });
        const attributes = node.children[0].attributes;
        // Size in ems. The viewBox is in thousandths of an em with the baseline at y = 0. Equations
        // with a \tag have no viewBox, only a size in ex.
        let width, ascent, depth;
        if (attributes["viewBox"]) {
            const [, y, w, h] = attributes["viewBox"].split(/\s+/).map(parseFloat);
            [width, ascent, depth] = [w / 1000, -y / 1000, (h + y) / 1000];
        } else {
            const style = attributes["style"] || "";
            const ex = svg.font.params.x_height;
            width = parseFloat((/min-width:\s*([\d.]+)ex/.exec(style) || [])[1]) * ex || 1;
            depth = -parseFloat((/vertical-align:\s*(-?[\d.]+)ex/.exec(style) || [])[1] || 0) * ex;
            ascent = parseFloat(attributes["height"]) * ex - depth;
        }
        const total = ascent + depth;
        if (height === undefined) {
            height = total * fontSize;
        }
        let scale, top;
        if (baseline !== undefined && ascent * fontSize <= baseline && depth * fontSize <= height - baseline) {
            scale = 1;
            top = baseline - ascent * fontSize;
        } else {
            scale = Math.min(1, height / (total * fontSize));
            top = (height - total * fontSize * scale) / 2;
        }
        const em = fontSize * scale;
        attributes["width"] = `${width * em}px`;
        attributes["height"] = `${total * em}px`;
        attributes["y"] = `${top}px`;
        delete attributes["style"];
        attributes.preserveAspectRatio = "xMinYMin meet";
        // console.log(node);
        let svgElement = adaptor.innerHTML(node);
        svgElement = svgElement.replace(/<defs>/, `<defs><style>${CSS}</style>`);
        return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width * em}px" height="${height}px">${svgElement}</svg>`;
    }
})();

class DefaultMap extends Map {
    get(key) {
        if (!this.has(key)) {
            this.set(key, this.defaultMethod());
        }
        return super.get(key);
    }
    constructor(defaultMethod) {
        super();
        this.defaultMethod = defaultMethod;
    }
}

function memoize(func) {
    return (() => {
        const cache = new Map();
        return (...args) => {
            const key = args.toString();
            if (!cache.has(key)) {
                cache.set(key, func(...args));
            }
            return cache.get(key);
        };
    })();
}

function safeDecode(text) {
    try {
        return decodeURIComponent(text);
    } catch {
        return text;
    }
}

const hasScheme = url => /^[a-z][a-z0-9+.-]*:/i.test(url) && !/^[a-z]:[\\/]/i.test(url);

/**
 * Uri that the paths in a document are relative to. Images cannot be loaded from the git and
 * notebook cell versions of a file, so these use the file itself.
 * @param {vscode.Uri} documentUri
 */
function getBaseUri(documentUri) {
    if (["git", "vscode-notebook-cell"].includes(documentUri.scheme) && documentUri.path.startsWith("/")) {
        return vscode.Uri.file(documentUri.fsPath);
    }
    return documentUri;
}

/**
 * Resolve an image or link url like the built-in markdown preview: relative paths against the
 * folder of the markdown file and paths starting with `/` against its workspace folder (or the
 * file system root when the file only exists there). Returns undefined for invalid urls.
 * @param {string} url
 * @param {vscode.Uri} [documentUri]
 * @returns {vscode.Uri | undefined}
 */
function urlToUri(url, documentUri) {
    url = url.trim();
    try {
        if (/^[a-z]:[\\/]/i.test(url)) {
            return vscode.Uri.file(url.replace(/\\/g, "/"));
        } else if (url.startsWith("//")) {
            return vscode.Uri.parse("https:" + url, true);
        } else if (hasScheme(url)) {
            return vscode.Uri.parse(url, true);
        }
        const filePath = safeDecode(url.replace(/[?#].*$/, ""));
        const baseUri = documentUri && documentUri.scheme !== "untitled" ? getBaseUri(documentUri) : undefined;
        const workspaceFolder = (documentUri && vscode.workspace.getWorkspaceFolder(documentUri)) || (vscode.workspace.workspaceFolders || [])[0];
        if (filePath.startsWith("/")) {
            if (workspaceFolder) {
                const inFolder = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
                if (inFolder.scheme !== "file" || fs.existsSync(inFolder.fsPath) || !fs.existsSync(filePath)) {
                    return inFolder;
                }
            }
            return baseUri ? vscode.Uri.joinPath(baseUri.with({ path: "/" }), filePath) : vscode.Uri.file(filePath);
        } else if (baseUri) {
            return vscode.Uri.joinPath(baseUri, "..", filePath);
        } else {
            return workspaceFolder ? vscode.Uri.joinPath(workspaceFolder.uri, filePath) : vscode.Uri.file(filePath);
        }
    } catch {
        return undefined;
    }
}

/**
 * Link destination for markdown shown by VS Code with `baseUri` set to getBaseUri(documentUri).
 * Files on the same machine are written as paths relative to the markdown file, which VS Code
 * maps to the right machine in remote windows; an absolute `file:` uri would be looked up on the
 * local one. VS Code does not decode the relative path, so it stays unencoded inside `<>`.
 * @param {string} url
 * @param {vscode.Uri} documentUri
 */
function markdownDestination(url, documentUri) {
    let destination;
    if (hasScheme(url) || url.startsWith("//")) {
        destination = url.startsWith("//") ? "https:" + url : url;
    } else {
        const uri = urlToUri(url, documentUri);
        if (!uri) return;
        destination = uri.toString();
        const baseUri = getBaseUri(documentUri);
        // Drive letters differ in case between uris of the same Windows file
        const drive = (p) => (/^\/[a-z]:/i.exec(p) || [""])[0].toLowerCase();
        const lowerDrive = (p) => drive(p) + p.slice(drive(p).length);
        const folder = path.posix.dirname(baseUri.path);
        if (documentUri.scheme !== "untitled" && uri.scheme === baseUri.scheme && uri.authority === baseUri.authority && drive(uri.path) === drive(folder)) {
            destination = path.posix.relative(lowerDrive(folder), lowerDrive(uri.path)) || path.posix.basename(uri.path);
        }
    }
    return `<${destination.replace(/[<>\\]/g, "\\$&")}>`;
}

/**
 * Markdown showing the image at `url` that links to it, or undefined for an invalid url.
 * @param {string} url
 * @param {vscode.Uri} documentUri
 * @param {string} alt
 */
function imageMarkdown(url, documentUri, alt) {
    const destination = markdownDestination(url, documentUri);
    if (!destination) return;
    const markdown = new vscode.MarkdownString(`[![${alt}](${destination})](${destination})`);
    markdown.baseUri = getBaseUri(documentUri);
    return markdown;
}

function linkMarkdown(url, documentUri) {
    const destination = markdownDestination(url, documentUri);
    if (!destination) return;
    const markdown = new vscode.MarkdownString(`**[${url.replace(/[\\[\]*_`]/g, "\\$&")}](${destination})**`);
    markdown.baseUri = getBaseUri(documentUri);
    return markdown;
}


function svgToUri(svg) {
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function htmlToSvg(height, width, html, css) {
    return `
    <svg width="${width}" height="${height}" style="overflow: visible;" xmlns="http://www.w3.org/2000/svg"><foreignObject class="node" x="0" y="0" width="100%" height="100%"><body xmlns="http://www.w3.org/1999/xhtml">
    <style>${css ? css : ""}</style>
    ${html}
    </body></foreignObject></svg>`
}

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

const nodeToHtml = (() => {
    const { toHast } = require('mdast-util-to-hast');
    const { toHtml } = require('hast-util-to-html');
    const handlers = {
        highlight: (state, node) => ({ type: "element", tagName: "mark", properties: {}, children: state.all(node) }),
        // An svg image cannot load other images
        image: (state, node) => ({ type: "text", value: node.alt || "" }),
    };
    // The html ends up inside an svg image, which is parsed as XML: attributes need values, void
    // elements are closed and only numeric character references are written.
    const giveValues = (node) => {
        if (node.properties) {
            for (const [name, value] of Object.entries(node.properties)) {
                if (value === true) {
                    node.properties[name] = "";
                } else if (value === false) {
                    delete node.properties[name];
                }
            }
        }
        (node.children || []).forEach(giveValues);
        return node;
    };
    return (/** @type {import("mdast").Nodes} */ node) => toHtml(giveValues(toHast(node, { handlers })), {
        closeSelfClosing: true,
        characterReferences: { useNamedReferences: false },
    });
})();

module.exports = { DefaultMap, memoize, urlToUri, imageMarkdown, cleanUrl, tagRegEx, parseImgTag, svgToUri, htmlToSvg, parser, nodeToHtml, texToSvg, enableHoverImage };
