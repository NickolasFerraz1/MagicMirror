/* MMM-Quotes — cotações de moedas, cripto e índices
 *
 * mode: "strip" → faixa compacta (página Início): nome, valor e variação do dia
 * mode: "list"  → lista detalhada (página Cotações): + minigráfico de 30 dias
 *
 * Cada ativo em `symbols`:
 *   { id, label, source: "awesome", pair: "USD-BRL" }        moedas/cripto (AwesomeAPI)
 *   { id, label, source: "yahoo", symbol: "^BVSP", unit: "pts" }  índices/ações (Yahoo)
 */
Module.register("MMM-Quotes", {
	defaults: {
		mode: "strip",
		symbols: [],
		refreshInterval: 60 * 1000 // o servidor faz cache; isto só define a frequência de redesenho
	},

	start() {
		this.quotes = null;
		this.load();
		setInterval(() => this.load(), this.config.refreshInterval);
	},

	getStyles() {
		return ["MMM-Quotes.css"];
	},

	async load() {
		const specs = this.config.symbols.map(({ id, source, pair, symbol }) => ({ id, source, pair, symbol }));
		const history = this.config.mode === "list" ? "1" : "0";
		try {
			const res = await fetch(`MMM-Quotes/data?history=${history}&s=${encodeURIComponent(JSON.stringify(specs))}`, { cache: "no-store" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			this.quotes = await res.json();
			this.updateDom(0); // sem animação: evita a corrida com o MMM-pages (ver MMM-Briefing)
		} catch (err) {
			Log.warn(`[MMM-Quotes] não foi possível carregar: ${err.message}`);
		}
	},

	notificationReceived(notification) {
		if (notification === "DOM_OBJECTS_CREATED" && this.quotes) this.updateDom(0);
	},

	// ---------- Formatação ----------
	formatPrice(sym, price) {
		if (!Number.isFinite(price)) return "—";
		if (sym.unit) {
			return `${price.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} ${sym.unit}`;
		}
		const digits = price >= 1000 ? 0 : 2;
		return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: digits, maximumFractionDigits: digits });
	},

	formatPct(pct) {
		if (!Number.isFinite(pct)) return "";
		const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
		return `${sign}${Math.abs(pct).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
	},

	trendClass(pct) {
		if (!Number.isFinite(pct) || Math.abs(pct) < 0.005) return "flat";
		return pct > 0 ? "up" : "down";
	},

	sparkline(values) {
		const w = 140;
		const h = 36;
		if (!values || values.length < 2) return null;
		const min = Math.min(...values);
		const max = Math.max(...values);
		const span = max - min || 1;
		const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`);
		const trend = values.at(-1) >= values[0] ? "up" : "down";
		const ns = "http://www.w3.org/2000/svg";
		const svg = document.createElementNS(ns, "svg");
		svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
		svg.setAttribute("class", `quotes__spark ${trend}`);
		const line = document.createElementNS(ns, "polyline");
		line.setAttribute("points", pts.join(" "));
		svg.appendChild(line);
		return svg;
	},

	// ---------- Renderização ----------
	el(tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined) node.textContent = text;
		return node;
	},

	getDom() {
		const root = this.el("div", `quotes quotes--${this.config.mode}`);
		if (!this.quotes) {
			root.appendChild(this.el("div", "dimmed small", "Carregando cotações…"));
			return root;
		}
		const byId = Object.fromEntries(this.quotes.map((q) => [q.id, q]));
		for (const sym of this.config.symbols) {
			const q = byId[sym.id] || {};
			const item = this.el("div", `quotes__item${q.stale || q.error ? " is-stale" : ""}`);
			const info = this.el("div", "quotes__info");
			info.appendChild(this.el("div", "quotes__label", sym.label));
			info.appendChild(this.el("div", "quotes__price", q.error ? "indisponível" : this.formatPrice(sym, q.price)));
			info.appendChild(this.el("div", `quotes__pct ${this.trendClass(q.changePct)}`, this.formatPct(q.changePct)));
			item.appendChild(info);
			if (this.config.mode === "list") {
				const spark = this.sparkline(q.history);
				if (spark) item.appendChild(spark);
			}
			root.appendChild(item);
		}
		return root;
	}
});