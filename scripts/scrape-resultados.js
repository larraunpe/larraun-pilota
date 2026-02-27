import axios from "axios";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const BASE = "https://www.fnpelota.com/pub/modalidadComp.asp?idioma=eu";
const TEMPORADA = 2025;

const ID_COMPETICION_DESDE = 3059;
const ID_COMPETICION_HASTA = 3260;

const ID_FASE_DESDE = 20613;
const ID_FASE_HASTA = 21616;

// Obtener la ruta del directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_FILE = path.join(__dirname, "..", "data", "resultados-larraun.json");

// -----------------------------------------------------

async function fetchHtml(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      responseType: "arraybuffer",
      timeout: 15000,
    });

    // Decodificar correctamente
    const html = iconv.decode(Buffer.from(response.data), "windows-1252");
    return html;
  } catch (err) {
    console.log("Error cargando:", url);
    return null;
  }
}

// -----------------------------------------------------

function extraerModalidad($) {
  // PRIORIDAD ABSOLUTA: h6
  let titulo = $("h6").first().text().trim();

  if (!titulo) {
    return "";
  }

  return titulo.replace(/\s+/g, " ").trim();
}

// -----------------------------------------------------

function extraerFase($, url) {
  if (!url.includes("idFaseEliminatoria")) {
    return "LIGAXKA";
  }

  const selected = $('select[name="selFase"] option[selected]');

  if (selected.length) {
    return selected.text().trim();
  }

  return "";
}

// -----------------------------------------------------

function limpiarTexto(texto) {
  if (!texto) return texto;

  // Reemplazar caracteres mal codificados
  return texto
    .replace(/�/g, "Ñ")
    .replace(/�/g, "ñ")
    .replace(/�/g, "Í")
    .replace(/�/g, "í")
    .replace(/�/g, "Ó")
    .replace(/�/g, "ó")
    .replace(/�/g, "Á")
    .replace(/�/g, "á")
    .replace(/�/g, "É")
    .replace(/�/g, "é")
    .replace(/�/g, "Ú")
    .replace(/�/g, "ú")
    .replace(/�/g, "Ü")
    .replace(/�/g, "ü");
}

// -----------------------------------------------------

function formatearEquipo(texto) {
  if (!texto) return texto;
  
  // Eliminar espacios múltiples y limpiar
  return texto.replace(/\s+/g, " ").trim();
}

// -----------------------------------------------------

function formatearSets(sets) {
  if (!sets || sets.length === 0) return [];
  
  // Formatear cada set como "(XX-YY)" y unirlos en un solo string
  const setsFormateados = sets.map(set => `(${set})`);
  return [setsFormateados.join(" ")];
}

// -----------------------------------------------------

function formatearModalidad(modalidad, fase) {
  if (!modalidad) return "";
  
  // Limpiar la modalidad
  let modalidadLimpia = modalidad
    .replace(/\s+/g, " ")
    .trim();
  
  // Eliminar "NKJ - TRINKETE TRINKETE ESKUZ" repetido si existe
  modalidadLimpia = modalidadLimpia
    .replace(/NKJ - TRINKETE\s+TRINKETE ESKUZ\s+/g, "")
    .replace(/TRINKETE ESKUZ\s+/g, "");
  
  // 🔹 NUEVO: Si la fase está vacía o es LIGAXKA, añadir LIGAXKA explícitamente
  if (!fase || fase === "LIGAXKA") {
    return `${modalidadLimpia} LIGAXKA`.trim();
  }
  
  // Si hay fase y no es LIGAXKA, añadirla
  return `${modalidadLimpia} ${fase}`.trim();
}

// -----------------------------------------------------

