# Próximos passos

_Atualizado em 10/10/2026 (sessão interrompida no meio da Fase 4)_

## Onde paramos
- Fases 1, 2 e 3 (base) concluídas: o espelho sobe sozinho em retrato, pt-BR, relógio, clima de Americana, 4 páginas (placeholders) em rotação de teste, cursor escondido.
- Fase 4 em andamento:
  - [x] Prompt da tarefa diária trocado para o bloco `<<MIRROR_JSON>>` (JSON com titulo/resumo/fonte por notícia). Primeiro e-mail validado: JSON ok, 4 categorias, títulos ≤ 55, resumos ≤ 600.
  - [x] Verificação em 2 etapas ativada e senha de app criada na conta do briefing (salva no `.env` local).
  - [x] `briefing.py`, `briefing.service` e `briefing.timer` escritos e testados (e-mail real → `briefing.json`; JSON quebrado → mantém o anterior).
  - [ ] **Parou aqui:** colocar os arquivos no repo, testar no notebook e fazer o deploy no Pi (passos abaixo).

## Como retomar
1. Ligar o Pi na tomada e esperar o espelho subir (~1–2 min).
2. No notebook: `ssh nickferraz@192.168.1.236`

## Passo a passo pendente

### No notebook (repo)
1. Salvar os arquivos recebidos:
   - `briefing/briefing.py`
   - `systemd/briefing.service`
   - `systemd/briefing.timer`
2. `.gitignore`: acrescentar a linha `data/`.
3. Conferir o `.env` (raiz do repo, NÃO vai para o Git):
   ```
   BRIEFING_IMAP_USER=<e-mail da conta do briefing>
   BRIEFING_IMAP_PASSWORD=<senha de app, 16 letras, sem espaços e sem aspas>
   ```
   E o `.env.example` (vai para o Git) com as mesmas chaves vazias.
   Conferir que está ignorado: `git check-ignore -v .env`
4. `scripts/deploy.sh`: trocar o bloco final do systemd por:
   ```bash
   # Dependências do sistema
   command -v wlrctl > /dev/null || sudo apt install -y wlrctl
   python3 -c "import pydantic" 2>/dev/null || sudo apt install -y python3-pydantic

   # Units do systemd são copiadas (mais robusto que link)
   sudo install -m 644 "$REPO/systemd/magicmirror.service" /etc/systemd/system/
   sudo install -m 644 "$REPO/systemd/briefing.service" /etc/systemd/system/
   sudo install -m 644 "$REPO/systemd/briefing.timer" /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now briefing.timer

   echo "Deploy concluído."
   ```
   (se a linha do `wlrctl` já estiver no topo, remover a duplicada)
5. Teste local (opcional): `pip install pydantic` e, na raiz do repo, `python briefing/briefing.py` → esperado `Salvo em .../data/briefing.json`.
6. Commit:
   ```bash
   git add .
   git commit -m "Fase 4: briefing.py (IMAP -> JSON validado) e timer horario"
   git push
   ```

### No Pi
1. `cd ~/magic-mirror && git pull`
2. Copiar o `.env` do notebook (PowerShell, na pasta do repo):
   `scp .env nickferraz@192.168.1.236:~/magic-mirror/.env`
3. `./scripts/deploy.sh`
4. Testar:
   ```bash
   sudo systemctl start briefing.service
   journalctl -u briefing.service -n 5 --no-pager
   head -5 ~/magic-mirror/data/briefing.json
   ```
5. Mandar a saída do `journalctl` para seguirmos.

## Depois disso: resto da Fase 4
- Módulo `modules/MMM-Briefing`: lê `data/briefing.json`; manchetes (2 por categoria) na página 0 e notícia completa por tema na página 1.
- Atualizar `PLANEJAMENTO.md` (formato `<<MIRROR_JSON>>` no lugar do `<<MIRROR>>`) e `PROGRESSO.md`.

## Fases seguintes
- **Fase 5: App de tarefas + Google Agenda**: FastAPI + SQLite na nuvem gratuita; sincroniza com o Google Agenda via conta de serviço; o espelho lê o iCal privado. Antes de codar: definir o modelo de dados.
- **Cotações**: módulo próprio (AwesomeAPI para USD/EUR/BTC; pesquisar fonte gratuita para o Ibovespa). Página 0 com as 4 principais; página 3 com lista configurável e minigráfico de 30 dias.
- **Sensores** (quando chegarem do AliExpress): soldar o PAJ7620 com técnico (pinos saindo pelo VERSO, lado sem o sensor) → testar na bancada → `sensord.py`. Depois, desligar a rotação de teste (`timings: { default: 0 }`).
- **Montagem física**: medir o corpo do monitor → vidro (menor transmissão de luz) e moldura.

## Pendências e lembretes
- Compras pendentes: fita isolante, filtro de linha (ver o de casa; checar o comprimento do cabo até a tomada), parafusos M4 VESA (depois), cabo HDMI curto (opcional).
- Ao chegar: conferir o adaptador HDMI Vention (saída para baixo) e o cabo C13 90° (saída pelo lado do N).
- Ideia futura: página de corrida (Strava).
- Repo público: nunca commitar senhas/chaves (`.env` e `config.env` no `.gitignore`).
- Sempre desligar com `sudo shutdown now` antes de tirar da tomada.