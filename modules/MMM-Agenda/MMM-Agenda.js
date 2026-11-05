/* MMM-Agenda — mostra o app Projeto Agenda (FastAPI no mesmo Pi) no espelho
 *
 * Modos (uma instância por modo no config.js):
 *   mode: "today" → página Início, coluna "Hoje": próximas atividades, atrasados e pendências
 *   mode: "day"   → página Agenda: grade do dia (00:00–24:00) com os horários livres;
 *                   se não couber, a janela começa na hora atual e "rola" com o tempo.
 *                   Alterna com a visão de mês (até 2 títulos por dia + "+N").
 *                   No topo: etapa atual dos planos (/api/planos/andamento).
 *   mode: "week"  → lista de 7 dias (alternativa à grade)
 *
 * Navegação (notificações; o sensord.py vai enviá-las):
 *   AGENDA_NEXT / AGENDA_PREV          → dia (ou semana; no mês: mês) seguinte/anterior
 *   AGENDA_NEXT_WEEK / AGENDA_PREV_WEEK → pula 7 dias (no modo "day")
 *   AGENDA_SCROLL_UP / AGENDA_SCROLL_DOWN → rola a grade do dia (scrollStep horas)
 *   AGENDA_TODAY                        → volta para hoje
 *   AGENDA_GOTO_DATE, payload "AAAA-MM-DD" → abre um dia específico
 *   AGENDA_VIEW_MONTH / AGENDA_VIEW_DAY / AGENDA_TOGGLE_VIEW → mês / dia / alterna (modo "day")
 * Teclado: ←/→ dia (no mês: mês), ↑/↓ rola a grade (no "week": semana), M mês/dia, 0 hoje.
 * (Troca de página: MMM-Nav.) Parado por resetAfter, volta sozinho para o dia de hoje.
 * Os dados vêm do node_helper (rotas /MMM-Agenda/*), que repassa para a API local.
 */
