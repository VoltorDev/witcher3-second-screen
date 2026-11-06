"""Teselas del minimapa e iconos leídos de la caché de texturas del propio juego.

Sustituye a REDkit cuando no está instalado. Lee content\\content0\\texture.cache (formato
"HCXT" versión 7 del juego Remastered 5.x), descomprime la entrada pedida, decodifica BC2,
BC3 o RGBA a píxeles y la guarda como PNG en una caché en disco. Solo biblioteca estándar.

Formato, comprobado con la build 5.0.1090142 (01-11-2026):
- Pie de 32 bytes al final: crc u64, páginas u32, entradas u32, tamaño de nombres u32,
  número de mips u32, "HCXT", versión u32.
- Justo antes del pie, la tabla de entradas (52 bytes cada una); antes, la de nombres
  (rutas terminadas en NUL).
- Los datos de cada entrada empiezan en página*4096 y van en trozos: tamaño comprimido u32,
  tamaño u32, índice u8 y un bloque zlib.
- Tipo 8 = BC3, 13 = BC2, 253 = RGBA de 8 bits por canal.
"""

import struct
import threading
import zlib
from pathlib import Path

PAGINA = 4096
ENTRADA = struct.Struct("<IiiiiIHHHHiiq4B")
BC3, BC2, RGBA = 8, 13, 253


def _rgb565(c):
    r, g, b = (c >> 11) & 31, (c >> 5) & 63, c & 31
    return (r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)


