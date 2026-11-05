#!/usr/bin/env bash
# Mostra se há atualização do MagicMirror² e dos módulos de terceiros (substitui a faixa do
# updatenotification na tela). Não atualiza nada: só avisa e diz o comando.
# Uso (no Pi): bash ~/magic-mirror/scripts/verificar-atualizacoes.sh   (o atualizar.sh já chama)
set -uo pipefail
MM="${MM_DIR:-$HOME/MagicMirror}"
achou=0

echo "==> verificando atualizações"

# MagicMirror²: versão instalada x última tag publicada
if [ -f "$MM/package.json" ]; then
	atual="$(node -p "require('$MM/package.json').version" 2>/dev/null)"
	ultima="$(timeout 20 git -C "$MM" ls-remote --tags --refs origin 'v*' 2>/dev/null \
		| sed 's#.*refs/tags/v##' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)"
	if [ -z "$ultima" ]; then
		echo "   MagicMirror² $atual (não consegui consultar a versão nova)"
	elif [ "$(printf '%s\n%s\n' "$atual" "$ultima" | sort -V | tail -1)" != "$atual" ]; then
		echo "   MagicMirror²: $ultima disponível (instalado: $atual)"
		echo "      cd $MM && git pull && npm run install-mm   (veja antes o CHANGELOG.md)"
		achou=1
	fi
fi

# Módulos de terceiros: os que são clone do git (os nossos são links para este repo)
for dir in "$MM"/modules/*/; do
	dir="${dir%/}"
	nome="$(basename "$dir")"
	[ "$nome" = "default" ] && continue
	[ -L "$dir" ] && continue
	[ -d "$dir/.git" ] || continue
	if ! timeout 20 git -C "$dir" fetch --quiet 2>/dev/null; then
		echo "   $nome: não consegui consultar"
		continue
	fi
	novos="$(git -C "$dir" rev-list --count 'HEAD..@{u}' 2>/dev/null || echo 0)"
	if [ "$novos" -gt 0 ]; then
		echo "   $nome: $novos commit(s) novo(s)"
		echo "      cd $dir && git pull && ([ -f package.json ] && npm install --omit=dev || true)"
		achou=1
	fi
done

[ "$achou" -eq 0 ] && echo "   tudo em dia"
exit 0
