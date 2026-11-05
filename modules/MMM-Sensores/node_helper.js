/* Recebe os eventos do sensord.py (mesmo Pi) e repassa para o front do MMM-Sensores.
 *
 *   POST /MMM-Sensores/evento   {"evento": "GESTO_DIREITA"}
 *                               {"evento": "PRESENCA", "presente": true|false}
 *
 * Teste sem o sensord:
 *   curl -X POST localhost:8080/MMM-Sensores/evento -H 'Content-Type: application/json' -d '{"evento":"GESTO_DIREITA"}'
 */
const NodeHelper = require("node_helper");
const Log = require("logger");

const EVENTOS = new Set([
	"PRESENCA",
	"GESTO_DIREITA", "GESTO_ESQUERDA", "GESTO_CIMA", "GESTO_BAIXO",
	"GESTO_HORARIO", "GESTO_ANTI_HORARIO", "GESTO_APROXIMAR", "GESTO_AFASTAR", "GESTO_ACENO"
]);

// O MagicMirror pode ou não ter um leitor de JSON global; funciona nos dois casos.
function lerCorpo(req) {
	if (req.body !== undefined) return Promise.resolve(req.body);
	return new Promise((resolve, reject) => {
		let corpo = "";
		req.setEncoding("utf8");
		req.on("data", (parte) => {
			corpo += parte;
			if (corpo.length > 10000) reject(new Error("corpo grande demais"));
		});
		req.on("end", () => {
			try {
				resolve(corpo ? JSON.parse(corpo) : {});
			} catch {
				reject(new Error("JSON inválido"));
			}
		});
		req.on("error", reject);
	});
}

module.exports = NodeHelper.create({
	start() {
		this.expressApp.post("/MMM-Sensores/evento", async (req, res) => {
			let dados;
			try {
				dados = await lerCorpo(req);
			} catch (err) {
				return res.status(400).json({ erro: err.message });
			}
			const evento = String(dados?.evento || "");
			if (!EVENTOS.has(evento)) return res.status(400).json({ erro: `evento desconhecido: ${evento}` });
			this.sendSocketNotification("SENSOR_EVENTO", { evento, presente: dados.presente === true });
			res.json({ ok: true });
		});
		Log.log("MMM-Sensores: aguardando eventos em POST /MMM-Sensores/evento");
	},

	// O front se apresenta ao iniciar (abre o socket); não há nada a responder.
	socketNotificationReceived() {}
});
