const vscode = require('vscode');

// Mermaid needs a browser to lay out diagrams. They are rendered in a webview view that lives in
// the Markless view container and is kept alive while hidden. Requests carry an id so that
// several diagrams can be rendered at the same time.

let webview;
let ready = waitForWebview();
let revealed = false;
let nextId = 0;
const requests = new Map();

function waitForWebview() {
	let resolve, reject;
	const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
	promise.catch(() => {});
	return { promise, resolve, reject };
}

function timeout(promise, ms, message) {
	let timer;
	return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })])
		.finally(() => clearTimeout(timer));
}

const webviewScript = `
const vscode = acquireVsCodeApi();
// Mermaid writes html (<br>, &nbsp;), so the svg is parsed as html and serialized as XML, which
// the svg image in the editor needs.
function fit(svgText, height) {
	const container = document.createElement('div');
	container.innerHTML = svgText;
	const svg = container.querySelector('svg');
	let { width, height: viewHeight } = svg.viewBox.baseVal || {};
	if (!width || !viewHeight) {
		document.body.append(container);
		({ width, height: viewHeight } = svg.getBBox());
		container.remove();
	}
	svg.setAttribute('width', width * height / viewHeight + 'px');
	svg.setAttribute('height', height + 'px');
	svg.style.removeProperty('max-width');
	svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
	return new XMLSerializer().serializeToString(svg);
}
window.addEventListener('message', async ({ data }) => {
	const id = 'markless-mermaid-' + data.id;
	try {
		mermaid.initialize({ startOnLoad: false, theme: data.darkMode ? 'dark' : 'default', fontFamily: data.fontFamily });
		const { svg } = await mermaid.render(id, data.source);
		vscode.postMessage({ id: data.id, svg: fit(svg, data.height) });
	} catch (error) {
		vscode.postMessage({ id: data.id, error: String(error && error.message || error) });
	} finally {
		document.getElementById(id)?.remove();
		document.getElementById('d' + id)?.remove();
	}
});
vscode.postMessage({ ready: true });
`;

/**
 * @param {vscode.ExtensionContext} context
 */
function registerMermaidRenderer(context) {
	context.subscriptions.push(vscode.window.registerWebviewViewProvider("markless.mermaid", {
		resolveWebviewView: (webviewView) => {
			const outUri = vscode.Uri.joinPath(context.extensionUri, 'out');
			webviewView.webview.options = { enableScripts: true, localResourceRoots: [outUri] };
			webviewView.webview.onDidReceiveMessage((message) => {
				if (message.ready) {
					webview = webviewView.webview;
					ready.resolve();
					return;
				}
				const request = requests.get(message.id);
				if (!request) return;
				requests.delete(message.id);
				if (message.error === undefined) {
					request.resolve(message.svg);
				} else {
					const error = new Error(message.error);
					error.fromMermaid = true;
					request.reject(error);
				}
			}, null, context.subscriptions);
			webviewView.onDidDispose(() => {
				webview = undefined;
				revealed = false;
				ready.reject(new Error("The mermaid renderer was closed"));
				ready = waitForWebview();
				for (const request of requests.values()) {
					request.reject(new Error("The mermaid renderer was closed"));
				}
				requests.clear();
			}, null, context.subscriptions);
			const mermaidScriptUri = webviewView.webview.asWebviewUri(vscode.Uri.joinPath(outUri, 'mermaid.min.js'));
			const csp = `default-src 'none'; script-src ${webviewView.webview.cspSource} 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:;`;
			webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head><meta http-equiv="Content-Security-Policy" content="${csp}"></head>
<body>
<p>Markless renders mermaid diagrams here. This view can stay hidden.</p>
<script src="${mermaidScriptUri}"></script>
<script>${webviewScript}</script>
</body>
</html>`;
		}
	}, { webviewOptions: { retainContextWhenHidden: true } }));
}

/**
 * The webview is only created once its view has been shown, so show it the first time a diagram
 * is rendered and go back to the explorer and the editor.
 */
async function revealRenderer() {
	if (revealed) return;
	revealed = true;
	try {
		await vscode.commands.executeCommand('workbench.view.extension.markless');
		await vscode.commands.executeCommand('workbench.view.explorer');
		await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
	} catch (error) {
		revealed = false;
		console.error("Markless: could not show the mermaid renderer", error);
	}
}

/**
 * Render a mermaid diagram as an svg `height` px tall. Errors from mermaid have `fromMermaid` set.
 * @param {{source: string, darkMode: boolean, height: number, fontFamily: string}} diagram
 * @returns {Promise<string>}
 */
async function renderMermaid(diagram) {
	if (!webview) {
		await revealRenderer();
		// The view may have been moved somewhere it is not shown
		await timeout(ready.promise, 10000, "The mermaid renderer did not start. Show the Mermaid renderer view once.");
	}
	const id = nextId++;
	return timeout(new Promise((resolve, reject) => {
		requests.set(id, { resolve, reject });
		webview.postMessage({ id, ...diagram });
	}), 30000, "The mermaid renderer did not answer").finally(() => requests.delete(id));
}

module.exports = { registerMermaidRenderer, renderMermaid };
