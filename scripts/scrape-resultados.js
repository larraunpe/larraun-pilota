import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

// ================= CONFIG =================
const BASE_URL = "https://www.fnpelota.com";
const COMPETICIONES_URL =
  "https://www.fnpelota.com/pub/competicion.asp?idioma=eu";

// conversiones de parejas mixtas
const CONVERSION = [
  {
    match: "D. Centeno - B. Esnaola",
    value: "LARRAUN – ARAXES (D. Centeno - B. Esnaola)"
  },
  {
    match: "X. Goldaracena - E. Astibia",
    value: "LARRAUN – ABAXITABIDEA (X. Goldaracena - E. Astibia)"
  },
  {
    match: "A. Balda - U. Arcelus",
    value: "LARRAUN – OBERENA (A. Balda - U. Arcelus)"
  },
  {
    match: "M. Goikoetxea - G. Uitzi",
    value: "LARRAUN – ARAXES (M. Goikoetxea - G. Uitzi)"
  }
];

// ================= UTILIDADES =================
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

function limpiar(txt = "") {
  return txt.replace(/\s+/g, " ").trim();
}

function convertirPareja(txt) {
  const limpio = limpiar(txt);
  for (const r of CONVERSION) {
    if (limpio.includes(r.match)) return r.value;
  }
  return limpio;
}

function contieneLarraun(txt = "") {
  if (txt.includes("LARRAUN")) return true;
  return CONVERSION.some(r => txt.includes(r.match));
}

function calcularEmaitza(etxekoa, kanpokoak, tanteoa) {
  const larraunEtxe = contieneLarraun(etxekoa);
  const larraunKanpo = contieneLarraun(kanpokoak);

  // Dos parejas LARRAUN → verde
  if (larraunEtxe && larraunKanpo) return "irabazita";

  if (!tanteoa || !tanteoa.includes("-")) return "irabazita";

  const [a, b] = tanteoa.split("-").map(n => parseInt(n, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return "irabazita";

  if ((larraunEtxe && a > b) || (larraunKanpo && b > a)) {
    return "irabazita";
  }
  return "galduta";
}

// fecha dd/mm/yyyy → Date
function parseFecha(fecha) {
  const [d, m, y] = fecha.split("/").map(Number);
  return new Date(y, m - 1, d);
}

function fechaEnRango(fechaStr) {
  const f = parseFecha(fechaStr);
  const hoy = new Date();

  const inicioSemanaActual = new Date(hoy);
  inicioSemanaActual.setDate(hoy.getDate() - hoy.getDay());

  const inicioSemanaAnterior = new Date(inicioSemanaActual);
  inicioSemanaAnterior.setDate(inicioSemanaActual.getDate() - 7);

  return f >= inicioSemanaAnterior && f <= hoy;
}

// ================= SCRAPING =================
async function scrapeCompeticion(url, nombreCompeticion) {
  const html = await getHTML(url);
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const filas = [...document.querySelectorAll("table tr")];
  const resultados = [];

  for (const fila of filas) {
    const celdas = [...fila.querySelectorAll("td")];
    if (celdas.length < 5) continue;

    const texto = celdas.map(td => limpiar(td.textContent));

    const fecha = texto[0];
    if (!fecha || !fecha.includes("/")) continue;
    if (!fechaEnRango(fecha)) continue;

    const fronton = texto[1] || "-";
    const etxekoa = convertirPareja(texto[2]);
    const kanpokoak = convertirPareja(texto[3]);
    const tanteoa = texto[4];

    if (!contieneLarraun(etxekoa) && !contieneLarraun(kanpokoak)) continue;

    resultados.push({
      fecha,
      fronton,
      etxekoa,
      kanpokoak,
      tanteoa,
      lehiaketa: nombreCompeticion,
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
      .filter(a => a.href.includes("ModalidadComp.asp"))
      .map(a => ({
        url: BASE_URL + a.getAttribute("href"),
        nombre: limpiar(a.textContent)
      }));

    let resultados = [];

    for (const comp of enlaces) {
      try {
        const r = await scrapeCompeticion(comp.url, comp.nombre);
        resultados = resultados.concat(r);
      } catch {
        // si falla una competición, no rompe todo
      }
    }

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(
      "data/resultados-larraun.json",
      JSON.stringify(resultados, null, 2)
    );

    console.log(`✔ Resultados oficiales actualizados (${resultados.length})`);
  } catch (err) {
    console.error("❌ Error en scraping:", err);
    process.exit(1);
  }
})();
