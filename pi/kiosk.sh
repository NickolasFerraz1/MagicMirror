#!/bin/bash
# Abre a tela do espelho (Chromium em modo quiosque). Chamado pelo autostart do labwc.
# Instalado em ~/bin/kiosk.sh por pi/restaurar.sh (cópia do repo: pi/kiosk.sh).

# Desativa desktop e barra de tarefas (economiza RAM no Pi 3B+)
pkill -f lwrespawn
pkill -x pcmanfm-pi
pkill -x pcmanfm
pkill -x wf-panel-pi

# Espera o servidor do MM² responder
until curl -s http://localhost:8080 > /dev/null; do sleep 2; done
sleep 15  # dá tempo à sessão gráfica/GPU estabilizar após o boot

# Tela em pé: 1600x900 girada 270° → 900x1600
wlr-randr --output HDMI-A-1 --mode 1600x900@60 --transform 270

# Mexe o ponteiro após o Chromium carregar, para o CSS esconder o cursor
(sleep 20; wlrctl pointer move 5 5) &

# --remote-debugging-port: permite recarregar a tela por script (scripts/recarregar-tela.mjs).
# Escuta só em 127.0.0.1 (não fica exposto na rede).
exec chromium --ozone-platform=wayland --password-store=basic --kiosk --remote-debugging-port=9222 \
  --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
  --no-first-run http://localhost:8080
