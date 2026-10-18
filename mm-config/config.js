/* MagicMirror² — config do espelho
 * Fonte da verdade: repo magic-mirror (mm-config/config.js)
 * O deploy.sh cria um link deste arquivo em ~/MagicMirror/config/config.js
 *
 * Páginas (índice MMM-pages):
 *   0 Início | 1 Briefing | 2 Agenda | 3 Cotações
 * Agenda (coluna "Hoje" e página 2): MMM-Agenda, lê o app Projeto Agenda (localhost:8090).
 */

// ---------- Cotações ----------
// Moeda → { id, label, source: "awesome", pair: "XXX-BRL", yahoo: "XXXBRL=X" }
// Cripto → { id, label, source: "awesome", pair: "XXX-BRL", binance: "XXXBRL" }
//   (yahoo/binance: mesmo ativo, usado só nos gráficos de 1D e 5D)
// Índice/ação/metal → { id, label, source: "yahoo", symbol: "^BVSP" }
//   unit: "pts" para índices · currency: "USD" para cotar em dólar
const Q = {
	USD: { id: "USD", label: "Dólar", source: "awesome", pair: "USD-BRL", yahoo: "USDBRL=X" },
	EUR: { id: "EUR", label: "Euro", source: "awesome", pair: "EUR-BRL", yahoo: "EURBRL=X" },
	BTC: { id: "BTC", label: "Bitcoin", source: "awesome", pair: "BTC-BRL", binance: "BTCBRL" },
	GOLD: { id: "GOLD", label: "Ouro · onça", source: "yahoo", symbol: "GC=F", currency: "USD" },
	SILVER: { id: "SILVER", label: "Prata · onça", source: "yahoo", symbol: "SI=F", currency: "USD" },
	IBOV: { id: "IBOV", label: "Ibovespa", source: "yahoo", symbol: "^BVSP", unit: "pts" }
};

// Faixa da página Início
const QUOTES_MAIN = [Q.USD, Q.EUR, Q.BTC, Q.IBOV];

// Abas da página Cotações (para incluir ativos, acrescente em Q e na categoria)
const QUOTES_CATEGORIES = [
	{ id: "moedas", label: "Moedas", symbols: [Q.USD, Q.EUR] },
	{ id: "cripto", label: "Cripto", symbols: [Q.BTC] },
	{ id: "metais", label: "Metais", symbols: [Q.GOLD, Q.SILVER] },
	{ id: "indices", label: "Índices", symbols: [Q.IBOV] }
];

let config = {
	address: "0.0.0.0",
	port: 8080,
	basePath: "/",
	// 100.64.0.0/10 = Tailscale: abre o espelho no navegador de fora de casa (http://magicmirror:8080)
	ipWhitelist: ["127.0.0.1", "::ffff:127.0.0.1", "::1", "192.168.1.1/24", "100.64.0.0/10"],

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
		// Coluna esquerda (abaixo do relógio): agenda do dia, atrasados e pendências
		{
			module: "MMM-Agenda",
			position: "top_left",
			classes: "page0",
			header: "Hoje",
			config: { mode: "today", maxEntries: 4, maxLate: 1, maxPending: 2 }
		},
		// Coluna direita (abaixo do clima): previsão
		{
			module: "weather",
			position: "top_right",
			classes: "page0",
			header: "Próximos dias",
			config: {
				weatherProvider: "openmeteo",
				type: "forecast",
				appendLocationNameToHeader: false,
				lat: -22.7392,
				lon: -47.3314,
				maxNumberOfDays: 4,
				fade: false,
				updateInterval: 30 * 60 * 1000
			}
		},
		{
			module: "MMM-Briefing",
			position: "upper_third",
			classes: "page0",
			config: { mode: "headlines" }
		},
		// Faixa de cotações
		{
			module: "MMM-Quotes",
			position: "upper_third",
			classes: "page0",
			header: "Cotações",
			config: { mode: "strip", symbols: QUOTES_MAIN }
		},

		// ---------- Página 1: Briefing ----------
		{
			module: "MMM-Briefing",
			position: "upper_third",
			classes: "page1",
			config: { mode: "reader" }
		},

		// ---------- Página 2: Agenda ----------
		// Grade do dia (00–24h) com horários livres; ←/→ dia, ↑/↓ semana, 0 hoje
		// (gestos depois: AGENDA_NEXT/PREV, AGENDA_TODAY; dia específico: AGENDA_GOTO_DATE)
		{
			module: "MMM-Agenda",
			position: "upper_third",
			classes: "page2",
			config: { mode: "day", hourHeight: 64 }
		},

		// ---------- Página 3: Cotações ----------
		{
			module: "MMM-Quotes",
			position: "upper_third",
			classes: "page3",
			header: "Cotações",
			config: { mode: "explorer", categories: QUOTES_CATEGORIES }
		},

		// ---------- Controle de páginas ----------
		{
			module: "MMM-Nav" // teclado/gestos → troca de página com proteção contra rajadas
		},
		{
			module: "MMM-pages",
			config: {
				modules: [["page0"], ["page1"], ["page2"], ["page3"]],
				fixed: ["fixed", "MMM-Nav"],
				// 0 = troca instantânea. Com animação, trocar de página rápido (ou por
				// gesto) podia deixar um módulo da página anterior visível.
				animationTime: 0,
				// Sem rotação automática: troca por teclado (PageUp/PageDown) e,
				// depois, pelos gestos do PAJ7620.
				timings: { default: 0 }
			}
		}
	]
};

/*************** DO NOT EDIT THE LINE BELOW ***************/
if (typeof module !== "undefined") { module.exports = config; }
