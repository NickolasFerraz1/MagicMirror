/* MMM-Briefing — exibe o briefing diário gerado por briefing/briefing.py
 *
 * Duas instâncias no config.js:
 *   mode: "headlines" → página Início: 2 manchetes por categoria
 *   mode: "reader"    → página Briefing: notícia completa, uma por vez
 *
 * Navegação do leitor (notificações; o sensord.py vai enviá-las):
 *   BRIEFING_NEXT_ITEM / BRIEFING_PREV_ITEM          → notícia seguinte/anterior
 *   BRIEFING_NEXT_CATEGORY / BRIEFING_PREV_CATEGORY  → tema seguinte/anterior
 * Teclado (testes no navegador): ←/→ notícia, ↑/↓ tema. (Troca de página: MMM-Nav.)
 */
Module.register("MMM-Briefing", {
	defaults: {
		mode: "headlines",
		headlinesPerCategory: 2,
		keyboard: true,
		autoAdvance: 0, // ms entre notícias no leitor; 0 = desligado
		refreshInterval: 60 * 1000 // ms entre leituras do briefing.json
	},

	start() {
		this.briefing = null;
		this.cat = 0;
		this.item = 0;
		this.load();
		setInterval(() => this.load(), this.config.refreshInterval);
		if (this.config.mode === "reader") {
			if (this.config.keyboard) this.bindKeys();
			if (this.config.autoAdvance > 0) {
				setInterval(() => !this.hidden && this.step(1, 0), this.config.autoAdvance);
			}
		}
	},

	getStyles() {
		return ["MMM-Briefing.css"];
	},

	async load() {
		try {
			const res = await fetch("MMM-Briefing/data", { cache: "no-store" }); // rota do node_helper
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const text = await res.text();
			if (text === this.raw && this.rendered) return; // nada mudou
			this.applyData(JSON.parse(text));
			this.raw = text; // só marca como lido depois de aplicar com sucesso
		} catch (err) {
			Log.warn(`[MMM-Briefing] não foi possível carregar o briefing: ${err.message}`);
		}
	},

	applyData(payload) {
		const sameDay = this.briefing && this.briefing.data === payload.data;
		this.briefing = payload;
		if (!sameDay) this.cat = this.item = 0;
		// Sem animação (velocidade 0): uma atualização animada espera o fim do
		// "fade out" para trocar o conteúdo, e se o MMM-pages esconder/mostrar o
		// módulo nesse meio-tempo, o MagicMirror² cancela esse timer e a troca
		// nunca acontece (era o "Aguardando briefing…" preso no Pi).
		this.updateDom(0);
	},

	notificationReceived(notification) {
		// Se os dados chegaram antes de o DOM existir (comum no Pi, mais lento),
		// redesenha assim que o MagicMirror² terminar de montar a página.
		if (notification === "DOM_OBJECTS_CREATED") {
			this.rendered = true;
			if (this.briefing) this.updateDom(0);
		}
		if (this.config.mode !== "reader") return;
		const moves = {
			BRIEFING_NEXT_ITEM: [1, 0],
			BRIEFING_PREV_ITEM: [-1, 0],
			BRIEFING_NEXT_CATEGORY: [0, 1],
			BRIEFING_PREV_CATEGORY: [0, -1]
		};
		if (moves[notification]) this.step(...moves[notification]);
	},

	bindKeys() {
		const keys = {
			ArrowRight: () => this.step(1, 0),
			ArrowLeft: () => this.step(-1, 0),
			ArrowDown: () => this.step(0, 1),
			ArrowUp: () => this.step(0, -1)
		};
		document.addEventListener("keydown", (e) => {
			if (!keys[e.key] || this.hidden) return; // só navega com a página visível
			e.preventDefault();
			keys[e.key]();
		});
	},

	/** Avança notícia (di) ou tema (dc), com volta circular. */
	step(di, dc) {
		const cats = this.briefing?.categorias;
		if (!cats?.length) return;
		if (dc) {
			this.cat = (this.cat + dc + cats.length) % cats.length;
			this.item = 0;
		} else {
			const n = cats[this.cat].noticias.length;
			this.item += di;
			if (this.item >= n) { // passou da última: próximo tema
				this.cat = (this.cat + 1) % cats.length;
				this.item = 0;
			} else if (this.item < 0) { // antes da primeira: tema anterior, última notícia
				this.cat = (this.cat - 1 + cats.length) % cats.length;
				this.item = cats[this.cat].noticias.length - 1;
			}
		}
		this.updateDom(0); // mesmo motivo do applyData
	},

	// ---------- Renderização ----------
	el(tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined) node.textContent = text;
		return node;
	},

	dateLabel() {
		const [y, m, d] = this.briefing.data.split("-").map(Number);
		const date = new Date(y, m - 1, d);
		const today = new Date();
		const isToday = date.toDateString() === today.toDateString();
		const label = date.toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
		return isToday ? label : `${label} · desatualizado`;
	},

	getDom() {
		const root = this.el("div", `briefing briefing--${this.config.mode}`);
		if (!this.briefing) {
			root.appendChild(this.el("div", "dimmed small", "Aguardando briefing…"));
			return root;
		}
		return this.config.mode === "reader" ? this.renderReader(root) : this.renderHeadlines(root);
	},

	renderHeadlines(root) {
		const head = this.el("div", "briefing__head");
		head.appendChild(this.el("span", "briefing__title", "Briefing"));
		head.appendChild(this.el("span", "briefing__date", this.dateLabel()));
		root.appendChild(head);

		for (const cat of this.briefing.categorias) {
			const block = this.el("div", `briefing__cat cat-${cat.id}`);
			block.appendChild(this.el("div", "briefing__catname", cat.nome));
			for (const n of cat.noticias.slice(0, this.config.headlinesPerCategory)) {
				block.appendChild(this.el("div", "briefing__headline", n.titulo));
			}
			root.appendChild(block);
		}
		return root;
	},

	renderReader(root) {
		const cats = this.briefing.categorias;
		const cat = cats[this.cat];
		const n = cat.noticias[this.item];

		const tabs = this.el("div", "briefing__tabs");
		cats.forEach((c, i) => {
			const tab = this.el("span", `briefing__tab cat-${c.id}${i === this.cat ? " is-active" : ""}`, c.id);
			tabs.appendChild(tab);
		});
		root.appendChild(tabs);

		const article = this.el("article", `briefing__article cat-${cat.id}`);
		article.appendChild(this.el("div", "briefing__catname", `${cat.nome} · ${this.item + 1}/${cat.noticias.length}`));
		article.appendChild(this.el("h2", "briefing__articletitle", n.titulo));
		article.appendChild(this.el("p", "briefing__resumo", n.resumo));
		if (n.fonte) article.appendChild(this.el("div", "briefing__fonte", n.fonte));
		root.appendChild(article);

		const dots = this.el("div", "briefing__dots");
		cat.noticias.forEach((_, i) => dots.appendChild(this.el("span", i === this.item ? "is-active" : "")));
		root.appendChild(dots);

		root.appendChild(this.el("div", "briefing__date", this.dateLabel()));
		return root;
	}
});