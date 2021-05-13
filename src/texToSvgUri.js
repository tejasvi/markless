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

    return (texString, display) => {
        const node = html.convert(texString, { display: display, em: 16, ex: 8, containerWidth: 80 * 16 });
        console.log(node);
        const width = node.children[0].attributes.viewBox.split(' ')[2];
        let svg = adaptor.innerHTML(node);
        svg = svg.replace(/<defs>/, `<defs><style>${CSS}</style>`);
        return { svg: svg, width: width };
    }
})();

function texToSvgUri (texString, display) {
    const {svg, width} = texToSvg(texString, display);
    const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    console.log(svgDataUri);
    return { uri: svgDataUri, width: width };
}

module.exports = { texToSvgUri };