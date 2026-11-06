"use strict";

// ------------------------------------------------------------------ utilidades
const TOKEN = new URLSearchParams(location.search).get("t") || "";
const conToken = (url) => TOKEN ? url + (url.includes("?") ? "&" : "?") + "t=" + encodeURIComponent(TOKEN) : url;
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtNum = (n) => Math.round(n).toLocaleString(IDIOMA === "es" ? "es-ES" : "en-US");

async function pedir(url, opciones) {
  const r = await fetch(conToken(url), opciones);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
const enviarJSON = (url, cuerpo) => pedir(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });

// Los textos del juego llevan marcado propio (<br>, <font>...): solo texto plano.
const limpio = (s) => String(s ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "").trim();

function icono(ruta, nombre, clase = "icono") {
  const inicial = esc((limpio(nombre)[0] || "?").toUpperCase());
  if (!ruta) return `<span class="${clase} icono-falta">${inicial}</span>`;
  return `<img class="${clase}" src="${conToken("/icono?ruta=" + encodeURIComponent(ruta))}" alt="" loading="lazy"
    onerror="this.outerHTML='<span class=&quot;${clase} icono-falta&quot;>${inicial}</span>'">`;
}

function toast(texto, ok = true, ms = 2600) {
  const t = document.createElement("div");
  t.className = "toast " + (ok ? "ok" : "mal");
  t.textContent = texto;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ------------------------------------------------------------------ estado
const S = {
  cfg: null,
  estado: null,
  version: 0,
  editando: false,
  firmas: {},
  ultimoAck: null,
  avisosVistos: {},
  monitores: [],
};

const nombreTipo = (tipo) => t("tipo." + tipo);
const ACCIONES = ["usar", "aceiteAcero", "aceitePlata"];
// Mensaje del mod o del servidor: los códigos se traducen; los nombres del juego van tal cual.
const textoMensaje = (m) => (m && m.startsWith("#") ? t(m) : limpio(m));

// La distribución está pensada con el segundo monitor a la izquierda (lo más usado a la derecha,
// junto al juego). Si está a la derecha se dibuja en espejo; lo guardado no cambia.
const espejo = () => (S.cfg.espejo === true || S.cfg.espejo === false ? S.cfg.espejo : !!S.cfg.espejoEfectivo);
const xPantalla = (w) => (espejo() ? S.cfg.layout.columnas - w.x - w.w : w.x);
const areaGrid = (w) => `${w.y + 1} / ${xPantalla(w) + 1} / span ${w.h} / span ${w.w}`;

async function orden(cuerpo, etiqueta) {
  try {
    const r = await enviarJSON("/orden", cuerpo);
    if (!r.ok) toast(r.codigo ? t("err." + r.codigo) : (r.error || t("noSePudo")), false);
    else if (etiqueta) toast("→ " + etiqueta);
    // Una vez por sesión: el juego estaba minimizado, casi siempre por la pantalla completa exclusiva.
    if (r.aviso && !S.avisosVistos[r.aviso]) {
      S.avisosVistos[r.aviso] = true;
      toast(t("aviso." + r.aviso), false, 9000);
    }
  } catch (e) {
    toast(t("servidorNoDisponible"), false);
  }
}

// ------------------------------------------------------------------ rejilla
function widgets() { return S.cfg.layout.widgets; }

function construirRejilla() {
  const rej = $("#rejilla");
  const { columnas, filas } = S.cfg.layout;
  rej.style.gridTemplateColumns = `repeat(${columnas}, minmax(0, 1fr))`;
  rej.style.gridTemplateRows = `repeat(${filas}, minmax(0, 1fr))`;
  rej.innerHTML = "";
  S.firmas = {};
  document.body.classList.toggle("espejo", espejo());
  for (const w of widgets()) {
    if (!w.visible && !S.editando) continue;
    const el = document.createElement("section");
    el.className = `widget w-${w.tipo}${w.visible ? "" : " oculto"}`;
    el.dataset.id = w.id;
    el.style.gridArea = areaGrid(w);
    // En una columna (móvil) va primero lo que en el monitor está más a la derecha: lo más usado.
    el.style.setProperty("--orden", String(-(w.x + w.w) * 100 + w.y));
    el.innerHTML = `<h2><span>${esc(nombreTipo(w.tipo))}</span><span class="extra"></span></h2><div class="cuerpo"></div><div class="asa"></div>`;
    rej.appendChild(el);
    if (w.tipo === "minimapa") Mapa.montar(el);
  }
  pintar(true);
}

function pintar(forzar = false) {
  for (const el of document.querySelectorAll(".widget")) {
    const w = widgets().find((x) => x.id === el.dataset.id);
    const r = RENDER[w.tipo];
    if (!r) continue;
    const datos = r.datos ? r.datos() : null;
    // Los textos de "esperando" dependen de si ya hay datos, aunque la lista siga vacía.
    const firma = JSON.stringify([datos, sinDatos()]);
    if (!forzar && S.firmas[w.id] === firma) continue;
    S.firmas[w.id] = firma;
    r.pintar(el, datos);
  }
}

// ------------------------------------------------------------------ widgets
// Si el juego manda la clave de traducción (item_name_...), mejor el nombre interno que eso.
const nombreItem = (it) => /^item_name_/i.test(it.nombre) ? it.id : it.nombre;
const inv = () => ((S.estado?.inv?.items) || []).map((it) => ({ ...it, nombre: nombreItem(it) }));
const sinDatos = () => !S.estado || !S.estado.stat;

function barra(nombre, v, max, color) {
  const pct = max > 0 ? clamp((v / max) * 100, 0, 100) : 0;
  return `<div class="barra"><div class="linea"><span>${nombre}</span><b>${fmtNum(v)}<span style="color:var(--muy-tenue)"> / ${fmtNum(max)}</span></b></div>
    <div class="pista"><div class="relleno" style="width:${pct}%;background:var(--${color})"></div></div></div>`;
}

function tileObjeto(it, opciones = {}) {
  const potion = it.cat === "pot" || it.cat === "dec";
  const agotado = potion && it.cargasMax > 0 && it.cargas <= 0;
  const cargas = potion && it.cargasMax > 0 ? `${it.cargas}/${it.cargasMax}` : `×${it.cantidad}`;
  const hueco = it.hueco >= 1 && it.hueco <= 4 ? `<span class="hueco" title="${t("huecoPocion", it.hueco)}">${it.hueco}</span>`
    : it.hueco >= 5 ? `<span class="hueco" title="${t("huecoBomba")}">B${it.hueco - 4}</span>` : "";
  const atajo = opciones.atajo ? `<span class="atajo">${esc(opciones.atajo)}</span>` : "";
  return `<button class="objeto${agotado ? " agotado" : ""}" data-orden='${esc(JSON.stringify(opciones.orden || { accion: "usar", id: it.id }))}'
      data-etiqueta="${esc(limpio(it.nombre))}" title="${esc(limpio(it.nombre))}">
    ${hueco}${atajo}${icono(it.icono, it.nombre)}<span class="nombre">${esc(limpio(it.nombre))}</span><span class="cargas">${opciones.pie || cargas}</span></button>`;
}

const porNombre = (a, b) => limpio(a.nombre).localeCompare(limpio(b.nombre), IDIOMA);
const huecoPrimero = (a, b) => (a.hueco && a.hueco <= 4 ? a.hueco : 99) - (b.hueco && b.hueco <= 4 ? b.hueco : 99) || porNombre(a, b);

const tipoMision = (n) => t(n >= 0 && n <= 4 ? "misionTipo." + n : "misionTipo.otras");
const NOMBRES_SENAL = ["Aard", "Yrden", "Igni", "Quen", "Axii"];
const SVG_SENAL = [
  '<path d="M12 3 21 19H3Z M12 9v10 M8 14h8"/>',
  '<circle cx="12" cy="12" r="9"/><path d="M12 5 18.5 16H5.5Z"/>',
  '<path d="M3 5h18L12 21Z M8 10h8"/>',
  '<path d="M12 3 21 19H3Z"/><circle cx="12" cy="14" r="2.2"/>',
  '<path d="M12 3 21 19H3Z M12 19 7.5 11 M12 19l4.5-8"/>',
];

const UMBRAL_VIDA_BAJA = 0.35, UMBRAL_VIDA_CRITICA = 0.15;
const barrasVisibles = () => widgets().some((w) => w.tipo === "barras" && w.visible);

// Barras verticales a toda altura: se leen de reojo desde la pantalla del juego.
// Se construyen una vez y luego solo cambian alturas, para que las transiciones y el destello funcionen.
// De izquierda a derecha: la vida queda la última, pegada al borde que toca el juego.
const VBARRAS = [
  ["adrenalina", "adrenalinaCorto", "adrenalina", "adrenalinaMax", "adrenalina"],
  ["toxicidad", "toxicidadCorto", "toxicidad", "toxicidadMax", "toxicidad"],
  ["aguante", "aguanteCorto", "aguante", "aguanteMax", "aguante"],
  ["vida", "vidaCorto", "vida", "vidaMax", "vida"],
];

function actualizarAlertaVida(s) {
  const f = s && s.vidaMax > 0 ? s.vida / s.vidaMax : 1;
  document.body.classList.toggle("vida-baja", f < UMBRAL_VIDA_BAJA && f > 0);
  document.body.classList.toggle("vida-critica", f < UMBRAL_VIDA_CRITICA && f > 0);
}

const RENDER = {
  barras: {
    datos: () => S.estado?.stat ? (({ vida, vidaMax, aguante, aguanteMax, toxicidad, toxicidadMax, adrenalina, adrenalinaMax, combate }) =>
      ({ vida, vidaMax, aguante, aguanteMax, toxicidad, toxicidadMax, adrenalina, adrenalinaMax, combate }))(S.estado.stat) : null,
    pintar(el, s) {
      const c = $(".cuerpo", el);
      if (!s) { c.innerHTML = `<div class="vacio">${t("esperando")}</div>`; el._previo = null; return; }
      if (!$(".vbarras", c)) {
        c.innerHTML = `<div class="vbarras">${VBARRAS.map(([k, n, , , largo]) => `<div class="vbarra ${k}" data-k="${k}" title="${t(largo)}">
          <div class="valor"></div><div class="pista"><div class="relleno"></div><div class="marcas"></div></div><div class="etq">${t(n)}</div></div>`).join("")}</div>`;
      }
      for (const [k, , v, m] of VBARRAS) {
        const col = $(`.vbarra.${k}`, c);
        const pct = s[m] > 0 ? clamp((s[v] / s[m]) * 100, 0, 100) : 0;
        $(".relleno", col).style.height = pct + "%";
        $(".valor", col).textContent = k === "adrenalina" ? s[v].toFixed(1).replace(".0", "") : fmtNum(s[v]);
        if (k === "adrenalina") $(".marcas", col).style.setProperty("--segmentos", Math.max(1, Math.round(s[m])));
      }
      const f = s.vidaMax > 0 ? s.vida / s.vidaMax : 1;
      const vida = $(".vbarra.vida", c);
      vida.classList.toggle("baja", f < UMBRAL_VIDA_BAJA);
      el.classList.toggle("critico", f < UMBRAL_VIDA_CRITICA && f > 0);
      // Destello al recibir daño (bajada de más del 2 % de la vida máxima).
      const previo = el._previo;
      if (previo && previo.vidaMax === s.vidaMax && previo.vida - s.vida > s.vidaMax * 0.02) {
        vida.classList.remove("golpe");
        void vida.offsetWidth;
        vida.classList.add("golpe");
      }
      el._previo = { vida: s.vida, vidaMax: s.vidaMax };
    },
  },

  estado: {
    datos: () => S.estado?.stat ? { ...S.estado.stat, soloMeta: barrasVisibles() } : null,
    pintar(el, s) {
      const c = $(".cuerpo", el);
      if (!s) { c.innerHTML = `<div class="vacio">${t("esperando")}</div>`; return; }
      const hora = `${String(s.hora).padStart(2, "0")}:${String(s.minuto).padStart(2, "0")}`;
      c.innerHTML = (s.soloMeta ? "" : `<div class="barras">${barra(t("vida"), s.vida, s.vidaMax, "vida")}${barra(t("toxicidad"), s.toxicidad, s.toxicidadMax, "toxicidad")}
        ${barra(t("adrenalina"), s.adrenalina, s.adrenalinaMax, "adrenalina")}${barra(t("aguante"), s.aguante, s.aguanteMax, "aguante")}</div>`)
        + `<div class="meta"><span>${t("nivel")} <b>${s.nivel}</b></span><span><b>${fmtNum(s.coronas)}</b> ${t("coronas")}</span><span>${t("hora")} <b>${hora}</b></span>
        ${s.pesoMax ? `<span>${t("peso")} <b>${fmtNum(s.peso)}</b> / ${fmtNum(s.pesoMax)}</span>` : ""}
        ${s.combate ? `<span class="etiqueta-combate">${t("enCombate")}</span>` : ""}</div>`;
    },
  },

  efectos: {
    datos: () => S.estado?.buffs || [],
    pintar(el, buffs) {
      const c = $(".cuerpo", el);
      if (!buffs.length) { c.innerHTML = `<div class="vacio">${t("sinEfectos")}</div>`; return; }
      c.innerHTML = `<div class="efectos">${buffs.map((b) => {
        const infinito = b.total <= 0 || b.resta < 0;
        const pct = infinito ? 100 : clamp((b.resta / b.total) * 100, 0, 100);
        const t = infinito ? "∞" : `${Math.floor(b.resta / 60)}:${String(b.resta % 60).padStart(2, "0")}`;
        return `<div class="efecto${b.negativo ? " negativo" : ""}">${icono(b.icono, b.nombre)}<div class="info">
          <div class="nombre">${esc(limpio(b.nombre))}</div><div class="tiempo">${t}</div>
          <div class="pista"><div class="relleno" style="width:${pct}%"></div></div></div></div>`;
      }).join("")}</div>`;
    },
  },

  mision: {
    datos: () => S.estado?.mision || null,
    pintar(el, m) {
      const c = $(".cuerpo", el);
      if (!m) { c.innerHTML = `<div class="vacio">${sinDatos() ? t("esperando") : t("sinMision")}</div>`; return; }
      c.innerHTML = `<div class="mision-tipo">${esc(tipoMision(m.tipo))}</div><h3 class="mision-titulo">${esc(limpio(m.titulo))}</h3>
        <ul class="objetivos">${m.objetivos.map((o) => `<li class="${o.destacado ? "destacado" : ""}">${esc(limpio(o.texto))}</li>`).join("")}</ul>`;
    },
  },

  misiones: {
    datos: () => S.estado?.misiones || { items: [] },
    pintar(el, lista) {
      const c = $(".cuerpo", el);
      $(".extra", el).textContent = lista.items.length ? String(lista.items.length) : "";
      if (!lista.items.length) { c.innerHTML = `<div class="vacio">${sinDatos() ? t("esperando") : t("sinMisiones")}</div>`; return; }
      const grupos = {};
      for (const q of lista.items) (grupos[tipoMision(q.tipo)] ||= []).push(q);
      const orden = [...new Set([0, 2, 3, 4, -1].map(tipoMision))];
      c.innerHTML = orden.filter((g) => grupos[g]).map((g) => `<div class="grupo-misiones"><div class="subtitulo">${g} · ${grupos[g].length}</div>
        ${grupos[g].map((q) => `<button class="item-mision${q.seguida ? " seguida" : ""}" data-orden='${esc(JSON.stringify({ accion: "seguir", indice: q.indice }))}'
          data-etiqueta="${esc(t("seguir", limpio(q.titulo)))}">${esc(limpio(q.titulo))}</button>`).join("")}</div>`).join("");
    },
  },

  pociones: {
    datos: () => inv().filter((it) => it.cat === "pot" || it.cat === "dec"),
    pintar(el, items) {
      const c = $(".cuerpo", el);
      if (!items.length) { c.innerHTML = `<div class="vacio">${sinDatos() ? t("esperando") : t("sinPociones")}</div>`; return; }
      const pot = items.filter((i) => i.cat === "pot").sort(huecoPrimero);
      const dec = items.filter((i) => i.cat === "dec").sort(huecoPrimero);
      c.innerHTML = (pot.length ? `<div class="subtitulo">${t("pociones")}</div><div class="cuadricula">${pot.map((i) => tileObjeto(i)).join("")}</div>` : "")
        + (dec.length ? `<div class="subtitulo">${t("decocciones")}</div><div class="cuadricula">${dec.map((i) => tileObjeto(i)).join("")}</div>` : "");
    },
  },

  aceites: {
    datos: () => ({ aceites: inv().filter((it) => it.cat === "oil"), espadas: S.estado?.espadas || {} }),
    pintar(el, d) {
      const c = $(".cuerpo", el);
      const espada = (e, nombre) => {
        if (!e) return `<div class="espada"><div class="cab">${nombre}</div><div class="aceite sin">${t("sinEspada")}</div></div>`;
        const a = e.aceites[0];
        return `<div class="espada" title="${esc(limpio(e.nombre))}"><div class="cab">${nombre}</div>
          <div class="aceite${a ? "" : " sin"}">${a ? `${esc(limpio(a.nombre))} · ${a.cargas}/${a.max}` : t("sinAceite")}</div>
          ${a ? `<div class="pista"><div class="relleno" style="width:${a.max ? (a.cargas / a.max) * 100 : 0}%"></div></div>` : ""}</div>`;
      };
      const aplicado = (e, nombre) => !!e && e.aceites.some((a) => limpio(a.nombre) === limpio(nombre));
      const filas = d.aceites.sort(porNombre).map((it) => `<div class="fila-aceite">${icono(it.icono, it.nombre)}
          <span class="nombre" title="${esc(limpio(it.nombre))}">${esc(limpio(it.nombre))}</span>
          <button class="btn-espada${aplicado(d.espadas.acero, it.nombre) ? " aplicado" : ""}" data-orden='${esc(JSON.stringify({ accion: "aceiteAcero", id: it.id }))}' data-etiqueta="${esc(limpio(it.nombre))} ${t("aAcero")}">${t("acero")}</button>
          <button class="btn-espada plata${aplicado(d.espadas.plata, it.nombre) ? " aplicado" : ""}" data-orden='${esc(JSON.stringify({ accion: "aceitePlata", id: it.id }))}' data-etiqueta="${esc(limpio(it.nombre))} ${t("aPlata")}">${t("plata")}</button></div>`).join("");
      c.innerHTML = `<div class="espadas">${espada(d.espadas.acero, t("acero"))}${espada(d.espadas.plata, t("plata"))}</div>`
        + (filas ? `<div class="filas">${filas}</div>` : `<div class="vacio">${sinDatos() ? t("esperando") : t("sinAceites")}</div>`);
    },
  },

  bombas: {
    datos: () => inv().filter((it) => it.cat === "bomb" || it.cat === "food"),
    pintar(el, items) {
      const c = $(".cuerpo", el);
      if (!items.length) { c.innerHTML = `<div class="vacio">${sinDatos() ? t("esperando") : t("nada")}</div>`; return; }
      const bombas = items.filter((i) => i.cat === "bomb").sort(porNombre);
      const comida = items.filter((i) => i.cat === "food").sort((a, b) => b.cantidad - a.cantidad || porNombre(a, b));
      c.innerHTML = (bombas.length ? `<div class="subtitulo">${t("bombasClic")}</div><div class="cuadricula">${bombas.map((i) => tileObjeto(i)).join("")}</div>` : "")
        + (comida.length ? `<div class="subtitulo">${t("comidaClic")}</div><div class="cuadricula">${comida.map((i) => tileObjeto(i)).join("")}</div>` : "");
    },
  },

  senales: {
    datos: () => S.estado?.stat ? S.estado.stat.senal : null,
    pintar(el, actual) {
      $(".cuerpo", el).innerHTML = `<div class="senales">${NOMBRES_SENAL.map((n, i) => `<button class="senal${actual === i ? " activa" : ""}"
        data-orden='${esc(JSON.stringify({ accion: "senal", senal: i }))}' data-etiqueta="${n}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">${SVG_SENAL[i]}</svg>${n}</button>`).join("")}</div>`;
    },
  },

  rapidos: {
    datos: () => ({ ranuras: S.cfg.ranuras || [], inv: inv().map((i) => [i.id, i.cargas, i.cantidad, i.hueco]) }),
    pintar(el, d) {
      const c = $(".cuerpo", el);
      if (!d.ranuras.length) {
        c.innerHTML = `<div class="vacio">${t("rapidosVacio")}</div>`;
        return;
      }
      c.innerHTML = `<div class="cuadricula">${d.ranuras.map((r) => {
        const encontrados = inv().filter((i) => i.id === r.id);
        const it = encontrados.find((i) => i.cargas > 0) || encontrados[0];
        const accion = r.accion || "usar";
        const pie = accion === "aceiteAcero" ? t("aAcero") : accion === "aceitePlata" ? t("aPlata") : null;
        if (!it) return `<button class="objeto agotado" disabled title="${t("noLoLlevasTitulo")}">${icono("", r.nombre || r.id)}<span class="nombre">${esc(limpio(r.nombre || r.id))}</span><span class="cargas">${t("noLoLlevas")}</span></button>`;
        return tileObjeto(it, { orden: { accion, id: r.id }, atajo: r.atajo, pie });
      }).join("")}</div>`;
    },
  },

  minimapa: {
    datos: () => null,
    pintar() {},
  },
};

// ------------------------------------------------------------------ minimapa
const Mapa = {
  el: null, canvas: null, ctx: null,
  imgs: new Map(),
  vista: null,      // posición dibujada (interpolada)
  objetivo: null,   // última posición recibida
  desde: null, t0: 0,

  montar(el) {
    this.el = el;
    const c = $(".cuerpo", el);
    c.innerHTML = `<canvas></canvas>
      <div class="mapa-controles">
        <button data-mapa="mas" title="${t("mapa.acercar")}">+</button>
        <button data-mapa="menos" title="${t("mapa.alejar")}">−</button>
        <button data-mapa="rotar" title="${t("mapa.rotar")}">⟳</button>
        <button data-mapa="pines" title="${t("mapa.pines")}">◆</button>
      </div><div class="mapa-pie"></div>`;
    this.canvas = $("canvas", c);
    this.ctx = this.canvas.getContext("2d");
    c.addEventListener("wheel", (e) => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    c.addEventListener("click", (e) => {
      const b = e.target.closest("[data-mapa]");
      if (!b) return;
      const op = b.dataset.mapa;
      if (op === "mas") this.zoom(1.25);
      if (op === "menos") this.zoom(1 / 1.25);
      if (op === "rotar") { S.cfg.minimapa.rotar = !S.cfg.minimapa.rotar; guardar({ minimapa: S.cfg.minimapa }); }
      if (op === "pines") { S.cfg.minimapa.pines = !S.cfg.minimapa.pines; guardar({ minimapa: S.cfg.minimapa }); }
      this.botones();
    });
    this.botones();
  },

  botones() {
    if (!this.el) return;
    $('[data-mapa="rotar"]', this.el).classList.toggle("activo", !!S.cfg.minimapa.rotar);
    $('[data-mapa="pines"]', this.el).classList.toggle("activo", S.cfg.minimapa.pines !== false);
  },

  zoom(f) {
    S.cfg.minimapa.zoom = clamp((S.cfg.minimapa.zoom || 1) * f, 0.08, 4);
    clearTimeout(this._tz);
    this._tz = setTimeout(() => guardar({ minimapa: S.cfg.minimapa }), 600);
  },

  nuevaPos(p) {
    if (!p) return;
    const ahora = performance.now();
    if (this.vista && this.objetivo && this.objetivo.mundo === p.mundo) {
      this.desde = { ...this.vista };
    } else {
      this.desde = { ...p };
    }
    this.objetivo = p;
    this.t0 = ahora;
  },

  tesela(mundo, x, y) {
    const k = `${mundo}/${x}/${y}`;
    let e = this.imgs.get(k);
    if (!e) {
      const img = new Image();
      e = { img, ok: false, mal: false };
      img.onload = () => { e.ok = true; };
      img.onerror = () => { e.mal = true; };
      img.src = conToken(`/tesela/${mundo}/${x}/${y}`);
      this.imgs.set(k, e);
      if (this.imgs.size > 600) this.imgs.delete(this.imgs.keys().next().value);
    }
    return e;
  },

  frame() {
    requestAnimationFrame(() => this.frame());
    if (!this.canvas || !this.canvas.isConnected) return;
    const dpr = window.devicePixelRatio || 1;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(W * dpr) || this.canvas.height !== Math.round(H * dpr)) {
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0f1113";
    ctx.fillRect(0, 0, W, H);
    const p = this.objetivo;
    const pie = $(".mapa-pie", this.el);
    if (!p) {
      ctx.fillStyle = "#5b626a";
      ctx.font = "14px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText(t("mapa.esperando"), W / 2, H / 2);
      return;
    }
    // Interpolación suave entre actualizaciones (llegan cada 200 ms).
    const k = clamp((performance.now() - this.t0) / 220, 0, 1);
    const lerpAng = (a, b) => a + ((((b - a) % 360) + 540) % 360 - 180) * k;
    const v = this.desde ? {
      ...p,
      x: this.desde.x + (p.x - this.desde.x) * k,
      y: this.desde.y + (p.y - this.desde.y) * k,
      yaw: lerpAng(this.desde.yaw, p.yaw),
      camara: lerpAng(this.desde.camara, p.camara),
    } : p;
    this.vista = v;

    const N = p.numTeselas, T = p.tamTextura, tam = p.tamNivel;
    const metrosTesela = tam / N;
    const zoom = S.cfg.minimapa.zoom || 1;
    const escala = (T / metrosTesela) * zoom;            // píxeles de pantalla por metro
    const rot = S.cfg.minimapa.rotar ? (v.camara * Math.PI) / 180 : 0;
    // Mundo → píxel de textura (norte arriba; la tesela y crece hacia el norte).
    const aMapa = (x, y) => [((x + tam / 2) / metrosTesela) * T, (N - (y + tam / 2) / metrosTesela) * T];
    const [px, py] = aMapa(v.x, v.y);
    const cx = W / 2, cy = H / 2;
    const aPantalla = (x, y) => {
      const [mx, my] = aMapa(x, y);
      const dx = (mx - px) * zoom, dy = (my - py) * zoom;
      return [cx + dx * Math.cos(rot) - dy * Math.sin(rot), cy + dx * Math.sin(rot) + dy * Math.cos(rot)];
    };

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(zoom, zoom);
    ctx.translate(-px, -py);
    const radio = Math.hypot(W, H) / 2 / zoom;
    const tx0 = Math.floor((px - radio) / T), tx1 = Math.floor((px + radio) / T);
    const fy0 = Math.floor((py - radio) / T), fy1 = Math.floor((py + radio) / T);
    let pintadas = 0;
    for (let fx = tx0; fx <= tx1; fx++) {
      for (let fy = fy0; fy <= fy1; fy++) {
        const ty = N - 1 - fy;
        if (fx < 0 || ty < 0 || fx >= N || ty >= N) continue;
        const e = this.tesela(p.mundo, fx, ty);
        if (e.ok) { ctx.drawImage(e.img, fx * T, fy * T, T + 0.6, T + 0.6); pintadas++; }
      }
    }
    ctx.restore();

    if (S.cfg.minimapa.pines !== false) this.pines(ctx, aPantalla, W, H, escala);

    // Jugador: flecha. Yaw crece en sentido antihorario, 0 = norte.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(((-v.yaw) * Math.PI) / 180 + rot);
    ctx.beginPath();
    ctx.moveTo(0, -13); ctx.lineTo(9, 10); ctx.lineTo(0, 5); ctx.lineTo(-9, 10); ctx.closePath();
    ctx.fillStyle = "#f4e3b5"; ctx.strokeStyle = "#1a1408"; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // Norte.
    const [nx, ny] = [W - 26, H - 26];
    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate(rot);
    ctx.fillStyle = "rgba(15,17,19,0.75)";
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#c9a45c"; ctx.font = "600 12px Segoe UI"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("N", 0, -1);
    ctx.restore();

    const texto = `${p.mundo}${pintadas ? "" : " · " + t("mapa.sinTeselas")} · ${Math.round(v.x)}, ${Math.round(v.y)}`;
    if (pie.textContent !== texto) pie.textContent = texto;
  },

  pines(ctx, aPantalla, W, H, escala) {
    const pines = S.estado?.pines?.items || [];
    let destacado = null;
    for (const pin of pines) {
      const [sx, sy] = aPantalla(pin.x, pin.y);
      if (pin.destacado) destacado = { pin, sx, sy };
      if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
      if (pin.radio > 0 && pin.mision) {
        ctx.beginPath();
        ctx.arc(sx, sy, pin.radio * escala, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(227,195,125,0.10)"; ctx.strokeStyle = "rgba(227,195,125,0.5)"; ctx.lineWidth = 1;
        ctx.fill(); ctx.stroke();
      }
      dibujarPin(ctx, sx, sy, pin);
    }
    // Objetivo seguido fuera de la vista: flecha en el borde.
    if (destacado) {
      const { sx, sy } = destacado;
      const m = 18;
      if (sx < m || sy < m || sx > W - m || sy > H - m) {
        const cx = W / 2, cy = H / 2;
        const ang = Math.atan2(sy - cy, sx - cx);
        const t = Math.min((W / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (H / 2 - m) / Math.abs(Math.sin(ang) || 1e-6));
        ctx.save();
        ctx.translate(cx + Math.cos(ang) * t, cy + Math.sin(ang) * t);
        ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath();
        ctx.fillStyle = "#e3c37d"; ctx.strokeStyle = "#1a1408"; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
  },
};

const CATEGORIAS_PIN = [
  [/^User/i, { c: "#d0574f", f: "rombo" }],
  [/RoadSign|Harbor|Transport/i, { c: "#7fb2e5", f: "poste" }],
  [/Shop|Smith|Armorer|Alchem|Herbalist|Inn|Enchant|Hair|Prostitute|Merchant|Cammerlengo|Archmaster|Dye|Wine|Bookseller|Baker|Fish|Butcher|Pastry|Torturer/i, { c: "#7fbf73", f: "circulo", l: "$" }],
  [/MonsterNest|Bandit|Infested|Disturbance|Monster(?!Quest)|Guarded|Hideout/i, { c: "#d0574f", f: "circulo", l: "×" }],
  [/PlaceOfPower/i, { c: "#6cc6d6", f: "circulo", l: "✦" }],
  [/Treasure|Spoils|Contraband|Smuggler|Cache/i, { c: "#e0a24a", f: "circulo", l: "◆" }],
  [/NotDiscovered/i, { c: "#8a929b", f: "circulo", l: "?" }],
  [/Entrance|Door|Cave/i, { c: "#c9ced3", f: "cuadrado" }],
  [/Stash|Whetstone|Armor|Table|Horse|Boat|Bed|Noticeboard|Board/i, { c: "#b9c3cc", f: "circulo", l: "•" }],
];

function estiloPin(pin) {
  if (pin.mision) return pin.destacado ? { c: "#ffd27a", f: "estrella", g: 1.5 } : { c: "#e3c37d", f: "circulo", l: "!" };
  for (const [re, e] of CATEGORIAS_PIN) if (re.test(pin.tipo)) return e;
  return { c: "#6b737c", f: "punto" };
}

function dibujarPin(ctx, x, y, pin) {
  const e = estiloPin(pin);
  const r = 6.5 * (e.g || 1);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(10,10,10,0.85)";
  ctx.fillStyle = e.c;
  ctx.beginPath();
  if (e.f === "rombo") { ctx.moveTo(0, -r - 1); ctx.lineTo(r, 0); ctx.lineTo(0, r + 1); ctx.lineTo(-r, 0); ctx.closePath(); }
  else if (e.f === "cuadrado") ctx.rect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
  else if (e.f === "poste") { ctx.rect(-1.5, -r, 3, r * 2); ctx.rect(-r, -r, r * 1.8, r * 0.8); }
  else if (e.f === "punto") ctx.arc(0, 0, 3, 0, Math.PI * 2);
  else if (e.f === "estrella") {
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
  } else ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fill();
  if (e.l) {
    ctx.fillStyle = "#111";
    ctx.font = `700 ${Math.round(r * 1.5)}px Segoe UI`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(e.l, 0, 0.5);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ bucle de datos
async function bucle() {
  for (;;) {
    try {
      const d = await pedir(`/estado?desde=${S.version}`);
      const posCambio = !S.estado || JSON.stringify(S.estado.pos) !== JSON.stringify(d.pos);
      S.estado = d;
      S.version = d.version;
      if (posCambio) Mapa.nuevaPos(d.pos);
      avisos();
      acks();
      actualizarAlertaVida(d.stat);
      pintar();
    } catch (e) {
      mostrarAviso(t("aviso.sinServidor"));
      await dormir(1500);
    }
  }
}

function mostrarAviso(html) {
  const a = $("#aviso");
  if (html) { if (a.innerHTML !== html) a.innerHTML = html; a.hidden = false; }
  else a.hidden = true;
}

function avisos() {
  const d = S.estado;
  if (d.segundosSinDatos == null && !d.pos) {
    mostrarAviso(t("aviso.sinDatos", esc(S.cfg.rutaLog)));
  } else if (d.segundosSinDatos != null && d.segundosSinDatos > 15) {
    mostrarAviso(t("aviso.silencio", Math.round(d.segundosSinDatos)));
  } else {
    mostrarAviso(null);
  }
}

function acks() {
  const lista = S.estado.acks || [];
  if (!lista.length) return;
  const ultimo = lista[lista.length - 1];
  if (S.ultimoAck === null) { S.ultimoAck = ultimo.n; return; }
  for (const a of lista) {
    if (a.n <= S.ultimoAck) continue;
    if (a.orden !== "0") toast(a.ok ? `✓ ${textoMensaje(a.mensaje) || t("hecho")}` : `✗ ${textoMensaje(a.mensaje) || t("noSePudo")}`, a.ok);
  }
  S.ultimoAck = ultimo.n;
}

// ------------------------------------------------------------------ clics
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-orden]");
  if (b && !S.editando && !b.disabled) {
    orden(JSON.parse(b.dataset.orden), b.dataset.etiqueta);
    return;
  }
  const acc = e.target.closest("[data-accion]");
  if (acc) accionPanel(acc.dataset.accion, acc);
});

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, select, textarea")) return;
  if (e.key === "e" || e.key === "E") alternarEdicion();
  if (e.key === "Escape" && S.editando) alternarEdicion(false);
});
$("#btnEditar").addEventListener("click", () => alternarEdicion(true));

// ------------------------------------------------------------------ edición
async function guardar(cambios) {
  try {
    const c = await enviarJSON("/config", cambios);
    Object.assign(S.cfg, c);
  } catch (e) {
    toast(t("noSePudoGuardar"), false);
  }
}

function alternarEdicion(valor) {
  S.editando = valor === undefined ? !S.editando : valor;
  document.body.classList.toggle("editando", S.editando);
  $("#panel").hidden = !S.editando;
  if (S.editando) rellenarPanel();
  construirRejilla();
}

async function rellenarPanel() {
  $("#listaWidgets").innerHTML = widgets().map((w) => `<label class="check"><input type="checkbox" data-widget="${w.id}" ${w.visible ? "checked" : ""}> ${esc(nombreTipo(w.tipo))}</label>`).join("");
  for (const ch of document.querySelectorAll("[data-widget]")) {
    ch.addEventListener("change", () => {
      widgets().find((w) => w.id === ch.dataset.widget).visible = ch.checked;
      guardar({ layout: S.cfg.layout });
      construirRejilla();
    });
  }
  try { S.monitores = await pedir("/monitores"); } catch (e) { S.monitores = []; }
  const sel = $("#selMonitor");
  sel.innerHTML = `<option value="secundario">${t("monitor.auto")}</option><option value="principal">${t("monitor.principal")}</option>`
    + S.monitores.map((m) => `<option value="${esc(m.nombre)}">${esc(m.nombre.replace("\\\\.\\", ""))} · ${m.ancho}×${m.alto}${m.principal ? ` (${t("principal")})` : ""}</option>`).join("");
  sel.value = S.cfg.monitor || "secundario";
  sel.onchange = async () => { await guardar({ monitor: sel.value }); construirRejilla(); };
  const selE = $("#selEspejo");
  selE.value = String(S.cfg.espejo ?? "auto");
  selE.onchange = async () => { await guardar({ espejo: selE.value === "auto" ? "auto" : selE.value === "true" }); construirRejilla(); };
  const selI = $("#selIdioma");
  selI.value = S.cfg.idioma || "auto";
  selI.onchange = async () => { await guardar({ idioma: selI.value }); elegirIdioma(selI.value); traducirDocumento(); rellenarPanel(); construirRejilla(); };
  const chk = $("#chkCompleta");
  chk.checked = S.cfg.pantallaCompleta !== false;
  chk.onchange = () => guardar({ pantallaCompleta: chk.checked });
  const num = $("#numRetardo");
  num.value = S.cfg.retardoTeclaMs || 35;
  num.onchange = () => guardar({ retardoTeclaMs: clamp(parseInt(num.value, 10) || 35, 10, 200) });
  pintarRed();
  $("#infoRutas").innerHTML = t("rutas", esc(S.cfg.rutaLog), esc(S.cfg.redkit || t("sinRedkit")));
  $("#infoVersion").textContent = "Witcher 3 Second Screen " + (S.cfg.version || "");
  pintarRanuras();
}

// Acceso desde el móvil: solo se activa desde el PC; en el móvil la sección no aparece.
function pintarRed() {
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);
  $("#seccionRed").hidden = !local;
  if (!local) return;
  const chk = $("#chkRed");
  chk.checked = !!S.cfg.escucharEnRed;
  chk.onchange = async () => {
    try {
      Object.assign(S.cfg, await enviarJSON("/red", { activo: chk.checked }));
    } catch (e) {
      toast(t("noSePudoGuardar"), false);
    }
    pintarRed();
  };
  const urls = S.cfg.urlsRed || [];
  $("#infoRed").innerHTML = !S.cfg.escucharEnRed ? ""
    : urls.length ? `<p class="ayuda">${t("ui.redAbre")}</p>` + urls.map((u) => `<p class="url-red"><code>${esc(u)}</code></p>`).join("")
      + `<p class="ayuda">${t("ui.redFirewall")}</p>`
    : `<p class="ayuda">${t("ui.redSinRed")}</p>`;
}

function pintarRanuras() {
  const ranuras = S.cfg.ranuras || [];
  const usables = inv().filter((i) => ["pot", "dec", "oil", "bomb", "food"].includes(i.cat));
  const vistos = new Set();
  const opciones = usables.filter((i) => !vistos.has(i.id) && vistos.add(i.id)).sort(porNombre);
  $("#listaRanuras").innerHTML = ranuras.length ? ranuras.map((r, n) => {
    const lista = opciones.some((o) => o.id === r.id) ? opciones : [{ id: r.id, nombre: r.nombre || r.id }, ...opciones];
    return `<div class="ranura-edit" data-ranura="${n}">
      <select data-campo="id"><option value="">${t("elegirObjeto")}</option>${lista.map((o) => `<option value="${esc(o.id)}" ${o.id === r.id ? "selected" : ""}>${esc(limpio(o.nombre))}</option>`).join("")}</select>
      <select data-campo="accion">${ACCIONES.map((k) => `<option value="${k}" ${k === (r.accion || "usar") ? "selected" : ""}>${t("accion." + k)}</option>`).join("")}</select>
      <input type="text" data-campo="atajo" placeholder="${t("atajoOpcional")}" value="${esc(r.atajo || "")}">
      <div class="fila-botones"><button class="btn btn-mini" data-accion="subirRanura">↑</button><button class="btn btn-mini btn-peligro" data-accion="quitarRanura">${t("quitar")}</button></div>
    </div>`;
  }).join("") : `<p class="ayuda">${opciones.length ? "" : t("cargaPartida")}</p>`;
  for (const fila of document.querySelectorAll("[data-ranura]")) {
    for (const campo of fila.querySelectorAll("[data-campo]")) {
      campo.addEventListener("change", () => {
        const r = S.cfg.ranuras[+fila.dataset.ranura];
        r[campo.dataset.campo] = campo.value.trim();
        if (campo.dataset.campo === "id") r.nombre = limpio(opciones.find((o) => o.id === campo.value)?.nombre || "");
        guardar({ ranuras: S.cfg.ranuras });
        pintar(true);
      });
    }
  }
}

function accionPanel(accion, boton) {
  const fila = boton.closest("[data-ranura]");
  if (accion === "cerrar") alternarEdicion(false);
  if (accion === "mover") enviarJSON("/ventana/mover", {}).then((r) => toast(r.ok ? t("ventanaMovida") : t("ventanaNoEncontrada"), r.ok));
  if (accion === "nuevaRanura") { (S.cfg.ranuras ||= []).push({ id: "", accion: "usar", atajo: "" }); guardar({ ranuras: S.cfg.ranuras }); pintarRanuras(); }
  if (accion === "quitarRanura" && fila) { S.cfg.ranuras.splice(+fila.dataset.ranura, 1); guardar({ ranuras: S.cfg.ranuras }); pintarRanuras(); pintar(true); }
  if (accion === "subirRanura" && fila) {
    const n = +fila.dataset.ranura;
    if (n > 0) { const r = S.cfg.ranuras; [r[n - 1], r[n]] = [r[n], r[n - 1]]; guardar({ ranuras: r }); pintarRanuras(); pintar(true); }
  }
  if (accion === "restaurar" && confirm(t("confirmarRestaurar"))) {
    pedir("/layout-defecto").then((layout) => {
      S.cfg.layout = layout;
      guardar({ layout });
      construirRejilla();
      rellenarPanel();
    });
  }
}

// Arrastrar por el título y redimensionar por el asa, ajustando a la rejilla.
document.addEventListener("pointerdown", (e) => {
  if (!S.editando) return;
  const asa = e.target.closest(".asa");
  const cab = e.target.closest(".widget > h2");
  if (!asa && !cab) return;
  const el = e.target.closest(".widget");
  const w = widgets().find((x) => x.id === el.dataset.id);
  const rej = $("#rejilla").getBoundingClientRect();
  const { columnas, filas } = S.cfg.layout;
  const celdaX = rej.width / columnas, celdaY = rej.height / filas;
  const x0 = e.clientX, y0 = e.clientY, inicial = { ...w };
  const sx0 = xPantalla(w);   // se arrastra en coordenadas de pantalla y se guarda sin espejo
  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  const mover = (ev) => {
    const dx = Math.round((ev.clientX - x0) / celdaX), dy = Math.round((ev.clientY - y0) / celdaY);
    let sx = sx0;
    if (asa) {
      w.w = clamp(inicial.w + dx, 2, columnas - sx0);
      w.h = clamp(inicial.h + dy, 1, filas - w.y);
    } else {
      sx = clamp(sx0 + dx, 0, columnas - w.w);
      w.y = clamp(inicial.y + dy, 0, filas - w.h);
    }
    w.x = espejo() ? columnas - sx - w.w : sx;
    el.style.gridArea = areaGrid(w);
  };
  const soltar = () => {
    el.removeEventListener("pointermove", mover);
    el.removeEventListener("pointerup", soltar);
    if (JSON.stringify(inicial) !== JSON.stringify(w)) guardar({ layout: S.cfg.layout });
  };
  el.addEventListener("pointermove", mover);
  el.addEventListener("pointerup", soltar);
});

// ------------------------------------------------------------------ arranque
(async function iniciar() {
  for (;;) {
    try { S.cfg = await pedir("/config"); break; } catch (e) { await dormir(1000); }
  }
  S.cfg.minimapa ||= { zoom: 1, rotar: false, pines: true };
  elegirIdioma(S.cfg.idioma);
  traducirDocumento();
  construirRejilla();
  Mapa.frame();
  bucle();
})();
