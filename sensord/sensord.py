#!/usr/bin/env python3
"""sensord — sensores do espelho.

- PIR (7.1): acende a tela quando alguém chega e apaga depois de um tempo sem movimento.
- Gestos (7.2, PAJ7620 no I²C, ver paj7620.py): o gesto vai cru para o MagicMirror
  (POST /MMM-Sensores/evento) e o módulo MMM-Sensores traduz conforme a página. Sem o sensor
  ligado, o serviço segue só com o PIR e tenta achar o PAJ7620 de novo a cada 30 s.

Uso:
  python3 sensord.py            serviço (systemd/sensord.service)
  python3 sensord.py --teste    teclado simula o PIR e os gestos (rodar pelo SSH, com o
                                serviço parado: sudo systemctl stop sensord)
  python3 sensord.py --teste --gestos [--pir]   idem, usando também os sensores de verdade
                                (o log mostra o gesto cru do PAJ7620 e como ficou após a rotação)

Configuração por variáveis de ambiente (todas opcionais):
  SENSORD_PIR_GPIO      pino BCM do OUT do PIR (padrão 17 = pino físico 11; 0 desliga o PIR)
  SENSORD_APAGAR_APOS   segundos sem movimento até apagar a tela (padrão 300; 0 nunca apaga)
  SENSORD_MM_URL        endereço do MagicMirror (padrão http://127.0.0.1:8080)
  SENSORD_TELA          auto | wlopm | wlr-randr | nenhum (padrão auto: wlopm se houver)
  SENSORD_SAIDA         saída de vídeo (padrão HDMI-A-1)
  SENSORD_MODO          modo de vídeo ao religar com wlr-randr (padrão 1600x900@60Hz)
  SENSORD_TRANSFORM     rotação ao religar com wlr-randr (padrão 270)
  SENSORD_GESTOS        1 usa o PAJ7620, 0 não (padrão 1)
  SENSORD_I2C_BUS       barramento I²C do PAJ7620 (padrão 1)
  SENSORD_PAJ_ROTACAO   graus, sentido horário, em que o sensor foi montado girado (0/90/180/270)
  SENSORD_PAJ_ESPELHAR  1 troca esquerda/direita (e o sentido dos giros) (padrão 0)
"""
import argparse
import json
import os
import queue
import select
import shutil
import signal
import subprocess
import sys
import termios
import threading
import time
import tty
import urllib.error
import urllib.request

GESTOS = (
	"GESTO_DIREITA", "GESTO_ESQUERDA", "GESTO_CIMA", "GESTO_BAIXO",
	"GESTO_HORARIO", "GESTO_ANTI_HORARIO", "GESTO_APROXIMAR", "GESTO_AFASTAR", "GESTO_ACENO",
)

TECLAS = {
	"\x1b[C": "GESTO_DIREITA",
	"\x1b[D": "GESTO_ESQUERDA",
	"\x1b[A": "GESTO_CIMA",
	"\x1b[B": "GESTO_BAIXO",
	"h": "GESTO_HORARIO",
	"a": "GESTO_ANTI_HORARIO",
	"f": "GESTO_APROXIMAR",
	"t": "GESTO_AFASTAR",
	"o": "GESTO_ACENO",
}

AJUDA = """\
Modo de teste — teclas:
  ← → ↑ ↓   mão para esse lado (← = próxima página)   h / a   giro horário / anti-horário
  f / t     aproximar / afastar         o       aceno
  m         movimento (simula o PIR)    s       estado
  ?         esta ajuda                  q       sair (religa a tela)
"""


def log(msg: str) -> None:
	print(time.strftime("%H:%M:%S"), msg, flush=True)


def env_int(nome: str, padrao: int) -> int:
	valor = os.environ.get(nome, "").strip()
	if not valor:
		return padrao
	try:
		return int(valor)
	except ValueError:
		log(f"{nome}={valor!r} não é número; usando {padrao}")
		return padrao


# ---------------------------------------------------------------------------
# Tela
# ---------------------------------------------------------------------------
class Tela:
	"""Liga/desliga o monitor pela sessão Wayland (labwc).

	wlopm só corta o sinal (DPMS): o Chromium não percebe nada. wlr-randr desativa a saída;
	ao religar é preciso reaplicar o modo e a rotação.
	"""

	def __init__(self, metodo: str, saida: str, modo: str, transform: str):
		if metodo == "auto":
			metodo = "wlopm" if shutil.which("wlopm") else "wlr-randr" if shutil.which("wlr-randr") else "nenhum"
		self.metodo = metodo
		self.saida = saida
		self.modo = modo
		self.transform = transform
		self.env = dict(os.environ)
		self.env.setdefault("WAYLAND_DISPLAY", "wayland-0")
		self.env.setdefault("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")

	def _rodar(self, *cmd: str) -> bool:
		try:
			r = subprocess.run(cmd, env=self.env, capture_output=True, text=True, timeout=10)
		except (OSError, subprocess.TimeoutExpired) as e:
			log(f"falhou: {' '.join(cmd)} ({e})")
			return False
		if r.returncode != 0:
			log(f"falhou: {' '.join(cmd)} → {r.stderr.strip() or r.returncode}")
			return False
		return True

	def ligar(self) -> None:
		if self.metodo == "wlopm":
			self._rodar("wlopm", "--on", self.saida)
		elif self.metodo == "wlr-randr":
			self._rodar("wlr-randr", "--output", self.saida, "--on", "--mode", self.modo, "--transform", self.transform)
		if self.metodo != "nenhum":
			# o cursor volta para o meio quando a saída religa; manda para o canto
			self._rodar("wlrctl", "pointer", "move", "10000", "10000")

	def desligar(self) -> None:
		if self.metodo == "wlopm":
			self._rodar("wlopm", "--off", self.saida)
		elif self.metodo == "wlr-randr":
			self._rodar("wlr-randr", "--output", self.saida, "--off")


