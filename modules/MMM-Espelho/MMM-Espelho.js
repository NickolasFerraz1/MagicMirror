/* MMM-Espelho — página "só espelho" (a última).
 *
 * Não desenha nada: quando a página dele aparece, põe a classe pagina-espelho no body e o
 * CSS esconde a data do relógio e as bolinhas de página. Os outros módulos o MMM-pages já
 * esconde; ficam só a hora e a temperatura atual (módulos fixos).
 */
Module.register("MMM-Espelho", {
	getStyles() {
		return ["MMM-Espelho.css"];
	},

	getDom() {
		return document.createElement("div");
	},

	resume() {
		document.body.classList.add("pagina-espelho");
	},

	suspend() {
		document.body.classList.remove("pagina-espelho");
	}
});
