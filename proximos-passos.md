# Próximos passos

_Atualizado em 08/10/2026 (fim da sessão)_

## Onde paramos
- Fases 1, 2 e 3 (base) concluídas: o Pi liga e o espelho sobe sozinho em retrato, em pt-BR, com relógio, clima de Americana, 4 páginas (placeholders) em rotação de teste e cursor escondido.
- O repo é a fonte da verdade. Fluxo: editar no notebook → commit/push → no Pi: `cd ~/magic-mirror && git pull` (+ `./scripts/deploy.sh` se houver arquivo/link novo) → `sudo reboot`.

## Como retomar
1. Ligar o Pi na tomada e esperar o espelho subir (~1–2 min).
2. No notebook: `ssh nickferraz@192.168.1.236`
3. `cd ~/magic-mirror && git pull`

## Próxima sessão: Fase 4 (briefing)
1. **Definir o novo formato do bloco no e-mail**: trocar `<<MIRROR>>` por um JSON com, por notícia: categoria, título curto (≤ 55 caracteres, página 1) e resumo completo (página 2).
2. **Atualizar o prompt da tarefa diária do Claude** com o novo formato e rodar uma vez manualmente para validar.
3. **Gerar senha de app** na conta do briefing (exige verificação em 2 etapas ativa).
4. **`briefing/briefing.py`**: IMAP → extrai o JSON → valida com Pydantic → salva `briefing.json`. Se o JSON vier inválido, mantém o briefing anterior.
5. **Agendamento**: timer do systemd (ex.: 7h), versionado em `systemd/`.
6. **Módulo `modules/MMM-Briefing`**: manchetes na página 0 e notícia completa por tema na página 1.

## Fases seguintes
- **Fase 5: App de tarefas + Google Agenda**: FastAPI + SQLite na nuvem gratuita; sincroniza com o Google Agenda via conta de serviço; o espelho lê o iCal privado. Antes de codar: definir o modelo de dados.
- **Cotações**: módulo próprio (AwesomeAPI para USD/EUR/BTC; pesquisar fonte gratuita para o Ibovespa). Página 0 com as 4 principais; página 3 com lista configurável e minigráfico de 30 dias.
- **Sensores** (quando chegarem do AliExpress): soldar o PAJ7620 com técnico (pinos saindo pelo VERSO, lado sem o sensor) → testar na bancada → `sensord.py`. Depois, desligar a rotação de teste (`timings: { default: 0 }`).
- **Montagem física**: medir o corpo do monitor → vidro (menor transmissão de luz) e moldura.

## Pendências e lembretes
- Compras pendentes: fita isolante, filtro de linha (ver o de casa; checar o comprimento do cabo até a tomada), parafusos M4 VESA (depois), cabo HDMI curto (opcional).
- Ao chegar: conferir o adaptador HDMI Vention (saída para baixo) e o cabo C13 90° (saída pelo lado do N).
- Ideia futura: página de corrida (Strava).
- Repo público: nunca commitar senhas/chaves (`.env` e `config.env` estão no `.gitignore`).
- Sempre desligar com `sudo shutdown now` antes de tirar da tomada.