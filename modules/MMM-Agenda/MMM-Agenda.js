/* MMM-Agenda — mostra o app Projeto Agenda (FastAPI no mesmo Pi) no espelho
 *
 * Duas instâncias no config.js:
 *   mode: "today" → página Início, coluna "Hoje": agenda do dia, atrasados e pendências
 *   mode: "week"  → página Agenda: 7 dias a partir de hoje (ou da semana navegada)
 *
 * Navegação da semana (notificações; o sensord.py vai enviá-las):
 *   AGENDA_NEXT_WEEK / AGENDA_PREV_WEEK / AGENDA_THIS_WEEK
 * Teclado (testes no navegador): ←/→ semana, ↓ volta para esta semana. (Troca de página: MMM-Nav.)
 * Os dados vêm do node_helper (rotas /MMM-Agenda/*), que repassa para a API local.
 */
Module.register("MMM-Agenda", {
	defaults: {
		mode: "today",
		maxEntries: 8, // today: linhas da agenda antes de "+N"
		maxPending: 3, // today: pendências mostradas
		days: 7, // week
		keyboard: true,
		refreshInterval: 60 * 1000, // também redesenha (destaque do "agora")
		resetAfter: 2 * 60 * 1000 // week: volta para esta semana depois de um tempo parado
	},

	start() {
		this.data_ = null;
		this.error = null;
		this.offset = 0; // semanas a partir de hoje (week)
		this.lastMove = 0;
		this.load();
		setInterval(() => {
			if (this.config.mode === "week" && this.offset && Date.now() - this.lastMove > this.config.resetAfter) this.offset = 0;
			this.load();
		}, this.config.refreshInterval);
		if (this.config.mode === "week" && this.config.keyboard) this.bindKeys();
	},

	getStyles() {
		return ["MMM-Agenda.css"];
	},

	// ---------- Datas (sempre no horário local, sem fuso: igual ao app) ----------
	iso(d) {
		const p = (n) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
	},

	parse(s) {
		// "2026-10-18T19:00:00" ou "2026-10-18" → Date local
		const [d, t = "00:00:00"] = s.split("T");
		const [y, m, dd] = d.split("-").map(Number);
		const [hh, mi] = t.split(":").map(Number);
		return new Date(y, m - 1, dd, hh, mi);
	},

	hhmm(s) {
		return s ? s.slice(11, 16) : "";
	},

	range() {
		const de = new Date();
		de.setHours(0, 0, 0, 0);
		de.setDate(de.getDate() + this.offset * this.config.days);
		const ate = new Date(de);
		ate.setDate(ate.getDate() + this.config.days - 1);
		return [de, ate];
	},

	// ---------- Dados ----------
	async load() {
		let url = "MMM-Agenda/hoje";
		if (this.config.mode === "week") {
			const [de, ate] = this.range();
			url = `MMM-Agenda/agenda?de=${this.iso(de)}&ate=${this.iso(ate)}`;
		}
		try {
			const res = await fetch(url, { cache: "no-store" });
			const body = await res.json();
			if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
			this.data_ = body;
			this.error = null;
		} catch (err) {
			this.error = err.message;
			Log.warn(`[MMM-Agenda] ${err.message}`);
		}
		// Sem animação: ver o comentário do MMM-Briefing (MMM-pages + updateDom animado)
		this.updateDom(0);
	},

	notificationReceived(notification) {
		if (notification === "DOM_OBJECTS_CREATED" && this.data_) this.updateDom(0);
		if (this.config.mode !== "week") return;
		if (notification === "AGENDA_NEXT_WEEK") this.move(1);
		if (notification === "AGENDA_PREV_WEEK") this.move(-1);
		if (notification === "AGENDA_THIS_WEEK") this.move(0, true);
	},

	bindKeys() {
		const keys = {
			ArrowRight: () => this.move(1),
			ArrowLeft: () => this.move(-1),
			ArrowDown: () => this.move(0, true)
		};
		document.addEventListener("keydown", (e) => {
			if (!keys[e.key] || this.hidden) return; // só com a página visível
			e.preventDefault();
			keys[e.key]();
		});
	},

	move(dir, reset = false) {
		const novo = reset ? 0 : this.offset + dir;
		if (novo === this.offset) return;
		this.offset = novo;
		this.lastMove = Date.now();
		this.load();
	},

	// ---------- Renderização ----------
	el(tag, cls, text) {
		const node = document.createElement(tag);
		if (cls) node.className = cls;
		if (text !== undefined) node.textContent = text;
		return node;
	},

	getDom() {
		const root = this.el("div", `agenda agenda--${this.config.mode}`);
		if (!this.data_) {
			root.appendChild(this.el("div", "dimmed small", this.error ? "Agenda indisponível" : "Carregando agenda…"));
			return root;
		}
		if (this.error) root.appendChild(this.el("div", "agenda__erro", "sem conexão com o app · dados anteriores"));
		return this.config.mode === "week" ? this.renderWeek(root) : this.renderToday(root);
	},

	/** Estado da entrada em relação a agora: done | now | past | "" */
	state(e, agora) {
		if (e.status === "concluido" || e.status === "pulado") return "done";
		if (e.dia_inteiro || !e.inicio || e.tipo_entrada === "prazo") return "";
		const ini = this.parse(e.inicio);
		const fim = e.fim ? this.parse(e.fim) : new Date(ini.getTime() + (e.duracao_min || 30) * 60000);
		if (agora >= fim) return "past";
		if (agora >= ini) return "now";
		return "";
	},

	entry(e, agora) {
		const st = this.state(e, agora);
		const row = this.el("div", `agenda__entry ${st ? `is-${st}` : ""} prio-${e.prioridade}`);
		row.style.setProperty("--area", e.area_cor);

		const quando = this.el("span", "agenda__time");
		if (e.tipo_entrada === "prazo") quando.textContent = e.inicio && !e.inicio.endsWith("23:59:00") ? `⏰ ${this.hhmm(e.inicio)}` : "⏰";
		else quando.textContent = e.dia_inteiro ? "dia" : this.hhmm(e.inicio);
		row.appendChild(quando);

		const corpo = this.el("span", "agenda__body");
		const titulo = this.el("span", "agenda__title", (st === "done" ? "✓ " : "") + e.titulo);
		corpo.appendChild(titulo);
		const meta = [e.projeto_caminho || e.area_nome];
		if (e.tipo_entrada === "prazo") meta.unshift("prazo");
		if (e.recorrente) meta.push("↻");
		corpo.appendChild(this.el("span", "agenda__meta", meta.filter(Boolean).join(" · ")));
		row.appendChild(corpo);
		return row;
	},

	renderToday(root) {
		const { agenda, atrasados } = this.data_;
		let { pendencias } = this.data_;
		const agora = new Date();

		if (!agenda.length) root.appendChild(this.el("div", "agenda__vazio", "Nada marcado para hoje."));
		const lista = this.el("div", "agenda__list");
		agenda.slice(0, this.config.maxEntries).forEach((e) => lista.appendChild(this.entry(e, agora)));
		root.appendChild(lista);
		if (agenda.length > this.config.maxEntries) {
			root.appendChild(this.el("div", "agenda__mais", `+${agenda.length - this.config.maxEntries} mais`));
		}

		if (atrasados.length) {
			const bloco = this.el("div", "agenda__bloco agenda__bloco--alerta");
			bloco.appendChild(this.el("div", "agenda__rotulo", `Atrasados · ${atrasados.length}`));
			atrasados.slice(0, 2).forEach((i) => bloco.appendChild(this.item(i)));
			root.appendChild(bloco);
		}

		const naAgenda = new Set(agenda.map((e) => e.item_id)); // ex.: prazo de hoje já aparece acima
		pendencias = pendencias.filter((i) => !naAgenda.has(i.id));
		if (pendencias.length && this.config.maxPending > 0) {
			const bloco = this.el("div", "agenda__bloco");
			bloco.appendChild(this.el("div", "agenda__rotulo", `Pendências · ${pendencias.length}`));
			pendencias.slice(0, this.config.maxPending).forEach((i) => bloco.appendChild(this.item(i)));
			root.appendChild(bloco);
		}
		return root;
	},

	/** Linha simples para atrasados/pendências (ItemOut). */
	item(i) {
		const row = this.el("div", `agenda__item prio-${i.prioridade}`);
		row.style.setProperty("--area", i.area_cor);
		row.appendChild(this.el("span", "agenda__dot"));
		row.appendChild(this.el("span", "agenda__title", i.titulo));
		return row;
	},

	dayLabel(d, hoje) {
		const diff = Math.round((d - hoje) / 86400000);
		const curto = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");
		if (diff === 0) return ["Hoje", curto];
		if (diff === 1) return ["Amanhã", curto];
		if (diff === -1) return ["Ontem", curto];
		const nome = d.toLocaleDateString("pt-BR", { weekday: "long" });
		return [nome[0].toUpperCase() + nome.slice(1), d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })];
	},

	renderWeek(root) {
		const [de, ate] = this.range();
		const hoje = new Date();
		hoje.setHours(0, 0, 0, 0);
		const fmt = (d) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");

		const head = this.el("div", "agenda__head");
		head.appendChild(this.el("span", "agenda__titulo", "Agenda"));
		const sufixo = this.offset === 0 ? "" : this.offset > 0 ? ` · +${this.offset} sem` : ` · ${this.offset} sem`;
		head.appendChild(this.el("span", "agenda__periodo", `${fmt(de)} – ${fmt(ate)}${sufixo}`));
		root.appendChild(head);

		const porDia = {};
		for (const e of this.data_) (porDia[e.data] ||= []).push(e);

		const agora = new Date();
		for (let d = new Date(de); d <= ate; d.setDate(d.getDate() + 1)) {
			const entradas = porDia[this.iso(d)] || [];
			const [nome, data] = this.dayLabel(d, hoje);
			const dia = this.el("section", `agenda__day${d.getTime() === hoje.getTime() ? " is-today" : ""}${entradas.length ? "" : " is-empty"}`);
			const cab = this.el("div", "agenda__dayhead");
			cab.appendChild(this.el("span", "agenda__dayname", nome));
			cab.appendChild(this.el("span", "agenda__daydate", data));
			if (entradas.length) cab.appendChild(this.el("span", "agenda__count", String(entradas.length)));
			dia.appendChild(cab);
			entradas.forEach((e) => dia.appendChild(this.entry(e, agora)));
			root.appendChild(dia);
		}
		return root;
	}
});
