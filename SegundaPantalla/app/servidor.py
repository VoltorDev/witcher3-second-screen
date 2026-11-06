"""Segunda Pantalla para The Witcher 3 — servidor local.

Lee las líneas "SP|..." que el mod escribe en scriptslog.txt, mantiene el estado
del juego y lo sirve a la interfaz web que se abre en el segundo monitor.
Las órdenes (beber, aceite, señal, seguir misión) vuelven al juego como
pulsaciones de F13..F24, que el mod decodifica.

Solo biblioteca estándar. Uso:  python servidor.py [--sin-ventana] [--log RUTA]
"""

import argparse
import ctypes
import ctypes.wintypes as wt
import ipaddress
import json
import os
import re
import secrets
import socket
import struct
import subprocess
import sys
import threading
import time
import urllib.parse
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
# El Python embebido del paquete (con su ._pth) no añade la carpeta del script a sys.path.
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))
WEB_DIR = APP_DIR / "web"
CONFIG_DEFAULT = APP_DIR / "config.default.json"
# Versión empaquetada (python\ o el .bat del instalador junto a app\, normalmente dentro de la carpeta
# del juego, que puede no admitir escritura): los datos del usuario van a %LOCALAPPDATA%. Desde la 1.2.0
# python\ no viene en el ZIP (lo descarga el instalador). En el proyecto, junto a la app.
if (APP_DIR.parent / "python").is_dir() or (APP_DIR.parent / "Install (Instalar).bat").exists():
    DATOS_DIR = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "Witcher3SecondScreen"
    DATOS_DIR.mkdir(parents=True, exist_ok=True)
else:
    DATOS_DIR = APP_DIR
CONFIG_USUARIO = DATOS_DIR / "config.json"
TITULO_VENTANA = "Witcher 3 Second Screen"

IS_WINDOWS = sys.platform == "win32"
if IS_WINDOWS:
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    shell32 = ctypes.WinDLL("shell32")


def log(*args):
    print(time.strftime("%H:%M:%S"), *args, flush=True)


# ---------------------------------------------------------------- configuración

def cargar_config():
    base = json.loads(CONFIG_DEFAULT.read_text(encoding="utf-8"))
    defecto = [dict(w) for w in base["layout"]["widgets"]]
    if CONFIG_USUARIO.exists():
        try:
            usuario = json.loads(CONFIG_USUARIO.read_text(encoding="utf-8"))
            base.update(usuario)
        except (OSError, ValueError) as e:
            log("config.json ilegible, uso valores por defecto:", e)
    # Paneles añadidos en versiones nuevas: aparecen ocultos para no romper la distribución guardada.
    ids = {w.get("id") for w in base["layout"].get("widgets", [])}
    for w in defecto:
        if w["id"] not in ids:
            base["layout"]["widgets"].append({**w, "visible": False})
    return base


def guardar_config(cfg):
    tmp = CONFIG_USUARIO.with_suffix(".tmp")
    tmp.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, CONFIG_USUARIO)


def carpeta_documentos():
    if IS_WINDOWS:
        buf = ctypes.create_unicode_buffer(wt.MAX_PATH)
        if shell32.SHGetFolderPathW(None, 5, None, 0, buf) == 0:  # CSIDL_PERSONAL
            return Path(buf.value)
    return Path.home() / "Documents"


def bibliotecas_steam():
    rutas = [Path(r"C:\Program Files (x86)\Steam")]
    vdf = rutas[0] / "steamapps" / "libraryfolders.vdf"
    try:
        for m in re.finditer(r'"path"\s+"([^"]+)"', vdf.read_text(encoding="utf-8", errors="replace")):
            p = Path(m.group(1).replace("\\\\", "\\"))
            if p not in rutas:
                rutas.append(p)
    except OSError:
        pass
    return rutas


def detectar_redkit(cfg):
    if cfg.get("rutaRedkit"):
        p = Path(cfg["rutaRedkit"])
        if (p / "r4data").exists():
            return p
    for lib in bibliotecas_steam():
        p = lib / "steamapps" / "common" / "The Witcher 3 REDkit"
        if (p / "r4data").exists():
            return p
    return None


def es_juego(p):
    return p and (p / "content" / "content0" / "texture.cache").exists()


def detectar_juego(cfg):
    """Carpeta de The Witcher 3: la configurada, la que contiene la app empaquetada, Steam o GOG."""
    candidatos = [Path(cfg["rutaJuego"])] if cfg.get("rutaJuego") else []
    candidatos.append(APP_DIR.parent.parent)  # paquete descomprimido en la carpeta del juego
    candidatos += [lib / "steamapps" / "common" / "The Witcher 3" for lib in bibliotecas_steam()]
    if IS_WINDOWS:
        import winreg
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\GOG.com\Games") as juegos:
                for i in range(winreg.QueryInfoKey(juegos)[0]):
                    with winreg.OpenKey(juegos, winreg.EnumKey(juegos, i)) as k:
                        try:
                            if "Witcher 3" in winreg.QueryValueEx(k, "gameName")[0]:
                                candidatos.append(Path(winreg.QueryValueEx(k, "path")[0]))
                        except OSError:
                            pass
        except OSError:
            pass
    return next((p for p in candidatos if es_juego(p)), None)


# ---------------------------------------------------- recursos: minimapa e iconos

