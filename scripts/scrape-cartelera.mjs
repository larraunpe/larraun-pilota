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
// Bilatu "Lekunberri" edo "Aldatz" frontoiaren izenean (case insensitive)
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
    match: "M. Goikoetxea - G. Uitzi",
    value: "LARRAUN – ARAXES (M. Goikoetxea - G. Uitzi)"
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
function isLarraunMatch(etxekoa, kanpokoak) {
  return (
    etxekoa.includes("LARRAUN") ||
    kanpokoak.includes("LARRAUN") ||
    CONVERSION.some(rule =>
      etxekoa.includes(rule.match) || kanpokoak.includes(rule.match)
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

      // 1. Iragazi: soilik Lekunberri edo Aldatzeko partiduak
      if (!isLekunberriOrAldatz(fronton)) return;

      // 2. Bihurtu pareen izenak (CONVERSION arauekin)
      const etxekoa = convertirPareja(etxekoaRaw);
      const kanpokoak = convertirPareja(kanpokoakRaw);

      // 3. Markatu Larraunek parte hartzen duen (HTMLn nabarmendu ahal izateko)
      const esLarraun = isLarraunMatch(etxekoaRaw, kanpokoakRaw);

      partidos.push({
        fecha,
        hora,
        zkia,
        fronton,
        etxekoa,
        kanpokoak,
        lehiaketa,
        larraunParteHartzen: esLarraun   // ← bandera nabarmena
      });
    });

    // Ordenatu data eta orduaren arabera (global)
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
    console.log(`✔ Cartelera actualizada (${partidos.length} partidos totales, ${larraunCount} con participación de Larraun)`);

  } catch (err) {
    console.error("❌ Error en scraping:", err);
    process.exit(1);
  }
})();
