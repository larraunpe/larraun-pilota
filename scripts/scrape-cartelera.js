import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

const URL = "https://www.fnpelota.com/pub/cartelera.asp?idioma=eu";

function getHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

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

(async () => {
  try {
    const html = await getHTML(URL);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const rows = [...document.querySelectorAll("table tr")];
    const partidos = [];
    function convertirPareja(texto) {
  if (!texto) return "-";

  let limpio = texto.replace(/\s+/g, " ").trim();

  for (const rule of CONVERSION) {
    if (limpio.includes(rule.match)) {
      return rule.value;
    }
  }

  return limpio;
}


    rows.forEach(row => {
  const tds = [...row.querySelectorAll("td")];
  if (tds.length < 7) return;

  const etxekoa = tds[4].textContent.trim();
  const kanpokoak = tds[5].textContent.trim();

  // Solo partidos donde juegue LARRAUN
  if (!etxekoa.includes("LARRAUN") && !kanpokoak.includes("LARRAUN")) return;

  partidos.push({
    fecha: tds[0].textContent.trim(),
    hora: tds[1].textContent.trim(),
    zkia: tds[2].textContent.trim() || "-",
    fronton: tds[3].textContent.trim(),
    etxekoa: convertirPareja(etxekoa),
    kanpokoak: convertirPareja(kanpokoak),
    lehiaketa: tds[6].textContent.trim() || "-"
  });
});


    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(
      "data/cartelera-larraun.json",
      JSON.stringify(partidos, null, 2)
    );

    console.log(`✔ Cartelera actualizada correctamente (${partidos.length} partidos)`);

  } catch (err) {
    console.error("❌ Error en scraping:", err);
    process.exit(1);
  }
})();
