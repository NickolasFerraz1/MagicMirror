/* Serve data/briefing.json do repo por HTTP para o front do módulo. */
const fs = require("node:fs/promises");
const path = require("node:path");
const NodeHelper = require("node_helper");

// O módulo fica em <repo>/modules/MMM-Briefing (via link); o JSON, em <repo>/data/.
// O Node resolve o link, então __dirname aponta para a pasta real no repo.
const DATA_FILE = process.env.BRIEFING_OUTPUT || path.resolve(__dirname, "..", "..", "data", "briefing.json");

module.exports = NodeHelper.create({
	start() {
		// Cada instância busca o JSON sozinha (via HTTP), sem depender do socket,
		// que no navegador é compartilhado entre instâncias do mesmo módulo.
		this.expressApp.get("/MMM-Briefing/data", async (req, res) => {
			try {
				res.set("Cache-Control", "no-store");
				res.type("application/json").send(await fs.readFile(DATA_FILE, "utf8"));
			} catch (err) {
				res.status(404).json({ error: `briefing.json indisponível: ${err.message}` });
			}
		});
	}
});