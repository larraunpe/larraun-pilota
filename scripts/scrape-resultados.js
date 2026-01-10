import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

// ================= CONFIG =================
const BASE = "https://www.fnpelota.com";
const COMPETICIONES_URL = `${BASE}/pub/competicion.asp?idioma=eu`;
const TEMPORADA = "2025";

// ================= CARGA PAREJAS =================
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

const limpiar = t => (t || "").replace(/\s+/g, " ").trim();

function convertirPareja(txt) {
  const limpio = limpiar(txt);
  for (const p of PAREJAS) {
    if (limpio.includes(p.match)) return p.value;
  }
  return limpio;
}

function contieneLarraun(txt = "") {
  if (txt.includes("LARRAUN")) return true;
  return PAREJAS.some(p => txt.includes(p.match));
}

function calcularEmaitza(etx, kanpo, res) {
  const lE = contieneLarraun(etx);
  const lK = contieneLarraun(kanpo);

  if (!res || !res.includes("-")) return "irabazita";

  const [a, b] = res.split("-").map(n => parseInt(n, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return "irabazita";

  if ((lE && a > b) || (lK && b > a)) return "irabazita";
  return "galduta";
}
function makeURL(href) {
  return new URL(href, "https://www.fnpelota.com/pub/").href;
}

// ================= FECHAS =================
function parseFechaEU(f) {
  // 2026/01/07
  const [y, m, d] = f.split("/").map(Number);
  return new Date(y, m - 1, d);
}

function fechaEnRango(fechaStr) {
  const f = parseFechaEU(fechaStr);
  const hoy = new Date();

  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - hoy.getDay() - 7);

  return f >= inicioSemana && f <= hoy;
}

// ================= SCRAPE MODALIDAD =================
async function scrapeModalidad(url, nombre) {
  const html = await getHTML(url);
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const filas = [...doc.querySelectorAll("table tr")];
  const out = [];

  for (const fila of filas) {
    const tds = [...fila.querySelectorAll("td")];
    if (tds.length < 5) continue;

    const fechaHora = limpiar(tds[0].textContent);
    if (!fechaHora.includes("/")) continue;

    const fecha = fechaHora.split(" ")[0];
    if (!fechaEnRango(fecha)) continue;

    const fronton = limpiar(tds[1].textContent);
    const etxekoa = convertirPareja(tds[2].textContent);
    const emaitzaTxt = limpiar(tds[3].childNodes[0]?.textContent);
    const kanpokoak = convertirPareja(tds[4].textContent);

    if (!contieneLarraun(etxekoa) && !contieneLarraun(kanpokoak)) continue;

    const sets = [...tds[3].querySelectorAll("span")]
      .map(s => limpiar(s.textContent))
      .filter(Boolean);

    out.push({
      fecha,
      fronton,
      etxekoa,
      kanpokoak,
      tanteoa: emaitzaTxt,
      sets,
      lehiaketa: nombre,
      emaitza: calcularEmaitza(etxekoa, kanpokoak, emaitzaTxt),
      ofiziala: true,
      url
    });
  }

  return out;
}

// ================= MAIN =================
(async () => {
  try {
    const html = await getHTML(COMPETICIONES_URL);
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // categorías
    const categorias = [...doc.querySelectorAll("a")]
      .filter(a => {
        const href = a.getAttribute("href");
        return (
          href &&
          href.includes("modalidadescompeticion.asp") &&
          !href.startsWith("javascript") &&
          !href.startsWith("#")
        );
      })
      .map(a => new URL(href = a.getAttribute("href"), BASE).href);


    let resultados = [];

    for (const catUrl of categorias) {
      const catHTML = await getHTML(catUrl);
      const catDOM = new JSDOM(catHTML);
      const catDoc = catDOM.window.document;

      const modalidades = [...catDoc.querySelectorAll("a")]
      .filter(a => {
        const href = a.getAttribute("href");
        return (
          href &&
          href.includes("ModalidadComp.asp") &&
          !href.startsWith("javascript") &&
          !href.startsWith("#")
        );
      })
      .map(a => ({
        url: makeURL(a.getAttribute("href")),
        nombre: limpiar(a.textContent)
      }));



      for (const mod of modalidades) {
        try {
          const r = await scrapeModalidad(mod.url, mod.nombre);
          resultados = resultados.concat(r);
        } catch {}
      }
    }

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(
      "data/resultados-larraun.json",
      JSON.stringify(resultados, null, 2)
    );

    console.log(`✔ Oficiales detectados: ${resultados.length}`);
  } catch (e) {
    console.error("❌ Error:", e);
    process.exit(1);
  }
})();
