import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs/promises";

const BASE_URL = "https://www.fnpelota.com/pub/cartelera.asp";

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
        'Referer': 'https://www.fnpelota.com/pub/cartelera.asp?idioma=eu',
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

// Reglas de conversión
const CONVERSION = [
  { match: "D. Centeno - B. Esnaola", value: "LARRAUN – ARAXES (D. Centeno - B. Esnaola)" },
  { match: "A. Eguzkiza - L. Navarro", value: "LARRAUN (L. Navarro - M. Lazkoz)" },
  { match: "X. Goldaracena - E. Astibia", value: "LARRAUN – ABAXITABIDEA (X. Goldaracena - E. Astibia)" },
  { match: "A. Balda - U. Arcelus", value: "LARRAUN – OBERENA (A. Balda - U. Arcelus)" },
  { match: "M. Goikoetxea - G. Uitzi", value: "LARRAUN – ARAXES (M. Goikoetxea - G. Uitzi)" }
];

function convertirPareja(texto) {
  if (!texto || texto === "-") return "-";
  const limpio = texto.replace(/\s+/g, " ").trim();
  for (const rule of CONVERSION) {
    if (limpio.includes(rule.match)) return rule.value;
  }
  return limpio;
}

function extractPartidosFromHTML(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  // Buscar todas las tablas
  const tables = document.querySelectorAll("table");
  let partidosTable = null;
  
  // Encontrar la tabla que contiene la cartelera
  for (const table of tables) {
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
      break;
    }
  }
  
  if (!partidosTable) {
    console.log("⚠️ No se encontró la tabla de partidos");
    return [];
  }
  
  const rows = [...partidosTable.querySelectorAll("tr")];
  const partidos = [];
  
  for (const row of rows) {
    const tds = [...row.querySelectorAll("td")];
    
    // Saltar filas que no tienen suficientes celdas
    if (tds.length < 6) continue;
    
    // Extraer el texto de cada celda
    const cellsText = tds.map(td => td.textContent.replace(/\s+/g, " ").trim());
    
    // Asegurar que tenemos al menos 7 columnas (fecha, hora, zkia, fronton, lokal, bisita, lehiaketa)
    const fecha = cellsText[0] || "";
    const hora = cellsText[1] || "";
    const zkia = cellsText[2] || "";
    const fronton = cellsText[3] || "";
    const etxekoa = cellsText[4] || "";
    const kanpokoak = cellsText[5] || "";
    const lehiaketa = cellsText[6] || "";
    
    // Validar formato de fecha
    if (!fecha.match(/^\d{4}\/\d{2}\/\d{2}$/)) continue;
    
    // Verificar si Larraun juega
    const textoCompleto = `${etxekoa} ${kanpokoak}`.toUpperCase();
    if (!textoCompleto.includes("LARRAUN")) continue;
    
    console.log(`✅ Partido encontrado: ${fecha} - ${fronton} - ${etxekoa} vs ${kanpokoak}`);
    
    partidos.push({
      fecha,
      hora: hora || "-",
      zkia: zkia || "-",
      fronton: fronton || "-",
      etxekoa: convertirPareja(etxekoa),
      kanpokoak: convertirPareja(kanpokoak),
      lehiaketa: lehiaketa || "-"
    });
  }
  
  return partidos;
}

async function main() {
  try {
    // Calcular el número de semana para la semana siguiente
    const today = new Date();
    const currentDay = today.getDay();
    const daysUntilNextMonday = currentDay === 0 ? 1 : 8 - currentDay;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilNextMonday);
    
    const getWeekNumber = (date) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    };
    
    const weekNumber = getWeekNumber(nextMonday);
    
    const formatYMD = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}/${month}/${day}`;
    };
    
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    const weekRange = `${formatYMD(nextMonday)} - ${formatYMD(nextSunday)}`;
    
    console.log(`📅 Semana siguiente: #${weekNumber} (${weekRange})`);
    
    // Parámetros POST
    const formParams = {
      idioma: 'eu',
      selSemana: weekNumber.toString(),
      selCompeticion: '0',
      selClubMedio: '0',
      rbOrden: '1'
    };
    
    console.log(`📤 Enviando petición POST con selSemana=${weekNumber}...`);
    
    const html = await postFormData(formParams);
    console.log(`📄 HTML recibido: ${html.length} caracteres`);
    
    // Extraer partidos
    const partidos = extractPartidosFromHTML(html);
    
    // Guardar resultado
    await fs.mkdir("data", { recursive: true });
    const filename = "data/cartelera-proxima-semana.json";
    
    const output = {
      fecha_generacion: new Date().toISOString(),
      semana_numero: weekNumber,
      semana_fechas: weekRange,
      total_partidos: partidos.length,
      partidos: partidos
    };
    
    await fs.writeFile(filename, JSON.stringify(output, null, 2));
    
    console.log(`\n✅ Archivo guardado: ${filename}`);
    console.log(`📊 Total de partidos de Larraun encontrados: ${partidos.length}`);
    
    if (partidos.length > 0) {
      console.log(`\n📋 Lista de partidos:`);
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
