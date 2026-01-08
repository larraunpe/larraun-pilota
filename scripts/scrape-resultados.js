import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

const URL = "https://www.fnpelota.com/pub/competicion.asp?idioma=eu";

/* ---------- helpers ---------- */
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
  // esperado: dd/mm/yyyy
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

function contieneLarraun(texto) {
  return texto && texto.toUpperCase().includes("LARRAUN");
}

/* ---------- main ---------- */
(async () => {
  try {
    const html = await getHTML(URL);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const resultados = [];

    // solo tablas "grandes" (evita cabeceras)
    const tables = [...document.querySelectorAll("table")].filter(
      t => t.querySelectorAll("tr td").length > 10
    );

    tables.forEach(table => {
      const rows = [...table.querySelectorAll("tr")];

      rows.forEach(row => {
        const tds = [...row.querySelectorAll("td")];
        if (tds.length < 5) return;

        const text = tds.map(td =>
          td.textContent.replace(/\s+/g, " ").trim()
        );

        const fechaRaw = text.find(t => /\d{2}\/\d{2}\/\d{4}/.test(t));
        if (!fechaRaw) return;

        const fecha = normalizarFecha(fechaRaw);
        if (!fecha || !fechaEnRango(fecha)) return;

        const etxekoa = text.find(t => contieneLarraun(t)) || "";
        const kanpokoak = text.reverse().find(t => contieneLarraun(t)) || "";

        if (!contieneLarraun(etxekoa) && !contieneLarraun(kanpokoak)) return;

        const tanteoa = text.find(t => /^\d{1,2}-\d{1,2}/.test(t)) || "-";

        let emaitza = "";
        if (tanteoa.includes("-")) {
          const [a, b] = tanteoa.split("-").map(Number);
          const larraunEtxean = contieneLarraun(etxekoa);
          emaitza =
            (larraunEtxean && a > b) || (!larraunEtxean && b > a)
              ? "irabazita"
              : "galduta";
        }

        resultados.push({
          fecha: fechaRaw,
          etxekoa,
          kanpokoak,
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

    console.log(`✔ Resultados encontrados: ${resultados.length}`);
  } catch (e) {
    console.error("❌ Error scraping:", e);
    process.exit(1);
  }
})();