# ---------------------------------------------------------------------------
# MagicMirror
# ---------------------------------------------------------------------------
class Espelho:
	def __init__(self, url: str):
		self.url = url.rstrip("/") + "/MMM-Sensores/evento"

	def enviar(self, evento: str, **extra) -> None:
		corpo = json.dumps({"evento": evento, **extra}).encode()
		req = urllib.request.Request(self.url, data=corpo, method="POST",
			headers={"Content-Type": "application/json"})
		try:
			with urllib.request.urlopen(req, timeout=3):
				pass
		except (urllib.error.URLError, OSError) as e:
			log(f"MagicMirror não recebeu {evento} ({e})")


# ---------------------------------------------------------------------------
# PIR
# ---------------------------------------------------------------------------
def iniciar_pir(pino: int, fila: queue.Queue):
	try:
		from gpiozero import DigitalInputDevice
	except ImportError:
		log("gpiozero não encontrado (sudo apt install python3-gpiozero); seguindo sem o PIR")
		return None
	try:
		sensor = DigitalInputDevice(pino, pull_up=False)
	except Exception as e:  # gpiozero levanta tipos variados conforme a biblioteca de GPIO
		log(f"não consegui abrir o GPIO{pino} ({e}); seguindo sem o PIR")
		return None
	sensor.when_activated = lambda: fila.put(("movimento", None))
	log(f"PIR no GPIO{pino}")
	return sensor


# ---------------------------------------------------------------------------
# Gestos (PAJ7620)
# ---------------------------------------------------------------------------
def iniciar_gestos(fila: queue.Queue, barramento: int, rotacao: int, espelhar: bool) -> None:
	from paj7620 import PAJ7620, orientar  # mesmo diretório deste arquivo

	def laco() -> None:
		sensor = None
		avisou = False
		while True:
			if sensor is None:
				try:
					sensor = PAJ7620(barramento)
				except Exception as e:  # sem o módulo de I²C, sem o sensor, fio solto…
					if not avisou:
						log(f"PAJ7620 indisponível ({e}); tentando de novo a cada 30 s")
						avisou = True
					time.sleep(30)
					continue
				log(f"PAJ7620 pronto (I²C {barramento}, rotação {rotacao}°{', espelhado' if espelhar else ''})")
				avisou = False
			try:
				bruto = sensor.ler()
			except OSError as e:
				log(f"PAJ7620 parou de responder ({e})")
				sensor.fechar()
				sensor = None
				continue
			if bruto:
				gesto = orientar(bruto, rotacao, espelhar)
				if gesto != bruto:
					log(f"PAJ7620: {bruto} → {gesto}")
				fila.put(("gesto", f"GESTO_{gesto}"))
				time.sleep(0.3)  # um gesto por vez
			time.sleep(0.05)

	threading.Thread(target=laco, name="paj7620", daemon=True).start()


# ---------------------------------------------------------------------------
# Laço principal
# ---------------------------------------------------------------------------
class Sensord:
	def __init__(self, tela: Tela, espelho: Espelho, apagar_apos: int, pir=None):
		self.tela = tela
		self.espelho = espelho
		self.apagar_apos = apagar_apos
		self.pir = pir
		self.fila: queue.Queue = queue.Queue()
		self.ligada = True
		self.ultimo = time.monotonic()

	def acordar(self, motivo: str) -> None:
		self.ligada = True
		self.tela.ligar()
		self.espelho.enviar("PRESENCA", presente=True)
		log(f"tela ligada ({motivo})")

	def dormir(self) -> None:
		self.ligada = False
		self.espelho.enviar("PRESENCA", presente=False)
		self.tela.desligar()
		log(f"tela apagada ({self.apagar_apos}s sem movimento)")

	def tratar(self, tipo: str, valor) -> None:
		self.ultimo = time.monotonic()
		if tipo == "movimento":
			if not self.ligada:
				self.acordar("movimento")
			return
		if tipo == "gesto":
			if not self.ligada:
				self.acordar(f"{valor}; gesto descartado")  # o primeiro gesto só acorda
				return
			log(valor)
			self.espelho.enviar(valor)

	def passo(self) -> None:
		while True:
			try:
				tipo, valor = self.fila.get_nowait()
			except queue.Empty:
				break
			self.tratar(tipo, valor)
		agora = time.monotonic()
		if self.pir is not None and self.pir.value:
			self.ultimo = agora  # PIR em modo repetível: fica em 1 enquanto há movimento
		if self.ligada and self.apagar_apos > 0 and agora - self.ultimo >= self.apagar_apos:
			self.dormir()

	def estado(self) -> str:
		parado = int(time.monotonic() - self.ultimo)
		apaga = f"apaga com {self.apagar_apos}s" if self.apagar_apos > 0 else "nunca apaga"
		return f"tela {'ligada' if self.ligada else 'apagada'} · {parado}s sem movimento · {apaga} · método {self.tela.metodo}"