class Recursos:
    """Teselas del minimapa e iconos.

    Primero de la caché de texturas del juego (texturas.py), que no necesita nada más; si no
    se puede leer (otra versión del formato), de r4data de REDkit si está instalado.
    """

    def __init__(self, juego, redkit):
        self.fuente = None
        self.raices_gui = []
        self.minimapas = {}
        self.iconos = {}
        self.texturas = None
        if juego:
            import texturas
            try:
                self.texturas = texturas.CacheTexturas(juego / "content" / "content0" / "texture.cache",
                                                       DATOS_DIR / "texturas")
                self.minimapas = self.texturas.minimapas
                self.iconos = self.texturas.iconos
                self.fuente = juego / "content" / "content0" / "texture.cache"
                log(f"Caché de texturas del juego: {len(self.minimapas)} mundos de minimapa, {len(self.iconos)} iconos")
                return
            except (OSError, ValueError, struct.error) as e:
                log("no se pudo leer texture.cache, pruebo con REDkit:", e)
                self.texturas = None
        if not redkit:
            return
        self.fuente = redkit
        r4 = redkit / "r4data"
        self.raices_gui.append(r4 / "gameplay" / "gui_new")
        dlc = r4 / "dlc"
        if dlc.exists():
            for d in sorted(dlc.iterdir()):
                g = d / "data" / "gameplay" / "gui_new"
                if g.exists():
                    self.raices_gui.append(g)
        for raiz in self.raices_gui:
            mm = raiz / "minimaps"
            if mm.exists():
                for mundo in mm.iterdir():
                    if mundo.is_dir():
                        self.minimapas.setdefault(mundo.name.lower(), mundo)
            ic = raiz / "icons"
            if ic.exists():
                for f in ic.rglob("*"):
                    if f.is_file() and f.suffix.lower() == ".png":
                        rel = f.relative_to(raiz).as_posix().lower()
                        self.iconos.setdefault(rel, f)
        log(f"REDkit: {len(self.minimapas)} mundos de minimapa, {len(self.iconos)} iconos")

    def _archivo(self, v):
        """Ruta en disco: la de REDkit tal cual o el PNG generado desde la caché del juego."""
        if isinstance(v, dict):
            try:
                return self.texturas.png_de(v)
            except (OSError, ValueError, zlib.error, struct.error) as e:
                log("textura ilegible:", v.get("ruta"), e)
                return None
        return v

    def tesela(self, mundo, x, y):
        carpeta = self.minimapas.get(mundo.lower())
        if not carpeta:
            return None
        if self.texturas:
            for ext in ("jpg", "png"):
                e = carpeta.get(f"tile{x}x{y}.{ext}")
                if e:
                    return self._archivo(e)
            return None
        for ext in ("jpg", "png"):
            f = carpeta / f"tile{x}x{y}.{ext}"
            if f.exists():
                return f
        return None

    def icono(self, ruta):
        ruta = ruta.replace("\\", "/").lstrip("/").lower()
        if ruta.startswith("img://"):
            ruta = ruta[6:]
        candidatos = [ruta]
        base, ext = os.path.splitext(ruta)
        if ext != ".png":
            candidatos.append(base + ".png")
        for c in candidatos:
            if c in self.iconos:
                return self._archivo(self.iconos[c])
        # Algunos iconos del juego llevan otra extensión o sufijo de tamaño: busca por nombre.
        nombre = os.path.basename(base)
        for clave, f in self.iconos.items():
            if os.path.splitext(os.path.basename(clave))[0] == nombre:
                return self._archivo(f)
        return None


# --------------------------------------------------------------- estado juego

def num(s, defecto=0.0):
    try:
        return float(s.replace(",", "."))
    except (ValueError, AttributeError):
        return defecto


def entero(s, defecto=0):
    try:
        return int(float(s.replace(",", ".")))
    except (ValueError, AttributeError):
        return defecto


