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
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getHTML(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        let data = "";
        res.on("data", c => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
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
// RESULTADO
// ======================================================
function calcularEmaitza(etx, kanpo, tanteoa) {
  const lE = contieneLarraun(etx);
  const lK = contieneLarraun(kanpo);

  if (lE && lK) return "irabazita";
  if (!tanteoa || !tanteoa.includes("-")) return "irabazita";

  const [a, b] = tanteoa.split("-").map(n => parseInt(n, 10));
  if (isNaN(a) || isNaN(b)) return "irabazita";

  if ((lE && a > b) || (lK && b > a)) return "irabazita";
  return "galduta";
}

// ======================================================
// SCRAPE DE UNA COMPETICIÓN
// ======================================================
async function scrapeCompeticion(id) {
  const url = `${URL_BASE}${id}`;
  const html = await getHTML(url);

  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const filas = [...doc.querySelectorAll("table tr")];
  if (filas.length <= 2) return [];

  console.log(`📄 id ${id}: ${filas.length} filas`);

  const resultados = [];

  for (const fila of filas) {
    const tds = [...fila.querySelectorAll("td")];
    if (tds.length < 5) continue;

    const fechaHora = clean(tds[0].textContent);
    if (!fechaHora.includes("/")) continue;

    const fronton = clean(tds[1].textContent);
    const etxRaw = clean(tds[2].textContent);
    const kanpoRaw = clean(tds[4].textContent);

    if (etxRaw === "Descanso" || kanpoRaw === "Descanso") continue;

    const etxekoa = convertirPareja(etxRaw);
    const kanpokoak = convertirPareja(kanpoRaw);

    if (!contieneLarraun(etxekoa) && !contieneLarraun(kanpokoak)) continue;

    const emaitzaCell = tds[3];
    const tanteoa = clean(emaitzaCell.childNodes[0]?.textContent);
    const sets = [...emaitzaCell.querySelectorAll("span")]
      .map(s => clean(s.textContent.replace(/[()]/g, "")))
      .filter(Boolean);

    resultados.push({
      fecha: parseFechaEU(fechaHora)?.toISOString().slice(0, 10),
      fronton,
      etxekoa,
      kanpokoak,
      tanteoa,
      sets,
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
  try {
    let todos = [];

    for (let id = ID_DESDE; id <= ID_HASTA; id++) {
      try {
        const res = await scrapeCompeticion(id);
        if (res.length) {
          console.log(`✔ id ${id}: ${res.length} resultados`);
          todos.push(...res);
        }
        await sleep(ESPERA_MS);
      } catch {
        // ignorar errores individuales
      }
    }

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(
      "data/resultados-larraun.json",
      JSON.stringify(todos, null, 2)
    );

    console.log(`🏁 Total resultados detectados: ${todos.length}`);
  } catch (e) {
    console.error("❌ Error fatal:", e);
    process.exit(1);
  }
})();
