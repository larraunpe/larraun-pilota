import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

const BASE = "https://www.fnpelota.com";
const TEMPORADA = "2025";
const ESPERA_MS = 300;

const ID_MIN = 3059;
const ID_MAX = 3060;

const PAREJAS = JSON.parse(
  fs.readFileSync("data/parejas-mixtas.json", "utf8")
);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function getHTML(url) {
  return new Promise((resolve, reject) => {

    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0",
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

function limpiarNombre(txt = "") {
  const limpio = clean(txt);
  const partes = limpio.split(")");
  return partes.length > 1 ? partes[0] + ")" : limpio;
}

function contieneLarraun(txt = "") {
  const upper = normalizarTexto(txt);
  if (upper.includes("LARRAUN")) return true;

  return PAREJAS.some(p =>
    upper.includes(p.match.toUpperCase())
  );
}

function convertirPareja(txt) {
  const limpio = limpiarNombre(txt);

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

/* =========================
   EXTRAER FASES
========================= */

function extraerFases(doc) {

  const select = doc.querySelector("select[name='idFaseEliminatoria']");
  if (!select) return [];

  return [...select.querySelectorAll("option")]
    .map(o => o.value)
    .filter(v => v && v !== "0");
}

/* =========================
   MODALIDAD CORRECTA
========================= */

function extraerModalidad(doc) {

  const select = doc.querySelector("select[name='idModalidad']");
  if (!select) return "";

  const seleccionada =
    select.querySelector("option[selected]") ||
    select.querySelector("option:checked") ||
    select.querySelector("option");

  return seleccionada ? clean(seleccionada.textContent) : "";
}

function extraerFaseTexto(doc) {

  const select = doc.querySelector("select[name='idFaseEliminatoria']");
  if (!select) return "LIGA";

  const seleccionada =
    select.querySelector("option[selected]") ||
    select.querySelector("option:checked");

  return seleccionada
    ? clean(seleccionada.textContent)
    : "LIGA";
}

/* =========================
   EXTRAER PARTIDOS
========================= */

function extraerPartidos(doc, modalidad, faseTexto) {

  const resultados = [];

  // Buscar TODAS las tablas
  const tablas = [...doc.querySelectorAll("table")];

  let tablaPartidos = null;

  for (const tabla of tablas) {
    if (tabla.textContent.includes("/") &&
        tabla.textContent.includes("-")) {
      tablaPartidos = tabla;
      break;
    }
  }

  if (!tablaPartidos) return [];

  const filas = [...tablaPartidos.querySelectorAll("tr")];

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
      fase: faseTexto,
      emaitza: calcularEmaitza(etx, kan, tanteoa),
      ofiziala: true
    });
  }

  return resultados;
}

/* =========================
   MAIN
========================= */

(async () => {

  let todos = [];
  const vistos = new Set();

  for (let id = ID_MIN; id <= ID_MAX; id++) {

    const urlBase =
      `${BASE}/pub/modalidadComp.asp?idioma=eu&idCompeticion=${id}&temp=${TEMPORADA}`;

    try {

      const htmlBase = await getHTML(urlBase);
      if (htmlBase.length < 2000) continue;

      const docBase = new JSDOM(htmlBase).window.document;

      const fases = extraerFases(docBase);

      // 🔥 CASO 1: Hay fases
      if (fases.length > 0) {

        for (const fase of fases) {

          const urlFase =
            `${BASE}/pub/modalidadComp.asp?idioma=eu&idCompeticion=${id}&idFaseEliminatoria=${fase}&temp=${TEMPORADA}`;

          const htmlFase = await getHTML(urlFase);
          const docFase = new JSDOM(htmlFase).window.document;

          const modalidad = extraerModalidad(docFase);
          const faseTexto = extraerFaseTexto(docFase);

          const faseRes =
            extraerPartidos(docFase, modalidad, faseTexto);

          todos.push(...faseRes);

          await sleep(ESPERA_MS);
        }

      } else {
        // 🔥 CASO 2: No hay fases → procesar base

        const modalidad = extraerModalidad(docBase);
        const faseTexto = "LIGA";

        const baseRes =
          extraerPartidos(docBase, modalidad, faseTexto);

        todos.push(...baseRes);
      }

    } catch (err) {
      console.log("Error ID", id);
    }

    await sleep(ESPERA_MS);
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
