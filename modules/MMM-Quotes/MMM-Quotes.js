/* MMM-Quotes — cotações de moedas, cripto, metais e índices
 *
 * mode: "strip"    → faixa compacta (página Início): nome, valor e variação do dia
 * mode: "explorer" → página Cotações: categorias em abas, lista com minigráficos e,
 *                    ao abrir um ativo, gráfico grande com escolha de período
 *
 * Ativo: { id, label, source: "awesome", pair: "USD-BRL", yahoo: "USDBRL=X" }
 *        (yahoo: símbolo equivalente, usado só nos gráficos de 1D e 5D)
 *        { id, label, source: "yahoo", symbol: "^BVSP", unit: "pts" }
 *        currency: "USD" para cotar em dólar (padrão: BRL)
 *
 * Navegação (notificações — o sensord.py vai enviá-las):
 *   QUOTES_NEXT / QUOTES_PREV                    → próximo/anterior ativo (ou período, com o gráfico aberto)
 *   QUOTES_NEXT_CATEGORY / QUOTES_PREV_CATEGORY  → categoria seguinte/anterior
 *   QUOTES_OPEN / QUOTES_CLOSE                   → abre/fecha o gráfico do ativo selecionado
 * Teclado (testes): ↑/↓ ativo ou período, ←/→ categoria, Enter abre/fecha, Esc fecha.
 */