class EstadoJuego:
    def __init__(self):
        self.lock = threading.Condition()
        self.version = 0
        self.ultima_linea = 0.0
        self.datos = self._vacio()
        self.pendientes = {}

    @staticmethod
    def _vacio():
        return {
            "hola": None, "pos": None, "stat": None, "buffs": [], "inv": {"seq": 0, "items": []},
            "espadas": {"acero": None, "plata": None}, "mision": None,
            "misiones": {"seq": 0, "items": []}, "pines": {"seq": 0, "items": []}, "acks": [],
            "menuPausa": False,
        }

    def reiniciar(self):
        with self.lock:
            self.datos = self._vacio()
            self.pendientes = {}
            self._cambio()

    def _cambio(self):
        self.version += 1
        self.lock.notify_all()

    def instantanea(self):
        with self.lock:
            d = dict(self.datos)
            d["version"] = self.version
            d["segundosSinDatos"] = round(time.time() - self.ultima_linea, 1) if self.ultima_linea else None
            return d

    def esperar(self, desde, timeout):
        with self.lock:
            if self.version <= desde:
                self.lock.wait(timeout)
        return self.instantanea()

    # Una línea del log: "...SP|tipo|campo|campo..."
    def procesar(self, linea, en_vivo=True):
        i = linea.find("SP|")
        if i < 0:
            return
        partes = linea[i:].rstrip("\r\n").split("|")
        if len(partes) < 2:
            return
        tipo, campos = partes[1], partes[2:]
        with self.lock:
            if en_vivo:
                self.ultima_linea = time.time()
            try:
                manejador = getattr(self, "_t_" + tipo, None)
                if manejador:
                    manejador(campos)
                    self._cambio()
            except (IndexError, ValueError) as e:
                log("línea mal formada:", tipo, e)

    def _t_hello(self, c):
        self.datos["hola"] = {"version": c[0] if c else "", "idioma": c[1] if len(c) > 1 else ""}

    def _t_hb(self, c):
        pass

    def _t_menu(self, c):
        self.datos["menuPausa"] = bool(c) and c[0] == "1"

    def _t_pos(self, c):
        self.datos["pos"] = {
            "mundo": c[0], "area": c[1], "tamNivel": num(c[2]), "numTeselas": entero(c[3]),
            "tamTextura": entero(c[4]), "ext": c[5], "x": num(c[6]), "y": num(c[7]), "z": num(c[8]),
            "yaw": num(c[9]), "camara": num(c[10]),
        }

    def _t_stat(self, c):
        self.datos["stat"] = {
            "vida": num(c[0]), "vidaMax": num(c[1]), "toxicidad": num(c[2]), "toxicidadMax": num(c[3]),
            "adrenalina": num(c[4]), "adrenalinaMax": num(c[5]), "aguante": num(c[6]), "aguanteMax": num(c[7]),
            "nivel": entero(c[8]), "coronas": entero(c[9]), "hora": entero(c[10]), "minuto": entero(c[11]),
            "combate": c[12] == "1", "senal": entero(c[13]), "peso": num(c[14]), "pesoMax": num(c[15]),
            "geralt": c[16] == "1" if len(c) > 16 else True,
        }

    def _t_buffs(self, c):
        texto = "|".join(c)
        lista = []
        for e in filter(None, texto.split("^")):
            f = e.split("~")
            lista.append({"nombre": f[0], "resta": entero(f[1]), "total": entero(f[2]),
                          "icono": f[3] if len(f) > 3 else "", "negativo": len(f) > 4 and f[4] == "1"})
        self.datos["buffs"] = lista

    def _t_swords(self, c):
        def espada(txt):
            if not txt:
                return None
            f = txt.split("~")
            aceites = []
            for k in range(2, len(f) - 2, 3):
                aceites.append({"nombre": f[k], "cargas": entero(f[k + 1]), "max": entero(f[k + 2])})
            return {"nombre": f[0], "icono": f[1] if len(f) > 1 else "", "aceites": aceites}
        self.datos["espadas"] = {"acero": espada(c[0] if c else ""), "plata": espada(c[1] if len(c) > 1 else "")}

    def _t_quest(self, c):
        if not c or not c[0]:
            self.datos["mision"] = None
            return
        objetivos = []
        for e in filter(None, (c[2] if len(c) > 2 else "").split("^")):
            f = e.split("~")
            objetivos.append({"texto": f[0], "destacado": len(f) > 1 and f[1] == "1"})
        self.datos["mision"] = {"titulo": c[0], "tipo": entero(c[1]), "objetivos": objetivos}

    def _t_ack(self, c):
        ack = {"n": entero(c[0]), "orden": c[1], "ok": c[2] == "1", "mensaje": c[3] if len(c) > 3 else "",
               "hora": time.time()}
        self.datos["acks"] = (self.datos["acks"] + [ack])[-10:]

    # Listas troceadas: tipo|seq|trozo|total|elementos
    def _lista(self, tipo, c, convertir):
        seq, trozo, total = entero(c[0]), entero(c[1]), entero(c[2])
        texto = "|".join(c[3:])
        p = self.pendientes.get(tipo)
        if not p or p["seq"] != seq or trozo == 0:
            p = {"seq": seq, "trozos": {}, "total": total}
            self.pendientes[tipo] = p
        p["trozos"][trozo] = texto
        if len(p["trozos"]) < total:
            return False
        elementos = []
        for k in range(total):
            for e in filter(None, p["trozos"].get(k, "").split("^")):
                elementos.append(convertir(e.split("~"), len(elementos)))
        del self.pendientes[tipo]
        return {"seq": seq, "items": elementos}

    def _t_inv(self, c):
        def conv(f, i):
            return {"indice": i, "cat": f[0], "nombre": f[1], "cantidad": entero(f[2]), "cargas": entero(f[3]),
                    "cargasMax": entero(f[4]), "icono": f[5], "hueco": entero(f[6]), "id": f[7] if len(f) > 7 else f[1]}
        r = self._lista("inv", c, conv)
        if r:
            self.datos["inv"] = r

    def _t_quests(self, c):
        def conv(f, i):
            return {"indice": i, "titulo": f[0], "tipo": entero(f[1]), "seguida": len(f) > 2 and f[2] == "1"}
        r = self._lista("quests", c, conv)
        if r:
            self.datos["misiones"] = r

    def _t_pins(self, c):
        def conv(f, i):
            return {"tipo": f[0], "x": entero(f[1]), "y": entero(f[2]), "mision": f[3] == "1",
                    "destacado": f[4] == "1", "radio": entero(f[5]) if len(f) > 5 else 0}
        r = self._lista("pins", c, conv)
        if r:
            self.datos["pines"] = r


# ------------------------------------------------------------------ lector log

def rutas_log_candidatas():
    docs = [carpeta_documentos(), Path.home() / "Documents", Path.home() / "OneDrive" / "Documentos",
            Path.home() / "OneDrive" / "Documents"]
    vistas, res = set(), []
    for d in docs:
        for nombre in ("scriptslog.txt", "scriptlog.txt"):
            p = d / "The Witcher 3" / nombre
            if str(p).lower() not in vistas:
                vistas.add(str(p).lower())
                res.append(p)
    return res


