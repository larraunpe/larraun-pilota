import https from "https";
import fs from "fs";
import { JSDOM } from "jsdom";

const BASE = "https://www.fnpelota.com";
const INDEX =
  "https://www.fnpelota.com/pub/competicion.asp?idioma=eu";

const MIXTAS = JSON.parse(
  fs.readFileSync("data/parejas-mixtas.json", "utf8")
);

// ---------------- UTILIDADES ----------------
function getHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", d => (data += d));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

const clean = t => t.replace(/\s+/g, " ").trim();

function convertirPareja(txt) {
  const t = clean(txt);
  for (const m of MIXTAS) {
    if (t.includes(m.match)) return m.value;
  }
  return t;
}

function contieneLarraun(txt = "") {
  if (txt.includes("LARRAUN")) return true;
  return MIXTAS.some(m => txt.includes(m.match));
}

function calcularEmaitza(local, visitante, resultado) {
  const lLocal = contieneLarraun(local);
  const lVis = contieneLarraun(visitante);

  if (lLocal && lVis) return "irabazita";

  if (!resultado.includes("-")) return "irabazita";

  const [a, b] = resultado.split("-").map(n => parseInt(n));
  if (isNaN(a) || isNaN(b)) return "irabazita";

  if ((lLocal && a > b) || (lVis && b > a)) return "irabazita";
  return "galduta";
}

// rango: semana actual + anterior
function fechaValida(fecha) {
  const [d, m, y] = fecha.split("/").map(Number);
  const f = new Date(y, m - 1, d);
  const hoy = new Date();

  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - hoy.getDay() - 7);

  return f >= inicioSemana && f <= hoy;
}

// ---------------- SCRAPE COMPETICIÓN ----------------
async function scrapeCompeticion(url, nombre) {
  const html = await getHTML(url);
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const filas = [...doc.querySelectorAll("table tr")];
  const resultados = [];

  for (const fila of filas) {
    const tds = [...fila.querySelectorAll("td")];
    if (tds.length < 4) continue;

    const fechaTxt = clean(tds[0].textContent);
    if (!fechaTxt.includes("/")) continue;
    if (!fechaValida(fechaTxt)) continue;

    const fronton = clean(tds[1]?.textContent || "");

    const localRaw = clean(tds[2]?.textContent || "");
    const visitanteRaw = clean(tds[4]?.textContent || "");

    if (!localRaw || !visitanteRaw) continue;

    if (
      !contieneLarraun(localRaw) &&
      !contieneLarraun(visitanteRaw)
    )
      continue;

    const resultadoTxt = clean(tds[3]?.textContent || "");

    const sets = resultadoTxt
      .match(/\((\d+-\d+)\)/g)
      ?.map(s => s.replace(/[()]/g, ""));

    const tanteo = resultadoTxt.match(/\d+\s*-\s*\d+/)?.[0] || "";

    const local = convertirPareja(localRaw);
    const visitante = convertirPareja(visitanteRaw);

    resultados.push({
      fecha: fechaTxt,
      fronton,
      etxekoa: local,
      kanpokoak: visitante,
      tanteoa: tanteo,
      sets,
      lehiaketa: nombre,
      emaitza: calcularEmaitza(local, visitante, tanteo),
      ofiziala: true,
      url
    });
  }

  return resultados;
}

// ---------------- MAIN ----------------
(async () => {
  try {
    const html = await getHTML(INDEX);
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const enlaces = [...doc.querySelectorAll("a")]
      .filter(a => a.href.includes("ModalidadComp.asp"))
      .map(a => ({
        url: BASE + a.getAttribute("href"),
        nombre: clean(a.textContent)
      }));

    let total = [];

    for (const e of enlaces) {
      try {
        const r = await scrapeCompeticion(e.url, e.nombre);
        total.push(...r);
      } catch {}
    }

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(
      "data/resultados-larraun.json",
      JSON.stringify(total, null, 2)
    );

    console.log(`✔ Oficiales detectados: ${total.length}`);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
})();
