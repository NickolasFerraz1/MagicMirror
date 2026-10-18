/* Ponte entre o espelho e o app Projeto Agenda (FastAPI no mesmo Pi).
 *
 * O front do módulo busca nestas rotas (mesma origem do MagicMirror, sem CORS);
 * aqui o Node repassa para a API local e junta o que falta (cor da área).
 *   GET /MMM-Agenda/hoje              → /api/hoje (+ area_cor em atrasados/pendências)
 *   GET /MMM-Agenda/agenda?de=&ate=   → /api/agenda
 */
const NodeHelper = require("node_helper");

const API = (process.env.AGENDA_API || "http://127.0.0.1:8090").replace(/\/$/, "");
const DATA = /^\d{4}-\d{2}-\d{2}$/;

async function get(path) {
	const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(8000) });
	if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
	return res.json();
}

module.exports = NodeHelper.create({
	start() {
		this.expressApp.get("/MMM-Agenda/hoje", async (req, res) => {
			try {
				const [hoje, areas] = await Promise.all([get("/api/hoje"), get("/api/areas")]);
				const cor = Object.fromEntries(areas.map((a) => [a.id, a.cor]));
				for (const i of [...hoje.atrasados, ...hoje.pendencias]) i.area_cor = cor[i.area_id] || "#888";
				res.set("Cache-Control", "no-store").json(hoje);
			} catch (err) {
				res.status(502).json({ error: `app Agenda indisponível: ${err.message}` });
			}
		});

		this.expressApp.get("/MMM-Agenda/agenda", async (req, res) => {
			const { de, ate } = req.query;
			if (!DATA.test(de || "") || !DATA.test(ate || "")) {
				return res.status(400).json({ error: "use ?de=AAAA-MM-DD&ate=AAAA-MM-DD" });
			}
			try {
				res.set("Cache-Control", "no-store").json(await get(`/api/agenda?de=${de}&ate=${ate}`));
			} catch (err) {
				res.status(502).json({ error: `app Agenda indisponível: ${err.message}` });
			}
		});
	}
});
