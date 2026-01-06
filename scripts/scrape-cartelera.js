import { JSDOM } from "jsdom";
import fs from "fs";

const URL = "https://www.fnpelota.com/pub/cartelera.asp?idioma=eu";

const CONVERSION = {
  "LARRAUN (D. Centeno - B. Esnaola)": "LARRAUN – ARAXES",
  "ABAXITABIDEA (X. Goldaracena - E. Astibia)": "LARRAUN – ABAXITABIDEA",
  "LARRAUN (A. Balda - U. Arcelus)": "LARRAUN – OBERENA",
  "LARRAUN (M. Goikoetxea - G. Uitzi)": "LARRAUN – ARAXES"
};

(async () => {
  const html = await fetch(URL).then(r => r.text());
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const rows = [...document.querySelectorAll("table tr")];
  const partidos = [];

  rows.forEach(row => {
    const tds = row.querySelectorAll("td");
    if (tds.length < 6) return;

    const texto = row.textContent;
    if (!texto.includes("LARRAUN")) return;

    let pareja = tds[4].innerText.trim();
    pareja = CONVERSION[pareja] || pareja;

    partidos.push({
      fecha: tds[0].innerText.trim(),
      hora: tds[1].innerText.trim(),
      fronton: tds[3].innerText.trim(),
      pareja,
      competicion: tds[6]?.innerText.trim() || ""
    });
  });

  fs.writeFileSync(
    "data/cartelera-larraun.json",
    JSON.stringify(partidos, null, 2)
  );
})();
