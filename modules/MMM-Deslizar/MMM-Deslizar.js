/* MMM-Deslizar — troca de página com "deslizar" (como no celular), por fora do MMM-pages.
 *
 * Por que por fora: com animationTime > 0, trocas rápidas no MMM-pages deixavam um módulo da
 * página anterior visível. Aqui o MMM-pages continua instantâneo (animationTime: 0) e é a única
 * fonte da verdade de qual página está ativa. A animação é só visual:
 *   1. Antes de o MMM-pages trocar (este módulo fica ANTES dele no config, então recebe
 *      PAGE_INCREMENT/PAGE_DECREMENT/HOME_PAGE/PAGE_SELECT primeiro), os módulos visíveis da
 *      página atual são copiados ("fantasmas", sem id e sem eventos) na mesma posição da tela;
 *      as cópias saem deslizando e são removidas no fim.
 *   2. Depois que o MMM-pages mostra a página nova (NEW_PAGE), os módulos dela entram
 *      deslizando do outro lado (classe CSS com transform + opacity, depois removida).
 * Nenhum módulo real fica escondido/visível por causa da animação: no pior caso (troca no meio
 * de outra) as cópias são apagadas na hora e a tela fica exatamente como o MMM-pages deixou.
 *
 * Trava: o MMM-Nav já ignora trocas em sequência (minInterval); aqui ele é elevado para no
 * mínimo slideMs + 50 ms, para a trava cobrir a animação inteira.
 * Sem animação: primeiro carregamento, PRESENCA (apagar/religar a tela) e atualizações de
 * módulo dentro da mesma página (não passam por notificação de troca).
 */