class LectorLog(threading.Thread):
    """Sigue scriptslog.txt. Con ruta fija la usa; si no, elige el candidato modificado más reciente."""

    def __init__(self, estado, ruta, fija):
        super().__init__(daemon=True)
        self.estado = estado
        self.ruta = Path(ruta)
        self.fija = fija
        self.ultima_busqueda = 0.0
        self.pos = 0
        self.codificacion = None
        self.resto = b""
        self.existe = False

    def _detectar(self, cabeza):
        if cabeza.startswith(b"\xff\xfe"):
            return "utf-16-le"
        if cabeza.startswith(b"\xef\xbb\xbf"):
            return "utf-8-sig"
        if cabeza and cabeza.count(b"\x00") > len(cabeza) // 4:
            return "utf-16-le"
        return "utf-8"

    def _leer(self, en_vivo):
        with open(self.ruta, "rb") as f:
            if self.codificacion is None:
                self.codificacion = self._detectar(f.read(4096))
                log("log detectado:", self.ruta, "codificación", self.codificacion)
            f.seek(self.pos)
            bloque = f.read()
            self.pos = f.tell()
        if not bloque:
            return
        datos = self.resto + bloque
        if self.codificacion.startswith("utf-16"):
            corte = datos.rfind(b"\n\x00")
            if corte < 0:
                self.resto = datos
                return
            corte += 2
        else:
            corte = datos.rfind(b"\n")
            if corte < 0:
                self.resto = datos
                return
            corte += 1
        self.resto = datos[corte:]
        texto = datos[:corte].decode(self.codificacion, errors="replace")
        for linea in texto.splitlines():
            if "SP|" in linea:
                self.estado.procesar(linea, en_vivo)

    def _elegir_ruta(self):
        if self.fija or time.time() - self.ultima_busqueda < 3:
            return
        self.ultima_busqueda = time.time()
        existentes = [p for p in rutas_log_candidatas() if p.exists()]
        if not existentes:
            return
        mejor = max(existentes, key=lambda p: p.stat().st_mtime)
        if mejor != self.ruta and (not self.ruta.exists() or mejor.stat().st_mtime > self.ruta.stat().st_mtime + 5):
            log("uso el log", mejor)
            self.ruta = mejor
            self.existe = False
            self.estado.ruta_log = str(mejor)

    def run(self):
        primera = True
        while True:
            try:
                self._elegir_ruta()
                if self.ruta.exists():
                    tam = self.ruta.stat().st_size
                    if not self.existe or tam < self.pos:
                        # Archivo nuevo o truncado (el juego lo recrea al arrancar).
                        if self.existe:
                            log("log reiniciado, empiezo de cero")
                            self.estado.reiniciar()
                        self.existe = True
                        self.pos = 0
                        self.resto = b""
                        self.codificacion = None
                    if tam > self.pos:
                        # La primera pasada reconstruye el estado sin darlo por "en vivo".
                        self._leer(en_vivo=not primera)
                    primera = False
                else:
                    if self.existe:
                        log("el log ha desaparecido")
                    self.existe = False
                    primera = False
            except OSError as e:
                log("error leyendo log:", e)
            time.sleep(0.1)


# ------------------------------------------------------------ teclado y ventanas

if IS_WINDOWS:
    ULONG_PTR = ctypes.c_size_t

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [("wVk", wt.WORD), ("wScan", wt.WORD), ("dwFlags", wt.DWORD),
                    ("time", wt.DWORD), ("dwExtraInfo", ULONG_PTR)]

    class MOUSEINPUT(ctypes.Structure):
        _fields_ = [("dx", wt.LONG), ("dy", wt.LONG), ("mouseData", wt.DWORD), ("dwFlags", wt.DWORD),
                    ("time", wt.DWORD), ("dwExtraInfo", ULONG_PTR)]

    class _INPUTUNION(ctypes.Union):
        _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT)]

    class INPUT(ctypes.Structure):
        _fields_ = [("type", wt.DWORD), ("u", _INPUTUNION)]

    class MONITORINFOEXW(ctypes.Structure):
        _fields_ = [("cbSize", wt.DWORD), ("rcMonitor", wt.RECT), ("rcWork", wt.RECT),
                    ("dwFlags", wt.DWORD), ("szDevice", wt.WCHAR * 32)]

    user32.SendInput.argtypes = (wt.UINT, ctypes.POINTER(INPUT), ctypes.c_int)
    WNDENUMPROC = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    MONITORENUMPROC = ctypes.WINFUNCTYPE(wt.BOOL, wt.HMONITOR, wt.HDC, ctypes.POINTER(wt.RECT), wt.LPARAM)

# F13..F24: códigos virtuales y de exploración (set 1).
TECLAS_F = [(0x7C + i, sc) for i, sc in enumerate([0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x6B, 0x6C, 0x6D, 0x6E, 0x76])]
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_SCANCODE = 0x0008


def nombre_proceso(pid):
    h = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
    if not h:
        return ""
    try:
        buf = ctypes.create_unicode_buffer(1024)
        tam = wt.DWORD(1024)
        if kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(tam)):
            return os.path.basename(buf.value).lower()
        return ""
    finally:
        kernel32.CloseHandle(h)


def ventanas_visibles():
    res = []

    def cb(hwnd, _):
        if user32.IsWindowVisible(hwnd):
            n = user32.GetWindowTextLengthW(hwnd)
            buf = ctypes.create_unicode_buffer(n + 1)
            user32.GetWindowTextW(hwnd, buf, n + 1)
            pid = wt.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            res.append((hwnd, buf.value, pid.value))
        return True

    user32.EnumWindows(WNDENUMPROC(cb), 0)
    return res


def ventana_juego(proceso="witcher3.exe"):
    for hwnd, titulo, pid in ventanas_visibles():
        if titulo and nombre_proceso(pid) == proceso.lower():
            return hwnd
    return None


_LINEAS_PROCESO = {}


