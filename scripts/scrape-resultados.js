const axios = require("axios");
const cheerio = require("cheerio");

const BASE = "https://www.fnpelota.com/pub/modalidadComp.asp?idioma=eu";
const TEMPORADA = 2025;

// 🔎 RANGOS CONFIGURABLES
const ID_COMPETICION_DESDE = 3059;
const ID_COMPETICION_HASTA = 3060;

const ID_FASE_DESDE = 20613;
const ID_FASE_HASTA = 20616;

// -----------------------------------------------------

async function fetchHtml(url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      timeout: 15000,
    });
    return data;
  } catch (err) {
    console.log("Error cargando:", url);
    return null;
  }
}

// -----------------------------------------------------

function extraerModalidad($) {
  // Buscar en diferentes lugares donde podría estar la modalidad
  
  // 1️⃣ Buscar en el select de competiciones (si existe)
  const compSelected = $('select[name="idCompeticion"] option:selected').text().trim();
  if (compSelected && compSelected !== "Seleccionar competición") {
    return compSelected;
  }
  
  // 2️⃣ Buscar en el título de la página pero filtrando
  const titulo = $("h1").first().text().trim();
  
  // Si el título contiene información útil y no es el nombre de la federación
  if (titulo && !titulo.includes("Nafarroako Euskal Pilota Federakuntza")) {
    return titulo;
  }
  
  // 3️⃣ Buscar en el breadcrumb o navegación
  const breadcrumb = $(".breadcrumb").text().trim();
  if (breadcrumb) {
    const partes = breadcrumb.split(">").map(p => p.trim());
    // La última parte suele ser la modalidad
    if (partes.length > 0) {
      return partes[partes.length - 1];
    }
  }
  
  // 4️⃣ Buscar en alguna etiqueta con clase "titulo" o similar
  const tituloClase = $(".titulo").first().text().trim();
  if (tituloClase && !tituloClase.includes("Federakuntza")) {
    return tituloClase;
  }
  
  return "";
}

// -----------------------------------------------------

function extraerFase($, url) {
  // Si NO es eliminatoria → LIGAXKA
  if (!url.includes("idFaseEliminatoria")) {
    return "LIGAXKA";
  }

  // Intento 1: opción selected
  let fase = $('select[name="idFaseEliminatoria"] option:selected')
    .text()
    .trim();

  if (fase) return fase;

  // Intento 2: buscar option que coincida con el id de la URL
  const idMatch = url.match(/idFaseEliminatoria=(\d+)/);
  if (idMatch) {
    const idBuscado = idMatch[1];

    $('select[name="idFaseEliminatoria"] option').each((_, el) => {
      const value = $(el).attr("value");
      if (value === idBuscado) {
        fase = $(el).text().trim();
      }
    });
  }

  return fase || "";
}

// -----------------------------------------------------

function parsearPartidos($, modalidad, fase, url) {
  const partidos = [];

  $("table tr").each((_, row) => {
    const celdas = $(row).find("td");

    if (celdas.length < 6) return;

    // 🔹 FECHA - tomar solo primeros 10 caracteres y convertir / a -
    let fechaTexto = $(celdas[0]).text().trim();
    let fecha = fechaTexto.substring(0, 10).replace(/\//g, "-");

    const fronton = $(celdas[1]).text().trim();
    
    // 🔹 EQUIPOS - limpiar espacios
    const etxekoa = $(celdas[2]).text().replace(/\s+/g, " ").trim();
    const kanpokoak = $(celdas[3]).text().replace(/\s+/g, " ").trim();
    
    // 🔹 TANTEO - eliminar espacios
    const tanteoa = $(celdas[4]).text().replace(/\s+/g, "").trim();
    
    // 🔹 SETS
    const setsRaw = $(celdas[5]).text().trim();
    
    if (!fecha || !tanteoa) return;

    // Formatear sets como (XX-YY) (XX-YY)
    const setsArray = setsRaw
      .split(/\s+/)
      .filter((s) => s.includes("-"));
    
    const sets = setsArray.length > 0 ? ["(" + setsArray.join(") (") + ")"] : [];

    const [etx, kan] = tanteoa.split("-").map((x) => x.trim());

    let emaitza = "";
    if (etx && kan) {
      emaitza = Number(etx) > Number(kan) ? "irabazita" : "galduta";
    }

    // 🔹 MODALIDAD - limpiar y formatear
    let modalidadLimpia = modalidad
      .replace(/\s+/g, " ")
      .trim();
    
    // Eliminar texto de la federación si aparece
    modalidadLimpia = modalidadLimpia
      .replace(/Nafarroako Euskal Pilota Federakuntza/i, "")
      .trim();

    partidos.push({
      fecha,
      fronton,
      etxekoa,
      kanpokoak,
      tanteoa,
      sets,
      modalidad: modalidadLimpia,
      fase,
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

async function main() {
  console.log("🔄 Iniciando scraping...");
  const resultados = [];
  const urlsVisitadas = new Set();

  for (
    let idComp = ID_COMPETICION_DESDE;
    idComp <= ID_COMPETICION_HASTA;
    idComp++
  ) {
    // 1️⃣ LIGAXKA
    const urlLiga = `${BASE}&idCompeticion=${idComp}&temp=${TEMPORADA}`;

    if (!urlsVisitadas.has(urlLiga)) {
      urlsVisitadas.add(urlLiga);
      console.log(`📋 Procesando competición ID: ${idComp}`);
      const partidos = await scrapeUrl(urlLiga);
      resultados.push(...partidos);
    }

    // 2️⃣ ELIMINATORIAS
    for (
      let idFase = ID_FASE_DESDE;
      idFase <= ID_FASE_HASTA;
      idFase++
    ) {
      const urlFase = `${BASE}&idCompeticion=${idComp}&idFaseEliminatoria=${idFase}&temp=${TEMPORADA}`;

      if (!urlsVisitadas.has(urlFase)) {
        urlsVisitadas.add(urlFase);
        console.log(`🏆 Procesando fase ID: ${idFase} (Competición: ${idComp})`);
        const partidos = await scrapeUrl(urlFase);
        resultados.push(...partidos);
      }
    }
  }

  // 🔥 Eliminar duplicados exactos
  const unique = Array.from(
    new Map(
      resultados.map((p) => [
        `${p.fecha}-${p.etxekoa}-${p.kanpokoak}-${p.tanteoa}`,
        p,
      ])
    ).values()
  );

  console.log(JSON.stringify(unique, null, 2));
}

main();
