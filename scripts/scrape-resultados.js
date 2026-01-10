import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

// ================= CONFIG =================
const BASE_URL = "https://www.fnpelota.com";
const COMPETICIONES_URL =
  "https://www.fnpelota.com/pub/competicion.asp?idioma=eu";

// ================= UTIL =================
function getHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", c => (data += c));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function limpiar(txt = "") {
  return txt.replace(/\s+/g, " ").trim();
}

// ================= PAREJAS MIXTAS =================
const PAREJAS_MIXTAS = JSON.parse(
  fs.readFileSync("data/parejas-mixtas.json", "utf8")
);

function convertirPareja(txt = "") {
  const limpio = limpiar(txt);
  for (const p of PAREJAS_MIXTAS) {
    if (limpio.includes(p.match)) return p.value;
  }
  return limpio;
}

function contieneLarraun(txt = "") {
  if (txt.toUpperCase().includes("LARRAUN")) return true;
  return PAREJAS_MIXTAS.some(p => txt.includes(p.match));
}

// ================= FECHAS =================
function parseFecha(fecha) {
  const [d, m, y] = fecha.split("/").map(Number);
  return new Date(y, m - 1, d);
}

function fechaEnRango(fechaStr) {
  const f = parseFecha(fechaStr);
  if (isNaN(f)) return false;

  const hoy = new Date();

  const inicioSemanaActual = new Date(hoy);
  inicioSemanaActual.setDate(hoy.getDate() - hoy.getDay());

  const inicioSemanaAnterior = new Date(inicioSemanaActual);
  inicioSemanaAnterior.setDate(inicioSemanaActual.getDate() - 7);

  return f >= inicioSemanaAnterior && f <= hoy;
}

// ================= RESULTADO =================
function calcularEmaitza(etxekoa, kanpokoak, tanteoa) {
  const larraunEtxe = contieneLarraun(etxekoa);
  const larraunKanpo = contieneLarraun(kanpokoak);

  // dos parejas Larraun → verde
  if (larraunEtxe && larraunKanpo) return "irabazita";

  if (!tanteoa || !tanteoa.includes("-")) return "irabazita";

  const [a, b] = tanteoa.split("-").map(n => parseInt(n, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return "irabazita";

  if ((larraunEtxe && a > b) || (larraunKanpo && b > a)) {
    return "irabazita";
  }
  return "galduta";
}

// ================= SCRAPE UNA COMPETICIÓN =================
async function scrapeCompeticion(url, nombre) {
  const html = await getHTML(url);
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const filas = [...document.querySelectorAll("table tr")];
  const resultados = [];

  for (const fila of filas) {
    const celdas = [...fila.querySelectorAll("td")];
    if (celdas.length < 5) continue;

    const cols = celdas.map(td => limpiar(td.textContent));

    const fecha = cols[0];
    if (!fecha || !fecha.includes("/") || !fechaEnRango(fecha)) continue;

    const fronton = cols[1] || "-";
    const etxekoa = convertirPareja(cols[2] || "");
    const kanpokoak = convertirPareja(cols[celdas.length - 1] || "");
    const tanteoa = cols.find(c => c.includes("-")) || "";

    if (!contieneLarraun(etxekoa) && !contieneLarraun(kanpokoak)) continue;

    resultados.push({
      fecha,
      fronton,
      etxekoa,
      kanpokoak,
      tanteoa,
      lehiaketa: nombre,
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
    const html = await getHTML(COMPETICIONES_URL);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const enlaces = [...document.querySelectorAll("a")]
      .filter(a => a.href?.includes("ModalidadComp.asp"))
      .map(a => ({
        url: BASE_URL + a.getAttribute("href"),
        nombre: limpiar(a.textContent)
      }));

    let resultados = [];

    for (const comp of enlaces) {
      try {
        const r = await scrapeCompeticion(comp.url, comp.nombre);
        resultados = resultados.concat(r);
      } catch (e) {
        console.warn("⚠️ Fallo en", comp.url);
      }
    }

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(
      "data/resultados-larraun.json",
      JSON.stringify(resultados, null, 2)
    );

    console.log(`✔ Resultados oficiales: ${resultados.length}`);
  } catch (err) {
    console.error("❌ Error general:", err);
    process.exit(1);
  }
})();
