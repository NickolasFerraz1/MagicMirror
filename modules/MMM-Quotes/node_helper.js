/* MMM-Quotes — busca cotações no servidor e entrega ao front por HTTP.
 *
 * Fontes (gratuitas):
 *   awesome → AwesomeAPI (moedas e cripto em BRL). Token opcional: AWESOMEAPI_TOKEN no .env
 *   yahoo   → Yahoo Finance chart API (índices/ações, ex.: ^BVSP). Sem chave (não oficial).
 *
 * Cache: cotação 5 min, histórico (minigráfico) 1 h — o front pode pedir a cada minuto
 * sem gastar requisições das APIs.
 */
const fs = require("node:fs");
const path = require("node:path");
const NodeHelper = require("node_helper");

const QUOTE_TTL = 5 * 60 * 1000;
const HISTORY_TTL = 60 * 60 * 1000;
const TIMEOUT = 10 * 1000;

// Lê o .env do repo (mesmo arquivo do briefing.py) sem sobrescrever o ambiente.
function loadDotenv(file) {
	if (!fs.existsSync(file)) return;
	for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
		if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
	}
}
loadDotenv(path.resolve(__dirname, "..", "..", ".env"));

async function getJson(url, headers = {}) {
	const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
	if (!res.ok) throw new Error(`HTTP ${res.status} em ${url.split("?")[0]}`);
	return res.json();
}

// ---------- Fontes ----------
const providers = {
	async awesome(spec, withHistory) {
		const token = process.env.AWESOMEAPI_TOKEN ? `?token=${process.env.AWESOMEAPI_TOKEN}` : "";
		const base = "https://economia.awesomeapi.com.br/json";
		const last = await getJson(`${base}/last/${spec.pair}${token}`);
		const q = last[spec.pair.replace("-", "")];
		if (!q) throw new Error(`par ${spec.pair} ausente na resposta`);
		const out = { price: Number(q.bid), changePct: Number(q.pctChange), time: q.create_date };
		if (withHistory) {
			const daily = await getJson(`${base}/daily/${spec.pair}/30${token}`);
			// Vem do mais recente para o mais antigo.
			out.history = daily.map((d) => Number(d.bid)).filter(Number.isFinite).reverse();
		}
		return out;
	},

	async yahoo(spec) {
		const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.symbol)}?range=1mo&interval=1d`;
		const data = await getJson(url, { "User-Agent": "Mozilla/5.0 (MagicMirror)" });
		const r = data.chart?.result?.[0];
		if (!r) throw new Error(data.chart?.error?.description || "resposta vazia");
		const closes = (r.indicators?.quote?.[0]?.close || []).filter(Number.isFinite);
		const price = r.meta?.regularMarketPrice ?? closes.at(-1);
		// Variação do dia: preço atual contra o fechamento anterior.
		const prev = closes.length >= 2 ? closes.at(-2) : r.meta?.previousClose;
		return {
			price,
			changePct: prev ? ((price - prev) / prev) * 100 : null,
			time: r.meta?.regularMarketTime ? new Date(r.meta.regularMarketTime * 1000).toISOString() : null,
			history: closes
		};
	}
};

module.exports = NodeHelper.create({
	start() {
		this.cache = new Map(); // id → { data, quoteAt, historyAt }

		// O front manda a lista de ativos na URL (?s=JSON) e recebe as cotações.
		this.expressApp.get("/MMM-Quotes/data", async (req, res) => {
			res.set("Cache-Control", "no-store");
			let specs;
			try {
				specs = JSON.parse(req.query.s || "[]");
			} catch {
				return res.status(400).json({ error: "parâmetro s inválido" });
			}
			const results = await Promise.all(specs.map((s) => this.get(s, req.query.history === "1")));
			res.json(results);
		});
	},

	async get(spec, withHistory) {
		const key = `${spec.source}:${spec.pair || spec.symbol}`;
		const entry = this.cache.get(key) || {};
		const now = Date.now();
		const fresh = now - (entry.quoteAt || 0) < QUOTE_TTL;
		const historyFresh = !withHistory || now - (entry.historyAt || 0) < HISTORY_TTL;
		if (entry.data && fresh && historyFresh) return { id: spec.id, ...entry.data };

		try {
			const provider = providers[spec.source];
			if (!provider) throw new Error(`fonte desconhecida: ${spec.source}`);
			const data = await provider(spec, withHistory && !historyFresh);
			if (!data.history && entry.data?.history) data.history = entry.data.history;
			entry.data = data;
			entry.quoteAt = now;
			if (withHistory && !historyFresh) entry.historyAt = now;
			this.cache.set(key, entry);
			return { id: spec.id, ...data };
		} catch (err) {
			console.warn(`[MMM-Quotes] ${spec.id}: ${err.message}`);
			// Falhou: devolve o último valor conhecido, marcado como desatualizado.
			return entry.data ? { id: spec.id, ...entry.data, stale: true } : { id: spec.id, error: err.message };
		}
	}
});