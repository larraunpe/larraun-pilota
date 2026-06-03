import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs/promises";

const URL = "https://www.fnpelota.com/pub/cartelera.asp?idioma=eu";

// ---------- util ----------
function getHTML(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

// ---------- frontoiak ----------
function isLekunberriOrAldatz(frontonText) {
  if (!frontonText) return false;
  const lower = frontonText.toLowerCase();
  return lower.includes("lekunberri") || lower.includes("aldatz");
}

// ---------- conversion reglas ----------
const CONVERSION = [
  {
    match: "D. Centeno - B. Esnaola",
    value: "LARRAUN – ARAXES (D. Centeno - B. Esnaola)"
  },
  {
    match: "A. Sagardui - J. Sotil",
    value: "UMORE ONA - LARRAUN (A. Sagardui - J. Sotil)"
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
    match: "U. Erro - I. Garaño",
    value: "AUÑAMENDI - LARRAUN (U. Erro - I. Garaño)"
  }
];

function convertirPareja(texto) {
  if (!texto) return "-";

  const limpio = texto.replace(/\s+/g, " ").trim();

  for (const rule of CONVERSION) {
    if (limpio.includes(rule.match)) {
      return rule.value;
    }
  }

  return limpio;
}

// Detectar si un partido es de Larraun (equipo local o visitante)
function isLarraunMatch(etxekoaRaw, kanpokoakRaw) {
  return (
    etxekoaRaw.includes("LARRAUN") ||
    kanpokoakRaw.includes("LARRAUN") ||
    CONVERSION.some(rule =>
      etxekoaRaw.includes(rule.match) || kanpokoakRaw.includes(rule.match)
    )
  );
}

// ---------- main ----------
(async () => {
  try {
    const html = await getHTML(URL);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const rows = [...document.querySelectorAll("table tr")];
    const partidos = [];

    rows.forEach(row => {
      const tds = [...row.querySelectorAll("td")];
      if (tds.length < 6) return;

      const cols = tds.map(td =>
        td.textContent.replace(/\s+/g, " ").trim()
      );

      const fecha = cols[0] || "-";
      const hora = cols[1] || "-";
      const zkia = cols[2] || "-";
      const fronton = cols[3] || "-";
      const etxekoaRaw = cols[4] || "-";
      const kanpokoakRaw = cols[5] || "-";
      const lehiaketa = cols[6] || "-";

      // 1. Detectar si es partido de LARRAUN
      const esLarraun = isLarraunMatch(etxekoaRaw, kanpokoakRaw);
      
      // 2. Detectar si se juega en Lekunberri o Aldatz
      const esLekunberriAldatz = isLekunberriOrAldatz(fronton);
      
      // 3. INCLUIR si cumple ALGUNA de las dos condiciones
      if (!esLarraun && !esLekunberriAldatz) return;

      // 4. Convertir nombres de parejas
      const etxekoa = convertirPareja(etxekoaRaw);
      const kanpokoak = convertirPareja(kanpokoakRaw);

      partidos.push({
        fecha,
        hora,
        zkia,
        fronton,
        etxekoa,
        kanpokoak,
        lehiaketa,
        larraunParteHartzen: esLarraun,  // true si participa Larraun
        kokalekua: esLekunberriAldatz ? "Lekunberri/Aldatz" : "Beste nonbait"  // para información adicional
      });
    });

    // Ordenar por fecha y hora
    partidos.sort((a, b) => {
      const dateA = new Date(`${a.fecha} ${a.hora}`);
      const dateB = new Date(`${b.fecha} ${b.hora}`);
      return dateA - dateB;
    });

    await fs.mkdir("data", { recursive: true });
    await fs.writeFile(
      "data/cartelera-larraun.json",
      JSON.stringify(partidos, null, 2)
    );

    const larraunCount = partidos.filter(p => p.larraunParteHartzen).length;
    const lekunberriAldatzCount = partidos.filter(p => p.kokalekua === "Lekunberri/Aldatz").length;
    
    console.log(`✔ Cartelera actualizada`);
    console.log(`   📊 Total partidos: ${partidos.length}`);
    console.log(`   🏠 Partidos de LARRAUN: ${larraunCount}`);
    console.log(`   📍 Partidos en Lekunberri/Aldatz: ${lekunberriAldatzCount}`);
    console.log(`   🔄 Partidos que cumplen ambas: ${partidos.filter(p => p.larraunParteHartzen && p.kokalekua === "Lekunberri/Aldatz").length}`);

  } catch (err) {
    console.error("❌ Error en scraping:", err);
    process.exit(1);
  }
})();
