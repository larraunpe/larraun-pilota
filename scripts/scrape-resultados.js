import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs";

const BASE = "https://www.fnpelota.com";
const TEMPORADA = "2025";
const ESPERA_MS = 300;

// 🔴 AJUSTA ESTE RANGO si hace falta
const ID_MIN = 3000;
const ID_MAX = 3200;

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
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
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

function contieneLarraun(txt = "") {
  const upper = txt.toUpperCase();
  if (upper.includes("LARRAUN")) return true;
  return PAREJAS.some(p => upper.includes(p.match.toUpperCase()));
}

function convertirPareja(txt) {
  const limpio = clean(txt);
  for (const p of PAREJAS) {
    if (limpio.includes(p.match)) return p.value;
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
  if (!tanteoa || !tanteoa.includes("-")) return "";

  const lE = contieneLarraun(etx);
  const lK = contieneLarraun(kanpo);

  const [a, b] = tanteoa.split("-").map(n => parseInt(n, 10));
  if (isNaN(a) || isNaN(b)) return "";

  if ((lE && a > b) || (lK && b > a)) return "irabazita";
  return "galduta";
}

function extraerFases(doc) {
  const enlaces = [...doc.querySelectorAll("a[href*='idFaseEliminatoria']")];
  const fases = new Set();

  for (const a of enlaces) {
    const href = a.getAttribute("href");
    const match = href.match(/idFaseEliminatoria=(\d+)/);
    if (match) fases.add(match[1]);
  }

  return [...fases];
}

function extraerPartidos(doc, url) {

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
    if (etx.toUpperCase().includes("DESCANSO") ||
        kan.toUpperCase().includes("DESCANSO")) {

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
        ofiziala: true,
        url
      });

      continue;
    }

    if (!contieneLarraun(etx) && !contieneLarraun(kan))
      continue;

    const tanteoa = clean(tds[3].childNodes[0]?.textContent);

    resultados.push({
      fecha: fechaObj.toISOString().slice(0, 10),
      fronton: clean(tds[1].textContent),
      etxekoa: convertirPareja(etx),
      kanpokoak: convertirPareja(kan),
      tanteoa,
      sets: [],
      modalidad: "",
      emaitza: calcularEmaitza(etx, kan, tanteoa),
      ofiziala: true,
      url
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

      console.log("Checking ID:", id, "HTML size:", htmlBase.length);

      if (htmlBase.length < 2000) continue;

      const domBase = new JSDOM(htmlBase);
      const docBase = domBase.window.document;

      const baseRes = extraerPartidos(docBase, urlBase);
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

        const faseRes = extraerPartidos(docFase, urlFase);

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

  // eliminar duplicados
  const finales = todos.filter(r => {
    const clave = `${r.fecha}-${r.etxekoa}-${r.kanpokoak}-${r.url}`;
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
