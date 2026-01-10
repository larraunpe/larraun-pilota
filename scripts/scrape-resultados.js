import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

const BASE = "https://www.fnpelota.com";

const COMPETICIONES = JSON.parse(
  fs.readFileSync("data/competiciones-larraun.json", "utf8")
);

function getHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

const clean = t => (t || "").replace(/\s+/g, " ").trim();

(async () => {
  let resultados = [];

  for (const comp of COMPETICIONES) {
    const url = `${BASE}/pub/ModalidadComp.asp?idioma=eu&idCompeticion=${comp.id}`;
    const html = await getHTML(url);
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const filas = [...doc.querySelectorAll("table tr")];

    for (const fila of filas) {
      const tds = [...fila.querySelectorAll("td")];
      if (tds.length !== 5) continue;

      const fechaHora = clean(tds[0].textContent);
      if (!fechaHora.includes("/")) continue;

      const fecha = fechaHora.split(" ")[0];
      const fronton = clean(tds[1].textContent);
      const etxekoa = clean(tds[2].textContent);
      const kanpokoak = clean(tds[4].textContent);

      const emaitzaCell = tds[3];
      const tanteoa = clean(emaitzaCell.childNodes[0]?.textContent);
      const sets = [...emaitzaCell.querySelectorAll("span")]
        .map(s => clean(s.textContent.replace(/[()]/g, "")))
        .filter(Boolean);

      resultados.push({
        fecha,
        fronton,
        etxekoa,
        kanpokoak,
        tanteoa,
        sets,
        lehiaketa: comp.nombre,
        ofiziala: true,
        url
      });
    }
  }

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(
    "data/resultados-larraun.json",
    JSON.stringify(resultados, null, 2)
  );

  console.log(`✔ Oficiales detectados: ${resultados.length}`);
})();
