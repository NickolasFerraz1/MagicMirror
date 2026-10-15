/* MMM-Nav — central de navegação entre páginas (teclado agora; gestos depois)
 *
 * Por que existe: o MMM-pages agenda a exibição da página nova com um setTimeout
 * e não cancela o agendamento anterior. Duas trocas em sequência rápida faziam
 * os módulos de páginas diferentes aparecerem juntos. Aqui as trocas passam por:
 *   1. um intervalo mínimo entre trocas (minInterval);
 *   2. uma "reafirmação" da página atual logo depois (PAGE_SELECT para a mesma
 *      página), que esconde qualquer módulo que tenha sobrado visível.
 *
 * Teclado: PageDown/PageUp (ou N/P) troca de página; Home volta ao Início.
 * Notificações aceitas (para o sensord.py): NAV_NEXT_PAGE, NAV_PREV_PAGE, NAV_HOME.
 */
Module.register("MMM-Nav", {
	defaults: {
		keyboard: true,
		minInterval: 500, // ms entre trocas de página
		settleDelay: 150 // ms após a troca para reafirmar a página atual
	},

	start() {
		this.page = 0;
		this.lastChange = 0;
		this.settleTimer = null;
		if (this.config.keyboard) this.bindKeys();
	},

	bindKeys() {
		const keys = {
			PageDown: () => this.change(1),
			PageUp: () => this.change(-1),
			n: () => this.change(1),
			p: () => this.change(-1),
			Home: () => this.change(0, true)
		};
		document.addEventListener("keydown", (e) => {
			const action = keys[e.key];
			if (!action) return;
			e.preventDefault();
			action();
		});
	},

	notificationReceived(notification, payload) {
		if (notification === "NEW_PAGE") this.page = payload; // enviado pelo MMM-pages a cada troca
		if (notification === "NAV_NEXT_PAGE") this.change(1);
		if (notification === "NAV_PREV_PAGE") this.change(-1);
		if (notification === "NAV_HOME") this.change(0, true);
	},

	change(dir, home = false) {
		const now = Date.now();
		if (now - this.lastChange < this.config.minInterval) return; // ignora trocas em rajada
		this.lastChange = now;
		if (home) this.sendNotification("HOME_PAGE");
		else this.sendNotification(dir > 0 ? "PAGE_INCREMENT" : "PAGE_DECREMENT");

		clearTimeout(this.settleTimer);
		this.settleTimer = setTimeout(() => this.sendNotification("PAGE_SELECT", this.page), this.config.settleDelay);
	}
});