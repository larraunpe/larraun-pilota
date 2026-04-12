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
    // Si es domingo, el próximo lunes es mañana
    daysUntilNextMonday = 1;
  } else {
    // Si es lunes-sábado, el próximo lunes es (8 - día actual)
    daysUntilNextMonday = 8 - currentDay;
  }
  
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilNextMonday);
  
  // El domingo es 6 días después del lunes
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);
  
  // Formatear fechas como YYYY/MM/DD
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

// ---------- Reglas de conversión (sin cambios) ----------
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

// ---------- Main ----------
async function main() {
  try {
    const { start, end, range, nextMonday, nextSunday } = getNextWeekRange();
    
    console.log(`📅 Hoy es: ${new Date().toLocaleDateString('es-ES')}`);
    console.log(`🎯 Obteniendo cartelera para la SEMANA SIGUIENTE: ${range}`);
    console.log(`   (Lunes ${nextMonday.toLocaleDateString('es-ES')} - Domingo ${nextSunday.toLocaleDateString('es-ES')})`);
    
    // Construir URL con el rango de la semana siguiente
    const url = `${BASE_URL}&selSemana=${encodeURIComponent(range)}&selClub=&selCompeticion=&excel=0`;
    
    const html = await getHTML(url);
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    const rows = [...document.querySelectorAll("table tr")];
    const partidos = [];
    
    rows.forEach(row => {
      const tds = [...row.querySelectorAll("td")];
      if (tds.length < 6) return;
      
      const cols = tds.map(td => td.textContent.replace(/\s+/g, " ").trim());
      const [fecha, hora, zkia, fronton, etxekoa, kanpokoak, lehiaketa] = cols;
      
      // Verificar si Larraun juega (local o visitante)
      const esLarraun =
        (etxekoa && (etxekoa.includes("LARRAUN") || CONVERSION.some(rule => 
          etxekoa && etxekoa.includes(rule.match)))) ||
        (kanpokoak && (kanpokoak.includes("LARRAUN") || CONVERSION.some(rule => 
          kanpokoak && kanpokoak.includes(rule.match))));
      
      if (!esLarraun) return;
      
      partidos.push({
        semana: range,
        fecha: fecha || "-",
        hora: hora || "-",
        zkia: zkia || "-",
        fronton: fronton || "-",
        etxekoa: convertirPareja(etxekoa || ""),
        kanpokoak: convertirPareja(kanpokoak || ""),
        lehiaketa: lehiaketa || "-"
      });
    });
    
    // Guardar en data/ con nombre fijo
    await fs.mkdir("data", { recursive: true });
    const filename = "data/cartelera-proxima-semana.json";
    
    const output = {
      fecha_generacion: new Date().toISOString(),
      semana: range,
      partidos: partidos,
      total_partidos: partidos.length
    };
    
    await fs.writeFile(filename, JSON.stringify(output, null, 2));
    
    console.log(`\n✅ ÉXITO: Cartelera guardada en ${filename}`);
    console.log(`📊 Total de partidos de Larraun: ${partidos.length}`);
    
    if (partidos.length === 0) {
      console.log(`⚠️  ATENCIÓN: No se encontraron partidos de Larraun para la semana ${range}`);
    } else {
      console.log(`\n📋 Resumen de partidos:`);
      partidos.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.fecha} ${p.hora} - ${p.fronton} - ${p.etxekoa} vs ${p.kanpokoak}`);
      });
    }
    
  } catch (err) {
    console.error("❌ ERROR en scraping:", err);
    process.exit(1);
  }
}

main();
