# Magic Mirror — Progresso

Registro do que foi feito, atualizado a cada etapa. Mais recente no topo.

---

## 08/10/2026

### Em andamento — Fase 2: Autostart
- [x] Criado `/etc/systemd/system/magicmirror.service` (servidor do MM², reinicia sozinho se cair)
- [x] Criado `~/bin/kiosk.sh` (espera o servidor → rotação 270 a 60 Hz → Chromium em quiosque)
- [x] Criado `~/.config/labwc/autostart` (abre só o quiosque; desktop desativado para economizar RAM)
- [ ] Testar `sudo reboot` e confirmar que o espelho sobe sozinho em retrato
- [ ] Mover `magicmirror.service` e `kiosk.sh` para o repositório

### Documentação
- [x] Criados `PLANEJAMENTO.md` e `PROGRESSO.md` no repositório

---

## 01/10/2026

### Compras e hardware
- Monitor comprado: Brazil PC 20WR 75 (19,5", 1600x900, HDMI, fonte interna, VESA 100x100), novo, R$ 200.
- Monitor testado: sem pixels mortos, preto uniforme, standby com mensagem "sem sinal" por 3–5 s (aceitável).
- Parede definida: coluna de 36 cm → espelho em retrato, moldura de ~32–33 cm.
- Sensores definidos: PIR HC-SR501 + PAJ7620 (APDS-9960 descartado).
- AliExpress (a caminho): PAJ7620, 2x PIR, jumpers F-F 20 cm, dissipadores, leitor de cartão, termorretrátil.
- Mercado Livre: cabo C13 90°, adaptador HDMI lateral Vention, fita 3M VHB, papel adesivo preto fosco, abraçadeiras, álcool isopropílico.
- Conectores do monitor identificados: energia C14 (cabo C13) e HDMI, ambos na lateral direita em retrato.

### Raspberry Pi
- Gravado o Raspberry Pi OS 64-bit (Debian 13 Trixie) com hostname `magicmirror`, usuário `nickferraz`, Wi-Fi "quarto nickolas", país BR, SSH ativo.
- IP: 192.168.1.236. Alimentação validada (`throttled=0x0`) com o carregador de 5V/4,1A.
- Sistema atualizado (`apt full-upgrade`) e I2C ativado.
- Sessão gráfica identificada: Wayland (labwc). Swap de 904 MB (suficiente).

### MagicMirror²
- Instalados Node.js 22 (NodeSource) e MagicMirror² v2.38.0 em `~/MagicMirror`.
- `config.js`: `address: "0.0.0.0"` e `ipWhitelist` liberando a rede 192.168.1.x.
- Electron falhou (GPU do Pi 3B+ só tem OpenGL ES 2.0; Electron 44 exige ES 3.0).
- Solução adotada: `npm run server` + Chromium em quiosque com `--ozone-platform=wayland` e `--password-store=basic` (evita o pedido de chaveiro).
- Rotação definida: saída `HDMI-A-1`, `1600x900@60`, `transform 270` (portas à direita).

### Briefing
- Decidido: a tarefa diária do Claude envia o e-mail para `nickbriefingdiario@gmail.com` com PDF + bloco `<<MIRROR>>...<<END>>` no corpo; o Pi lê via IMAP + senha de app. Gemini descartado.
- Prompt da tarefa diária atualizado com o bloco `<<MIRROR>>`.

### Repositório
- Repositório criado no GitHub e sincronizado com o repo local. Ainda sem código.