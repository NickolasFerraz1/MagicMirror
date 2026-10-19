#!/usr/bin/env bash
# Atualiza o espelho: puxa o repo, reinicia o servidor do MagicMirror e recarrega a tela.
# Uso (no Pi): bash ~/magic-mirror/scripts/atualizar.sh
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

echo "==> git pull"
git pull --ff-only

# Módulos novos do repo ainda sem link no MagicMirror
for mod in "$REPO"/modules/*/; do
	nome="$(basename "$mod")"
	if [ ! -e "$HOME/MagicMirror/modules/$nome" ]; then
		ln -s "${mod%/}" "$HOME/MagicMirror/modules/$nome"
		echo "==> link criado: modules/$nome"
	fi
done

echo "==> reiniciando o servidor"
sudo systemctl restart magicmirror

echo -n "==> aguardando o servidor"
for _ in $(seq 1 60); do
	if curl -sf -o /dev/null http://localhost:8080; then echo " ok"; break; fi
	echo -n "."
	sleep 1
done

echo "==> recarregando a tela"
node "$REPO/scripts/recarregar-tela.mjs" || echo "   (tela não recarregada: se o monitor estiver ligado, rode sudo reboot)"