def _colores(data, o):
    """Paleta de 4 colores de un bloque BC (modo de 4 colores, el que usan BC2 y BC3)."""
    c0, c1 = struct.unpack_from("<HH", data, o)
    a, b = _rgb565(c0), _rgb565(c1)
    return (a, b,
            tuple((2 * x + y) // 3 for x, y in zip(a, b)),
            tuple((x + 2 * y) // 3 for x, y in zip(a, b))), struct.unpack_from("<I", data, o + 4)[0]


def decodificar(datos, ancho, alto, tipo):
    """Píxeles RGBA (bytearray) de la primera mip, o None si el formato no se conoce."""
    if tipo == RGBA:
        n = ancho * alto * 4
        return bytearray(datos[:n]) if len(datos) >= n else None
    if tipo not in (BC2, BC3):
        return None
    out = bytearray(ancho * alto * 4)
    fila = ancho * 4
    bx_n, by_n = (ancho + 3) // 4, (alto + 3) // 4
    if len(datos) < bx_n * by_n * 16:
        return None
    o = 0
    for by in range(by_n):
        for bx in range(bx_n):
            if tipo == BC3:
                a0, a1 = datos[o], datos[o + 1]
                if a0 > a1:
                    pal_a = (a0, a1, (6 * a0 + a1) // 7, (5 * a0 + 2 * a1) // 7, (4 * a0 + 3 * a1) // 7,
                             (3 * a0 + 4 * a1) // 7, (2 * a0 + 5 * a1) // 7, (a0 + 6 * a1) // 7)
                else:
                    pal_a = (a0, a1, (4 * a0 + a1) // 5, (3 * a0 + 2 * a1) // 5, (2 * a0 + 3 * a1) // 5,
                             (a0 + 4 * a1) // 5, 0, 255)
                bits_a = int.from_bytes(datos[o + 2:o + 8], "little")
                alfas = [pal_a[(bits_a >> (3 * i)) & 7] for i in range(16)]
            else:
                bits_a = int.from_bytes(datos[o:o + 8], "little")
                alfas = [((bits_a >> (4 * i)) & 15) * 17 for i in range(16)]
            pal, idx = _colores(datos, o + 8)
            o += 16
            for py in range(4):
                y = by * 4 + py
                if y >= alto:
                    break
                base = y * fila
                for px in range(4):
                    x = bx * 4 + px
                    if x >= ancho:
                        break
                    i = py * 4 + px
                    r, g, b = pal[(idx >> (2 * i)) & 3]
                    p = base + x * 4
                    out[p:p + 4] = bytes((r, g, b, alfas[i]))
    return out


def png(rgba, ancho, alto, alfa=True):
    """PNG mínimo (sin filtros) a partir de píxeles RGBA."""
    canales = 4 if alfa else 3
    filas = bytearray()
    paso = ancho * 4
    for y in range(alto):
        filas.append(0)
        fila = rgba[y * paso:(y + 1) * paso]
        if alfa:
            filas += fila
        else:
            del fila[3::4]
            filas += fila

    def trozo(tipo, datos):
        return (struct.pack(">I", len(datos)) + tipo + datos
                + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF))

    cabecera = struct.pack(">IIBBBBB", ancho, alto, 8, 6 if alfa else 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", cabecera)
            + trozo(b"IDAT", zlib.compress(bytes(filas), 6)) + trozo(b"IEND", b""))


class CacheTexturas:
    """Índice de texture.cache restringido a gameplay\\gui_new (minimapas e iconos).

    Las claves imitan las rutas de r4data de REDkit para que el resto del servidor no cambie:
    los minimapas se agrupan por mundo y los iconos van relativos a la raíz de gui_new.
    """

    def __init__(self, ruta, carpeta_png):
        self.ruta = Path(ruta)
        self.carpeta_png = Path(carpeta_png)
        self.minimapas = {}   # mundo -> {"tileXxY.jpg": entrada}
        self.iconos = {}      # "icons/..../nombre.png" -> entrada
        self._lock = threading.Lock()
        self._cerrojos = {}
        self._indexar()

    def _indexar(self):
        with open(self.ruta, "rb") as f:
            fin = f.seek(0, 2)
            f.seek(fin - 32)
            _crc, _pag, n, tam_nombres, _mips, firma, version = struct.unpack("<QIIII4sI", f.read(32))
            if firma != b"HCXT" or version != 7:
                raise ValueError(f"texture.cache con formato desconocido ({firma!r}, versión {version})")
            ini_entradas = fin - 32 - ENTRADA.size * n
            f.seek(ini_entradas - tam_nombres)
            nombres = f.read(tam_nombres)
            tabla = f.read(ENTRADA.size * n)
        for k in range(n):
            e = ENTRADA.unpack_from(tabla, k * ENTRADA.size)
            fin_nombre = nombres.find(b"\0", e[1])
            ruta = nombres[e[1]:fin_nombre].decode("utf-8", "replace").replace("\\", "/").lower()
            pos = ruta.find("gameplay/gui_new/")
            if pos < 0:
                continue
            rel = ruta[pos + len("gameplay/gui_new/"):]
            entrada = {"pagina": e[2], "comprimido": e[3], "tam": e[4], "ancho": e[6], "alto": e[7],
                       "tipo": e[13], "ruta": ruta}
            if rel.startswith("minimaps/"):
                partes = rel.split("/")
                if len(partes) == 3:
                    self.minimapas.setdefault(partes[1], {})[partes[2]] = entrada
            elif rel.startswith("icons/"):
                self.iconos.setdefault(rel, entrada)

    def _leer(self, e):
        out = bytearray()
        with open(self.ruta, "rb") as f:
            f.seek(e["pagina"] * PAGINA)
            while len(out) < e["tam"]:
                comp, _tam, _parte = struct.unpack("<IIB", f.read(9))
                out += zlib.decompress(f.read(comp))
        return bytes(out)

    def png_de(self, e):
        """Ruta de un PNG en disco con la textura; lo genera la primera vez."""
        nombre = e["ruta"].replace("/", "_").rsplit(".", 1)[0] + ".png"
        destino = self.carpeta_png / nombre
        if destino.exists():
            return destino
        with self._lock:
            cerrojo = self._cerrojos.setdefault(nombre, threading.Lock())
        # Un cerrojo por textura: dos peticiones de la misma no la convierten dos veces, y un
        # icono no espera a que acabe una tesela.
        with cerrojo:
            if destino.exists():
                return destino
            rgba = decodificar(self._leer(e), e["ancho"], e["alto"], e["tipo"])
            if rgba is None:
                return None
            self.carpeta_png.mkdir(parents=True, exist_ok=True)
            tmp = destino.with_suffix(".tmp")
            tmp.write_bytes(png(rgba, e["ancho"], e["alto"], alfa="/minimaps/" not in e["ruta"]))
            tmp.replace(destino)
            return destino
