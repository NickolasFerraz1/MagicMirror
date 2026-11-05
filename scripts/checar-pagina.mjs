// Confere, de dentro do Chromium do espelho (porta 9222), se a troca de página terminou coerente:
// só módulos da página atual visíveis, sem cópia de animação sobrando. Não precisa ver o monitor.
//
// Uso (no Pi):
//   node ~/magic-mirror/scripts/checar-pagina.mjs                         estado atual
//   node ~/magic-mirror/scripts/checar-pagina.mjs gesto GESTO_ESQUERDA    1 gesto: mostra o meio (120 ms) e o fim
//   node ~/magic-mirror/scripts/checar-pagina.mjs rajada GESTO_ESQUERDA 8 60   8 gestos a cada 60 ms, confere o fim
// Os gestos saem de dentro da página (POST /MMM-Sensores/evento), com o tempo medido lá dentro.
// Sai com código 1 se sobrar módulo de outra página ou animação no fim.
const [modo = "estado", evento = "GESTO_ESQUERDA", qtd = "8", intervalo = "60"] = process.argv.slice(2);

const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
const alvo = targets.find((t) => t.type === "page");
if (!alvo) throw new Error("Nenhuma página aberta no Chromium (porta 9222)");
const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((ok) => ws.addEventListener("open", ok, { once: true }));
const avaliar = (expression) => new Promise((resolve, reject) => {
	ws.addEventListener("message", function ouvir(ev) {
		const msg = JSON.parse(ev.data);
		if (msg.id !== 1) return;
		ws.removeEventListener("message", ouvir);
		if (msg.result?.exceptionDetails) reject(new Error(msg.result.exceptionDetails.exception?.description));
		else resolve(msg.result?.result?.value);
	});
	ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
});

const NO_NAVEGADOR = `
const estado = () => {
	const pages = MM.getModules().withClass("MMM-pages")[0];
	const atual = pages ? pages.curPage : null;
	const visiveis = MM.getModules()
		.filter((m) => /\\bpage\\d+\\b/.test(m.data.classes || ""))
		.filter((m) => {
			const w = document.getElementById(m.identifier);
			return w && !w.classList.contains("hidden") && w.style.position !== "fixed" && getComputedStyle(w).opacity !== "0";
		})
		.map((m) => ({ nome: m.name, pagina: Number(m.data.classes.match(/\\bpage(\\d+)\\b/)[1]) }));
	return {
		pagina: atual,
		visiveis: visiveis.map((v) => v.nome + "@" + v.pagina),
		intrusos: visiveis.filter((v) => v.pagina !== atual).map((v) => v.nome + "@" + v.pagina),
		fantasmas: document.querySelectorAll(".deslizar-fantasma").length,
		entrando: document.querySelectorAll(".deslizar-entra").length
	};
};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const gesto = (evento) => fetch("MMM-Sensores/evento", {
	method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evento })
});
`;

const scripts = {
	estado: `(async () => { ${NO_NAVEGADOR} return { fim: estado() }; })()`,
	gesto: `(async () => { ${NO_NAVEGADOR}
		const antes = estado(); await gesto(${JSON.stringify(evento)});
		await espera(120); const meio = estado();
		await espera(700); return { antes, meio, fim: estado() }; })()`,
	rajada: `(async () => { ${NO_NAVEGADOR}
		const antes = estado();
		for (let i = 0; i < ${Number(qtd)}; i++) { gesto(${JSON.stringify(evento)}); await espera(${Number(intervalo)}); }
		await espera(1000); return { antes, fim: estado() }; })()`
};
if (!scripts[modo]) throw new Error(`modo desconhecido: ${modo} (estado | gesto | rajada)`);

const r = await avaliar(scripts[modo]);
ws.close();
for (const [quando, e] of Object.entries(r)) {
	console.log(`${quando.padEnd(6)} página ${e.pagina} · visíveis: ${e.visiveis.join(", ") || "—"} · cópias animando: ${e.fantasmas} · entrando: ${e.entrando}`);
}
const ok = !r.fim.intrusos.length && !r.fim.fantasmas && !r.fim.entrando;
console.log(ok ? "OK: só a página atual na tela, sem animação sobrando" : `PROBLEMA: ${JSON.stringify(r.fim)}`);
process.exit(ok ? 0 : 1);
