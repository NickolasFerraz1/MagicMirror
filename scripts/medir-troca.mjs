// Mede, dentro do Chromium do espelho (porta 9222), o que acontece na tela durante UMA troca de página.
// Não mexe em arquivo nenhum; a animação pode ser ligada/desligada só para a medição (volta ao valor
// do config no fim).
//
// Uso (no Pi):
//   node ~/magic-mirror/scripts/medir-troca.mjs [--anim on|off] [--de N] [--gesto GESTO_ESQUERDA] [--ms 1800]
//     --anim  on = com o MMM-Deslizar · off = troca seca · (omitido) = como estiver no config
//     --de    vai antes (sem animação) para a página N e espera 2 s
//     --gesto gesto enviado (POST /MMM-Sensores/evento), padrão GESTO_ESQUERDA (próxima página)
//     --ms    janela de medição depois do gesto, padrão 1800
//
// Mede, a cada quadro (requestAnimationFrame): intervalo entre quadros, módulos reais visíveis da
// página antiga e da nova (opacity, translateX, retângulo), cópias do MMM-Deslizar (idem + o que, nos
// ancestrais, pode escondê-las). Também: tarefas longas (PerformanceObserver "longtask"), recursos
// baixados na janela, mutações do DOM por 100 ms e os tempos gesto → comando de página → NEW_PAGE →
// 1º quadro com a página nova visível → página nova completa.
const args = Object.fromEntries(
	process.argv.slice(2).join(" ").split("--").filter(Boolean).map((a) => a.trim().split(/\s+/)).map(([k, v]) => [k, v ?? ""])
);
const opcoes = {
	anim: args.anim === "on" ? true : args.anim === "off" ? false : null,
	de: args.de !== undefined ? Number(args.de) : null,
	gesto: args.gesto || "GESTO_ESQUERDA",
	ms: Number(args.ms || 1800)
};

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
		if (msg.result?.exceptionDetails) reject(new Error(msg.result.exceptionDetails.exception?.description || "erro no navegador"));
		else resolve(msg.result?.result?.value);
	});
	ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
});

