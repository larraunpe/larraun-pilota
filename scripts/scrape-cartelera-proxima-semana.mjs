import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs/promises";
import { URLSearchParams } from "url";

// ---------- Configuración ----------
const BASE_URL = "https://www.fnpelota.com/pub/cartelera.asp";

// ---------- Calcular la semana siguiente (LUNES a DOMINGO) ----------
function getNextWeekRange() {
  const today = new Date();
  
  let currentDay = today.getDay();
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

// ---------- Enviar petición POST con los parámetros del formulario ----------
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
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Origin': 'https://www.fnpelota.com',
        'Referer': 'https://www.fnpelota.com/pub/cartelera.asp?idioma=eu'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    
    req.on("error", reject);
    req.write(postData);
    req.end();
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

// ---------- Extraer partidos de la tabla ----------
function extractPartidosFromHTML(html, targetWeekRange) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  // Buscar todas las tablas
  const tables = document.querySelectorAll("table");
  console.log(`🔍 Encontradas ${tables.length} tablas en el HTML`);
  
  let partidosTable = null;
  
  // Buscar la tabla que contiene fechas (formato YYYY/MM/DD)
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    const rows = table.querySelectorAll("tr");
    let hasDatePattern = false;
    
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 6) {
        const firstCell = cells[0].textContent.trim();
        if (firstCell.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
          hasDatePattern = true;
          break;
        }
      }
    }
    
    if (hasDatePattern) {
      partidosTable = table;
      console.log(`✅ Tabla de partidos encontrada en índice ${i}`);
      break;
    }
  }
  
  if (!partidosTable) {
    console.log("⚠️ No se encontró tabla con fechas");
    return [];
  }
  
  const rows = [...partidosTable.querySelectorAll("tr")];
  console.log(`📊 Procesando ${rows.length} filas de la tabla`);
  
  const partidos = [];
  const [targetStart, targetEnd] = targetWeekRange.split(" - ");
  
  rows.forEach(row => {
    const tds = [...row.querySelectorAll("td")];
    if (tds.length < 6) return;
    
    const cols = tds.map(td => td.textContent.replace(/\s+/g, " ").trim());
    const [fecha, hora, zkia, fronton, etxekoa, kanpokoak, lehiaketa] = cols;
    
    // Verificar formato de fecha
    if (!fecha || !fecha.match(/^\d{4}\/\d{2}\/\d{2}$/)) {
      return;
    }
    
    // Filtrar por rango de fechas
    if (fecha < targetStart || fecha > targetEnd) {
      return;
    }
    
    // Verificar si juega Larraun (búsqueda más flexible)
    const textoCompleto = `${etxekoa || ""} ${kanpokoak || ""}`.toUpperCase();
    const esLarraun = textoCompleto.includes("LARRAUN");
    
    if (!esLarraun) return;
    
    console.log(`🎾 PARTIDO: ${fecha} ${hora} - ${fronton}`);
    
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

// ---------- Main ----------
async function main() {
  try {
    const { start, end, range, nextMonday, nextSunday } = getNextWeekRange();
    
    console.log(`📅 Hoy es: ${new Date().toLocaleDateString('es-ES')}`);
    console.log(`🎯 Buscando partidos para: ${range}`);
    
    // Parámetros que espera el formulario (los mismos que envía el botón "BILATU")
    const formParams = {
      idioma: 'eu',
      selSemana: range,
      selClub: '',
      selCompeticion: '',
      excel: '0'
    };
    
    console.log(`\n📤 Enviando petición POST con parámetros:`);
    console.log(formParams);
    
    const html = await postFormData(formParams);
    console.log(`📄 HTML recibido: ${html.length} caracteres`);
    
    // Extraer partidos
    const partidos = extractPartidosFromHTML(html, range);
    
    // Guardar resultado
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
    
  } catch (err) {
    console.error("❌ ERROR:", err);
    process.exit(1);
  }
}

main();