def linea_de_ordenes(pid):
    """Línea de órdenes de un proceso (vía CIM; solo se consulta para ventanas candidatas)."""
    if pid not in _LINEAS_PROCESO:
        try:
            r = subprocess.run(["powershell", "-NoProfile", "-Command",
                                f"(Get-CimInstance Win32_Process -Filter 'ProcessId={int(pid)}').CommandLine"],
                               capture_output=True, text=True, timeout=10, creationflags=0x08000000)
            _LINEAS_PROCESO[pid] = r.stdout
        except (OSError, subprocess.SubprocessError):
            _LINEAS_PROCESO[pid] = ""
    return _LINEAS_PROCESO[pid]


def ventana_app():
    """La ventana del panel: título propio y navegador abierto con nuestro perfil (no una
    pestaña cualquiera con la página abierta)."""
    perfil = str(DATOS_DIR / "perfil-navegador").lower()
    for hwnd, titulo, pid in ventanas_visibles():
        if titulo.startswith(TITULO_VENTANA) and perfil in linea_de_ordenes(pid).lower():
            return hwnd
    return None


def enfocar(hwnd):
    if user32.GetForegroundWindow() == hwnd:
        return True
    # Windows solo deja traer otra ventana al frente tras una pulsación propia: Alt "vacío".
    _pulsar_vk(0x12, abajo=True)
    _pulsar_vk(0x12, abajo=False)
    user32.ShowWindow(hwnd, 9 if user32.IsIconic(hwnd) else 5)
    user32.SetForegroundWindow(hwnd)
    for _ in range(20):
        if user32.GetForegroundWindow() == hwnd:
            return True
        time.sleep(0.02)
    return user32.GetForegroundWindow() == hwnd


def _pulsar_vk(vk, abajo):
    inp = INPUT(type=1)
    inp.u.ki = KEYBDINPUT(wVk=vk, wScan=0, dwFlags=0 if abajo else KEYEVENTF_KEYUP, time=0, dwExtraInfo=0)
    user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))


def pulsar_f(indice, retardo):
    vk, sc = TECLAS_F[indice]
    for flags in (KEYEVENTF_SCANCODE, KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP):
        inp = INPUT(type=1)
        inp.u.ki = KEYBDINPUT(wVk=vk, wScan=sc, dwFlags=flags, time=0, dwExtraInfo=0)
        user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
        time.sleep(retardo)


def pulsar_sc(scancode, retardo):
    for flags in (KEYEVENTF_SCANCODE, KEYEVENTF_SCANCODE | KEYEVENTF_KEYUP):
        inp = INPUT(type=1)
        inp.u.ki = KEYBDINPUT(wVk=0, wScan=scancode, dwFlags=flags, time=0, dwExtraInfo=0)
        user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
        time.sleep(retardo)


def monitores():
    res = []

    def cb(hmon, hdc, rect, _):
        info = MONITORINFOEXW()
        info.cbSize = ctypes.sizeof(MONITORINFOEXW)
        user32.GetMonitorInfoW(hmon, ctypes.byref(info))
        r = info.rcMonitor
        res.append({"nombre": info.szDevice, "x": r.left, "y": r.top, "ancho": r.right - r.left,
                    "alto": r.bottom - r.top, "principal": bool(info.dwFlags & 1)})
        return True

    if IS_WINDOWS:
        user32.EnumDisplayMonitors(None, None, MONITORENUMPROC(cb), 0)
    for i, m in enumerate(res):
        m["indice"] = i
    return res


def monitor_elegido(cfg):
    lista = monitores()
    if not lista:
        return None
    elegido = cfg.get("monitor", "secundario")
    for m in lista:
        if m["nombre"] == elegido:
            return m
    if elegido == "principal":
        return next((m for m in lista if m["principal"]), lista[0])
    return next((m for m in lista if not m["principal"]), lista[0])


# ---------------------------------------------------------------- órdenes

OPS = {"reenviar": 0, "usar": 1, "aceiteAcero": 2, "aceitePlata": 3, "senal": 4, "seguir": 5}
VERSION = "1.2.1"


class ErrorOrden(ValueError):
    """Error de una orden con código estable: la interfaz lo traduce a su idioma."""

    def __init__(self, codigo, texto):
        super().__init__(texto)
        self.codigo = codigo


def fallo(codigo, texto):
    return {"ok": False, "codigo": codigo, "error": texto}


