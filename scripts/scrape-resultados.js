import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

const BASE = "https://www.fnpelota.com";
const TEMPORADA = "2025";
const ESPERA_MS = 300;

const ID_MIN = 3059;
const ID_MAX = 3060;

const FASE_MIN = 20613;
const FASE_MAX = 20616;

const PAREJAS = JSON.parse(
  fs.readFileSync("data/parejas-mixtas.json", "utf8")
);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getHTML(url) {
  return new Promise((resolve, reject) => {

    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "eu-ES,eu;q=0.9,es;q=0.8"
      }
    }, res => {

      if (res.statusCode !== 200)
        return reject(new Error("Status " + res.statusCode));

      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        resolve(Buffer.concat(chunks).toString("latin1"));
      });

    }).on("error", reject);
  });
}

const clean = t => (t || "").replace(/\s+/g, " ").trim();

function normalizarTexto(t = "") {
  return clean(t).toUpperCase();
}

function contieneLarraun(txt = "") {
  const upper = normalizarTexto(txt);
  if (upper.includes("LARRAUN")) return true;

  return PAREJAS.some(p =>
    upper.includes(p.match.toUpperCase())
  );
}

function convertirPareja(txt) {
  for (const p of PAREJAS) {
    if (normalizarTexto(txt).includes(p.match.toUpperCase()))
      return p.value;
  }
  return clean(txt);
}

function parseFechaEU(str) {
  const m = str.match(/(\d{4}\/\d{2}\/\d{2})/);
  if (!m) return null;

  const [y, mo, d] = m[1].split("/").map(Number);
  return new Date(y, mo - 1, d);
}

function calcularEmaitza(etx, kanpo, tanteoa) {

  const lE = contieneLarraun(etx);
  const lK = contieneLarraun(kanpo);
  if (!lE && !lK) return "";

  const [a, b] = tanteoa.split(" - ").map(n => parseInt(n, 10));

  if (lE && a > b) return "irabazita";
  if (lE && a < b) return "galduta";
  if (lK && b > a) return "irabazita";
  if (lK && b < a) return "galduta";

  return "";
}

function extraerModalidad(doc) {
  const titulo = doc.querySelector(".titulo");
  return titulo ? clean(titulo.textContent) : "";
}

function extraerFaseTexto(doc) {
  const select = doc.querySelector("select[name='idFaseEliminatoria']");
  if (!select) return "";

  const selected =
    select.querySelector("option[selected]") ||
    select.querySelector("option:checked");

  return selected ? clean(selected.textContent) : "";
}

function extraerPartidos(doc, modalidad, fase, url) {

  const resultados = [];
  const tablas = [...doc.querySelectorAll("table")];

  for (const tabla of tablas) {

    const filas = [...tabla.querySelectorAll("tr")];

    for (const fila of filas) {

      const tds = [...fila.querySelectorAll("td")];
      if (tds.length < 5) continue;

      const fechaHora = clean(tds[0].textContent);
      if (!fechaHora.match(/\d{4}\/\d{2}\/\d{2}/)) continue;

      const fechaObj = parseFechaEU(fechaHora);
      if (!fechaObj) continue;

      const etx = clean(tds[2].textContent);
      const kan = clean(tds[4].textContent);

      if (!contieneLarraun(etx) && !contieneLarraun(kan))
        continue;

      const tanteoCell = tds[3].textContent;
      const tanteoMatch = tanteoCell.match(/(\d+)\s*-\s*(\d+)/);
      if (!tanteoMatch) continue;

      const tanteoa =
        `${parseInt(tanteoMatch[1])} - ${parseInt(tanteoMatch[2])}`;

      const setsMatches =
        [...tanteoCell.matchAll(/\((\d+)\s*-\s*(\d+)\)/g)];

      const sets = setsMatches.map(s =>
        `${parseInt(s[1])} - ${parseInt(s[2])}`
      );

      resultados.push({
        fecha: fechaObj.toISOString().slice(0, 10),
        fronton: clean(tds[1].textContent),
        etxekoa: convertirPareja(etx),
        kanpokoak: convertirPareja(kan),
        tanteoa,
        sets,
        modalidad,
        fase,
        url,
        emaitza: calcularEmaitza(etx, kan, tanteoa),
        ofiziala: true
      });
    }
  }

  return resultados;
}

(async () => {

  let todos = [];
  const vistos = new Set();

  for (let id = ID_MIN; id <= ID_MAX; id++) {

    // 🔵 LIGA
    const urlLiga =
      `${BASE}/pub/modalidadComp.asp?idioma=eu&idCompeticion=${id}&temp=${TEMPORADA}`;

    try {

      const htmlLiga = await getHTML(urlLiga);
      const docLiga = new JSDOM(htmlLiga).window.document;

      const modalidad = extraerModalidad(docLiga);
      const fase = "LIGAXKA";

      todos.push(
        ...extraerPartidos(docLiga, modalidad, fase, urlLiga)
      );

    } catch {}

    await sleep(ESPERA_MS);

    // 🔴 FASES FINALES
    for (let f = FASE_MIN; f <= FASE_MAX; f++) {

      const urlFase =
        `${BASE}/pub/modalidadComp.asp?idioma=eu&idCompeticion=${id}&idFaseEliminatoria=${f}&temp=${TEMPORADA}`;

      try {

        const htmlFase = await getHTML(urlFase);
        if (htmlFase.length < 2000) continue;

        const docFase = new JSDOM(htmlFase).window.document;

        const modalidad = extraerModalidad(docFase);
        const fase = extraerFaseTexto(docFase);

        todos.push(
          ...extraerPartidos(docFase, modalidad, fase, urlFase)
        );

      } catch {}

      await sleep(ESPERA_MS);
    }
  }

  const finales = todos.filter(r => {
    const clave =
      `${r.fecha}-${r.etxekoa}-${r.kanpokoak}-${r.tanteoa}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });

  fs.mkdirSync("data", { recursive: true });

  fs.writeFileSync(
    "data/resultados-larraun.json",
    JSON.stringify(finales, null, 2)
  );

  console.log("🏁 TOTAL:", finales.length);

})();
