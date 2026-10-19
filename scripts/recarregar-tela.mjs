// Recarrega a página do espelho no Chromium (sem cache), via DevTools Protocol.
// Necessário depois de reiniciar o servidor: o serviço "magicmirror" roda só o servidor
// (npm run server) e a tela é um Chromium separado, que não recarrega sozinho.
// Uso: node scripts/recarregar-tela.mjs   (Chromium aberto com --remote-debugging-port=9222)
let targets;
try {
	targets = await (await fetch("http://127.0.0.1:9222/json")).json();
} catch {
	console.error("Chromium do espelho não encontrado na porta 9222 (a tela está aberta?)");
	process.exit(1);
}
const page = targets.find((t) => t.type === "page");
if (!page) {
	console.error("Nenhuma página aberta no Chromium");
	process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
ws.addEventListener("open", () => ws.send(JSON.stringify({ id: 1, method: "Page.reload", params: { ignoreCache: true } })));
ws.addEventListener("message", (ev) => {
	if (JSON.parse(ev.data).id !== 1) return;
	console.log("Tela recarregada.");
	ws.close();
	process.exit(0);
});
setTimeout(() => {
	console.error("Sem resposta do Chromium em 5 s");
	process.exit(1);
}, 5000);
