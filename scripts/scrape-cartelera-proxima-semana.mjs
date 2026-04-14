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

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getNextWeekNumber() {
  const today = new Date();
  const currentDay = today.getDay();
  const daysUntilNextMonday = currentDay === 0 ? 1 : 8 - currentDay;
  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilNextMonday);
  return getWeekNumber(nextMonday);
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

async function main() {
  try {
    const weekNumber = getNextWeekNumber();
    console.log(`📅 Semana siguiente: #${weekNumber}`);
    
    const formParams = {
      idioma: 'eu',
      selSemana: weekNumber.toString(),
      selCompeticion: '0',
      selClubMedio: '0',
      rbOrden: '1'
    };
    
    console.log(`📤 Enviando POST...`);
    const html = await postFormData(formParams);
    console.log(`📄 HTML recibido: ${html.length} caracteres`);
    
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Buscar todas las filas de la tabla
    const allRows = document.querySelectorAll("tr");
    console.log(`📊 Filas totales: ${allRows.length}`);
    
    const partidos = [];
    
    for (const row of allRows) {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 6) {
        const firstCellText = cells[0].textContent.trim();
        
        // El formato de fecha ahora es DD/MM/YYYY (ej: 24/04/2026)
        if (firstCellText.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
          const fecha = firstCellText;
          const hora = cells[1]?.textContent.trim() || "-";
          const zkia = cells[2]?.textContent.trim() || "-";
          const fronton = cells[3]?.textContent.trim() || "-";
          let etxekoa = cells[4]?.textContent.trim() || "";
          let kanpokoak = cells[5]?.textContent.trim() || "";
          const lehiaketa = cells[6]?.textContent.trim() || "";
          
          // Limpiar textos
          etxekoa = etxekoa.replace(/\s+/g, " ").trim();
          kanpokoak = kanpokoak.replace(/\s+/g, " ").trim();
          
          const textoCompleto = `${etxekoa} ${kanpokoak}`.toUpperCase();
          
          if (textoCompleto.includes("LARRAUN")) {
            console.log(`✅ ENCONTRADO: ${fecha} - ${fronton}`);
            console.log(`   ${etxekoa} vs ${kanpokoak}`);
            
            partidos.push({
              fecha,
              hora,
              zkia,
              fronton,
              etxekoa: convertirPareja(etxekoa),
              kanpokoak: convertirPareja(kanpokoak),
              lehiaketa
            });
          }
        }
      }
    }
    
    // Guardar resultado
    await fs.mkdir("data", { recursive: true });
    const filename = "data/cartelera-proxima-semana.json";
    
    const output = {
      fecha_generacion: new Date().toISOString(),
      semana_numero: weekNumber,
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
