#!/usr/bin/env bash
# Restaura no Pi a configuração que fica fora do MagicMirror (cartão novo / reinstalação).
# Pré-requisitos: Raspberry Pi OS com labwc, MagicMirror² em ~/MagicMirror, este repo em ~/magic-mirror,
#                 pacotes wlr-randr e wlrctl (sudo apt install wlr-randr wlrctl).
# Uso: bash ~/magic-mirror/pi/restaurar.sh
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> tela (kiosk + autostart do labwc)"
mkdir -p ~/bin ~/.config/labwc
install -m 755 "$REPO/pi/kiosk.sh" ~/bin/kiosk.sh
[ -f ~/.config/labwc/autostart ] && cp ~/.config/labwc/autostart ~/.config/labwc/autostart.bak
cp "$REPO/pi/labwc-autostart" ~/.config/labwc/autostart

echo "==> config e módulos do MagicMirror (links para o repo)"
ln -sfn "$REPO/mm-config/config.js" ~/MagicMirror/config/config.js
# custom.css: versões novas do MM² leem de config/, as antigas de css/ — o link nos dois não atrapalha
ln -sfn "$REPO/mm-config/custom.css" ~/MagicMirror/config/custom.css
ln -sfn "$REPO/mm-config/custom.css" ~/MagicMirror/css/custom.css
for mod in "$REPO"/modules/*/; do
	ln -sfn "${mod%/}" ~/MagicMirror/modules/"$(basename "$mod")"
done

echo "==> serviços (servidor do MM² e briefing)"
sudo cp "$REPO"/systemd/magicmirror.service "$REPO"/systemd/briefing.service "$REPO"/systemd/briefing.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now magicmirror.service briefing.timer

echo "==> pronto. Falta à mão: o .env/credenciais do briefing (fora do repo) e sudo reboot."
