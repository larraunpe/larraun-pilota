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

// ---------- Extraer partidos de la tabla ----------
function extractPartidosFromHTML(html, targetWeekRange) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  // Buscar todas las tablas (la cartelera suele estar en la primera tabla con partidos)
  const tables = document.querySelectorAll("table");
  let partidosTable = null;
  
  // Buscar la tabla que contiene fechas (formato DD/MM/YYYY)
  for (const table of tables) {
    const rows = table.querySelectorAll("tr");
    let hasDates = false;
    
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length > 0) {
        const firstCellText = cells[0].textContent.trim();
        // Verificar si la primera celda tiene formato de fecha (DD/MM/YYYY)
        if (firstCellText.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
          hasDates = true;
          break;
        }
      }
    }
    
    if (hasDates) {
      partidosTable = table;
      break;
    }
  }
  
  if (!partidosTable) {
    return [];
  }
  
  const rows = [...partidosTable.querySelectorAll("tr")];
  const partidos = [];
  
  rows.forEach(row => {
    const tds = [...row.querySelectorAll("td")];
    if (tds.length < 6) return;
    
    const cols = tds.map(td => td.textContent.replace(/\s+/g, " ").trim());
    const [fecha, hora, zkia, fronton, etxekoa, kanpokoak, lehiaketa] = cols;
    
    // Verificar si la fecha está dentro de la semana objetivo
    if (fecha && fecha.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const [day, month, year] = fecha.split('/');
      const fechaObj = new Date(`${year}-${month}-${day}`);
      const targetStart = new Date(targetWeekRange.split(' - ')[0].replace(/\//g, '-'));
      const targetEnd = new Date(targetWeekRange.split(' - ')[1].replace(/\//g, '-'));
      
      // Solo incluir partidos dentro del rango de la semana siguiente
      if (fechaObj < targetStart || fechaObj > targetEnd) {
        return; // Saltar partidos fuera de la semana objetivo
      }
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
      if (!texto) return "-";
      const limpio = texto.replace(/\s+/g, " ").trim();
      for (const rule of CONVERSION) {
        if (limpio.includes(rule.match)) return rule.value;
      }
      return limpio;
    }
    
    // Verificar si Larraun juega
    const esLarraun =
      (etxekoa && (etxekoa.includes("LARRAUN") || CONVERSION.some(rule => 
        etxekoa && etxekoa.includes(rule.match)))) ||
      (kanpokoak && (kanpokoak.includes("LARRAUN") || CONVERSION.some(rule => 
        kanpokoak && kanpokoak.includes(rule.match))));
    
    if (!esLarraun) return;
    
    partidos.push({
      semana: targetWeekRange,
      fecha: fecha || "-",
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

// ---------- Obtener todas las opciones del selector de semanas ----------
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
    if (value && value !== "fechaInicial") {
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
    
    // Primero, obtener la página para extraer las opciones de semana
    const initialHtml = await getHTML(BASE_URL);
    const weekOptions = getWeekOptions(initialHtml);
    
    console.log(`\n📆 Semanas disponibles en el selector:`);
    weekOptions.forEach(opt => {
      console.log(`   - ${opt.text} (value: ${opt.value})`);
    });
    
    // Buscar la opción que coincide con nuestra semana objetivo
    const targetOption = weekOptions.find(opt => opt.text === range);
    
    if (!targetOption) {
      console.log(`\n❌ ERROR: No se encontró la semana "${range}" en el selector.`);
      console.log(`   Las semanas disponibles son hasta: ${weekOptions[weekOptions.length-1]?.text}`);
      process.exit(1);
    }
    
    console.log(`\n✅ Semana encontrada: ${targetOption.text} (${targetOption.value})`);
    
    // Construir URL con POST simulada (usando GET con el valor correcto)
    const urlWithWeek = `${BASE_URL}&selSemana=${encodeURIComponent(targetOption.value)}&selClub=&selCompeticion=&excel=0`;
    console.log(`\n🌐 Solicitando: ${urlWithWeek}`);
    
    const htmlWithWeek = await getHTML(urlWithWeek);
    
    // Extraer partidos de la tabla, filtrando por fecha
    const partidos = extractPartidosFromHTML(htmlWithWeek, range);
    
    // Guardar en data/
    await fs.mkdir("data", { recursive: true });
    const filename = "data/cartelera-proxima-semana.json";
    
    const output = {
      fecha_generacion: new Date().toISOString(),
      semana_solicitada: range,
      semanas_disponibles: weekOptions.map(opt => opt.text),
      partidos: partidos,
      total_partidos: partidos.length
    };
    
    await fs.writeFile(filename, JSON.stringify(output, null, 2));
    
    console.log(`\n✅ Archivo guardado: ${filename}`);
    console.log(`📊 Total de partidos de Larraun para la semana ${range}: ${partidos.length}`);
    
    if (partidos.length === 0) {
      console.log(`\n⚠️  No se encontraron partidos de Larraun para la semana ${range}`);
      console.log(`   (Es posible que aún no estén publicados o que Larraun no juegue esa semana)`);
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
