import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

const URL = "https://www.fnpelota.com/pub/competicion.asp?idioma=eu";

// --------------------------------------------------
// UTILIDADES
// --------------------------------------------------
function getHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120",
          Accept: "text/html"
        }
      },
      res => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => resolve(data));
      }
    ).on("error", reject);
  });
}

function limpiar(texto) {
  return texto
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

// --------------------------------------------------
// FECHAS (semana actual + anterior)
// --------------------------------------------------
function parseFecha(fechaTexto) {
  // formatos tipo: 08/01/2026 o 8/1/26
  const m = fechaTexto.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return null;

  let [, d, mth, y] = m;
  if (y.length === 2) y = "20" + y;

  return new Date(`${y}-${mth.padStart(2, "0")}-${d.padStart(2, "0")}`);
}

function fechaEnRango(fecha) {
  if (!fecha) return false;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const inicioSemanaActual = new Date(hoy);
  inicioSemanaActual.setDate(hoy.getDate() - hoy.getDay());

  const inicioSemanaAnterior = new Date(inicioSemanaActual);
  inicioSemanaAnterior.setDate(inicioSemanaActual.getDate() - 7);

  const finSemanaActual = new Date(inicioSemanaActual);
  finSemanaActual.setDate(inicioSemanaActual.getDate() + 7);

  return fecha >= inicioSemanaAnterior && fecha < finSemanaActual;
}

// --------------------------------------------------
// REGLAS DE CONVERSIÓN
// --------------------------------------------------
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

function convertirPareja(texto) {
  if (!texto) return "-";
  const limpio = limpiar(texto);

  for (const r of CONVERSION) {
    if (limpio.includes(r.match)) return r.value;
  }
  return limpio;
}

function esParejaLarraun(texto) {
  if (!texto) return false;
  if (texto.includes("LARRAUN")) return true;
  return CONVERSION.some(r => texto.includes(r.match));
}

// --------------------------------------------------
// MAIN
// --------------------------------------------------
(async () => {
  try {
    const html = await getHTML(URL);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const filas = [...document.querySelectorAll("tr")];
    const resultados = [];

    filas.forEach(tr => {
      const tds = [...tr.querySelectorAll("td")];
      if (tds.length < 6) return;

      const textos = tds.map(td => limpiar(td.textContent));

      // Intento flexible de columnas
      const fechaTexto = textos.find(t => /\d{1,2}[\/\-]\d{1,2}/.test(t));
      const tanteoa = textos.find(t => /\d+\s*-\s*\d+/.test(t));
      const etxekoa = textos.find(t => t.includes("("));
      const kanpokoak = textos.reverse().find(t => t.includes("("));
      const fronton = textos.find(t => t.includes("-"));
      const lehiaketa = textos.find(t => t.length > 10 && !t.includes("("));

      const fecha = parseFecha(fechaTexto);

      if (!fechaEnRango(fecha)) return;
      if (!esParejaLarraun(etxekoa) && !esParejaLarraun(kanpokoak)) return;
      if (!tanteoa) return;

      // resultado
      let emaitza = "galduta";
      const [a, b] = tanteoa.split("-").map(n => parseInt(n, 10));
      const larraunEtxe = esParejaLarraun(etxekoa);
      if ((larraunEtxe && a > b) || (!larraunEtxe && b > a)) {
        emaitza = "irabazita";
      }

      resultados.push({
        fecha: fechaTexto,
        fronton: fronton || "-",
        etxekoa: convertirPareja(etxekoa),
        kanpokoak: convertirPareja(kanpokoak),
        tanteoa,
        lehiaketa: lehiaketa || "-",
        emaitza
      });
    });

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(
      "data/resultados-larraun.json",
      JSON.stringify(resultados, null, 2)
    );

    console.log(`✔ Resultados encontrados: ${resultados.length}`);

  } catch (err) {
    console.error("⚠️ Error scraping FNP, se mantiene último JSON", err);
  }
})();