Module.register("MMM-Deslizar", {
	defaults: {
		slideAnimation: false, // desligado até validar no monitor; true = troca deslizando
		slideMs: 300, // duração (250–350 fica natural)
		slideDistance: 0.35, // deslocamento, em fração da largura da tela
		easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", // ease-out
		pages: null // número de páginas; null = descobre pelas classes page0..pageN
	},

	start() {
		this.pagina = 0;
		this.total = 0;
		this.fantasmas = [];
		this.entrando = [];
		this.pendente = null; // { destino, dir } entre o "antes" e o NEW_PAGE
		this.timer = null;
		this.semAnimarAte = 0;
	},

	getStyles() {
		return ["MMM-Deslizar.css"];
	},

	notificationReceived(notification, payload) {
		switch (notification) {
			case "DOM_OBJECTS_CREATED":
				this.preparar();
				break;
			case "NEW_PAGE": // enviado pelo MMM-pages depois de esconder a página antiga
				this.depoisDaTroca(payload);
				break;
			case "SENSOR_PRESENCA": // apagar/religar a tela: nada de animação (e o NAV_HOME que vem junto)
				this.semAnimarAte = Date.now() + 1500;
				this.pendente = null;
				this.finalizar();
				break;
			case "PAGE_INCREMENT":
				this.antesDaTroca(Number.isInteger(payload) ? payload : 1);
				break;
			case "PAGE_DECREMENT":
				this.antesDaTroca(-(Number.isInteger(payload) ? payload : 1));
				break;
			case "HOME_PAGE":
				this.antesDaTroca(null, 0);
				break;
			case "PAGE_SELECT":
			case "PAGE_CHANGED":
				this.antesDaTroca(null, Number(payload));
				break;
		}
	},

	preparar() {
		const css = document.documentElement.style;
		css.setProperty("--deslizar-ms", `${this.config.slideMs}ms`);
		css.setProperty("--deslizar-easing", this.config.easing);
		this.total = this.config.pages || this.contarPaginas();
		// A trava do MMM-Nav tem que cobrir a animação inteira
		const nav = MM.getModules().withClass("MMM-Nav")[0];
		const minimo = this.config.slideMs + 50;
		if (nav && this.config.slideAnimation && nav.config.minInterval < minimo) nav.config.minInterval = minimo;
	},

	contarPaginas() {
		let maior = -1;
		for (const m of MM.getModules()) {
			for (const [, n] of String(m.data.classes || "").matchAll(/\bpage(\d+)\b/g)) maior = Math.max(maior, Number(n));
		}
		return maior + 1;
	},

	modulosDaPagina(n) {
		return MM.getModules()
			.withClass(`page${n}`)
			.map((m) => document.getElementById(m.identifier))
			.filter((w) => w && !w.classList.contains("hidden") && w.style.position !== "fixed");
	},

	distancia() {
		return Math.round(window.innerWidth * this.config.slideDistance);
	},

	antesDaTroca(passo, alvo) {
		if (!this.config.slideAnimation || !this.total) return;
		const n = this.total;
		const atual = this.pagina;
		const destino = passo === null ? alvo : (((atual + passo) % n) + n) % n;
		if (!Number.isInteger(destino) || destino === atual) return; // ex.: PAGE_SELECT de confirmação do MMM-Nav
		this.finalizar(); // troca no meio de outra: limpa na hora, sem sobra
		if (Date.now() < this.semAnimarAte) return;
		let dir;
		if (passo !== null) dir = Math.sign(passo);
		else {
			// salto (Início, seleção): menor caminho; empate = para a frente
			const frente = (((destino - atual) % n) + n) % n;
			dir = frente <= n - frente ? 1 : -1;
		}
		this.criarFantasmas(atual, dir);
		this.pendente = { destino, dir };
	},

	criarFantasmas(pagina, dir) {
		const para = `${-dir * this.distancia()}px`;
		for (const w of this.modulosDaPagina(pagina)) {
			const r = w.getBoundingClientRect();
			const regiao = w.closest(".region");
			if (!r.width || !r.height || !regiao) continue;
			const g = w.cloneNode(true);
			g.removeAttribute("id");
			g.querySelectorAll("[id]").forEach((e) => e.removeAttribute("id"));
			// canvas não copia o desenho no cloneNode (gráficos das cotações)
			const origem = w.querySelectorAll("canvas");
			g.querySelectorAll("canvas").forEach((c, i) => {
				try {
					c.getContext("2d").drawImage(origem[i], 0, 0);
				} catch {
					/* canvas vazio ou de outra origem: some na cópia */
				}
			});
			g.classList.add("deslizar-fantasma");
			g.setAttribute("aria-hidden", "true");
			Object.assign(g.style, {
				position: "fixed",
				left: `${r.left}px`,
				top: `${r.top}px`,
				width: `${r.width}px`,
				height: `${r.height}px`,
				transition: "none"
			});
			g.style.setProperty("--deslizar-para", para);
			// Na própria região (fora do .container, que o MM esconde quando fica vazio):
			// mantém o CSS que depende da região (ex.: .region.upper.third .module-content)
			regiao.appendChild(g);
			const r2 = g.getBoundingClientRect(); // ancestral com transform muda a referência do fixed
			if (Math.abs(r2.left - r.left) > 0.5 || Math.abs(r2.top - r.top) > 0.5) {
				g.style.left = `${2 * r.left - r2.left}px`;
				g.style.top = `${2 * r.top - r2.top}px`;
			}
			this.fantasmas.push(g);
		}
	},

	depoisDaTroca(pagina) {
		this.pagina = pagina;
		const pend = this.pendente;
		this.pendente = null;
		if (!pend) return; // primeiro carregamento, PRESENCA ou animação desligada
		// O MMM-pages mostra a página nova num setTimeout(0) registrado antes deste
		setTimeout(() => this.animarEntrada(pagina, pend.dir), 0);
		clearTimeout(this.timer);
		this.timer = setTimeout(() => this.finalizar(), this.config.slideMs + 120);
	},

	animarEntrada(pagina, dir) {
		if (pagina !== this.pagina) return; // já trocou de novo
		const de = `${dir * this.distancia()}px`;
		for (const w of this.modulosDaPagina(pagina)) {
			w.style.setProperty("--deslizar-de", de);
			w.classList.add("deslizar-entra");
			this.entrando.push(w);
		}
	},

	finalizar() {
		clearTimeout(this.timer);
		this.timer = null;
		for (const g of this.fantasmas) g.remove();
		for (const w of this.entrando) {
			w.classList.remove("deslizar-entra");
			w.style.removeProperty("--deslizar-de");
		}
		this.fantasmas = [];
		this.entrando = [];
		// Rede de segurança: nada de animação sobrando no DOM
		document.querySelectorAll(".deslizar-fantasma").forEach((g) => g.remove());
		document.querySelectorAll(".deslizar-entra").forEach((w) => w.classList.remove("deslizar-entra"));
	}
});