class Ordenes:
    def __init__(self, estado, cfg):
        self.estado = estado
        self.cfg = cfg
        self.lock = threading.Lock()

    def construir(self, orden):
        accion = orden.get("accion")
        if accion not in OPS:
            raise ErrorOrden("accion_desconocida", f"acción desconocida: {accion}")
        op = OPS[accion]
        if accion == "reenviar":
            return [op]
        if accion == "senal":
            return [op, int(orden["senal"])]
        d = self.estado.instantanea()
        if accion == "seguir":
            lista = d["misiones"]
            indice = int(orden["indice"])
            if not 0 <= indice < len(lista["items"]):
                raise ErrorOrden("mision_desaparecida", "esa misión ya no está en la lista")
            return [op, lista["seq"] % 10] + [int(ch) for ch in str(indice)]
        inv = d["inv"]
        indice = self.resolver(inv["items"], orden)
        if indice is None:
            raise ErrorOrden("sin_objeto", "no tienes ese objeto")
        return [op, inv["seq"] % 10] + [int(ch) for ch in str(indice)]

    @staticmethod
    def resolver(items, orden):
        if orden.get("id"):
            candidatos = [it for it in items if it["id"] == orden["id"]]
            if not candidatos:
                return None
            # Pociones: primero la que tenga cargas.
            candidatos.sort(key=lambda it: (it["cat"] in ("pot", "dec") and it["cargas"] <= 0, it["indice"]))
            return candidatos[0]["indice"]
        if "indice" in orden:
            i = int(orden["indice"])
            return i if 0 <= i < len(items) else None
        return None

    def enviar(self, orden):
        digitos = self.construir(orden)
        if not IS_WINDOWS:
            return fallo("solo_windows", "solo Windows")
        with self.lock:
            juego = ventana_juego(self.cfg.get("procesoJuego") or "witcher3.exe")
            if not juego:
                return fallo("juego_cerrado", "Witcher 3 no está abierto")
            retardo = self.cfg.get("retardoTeclaMs", 35) / 1000
            if user32.GetForegroundWindow() != juego:
                if not self.cfg.get("enfocarJuego", True) or not enfocar(juego):
                    return fallo("sin_foco", "no pude poner el juego en primer plano")
                time.sleep(self.cfg.get("esperaTrasEnfocarMs", 120) / 1000)
                # Al perder el foco, el juego abre el menú de pausa: se cierra con Escape solo si
                # el mod confirma que está abierto, y se espera a que confirme que se cerró.
                if self.estado.instantanea().get("menuPausa"):
                    pulsar_sc(0x01, retardo)
                    t0 = time.time()
                    while self.estado.instantanea().get("menuPausa") and time.time() - t0 < 2:
                        time.sleep(0.05)
                    if self.estado.instantanea().get("menuPausa"):
                        return fallo("menu_pausa", "el juego sigue en el menú de pausa")
                    time.sleep(0.15)
            pulsar_f(0, retardo)
            for dgt in digitos:
                pulsar_f(1 + dgt, retardo)
            pulsar_f(11, retardo)
        return {"ok": True, "secuencia": "".join(map(str, digitos))}


# ------------------------------------------------------------------ atajos globales

MODS = {"alt": 0x1, "ctrl": 0x2, "control": 0x2, "shift": 0x4, "mayus": 0x4, "win": 0x8}


def parsear_atajo(texto):
    partes = [p.strip().lower() for p in texto.split("+") if p.strip()]
    if not partes:
        return None
    mods, tecla = 0x4000, partes[-1]  # MOD_NOREPEAT
    for p in partes[:-1]:
        if p not in MODS:
            return None
        mods |= MODS[p]
    if len(tecla) == 1 and tecla.isalnum():
        vk = ord(tecla.upper())
    elif re.fullmatch(r"f([1-9]|1[0-2])", tecla):
        vk = 0x6F + int(tecla[1:])
    elif re.fullmatch(r"num[0-9]", tecla):
        vk = 0x60 + int(tecla[3])
    else:
        return None
    return mods, vk


class Atajos(threading.Thread):
    """Registra los atajos de las ranuras rápidas (RegisterHotKey) y los ejecuta."""

    def __init__(self, ordenes, cfg):
        super().__init__(daemon=True)
        self.ordenes = ordenes
        self.cfg = cfg
        self.hilo = None

    def recargar(self):
        if self.hilo:
            user32.PostThreadMessageW(self.hilo, 0x0400, 0, 0)  # WM_USER: recargar

    def _registrar(self):
        acciones = {}
        for i, ranura in enumerate(self.cfg.get("ranuras", [])):
            atajo = (ranura.get("atajo") or "").strip()
            if not atajo:
                continue
            p = parsear_atajo(atajo)
            if not p:
                log("atajo no válido:", atajo)
                continue
            if user32.RegisterHotKey(None, 100 + i, p[0], p[1]):
                acciones[100 + i] = ranura
            else:
                log("no pude registrar el atajo (¿lo usa otro programa?):", atajo)
        return acciones

    def run(self):
        if not IS_WINDOWS:
            return
        self.hilo = kernel32.GetCurrentThreadId()
        acciones = self._registrar()
        msg = wt.MSG()
        while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
            if msg.message == 0x0312 and msg.wParam in acciones:  # WM_HOTKEY
                ranura = acciones[msg.wParam]
                orden = {"accion": ranura.get("accion", "usar"), "id": ranura.get("id")}
                threading.Thread(target=self._ejecutar, args=(orden,), daemon=True).start()
            elif msg.message == 0x0400:
                for k in acciones:
                    user32.UnregisterHotKey(None, k)
                acciones = self._registrar()

    def _ejecutar(self, orden):
        try:
            log("atajo:", orden, self.ordenes.enviar(orden))
        except ValueError as e:
            log("atajo sin efecto:", e)


# --------------------------------------------------------------- ventana web

def buscar_navegador():
    for p in [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
              r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
              r"C:\Program Files\Google\Chrome\Application\chrome.exe",
              r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"]:
        if os.path.exists(p):
            return p
    return None


def abrir_ventana(cfg, url):
    nav = buscar_navegador()
    if not nav:
        log("No encuentro Edge ni Chrome: abre", url, "a mano")
        return
    m = monitor_elegido(cfg)
    args = [nav, f"--app={url}", f"--user-data-dir={DATOS_DIR / 'perfil-navegador'}",
            "--no-first-run", "--no-default-browser-check", "--disable-features=Translate,msEdgeSidebar"]
    if m:
        args += [f"--window-position={m['x']},{m['y']}", f"--window-size={m['ancho']},{m['alto']}"]
    if cfg.get("pantallaCompleta", True):
        args.append("--start-fullscreen")
    subprocess.Popen(args, close_fds=True)
    log("ventana abierta en", m["nombre"] if m else "monitor por defecto")


def mover_ventana(cfg):
    hwnd = ventana_app()
    m = monitor_elegido(cfg)
    if not hwnd or not m:
        return False
    user32.ShowWindow(hwnd, 9)
    user32.SetWindowPos(hwnd, None, m["x"], m["y"], m["ancho"], m["alto"], 0x0004 | 0x0040)
    return True


# ------------------------------------------------------------------ HTTP

TIPOS_MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
              ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
              ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".ico": "image/x-icon"}


