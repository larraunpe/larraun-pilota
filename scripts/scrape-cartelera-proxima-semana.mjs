import https from "https";
import { JSDOM } from "jsdom";
import fs from "fs/promises";

const BASE_URL = "https://www.fnpelota.com/pub/cartelera.asp";

function postFormDataWithLanguage(weekNumber, language) {
  return new Promise((resolve, reject) => {
    // Añadir el idioma a la URL
    const url = `${BASE_URL}?idioma=${language}`;
    const urlObj = new URL(url);
    
    const formParams = {
      selSemana: weekNumber.toString(),
      selCompeticion: '0',
      selClubMedio: '0',
      rbOrden: '1'
    };
    
    // Si language es 'eu', también lo enviamos en el body
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
    
    // Forzar euskera en la URL y en los headers
    console.log(`\n📤 Enviando POST en EUSKERA...`);
    const html = await postFormDataWithLanguage(weekNumber, 'eu');
    console.log(`   ✅ HTML recibido: ${html.length} caracteres`);
    
    // Verificar el idioma del HTML recibido
    const tieneEuskera = html.includes("Astea") || html.includes("Kartelera") || html.includes("Etxekoa");
    const tieneCastellano = html.includes("Semana") || html.includes("Cartelera") || html.includes("Local");
    console.log(`   🌐 Idioma detectado: ${tieneEuskera ? "EUSKERA" : tieneCastellano ? "CASTELLANO" : "DESCONOCIDO"}`);
    
    // Si aún está en castellano, intentar con otro método
    if (!tieneEuskera) {
      console.log(`\n⚠️  Aún en castellano, intentando método alternativo...`);
      
      // Método alternativo: GET con idioma en URL
      const altUrl = `https://www.fnpelota.com/pub/cartelera.asp?idioma=eu&selSemana=${weekNumber}&selCompeticion=0&selClubMedio=0&rbOrden=1`;
      console.log(`   URL alternativa: ${altUrl}`);
      
      const altHtml = await new Promise((resolve, reject) => {
        https.get(altUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept-Language': 'eu,es;q=0.9'
          }
        }, (res) => {
          let data = "";
          res.on("data", chunk => data += chunk);
          res.on("end", () => resolve(data));
        }).on("error", reject);
      });
      
      const htmlToUse = altHtml;
      const tieneEuskeraAlt = htmlToUse.includes("Astea") || htmlToUse.includes("Kartelera");
      console.log(`   🌐 Idioma detectado (alternativo): ${tieneEuskeraAlt ? "EUSKERA" : "CASTELLANO"}`);
      
      if (tieneEuskeraAlt) {
        console.log(`   ✅ Usando resultado del método alternativo`);
        const dom = new JSDOM(htmlToUse);
        const document = dom.window.document;
        
        const allRows = document.querySelectorAll("tr");
        const partidos = [];
        
        for (const row of allRows) {
          const cells = row.querySelectorAll("td");
          if (cells.length >= 6) {
            const firstCellText = cells[0].textContent.trim();
            if (firstCellText.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
              const fecha = firstCellText;
              const hora = cells[1]?.textContent.trim() || "-";
              const zkia = cells[2]?.textContent.trim() || "-";
              const fronton = cells[3]?.textContent.trim() || "-";
              let etxekoa = cells[4]?.textContent.trim() || "";
              let kanpokoak = cells[5]?.textContent.trim() || "";
              const lehiaketa = cells[6]?.textContent.trim() || "";
              
              etxekoa = etxekoa.replace(/\s+/g, " ").trim();
              kanpokoak = kanpokoak.replace(/\s+/g, " ").trim();
              
              const textoCompleto = `${etxekoa} ${kanpokoak}`.toUpperCase();
              if (textoCompleto.includes("LARRAUN")) {
                partidos.push({
                  fecha, hora, zkia, fronton,
                  etxekoa: convertirPareja(etxekoa),
                  kanpokoak: convertirPareja(kanpokoak),
                  lehiaketa
                });
              }
            }
          }
        }
        
        await fs.mkdir("data", { recursive: true });
        await fs.writeFile("data/cartelera-proxima-semana.json", JSON.stringify({
          fecha_generacion: new Date().toISOString(),
          semana_numero: weekNumber,
          total_partidos: partidos.length,
          partidos: partidos
        }, null, 2));
        
        console.log(`\n✅ Archivo guardado con ${partidos.length} partidos`);
        return;
      }
    }
    
    // Procesar el HTML (ya sea euskera o castellano)
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    const allRows = document.querySelectorAll("tr");
    console.log(`\n📊 Filas totales: ${allRows.length}`);
    
    const partidos = [];
    
    for (const row of allRows) {
      const cells = row.querySelectorAll("td");
      if (cells.length >= 6) {
        const firstCellText = cells[0].textContent.trim();
        
        if (firstCellText.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
          const fecha = firstCellText;
          const hora = cells[1]?.textContent.trim() || "-";
          const zkia = cells[2]?.textContent.trim() || "-";
          const fronton = cells[3]?.textContent.trim() || "-";
          let etxekoa = cells[4]?.textContent.trim() || "";
          let kanpokoak = cells[5]?.textContent.trim() || "";
          const lehiaketa = cells[6]?.textContent.trim() || "";
          
          etxekoa = etxekoa.replace(/\s+/g, " ").trim();
          kanpokoak = kanpokoak.replace(/\s+/g, " ").trim();
          
          const textoCompleto = `${etxekoa} ${kanpokoak}`.toUpperCase();
          
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
