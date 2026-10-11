#!/usr/bin/env python3
"""Lê o e-mail do briefing diário via IMAP, extrai o bloco <<MIRROR_JSON>>,
valida com Pydantic e salva data/briefing.json para o módulo MMM-Briefing.

Se nada válido for encontrado, o briefing.json anterior é mantido.
Credenciais: variáveis de ambiente (ou .env na raiz do repo).
"""
from __future__ import annotations

import email
import html
import imaplib
import json
import logging
import os
import re
import sys
from email.message import Message
from pathlib import Path

from pydantic import BaseModel, Field, ValidationError

REPO = Path(__file__).resolve().parent.parent
OUTPUT = Path(os.environ.get("BRIEFING_OUTPUT", REPO / "data" / "briefing.json"))
IMAP_HOST = "imap.gmail.com"
SEARCH_SUBJECT = "Briefing"   # ASCII: o IMAP do Gmail casa com "Briefing Diário - ..."
MAX_EMAILS = 5                # quantos e-mails recentes tentar antes de desistir
BLOCK_RE = re.compile(r"<<MIRROR_JSON>>\s*(.*?)\s*<<END>>", re.S)

log = logging.getLogger("briefing")


# ---------- Modelo ----------
class Noticia(BaseModel):
    titulo: str = Field(min_length=1, max_length=80)   # prompt pede 55; folga p/ não descartar o dia
    resumo: str = Field(min_length=1, max_length=900)  # prompt pede 600
    fonte: str = ""


class Categoria(BaseModel):
    id: str
    nome: str
    noticias: list[Noticia] = Field(min_length=1)


class Briefing(BaseModel):
    data: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    categorias: list[Categoria] = Field(min_length=1)


# ---------- Utilitários ----------
def load_dotenv(path: Path) -> None:
    """Carrega KEY=VALUE de um .env sem sobrescrever o ambiente."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def body_text(msg: Message) -> str:
    """Corpo em texto puro; usa o HTML (sem tags) como alternativa."""
    plain, rich = [], []
    for part in msg.walk():
        if part.get_content_maintype() == "multipart" or part.get_filename():
            continue
        payload = part.get_payload(decode=True)
        if payload is None:
            continue
        text = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        if part.get_content_type() == "text/plain":
            plain.append(text)
        elif part.get_content_type() == "text/html":
            rich.append(html.unescape(re.sub(r"<[^>]+>", " ", text)))
    return "\n".join(plain) if plain else "\n".join(rich)


def parse_briefing(text: str) -> Briefing | None:
    match = BLOCK_RE.search(text)
    if not match:
        return None
    # O Gmail quebra o texto puro em linhas de ~76 caracteres, inclusive no meio
    # das strings do JSON; quebras de linha viram espaço antes de validar.
    raw = re.sub(r"[ \t]*\r?\n[ \t]*", " ", match.group(1))
    try:
        return Briefing.model_validate_json(raw)
    except ValidationError as exc:
        log.warning("JSON inválido: %s", exc.errors()[:3])
        return None


def save(briefing: Briefing) -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUTPUT.with_suffix(".tmp")
    tmp.write_text(briefing.model_dump_json(indent=2), encoding="utf-8")
    tmp.replace(OUTPUT)  # escrita atômica: o módulo nunca lê um arquivo pela metade


def current_date() -> str | None:
    try:
        return json.loads(OUTPUT.read_text(encoding="utf-8")).get("data")
    except (OSError, ValueError):
        return None


# ---------- Fluxo principal ----------
def fetch_latest(user: str, password: str) -> Briefing | None:
    with imaplib.IMAP4_SSL(IMAP_HOST, timeout=30) as imap:
        imap.login(user, password)
        imap.select("INBOX", readonly=True)  # readonly: não marca como lido
        _, data = imap.uid("search", None, f'(SUBJECT "{SEARCH_SUBJECT}")')
        uids = data[0].split()[-MAX_EMAILS:][::-1]  # mais recentes primeiro
        for uid in uids:
            _, msg_data = imap.uid("fetch", uid, "(RFC822)")
            msg = email.message_from_bytes(msg_data[0][1])
            briefing = parse_briefing(body_text(msg))
            if briefing:
                log.info("Briefing de %s encontrado (UID %s)", briefing.data, uid.decode())
                return briefing
            log.info("UID %s sem bloco válido, tentando o anterior", uid.decode())
    return None


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    load_dotenv(REPO / ".env")

    # Modo de teste offline: python briefing.py arquivo.txt
    if len(sys.argv) > 1:
        briefing = parse_briefing(Path(sys.argv[1]).read_text(encoding="utf-8"))
    else:
        user = os.environ.get("BRIEFING_IMAP_USER")
        password = os.environ.get("BRIEFING_IMAP_PASSWORD")
        if not user or not password:
            log.error("Defina BRIEFING_IMAP_USER e BRIEFING_IMAP_PASSWORD no .env")
            return 1
        try:
            briefing = fetch_latest(user, password)
        except (imaplib.IMAP4.error, OSError) as exc:
            log.error("Falha no IMAP: %s (mantendo o briefing anterior)", exc)
            return 1

    if briefing is None:
        log.warning("Nenhum briefing válido encontrado; mantendo o anterior")
        return 1
    if briefing.data == current_date():
        log.info("Briefing de %s já está salvo; nada a fazer", briefing.data)
        return 0
    save(briefing)
    log.info("Salvo em %s", OUTPUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())