def crear_manejador(app):
    class Manejador(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):
            pass

        def _autorizado(self):
            if self.client_address[0] in ("127.0.0.1", "::1"):
                return True
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            token = q.get("t", [""])[0] or self.headers.get("X-Token", "")
            return bool(app.cfg.get("token")) and secrets.compare_digest(token, app.cfg["token"])

        def _enviar(self, codigo, cuerpo, tipo="application/json; charset=utf-8", cache=False):
            if isinstance(cuerpo, (dict, list)):
                cuerpo = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
            elif isinstance(cuerpo, str):
                cuerpo = cuerpo.encode("utf-8")
            self.send_response(codigo)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(cuerpo)))
            self.send_header("Cache-Control", "max-age=86400" if cache else "no-store")
            self.end_headers()
            self.wfile.write(cuerpo)

        def _archivo(self, ruta, cache=True):
            try:
                datos = Path(ruta).read_bytes()
            except OSError:
                return self._enviar(404, {"error": "no encontrado"})
            self._enviar(200, datos, TIPOS_MIME.get(Path(ruta).suffix.lower(), "application/octet-stream"), cache)

        def _cuerpo(self):
            n = int(self.headers.get("Content-Length") or 0)
            if n > 1_000_000:
                raise ValueError("cuerpo demasiado grande")
            return json.loads(self.rfile.read(n) or b"{}")

        def do_GET(self):
            url = urllib.parse.urlparse(self.path)
            q = urllib.parse.parse_qs(url.query)
            ruta = url.path
            # Los archivos de la interfaz no llevan datos de la partida: index.html los pide sin
            # clave, así que se sirven sin ella. Todo lo demás exige la clave desde la red.
            if not ruta.startswith("/web/") and not self._autorizado():
                return self._enviar(403, {"error": "token requerido"})
            if ruta in ("/", "/index.html"):
                return self._archivo(WEB_DIR / "index.html", cache=False)
            if ruta.startswith("/web/"):
                f = (WEB_DIR / ruta[5:]).resolve()
                if WEB_DIR.resolve() not in f.parents:
                    return self._enviar(404, {"error": "no encontrado"})
                return self._archivo(f, cache=False)
            if ruta == "/estado":
                desde = int(q.get("desde", ["0"])[0] or 0)
                return self._enviar(200, app.estado.esperar(desde, 1.0))
            if ruta == "/config":
                return self._enviar(200, app.config_publica())
            if ruta == "/layout-defecto":
                return self._enviar(200, json.loads(CONFIG_DEFAULT.read_text(encoding="utf-8"))["layout"])
            if ruta == "/monitores":
                return self._enviar(200, monitores())
            m = re.fullmatch(r"/tesela/([\w\-]+)/(\d+)/(\d+)", ruta)
            if m:
                f = app.recursos.tesela(m.group(1), m.group(2), m.group(3))
                return self._archivo(f) if f else self._enviar(404, {"error": "sin tesela"})
            if ruta == "/icono":
                f = app.recursos.icono(q.get("ruta", [""])[0])
                return self._archivo(f) if f else self._enviar(404, {"error": "sin icono"})
            self._enviar(404, {"error": "no encontrado"})

        def do_POST(self):
            if not self._autorizado():
                return self._enviar(403, {"error": "token requerido"})
            ruta = urllib.parse.urlparse(self.path).path
            try:
                cuerpo = self._cuerpo()
            except ValueError as e:
                return self._enviar(400, {"error": str(e)})
            if ruta == "/orden":
                try:
                    return self._enviar(200, app.ordenes.enviar(cuerpo))
                except (ValueError, KeyError) as e:
                    return self._enviar(200, fallo(getattr(e, "codigo", "orden_invalida"), str(e)))
            if ruta == "/config":
                app.actualizar_config(cuerpo)
                return self._enviar(200, app.config_publica())
            if ruta == "/red":
                # Activar o quitar el acceso desde el móvil solo se permite desde el propio PC.
                if self.client_address[0] not in ("127.0.0.1", "::1"):
                    return self._enviar(403, {"error": "solo desde el PC"})
                app.cambiar_red(cuerpo.get("activo"))
                return self._enviar(200, app.config_publica())
            if ruta == "/ventana/mover":
                return self._enviar(200, {"ok": mover_ventana(app.cfg)})
            self._enviar(404, {"error": "no encontrado"})

    return Manejador


class ServidorSilencioso(ThreadingHTTPServer):
    """El panel corta peticiones en curso al cerrarse o recargar: no es un error."""

    def handle_error(self, request, client_address):
        if not isinstance(sys.exc_info()[1], (ConnectionError, TimeoutError)):
            super().handle_error(request, client_address)


def ips_locales():
    """IPv4 privada del PC en la red de casa, para abrir el panel desde un móvil o una tableta.
    Primero la interfaz con ruta de salida (la wifi o el cable); los adaptadores virtuales
    (WSL, Hyper-V, VPN) solo se usan si no hay otra."""
    def valida(ip):
        d = ipaddress.ip_address(ip)
        return d.is_private and not d.is_loopback and not d.is_link_local

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))  # UDP sin enviar nada: solo elige la interfaz de salida
            ip = s.getsockname()[0]
        if valida(ip):
            return [ip]
    except OSError:
        pass
    try:
        return [ip for ip in socket.gethostbyname_ex(socket.gethostname())[2] if valida(ip)]
    except OSError:
        return []