function parsearPartidos($, modalidad, fase, url) {
  const partidos = [];

  $("table tr").each((_, row) => {
    const celdas = $(row).find("td");
    if (celdas.length < 5) return;

    // 🔹 FECHA - tomar solo los primeros 10 caracteres y convertir / a -
    let fechaTexto = $(celdas[0])
      .text()
      .replace(/\s+/g, " ")
      .trim();

    // Tomar solo los primeros 10 caracteres y reemplazar / por -
    let fecha = fechaTexto.substring(0, 10).replace(/\//g, "-");

    // 🔹 FRONTÓN
    let fronton = limpiarTexto(
      $(celdas[1])
        .text()
        .replace(/\s+/g, " ")
        .trim()
    );

    // 🔹 EQUIPOS - formatear sin espacios extra
    let etxekoa = limpiarTexto(
      $(celdas[2])
        .clone()
        .find("br")
        .replaceWith(" ")
        .end()
        .text()
    );
    etxekoa = formatearEquipo(etxekoa);

    let kanpokoak = limpiarTexto(
      $(celdas[4])
        .clone()
        .find("br")
        .replaceWith(" ")
        .end()
        .text()
    );
    kanpokoak = formatearEquipo(kanpokoak);

    // 🔹 FILTRAR: Solo guardar partidos donde aparezca LARRAUN
    if (!etxekoa.includes("LARRAUN") && !kanpokoak.includes("LARRAUN")) {
      return; // Saltar este partido
    }

    // 🔹 TANTEO - eliminar espacios
    const tanteoCell = $(celdas[3]);
    const tanteoa = tanteoCell
      .contents()
      .filter(function () {
        return this.type === "text";
      })
      .text()
      .replace(/\s+/g, "")
      .trim();

    // 🔹 SETS
    const setsTemp = [];
    tanteoCell.find("span.small").each((_, el) => {
      const texto = $(el).text();
      const matches = texto.match(/\((.*?)\)/g);
      if (matches) {
        matches.forEach((m) => setsTemp.push(m.replace(/[()]/g, "").trim()));
      }
    });
    
    // Formatear sets como se solicita
    const sets = formatearSets(setsTemp);

    if (!fecha || !tanteoa) return;

    // 🔹 EMATZA
    const [etx, kan] = tanteoa.split("-").map((x) => x.trim());
    const emaitza =
      etx && kan ? (Number(etx) > Number(kan) ? "irabazita" : "galduta") : "";

    partidos.push({
      fecha,
      fronton,
      etxekoa,
      kanpokoak,
      tanteoa,
      sets,
      modalidad: formatearModalidad(limpiarTexto(modalidad), limpiarTexto(fase)),
      fase: limpiarTexto(fase),
      url,
      emaitza,
      ofiziala: true,
    });
  });

  return partidos;
}

// -----------------------------------------------------

async function scrapeUrl(url) {
  const html = await fetchHtml(url);
  if (!html) return [];

  const $ = cheerio.load(html);

  const modalidad = extraerModalidad($);
  const fase = extraerFase($, url);

  return parsearPartidos($, modalidad, fase, url);
}

// -----------------------------------------------------

async function guardarResultados(resultados) {
  try {
    // Asegurar que el directorio data existe
    const dataDir = path.join(__dirname, "..", "data");
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }

    // Guardar el archivo
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(resultados, null, 2), "utf-8");
    console.log(`✅ Resultados guardados en ${OUTPUT_FILE}`);
    console.log(`📊 Total de partidos: ${resultados.length}`);
  } catch (error) {
    console.error("❌ Error guardando el archivo:", error.message);
  }
}

// -----------------------------------------------------

async function main() {
  console.log("🔄 Iniciando scraping...");
  const resultados = [];
  const urlsVisitadas = new Set();

  for (
    let idComp = ID_COMPETICION_DESDE;
    idComp <= ID_COMPETICION_HASTA;
    idComp++
  ) {
    const urlLiga = `${BASE}&idCompeticion=${idComp}&temp=${TEMPORADA}`;

    if (!urlsVisitadas.has(urlLiga)) {
      urlsVisitadas.add(urlLiga);
      console.log(`📋 Procesando competición ID: ${idComp}`);
      const partidos = await scrapeUrl(urlLiga);
      resultados.push(...partidos);
    }

    for (let idFase = ID_FASE_DESDE; idFase <= ID_FASE_HASTA; idFase++) {
      const urlFase = `${BASE}&idCompeticion=${idComp}&idFaseEliminatoria=${idFase}&temp=${TEMPORADA}`;

      if (!urlsVisitadas.has(urlFase)) {
        urlsVisitadas.add(urlFase);
        console.log(`🏆 Procesando fase ID: ${idFase} (Competición: ${idComp})`);
        const partidos = await scrapeUrl(urlFase);
        resultados.push(...partidos);
      }
    }
  }

  // Eliminar duplicados
  const unique = Array.from(
    new Map(
      resultados.map((p) => [
        `${p.fecha}-${p.etxekoa}-${p.kanpokoak}-${p.tanteoa}`,
        p,
      ])
    ).values()
  );

  // Verificación adicional: asegurar que la fecha solo tenga 10 caracteres y formato correcto
  unique.forEach((p) => {
    if (p.fecha && p.fecha.length > 10) {
      p.fecha = p.fecha.substring(0, 10).replace(/\//g, "-");
    }
    // Eliminar el campo fase ya que ahora está incluido en modalidad
    delete p.fase;
  });

  // Guardar en archivo
  await guardarResultados(unique);
}

main();