Module.register("MMM-Quotes", {
	defaults: {
		mode: "strip",
		symbols: [], // modo strip
		categories: [], // modo explorer: [{ id, label, symbols: [...] }]
		keyboard: true,
		refreshInterval: 60 * 1000 // o servidor faz cache; isto só define a frequência de leitura
	},

	RANGES: [
		{ id: "1d", label: "1D", text: "no dia", intraday: true },
		{ id: "5d", label: "5D", text: "em 5 dias", intraday: true },
		{ id: "1mo", label: "1M", text: "em 1 mês" },
		{ id: "6mo", label: "6M", text: "em 6 meses" },
		{ id: "1y", label: "1A", text: "em 1 ano" }
	],

	DEFAULT_RANGE: 2, // 1M

	start() {
		this.quotes = {}; // id → cotação (+ history de 1 mês no explorer)
		this.detailHistory = {}; // `${id}:${range}` → history
		this.cat = 0;
		this.sel = 0;
		this.open = false;
		this.range = this.DEFAULT_RANGE;
		this.load();
		setInterval(() => this.load(), this.config.refreshInterval);
		if (this.config.mode === "explorer" && this.config.keyboard) this.bindKeys();
	},

	getStyles() {
		return ["MMM-Quotes.css"];
	},

	// ---------- Dados ----------
	allSymbols() {
		return this.config.mode === "explorer" ? this.config.categories.flatMap((c) => c.symbols) : this.config.symbols;
	},

	async request(symbols, range) {
		const specs = symbols.map(({ id, source, pair, symbol, yahoo }) => ({ id, source, pair, symbol, yahoo }));
		const url = `MMM-Quotes/data?range=${range}&s=${encodeURIComponent(JSON.stringify(specs))}`;
		const res = await fetch(url, { cache: "no-store" });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return res.json();
	},

	async load() {
		try {
			const range = this.config.mode === "explorer" ? "1mo" : "none";
			for (const q of await this.request(this.allSymbols(), range)) this.quotes[q.id] = q;
			this.updateDom(0); // sem animação: evita a corrida com o MMM-pages (ver MMM-Briefing)
		} catch (err) {
			Log.warn(`[MMM-Quotes] não foi possível carregar: ${err.message}`);
		}
	},

	async loadDetail() {
		const sym = this.selected();
		const range = this.RANGES[this.range].id;
		const key = `${sym.id}:${range}`;
		if (range === "1mo" || this.detailHistory[key]) return this.updateDom(0);
		try {
			const [q] = await this.request([sym], range);
			if (q.history?.length) this.detailHistory[key] = q.history;
			else this.failed(key, q.error || "sem dados");
		} catch (err) {
			this.failed(key, err.message);
		}
		this.updateDom(0);
	},

	/** Marca o período como indisponível; libera nova tentativa em 5 min. */
	failed(key, reason) {
		Log.warn(`[MMM-Quotes] histórico ${key}: ${reason}`);
		this.detailHistory[key] = "failed";
		setTimeout(() => {
			if (this.detailHistory[key] === "failed") delete this.detailHistory[key];
		}, 5 * 60 * 1000);
	},

	historyFor(sym) {
		const range = this.RANGES[this.range].id;
		return range === "1mo" ? this.quotes[sym.id]?.history : this.detailHistory[`${sym.id}:${range}`];
	},

	// ---------- Navegação ----------
	category() {
		return this.config.categories[this.cat];
	},

	selected() {
		return this.category().symbols[this.sel];
	},

	notificationReceived(notification) {
		if (notification === "DOM_OBJECTS_CREATED" && Object.keys(this.quotes).length) this.updateDom(0);
		if (this.config.mode !== "explorer") return;
		const actions = {
			QUOTES_NEXT: () => this.move(1),
			QUOTES_PREV: () => this.move(-1),
			QUOTES_NEXT_CATEGORY: () => this.switchCategory(1),
			QUOTES_PREV_CATEGORY: () => this.switchCategory(-1),
			QUOTES_OPEN: () => this.toggle(true),
			QUOTES_CLOSE: () => this.toggle(false)
		};
		actions[notification]?.();
	},

	bindKeys() {
		const keys = {
			ArrowDown: () => this.move(1),
			ArrowUp: () => this.move(-1),
			ArrowRight: () => this.switchCategory(1),
			ArrowLeft: () => this.switchCategory(-1),
			Enter: () => this.toggle(!this.open),
			Escape: () => this.toggle(false)
		};
		document.addEventListener("keydown", (e) => {
			if (!keys[e.key] || this.hidden) return; // só com a página visível
			e.preventDefault();
			keys[e.key]();
		});
	},

	/** Com o gráfico aberto, ↑/↓ troca o período; fechado, troca o ativo. */
	move(dir) {
		if (this.open) {
			this.range = (this.range + dir + this.RANGES.length) % this.RANGES.length;
			return this.loadDetail();
		}
		const n = this.category().symbols.length;
		this.sel = (this.sel + dir + n) % n;
		this.updateDom(0);
	},

	switchCategory(dir) {
		const n = this.config.categories.length;
		this.cat = (this.cat + dir + n) % n;
		this.sel = 0;
		this.open = false;
		this.updateDom(0);
	},

	toggle(open) {
		this.open = open;
		this.range = this.DEFAULT_RANGE;
		if (open) this.loadDetail();
		else this.updateDom(0);
	},

	// ---------- Formatação ----------
	formatPrice(sym, price, compact = false) {
		if (!Number.isFinite(price)) return "—";
		if (sym.unit) return `${price.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}${compact ? "" : ` ${sym.unit}`}`;
		const digits = price >= 1000 ? 0 : 2;
		return price.toLocaleString("pt-BR", {
			style: compact ? "decimal" : "currency",
			currency: sym.currency || "BRL",
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		});
	},

	formatPct(pct) {
		if (!Number.isFinite(pct)) return "";
		const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
		return `${sign}${Math.abs(pct).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
	},

	trend(pct) {
		if (!Number.isFinite(pct) || Math.abs(pct) < 0.005) return "flat";
		return pct > 0 ? "up" : "down";
	},

	// ---------- Gráficos (SVG) ----------
	svg(tag, attrs = {}) {
		const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
		for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
		return node;
	},

	sparkline(history) {
		if (!history || history.length < 2) return null;
		const w = 140;
		const h = 36;
		const vs = history.map((p) => p.v);
		const min = Math.min(...vs);
		const span = Math.max(...vs) - min || 1;
		const pts = vs.map((v, i) => `${((i / (vs.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`);
		const root = this.svg("svg", { viewBox: `0 0 ${w} ${h}`, class: `quotes__spark ${vs.at(-1) >= vs[0] ? "up" : "down"}` });
		root.appendChild(this.svg("polyline", { points: pts.join(" ") }));
		return root;
	},

	/** Gráfico grande: área, grade com 4 valores no eixo Y e 3 datas no eixo X. */
	bigChart(sym, history) {
		const W = 780;
		const H = 440;
		const pad = { l: 8, r: 96, t: 16, b: 40 };
		const root = this.svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "quotes__chart" });
		if (!Array.isArray(history) || history.length < 2) {
			const t = this.svg("text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "quotes__axis" });
			t.textContent = history === "failed" ? "Histórico indisponível para este período" : "Carregando histórico…";
			root.appendChild(t);
			return root;
		}
		const vs = history.map((p) => p.v);
		let min = Math.min(...vs);
		let max = Math.max(...vs);
		const margin = (max - min || max * 0.01) * 0.08;
		min -= margin;
		max += margin;
		const x = (i) => pad.l + (i / (history.length - 1)) * (W - pad.l - pad.r);
		const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
		const trend = vs.at(-1) >= vs[0] ? "up" : "down";

		// Grade e eixo Y (à direita, como no gráfico de referência)
		for (let k = 0; k <= 3; k++) {
			const v = min + ((max - min) * k) / 3;
			root.appendChild(this.svg("line", { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: "quotes__grid" }));
			const label = this.svg("text", { x: W - pad.r + 12, y: y(v) + 6, class: "quotes__axis" });
			label.textContent = this.formatPrice(sym, v, true);
			root.appendChild(label);
		}

		// Área e linha
		const line = history.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
		const gradId = `qgrad-${this.identifier}`;
		const defs = this.svg("defs");
		const grad = this.svg("linearGradient", { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
		grad.appendChild(this.svg("stop", { offset: "0%", class: `quotes__stop-top ${trend}` }));
		grad.appendChild(this.svg("stop", { offset: "100%", class: "quotes__stop-bottom" }));
		defs.appendChild(grad);
		root.appendChild(defs);
		const baseY = H - pad.b;
		root.appendChild(this.svg("polygon", { points: `${x(0)},${baseY} ${line} ${x(history.length - 1)},${baseY}`, fill: `url(#${gradId})` }));
		root.appendChild(this.svg("polyline", { points: line, class: `quotes__line ${trend}` }));

		// Ponto final
		const lx = x(history.length - 1);
		const ly = y(vs.at(-1));
		root.appendChild(this.svg("line", { x1: lx, x2: lx, y1: pad.t, y2: baseY, class: "quotes__cursor" }));
		root.appendChild(this.svg("circle", { cx: lx, cy: ly, r: 6, class: `quotes__dot ${trend}` }));

		// Eixo X: início, meio e fim (hora no 1D; dia e hora no 5D; data nos demais)
		const r = this.RANGES[this.range];
		const fmt = (t) => {
			const d = new Date(t);
			if (r.id === "1d") return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
			if (r.id === "5d") return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" }).replace(".", "");
			return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
		};
		[0, Math.floor((history.length - 1) / 2), history.length - 1].forEach((i, k) => {
			const label = this.svg("text", { x: x(i), y: H - 10, "text-anchor": ["start", "middle", "end"][k], class: "quotes__axis" });
			label.textContent = fmt(history[i].t);
			root.appendChild(label);
		});
		return root;
	},

	// ---------- Renderização ----------
	el(tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined) node.textContent = text;
		return node;
	},

	renderItem(sym, { selected = false, spark = false } = {}) {
		const q = this.quotes[sym.id] || {};
		const item = this.el("div", `quotes__item${selected ? " is-selected" : ""}${q.stale || q.error ? " is-stale" : ""}`);
		const info = this.el("div", "quotes__info");
		info.appendChild(this.el("div", "quotes__label", sym.label));
		info.appendChild(this.el("div", "quotes__price", q.error && !Number.isFinite(q.price) ? "indisponível" : this.formatPrice(sym, q.price)));
		info.appendChild(this.el("div", `quotes__pct ${this.trend(q.changePct)}`, this.formatPct(q.changePct)));
		item.appendChild(info);
		if (spark) {
			const s = this.sparkline(q.history);
			if (s) item.appendChild(s);
		}
		return item;
	},

	getDom() {
		const root = this.el("div", `quotes quotes--${this.config.mode}`);
		if (!Object.keys(this.quotes).length) {
			root.appendChild(this.el("div", "dimmed small", "Carregando cotações…"));
			return root;
		}
		if (this.config.mode === "strip") {
			for (const sym of this.config.symbols) root.appendChild(this.renderItem(sym));
			return root;
		}

		// Abas de categoria
		const tabs = this.el("div", "quotes__tabs");
		this.config.categories.forEach((c, i) => tabs.appendChild(this.el("span", `quotes__tab${i === this.cat ? " is-active" : ""}`, c.label)));
		root.appendChild(tabs);

		if (!this.open) {
			const list = this.el("div", "quotes__list");
			this.category().symbols.forEach((sym, i) => list.appendChild(this.renderItem(sym, { selected: i === this.sel, spark: true })));
			root.appendChild(list);
			return root;
		}

		// Gráfico do ativo selecionado
		const sym = this.selected();
		const q = this.quotes[sym.id] || {};
		const history = this.historyFor(sym);
		const detail = this.el("div", "quotes__detail");
		detail.appendChild(this.el("div", "quotes__label", sym.label));
		detail.appendChild(this.el("div", "quotes__bigprice", this.formatPrice(sym, q.price)));

		const changes = this.el("div", "quotes__changes");
		changes.appendChild(this.el("span", `quotes__pct ${this.trend(q.changePct)}`, `${this.formatPct(q.changePct)} hoje`));
		if (Array.isArray(history) && history.length > 1 && this.RANGES[this.range].id !== "1d") { // no 1D seria igual ao "hoje"
			const periodPct = ((history.at(-1).v - history[0].v) / history[0].v) * 100;
			changes.appendChild(this.el("span", `quotes__pct ${this.trend(periodPct)}`, `${this.formatPct(periodPct)} ${this.RANGES[this.range].text}`));
		}
		detail.appendChild(changes);

		const ranges = this.el("div", "quotes__ranges");
		this.RANGES.forEach((r, i) => ranges.appendChild(this.el("span", `quotes__range${i === this.range ? " is-active" : ""}`, r.label)));
		detail.appendChild(ranges);
		detail.appendChild(this.bigChart(sym, history));
		root.appendChild(detail);
		return root;
	}
});