def ler_tecla(fd: int) -> str | None:
	if not select.select([fd], [], [], 0.2)[0]:
		return None
	c = os.read(fd, 1).decode(errors="ignore")
	if c == "\x1b":  # setas: ESC [ A..D
		while select.select([fd], [], [], 0.02)[0]:
			c += os.read(fd, 1).decode(errors="ignore")
			if len(c) >= 3:
				break
	return c


def rodar_teste(d: Sensord) -> None:
	if not sys.stdin.isatty():
		sys.exit("--teste precisa de um terminal (rode pelo SSH)")
	print(AJUDA, flush=True)
	log(d.estado())
	fd = sys.stdin.fileno()
	antigo = termios.tcgetattr(fd)
	try:
		tty.setcbreak(fd)
		while True:
			tecla = ler_tecla(fd)
			if tecla in ("q", "Q"):
				break
			if tecla == "?":
				print(AJUDA, flush=True)
			elif tecla == "s":
				log(d.estado())
			elif tecla == "m":
				log("movimento (simulado)")
				d.fila.put(("movimento", None))
			elif tecla in TECLAS:
				d.fila.put(("gesto", TECLAS[tecla]))
			d.passo()
	finally:
		termios.tcsetattr(fd, termios.TCSADRAIN, antigo)


def rodar_servico(d: Sensord) -> None:
	while True:
		d.passo()
		time.sleep(0.5)


def main() -> None:
	ap = argparse.ArgumentParser(description="Sensores do espelho (PIR e gestos)")
	ap.add_argument("--teste", action="store_true", help="teclado simula o PIR e os gestos")
	ap.add_argument("--pir", action="store_true", help="no teste, usar também o PIR de verdade")
	ap.add_argument("--gestos", action="store_true", help="no teste, usar também o PAJ7620 de verdade")
	ap.add_argument("--apagar-em", type=int, help="segundos sem movimento até apagar (sobrepõe SENSORD_APAGAR_APOS)")
	ap.add_argument("--sem-tela", action="store_true", help="não mexe no monitor, só mostra no terminal")
	args = ap.parse_args()

	tela = Tela(
		"nenhum" if args.sem_tela else os.environ.get("SENSORD_TELA", "auto"),
		os.environ.get("SENSORD_SAIDA", "HDMI-A-1"),
		os.environ.get("SENSORD_MODO", "1600x900@60Hz"),
		os.environ.get("SENSORD_TRANSFORM", "270"),
	)
	espelho = Espelho(os.environ.get("SENSORD_MM_URL", "http://127.0.0.1:8080"))
	apagar_apos = args.apagar_em if args.apagar_em is not None else env_int("SENSORD_APAGAR_APOS", 20 if args.teste else 300)

	d = Sensord(tela, espelho, apagar_apos)
	pino = env_int("SENSORD_PIR_GPIO", 17)
	if pino > 0 and (not args.teste or args.pir):
		d.pir = iniciar_pir(pino, d.fila)
	if env_int("SENSORD_GESTOS", 1) and (not args.teste or args.gestos):
		iniciar_gestos(d.fila, env_int("SENSORD_I2C_BUS", 1), env_int("SENSORD_PAJ_ROTACAO", 0),
			env_int("SENSORD_PAJ_ESPELHAR", 0) == 1)
	if d.pir is None and not args.teste and apagar_apos > 0:
		log("sem PIR: a tela não vai apagar sozinha (senão não acenderia mais)")
		d.apagar_apos = 0

	def encerrar(*_):
		raise SystemExit(0)

	signal.signal(signal.SIGTERM, encerrar)
	log(f"sensord iniciado · {d.estado()}")
	tela.ligar()
	try:
		rodar_teste(d) if args.teste else rodar_servico(d)
	except KeyboardInterrupt:
		pass
	finally:
		if not d.ligada:
			tela.ligar()  # nunca deixa o espelho apagado ao parar
		log("sensord parado")


if __name__ == "__main__":
	main()
