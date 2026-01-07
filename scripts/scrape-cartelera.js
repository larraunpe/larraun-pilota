import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

const URL = "https://www.fnpelota.com/pub/cartelera.asp?idioma=eu";

// ---------- util ----------
function getHTML(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

// ---------- conversion reglas ----------
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

// ---------- main ----------
(async () => {
  try {
    const html = await getHTML(URL);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const rows = [...document.querySelectorAll("table tr")];
    const partidos = [];

    rows.forEach(row => {
      const tds = [...row.querySelectorAll("td")];
      if (tds.length < 6) return;

      const cols = tds.map(td =>
        td.textContent.replace(/\s+/g, " ").trim()
      );

      const fecha = cols[0] || "-";
      const hora = cols[1] || "-";
      const zkia = cols[2] || "-";
      const fronton = cols[3] || "-";
      const etxekoa = cols[4] || "-";
      const kanpokoak = cols[5] || "-";
      const lehiaketa = cols[6] || "-";

      // solo partidos donde juegue LARRAUN
      if (!etxekoa.includes("LARRAUN") && !kanpokoak.includes("LARRAUN")) return;

      partidos.push({
        fecha,
        hora,
        zkia,
        fronton,
        etxekoa: convertirPareja(etxekoa),
        kanpokoak: convertirPareja(kanpokoak),
        lehiaketa
      });
    });

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(
      "data/cartelera-larraun.json",
      JSON.stringify(partidos, null, 2)
    );

    console.log(`✔ Cartelera actualizada (${partidos.length} partidos)`);

  } catch (err) {
    console.error("❌ Error en scraping:", err);
    process.exit(1);
  }
})();
