import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

const URL = "https://www.fnpelota.com/pub/competicion.asp?idioma=eu";

// ---------------- util ----------------
function getHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

// ---------------- reglas parejas ----------------
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

  for (const rule of CONVERSION) {
    if (limpio.includes(rule.match)) {
      return rule.value;
    }
  }

  return limpio;
}

function esParejaLarraun(texto) {
  if (!texto) return false;
  if (texto.includes("LARRAUN")) return true;
  return CONVERSION.some(r => texto.includes(r.match));
}

// ---------------- main ----------------
(async () => {
  try {
    const html = await getHTML(URL);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const rows = [...document.querySelectorAll("table tr")];
    const resultados = [];

    rows.forEach(row => {
      const tds = [...row.querySelectorAll("td")];
      if (tds.length < 8) return;

      const cols = tds.map(td =>
        td.textContent.replace(/\s+/g, " ").trim()
      );

      const fecha = cols[0] || "-";
      const fronton = cols[1] || "-";
      const etxekoa = cols[2] || "-";
      const kanpokoak = cols[3] || "-";
      const tanteoa = cols[4] || "-";
      const lehiaketa = cols[5] || "-";

      // ---- FILTRO CLAVE ----
      if (!esParejaLarraun(etxekoa) && !esParejaLarraun(kanpokoak)) return;

      // ---- determinar resultado ----
      let emaitza = "galduta";
      if (tanteoa.includes("-")) {
        const [a, b] = tanteoa.split("-").map(n => parseInt(n, 10));
        const larraunEtxe = esParejaLarraun(etxekoa);
        const irabazi =
          (larraunEtxe && a > b) || (!larraunEtxe && b > a);
        emaitza = irabazi ? "irabazita" : "galduta";
      }

      resultados.push({
        fecha,
        fronton,
        etxekoa: convertirPareja(etxekoa),
        kanpokoak: convertirPareja(kanpokoak),
        tanteoa,
        lehiaketa,
        emaitza
      });
    });

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(
      "data/resultados-larraun.json",
      JSON.stringify(resultados, null, 2)
    );

    console.log(`✔ Resultados actualizados (${resultados.length})`);

  } catch (err) {
    console.error("❌ Error scraping resultados:", err);
    process.exit(1);
  }
})();
