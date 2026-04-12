import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs/promises";

// ---------- Configuración ----------
const BASE_URL = "https://www.fnpelota.com/pub/cartelera.asp?idioma=eu";

// ---------- Calcular la semana siguiente (LUNES a DOMINGO) ----------
function getNextWeekRange() {
  const today = new Date();
  
  // Obtener el día de la semana (0 = domingo, 1 = lunes, ..., 6 = sábado)
  let currentDay = today.getDay();
  
  // Calcular el próximo lunes
  let daysUntilNextMonday;
  if (currentDay === 0) {
    daysUntilNextMonday = 1;
  } else {
    daysUntilNextMonday = 8 - currentDay;
  }
  
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilNextMonday);
  
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);
  
  const formatYMD = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };
  
  const start = formatYMD(nextMonday);
  const end = formatYMD(nextSunday);
  const range = `${start} - ${end}`;
  
  return { start, end, range, nextMonday, nextSunday };
}

// ---------- Utilidades ----------
function getHTML(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

// ---------- Reglas de conversión de parejas ----------
const CONVERSION = [
  { match: "D. Centeno - B. Esnaola", value: "LARRAUN – ARAXES (D. Centeno - B. Esnaola)" },
  { match: "A. Eguzkiza - L. Navarro", value: "LARRAUN (L. Navarro - M. Lazkoz)" },
  { match: "X. Goldaracena - E. Astibia", value: "LARRAUN – ABAXITABIDEA (X. Goldaracena - E. Astibia)" },
  { match: "A. Balda - U. Arcelus", value: "LARRAUN – OBERENA (A. Balda - U. Arcelus)" },
  { match: "M. Goikoetxea - G. Uitzi", value: "LARRAUN – ARAXES (M. Goikoetxea - G. Uitzi)" }
];

function convertirPareja(texto) {
  if (!texto) return "-";
  const limpio = texto.replace(/\s+/g, " ").trim();
  for (const rule of CONVERSION) {
    if (limpio.includes(rule.match)) return rule.value;
  }
  return limpio;
}

// ---------- Extraer partidos de la tabla CORRECTAMENTE ----------
function extractPartidosFromHTML(html, targetWeekRange) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  // Buscar todas las tablas
  const tables = document.querySelectorAll("table");
  let partidosTable = null;
  
  // Encontrar la tabla que contiene la cartelera (suele ser la primera con border=1)
  for (const table of tables) {
    if (table.getAttribute("border") === "1") {
      partidosTable = table;
      break;
    }
  }
  
  if (!partidosTable) {
    console.log("⚠️  No se encontró la tabla de partidos");
    return [];
  }
  
  const rows = [...partidosTable.querySelectorAll("tr")];
  const partidos = [];
  
  // Extraer el rango de fechas objetivo (para filtrar)
  const [targetStart, targetEnd] = targetWeekRange.split(" - ");
  
  rows.forEach(row => {
    const tds = [...row.querySelectorAll("td")];
    if (tds.length < 6) return;
    
    const cols = tds.map(td => td.textContent.replace(/\s+/g, " ").trim());
    const [fecha, hora, zkia, fronton, etxekoa, kanpokoak, lehiaketa] = cols;
    
    // Verificar si la fecha está dentro de la semana objetivo
    if (fecha && fecha.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
      if (fecha < targetStart || fecha > targetEnd) {
        return; // Saltar partidos fuera de la semana
      }
    } else {
      return; // Si no hay fecha válida, saltar
    }
    
    // Verificar si Larraun juega (local o visitante)
    const esLarraunLocal = etxekoa && (
      etxekoa.includes("LARRAUN") || 
      CONVERSION.some(rule => etxekoa.includes(rule.match))
    );
    
    const esLarraunVisitante = kanpokoak && (
      kanpokoak.includes("LARRAUN") || 
      CONVERSION.some(rule => kanpokoak.includes(rule.match))
    );
    
    if (!esLarraunLocal && !esLarraunVisitante) return;
    
    partidos.push({
      semana: targetWeekRange,
      fecha: fecha,
      hora: hora || "-",
      zkia: zkia || "-",
      fronton: fronton || "-",
      etxekoa: convertirPareja(etxekoa || ""),
      kanpokoak: convertirPareja(kanpokoak || ""),
      lehiaketa: lehiaketa || "-"
    });
  });
  
  return partidos;
}

// ---------- Obtener opciones del selector de semanas ----------
function getWeekOptions(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const select = document.querySelector("select[name='selSemana']");
  
  if (!select) {
    return [];
  }
  
  const options = [];
  const optionElements = select.querySelectorAll("option");
  
  optionElements.forEach(opt => {
    const value = opt.getAttribute("value");
    const text = opt.textContent.trim();
    if (value && value !== "fechaInicial" && value !== "") {
      options.push({ value, text });
    }
  });
  
  return options;
}

// ---------- Main ----------
async function main() {
  try {
    const { start, end, range, nextMonday, nextSunday } = getNextWeekRange();
    
    console.log(`📅 Hoy es: ${new Date().toLocaleDateString('es-ES')}`);
    console.log(`🎯 Buscando partidos para la SEMANA SIGUIENTE: ${range}`);
    console.log(`   (Lunes ${nextMonday.toLocaleDateString('es-ES')} - Domingo ${nextSunday.toLocaleDateString('es-ES')})`);
    
    // Obtener la página con la semana seleccionada
    const url = `${BASE_URL}&selSemana=${encodeURIComponent(range)}&selClub=&selCompeticion=&excel=0`;
    console.log(`\n🌐 Solicitando: ${url}`);
    
    const html = await getHTML(url);
    
    // Extraer partidos de la tabla
    const partidos = extractPartidosFromHTML(html, range);
    
    // Guardar en data/
    await fs.mkdir("data", { recursive: true });
    const filename = "data/cartelera-proxima-semana.json";
    
    const output = {
      fecha_generacion: new Date().toISOString(),
      semana_solicitada: range,
      total_partidos: partidos.length,
      partidos: partidos
    };
    
    await fs.writeFile(filename, JSON.stringify(output, null, 2));
    
    console.log(`\n✅ Archivo guardado: ${filename}`);
    console.log(`📊 Total de partidos de Larraun: ${partidos.length}`);
    
    if (partidos.length === 0) {
      console.log(`\n⚠️  No se encontraron partidos de Larraun para la semana ${range}`);
    } else {
      console.log(`\n📋 Partidos encontrados:`);
      partidos.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.fecha} ${p.hora} - ${p.fronton}`);
        console.log(`     ${p.etxekoa} vs ${p.kanpokoak}`);
        console.log(`     (${p.lehiaketa})`);
      });
    }
    
  } catch (err) {
    console.error("❌ ERROR en scraping:", err);
    process.exit(1);
  }
}

main();
