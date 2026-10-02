# Magic Mirror — status (01/10/2026)

## Ambiente do Pi
- Raspberry Pi 3B+ | Raspberry Pi OS 64-bit (Debian 13 Trixie) | Wayland (labwc)
- Hostname: magicmirror | Usuário: nickferraz | IP: 192.168.1.236 | SSH ativo
- Alimentação OK com carregador 5V/4,1A (throttled=0x0)
- I2C ativado | Node 22 | MagicMirror² v2.38.0 em ~/MagicMirror

## Decisões técnicas
- Electron NÃO funciona (GPU do Pi 3 só tem OpenGL ES 2.0; Electron 44 exige ES 3.0).
  Solução: MM² em modo servidor + Chromium em quiosque.
- config.js: address "0.0.0.0" + ipWhitelist da rede 192.168.1.x
  (remover a entrada IPv6 inválida, se ainda não removeu)
- Tela: saída HDMI-A-1, 1600x900@60Hz, rotação 270 (portas à direita, retrato)
- Clima: Open-Meteo (padrão, sem chave de API)
- Briefing: tarefa diária do Claude envia e-mail para nickbriefingdiario@gmail.com
  com PDF anexo + bloco <<MIRROR>>...<<END>> no corpo.
  O Pi lê via IMAP + senha de app (sem Gemini, sem API paga).
- Sensores: PIR HC-SR501 (presença, liga/desliga tela) + PAJ7620 (gestos)

## Como subir manualmente (até criar os serviços)
Terminal 1:  cd ~/MagicMirror && npm run server
Terminal 2:  WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 chromium --ozone-platform=wayland --password-store=basic --kiosk --noerrdialogs --disable-infobars http://localhost:8080
Rotação:     WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 wlr-randr --output HDMI-A-1 --mode 1600x900@60 --transform 270

## Próximos passos
1. Criar serviços systemd (magicmirror.service + mirror-kiosk.service com rotação)
2. Personalizar config.js: pt-BR, clima de Americana, remover feriados EUA e elogios
3. Validar o bloco <<MIRROR>> no e-mail + gerar senha de app na conta do briefing
4. Escrever briefing.py (IMAP → JSON) + módulo MMM-Briefing
5. Sensores (quando chegarem): soldar o PAJ7620 com técnico (pinos saindo pelo VERSO,
   lado sem o sensor) → sensord.py como serviço
6. Medir o corpo do monitor → encomendar vidro (menor transmissão) e moldura
   (~32-33 cm de largura, 8-9 cm de profundidade, rodapé, furos p/ sensores e ventilação)

## Compras
- AliExpress (a caminho): PAJ7620, 2x PIR, jumpers F-F 20 cm, dissipadores,
  leitor de cartão, termorretrátil
- Mercado Livre: cabo C13 90° (saída pelo lado do N), adaptador HDMI lateral Vention,
  fita VHB, papel adesivo preto fosco, abraçadeiras, álcool isopropílico
- Pendentes: filtro de linha (ver o de casa), parafusos M4 VESA (depois),
  cabo HDMI curto (opcional)