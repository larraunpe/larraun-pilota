import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

const URL = "https://www.fnpelota.com/pub/competicion.asp?idioma=eu";

/* ---------- util ---------- */
function getHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", d => (data += d));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function normalizarFecha(fechaStr) {
  const [d, m, y] = fechaStr.split("/").map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function fechaEnRango(fecha) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const inicioSemanaActual = new Date(hoy);
  inicioSemanaActual.setDate(hoy.getDate() - hoy.getDay());

  const inicioSemanaAnterior = new Date(inicioSemanaActual);
  inicioSemanaAnterior.setDate(inicioSemanaActual.getDate() - 7);

  return fecha >= inicioSemanaAnterior && fecha <= hoy;
}

/* ---------- reglas parejas ---------- */
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
  const limpio = texto.replace(/\s+/g, " ").trim();

  for (const r of CONVERSION) {
    if (limpio.includes(r.match)) return r.value;
  }
  return limpio;
}

function esParejaLarraun(texto) {
  if (!texto) return false;
  if (texto.toUpperCase().includes("LARRAUN")) return true;
  return CONVERSION.some(r => texto.includes(r.match));
}

/* ---------- main ---------- */
(async () => {
  try {
    const html = await getHTML(URL);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const resultados = [];

    const tables = [...document.querySelectorAll("table")].filter(
      t => t.querySelectorAll("td").length > 10
    );

    tables.forEach(table => {
      const rows = [...table.querySelectorAll("tr")];

      rows.forEach(row => {
        const tds = [...row.querySelectorAll("td")];
        if (tds.length < 6) return;

        const cols = tds.map(td =>
          td.textContent.replace(/\s+/g, " ").trim()
        );

        const fechaRaw = cols.find(c => /\d{2}\/\d{2}\/\d{4}/.test(c));
        if (!fechaRaw) return;

        const fechaObj = normalizarFecha(fechaRaw);
        if (!fechaObj || !fechaEnRango(fechaObj)) return;

        const etxekoa = cols[2] || "";
        const kanpokoak = cols[3] || "";

        if (!esParejaLarraun(etxekoa) && !esParejaLarraun(kanpokoak)) return;

        const tanteoa = cols.find(c => /^\d{1,2}-\d{1,2}/.test(c)) || "-";

        let emaitza = "";
        if (tanteoa.includes("-")) {
          const [a, b] = tanteoa.split("-").map(Number);
          const larraunEtxe = esParejaLarraun(etxekoa);
          emaitza =
            (larraunEtxe && a > b) || (!larraunEtxe && b > a)
              ? "irabazita"
              : "galduta";
        }

        resultados.push({
          fecha: fechaRaw,
          etxekoa: convertirPareja(etxekoa),
          kanpokoak: convertirPareja(kanpokoak),
          tanteoa,
          emaitza
        });
      });
    });

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(
      "data/resultados-larraun.json",
      JSON.stringify(resultados, null, 2)
    );

    console.log(`✔ Resultados válidos: ${resultados.length}`);
  } catch (err) {
    console.error("❌ Error scraping resultados:", err);
    process.exit(1);
  }
})();
