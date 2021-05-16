const { memoize } = require('./util');

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

    return (texString, display, fontSize) => {
        const node = html.convert(texString, { display: display });
        const attributes = node.children[0].attributes;
        for (let param of ["height", "width"]) {
            attributes[param] = String(parseFloat(attributes[param]) * fontSize / 16) + "ex";
        }
        console.log(node);
        let svgElement = adaptor.innerHTML(node);
        svgElement = svgElement.replace(/<defs>/, `<defs><style>${CSS}</style>`);
        return svgElement;
    }
})();

const texToSvgUri = memoize((texString, display, fontSize) => {
    const svg = texToSvg(texString, display, fontSize);
    console.log("SVG", svg);
    const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    console.log(svgDataUri);
    return svgDataUri;
});

module.exports = { texToSvgUri };