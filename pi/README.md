# Configuração do Pi (fora do MagicMirror)

Tudo o que o espelho precisa e que não fica dentro de `~/MagicMirror`, para recriar o Pi do zero
(cartão novo, reinstalação) sem depender de memória.

| Arquivo no repo | Vai para | Para quê |
|---|---|---|
| `pi/kiosk.sh` | `~/bin/kiosk.sh` | Abre o Chromium em quiosque: tela em pé (1600x900 girada 270°), sem barra de tarefas, cursor escondido, porta 9222 para recarregar a tela por script |
| `pi/labwc-autostart` | `~/.config/labwc/autostart` | Chama o `kiosk.sh` quando a sessão gráfica sobe |
| `systemd/magicmirror.service` | `/etc/systemd/system/` | Servidor do MagicMirror² (`npm run server`); a tela é o Chromium acima |
| `systemd/briefing.*` | `/etc/systemd/system/` | Atualização do briefing |
| `mm-config/*`, `modules/*` | links em `~/MagicMirror/` | Config, CSS e módulos próprios |

## Restaurar

1. Raspberry Pi OS (com labwc), usuário `nickferraz`, MagicMirror² instalado em `~/MagicMirror`.
2. `sudo apt install wlr-randr wlrctl`
3. `git clone https://github.com/NickolasFerraz1/MagicMirror ~/magic-mirror`
4. `bash ~/magic-mirror/pi/restaurar.sh`
5. Recolocar à mão o que não vai para o repo (credenciais do briefing) e `sudo reboot`.

O app Projeto Agenda tem o próprio instalador (`scripts/instalar_pi.sh` no outro repo); o
Tailscale também é à parte (`sudo tailscale up` + `sudo tailscale serve --bg 8090`).

## Dia a dia

- Atualizar o espelho: `bash ~/magic-mirror/scripts/atualizar.sh` (pull, links, reinicia, recarrega a tela).
- Mudou algo no `~/bin/kiosk.sh` direto no Pi? Copie de volta para `pi/kiosk.sh` e faça commit —
  este repo é a fonte da verdade.
