import fs from "fs";
import { JSDOM } from "jsdom";

/* =========================
   CONFIGURACIÓN
========================= */

const URLS = [
  // Puedes añadir más competiciones si quieres
  "https://www.fnpelota.com/pub/ModalidadComp.asp?idioma=ca&idCompeticion=3060"
];

const OUTPUT_FILE = "data/resultados-larraun.json";

/* =========================
   UTILIDADES FECHA
========================= */

function parseFecha(str) {
  const [d, m, y] = str.split("/").map(Number);
  return new Date(y, m - 1, d);
}

function estaEnSemanaActualOAnterior(fecha) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const inicioSemanaActual = new Date(hoy);
  inicioSemanaActual.setDate(hoy.getDate() - hoy.getDay() + 1);

  const inicioSemanaAnterior = new Date(inicioSemanaActual);
  inicioSemanaAnterior.setDate(inicioSemanaActual.getDate() - 7);

  return fecha >= inicioSemanaAnterior;
}

/* =========================
   SCRAPER PRINCIPAL
========================= */

async function scrape() {
  const resultados = [];

  for (const url of URLS) {
    console.log("🔎 Analizando:", url);

    const html = await fetch(url).then(r => r.text());
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const filas = Array.from(document.querySelectorAll("tr"));

    for (let i = 0; i < filas.length; i++) {
      const tr = filas[i];
      const texto = tr.textContent.replace(/\s+/g, " ").toUpperCase();

      if (!texto.includes("LARRAUN")) continue;

      // ── RESULTADO ─────────────────────────────
      const resultadoMatch = texto.match(/(\d+)\s*-\s*(\d+)/);
      if (!resultadoMatch) continue;

      const resultado = `${resultadoMatch[1]}-${resultadoMatch[2]}`;

      // ── SETS ─────────────────────────────────
      const sets = [];
      const setRegex = /\((\d+\s*-\s*\d+)\)/g;
      let m;
      while ((m = setRegex.exec(tr.textContent)) !== null) {
        sets.push(m[1].replace(/\s*/g, ""));
      }

      // ── FECHA (buscar hacia arriba) ──────────
      let fechaTexto = null;
      let k = i;
      while (k >= 0 && !fechaTexto) {
        const t = filas[k].textContent;
        const fm = t.match(/\d{2}\/\d{2}\/\d{4}/);
        if (fm) fechaTexto = fm[0];
        k--;
      }

      if (!fechaTexto) continue;

      const fecha = parseFecha(fechaTexto);
      if (!estaEnSemanaActualOAnterior(fecha)) continue;

      // ── FRONTÓN ──────────────────────────────
      let fronton = "Desconocido";
      const frontonMatch = tr.textContent.match(/Lekunberri[^0-9\n]*/i);
      if (frontonMatch) fronton = frontonMatch[0].trim();

      resultados.push({
        fecha: fechaTexto,
        resultado,
        sets,
        fronton,
        url
      });

      console.log(`✔ Resultado encontrado ${fechaTexto} → ${resultado}`);
    }
  }

  guardarResultados(resultados);
}

/* =========================
   GUARDAR JSON
========================= */

function guardarResultados(nuevos) {
  let existentes = [];

  if (fs.existsSync(OUTPUT_FILE)) {
    existentes = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
  }

  const mapa = new Map();
  [...existentes, ...nuevos].forEach(r => {
    mapa.set(`${r.fecha}-${r.resultado}-${r.fronton}`, r);
  });

  const finales = Array.from(mapa.values()).sort(
    (a, b) => parseFecha(b.fecha) - parseFecha(a.fecha)
  );

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finales, null, 2), "utf8");
  console.log(`💾 Guardados ${finales.length} resultados`);
}

/* =========================
   EJECUCIÓN
========================= */

scrape().catch(err => {
  console.error("❌ Error en scraper:", err);
  process.exit(1);
});
