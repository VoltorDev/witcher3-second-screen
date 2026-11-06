"use strict";
// Textos de la interfaz. Claves estables; {x} se sustituye por el valor correspondiente.

const TEXTOS = {
  es: {
    "tipo.minimapa": "Minimapa", "tipo.barras": "Vida y aguante (barras grandes)", "tipo.estado": "Estado de Geralt",
    "tipo.efectos": "Efectos activos", "tipo.mision": "Misión seguida", "tipo.misiones": "Misiones activas",
    "tipo.pociones": "Pociones y decocciones", "tipo.aceites": "Aceites", "tipo.bombas": "Bombas y comida",
    "tipo.senales": "Señales", "tipo.rapidos": "Accesos rápidos",
    "accion.usar": "Usar / beber", "accion.aceiteAcero": "Aceite en acero", "accion.aceitePlata": "Aceite en plata",
    "esperando": "Esperando al juego…", "sinEfectos": "Sin efectos activos", "sinMision": "No sigues ninguna misión",
    "sinMisiones": "Sin misiones activas", "sinPociones": "No llevas pociones", "sinAceites": "No llevas aceites",
    "nada": "Nada que mostrar", "mision": "Misión",
    "misionTipo.0": "Principal", "misionTipo.1": "Principal", "misionTipo.2": "Secundaria", "misionTipo.3": "Contrato de brujo",
    "misionTipo.4": "Búsqueda del tesoro", "misionTipo.otras": "Otras", "seguir": "Seguir: {x}",
    "pociones": "Pociones", "decocciones": "Decocciones", "bombasClic": "Bombas · clic para equipar",
    "comidaClic": "Comida y bebida · clic para tomar",
    "huecoPocion": "Hueco de poción {x}", "huecoBomba": "Hueco de bomba",
    "acero": "Acero", "plata": "Plata", "aAcero": "→ acero", "aPlata": "→ plata",
    "sinEspada": "Sin espada equipada", "sinAceite": "Sin aceite",
    "rapidosVacio": "Aún no hay accesos. Pulsa <b>Personalizar</b> y añade los objetos que más uses.",
    "noLoLlevas": "no lo llevas", "noLoLlevasTitulo": "No lo llevas encima",
    "vida": "Vida", "toxicidad": "Toxicidad", "adrenalina": "Adrenalina", "aguante": "Aguante",
    "vidaCorto": "Vida", "aguanteCorto": "Agu", "toxicidadCorto": "Tox", "adrenalinaCorto": "Adr",
    "nivel": "Nivel", "coronas": "coronas", "hora": "Hora", "peso": "Peso", "enCombate": "EN COMBATE",
    "mapa.acercar": "Acercar", "mapa.alejar": "Alejar", "mapa.rotar": "Girar con la cámara", "mapa.pines": "Mostrar marcadores",
    "mapa.esperando": "Esperando posición del juego…", "mapa.sinTeselas": "sin teselas de mapa",
    "aviso.sinServidor": "No hay conexión con el servidor de Segunda Pantalla. ¿Se ha cerrado el juego o la ventana del servidor?",
    "aviso.sinDatos": "Sin datos del juego todavía. Arranca Witcher 3 con la opción <code>-debugscripts</code> y carga una partida.<br>Leyendo: <code>{x}</code>",
    "aviso.silencio": "El juego no envía datos desde hace {x} s (menú, pantalla de carga o juego cerrado).",
    "hecho": "Hecho", "noSePudo": "No se pudo", "servidorNoDisponible": "Servidor no disponible", "noSePudoGuardar": "No se pudo guardar",
    "ventanaMovida": "Ventana movida", "ventanaNoEncontrada": "No encontré la ventana",
    "confirmarRestaurar": "¿Volver a la distribución por defecto? Tus accesos rápidos se mantienen.",
    "monitor.auto": "Automático: el que no es el principal", "monitor.principal": "El principal", "principal": "principal",
    "rutas": "Log del juego: <code>{x}</code><br>Mapas e iconos: <code>{y}</code>", "sinRedkit": "no encontrados (ni el juego ni REDkit)",
    "elegirObjeto": "— Elige objeto —", "atajoOpcional": "Atajo (opcional)", "quitar": "Quitar",
    "cargaPartida": "Carga una partida para poder elegir objetos de tu inventario.",
    // Códigos del mod (#...) y del servidor
    "#incompleta": "orden incompleta", "#inventario": "el inventario cambió, vuelve a intentarlo", "#desconocida": "orden desconocida",
    "#no_disponible": "no disponible ahora", "#sin_cargas": "sin cargas", "#no_usable": "no se puede usar", "#sin_espada": "sin espada equipada",
    "#no_aplicable": "no se puede aplicar ese aceite", "#senal": "señal desconocida", "#misiones": "la lista de misiones cambió",
    "err.juego_cerrado": "Witcher 3 no está abierto", "err.sin_foco": "No pude poner el juego en primer plano",
    "err.menu_pausa": "El juego sigue en el menú de pausa", "err.sin_objeto": "No llevas ese objeto",
    "err.mision_desaparecida": "Esa misión ya no está en la lista", "err.solo_windows": "Solo funciona en Windows",
    // index.html
    "ui.personalizar": "Personalizar", "ui.titulo": "Personalizar", "ui.listo": "Listo",
    "ui.ayuda": "Arrastra un panel por su título para moverlo y por la esquina inferior derecha para cambiar su tamaño. Los cambios se guardan solos.",
    "ui.paneles": "Paneles visibles", "ui.pantalla": "Pantalla", "ui.monitor": "Monitor", "ui.completa": "Pantalla completa al abrir",
    "ui.mover": "Llevar la ventana a ese monitor", "ui.espejo": "Lado de las barras de vida",
    "ui.espejo.auto": "Automático: el borde que toca el juego", "ui.espejo.no": "Borde derecho", "ui.espejo.si": "Borde izquierdo",
    "ui.idioma": "Idioma", "ui.idioma.auto": "Automático",
    "ui.red": "Móvil o tableta", "ui.redAyuda": "¿Sin segundo monitor? Usa el navegador de un móvil o una tableta conectados al mismo wifi que el PC.",
    "ui.redActivar": "Permitir abrir el panel desde el móvil o la tableta",
    "ui.redAbre": "Escribe esta dirección en el navegador del móvil y guárdala en favoritos:",
    "ui.redFirewall": "Si Windows pregunta, permite a Python el acceso en redes privadas. La dirección lleva una clave: no la compartas.",
    "ui.redSinRed": "No encuentro la red local del PC. Comprueba que está conectado por wifi o cable.",
    "ui.rapidos": "Accesos rápidos",
    "ui.rapidosAyuda": "Cada acceso apunta a un objeto de tu inventario. El atajo es opcional (por ejemplo <kbd>ctrl+1</kbd>, <kbd>alt+f2</kbd>, <kbd>num5</kbd>) y funciona con el juego en primer plano.",
    "ui.anadir": "Añadir acceso", "ui.avanzado": "Avanzado", "ui.retardo": "Duración de cada pulsación enviada al juego (ms)",
    "ui.retardoAyuda": "Súbela si alguna orden no llega al juego con fps bajos.", "ui.restaurar": "Restaurar distribución por defecto",
  },
  en: {
    "tipo.minimapa": "Minimap", "tipo.barras": "Vitality & stamina (big bars)", "tipo.estado": "Geralt",
    "tipo.efectos": "Active effects", "tipo.mision": "Tracked quest", "tipo.misiones": "Active quests",
    "tipo.pociones": "Potions & decoctions", "tipo.aceites": "Oils", "tipo.bombas": "Bombs & food",
    "tipo.senales": "Signs", "tipo.rapidos": "Quick slots",
    "accion.usar": "Use / drink", "accion.aceiteAcero": "Oil on steel sword", "accion.aceitePlata": "Oil on silver sword",
    "esperando": "Waiting for the game…", "sinEfectos": "No active effects", "sinMision": "No tracked quest",
    "sinMisiones": "No active quests", "sinPociones": "No potions", "sinAceites": "No oils",
    "nada": "Nothing to show", "mision": "Quest",
    "misionTipo.0": "Main", "misionTipo.1": "Main", "misionTipo.2": "Secondary", "misionTipo.3": "Witcher contract",
    "misionTipo.4": "Treasure hunt", "misionTipo.otras": "Other", "seguir": "Track: {x}",
    "pociones": "Potions", "decocciones": "Decoctions", "bombasClic": "Bombs · click to equip",
    "comidaClic": "Food & drink · click to consume",
    "huecoPocion": "Potion slot {x}", "huecoBomba": "Bomb slot",
    "acero": "Steel", "plata": "Silver", "aAcero": "→ steel", "aPlata": "→ silver",
    "sinEspada": "No sword equipped", "sinAceite": "No oil",
    "rapidosVacio": "No quick slots yet. Click <b>Customize</b> and add the items you use most.",
    "noLoLlevas": "not carried", "noLoLlevasTitulo": "You don't carry this item",
    "vida": "Vitality", "toxicidad": "Toxicity", "adrenalina": "Adrenaline", "aguante": "Stamina",
    "vidaCorto": "HP", "aguanteCorto": "Sta", "toxicidadCorto": "Tox", "adrenalinaCorto": "Adr",
    "nivel": "Level", "coronas": "crowns", "hora": "Time", "peso": "Weight", "enCombate": "IN COMBAT",
    "mapa.acercar": "Zoom in", "mapa.alejar": "Zoom out", "mapa.rotar": "Rotate with camera", "mapa.pines": "Show map pins",
    "mapa.esperando": "Waiting for the player position…", "mapa.sinTeselas": "no map tiles",
    "aviso.sinServidor": "No connection to the Second Screen server. Was the game or the server window closed?",
    "aviso.sinDatos": "No game data yet. Launch The Witcher 3 with <code>-debugscripts</code> and load a save.<br>Reading: <code>{x}</code>",
    "aviso.silencio": "No data from the game for {x} s (menu, loading screen or game closed).",
    "hecho": "Done", "noSePudo": "Failed", "servidorNoDisponible": "Server not available", "noSePudoGuardar": "Could not save",
    "ventanaMovida": "Window moved", "ventanaNoEncontrada": "Window not found",
    "confirmarRestaurar": "Restore the default layout? Your quick slots are kept.",
    "monitor.auto": "Automatic: the non-primary one", "monitor.principal": "The primary one", "principal": "primary",
    "rutas": "Game log: <code>{x}</code><br>Maps and icons: <code>{y}</code>", "sinRedkit": "not found (neither the game nor REDkit)",
    "elegirObjeto": "— Choose an item —", "atajoOpcional": "Hotkey (optional)", "quitar": "Remove",
    "cargaPartida": "Load a save to pick items from your inventory.",
    "#incompleta": "incomplete command", "#inventario": "inventory changed, try again", "#desconocida": "unknown command",
    "#no_disponible": "not available right now", "#sin_cargas": "no charges left", "#no_usable": "can't be used", "#sin_espada": "no sword equipped",
    "#no_aplicable": "can't apply that oil", "#senal": "unknown sign", "#misiones": "quest list changed",
    "err.juego_cerrado": "The Witcher 3 is not running", "err.sin_foco": "Couldn't bring the game to the foreground",
    "err.menu_pausa": "The game is still in the pause menu", "err.sin_objeto": "You don't carry that item",
    "err.mision_desaparecida": "That quest is no longer in the list", "err.solo_windows": "Windows only",
    "ui.personalizar": "Customize", "ui.titulo": "Customize", "ui.listo": "Done",
    "ui.ayuda": "Drag a panel by its title to move it, and by its bottom-right corner to resize it. Changes are saved automatically.",
    "ui.paneles": "Visible panels", "ui.pantalla": "Display", "ui.monitor": "Monitor", "ui.completa": "Open in fullscreen",
    "ui.mover": "Move the window to that monitor", "ui.espejo": "Side of the vitality bars",
    "ui.espejo.auto": "Automatic: the edge next to the game", "ui.espejo.no": "Right edge", "ui.espejo.si": "Left edge",
    "ui.idioma": "Language", "ui.idioma.auto": "Automatic",
    "ui.red": "Phone or tablet", "ui.redAyuda": "No second monitor? Use the browser of a phone or tablet on the same Wi-Fi as your PC.",
    "ui.redActivar": "Allow opening the panel from a phone or tablet",
    "ui.redAbre": "Type this address in your phone's browser and bookmark it:",
    "ui.redFirewall": "If Windows asks, allow Python on private networks. The address contains a key: don't share it.",
    "ui.redSinRed": "Couldn't find the PC's local network. Check that it's connected by Wi-Fi or cable.",
    "ui.rapidos": "Quick slots",
    "ui.rapidosAyuda": "Each slot points to an item in your inventory. The hotkey is optional (e.g. <kbd>ctrl+1</kbd>, <kbd>alt+f2</kbd>, <kbd>num5</kbd>) and works while the game is in the foreground.",
    "ui.anadir": "Add slot", "ui.avanzado": "Advanced", "ui.retardo": "Duration of each key press sent to the game (ms)",
    "ui.retardoAyuda": "Increase it if commands get lost at low frame rates.", "ui.restaurar": "Restore default layout",
  },
};

let IDIOMA = "es";

function elegirIdioma(preferido) {
  const p = preferido && preferido !== "auto" ? preferido : (navigator.language || "en").slice(0, 2).toLowerCase();
  IDIOMA = TEXTOS[p] ? p : "en";
  document.documentElement.lang = IDIOMA;
}

function t(clave, x, y) {
  const s = (TEXTOS[IDIOMA] && TEXTOS[IDIOMA][clave]) ?? TEXTOS.es[clave] ?? clave;
  return s.replace("{x}", x ?? "").replace("{y}", y ?? "");
}

function traducirDocumento() {
  for (const el of document.querySelectorAll("[data-i18n]")) el.innerHTML = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-title]")) el.title = t(el.dataset.i18nTitle);
}
