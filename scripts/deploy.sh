#!/bin/bash
# Liga os arquivos do repo aos locais que o sistema usa
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"

# Dependências do sistema
command -v wlrctl > /dev/null || sudo apt install -y wlrctl
python3 -c "import pydantic" 2>/dev/null || sudo apt install -y python3-pydantic

# Módulos de terceiros (clona se ainda não existir)
MM_MODULES="$HOME/MagicMirror/modules"
for url in \
  https://github.com/edward-shen/MMM-pages \
  https://github.com/edward-shen/MMM-page-indicator; do
  name="$(basename "$url")"
  [ -d "$MM_MODULES/$name" ] || git clone "$url" "$MM_MODULES/$name"
done

# Módulos próprios
ln -sfn "$REPO/modules/MMM-Briefing" "$MM_MODULES/MMM-Briefing"
ln -sfn "$REPO/modules/MMM-Quotes" "$MM_MODULES/MMM-Quotes"

# Config do MagicMirror² (a 2.38 lê o custom.css de config/, não de css/)
ln -sf "$REPO/mm-config/config.js" "$HOME/MagicMirror/config/config.js"
ln -sf "$REPO/mm-config/custom.css" "$HOME/MagicMirror/config/custom.css"
rm -f "$HOME/MagicMirror/css/custom.css"   # link antigo, se existir

# Quiosque e autostart
mkdir -p "$HOME/bin" "$HOME/.config/labwc"
ln -sf "$REPO/scripts/kiosk.sh" "$HOME/bin/kiosk.sh"
ln -sf "$REPO/labwc/autostart" "$HOME/.config/labwc/autostart"

# Units do systemd são copiadas (mais robusto que link)
sudo install -m 644 "$REPO/systemd/magicmirror.service" /etc/systemd/system/
sudo install -m 644 "$REPO/systemd/briefing.service" /etc/systemd/system/
sudo install -m 644 "$REPO/systemd/briefing.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now briefing.timer

echo "Deploy concluído."