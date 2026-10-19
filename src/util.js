const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * Url of an image or link inside markdown: the destination of `[text](url "title")` or the
 * `src` attribute of an `<img>` tag.
 * @param {string} destination
 */
function cleanUrl(destination) {
    destination = destination.trim();
    const match = /^<([^>]*)>/.exec(destination) || /^\S*/.exec(destination);
    return (match[1] === undefined ? match[0] : match[1]).replace(/&amp;/g, '&');
}

function enableHoverImage(context) {
    context.subscriptions.push(vscode.languages.registerHoverProvider('markdown', {
        provideHover: (document, position) => {
            if (!vscode.workspace.getConfiguration("markless").get("hoverImage")) return;
            const line = document.lineAt(position).text;
            // console.log("HHOOVVEERR: ", line);
            const regEx = /(!?)\[[^\]]*\]\(([^)]+)\)|<img\s[^>]*?src\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
            let match;
            while ((match = regEx.exec(line))) {
                // console.log("HHOOVVEERR: match ", match);
                if (match.index - 1 <= position.character && position.character <= match.index + match[0].length) {
                    const range = new vscode.Range(position.line, match.index, position.line, match.index + match[0].length + 1);
                    const url = cleanUrl(match[2] || match[3] || match[4] || '');
                    const uri = urlToUri(url, document.uri);
                    if (match[1] === undefined || match[1].length == 1) {
                        return new vscode.Hover(imageMarkdown(uri, document.uri, "hoverPreview"), range);
                    } else {
                        return new vscode.Hover(new vscode.MarkdownString(`**[${url}](${uri})**`), range);
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
        const node = html.convert(texString, { display: display });
        const attributes = node.children[0].attributes;
        // viewBox is in thousandths of an em with the baseline at y = 0
        const [x, y, w, h] = attributes["viewBox"].split(/\s+/).map(parseFloat);
        const pxPerUnit = fontSize / 1000;
        if (height === undefined) {
            height = h * pxPerUnit;
        }
        let scale, viewTop;
        if (baseline !== undefined && -y * pxPerUnit <= baseline && (h + y) * pxPerUnit <= height - baseline) {
            scale = 1;
            viewTop = -baseline / pxPerUnit;
        } else {
            scale = Math.min(1, height / (h * pxPerUnit));
            viewTop = y + h / 2 - height / (scale * pxPerUnit) / 2;
        }
        attributes["viewBox"] = `${x} ${viewTop} ${w} ${height / (scale * pxPerUnit)}`;
        attributes["width"] = `${w * pxPerUnit * scale}px`;
        attributes["height"] = `${height}px`;
        delete attributes["style"];
        attributes.preserveAspectRatio = "xMinYMin meet";
        // console.log(node);
        let svgElement = adaptor.innerHTML(node);
        svgElement = svgElement.replace(/<defs>/, `<defs><style>${CSS}</style>`);
        return svgElement;
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

/**
 * Resolve an image or link url like the built-in markdown preview: relative paths against the
 * folder of the markdown file and paths starting with `/` against its workspace folder (or the
 * file system root when the file only exists there).
 * @param {string} url
 * @param {vscode.Uri} [documentUri]
 */
function urlToUri(url, documentUri) {
    url = url.trim();
    if (/^[a-z]:[\\/]/i.test(url)) {
        return vscode.Uri.file(url.replace(/\\/g, "/"));
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
        return vscode.Uri.parse(url, true);
    }
    const filePath = safeDecode(url.replace(/[?#].*$/, ""));
    const workspaceFolder = (documentUri && vscode.workspace.getWorkspaceFolder(documentUri)) || (vscode.workspace.workspaceFolders || [])[0];
    if (filePath.startsWith("/")) {
        if (workspaceFolder) {
            const inFolder = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
            if (inFolder.scheme !== "file" || fs.existsSync(inFolder.fsPath) || !fs.existsSync(filePath)) {
                return inFolder;
            }
        }
        return documentUri && documentUri.scheme !== "untitled" ? documentUri.with({ path: filePath }) : vscode.Uri.file(filePath);
    } else if (documentUri && documentUri.scheme !== "untitled") {
        return vscode.Uri.joinPath(documentUri, "..", filePath);
    } else {
        return workspaceFolder ? vscode.Uri.joinPath(workspaceFolder.uri, filePath) : vscode.Uri.file(filePath);
    }
}

/**
 * Markdown showing the image at `uri` that links to it. Files next to the markdown file are
 * referenced relative to it through `baseUri`, which VS Code maps to the right machine in remote
 * windows; an absolute `file:` uri would be looked up on the local machine.
 * @param {vscode.Uri} uri
 * @param {vscode.Uri} documentUri
 * @param {string} alt
 */
function imageMarkdown(uri, documentUri, alt) {
    let src = uri.toString();
    if (uri.scheme === documentUri.scheme && uri.authority === documentUri.authority && documentUri.scheme !== "untitled") {
        src = encodeURI(path.posix.relative(path.posix.dirname(documentUri.path), uri.path)) || ".";
    }
    src = src.replace(/[()]/g, c => encodeURIComponent(c));
    const markdown = new vscode.MarkdownString(`[![${alt}](${src})](${src})`);
    markdown.baseUri = documentUri;
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
    const processor = require('unified').unified()
        .use(require('remark-parse').default)
        .use(require('remark-frontmatter').default, ['yaml', 'toml'])
        .use(require('remark-gfm').default)
        .use(require('remark-math').default)
        .use(require('remark-highlight-mark').remarkHighlightMark)
        .freeze();
    return (/** @type {string} */ text) => processor.parse(text);
})();

const nodeToHtml = (() => {
    const { toHast } = require('mdast-util-to-hast');
    const { toHtml } = require('hast-util-to-html');
    // The html ends up inside an svg image, which is parsed as XML: close void elements and
    // write numeric character references only.
    return (/** @type {import("mdast").Nodes} */ node) => toHtml(toHast(node), {
        closeSelfClosing: true,
        characterReferences: { useNamedReferences: false },
    });
})();

module.exports = { DefaultMap, memoize, urlToUri, imageMarkdown, cleanUrl, svgToUri, htmlToSvg, parser, nodeToHtml, texToSvg, enableHoverImage };
