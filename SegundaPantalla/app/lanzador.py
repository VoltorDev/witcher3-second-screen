"""Lanzador para Steam: abre Segunda Pantalla con el juego y la cierra al salir.

Opciones de lanzamiento de The Witcher 3 en Steam (todo en una línea):
  "C:\\Python314\\pythonw.exe" "C:\\Users\\Nico\\Desktop\\Claude\\mods\\witcher3\\segunda-pantalla\\app\\lanzador.py" %command% -debugscripts

Steam sustituye %command% por el lanzador del juego. Este script:
  1. Aparta la caché de scripts si se compiló sin -debugscripts (sin llamadas al log
     el mod no puede enviar nada) para que el juego la regenere.
  2. Lanza el juego y el servidor local.
  3. Abre el panel en el segundo monitor cuando aparece la ventana del juego.
  4. Al cerrar el juego, cierra el panel y termina.
Sin consola: lo que ocurre queda en app/lanzador.log.
"""

import argparse
import ctypes
import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent


def preparar_salida():
    if LOG.exists() and LOG.stat().st_size > 1_000_000:
        LOG.replace(LOG.with_suffix(".log.1"))
    f = open(LOG, "a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stderr = f


sys.path.insert(0, str(APP_DIR))
import servidor  # noqa: E402

LOG = servidor.DATOS_DIR / "lanzador.log"
preparar_salida()

log = servidor.log
PROCESO_JUEGO = os.environ.get("SP_PROCESO_JUEGO", "witcher3.exe")


def carpeta_juego(ejecutable):
    p = Path(ejecutable).resolve()
    for d in [p.parent, *p.parents]:
        if (d / "content" / "content0").exists():
            return d
    return None


def revisar_cache(juego):
    """El juego reutiliza x64.final.redscripts mientras no cambien los scripts; si se compiló
    sin -debugscripts no tiene LogChannel y el mod queda mudo. Apartarla fuerza a recompilar."""
    if not juego or not (juego / "Mods" / "modSegundaPantalla").exists():
        return
    cache = juego / "content" / "content0" / "x64.final.redscripts"
    try:
        if cache.exists() and b"SP|" not in cache.read_bytes():
            destino = cache.with_name(cache.name + ".sin-log")
            os.replace(cache, destino)
            log("caché de scripts sin log apartada; el juego recompilará:", destino)
    except OSError as e:
        log("no pude revisar la caché de scripts:", e)


def puerto_ocupado(puerto):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", puerto)) == 0


def esperar(condicion, limite, paso=1.0):
    t0 = time.time()
    while time.time() - t0 < limite:
        if condicion():
            return True
        time.sleep(paso)
    return False


def main():
    comando = sys.argv[1:]
    log("---- lanzador:", " ".join(comando) or "(sin %command%)")
    if not comando:
        log("Falta %command% en las opciones de lanzamiento de Steam.")
        return
    revisar_cache(carpeta_juego(comando[0]))

    try:
        subprocess.Popen(comando, cwd=str(Path(comando[0]).parent) if Path(comando[0]).exists() else None)
    except OSError as e:
        log("no pude lanzar el juego:", e)
        return

    # Una sola instancia: si ya hay otro lanzador vigilando, este solo lanza el juego.
    global _mutex
    _mutex = servidor.kernel32.CreateMutexW(None, False, r"Local\SegundaPantallaWitcher3")
    if ctypes.get_last_error() == 183:  # ERROR_ALREADY_EXISTS
        log("ya hay un lanzador activo; solo lanzo el juego")
        return

    app = servidor.App(argparse.Namespace(log=None, proceso=None, sin_ventana=True))
    puerto = int(app.cfg.get("puerto", 8765))
    if puerto_ocupado(puerto):
        log("ya hay un servidor en el puerto", puerto, "; uso ese")
    else:
        threading.Thread(target=app.ejecutar, args=(False,), daemon=True).start()

    if not esperar(lambda: servidor.ventana_juego(PROCESO_JUEGO), limite=900):
        log("el juego no apareció en 15 minutos; salgo")
        return
    log("juego detectado")
    time.sleep(float(app.cfg.get("esperaAbrirPanelS", 4)))
    if not servidor.ventana_app():
        servidor.abrir_ventana(app.cfg, f"http://127.0.0.1:{puerto}/")
        # El navegador se lleva el foco al abrirse: se lo devolvemos al juego.
        if esperar(servidor.ventana_app, limite=15, paso=0.5):
            time.sleep(1.5)
            juego = servidor.ventana_juego(PROCESO_JUEGO)
            if juego:
                servidor.enfocar(juego)

    # Fin del juego: su ventana lleva 8 s sin existir (cubre pantallas de carga y cambios de modo).
    ausente = 0.0
    while ausente < 8:
        time.sleep(2)
        ausente = 0.0 if servidor.ventana_juego(PROCESO_JUEGO) else ausente + 2
    log("juego cerrado; cierro el panel")
    hwnd = servidor.ventana_app()
    if hwnd:
        servidor.user32.PostMessageW(hwnd, 0x0010, 0, 0)  # WM_CLOSE
    time.sleep(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # sin consola: que quede constancia de cualquier fallo
        import traceback
        log("error inesperado:", e)
        traceback.print_exc()
    finally:
        sys.stdout.flush()
        os._exit(0)