class App:
    # escucharEnRed no está aquí: solo se cambia desde el PC, con POST /red.
    EDITABLES = {"layout", "ranuras", "monitor", "pantallaCompleta", "retardoTeclaMs", "enfocarJuego",
                 "minimapa", "idioma", "espejo"}

    def __init__(self, args):
        self.cfg = cargar_config()
        if not self.cfg.get("token"):
            self.cfg["token"] = secrets.token_urlsafe(12)
            self.guardar()
        # Ajustes de línea de órdenes: valen para esta ejecución, no se guardan.
        self.temporales = {}
        if args.log:
            self.temporales["rutaLog"] = args.log
        if args.proceso:
            self.temporales["procesoJuego"] = args.proceso
        self.cfg_guardada = dict(self.cfg)
        self.cfg.update(self.temporales)
        self.ruta_log = Path(self.cfg.get("rutaLog") or carpeta_documentos() / "The Witcher 3" / "scriptslog.txt")
        self.estado = EstadoJuego()
        self.recursos = Recursos(detectar_juego(self.cfg), detectar_redkit(self.cfg))
        self.ordenes = Ordenes(self.estado, self.cfg)
        self.atajos = Atajos(self.ordenes, self.cfg)
        self.puerto = int(self.cfg.get("puerto") or 8765)
        self.red = {}
        self.cerrojo_red = threading.Lock()

    def config_publica(self):
        c = {k: self.cfg.get(k) for k in self.EDITABLES}
        c["rutaLog"] = getattr(self.estado, "ruta_log", str(self.ruta_log))
        c["redkit"] = str(self.recursos.fuente) if self.recursos.fuente else None
        c["mundosMinimapa"] = sorted(self.recursos.minimapas)
        c["token"] = self.cfg.get("token")
        c["puerto"] = self.cfg.get("puerto")
        c["version"] = VERSION
        c["espejoEfectivo"] = self.espejo_efectivo()
        c["escucharEnRed"] = bool(self.cfg.get("escucharEnRed"))
        c["urlsRed"] = [f"http://{ip}:{c['puerto'] or 8765}/?t={c['token']}" for ip in sorted(self.red)]
        return c

    def espejo_efectivo(self):
        """La distribución por defecto pone a la derecha lo más usado, pensando en un segundo
        monitor a la izquierda del principal. Si está a la derecha, se dibuja en espejo."""
        modo = self.cfg.get("espejo", "auto")
        if isinstance(modo, bool):
            return modo
        m = monitor_elegido(self.cfg)
        principal = next((x for x in monitores() if x["principal"]), None)
        return bool(m and principal and m["nombre"] != principal["nombre"] and m["x"] >= principal["x"] + principal["ancho"])

    def guardar(self):
        temporales = getattr(self, "temporales", {})
        guardada = getattr(self, "cfg_guardada", {})
        datos = {k: v for k, v in self.cfg.items() if k not in temporales}
        for k in temporales:
            if k in guardada:
                datos[k] = guardada[k]
        guardar_config(datos)

    def actualizar_config(self, cambios):
        for k, v in cambios.items():
            if k in self.EDITABLES:
                self.cfg[k] = v
        self.guardar()
        if "ranuras" in cambios:
            self.atajos.recargar()

    def cambiar_red(self, activo):
        self.cfg["escucharEnRed"] = bool(activo)
        self.guardar()
        self.actualizar_red()

    def actualizar_red(self):
        """El panel local escucha siempre en 127.0.0.1. Para el móvil se abre además un servidor
        en cada IP de la red de casa, que exige el token; se cierran al desactivarlo."""
        with self.cerrojo_red:
            deseadas = set(ips_locales()) if self.cfg.get("escucharEnRed") else set()
            for ip in set(self.red) - deseadas:
                srv = self.red.pop(ip)
                threading.Thread(target=lambda s=srv: (s.shutdown(), s.server_close()), daemon=True).start()
            for ip in deseadas - set(self.red):
                try:
                    srv = ServidorSilencioso((ip, self.puerto), crear_manejador(self))
                except OSError as e:
                    log("No pude escuchar en", ip, e)
                    continue
                srv.daemon_threads = True
                threading.Thread(target=srv.serve_forever, daemon=True).start()
                self.red[ip] = srv
                log(f"Desde el móvil: http://{ip}:{self.puerto}/?t={self.cfg['token']}")

    def ejecutar(self, abrir):
        LectorLog(self.estado, self.ruta_log, fija=bool(self.cfg.get("rutaLog"))).start()
        self.atajos.start()
        puerto = self.puerto
        servidor = ServidorSilencioso(("127.0.0.1", puerto), crear_manejador(self))
        servidor.daemon_threads = True
        url = f"http://127.0.0.1:{puerto}/"
        log("Segunda Pantalla escuchando en", url, "| log:", self.ruta_log)
        self.actualizar_red()
        if abrir:
            abrir_ventana(self.cfg, url)
        try:
            servidor.serve_forever()
        except KeyboardInterrupt:
            pass


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--sin-ventana", action="store_true", help="no abrir la ventana del navegador")
    p.add_argument("--log", help="ruta de scriptslog.txt (por defecto Documentos\\The Witcher 3)")
    p.add_argument("--proceso", help="proceso destino de las teclas (pruebas); por defecto witcher3.exe")
    args = p.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    if IS_WINDOWS:
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except (AttributeError, OSError):
            pass
    App(args).ejecutar(abrir=not args.sin_ventana)


if __name__ == "__main__":
    main()
