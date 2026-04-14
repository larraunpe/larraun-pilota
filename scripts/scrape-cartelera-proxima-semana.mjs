import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs/promises";

// ---------- Configuración ----------
const BASE_URL = "https://www.fnpelota.com/pub/cartelera.asp";

// ---------- Calcular el número de semana (ISO 8601) ----------
function getWeekNumber(date) {
  // Copia la fecha para no modificar la original
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Jueves de la misma semana
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

function getNextWeekNumber() {
  const today = new Date();
  
  // Calcular el próximo lunes
  let currentDay = today.getDay();
  let daysUntilNextMonday = currentDay === 0 ? 1 : 8 - currentDay;
  
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilNextMonday);
  
  // Obtener el número de semana del próximo lunes
  const weekNumber = getWeekNumber(nextMonday);
  
  // Calcular las fechas para mostrar (opcional)
  const nextSunday = new Date(nextMonday);
  nextSunday.setDate(nextMonday.getDate() + 6);
  
  const formatYMD = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };
  
  return {
    weekNumber: weekNumber,
    startDate: formatYMD(nextMonday),
    endDate: formatYMD(nextSunday),
    range: `${formatYMD(nextMonday)} - ${formatYMD(nextSunday)}`
  };
}

// ---------- Petición POST ----------
function postFormData(params) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams(params).toString();
    
    const options = {
      hostname: 'www.fnpelota.com',
      path: '/pub/cartelera.asp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.fnpelota.com',
        'Referer': 'https://www.fnpelota.com/pub/cartelera.asp?idioma=eu'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve(data));
    });
    
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

// ---------- Reglas de conversión ----------
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

// ---------- Extraer partidos ----------
function extractPartidosFromHTML(html, weekInfo) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  // Buscar la tabla de partidos
  const tables = document.querySelectorAll("table");
  let partidosTable = null;
  
  for (const table of tables) {
    const rows = table.querySelectorAll("tr");
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 6) {
        const firstCell = cells[0].textContent.trim();
        if (firstCell.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
          partidosTable = table;
          break;
        }
      }
    }
    if (partidosTable) break;
  }
  
  if (!partidosTable) {
    console.log("⚠️ No se encontró tabla de partidos");
    return [];
  }
  
  const rows = [...partidosTable.querySelectorAll("tr")];
  const partidos = [];
  
  rows.forEach(row => {
    const tds = [...row.querySelectorAll("td")];
    if (tds.length < 6) return;
    
    const cols = tds.map(td => td.textContent.replace(/\s+/g, " ").trim());
    const [fecha, hora, zkia, fronton, etxekoa, kanpokoak, lehiaketa] = cols;
    
    if (!fecha || !fecha.match(/^\d{4}\/\d{2}\/\d{2}$/)) return;
    
    // Filtrar por rango de fechas
    if (fecha < weekInfo.startDate || fecha > weekInfo.endDate) return;
    
    const textoCompleto = `${etxekoa || ""} ${kanpokoak || ""}`.toUpperCase();
    if (!textoCompleto.includes("LARRAUN")) return;
    
    partidos.push({
      semana: weekInfo.range,
      semana_numero: weekInfo.weekNumber,
      fecha, 
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

// ---------- Main ----------
async function main() {
  try {
    const weekInfo = getNextWeekNumber();
    
    console.log(`📅 Hoy es: ${new Date().toLocaleDateString('es-ES')}`);
    console.log(`🎯 Semana siguiente: #${weekInfo.weekNumber}`);
    console.log(`   Fechas: ${weekInfo.range}`);
    
    // Parámetros del formulario (usando el número de semana)
    const formParams = {
      idioma: 'eu',
      Semana: [weekInfo.weekNumber.toString(), ''],
      seCompoction: ['0', ''],
      seClub: ['0', ''],
      rbOrden: '1'
    };
    
    console.log(`\n📤 Enviando petición POST...`);
    console.log(`   Parámetros: Semana=${weekInfo.weekNumber}`);
    
    const html = await postFormData(formParams);
    console.log(`📄 HTML recibido: ${html.length} caracteres`);
    
    // Extraer partidos
    const partidos = extractPartidosFromHTML(html, weekInfo);
    
    // Guardar resultado
    await fs.mkdir("data", { recursive: true });
    const filename = "data/cartelera-proxima-semana.json";
    
    const output = {
      fecha_generacion: new Date().toISOString(),
      semana_numero: weekInfo.weekNumber,
      semana_fechas: weekInfo.range,
      total_partidos: partidos.length,
      partidos: partidos
    };
    
    await fs.writeFile(filename, JSON.stringify(output, null, 2));
    
    console.log(`\n✅ Archivo guardado: ${filename}`);
    console.log(`📊 Total de partidos de Larraun: ${partidos.length}`);
    
    if (partidos.length === 0) {
      console.log(`\n⚠️ No se encontraron partidos para la semana ${weekInfo.weekNumber}`);
      console.log(`   (${weekInfo.range})`);
    } else {
      console.log(`\n📋 Partidos encontrados:`);
      partidos.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.fecha} ${p.hora} - ${p.fronton}`);
      });
    }
    
  } catch (err) {
    console.error("❌ ERROR:", err);
    process.exit(1);
  }
}

main();
