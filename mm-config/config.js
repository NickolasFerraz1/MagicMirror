/* MagicMirror² — config do espelho
 * Fonte da verdade: repo magic-mirror (mm-config/config.js)
 * O deploy.sh cria um link deste arquivo em ~/MagicMirror/config/config.js
 *
 * Páginas (índice MMM-pages):
 *   0 Início | 1 Briefing | 2 Agenda | 3 Cotações
 * Os placeholders (helloworld) serão trocados pelos módulos reais nas próximas fases.
 */

let config = {
	address: "0.0.0.0",
	port: 8080,
	basePath: "/",
	ipWhitelist: ["127.0.0.1", "::ffff:127.0.0.1", "::1", "192.168.1.1/24"],

	language: "pt-br",
	locale: "pt-BR",
	timeFormat: 24,
	units: "metric",

	modules: [
		// ---------- Fixos (todas as páginas) ----------
		{
			module: "alert"
		},
		{
			module: "updatenotification",
			position: "top_bar",
			classes: "fixed"
		},
		{
			module: "clock",
			position: "top_left",
			classes: "fixed",
			config: {
				displaySeconds: false,
				dateFormat: "dddd, D [de] MMMM"
			}
		},
		{
			module: "weather",
			position: "top_right",
			classes: "fixed",
			config: {
				weatherProvider: "openmeteo",
				type: "current",
				lat: -22.7392,
				lon: -47.3314,
				showHumidity: false,
				showWindDirection: false,
				updateInterval: 10 * 60 * 1000
			}
		},
		{
			module: "MMM-page-indicator",
			position: "bottom_bar",
			classes: "fixed"
		},

		// ---------- Página 0: Início ----------
		{
			module: "weather",
			position: "top_right",
			classes: "page0",
			header: "Próximos dias",
			config: {
				weatherProvider: "openmeteo",
				type: "forecast",
				lat: -22.7392,
				lon: -47.3314,
				maxNumberOfDays: 4,
				fade: false,
				updateInterval: 30 * 60 * 1000
			}
		},
		{
			module: "helloworld",
			position: "middle_center",
			classes: "page0",
			config: { text: "Início — resumo (agenda, manchetes, cotações)" }
		},

		// ---------- Página 1: Briefing ----------
		{
			module: "helloworld",
			position: "middle_center",
			classes: "page1",
			config: { text: "Briefing — notícias completas por tema" }
		},

		// ---------- Página 2: Agenda ----------
		{
			module: "helloworld",
			position: "middle_center",
			classes: "page2",
			config: { text: "Agenda — dia / semana / mês" }
		},

		// ---------- Página 3: Cotações ----------
		{
			module: "helloworld",
			position: "middle_center",
			classes: "page3",
			config: { text: "Cotações — moedas e Ibovespa" }
		},

		// ---------- Controle de páginas ----------
		{
			module: "MMM-pages",
			config: {
				modules: [["page0"], ["page1"], ["page2"], ["page3"]],
				fixed: ["fixed"],
				animationTime: 500,
				// Rotação automática só para testes (20 s por página).
				// Trocar para { default: 0 } quando os gestos estiverem ativos.
				timings: { default: 20000 }
			}
		}
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }