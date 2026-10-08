# Magic Mirror — Planejamento

## Objetivo
Espelho inteligente de parede (retrato) com Raspberry Pi 3B+ e MagicMirror², que acende ao detectar presença, é navegável por gestos e exibe relógio, clima e um briefing diário de notícias gerado por IA.

## Hardware

| Item | Detalhe |
|---|---|
| Computador | Raspberry Pi 3B+ (1 GB RAM, Wi-Fi dual band) |
| Armazenamento | microSD SanDisk Ultra 64 GB |
| Alimentação do Pi | Carregador 5V/4,1A (dual USB, usar 1 porta) + cabo micro-USB curto |
| Monitor | Brazil PC 20WR 75 — 19,5" 1600x900, LED, fonte interna, VESA 100x100 |
| Área de imagem | 42 × 24 cm (paisagem) → 24 × 42 cm em retrato |
| Sensor de presença | PIR HC-SR501 (liga/desliga a tela) |
| Sensor de gestos | PAJ7620 (GY-PAJ7620U2), I2C, 3,3V |
| Parede | Coluna de 36 cm de largura; tomada à direita |

## Arquitetura de software

```
Boot do Pi
├── magicmirror.service (systemd) ── npm run server → http://localhost:8080
└── labwc autostart ── kiosk.sh
        ├── espera o servidor responder
        ├── wlr-randr: HDMI-A-1, 1600x900@60, transform 270
        └── Chromium em quiosque (Wayland)

sensord.py (systemd)
├── PIR (GPIO17) → liga/desliga saída HDMI após N min sem presença
└── PAJ7620 (I2C) → troca de páginas / ações no MM²

Briefing diário
Tarefa agendada do Claude (nuvem) → e-mail p/ nickbriefingdiario@gmail.com
  (PDF anexo + bloco <<MIRROR>>...<<END>> no corpo)
→ briefing.py no Pi (cron, IMAP + senha de app) → JSON → módulo MMM-Briefing
```

## Decisões técnicas
- **Sistema:** Raspberry Pi OS 64-bit (Debian 13 Trixie), sessão Wayland (labwc).
- **Electron descartado:** a GPU do Pi 3B+ só suporta OpenGL ES 2.0, e o Electron 44 exige ES 3.0. Solução: MM² em modo servidor + Chromium em quiosque.
- **Rotação e desligamento de tela:** `wlr-randr` (Wayland), não `xrandr`.
- **Clima:** Open-Meteo (padrão do MM², sem chave de API).
- **Briefing sem API paga:** o Claude pesquisa na nuvem e envia por e-mail; o Pi só lê o bloco estruturado via IMAP. Gemini descartado (desnecessário).
- **Leitura do Gmail:** IMAP + senha de app (a Gmail API com OAuth em modo teste expira tokens a cada 7 dias).
- **Sensores:** PAJ7620 no lugar do APDS-9960 (reconhecimento de gestos no próprio chip, 9 gestos). Os sensores IR não funcionam atrás do vidro e precisam de abertura na moldura.
- **Desktop desativado:** o autostart do labwc abre só o quiosque, economizando RAM.

## Formato do bloco no e-mail
```
<<MIRROR>>
[IA] manchete curta
[IA] manchete curta
[TEC] ...
[ECO] ...
[POL] ...
<<END>>
```
2 manchetes por categoria, máx. 55 caracteres, sem links/markdown/emojis.

## Ligações (GPIO)

| Sensor | Pino do sensor | Pino do Pi |
|---|---|---|
| PIR | VCC | 2 (5V) |
| PIR | GND | 6 |
| PIR | OUT | 11 (GPIO17) |
| PAJ7620 | VCC | 1 (3,3V) — nunca 5V |
| PAJ7620 | GND | 9 |
| PAJ7620 | SDA | 3 (GPIO2) |
| PAJ7620 | SCL | 5 (GPIO3) |
| PAJ7620 | INT | 7 (GPIO4), opcional |

## Estrutura do repositório
```
magic-mirror/
├── docs/ ou raiz: PLANEJAMENTO.md, PROGRESSO.md, PROXIMOS_PASSOS.md
├── mm-config/config.js.template   # sem chaves
├── modules/MMM-Briefing/
├── sensord/sensord.py
├── briefing/briefing.py
├── systemd/                       # units dos serviços
├── scripts/kiosk.sh, deploy.sh
├── .env.example
└── .gitignore                     # .env, config.env, __pycache__, node_modules
```
O MM² fica clonado separadamente em `~/MagicMirror`; o `deploy.sh` cria links simbólicos do repo para lá.

## Fases

### Fase 1 — Sistema e MagicMirror² ✅
- [x] Gravar o Raspberry Pi OS (Wi-Fi, SSH, localização BR)
- [x] Validar alimentação (`throttled=0x0`)
- [x] Atualizar o sistema e ativar o I2C
- [x] Instalar Node 22 e MagicMirror² v2.38.0
- [x] Rodar em quiosque com Chromium
- [x] Descobrir a rotação correta (270)

### Fase 2 — Autostart
- [ ] `magicmirror.service` (servidor)
- [ ] `kiosk.sh` + autostart do labwc (rotação + Chromium)
- [ ] Validar boot sem notebook
- [ ] Mover scripts e units para o repositório

### Fase 3 — Personalização
- [ ] pt-BR, clima de Americana, remover feriados dos EUA e elogios
- [ ] Layout em retrato e páginas (MMM-pages + indicador)
- [ ] `config.js.template` + `config.env`

### Fase 4 — Briefing
- [ ] Validar o bloco `<<MIRROR>>` no e-mail
- [ ] Gerar senha de app na conta do briefing
- [ ] `briefing.py` (IMAP → JSON) + cron
- [ ] Módulo `MMM-Briefing`

### Fase 5 — Sensores
- [ ] Soldar o PAJ7620 (técnico; pinos saindo pelo verso, lado sem o sensor)
- [ ] Testar PIR e PAJ7620 na bancada (`i2cdetect -y 1`)
- [ ] `sensord.py` como serviço (tela on/off + gestos)

### Fase 6 — Montagem física
- [ ] Medir o corpo do monitor
- [ ] Vidro espelho dupla via 3–4 mm (menor transmissão de luz)
- [ ] Moldura: ~32–33 cm de largura, 8–9 cm de profundidade, rodapé p/ Pi + carregador + filtro de linha, furos p/ PIR (topo) e PAJ7620 (base), ventilação
- [ ] Mascaramento com papel adesivo preto fosco (recorte de 24 × 42 cm)
- [ ] Fixação do monitor via VESA (parafusos M4)

### Fase 7 — Ajuste fino
- [ ] Sensibilidade e tempo do PIR, limiares de gesto
- [ ] Temperatura com a moldura fechada (< 70 °C)

## Montagem: cabos em L
- Em retrato, as portas ficam na lateral direita e os conectores entram de lado.
- Energia: cabo C13 90° com saída pelo lado do pino **N** (E à esquerda, L em cima, N embaixo).
- HDMI: adaptador Vention lateral; com o lado estreito do trapézio à esquerda, a saída aponta para baixo.

## Riscos e cuidados
- Pi 3B+ no limite: evitar módulos pesados (vídeo, mapas animados).
- Monitor TN/1000:1: fundo 100% preto e textos brancos; o PIR apaga a tela sem presença.
- Ao apagar a tela, o monitor mostra "sem sinal" por 3–5 s (aceitável).
- Nunca desligar o Pi da tomada sem `sudo shutdown now`.