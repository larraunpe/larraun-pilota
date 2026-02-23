import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

const BASE = "https://www.fnpelota.com";
const TEMPORADA = "2025";
const ESPERA_MS = 300;

// 🔴 Ajusta si hace falta
const ID_MIN = 3059;
const ID_MAX = 3060;

// ==============================
// PAREJAS
// ==============================
const PAREJAS = JSON.parse(
  fs.readFileSync("data/parejas-mixtas.json", "utf8")
);

// ==============================
// UTILIDADES
// ==============================
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getHTML(url) {
  return new Promise((resolve, reject) => {

    const options = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept-Language": "eu-ES,eu;q=0.9,es;q=0.8",
        "Accept": "text/html"
      }
    };

    https.get(url, options, res => {

      if (res.statusCode !== 200) {
        reject(new Error("Status " + res.statusCode));
        return;
      }

      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString("latin1"));
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
  const limpio = clean(txt);

  for (const p of PAREJAS) {
    if (normalizarTexto(limpio).includes(p.match.toUpperCase()))
      return p.value;
  }

  return limpio;
}

function parseFechaEU(str) {
  const m = str.match(/(\d{4}\/\d{2}\/\d{2})/);
  if (!m) return null;

  const [y, mo, d] = m[1].split("/").map(Number);
  return new Date(y, mo - 1, d);
}

function normalizarTanteo(t) {
  if (!t) return "";

  const match = t.match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return "";

  return `${parseInt(match[1])} - ${parseInt(match[2])}`;
}

function calcularEmaitza(etx, kanpo, tanteoa) {

  const tanteo = normalizarTanteo(tanteoa);
  if (!tanteo) return "";

  const lE = contieneLarraun(etx);
  const lK = contieneLarraun(kanpo);

  if (!lE && !lK) return "";

  const [a, b] = tanteo.split(" - ").map(n => parseInt(n, 10));

  if (lE && a > b) return "irabazita";
  if (lE && a < b) return "galduta";
  if (lK && b > a) return "irabazita";
  if (lK && b < a) return "galduta";

  return "";
}

function extraerFases(doc) {

  const html = doc.documentElement.outerHTML;

  const matches = [...html.matchAll(/idFaseEliminatoria=(\d+)/g)];

  const fases = new Set();

  for (const m of matches) {
    fases.add(m[1]);
  }

  return [...fases];
}
function extraerPartidos(doc) {

  const resultados = [];

  const tabla = doc.querySelector(".table-container table.indent-bot");
  if (!tabla) return [];

  const filas = [...tabla.querySelectorAll("tr")];

  for (const fila of filas) {

    const tds = [...fila.querySelectorAll("td")];
    if (tds.length !== 5) continue;

    const fechaHora = clean(tds[0].textContent);
    if (!fechaHora.includes("/")) continue;

    const fechaObj = parseFechaEU(fechaHora);
    if (!fechaObj) continue;

    const etx = clean(tds[2].textContent);
    const kan = clean(tds[4].textContent);

    // DESCANSO
    if (normalizarTexto(etx).includes("DESCANSO") ||
        normalizarTexto(kan).includes("DESCANSO")) {

      const equipo =
        contieneLarraun(etx) ? etx :
        contieneLarraun(kan) ? kan :
        null;

      if (!equipo) continue;

      resultados.push({
        fecha: fechaObj.toISOString().slice(0, 10),
        fronton: "",
        etxekoa: convertirPareja(equipo),
        kanpokoak: "ATSEDENA",
        tanteoa: "0 - 0",
        sets: [],
        modalidad: "",
        emaitza: "",
        ofiziala: true
      });

      continue;
    }

    if (!contieneLarraun(etx) && !contieneLarraun(kan))
      continue;

    const tanteoaRaw = clean(tds[3].textContent);
    const tanteoa = normalizarTanteo(tanteoaRaw);

    // Ignorar si no hay resultado real
    if (!tanteoa) continue;

    resultados.push({
      fecha: fechaObj.toISOString().slice(0, 10),
      fronton: clean(tds[1].textContent),
      etxekoa: convertirPareja(etx),
      kanpokoak: convertirPareja(kan),
      tanteoa,
      sets: [],
      modalidad: "",
      emaitza: calcularEmaitza(etx, kan, tanteoa),
      ofiziala: true
    });
  }

  return resultados;
}

// ==============================
// MAIN
// ==============================
(async () => {

  let todos = [];
  const vistos = new Set();

  for (let id = ID_MIN; id <= ID_MAX; id++) {

    const urlBase =
      `${BASE}/pub/modalidadComp.asp?idioma=eu&idCompeticion=${id}&temp=${TEMPORADA}`;

    try {

      const htmlBase = await getHTML(urlBase);
      if (htmlBase.length < 2000) continue;

      const domBase = new JSDOM(htmlBase);
      const docBase = domBase.window.document;

      const baseRes = extraerPartidos(docBase);
      if (baseRes.length) {
        console.log("✔ Base:", id, baseRes.length);
        todos.push(...baseRes);
      }

      const fases = extraerFases(docBase);

      for (const fase of fases) {

        const urlFase =
          `${BASE}/pub/modalidadComp.asp?idioma=eu&idCompeticion=${id}&idFaseEliminatoria=${fase}&temp=${TEMPORADA}`;

        const htmlFase = await getHTML(urlFase);
        const domFase = new JSDOM(htmlFase);
        const docFase = domFase.window.document;

        const faseRes = extraerPartidos(docFase);

        if (faseRes.length) {
          console.log("✔ Fase:", id, fase, faseRes.length);
          todos.push(...faseRes);
        }

        await sleep(ESPERA_MS);
      }

    } catch (err) {
      console.log("Error ID", id);
    }

    await sleep(ESPERA_MS);
  }

  // eliminar duplicados mejorado
  const finales = todos.filter(r => {
    const clave = `${r.fecha}-${r.etxekoa}-${r.kanpokoak}-${r.tanteoa}`;
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
