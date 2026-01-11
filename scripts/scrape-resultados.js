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
        resolve(buffer.toString("latin1")); // 🔑 acentos correctos
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
  const m = str.match(/(\d{4})\/(\d{2})\/(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

// ======================================================
// RESULTADO
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
// SCRAPE DE UNA COMPETICIÓN
// ======================================================
async function scrapeCompeticion(id) {
  const url = `${URL_BASE}${id}`;
  const html = await getHTML(url);
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // ---------- MODALIDAD ----------
  let modalidad = "";
  const modalidadTD = [...doc.querySelectorAll("td")]
    .find(td => td.textContent.includes("Modalitatea"));

  if (modalidadTD) {
    const option = modalidadTD.querySelector("option[selected]");
    modalidad = option ? clean(option.textContent) : "";
  }

  const filas = [...doc.querySelectorAll("table tr")];
  const resultados = [];

  for (const fila of filas) {
    const tds = [...fila.querySelectorAll("td")];
    if (tds.length < 5) continue;

    const fechaHora = clean(tds[0].textContent);
    if (!fechaHora.includes("/")) continue;

    const fronton = clean(tds[1].textContent);
    const etxRaw = clean(tds[2].textContent);
    const emaitzaCell = tds[3];
    const kanpoRaw = clean(tds[4].textContent);

    if (etxRaw === "Descanso" || kanpoRaw === "Descanso") continue;

    const etxekoa = convertirPareja(etxRaw);
    const kanpokoak = convertirPareja(kanpoRaw);

    if (!contieneLarraun(etxekoa) && !contieneLarraun(kanpokoak)) continue;

    // ---------- TANTEO ----------
    const tanteoa = clean(emaitzaCell.childNodes[0]?.textContent);

    // ---------- SETS (CORREGIDO) ----------
    const setsArray = [...emaitzaCell.querySelectorAll("span")]
      .map(s => clean(s.textContent.replace(/[()]/g, "")))
      .filter(Boolean);

    const sets = setsArray.join("  "); // 👈 doble espacio

    resultados.push({
      fecha: parseFechaEU(fechaHora)?.toISOString().slice(0, 10),
      fronton,
      modalidad,
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
  const todos = [];

  for (let id = ID_DESDE; id <= ID_HASTA; id++) {
    try {
      const res = await scrapeCompeticion(id);
      if (res.length) {
        console.log(`📄 id ${id}: ${res.length} resultados`);
        todos.push(...res);
      }
      await sleep(ESPERA_MS);
    } catch {
      // ignorar errores puntuales
    }
  }

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(
    "data/resultados-larraun.json",
    JSON.stringify(todos, null, 2)
  );

  console.log(`🏁 Total resultados detectados: ${todos.length}`);
})();
