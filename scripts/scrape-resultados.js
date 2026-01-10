import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

// ================= CONFIG =================
const BASE = "https://www.fnpelota.com";
const START_URL = `${BASE}/pub/competicion.asp?idioma=eu`;

// ================= PAREJAS MIXTAS =================
const PAREJAS = JSON.parse(
  fs.readFileSync("data/parejas-mixtas.json", "utf8")
);

// ================= UTIL =================
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

function makeURL(href) {
  try {
    return new URL(href, BASE).href;
  } catch {
    return null;
  }
}

function convertirPareja(txt) {
  const limpio = clean(txt);
  for (const p of PAREJAS) {
    if (limpio.includes(p.match)) return p.value;
  }
  return limpio;
}

function contieneLarraun(txt = "") {
  if (txt.includes("LARRAUN")) return true;
  return PAREJAS.some(p => txt.includes(p.match));
}

// ================= FECHAS =================
function parseFechaEU(f) {
  // formato: 2026/01/07
  const [y, m, d] = f.split("/").map(Number);
  return new Date(y, m - 1, d);
}

function fechaEnRango(fechaStr) {
  const f = parseFechaEU(fechaStr);
  if (isNaN(f)) return false;

  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(hoy.getDate() - 14); // 2 semanas atrás

  const hasta = new Date(hoy);
  hasta.setDate(hoy.getDate() + 7); // 1 semana futura

  return f >= desde && f <= hasta;
}

// ================= EMAITZA =================
function calcularEmaitza(etx, kanpo, tanteoa) {
  const lE = contieneLarraun(etx);
  const lK = contieneLarraun(kanpo);

  // Dos parejas LARRAUN → verde
  if (lE && lK) return "irabazita";

  if (!tanteoa || !tanteoa.includes("-")) return "irabazita";

  const [a, b] = tanteoa.split("-").map(n => parseInt(n, 10));
  if (isNaN(a) || isNaN(b)) return "irabazita";

  if ((lE && a > b) || (lK && b > a)) return "irabazita";
  return "galduta";
}

// ================= SCRAPE MODALIDAD =================
async function scrapeModalidad(url, izena) {
  const html = await getHTML(url);
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const filas = [...doc.querySelectorAll("table tr")];
  const resultados = [];

  for (const fila of filas) {
    const tds = [...fila.querySelectorAll("td")];

    // 👇 SOLO filas de partido real
    if (tds.length !== 5) continue;

    const fechaHora = clean(tds[0].textContent);
    if (!fechaHora.includes("/")) continue;

    const fecha = fechaHora.split(" ")[0];
    if (!fechaEnRango(fecha)) continue;

    const fronton = clean(tds[1].textContent);
    const etxekoa = convertirPareja(tds[2].textContent);
    const kanpokoak = convertirPareja(tds[4].textContent);

    if (
      etxekoa.includes("Descanso") ||
      kanpokoak.includes("Descanso")
    ) continue;

    if (!contieneLarraun(etxekoa) && !contieneLarraun(kanpokoak)) continue;

    // Resultado y sets
    const emaitzaCell = tds[3];
    const tanteoa = clean(emaitzaCell.childNodes[0]?.textContent);

    const sets = [...emaitzaCell.querySelectorAll("span")]
      .map(s => clean(s.textContent.replace(/[()]/g, "")))
      .filter(Boolean);

    resultados.push({
      fecha,
      fronton,
      etxekoa,
      kanpokoak,
      tanteoa,
      sets,
      lehiaketa: izena,
      emaitza: calcularEmaitza(etxekoa, kanpokoak, tanteoa),
      ofiziala: true,
      url
    });
  }

  return resultados;
}

// ================= MAIN =================
(async () => {
  try {
    const html = await getHTML(START_URL);
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const categoriaLinks = [...doc.querySelectorAll("a")]
      .map(a => makeURL(a.getAttribute("href")))
      .filter(h => h && h.includes("modalidadescompeticion.asp"));

    let resultados = [];

    for (const cat of categoriaLinks) {
      try {
        const catHTML = await getHTML(cat);
        const catDOM = new JSDOM(catHTML);
        const catDoc = catDOM.window.document;

        const modalidades = [...catDoc.querySelectorAll("a")]
          .map(a => ({
            url: makeURL(a.getAttribute("href")),
            nombre: clean(a.textContent)
          }))
          .filter(m => m.url && m.url.includes("ModalidadComp.asp"));

        for (const mod of modalidades) {
          try {
            const r = await scrapeModalidad(mod.url, mod.nombre);
            resultados = resultados.concat(r);
          } catch (e) {
            // una modalidad no rompe todo
          }
        }
      } catch (e) {
        // una categoría no rompe todo
      }
    }

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(
      "data/resultados-larraun.json",
      JSON.stringify(resultados, null, 2)
    );

    console.log(`✔ Oficiales detectados: ${resultados.length}`);
  } catch (e) {
    console.error("❌ Error fatal:", e);
    process.exit(1);
  }
})();
