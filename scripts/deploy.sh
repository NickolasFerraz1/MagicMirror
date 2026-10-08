#!/bin/bash
# Liga os arquivos do repo aos locais que o sistema usa
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"

# Módulos de terceiros (clona se ainda não existir)
MM_MODULES="$HOME/MagicMirror/modules"
for url in \
  https://github.com/edward-shen/MMM-pages \
  https://github.com/edward-shen/MMM-page-indicator; do
  name="$(basename "$url")"
  [ -d "$MM_MODULES/$name" ] || git clone "$url" "$MM_MODULES/$name"
done

# Config do MagicMirror²
ln -sf "$REPO/mm-config/config.js" "$HOME/MagicMirror/config/config.js"
ln -sf "$REPO/mm-config/custom.css" "$HOME/MagicMirror/css/custom.css"

# Quiosque e autostart
mkdir -p "$HOME/bin" "$HOME/.config/labwc"
ln -sf "$REPO/scripts/kiosk.sh" "$HOME/bin/kiosk.sh"
ln -sf "$REPO/labwc/autostart" "$HOME/.config/labwc/autostart"

# Units do systemd são copiadas (mais robusto que link)
sudo install -m 644 "$REPO/systemd/magicmirror.service" /etc/systemd/system/
sudo systemctl daemon-reload

echo "Deploy concluído."