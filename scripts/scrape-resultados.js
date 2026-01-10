import https from "https";
import fs from "fs";
import { JSDOM } from "jsdom";

const BASE = "https://www.fnpelota.com";
const INDEX =
  "https://www.fnpelota.com/pub/competicion.asp?idioma=eu";

const MIXTAS = JSON.parse(
  fs.readFileSync("data/parejas-mixtas.json", "utf8")
);

// ---------------- HELPERS ----------------
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
  const l1 = contieneLarraun(local);
  const l2 = contieneLarraun(visitante);

  if (l1 && l2) return "irabazita";

  const m = resultado.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return "irabazita";

  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);

  if ((l1 && a > b) || (l2 && b > a)) return "irabazita";
  return "galduta";
}

function fechaValida(fecha) {
  const [d, m, y] = fecha.split("/").map(Number);
  const f = new Date(y, m - 1, d);
  const hoy = new Date();

  const inicio = new Date(hoy);
  inicio.setDate(hoy.getDate() - hoy.getDay() - 7);

  return f >= inicio && f <= hoy;
}

// ---------------- SCRAPER ----------------
async function scrapeCompeticion(url, nombre) {
  const html = await getHTML(url);
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const resultados = [];

  const filas = [...doc.querySelectorAll("table tr")];

  for (const fila of filas) {
    const textoFila = clean(fila.textContent);

    // Solo filas con resultado tipo 1 - 2
    if (!/\d+\s*-\s*\d+/.test(textoFila)) continue;

    const tds = [...fila.querySelectorAll("td")];
    if (tds.length < 4) continue;

    const fechaTxt = clean(tds[0].textContent);
    if (!fechaTxt.includes("/")) continue;
    if (!fechaValida(fechaTxt)) continue;

    const fronton = clean(tds[1].textContent);

    // Buscar resultado y sets
    const resultadoCell = tds.find(td =>
      /\d+\s*-\s*\d+/.test(td.textContent)
    );

    if (!resultadoCell) continue;

    const resultadoTxt = clean(resultadoCell.textContent);
    const tanteoa = resultadoTxt.match(/\d+\s*-\s*\d+/)?.[0] || "";

    const sets =
      resultadoTxt.match(/\(\d+-\d+\)/g)?.map(s =>
        s.replace(/[()]/g, "")
      ) || [];

    // Local = celda antes del resultado
    const idx = tds.indexOf(resultadoCell);
    const localRaw = clean(tds[idx - 1]?.textContent || "");
    const visitanteRaw = clean(tds[idx + 1]?.textContent || "");

    if (
      !contieneLarraun(localRaw) &&
      !contieneLarraun(visitanteRaw)
    )
      continue;

    const local = convertirPareja(localRaw);
    const visitante = convertirPareja(visitanteRaw);

    resultados.push({
      fecha: fechaTxt,
      fronton,
      etxekoa: local,
      kanpokoak: visitante,
      tanteoa,
      sets,
      lehiaketa: nombre,
      emaitza: calcularEmaitza(local, visitante, tanteoa),
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
      } catch (err) {
        console.error("⚠️ Error en", e.url);
      }
    }

    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(
      "data/resultados-larraun.json",
      JSON.stringify(total, null, 2)
    );

    console.log(`✔ Oficiales detectados: ${total.length}`);
  } catch (err) {
    console.error("❌ Error global:", err);
    process.exit(1);
  }
})();
