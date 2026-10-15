// Diagnóstico: avalia expressões JS dentro do Chromium do espelho via DevTools Protocol.
// Uso: node scripts/cdp-eval.mjs   (Chromium aberto com --remote-debugging-port=9222)
const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("Nenhuma página aberta no Chromium");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok) => ws.addEventListener("open", ok, { once: true }));
let id = 0;
const call = (expression) => new Promise((resolve) => {
	const myId = ++id;
	const onMsg = (ev) => {
		const msg = JSON.parse(ev.data);
		if (msg.id !== myId) return;
		ws.removeEventListener("message", onMsg);
		resolve(msg.result?.result?.value ?? msg.result?.exceptionDetails?.exception?.description ?? msg);
	};
	ws.addEventListener("message", onMsg);
	ws.send(JSON.stringify({ id: myId, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
});

const checks = {
	"Navegador": "navigator.userAgent",
	"Instâncias do módulo": `JSON.stringify(MM.getModules().withClass("MMM-Briefing").map(m => ({ modo: m.config.mode, temDados: !!m.briefing, renderizado: !!m.rendered, oculto: m.hidden })))`,
	"Teste do fetch": `Promise.race([
		fetch("MMM-Briefing/data", { cache: "no-store" }).then(r => "HTTP " + r.status + ", " + r.headers.get("content-length") + " bytes"),
		new Promise(r => setTimeout(() => r("TIMEOUT: sem resposta em 10 s"), 10000))
	]).catch(e => "ERRO: " + e.message)`,
	"Conexões do socket": `JSON.stringify(MM.getModules().map(m => m._socket?.socket?.io?.engine?.transport?.name).filter(Boolean))`,
	"HTML do bloco": `(document.querySelector(".briefing") || {}).outerHTML?.slice(0, 200)`
};
for (const [label, expr] of Object.entries(checks)) console.log(`${label}: ${await call(expr)}`);
ws.close();