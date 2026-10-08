#!/bin/bash
# Espera o servidor do MM² responder
until curl -s http://localhost:8080 > /dev/null; do sleep 2; done
sleep 15

wlr-randr --output HDMI-A-1 --mode 1600x900@60 --transform 270

exec chromium --ozone-platform=wayland --password-store=basic --kiosk \
  --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
  --no-first-run http://localhost:8080