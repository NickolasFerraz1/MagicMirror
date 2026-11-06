# Configuração do Pi (fora do MagicMirror)

Tudo o que o espelho precisa e que não fica dentro de `~/MagicMirror`, para recriar o Pi do zero
(cartão novo, reinstalação) sem depender de memória.

| Arquivo no repo | Vai para | Para quê |
|---|---|---|
| `pi/kiosk.sh` | `~/bin/kiosk.sh` | Abre o Chromium em quiosque: tela em pé (1600x900 girada 270°), sem barra de tarefas, cursor escondido, porta 9222 para recarregar a tela por script |
| `pi/labwc-autostart` | `~/.config/labwc/autostart` | Chama o `kiosk.sh` quando a sessão gráfica sobe |
| `pi/kanshi-config` | `~/.config/kanshi/config` | Reaplica a rotação (e esconde o cursor) quando o monitor é desligado/religado |
| `pi/edid-espelho.bin` | `/lib/firmware/edid/espelho.bin` + `cmdline.txt` | Identificação (EDID) do monitor fixa no boot: `drm.edid_firmware=HDMI-A-1:edid/espelho.bin video=HDMI-A-1:1600x900@60D`. Sem ela, se o Pi não lê o EDID ao religar o monitor, a tela volta em 1024x768 deitada |
| `systemd/magicmirror.service` | `/etc/systemd/system/` | Servidor do MagicMirror² (`npm run server`); a tela é o Chromium acima |
| `systemd/briefing.*` | `/etc/systemd/system/` | Atualização do briefing |
| `systemd/sensord.service` | `/etc/systemd/system/` | `sensord/sensord.py` (+ `paj7620.py`): PIR apaga/acende o monitor (wlopm) e gestos do PAJ7620 → MagicMirror |
| `mm-config/*`, `modules/*` | links em `~/MagicMirror/` | Config, CSS e módulos próprios |

## Restaurar

1. Raspberry Pi OS (com labwc), usuário `nickferraz`, MagicMirror² instalado em `~/MagicMirror`.
2. `sudo apt install wlr-randr wlrctl kanshi wlopm python3-gpiozero python3-smbus i2c-tools`
3. `git clone https://github.com/NickolasFerraz1/MagicMirror ~/magic-mirror`
4. `bash ~/magic-mirror/pi/restaurar.sh`
5. Recolocar à mão o que não vai para o repo (credenciais do briefing) e `sudo reboot`.

O app Projeto Agenda tem o próprio instalador (`scripts/instalar_pi.sh` no outro repo); o
Tailscale também é à parte (`sudo tailscale up` + `sudo tailscale serve --bg 8090`).

## Dia a dia

- Atualizar o espelho: `bash ~/magic-mirror/scripts/atualizar.sh` (pull, links, reinicia, recarrega a tela e,
  no fim, avisa se há versão nova do MagicMirror² ou dos módulos de terceiros; não há mais faixa na tela).
  Só a verificação: `bash ~/magic-mirror/scripts/verificar-atualizacoes.sh`.
- Sensores: `journalctl -u sensord -f` mostra o que o PIR e os gestos estão fazendo.
  Teste sem sensor: `sudo systemctl stop sensord && python3 ~/magic-mirror/sensord/sensord.py --teste`
  (setas, h/a, f/t, o = gestos; m = movimento; q sai) e depois `sudo systemctl start sensord`.
- Ligação do PIR (HC-SR501): VCC → pino 2 (5V), OUT → pino 11 (GPIO17), GND → pino 6.
  No sensor: jumper em H (repetível), tempo (Tx) no mínimo, sensibilidade (Sx) no meio.
- Ligação do PAJ7620 (4 fios, sem o INT): VCC → pino 1 (**3,3 V**, nunca 5 V), GND → pino 9,
  SDA → pino 3, SCL → pino 5. Conferir: `i2cdetect -y 1` mostra `73`.
- Calibrar os gestos: `sudo systemctl stop sensord && python3 ~/magic-mirror/sensord/sensord.py --teste --gestos`.
  O log mostra cada gesto; se as direções vierem giradas, ajuste `SENSORD_PAJ_ROTACAO` (90/180/270) e,
  se esquerda/direita vierem trocadas, `SENSORD_PAJ_ESPELHAR=1` (`sudo systemctl edit sensord`).
- Tela deitada / em 1024x768: `wlr-randr | grep -E "Model|current"` (com `WAYLAND_DISPLAY=wayland-0
  XDG_RUNTIME_DIR=/run/user/$(id -u)`). Com o EDID fixo isso não deve voltar; para corrigir na hora:
  `wlr-randr --output HDMI-A-1 --custom-mode 1600x900@60 --transform 270`. Para desfazer o EDID fixo:
  `sudo cp /boot/firmware/cmdline.txt.bak /boot/firmware/cmdline.txt` e reboot.
- Mudou algo no `~/bin/kiosk.sh` direto no Pi? Copie de volta para `pi/kiosk.sh` e faça commit —
  este repo é a fonte da verdade.
