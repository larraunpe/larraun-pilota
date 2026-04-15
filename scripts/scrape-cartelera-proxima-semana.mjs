import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs/promises";

const BASE_URL = "https://www.fnpelota.com/pub/cartelera.asp";

function postFormDataWithLanguage(weekNumber, language) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}?idioma=${language}`;
    const urlObj = new URL(url);
    
    const formParams = {
      selSemana: weekNumber.toString(),
      selCompeticion: '0',
      selClubMedio: '0',
      rbOrden: '1'
    };
    
    if (language === 'eu') {
      formParams.idioma = 'eu';
    }
    
    const postData = new URLSearchParams(formParams).toString();
    
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'eu,es;q=0.9,en;q=0.8',
        'Origin': 'https://www.fnpelota.com',
        'Referer': `https://www.fnpelota.com/pub/cartelera.asp?idioma=${language}`,
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
    
    console.log(`\n📤 Enviando POST en EUSKERA...`);
    const html = await postFormDataWithLanguage(weekNumber, 'eu');
    console.log(`   ✅ HTML recibido: ${html.length} caracteres`);
    
    // Guardar HTML para depuración
    await fs.mkdir("data", { recursive: true });
    await fs.writeFile("data/debug-euskera.html", html);
    console.log(`   💾 HTML guardado en data/debug-euskera.html`);
    
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Buscar todas las filas de la tabla
    const allRows = document.querySelectorAll("tr");
    console.log(`\n📊 Filas totales: ${allRows.length}`);
    
    // Primero, buscar las cabeceras para identificar las columnas
    let localColIndex = 4;  // Por defecto, asumimos que Local está en columna 4
    let visitanteColIndex = 5;  // Por defecto, Visitante en columna 5
    
    for (const row of allRows) {
      const headers = row.querySelectorAll("th");
      if (headers.length >= 6) {
        const headerTexts = Array.from(headers).map(h => h.textContent.trim());
        console.log(`\n📋 Cabeceras encontradas: ${headerTexts.join(" | ")}`);
        
        // Buscar índices de Etxekoa y Kanpokoak
        const localIndex = headerTexts.findIndex(h => h === "Etxekoa" || h === "Local");
        const visitanteIndex = headerTexts.findIndex(h => h === "Kanpokoak" || h === "Visitante");
        
        if (localIndex !== -1) localColIndex = localIndex;
        if (visitanteIndex !== -1) visitanteColIndex = visitanteIndex;
        
        console.log(`   → Etxekoa en columna ${localColIndex}, Kanpokoak en columna ${visitanteColIndex}`);
        break;
      }
    }
    
    const partidos = [];
    let filaNumero = 0;
    
    for (const row of allRows) {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 6) {
        const firstCellText = cells[0].textContent.trim();
        
        if (firstCellText.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
          filaNumero++;
          const fecha = firstCellText;
          const hora = cells[1]?.textContent.trim() || "-";
          const zkia = cells[2]?.textContent.trim() || "-";
          const fronton = cells[3]?.textContent.trim() || "-";
          
          // Usar los índices detectados
          let etxekoa = cells[localColIndex]?.textContent.trim() || "";
          let kanpokoak = cells[visitanteColIndex]?.textContent.trim() || "";
          const lehiaketa = cells[6]?.textContent.trim() || "";
          
          // Limpiar textos
          etxekoa = etxekoa.replace(/\s+/g, " ").trim();
          kanpokoak = kanpokoak.replace(/\s+/g, " ").trim();
          
          const textoCompleto = `${etxekoa} ${kanpokoak}`.toUpperCase();
          
          // Depuración: mostrar primeras 5 filas
          if (filaNumero <= 5) {
            console.log(`\n🔍 Fila ${filaNumero}: ${fecha} ${fronton}`);
            console.log(`   Etxekoa: "${etxekoa}"`);
            console.log(`   Kanpokoak: "${kanpokoak}"`);
            console.log(`   ¿Contiene LARRAUN? ${textoCompleto.includes("LARRAUN") ? "SÍ" : "NO"}`);
          }
          
          if (textoCompleto.includes("LARRAUN")) {
            console.log(`✅ ENCONTRADO: ${fecha} - ${fronton}`);
            
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
    
    console.log(`\n📊 Total de filas con fechas procesadas: ${filaNumero}`);
    
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
