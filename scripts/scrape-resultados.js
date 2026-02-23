import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

// ======================================================
// CONFIGURACIÓN
// ======================================================
const BASE = "https://www.fnpelota.com";
const URL_BASE = `${BASE}/pub/ModalidadComp.asp?idioma=eu&idCompeticion=`;

const ID_DESDE = 2700;
const ID_HASTA = 3800;
const ESPERA_MS = 300;

// ======================================================
// PAREJAS MIXTAS
// ======================================================
const PAREJAS = JSON.parse(
  fs.readFileSync("data/parejas-mixtas.json", "utf8")
);

// ======================================================
// UTILIDADES
// ======================================================
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString("latin1"));
      });
    }).on("error", reject);
  });
}

const clean = t => (t || "").replace(/\s+/g, " ").trim();

function contieneLarraun(txt = "") {
  if (txt.includes("LARRAUN")) return true;
  return PAREJAS.some(p => txt.includes(p.match));
}

function convertirPareja(txt) {
  const limpio = clean(txt);
  for (const p of PAREJAS) {
    if (limpio.includes(p.match)) return p.value;
  }
  return limpio;
}

// ======================================================
// FECHAS
// ======================================================
function parseFechaEU(str) {
  const m = str.match(/(\d{4}\/\d{2}\/\d{2})/);
  if (!m) return null;
  const [y, mo, d] = m[1].split("/").map(Number);
  return new Date(y, mo - 1, d);
}

// ======================================================
// EMAITZA
// ======================================================
function calcularEmaitza(etx, kanpo, tanteoa) {
  if (!tanteoa || tanteoa === "0 - 0") return "";

  const lE = contieneLarraun(etx);
  const lK = contieneLarraun(kanpo);

  if (!tanteoa.includes("-")) return "";

  const [a, b] = tanteoa.split("-").map(n => parseInt(n, 10));
  if (isNaN(a) || isNaN(b)) return "";

  if ((lE && a > b) || (lK && b > a)) return "irabazita";
  return "galduta";
}

// ======================================================
// MODALIDAD
// ======================================================
function obtenerModalidad(doc) {
  const opt = doc.querySelector("select option[selected]");
  return opt ? clean(opt.textContent) : "";
}

// ======================================================
// SETS
// ======================================================
function extraerSets(cell) {
  const spans = [...cell.querySelectorAll("span")];
  if (!spans.length) return [];

  const sets = spans
    .map(s => clean(s.textContent))
    .filter(Boolean);

  return sets.length ? [sets.join("  ")] : [];
}

// ======================================================
// DETECTAR FASES ELIMINATORIAS
// ======================================================
function extraerFasesEliminatorias(doc) {
  const enlaces = [...doc.querySelectorAll("a[href*='idFaseEliminatoria']")];
  const fases = new Set();

  for (const a of enlaces) {
    const href = a.getAttribute("href");
    const match = href.match(/idFaseEliminatoria=(\d+)/);
    if (match) fases.add(match[1]);
  }

  return [...fases];
}

// ======================================================
// EXTRAER PARTIDOS DE UNA PÁGINA
// ======================================================
function extraerPartidosDeDocumento(doc, url) {
  const modalidad = obtenerModalidad(doc);
  const filas = tabla.querySelectorAll("tr");

filas.forEach(fila => {

  const columnas = fila.querySelectorAll("td");

  // SOLO filas que tengan exactamente 5 columnas
  if (columnas.length !== 5) return;

  // Aquí procesas el partido
});
  if (filas.length < 3) return [];

  const resultados = [];

  for (const fila of filas) {
    const tds = [...fila.querySelectorAll("td")];
    if (tds.length < 5) continue;

    const fechaHora = clean(tds[0].textContent);
    if (!fechaHora.includes("/")) continue;

    const fechaObj = parseFechaEU(fechaHora);
    if (!fechaObj) continue;

    const etxekoaRaw = clean(tds[2].textContent);
    const kanpokoRaw = clean(tds[4].textContent);

    // DESCANSO
    if (etxekoaRaw === "Descanso" || kanpokoRaw === "Descanso") {
      const equipoLarraun =
        contieneLarraun(etxekoaRaw) ? etxekoaRaw :
        contieneLarraun(kanpokoRaw) ? kanpokoRaw :
        null;

      if (!equipoLarraun) continue;

      resultados.push({
        fecha: fechaObj.toISOString().slice(0, 10),
        fronton: "",
        etxekoa: convertirPareja(equipoLarraun),
        kanpokoak: "ATSEDENA",
        tanteoa: "0 - 0",
        sets: [],
        modalidad,
        emaitza: "",
        ofiziala: true,
        url
      });

      continue;
    }

    if (!contieneLarraun(etxekoaRaw) && !contieneLarraun(kanpokoRaw)) continue;

    const tanteoa = clean(tds[3].childNodes[0]?.textContent);
    const sets = extraerSets(tds[3]);

    resultados.push({
      fecha: fechaObj.toISOString().slice(0, 10),
      fronton: clean(tds[1].textContent),
      etxekoa: convertirPareja(etxekoaRaw),
      kanpokoak: convertirPareja(kanpokoRaw),
      tanteoa,
      sets,
      modalidad,
      emaitza: calcularEmaitza(etxekoaRaw, kanpokoRaw, tanteoa),
      ofiziala: true,
      url
    });
  }

  return resultados;
}

// ======================================================
// SCRAPE COMPETICIÓN COMPLETA (LIGA + FASES)
// ======================================================
async function scrapeCompeticion(id) {
  const resultados = [];

  const urlBase = `${URL_BASE}${id}`;
  const htmlBase = await getHTML(urlBase);
  const domBase = new JSDOM(htmlBase);
  const docBase = domBase.window.document;

  resultados.push(...extraerPartidosDeDocumento(docBase, urlBase));

  const fases = extraerFasesEliminatorias(docBase);

  for (const faseId of fases) {
    const urlFase = `${BASE}/pub/modalidadComp.asp?idioma=eu&idCompeticion=${id}&idFaseEliminatoria=${faseId}&temp=2025`;

    try {
      const htmlFase = await getHTML(urlFase);
      const domFase = new JSDOM(htmlFase);
      const docFase = domFase.window.document;

      resultados.push(...extraerPartidosDeDocumento(docFase, urlFase));
      await sleep(ESPERA_MS);
    } catch {}
  }

  return resultados;
}

// ======================================================
// MAIN
// ======================================================
(async () => {
  let todos = [];
  const vistos = new Set();

  for (let id = ID_DESDE; id <= ID_HASTA; id++) {
    try {
      const res = await scrapeCompeticion(id);

      const filtrados = res.filter(r => {
        const clave = `${r.fecha}-${r.etxekoa}-${r.kanpokoak}-${r.url}`;
        if (vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
      });

      if (filtrados.length) {
        console.log(`✔ id ${id}: ${filtrados.length}`);
        todos.push(...filtrados);
      }

      await sleep(ESPERA_MS);
    } catch {}
  }

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(
    "data/resultados-larraun.json",
    JSON.stringify(todos, null, 2)
  );

  console.log(`🏁 Total resultados: ${todos.length}`);
})();
