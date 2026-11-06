#!/usr/bin/env bash
# Restaura no Pi a configuração que fica fora do MagicMirror (cartão novo / reinstalação).
# Pré-requisitos: Raspberry Pi OS com labwc, MagicMirror² em ~/MagicMirror, este repo em ~/magic-mirror,
#                 pacotes wlr-randr, wlrctl, kanshi, wlopm, python3-gpiozero, python3-smbus e i2c-tools
#                 (sudo apt install wlr-randr wlrctl kanshi wlopm python3-gpiozero python3-smbus i2c-tools).
# Uso: bash ~/magic-mirror/pi/restaurar.sh
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> tela (kiosk + autostart do labwc)"
mkdir -p ~/bin ~/.config/labwc
install -m 755 "$REPO/pi/kiosk.sh" ~/bin/kiosk.sh
[ -f ~/.config/labwc/autostart ] && cp ~/.config/labwc/autostart ~/.config/labwc/autostart.bak
cp "$REPO/pi/labwc-autostart" ~/.config/labwc/autostart
mkdir -p ~/.config/kanshi
[ -f ~/.config/kanshi/config ] && cp ~/.config/kanshi/config ~/.config/kanshi/config.bak
cp "$REPO/pi/kanshi-config" ~/.config/kanshi/config

echo "==> identificação do monitor fixa no boot (EDID)"
# Sem isso, se o monitor for desligado/religado e o Pi não conseguir ler a identificação, a tela
# volta em 1024x768 deitada (o kanshi não acha 1600x900 e não gira).
if [ -f "$REPO/pi/edid-espelho.bin" ]; then
	sudo mkdir -p /lib/firmware/edid
	sudo cp "$REPO/pi/edid-espelho.bin" /lib/firmware/edid/espelho.bin
	if ! grep -q "drm.edid_firmware=" /boot/firmware/cmdline.txt; then
		sudo cp /boot/firmware/cmdline.txt /boot/firmware/cmdline.txt.bak
		sudo sed -i '1 s/$/ drm.edid_firmware=HDMI-A-1:edid\/espelho.bin video=HDMI-A-1:1600x900@60D/' /boot/firmware/cmdline.txt
	fi
	sudo update-initramfs -u 2>/dev/null || true
else
	echo "   (pi/edid-espelho.bin não está no repo: pulei)"
fi

echo "==> I²C (sensor de gestos PAJ7620)"
sudo raspi-config nonint do_i2c 0

echo "==> config e módulos do MagicMirror (links para o repo)"
ln -sfn "$REPO/mm-config/config.js" ~/MagicMirror/config/config.js
# custom.css: versões novas do MM² leem de config/, as antigas de css/ — o link nos dois não atrapalha
ln -sfn "$REPO/mm-config/custom.css" ~/MagicMirror/config/custom.css
ln -sfn "$REPO/mm-config/custom.css" ~/MagicMirror/css/custom.css
for mod in "$REPO"/modules/*/; do
	ln -sfn "${mod%/}" ~/MagicMirror/modules/"$(basename "$mod")"
done

echo "==> serviços (servidor do MM², briefing e sensores)"
sudo cp "$REPO"/systemd/magicmirror.service "$REPO"/systemd/briefing.service "$REPO"/systemd/briefing.timer \
	"$REPO"/systemd/sensord.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now magicmirror.service briefing.timer sensord.service

echo "==> pronto. Falta à mão: o .env/credenciais do briefing (fora do repo) e sudo reboot."
