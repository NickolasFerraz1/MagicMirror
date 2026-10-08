#!/bin/bash
# Desativa desktop e barra de tarefas (economiza RAM no Pi 3B+)
pkill -f lwrespawn
pkill -x pcmanfm-pi
pkill -x pcmanfm
pkill -x wf-panel-pi

# Espera o servidor do MM² responder
until curl -s http://localhost:8080 > /dev/null; do sleep 2; done
sleep 15  # dá tempo à sessão gráfica/GPU estabilizar após o boot

wlr-randr --output HDMI-A-1 --mode 1600x900@60 --transform 270

# Mexe o ponteiro após o Chromium carregar, para o CSS esconder o cursor
(sleep 20; wlrctl pointer move 5 5) &
exec chromium --ozone-platform=wayland --password-store=basic --kiosk \
  --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
  --no-first-run http://localhost:8080