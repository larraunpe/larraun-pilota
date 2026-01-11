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
        resolve(buffer.toString("latin1")); // 👈 UTF CORRECTO
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
  const lE = contieneLarraun(etx);
  const lK = contieneLarraun(kanpo);

  if (!tanteoa || !tanteoa.includes("-")) return "irabazita";

  const [a, b] = tanteoa.split("-").map(n => parseInt(n, 10));
  if (isNaN(a) || isNaN(b)) return "irabazita";

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
// SETS (FORMATO FINAL)
// ======================================================
function extraerSets(cell) {
  const spans = [...cell.querySelectorAll("span")];
  if (!spans.length) return [];

  const sets = spans
    .map(s =>
      clean(
        s.textContent
          .replace("(", "")
          .replace(")", "")
      )
    )
    .filter(Boolean);

  return sets.length ? [sets.join("  ")] : [];
}

// ======================================================
// SCRAPE COMPETICIÓN
// ======================================================
async function scrapeCompeticion(id) {
  const url = `${URL_BASE}${id}`;
  const html = await getHTML(url);

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const modalidad = obtenerModalidad(doc);
  const filas = [...doc.querySelectorAll("table tr")];
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

    if (etxekoaRaw === "Descanso" || kanpokoRaw === "Descanso") continue;

    const etxekoa = convertirPareja(etxekoaRaw);
    const kanpokoak = convertirPareja(kanpokoRaw);

    if (!contieneLarraun(etxekoa) && !contieneLarraun(kanpokoak)) continue;

    const tanteoa = clean(tds[3].childNodes[0]?.textContent);
    const sets = extraerSets(tds[3]);

    resultados.push({
      fecha: fechaObj.toISOString().slice(0, 10),
      fronton: clean(tds[1].textContent),
      etxekoa,
      kanpokoak,
      tanteoa,
      sets,
      modalidad,
      emaitza: calcularEmaitza(etxekoa, kanpokoak, tanteoa),
      ofiziala: true,
      url
    });
  }

  return resultados;
}

// ======================================================
// MAIN
// ======================================================
(async () => {
  let todos = [];

  for (let id = ID_DESDE; id <= ID_HASTA; id++) {
    try {
      const res = await scrapeCompeticion(id);
      if (res.length) {
        console.log(`✔ id ${id}: ${res.length}`);
        todos.push(...res);
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
