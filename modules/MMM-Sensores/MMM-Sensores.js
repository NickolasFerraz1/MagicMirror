/* MMM-Sensores — traduz os eventos do sensord.py em ações, conforme a página atual.
 *
 * O sensord manda o gesto cru (GESTO_HORARIO etc.); o significado depende da página
 * (mapa abaixo, editável no config). Trocas de página passam pelo MMM-Nav (NAV_*),
 * que já protege contra rajadas.
 * PRESENCA: repassada como SENSOR_PRESENCA {presente}; ao apagar a tela, volta ao Início
 * (voltarAoInicio), para o espelho acender sempre na página principal.
 */
Module.register("MMM-Sensores", {
	defaults: {
		voltarAoInicio: true,
		// Índices do MMM-pages: 0 Início | 1 Briefing | 2 Agenda | 3 Cotações | 4 Espelho
		paginas: ["inicio", "briefing", "agenda", "cotacoes", "espelho"],
		// Vale em qualquer página (a página específica tem prioridade).
		// Deslizar como no celular: mão para a esquerda = próxima; do Início, mão para a direita
		// volta e cai na última página (Espelho).
		todas: {
			GESTO_ESQUERDA: "NAV_NEXT_PAGE",
			GESTO_DIREITA: "NAV_PREV_PAGE",
			GESTO_ACENO: "NAV_HOME"
		},
		mapa: {
			inicio: {},
			briefing: {
				GESTO_CIMA: "BRIEFING_PREV_CATEGORY",
				GESTO_BAIXO: "BRIEFING_NEXT_CATEGORY",
				GESTO_HORARIO: "BRIEFING_NEXT_ITEM",
				GESTO_ANTI_HORARIO: "BRIEFING_PREV_ITEM"
			},
			agenda: {
				GESTO_CIMA: "AGENDA_SCROLL_UP",
				GESTO_BAIXO: "AGENDA_SCROLL_DOWN",
				GESTO_HORARIO: "AGENDA_NEXT",
				GESTO_ANTI_HORARIO: "AGENDA_PREV",
				GESTO_APROXIMAR: "AGENDA_NEXT_WEEK",
				GESTO_AFASTAR: "AGENDA_PREV_WEEK",
				GESTO_ACENO: "AGENDA_TODAY"
			},
			cotacoes: {
				GESTO_CIMA: "QUOTES_PREV",
				GESTO_BAIXO: "QUOTES_NEXT",
				GESTO_HORARIO: "QUOTES_NEXT_CATEGORY",
				GESTO_ANTI_HORARIO: "QUOTES_PREV_CATEGORY",
				GESTO_APROXIMAR: "QUOTES_OPEN",
				GESTO_AFASTAR: "QUOTES_CLOSE"
			},
			espelho: {} // só troca de página e aceno (Início)
		}
	},

	start() {
		this.page = 0;
		this.sendSocketNotification("INICIAR"); // abre o socket para receber do node_helper
	},

	notificationReceived(notification, payload) {
		if (notification === "NEW_PAGE") this.page = payload; // enviado pelo MMM-pages a cada troca
	},

	socketNotificationReceived(notification, payload) {
		if (notification !== "SENSOR_EVENTO") return;
		const { evento, presente } = payload;

		if (evento === "PRESENCA") {
			this.sendNotification("SENSOR_PRESENCA", { presente });
			if (!presente && this.config.voltarAoInicio) this.sendNotification("NAV_HOME");
			return;
		}

		const nome = this.config.paginas[this.page];
		const daPagina = (this.config.mapa[nome] || {})[evento];
		const acao = daPagina || this.config.todas[evento];
		if (acao) this.sendNotification(acao);
		else Log.log(`MMM-Sensores: ${evento} não faz nada na página ${nome ?? this.page}`);
	}
});