Module.register("MMM-Agenda", {
	defaults: {
		mode: "today",
		maxEntries: 4, // today: próximas atividades mostradas (o resto vira "+N mais tarde")
		maxLate: 1, // today: atrasados mostrados (a contagem aparece sempre)
		maxPending: 2, // today: pendências mostradas
		days: 7, // week
		hourHeight: 64, // day: altura (px) de uma hora na grade
		gridHeight: 0.74, // day: altura visível da grade (fração da tela; ou px se > 1)
		freeFrom: 7, // day: só marca "livre" a partir desta hora…
		freeTo: 23, //  …até esta (madrugada não conta como horário vago)
		minFree: 60, // day: menor intervalo (min) marcado como livre
		scrollStep: 3, // day: horas por toque em ↑/↓
		maxPlans: 3, // day: planos no topo (etapa atual); 0 = não mostra
		monthTitles: 2, // day (mês): títulos por dia; o resto vira "+N"
		keyboard: true,
		refreshInterval: 60 * 1000, // também redesenha (destaque do "agora" e rolagem)
		resetAfter: 2 * 60 * 1000 // day/week: volta para hoje depois de um tempo parado
	},

	start() {
		this.data_ = null;
		this.error = null;
		this.offset = 0; // dias (day) ou semanas (week) a partir de hoje
		this.lastMove = 0;
		this.rolagem = 0; // day: horas roladas à mão (relativas à janela automática)
		this.vista = "dia"; // day: "dia" | "mes"
		this.mes = 0; // day (mês): meses a partir do mês de hoje
		this.planos = [];
		this.navega = ["day", "week"].includes(this.config.mode);
		this.load();
		setInterval(() => {
			const mexido = this.offset || this.rolagem || this.mes || this.vista !== "dia";
			if (this.navega && mexido && Date.now() - this.lastMove > this.config.resetAfter) {
				this.offset = this.rolagem = this.mes = 0;
				this.vista = "dia";
			}
			this.load();
		}, this.config.refreshInterval);
		if (this.navega && this.config.keyboard) this.bindKeys();
	},

	// Na página Agenda a grade sobe (sem a coluna "Hoje" não precisa começar em 42%)
	resume() {
		if (this.config.mode === "day") document.body.classList.add("agenda-dia-visivel");
	},

	suspend() {
		if (this.config.mode === "day") document.body.classList.remove("agenda-dia-visivel");
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
		if (this.config.mode === "day" && this.vista === "mes") return this.rangeMes();
		const de = new Date();
		de.setHours(0, 0, 0, 0);
		const span = this.config.mode === "day" ? 1 : this.config.days;
		de.setDate(de.getDate() + this.offset * span);
		const ate = new Date(de);
		ate.setDate(ate.getDate() + span - 1);
		return [de, ate];
	},

	/** Mês exibido (dia 1) e a grade completa: da segunda antes do dia 1 ao domingo depois do último. */
	refMes() {
		const ref = new Date();
		ref.setHours(0, 0, 0, 0);
		ref.setDate(1);
		ref.setMonth(ref.getMonth() + this.mes);
		return ref;
	},

	rangeMes() {
		const ref = this.refMes();
		const de = new Date(ref);
		de.setDate(1 - ((ref.getDay() + 6) % 7));
		const ate = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
		ate.setDate(ate.getDate() + (6 - ((ate.getDay() + 6) % 7)));
		return [de, ate];
	},

	// ---------- Dados ----------
	async load() {
		let url = "MMM-Agenda/hoje";
		if (this.navega) {
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
		if (this.config.mode === "day" && this.config.maxPlans > 0) await this.loadPlanos();
		// Sem animação: ver o comentário do MMM-Briefing (MMM-pages + updateDom animado)
		this.updateDom(0);
	},

	async loadPlanos() {
		try {
			const res = await fetch(`MMM-Agenda/planos?limite=${this.config.maxPlans}`, { cache: "no-store" });
			if (res.ok) this.planos = await res.json();
		} catch (err) {
			Log.warn(`[MMM-Agenda] planos: ${err.message}`); // mantém os anteriores
		}
	},

	notificationReceived(notification, payload) {
		if (notification === "DOM_OBJECTS_CREATED" && this.data_) this.updateDom(0);
		this.notificationReceivedAlways(notification, payload);
		if (!this.navega || this.hidden) return;
		const semana = this.config.mode === "day" ? 7 : 1;
		const mes = this.vista === "mes";
		if (notification === "AGENDA_NEXT") (mes ? this.mudarMes(1) : this.move(1));
		if (notification === "AGENDA_PREV") (mes ? this.mudarMes(-1) : this.move(-1));
		if (notification === "AGENDA_NEXT_WEEK" && !mes) this.move(semana);
		if (notification === "AGENDA_PREV_WEEK" && !mes) this.move(-semana);
		if (notification === "AGENDA_SCROLL_UP") this.rolar(-1);
		if (notification === "AGENDA_SCROLL_DOWN") this.rolar(1);
		if (notification === "AGENDA_VIEW_MONTH") this.verMes(true);
		if (notification === "AGENDA_VIEW_DAY") this.verMes(false);
		if (notification === "AGENDA_TOGGLE_VIEW") this.verMes(!mes);
		if (notification === "AGENDA_TODAY" || notification === "AGENDA_THIS_WEEK") this.move(0, true);
	},

	notificationReceivedAlways(notification, payload) {
		// Dia específico: funciona mesmo com a página escondida (ex.: um botão futuro no app)
		if (notification !== "AGENDA_GOTO_DATE" || this.config.mode !== "day" || !/^\d{4}-\d{2}-\d{2}$/.test(payload || "")) return;
		const hoje = new Date();
		hoje.setHours(0, 0, 0, 0);
		this.vista = "dia";
		this.move(Math.round((this.parse(payload) - hoje) / 86400000) - this.offset, false, true);
	},

	bindKeys() {
		const dia = this.config.mode === "day";
		const mes = () => this.vista === "mes";
		const keys = {
			ArrowRight: () => (mes() ? this.mudarMes(1) : this.move(1)),
			ArrowLeft: () => (mes() ? this.mudarMes(-1) : this.move(-1)),
			ArrowUp: () => (dia ? this.rolar(-1) : this.move(-1)),
			ArrowDown: () => (dia ? this.rolar(1) : this.move(1)),
			m: () => dia && this.verMes(!mes()),
			M: () => dia && this.verMes(!mes()),
			0: () => this.move(0, true)
		};
		document.addEventListener("keydown", (e) => {
			if (!keys[e.key] || this.hidden) return; // só com a página visível
			e.preventDefault();
			keys[e.key]();
		});
	},

	rolar(dir) {
		if (this.config.mode !== "day" || this.vista === "mes") return;
		this.rolagem += dir * this.config.scrollStep;
		this.lastMove = Date.now();
		this.updateDom(0);
	},

	move(dir, reset = false, forcar = false) {
		const novo = reset ? 0 : this.offset + dir;
		const voltaDoMes = reset && (this.vista !== "dia" || this.mes);
		if (novo === this.offset && !(reset && this.rolagem) && !voltaDoMes && !forcar) return;
		if (reset) {
			this.vista = "dia";
			this.mes = 0;
		}
		this.offset = novo;
		this.rolagem = 0;
		this.lastMove = Date.now();
		this.load();
	},

	/** Mês ↔ dia. Ao abrir o mês, mostra o mês do dia que estava na tela. */
	verMes(ligar) {
		if (this.config.mode !== "day" || (this.vista === "mes") === ligar) return;
		if (ligar) {
			const [dia] = this.range();
			const hoje = new Date();
			this.mes = (dia.getFullYear() - hoje.getFullYear()) * 12 + dia.getMonth() - hoje.getMonth();
		}
		this.vista = ligar ? "mes" : "dia";
		this.lastMove = Date.now();
		this.load();
	},

	mudarMes(dir) {
		this.mes += dir;
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
		if (this.config.mode === "day") {
			this.renderPlanos(root);
			return this.vista === "mes" ? this.renderMonth(root) : this.renderDay(root);
		}
		return this.config.mode === "week" ? this.renderWeek(root) : this.renderToday(root);
	},

	/** Estado da entrada em relação a agora: done | skip | now | past (passou e não fez) | "" */
	state(e, agora) {
		if (e.status === "concluido") return "done";
		if (e.status === "pulado") return "skip"; // recorrente pulada no dia (marcada no app)
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
		const titulo = this.el("span", "agenda__title", (st === "done" ? "✓ " : st === "skip" ? "⏭ " : "") + e.titulo);
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

		// Próximas têm prioridade; vagas que sobram mostram as que passaram sem ser feitas (em vermelho),
		// das mais recentes para trás. Feitas/puladas saem da coluna (contadas no rodapé).
		const max = this.config.maxEntries;
		const proximas = agenda.filter((e) => !["past", "done", "skip"].includes(this.state(e, agora)));
		const perdidas = agenda.filter((e) => this.state(e, agora) === "past");
		const vagas = Math.max(0, max - proximas.length);
		const perdidasVisiveis = vagas ? perdidas.slice(-vagas) : [];
		const feitas = agenda.filter((e) => this.state(e, agora) === "done").length;
		const puladas = agenda.filter((e) => this.state(e, agora) === "skip").length;
		if (!agenda.length) root.appendChild(this.el("div", "agenda__vazio", "Nada marcado para hoje."));
		else if (!proximas.length && !perdidasVisiveis.length) root.appendChild(this.el("div", "agenda__vazio", "Nada mais para hoje."));
		const lista = this.el("div", "agenda__list");
		[...perdidasVisiveis, ...proximas.slice(0, max)].forEach((e) => lista.appendChild(this.entry(e, agora)));
		root.appendChild(lista);
		const resto = [];
		if (proximas.length > max) resto.push(`+${proximas.length - max} mais tarde`);
		const perdidasOcultas = perdidas.length - perdidasVisiveis.length;
		if (perdidasOcultas) resto.push(`${perdidasOcultas} não ${perdidasOcultas === 1 ? "feita" : "feitas"}`);
		if (feitas) resto.push(`${feitas} ${feitas === 1 ? "feita" : "feitas"}`);
		if (puladas) resto.push(`${puladas} ${puladas === 1 ? "pulada" : "puladas"}`);
		if (resto.length) root.appendChild(this.el("div", "agenda__mais", resto.join(" · ")));

		if (atrasados.length) {
			const bloco = this.el("div", "agenda__bloco agenda__bloco--alerta");
			bloco.appendChild(this.el("div", "agenda__rotulo", `Atrasados · ${atrasados.length}`));
			atrasados.slice(0, this.config.maxLate).forEach((i) => bloco.appendChild(this.item(i)));
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
	},

	// ---------- Planos (topo da página Agenda) ----------
	/** Altura fixa do bloco de planos (o CSS usa as mesmas medidas): rótulo 30 + 52 por plano + 12 de margem. */
	alturaPlanos() {
		const n = Math.min(this.planos.length, this.config.maxPlans);
		return n ? 42 + n * 52 : 0;
	},

	/** Altura disponível para a grade do dia ou do mês (descontando os planos). */
	alturaUtil() {
		const base = this.config.gridHeight > 1 ? this.config.gridHeight : Math.round(window.innerHeight * this.config.gridHeight);
		return base - this.alturaPlanos();
	},

	/** "hoje 19:00", "amanhã 19:00", "qui 19:00" (próximos 6 dias) ou "12/11 19:00". */
	quando(s) {
		const d = this.parse(s);
		const hoje = new Date();
		hoje.setHours(0, 0, 0, 0);
		const dia = new Date(d);
		dia.setHours(0, 0, 0, 0);
		const diff = Math.round((dia - hoje) / 86400000);
		const hora = this.hhmm(s);
		if (diff === 0) return `hoje ${hora}`;
		if (diff === 1) return `amanhã ${hora}`;
		if (diff > 1 && diff < 7) return `${d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")} ${hora}`;
		return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
	},

	renderPlanos(root) {
		const planos = this.planos.slice(0, this.config.maxPlans);
		if (!planos.length) return;
		const bloco = this.el("div", "agenda__planos");
		bloco.appendChild(this.el("div", "agenda__rotulo", "Planos"));
		for (const p of planos) {
			const linha = this.el("div", "agenda__plano");
			linha.style.setProperty("--area", p.area_cor);
			const topo = this.el("div", "agenda__plano-topo");
			topo.appendChild(this.el("span", "agenda__plano-nome", p.etapa ? `${p.nome} · ${p.etapa}` : p.nome));
			if (p.tarefas_total) topo.appendChild(this.el("span", "agenda__plano-conta", `${p.tarefas_feitas} de ${p.tarefas_total}`));
			linha.appendChild(topo);

			const baixo = this.el("div", "agenda__plano-baixo");
			const pct = p.etapa_progresso ?? (p.tarefas_total ? (100 * p.tarefas_feitas) / p.tarefas_total : 0);
			const barra = this.el("span", "agenda__plano-barra");
			const cheio = this.el("span");
			cheio.style.width = `${Math.max(0, Math.min(100, pct))}%`;
			barra.appendChild(cheio);
			baixo.appendChild(barra);
			if (p.proxima) {
				const quando = p.proxima.inicio ? ` · ${this.quando(p.proxima.inicio)}` : "";
				baixo.appendChild(this.el("span", "agenda__plano-prox", `próxima: ${p.proxima.titulo}${quando}`));
			}
			linha.appendChild(baixo);
			bloco.appendChild(linha);
		}
		root.appendChild(bloco);
	},

	// ---------- Mês ----------
	renderMonth(root) {
		const [de, ate] = this.rangeMes();
		const ref = this.refMes();
		const hoje = new Date();
		hoje.setHours(0, 0, 0, 0);

		const porDia = {};
		for (const e of this.data_) (porDia[e.data] ||= []).push(e);
		const noMes = this.data_.filter((e) => this.parse(e.data).getMonth() === ref.getMonth()).length;

		const head = this.el("div", "agenda__head");
		const nome = ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
		head.appendChild(this.el("span", "agenda__titulo", nome[0].toUpperCase() + nome.slice(1)));
		head.appendChild(this.el("span", "agenda__periodo", noMes ? `${noMes} ${noMes === 1 ? "item" : "itens"}` : "mês livre"));
		root.appendChild(head);

		const semanas = Math.round((ate - de) / 86400000 + 1) / 7;
		const grade = this.el("div", "agenda__mes");
		for (const d of ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]) grade.appendChild(this.el("div", "agenda__msem", d));
		const linha = Math.floor((this.alturaUtil() - 28 - semanas * 4) / semanas); // 4 = gap entre as linhas
		grade.style.gridTemplateRows = `28px repeat(${semanas}, ${linha}px)`;

		const agora = new Date();
		const max = this.config.monthTitles;
		for (let d = new Date(de); d <= ate; d.setDate(d.getDate() + 1)) {
			const entradas = porDia[this.iso(d)] || [];
			const cls = ["agenda__mdia"];
			if (d.getMonth() !== ref.getMonth()) cls.push("is-fora");
			if (d.getTime() === hoje.getTime()) cls.push("is-hoje");
			else if (d < hoje) cls.push("is-passado");
			const cel = this.el("div", cls.join(" "));
			cel.appendChild(this.el("span", "agenda__mnum", String(d.getDate())));
			for (const e of entradas.slice(0, max)) {
				const fixo = { concluido: "done", pulado: "skip" }[e.status];
				const st = d.getTime() === hoje.getTime() ? this.state(e, agora) : fixo || "";
				const t = this.el("span", `agenda__mtit${st ? ` is-${st}` : ""}`, e.titulo);
				t.style.setProperty("--area", e.area_cor);
				cel.appendChild(t);
			}
			if (entradas.length > max) cel.appendChild(this.el("span", "agenda__mmais", `+${entradas.length - max}`));
			grade.appendChild(cel);
		}
		root.appendChild(grade);
		if (this.mes) root.appendChild(this.el("div", "agenda__dica", "volta para o dia de hoje sozinho em 2 min"));
		return root;
	},

	// ---------- Grade do dia ----------
	minutos(s) {
		return Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
	},

	fmtMin(m) {
		const p = (n) => String(n).padStart(2, "0");
		return `${p(Math.floor(m / 60) % 24)}:${p(m % 60)}`;
	},

	fmtDur(m) {
		const h = Math.floor(m / 60), r = m % 60;
		return h ? (r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`) : `${r} min`;
	},

	/** Blocos com horário: {e, ini, fim} em minutos do dia, com coluna para sobreposições. */
	blocos(entradas) {
		const lista = entradas
			.filter((e) => e.inicio && !e.dia_inteiro && !(e.tipo_entrada === "prazo" && e.inicio.endsWith("23:59:00")))
			.map((e) => {
				const ini = this.minutos(e.inicio);
				let fim;
				if (e.tipo_entrada === "prazo") fim = ini + 15;
				else if (e.fim && e.fim.slice(0, 10) === e.data) fim = Math.max(this.minutos(e.fim), ini + 15);
				else if (e.fim) fim = 24 * 60; // passa da meia-noite: vai até o fim do dia
				else fim = ini + (e.duracao_min || 30);
				return { e, ini, fim: Math.min(fim, 24 * 60) };
			})
			.sort((a, b) => a.ini - b.ini || b.fim - a.fim);
		// Agrupa o que se sobrepõe e distribui em colunas (como no Google Agenda)
		let grupo = [], fimGrupo = -1;
		const fecha = () => {
			const colunas = [];
			for (const b of grupo) {
				let c = colunas.findIndex((fimCol) => fimCol <= b.ini);
				if (c < 0) c = colunas.push(0) - 1;
				colunas[c] = b.fim;
				b.col = c;
			}
			grupo.forEach((b) => (b.cols = colunas.length));
			grupo = [];
		};
		for (const b of lista) {
			if (b.ini >= fimGrupo && grupo.length) fecha();
			grupo.push(b);
			fimGrupo = Math.max(fimGrupo, b.fim);
		}
		if (grupo.length) fecha();
		return lista;
	},

	/** Intervalos livres (min) entre freeFrom e freeTo, a partir de `desde`. */
	livres(blocos, desde) {
		// Prazo não ocupa a agenda; recorrente pulada no dia libera o horário
		const ocupado = blocos.filter((b) => b.e.tipo_entrada !== "prazo" && b.e.status !== "pulado").map((b) => [b.ini, b.fim]);
		let cursor = Math.max(this.config.freeFrom * 60, desde);
		const fimDia = this.config.freeTo * 60, vagos = [];
		for (const [ini, fim] of ocupado.sort((a, b) => a[0] - b[0])) {
			if (ini > cursor && Math.min(ini, fimDia) - cursor >= this.config.minFree) vagos.push([cursor, Math.min(ini, fimDia)]);
			cursor = Math.max(cursor, fim);
			if (cursor >= fimDia) break;
		}
		if (fimDia - cursor >= this.config.minFree) vagos.push([cursor, fimDia]);
		return vagos;
	},

	renderDay(root) {
		const [dia] = this.range();
		const hoje = new Date();
		hoje.setHours(0, 0, 0, 0);
		const ehHoje = dia.getTime() === hoje.getTime();
		const agora = new Date();
		const agoraMin = agora.getHours() * 60 + agora.getMinutes();
		const H = this.config.hourHeight, total = 24 * H;
		const px = (m) => (m * H) / 60;

		// Cabeçalho: "Hoje · domingo, 18 de out" + contagem
		const head = this.el("div", "agenda__head");
		const [nome] = this.dayLabel(dia, hoje);
		const data = dia.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" }).replace(".", "");
		head.appendChild(this.el("span", "agenda__titulo", ["Hoje", "Amanhã", "Ontem"].includes(nome) ? `${nome} · ${data}` : data));
		const blocos = this.blocos(this.data_);
		const diaTodo = this.data_.filter((e) => !blocos.some((b) => b.e === e));
		const n = this.data_.length;
		head.appendChild(this.el("span", "agenda__periodo", n ? `${n} ${n === 1 ? "item" : "itens"}` : "dia livre"));
		root.appendChild(head);

		// Dia inteiro e prazos sem hora: faixa acima da grade
		if (diaTodo.length) {
			const faixa = this.el("div", "agenda__diatodo");
			for (const e of diaTodo) {
				const chip = this.el("span", `agenda__chip prio-${e.prioridade}${e.status === "concluido" ? " is-done" : ""}`,
					(e.tipo_entrada === "prazo" ? "⏰ " : "") + e.titulo);
				chip.style.setProperty("--area", e.area_cor);
				faixa.appendChild(chip);
			}
			root.appendChild(faixa);
		}

		// Janela visível: hoje começa 1h antes de agora; outros dias, 1h antes do 1º item (ou 07:00)
		const alturaJanela = Math.min(total, this.alturaUtil() - (diaTodo.length ? 44 : 0));
		const inicioDesejado = ehHoje ? agoraMin - 60 : (blocos.length ? blocos[0].ini - 60 : 7 * 60);
		const limita = (y) => Math.max(0, Math.min(total - alturaJanela, y));
		const base = limita(px(Math.floor(inicioDesejado / 60) * 60));
		const topo = limita(base + px(this.rolagem * 60)); // automática + rolagem à mão
		this.rolagem = (topo - base) / H; // não acumula além do limite (o próximo toque já volta)
		this.topoAtual = topo;

		const janela = this.el("div", "agenda__janela");
		janela.style.height = `${alturaJanela}px`;
		const grade = this.el("div", "agenda__grade");
		grade.style.height = `${total}px`;
		grade.style.transform = `translateY(${-topo}px)`;

		for (let h = 0; h <= 24; h++) {
			const linha = this.el("div", `agenda__hora${ehHoje && h * 60 < agoraMin - 59 ? " is-past" : ""}`);
			linha.style.top = `${h * H}px`;
			if (h < 24) linha.appendChild(this.el("span", "agenda__horalabel", `${String(h).padStart(2, "0")}:00`));
			grade.appendChild(linha);
		}

		// Horários livres (só do que ainda vem, quando é hoje; dias passados não marcam)
		if (dia >= hoje) {
			for (const [ini, fim] of this.livres(blocos, ehHoje ? agoraMin : 0)) {
				const v = this.el("div", "agenda__livre");
				v.style.top = `${px(ini)}px`;
				v.style.height = `${px(fim - ini)}px`;
				v.appendChild(this.el("span", "", `livre · ${this.fmtDur(fim - ini)}`));
				grade.appendChild(v);
			}
		}

		for (const b of blocos) {
			const { e } = b;
			const fixo = { concluido: "done", pulado: "skip" }[e.status]; // feito/pulado vale para qualquer dia
			const st = ehHoje ? this.state(e, agora) : fixo || (dia < hoje ? "past" : "");
			const bloco = this.el("div", `agenda__bloco-h prio-${e.prioridade}${st ? ` is-${st}` : ""}${e.tipo_entrada === "prazo" ? " is-prazo" : ""}`);
			bloco.style.setProperty("--area", e.area_cor);
			bloco.style.top = `${px(b.ini)}px`;
			bloco.style.height = `${Math.max(px(b.fim - b.ini), 24) - 2}px`;
			bloco.style.left = `calc(64px + (100% - 64px) * ${b.col / b.cols})`;
			bloco.style.width = `calc((100% - 64px) / ${b.cols} - 4px)`;
			const curto = px(b.fim - b.ini) < 44;
			if (curto) bloco.classList.add("is-curto");
			const hora = e.tipo_entrada === "prazo" ? `⏰ ${this.fmtMin(b.ini)}` : `${this.fmtMin(b.ini)}–${this.fmtMin(b.fim)}`;
			bloco.appendChild(this.el("span", "agenda__bh-titulo", (st === "done" ? "✓ " : st === "skip" ? "⏭ " : "") + e.titulo));
			bloco.appendChild(this.el("span", "agenda__bh-meta", [hora, st === "skip" ? "pulado" : "", e.projeto_caminho || e.area_nome, e.recorrente ? "↻" : ""].filter(Boolean).join(" · ")));
			grade.appendChild(bloco);
		}

		if (ehHoje) {
			const linhaAgora = this.el("div", "agenda__agora");
			linhaAgora.style.top = `${px(agoraMin)}px`;
			linhaAgora.appendChild(this.el("span", "", this.fmtMin(agoraMin)));
			grade.appendChild(linhaAgora);
		}

		janela.appendChild(grade);

		// Avisos de itens fora da janela (acima/abaixo)
		const minTopo = (topo * 60) / H, minBase = ((topo + alturaJanela) * 60) / H;
		const antes = blocos.filter((b) => b.fim <= minTopo).length;
		const depois = blocos.filter((b) => b.ini >= minBase).length;
		if (antes) janela.appendChild(this.el("div", "agenda__fora agenda__fora--cima", `▲ ${antes} antes das ${this.fmtMin(Math.round(minTopo))}`));
		if (depois) janela.appendChild(this.el("div", "agenda__fora agenda__fora--baixo", `▼ ${depois} depois das ${this.fmtMin(Math.round(minBase))}`));
		root.appendChild(janela);

		if (this.offset || this.rolagem) root.appendChild(this.el("div", "agenda__dica", this.offset ? "volta para hoje sozinho em 2 min" : "volta para a hora atual sozinho em 2 min"));
		return root;
	}
});
