/* MMM-Quotes — busca cotações no servidor e entrega ao front por HTTP.
 *
 * Fontes (gratuitas, sem chave obrigatória):
 *   awesome → AwesomeAPI (moedas e cripto em BRL). Token opcional: AWESOMEAPI_TOKEN no .env
 *   yahoo   → Yahoo Finance chart API (índices, ações, metais). Não oficial.
 *   binance → API pública da Binance (velas intradiárias de cripto em BRL). Sem chave.
 *
 * Rota: GET /MMM-Quotes/data?s=<JSON dos ativos>&range=none|1d|5d|1mo|6mo|1y
 *   range=none → só cotação e variação do dia
 *   range=...  → também o histórico [{ t, v }] do período (minigráficos e gráfico grande)
 *
 * Cache: cotação 5 min; histórico intradiário (1d/5d) 5 min; diário 1 h.
 * Intradiário de moedas/cripto: a AwesomeAPI só tem fechamentos diários, então o
 * gráfico de 1d/5d vem do símbolo equivalente: campo `binance` (cripto, ex.: "BTCBRL")
 * ou `yahoo` (câmbio, ex.: "USDBRL=X"). O Yahoo não tem mais BTC-BRL.
 */
const fs = require("node:fs");
const path = require("node:path");
const NodeHelper = require("node_helper");

const QUOTE_TTL = 5 * 60 * 1000;
const HISTORY_TTL = 60 * 60 * 1000;
const TIMEOUT = 10 * 1000;
// Períodos: dias de fechamento (AwesomeAPI) e intervalo das velas (Yahoo)
const RANGES = {
	"1d": { interval: "5m", intraday: true, binance: { interval: "5m", limit: 288 } },
	"5d": { interval: "60m", intraday: true, binance: { interval: "1h", limit: 120 } },
	"1mo": { days: 30, interval: "1d" },
	"6mo": { days: 180, interval: "1d" },
	"1y": { days: 360, interval: "1d" }
};

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
// quote(spec)          → { price, changePct, time }
// history(spec, range) → [{ t: ms, v: número }] do mais antigo para o mais novo
const providers = {
	awesome: {
		token: () => (process.env.AWESOMEAPI_TOKEN ? `?token=${process.env.AWESOMEAPI_TOKEN}` : ""),
		async quote(spec) {
			const last = await getJson(`https://economia.awesomeapi.com.br/json/last/${spec.pair}${this.token()}`);
			const q = last[spec.pair.replace("-", "")];
			if (!q) throw new Error(`par ${spec.pair} ausente na resposta`);
			return { price: Number(q.bid), changePct: Number(q.pctChange), time: q.create_date };
		},
		async history(spec, range) {
			if (RANGES[range].intraday) {
				if (spec.binance) return providers.binance.history({ symbol: spec.binance }, range);
				if (spec.yahoo) return providers.yahoo.history({ symbol: spec.yahoo }, range);
				throw new Error(`sem símbolo intradiário (binance/yahoo) para ${spec.pair}`);
			}
			const daily = await getJson(`https://economia.awesomeapi.com.br/json/daily/${spec.pair}/${RANGES[range].days}${this.token()}`);
			return daily
				.map((d) => ({ t: Number(d.timestamp) * 1000, v: Number(d.bid) }))
				.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
				.reverse(); // a API devolve do mais novo para o mais antigo
		}
	},

	binance: {
		async history(spec, range) {
			const { interval, limit } = RANGES[range].binance;
			const url = `https://api.binance.com/api/v3/klines?symbol=${spec.symbol}&interval=${interval}&limit=${limit}`;
			const klines = await getJson(url);
			// Cada vela: [abertura (ms), open, high, low, close, ...] → usamos o fechamento.
			return klines.map((k) => ({ t: k[0], v: Number(k[4]) })).filter((p) => Number.isFinite(p.v));
		}
	},

	yahoo: {
		async chart(spec, range, interval) {
			const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(spec.symbol)}?range=${range}&interval=${interval}`;
			const data = await getJson(url, { "User-Agent": "Mozilla/5.0 (MagicMirror)" });
			const r = data.chart?.result?.[0];
			if (!r) throw new Error(data.chart?.error?.description || "resposta vazia");
			const closes = r.indicators?.quote?.[0]?.close || [];
			const points = (r.timestamp || [])
				.map((t, i) => ({ t: t * 1000, v: closes[i] }))
				.filter((p) => Number.isFinite(p.v));
			return { meta: r.meta || {}, points };
		},
		async quote(spec) {
			const { meta, points } = await this.chart(spec, "5d", "1d");
			const price = meta.regularMarketPrice ?? points.at(-1)?.v;
			// Variação do dia: preço atual contra o fechamento do pregão anterior.
			const prev = points.length >= 2 ? points.at(-2).v : meta.previousClose;
			return {
				price,
				changePct: prev ? ((price - prev) / prev) * 100 : null,
				time: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null
			};
		},
		async history(spec, range) {
			return (await this.chart(spec, range, RANGES[range].interval)).points;
		}
	}
};

module.exports = NodeHelper.create({
	start() {
		this.cache = new Map(); // chave → { at, value }

		this.expressApp.get("/MMM-Quotes/data", async (req, res) => {
			res.set("Cache-Control", "no-store");
			let specs;
			try {
				specs = JSON.parse(req.query.s || "[]");
			} catch {
				return res.status(400).json({ error: "parâmetro s inválido" });
			}
			const range = RANGES[req.query.range] ? req.query.range : null;
			res.json(await Promise.all(specs.map((s) => this.get(s, range))));
		});
	},

	/** Busca com cache; em falha devolve o último valor conhecido (stale). */
	async cached(key, ttl, fetcher) {
		const entry = this.cache.get(key);
		if (entry && Date.now() - entry.at < ttl) return { value: entry.value };
		try {
			const value = await fetcher();
			this.cache.set(key, { at: Date.now(), value });
			return { value };
		} catch (err) {
			if (entry) return { value: entry.value, stale: true, error: err.message };
			return { error: err.message };
		}
	},

	async get(spec, range) {
		const provider = providers[spec.source];
		if (!provider) return { id: spec.id, error: `fonte desconhecida: ${spec.source}` };
		const id = `${spec.source}:${spec.pair || spec.symbol}`;

		const quote = await this.cached(`q:${id}`, QUOTE_TTL, () => provider.quote(spec));
		const out = { id: spec.id, ...(quote.value || {}) };
		if (quote.stale) out.stale = true;
		if (!quote.value) out.error = quote.error;

		if (range) {
			const ttl = RANGES[range].intraday ? QUOTE_TTL : HISTORY_TTL;
			const hist = await this.cached(`h:${id}:${range}`, ttl, () => provider.history(spec, range));
			if (hist.value) out.history = hist.value;
			if (hist.error) {
				out.historyError = hist.error; // aparece na resposta da rota para diagnóstico
				console.warn(`[MMM-Quotes] ${spec.id} histórico ${range}: ${hist.error}`);
			}
		}
		if (out.error) console.warn(`[MMM-Quotes] ${spec.id}: ${out.error}`);
		return out;
	}
});