const NO_NAVEGADOR = async (opcoes) => {
	const espera = (ms) => new Promise((r) => setTimeout(r, ms));
	const proximoQuadro = () => new Promise((r) => requestAnimationFrame(r));
	const mods = () => MM.getModules();
	const pages = mods().withClass("MMM-pages")[0];
	const desl = mods().withClass("MMM-Deslizar")[0];
	const nav = mods().withClass("MMM-Nav")[0];
	const animOriginal = desl ? desl.config.slideAnimation : null;
	const paginaDe = (m) => {
		const r = String(m.data.classes || "").match(/\bpage(\d+)\b/);
		return r ? Number(r[1]) : null;
	};
	const translateX = (cs) => {
		if (!cs.transform || cs.transform === "none") return 0;
		const m = cs.transform.match(/matrix(3d)?\(([^)]+)\)/);
		if (!m) return cs.transform;
		const v = m[2].split(",").map(Number);
		return Math.round(m[1] ? v[12] : v[4]);
	};
	// Opacidade "efetiva": multiplica a dos ancestrais; e se algum ancestral esconde ou recorta
	const efetivo = (el) => {
		let op = 1;
		const problemas = [];
		const r = el.getBoundingClientRect();
		for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
			const cs = getComputedStyle(a);
			op *= Number(cs.opacity);
			const nome = a === el ? "o próprio" : (a.className && typeof a.className === "string" ? "." + a.className.trim().split(/\s+/).join(".") : a.tagName);
			if (cs.display === "none") problemas.push(`${nome}: display none`);
			if (cs.visibility === "hidden") problemas.push(`${nome}: visibility hidden`);
			if (a !== el && cs.overflow !== "visible") {
				const ra = a.getBoundingClientRect();
				const corta = r.left < ra.left || r.right > ra.right || r.top < ra.top || r.bottom > ra.bottom;
				if (corta) problemas.push(`${nome}: overflow ${cs.overflow} recorta`);
			}
			if (a !== el && cs.transform !== "none") problemas.push(`${nome}: transform (fixed vira relativo a ele)`);
			if (a !== el && cs.contain !== "none" && cs.contain !== "") problemas.push(`${nome}: contain ${cs.contain}`);
		}
		const dentro = r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
		if (!dentro) problemas.push("fora da tela ou tamanho zero");
		// Quem está por cima no centro?
		const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
		const cy = Math.min(innerHeight - 1, Math.max(0, r.top + Math.min(r.height / 2, 40)));
		const topo = document.elementFromPoint(cx, cy);
		let opTopo = 1;
		for (let a = topo; a && a !== document.documentElement; a = a.parentElement) opTopo *= Number(getComputedStyle(a).opacity);
		const coberto = topo && opTopo > 0.05 && !el.contains(topo) && !(topo.closest && topo.closest(".deslizar-fantasma") === el);
		return { op: Math.round(op * 100) / 100, problemas, coberto: coberto ? (topo.className || topo.tagName).toString().slice(0, 60) : null, ret: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
	};
	const visiveis = (pagina) => mods().filter((m) => paginaDe(m) === pagina).map((m) => document.getElementById(m.identifier)).filter((w) => {
		if (!w) return false;
		const r = w.getBoundingClientRect();
		return r.width > 0 && r.height > 0 && efetivo(w).op > 0.05 && w.style.position !== "fixed";
	});

	// Página inicial (sem animação)
	if (opcoes.de !== null && pages && pages.curPage !== opcoes.de) {
		if (desl) desl.config.slideAnimation = false;
		nav.sendNotification("PAGE_SELECT", opcoes.de);
		await espera(2000);
	}
	if (desl && opcoes.anim !== null) desl.config.slideAnimation = opcoes.anim;
	await espera(700); // passa a trava do MMM-Nav
	const antes = pages.curPage;

	// Ganchos: tempos do comando de página e do NEW_PAGE (num módulo que não é quem envia)
	const espiao = mods().withClass("MMM-Sensores")[0] || desl;
	const marcas = {};
	const original = espiao.notificationReceived;
	espiao.notificationReceived = function (n, p) {
		const t = performance.now();
		if (/^(PAGE_INCREMENT|PAGE_DECREMENT|HOME_PAGE|PAGE_SELECT)$/.test(n) && marcas.comando === undefined) marcas.comando = t;
		if (n === "NEW_PAGE" && marcas.newPage === undefined) {
			marcas.newPage = t;
			marcas.paginaNova = p;
		}
		return original ? original.apply(this, arguments) : undefined;
	};
	const longas = [];
	let po;
	try {
		po = new PerformanceObserver((l) => l.getEntries().forEach((e) => longas.push([e.startTime, e.duration])));
		po.observe({ type: "longtask" });
	} catch {
		longas.push("PerformanceObserver longtask indisponível");
	}
	let mutacoes = [];
	const mo = new MutationObserver((l) => mutacoes.push([performance.now(), l.length]));
	mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });

	const quadros = [];
	const t0 = performance.now();
	fetch("MMM-Sensores/evento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evento: opcoes.gesto }) });
	let maxFantasmas = 0;
	let fantasmaInfo = null;
	while (performance.now() - t0 < opcoes.ms) {
		const t = await proximoQuadro();
		const nova = marcas.paginaNova;
		const fantasmas = [...document.querySelectorAll(".deslizar-fantasma")];
		maxFantasmas = Math.max(maxFantasmas, fantasmas.length);
		const q = { t: t - t0, velha: visiveis(antes).length, nova: nova !== undefined && nova !== antes ? visiveis(nova).length : 0, fantasmas: fantasmas.length };
		if (fantasmas.length) {
			const f = fantasmas[0];
			const cs = getComputedStyle(f);
			const ef = efetivo(f);
			q.fantasma = { op: Number(cs.opacity).toFixed(2), x: translateX(cs), ef: ef.op, anim: cs.animationName };
			if (!fantasmaInfo) fantasmaInfo = { ...ef, html: f.className };
		}
		if (nova !== undefined && nova !== antes) {
			const m = mods().find((mm) => paginaDe(mm) === nova && document.getElementById(mm.identifier)?.getBoundingClientRect().height);
			const w = m && document.getElementById(m.identifier);
			if (w) {
				const cs = getComputedStyle(w);
				q.entra = { mod: m.name, op: Number(cs.opacity).toFixed(2), x: translateX(cs), classe: w.classList.contains("deslizar-entra"), hidden: w.classList.contains("hidden"), pos: w.style.position || "-" };
			}
		}
		quadros.push(q);
	}
	espiao.notificationReceived = original;
	po?.disconnect();
	mo.disconnect();
	const recursos = performance.getEntriesByType("resource")
		.filter((e) => e.startTime >= t0 && e.startTime <= t0 + opcoes.ms)
		.map((e) => `${Math.round(e.startTime - t0)}ms ${e.name.replace(location.origin, "").slice(0, 60)} (${Math.round(e.duration)} ms)`);
	if (desl) desl.config.slideAnimation = animOriginal;

	// Resumo
	const int = quadros.map((q, i) => (i ? q.t - quadros[i - 1].t : q.t));
	const em600 = quadros.filter((q) => q.t <= 600).length;
	const algoVisivel = (q) => q.velha > 0 || q.nova > 0 || (q.fantasma && q.fantasma.ef > 0.05);
	let buraco = 0;
	for (let i = 1; i < quadros.length; i++) if (!algoVisivel(quadros[i]) && !algoVisivel(quadros[i - 1])) buraco += quadros[i].t - quadros[i - 1].t;
	const primeiroNovo = quadros.find((q) => q.nova > 0);
	const novoCompleto = quadros.find((q) => q.nova > 0 && q.entra && Number(q.entra.op) >= 0.99 && !q.entra.classe);
	const ultimoVelho = [...quadros].reverse().find((q) => q.velha > 0 || (q.fantasma && q.fantasma.ef > 0.05));
	const r = (x) => (x === undefined ? "—" : `${Math.round(x)} ms`);
	const bins = {};
	mutacoes.forEach(([t, n]) => {
		const b = Math.floor((t - t0) / 100) * 100;
		bins[b] = (bins[b] || 0) + n;
	});
	return {
		modo: desl ? (desl.config.slideAnimation === animOriginal && opcoes.anim === null ? `config (slideAnimation=${animOriginal})` : `slideAnimation=${opcoes.anim}`) : "sem MMM-Deslizar",
		pagina: `${antes} → ${marcas.paginaNova ?? "?"}`,
		tela: `${innerWidth}x${innerHeight} · devicePixelRatio ${devicePixelRatio}`,
		quadros: `${em600} quadros nos primeiros 600 ms (≈ ${Math.round(em600 / 0.6)} fps) · maior intervalo ${Math.round(Math.max(...int))} ms · intervalos > 50 ms: ${int.filter((x) => x > 50).length}`,
		tempos: `gesto → comando de página ${r(marcas.comando - t0)} · → NEW_PAGE ${r(marcas.newPage - t0)} · → 1º quadro com a nova visível ${r(primeiroNovo && primeiroNovo.t)} · → nova completa ${r(novoCompleto && novoCompleto.t)} · último quadro com a antiga (real ou cópia) ${r(ultimoVelho && ultimoVelho.t)}`,
		buraco: `tela sem página (nem antiga, nem cópia, nem nova): ${Math.round(buraco)} ms`,
		longas: longas.map((l) => (typeof l === "string" ? l : `${Math.round(l[0] - t0)}ms +${Math.round(l[1])}ms`)).join(" · ") || "nenhuma",
		copias: `${maxFantasmas} no máximo` + (fantasmaInfo ? ` · opacidade efetiva ${fantasmaInfo.op} · retângulo ${fantasmaInfo.ret} · por cima: ${fantasmaInfo.coberto || "nada"} · ancestrais: ${fantasmaInfo.problemas.join("; ") || "ok"}` : ""),
		recursos: recursos.join(" · ") || "nenhum",
		mutacoes: Object.entries(bins).map(([b, n]) => `${b}:${n}`).join(" "),
		amostras: quadros.map((q) => `${Math.round(q.t)}ms velha=${q.velha} nova=${q.nova}` +
			(q.fantasma ? ` cópia(op ${q.fantasma.op} x ${q.fantasma.x} ef ${q.fantasma.ef})` : "") +
			(q.entra ? ` entra(${q.entra.mod} op ${q.entra.op} x ${q.entra.x}${q.entra.classe ? " anim" : ""}${q.entra.hidden ? " hidden" : ""} pos ${q.entra.pos})` : ""))
	};
};

const r = await avaliar(`(${NO_NAVEGADOR.toString()})(${JSON.stringify(opcoes)})`);
ws.close();
for (const [k, v] of Object.entries(r)) {
	if (k === "amostras") continue;
	console.log(`${k.padEnd(9)} ${v}`);
}
console.log("amostras (um por quadro):");
for (const a of r.amostras) console.log("  " + a);
