const vscode = require('vscode');

// Mermaid needs a browser to lay out diagrams. They are rendered in a webview view that lives in
// the Markless view container and is kept alive while hidden. Requests carry an id so that
// several diagrams can be rendered at the same time.

let webview;
let resolveWebviewReady;
let webviewReady = new Promise(resolve => { resolveWebviewReady = resolve; });
let revealed = false;
let nextId = 0;
const requests = new Map();

const webviewScript = `
const vscode = acquireVsCodeApi();
function fit(svgText, height) {
	const svg = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
	const [, , width, viewHeight] = svg.getAttribute('viewBox').split(/[\\s,]+/).map(Number);
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
					resolveWebviewReady();
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
				webviewReady = new Promise(resolve => { resolveWebviewReady = resolve; });
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
 * Render a mermaid diagram as an svg `height` px tall.
 * @param {{source: string, darkMode: boolean, height: number, fontFamily: string}} diagram
 * @returns {Promise<string>}
 */
async function renderMermaid(diagram) {
	if (!webview) {
		await revealRenderer();
		await webviewReady;
	}
	const id = nextId++;
	return new Promise((resolve, reject) => {
		requests.set(id, { resolve, reject });
		webview.postMessage({ id, ...diagram });
	});
}

module.exports = { registerMermaidRenderer, renderMermaid };
