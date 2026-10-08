#!/bin/bash
# Liga os arquivos do repo aos locais que o sistema usa
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$HOME/bin" "$HOME/.config/labwc"
ln -sf "$REPO/scripts/kiosk.sh" "$HOME/bin/kiosk.sh"
ln -sf "$REPO/labwc/autostart" "$HOME/.config/labwc/autostart"

# Units do systemd são copiadas (mais robusto que link)
sudo install -m 644 "$REPO/systemd/magicmirror.service" /etc/systemd/system/
sudo systemctl daemon-reload

echo "Deploy concluído."