import axios from "axios";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const BASE = "https://www.fnpelota.com/pub/modalidadComp.asp?idioma=eu";
const TEMPORADA = 2026;

const ID_COMPETICION_DESDE = 3310;
const ID_COMPETICION_HASTA = 3420;

// Reintentos y pausas para evitar perder una competición por un fallo puntual.
const MAX_INTENTOS = 3;
const TIMEOUT_MS = 25000;
const PAUSA_ENTRE_INTENTOS_MS = 1500;
const PAUSA_ENTRE_COMPETICIONES_MS = 200;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_FILE = path.join(__dirname, "..", "data", "resultados-larraun.json");
const MIXTAS_FILE = path.join(__dirname, "..", "data", "mixtas.json");

let equivalenciasMixtas = {};

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// -----------------------------------------------------
// EQUIVALENCIAS DE PAREJAS MIXTAS
// -----------------------------------------------------

async function cargarEquivalencias() {
  try {
    const data = await fs.readFile(MIXTAS_FILE, "utf-8");
    const mixtas = JSON.parse(data);

    if (Array.isArray(mixtas)) {
      mixtas.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const entrada = Object.entries(item)[0];
        if (!entrada) return;
        const [original, normalizado] = entrada;
        if (original && normalizado) {
          equivalenciasMixtas[original] = normalizado;
        }
      });
    } else if (mixtas && typeof mixtas === "object") {
      equivalenciasMixtas = { ...mixtas };
    }

    console.log("✅ Equivalencias de parejas mixtas cargadas:");
    Object.entries(equivalenciasMixtas).forEach(([original, normalizado]) => {
      console.log(`   "${original}" → "${normalizado}"`);
    });
  } catch (error) {
    console.error("⚠️ No se han podido cargar las equivalencias:", error.message);
    equivalenciasMixtas = {};
  }
}

function aplicarEquivalencia(texto) {
  if (!texto) return texto;

  if (equivalenciasMixtas[texto]) {
    return equivalenciasMixtas[texto];
  }

  // Buscar primero las claves más largas para evitar coincidencias parciales.
  const equivalenciasOrdenadas = Object.entries(equivalenciasMixtas)
    .sort(([a], [b]) => b.length - a.length);

  for (const [original, normalizado] of equivalenciasOrdenadas) {
    if (texto.includes(original)) {
      return normalizado;
    }
  }

  return texto;
}

function contieneLarraun(texto) {
  if (!texto) return false;
  return aplicarEquivalencia(texto).toUpperCase().includes("LARRAUN");
}

// -----------------------------------------------------
// DESCARGA HTML CON REINTENTOS
// -----------------------------------------------------

async function fetchHtml(url) {
  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      const response = await axios.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "eu-ES,eu;q=0.9,es;q=0.8,en;q=0.7",
          Referer: "https://www.fnpelota.com/pub/",
          "Cache-Control": "no-cache",
        },
        responseType: "arraybuffer",
        timeout: TIMEOUT_MS,
        maxRedirects: 10,
      });

      const buffer = Buffer.from(response.data);
      const contentType = response.headers["content-type"] || "";
      const charsetMatch = contentType.match(/charset\s*=\s*([^;\s]+)/i);
      const charset = charsetMatch ? charsetMatch[1].replace(/["']/g, "") : "windows-1252";
      const encoding = iconv.encodingExists(charset) ? charset : "windows-1252";

      return iconv.decode(buffer, encoding);
    } catch (error) {
      const status = error.response?.status;
      const codigo = error.code || "sin código";
      const reintentable =
        !status || status === 408 || status === 429 || status >= 500;

      console.warn(
        `⚠️ Error descargando (intento ${intento}/${MAX_INTENTOS}) ${url}: ` +
        `${status ? `HTTP ${status}` : codigo} - ${error.message}`
      );

      if (!reintentable || intento === MAX_INTENTOS) {
        console.error(`❌ No se ha podido descargar: ${url}`);
        return null;
      }

      await esperar(PAUSA_ENTRE_INTENTOS_MS * intento);
    }
  }

  return null;
}

// -----------------------------------------------------
// EXTRACCIÓN DE DATOS DE LA PÁGINA
// -----------------------------------------------------

function limpiarTexto(texto) {
  if (!texto) return "";
  // No sustituimos el carácter � por letras al azar: no permite saber qué
  // carácter original se perdió. La decodificación se realiza en fetchHtml.
  return String(texto).normalize("NFC").replace(/\s+/g, " ").trim();
}

function textoCelda($, celda) {
  const copia = $(celda).clone();
  copia.find("br").replaceWith(" ");
  return limpiarTexto(copia.text());
}

function extraerModalidad($) {
  return limpiarTexto($("h6").first().text());
}

function extraerFase($, url) {
  if (!url.includes("idFaseEliminatoria")) {
    return "LIGAXKA";
  }

  const seleccionada = $('select[name="selFase"] option[selected]');
  if (seleccionada.length) {
    return limpiarTexto(seleccionada.text());
  }

  return "";
}

// Obtiene las fases que la propia página de la competición ofrece.
// Así evitamos consultar a ciegas los mismos 11 identificadores para cada
// competición (más de 1.200 peticiones innecesarias).
function extraerIdsFase($) {
  const ids = new Set();

  const registrar = (valor) => {
    if (valor === undefined || valor === null) return;
    const texto = String(valor);
    const coincidencias = texto.match(/\d{4,}/g) || [];
    coincidencias.forEach((numero) => {
      const id = Number(numero);
      if (Number.isSafeInteger(id) && id >= 10000) ids.add(id);
    });
  };

  $('select[name="selFase"] option').each((_, elemento) => {
    registrar($(elemento).attr("value"));
    registrar($(elemento).attr("data-id"));
    registrar($(elemento).attr("onclick"));
  });

  $("a[href], form[action]").each((_, elemento) => {
    registrar($(elemento).attr("href"));
    registrar($(elemento).attr("action"));
  });

  $("[onclick]").each((_, elemento) => {
    registrar($(elemento).attr("onclick"));
  });

  // También contempla enlaces o llamadas JavaScript que estén escritos
  // directamente en el HTML y no en un atributo visible.
  const html = $.html() || "";
  const regex = /idFaseEliminatoria\s*=\s*["']?(\d{4,})/gi;
  let coincidencia;
  while ((coincidencia = regex.exec(html)) !== null) {
    registrar(coincidencia[1]);
  }

  return [...ids].sort((a, b) => a - b);
}

function formatearEquipo(texto) {
  return limpiarTexto(texto);
}

function formatearSets(sets) {
  if (!sets || sets.length === 0) return [];
  return [sets.map((set) => `(${set})`).join(" ")];
}

function formatearModalidad(modalidad, fase) {
  if (!modalidad) return "";

  let modalidadLimpia = limpiarTexto(modalidad)
    .replace(/NKJ - TRINKETE\s+TRINKETE ESKUZ\s+/g, "")
    .replace(/TRINKETE ESKUZ\s+/g, "");

  if (!fase || fase === "LIGAXKA") {
    return `${modalidadLimpia} LIGAXKA`.trim();
  }

  return `${modalidadLimpia} ${fase}`.trim();
}

function extraerTanteoYSets($, celdaTanteo) {
  const tanteoCell = $(celdaTanteo);

  // Los tanteos pueden venir como texto directo o dentro de etiquetas HTML.
  // Quitamos los spans pequeños (donde suelen estar los tanteos de cada set)
  // y buscamos el resultado principal en el texto restante.
  const copiaTanteo = tanteoCell.clone();
  copiaTanteo.find(".small, small").remove();
  const textoPrincipal = copiaTanteo.text().replace(/\s+/g, " ").trim();
  let coincidencia = textoPrincipal.match(/(\d+)\s*[-–—]\s*(\d+)/);

  // Respaldo por si la Federación también envuelve el tanteo principal en
  // una etiqueta .small: quitamos primero los parciales entre paréntesis.
  if (!coincidencia) {
    const textoAlternativo = tanteoCell.text().replace(/\([^)]*\)/g, " ");
    coincidencia = textoAlternativo.match(/(\d+)\s*[-–—]\s*(\d+)/);
  }

  const tanteoa = coincidencia
    ? `${coincidencia[1]}-${coincidencia[2]}`
    : "";

  // Los parciales pueden estar en span.small o en etiquetas small.
  const parciales = tanteoCell.find(".small, small").map((_, elemento) => {
    return $(elemento).text();
  }).get().join(" ");

  const textoSets = parciales || tanteoCell.text();
  const coincidenciasSets = textoSets.match(/\(([^)]+)\)/g) || [];
  const setsTemp = coincidenciasSets.map((valor) => {
    return valor.replace(/[()]/g, "").trim();
  }).filter(Boolean);

  return { tanteoa, sets: formatearSets(setsTemp) };
}

function parsearPartidos($, modalidad, fase, url) {
  const partidos = [];

  $("table tr").each((_, row) => {
    const celdas = $(row).find("td");
    if (celdas.length < 5) return;

    const fechaTexto = limpiarTexto($(celdas[0]).text());
    const fecha = fechaTexto.substring(0, 10).replace(/\//g, "-");

    const fronton = textoCelda($, celdas[1]);
    const etxekoa = formatearEquipo(textoCelda($, celdas[2]));
    const kanpokoak = formatearEquipo(textoCelda($, celdas[4]));

    const contieneLarraunLocal = contieneLarraun(etxekoa);
    const contieneLarraunVisitante = contieneLarraun(kanpokoak);

    if (!contieneLarraunLocal && !contieneLarraunVisitante) return;

    const etxekoaFinal = aplicarEquivalencia(etxekoa);
    const kanpokoakFinal = aplicarEquivalencia(kanpokoak);

    const { tanteoa, sets } = extraerTanteoYSets($, celdas[3]);

    // Este archivo es de resultados: no añadimos partidos aún sin tanteo.
    if (!fecha || !tanteoa) return;

    let emaitza = "";
    const [puntosEtx, puntosKan] = tanteoa.split("-").map((valor) => Number(valor));

    const ambosLarraun = contieneLarraunLocal && contieneLarraunVisitante;

    if (ambosLarraun) {
      emaitza = "irabazita";
    } else {
      const ganaEtxekoa = puntosEtx > puntosKan;
      const ganaKanpokoa = puntosKan > puntosEtx;
      const larraunGana =
        (contieneLarraunLocal && ganaEtxekoa) ||
        (contieneLarraunVisitante && ganaKanpokoa);
      const larraunPierde =
        (contieneLarraunLocal && ganaKanpokoa) ||
        (contieneLarraunVisitante && ganaEtxekoa);

      if (larraunGana) {
        emaitza = "irabazita";
      } else if (larraunPierde) {
        emaitza = "galduta";
      } else {
        emaitza = "berdinketa";
      }
    }

    partidos.push({
      fecha,
      fronton,
      etxekoa: etxekoaFinal,
      kanpokoak: kanpokoakFinal,
      tanteoa,
      sets,
      modalidad: formatearModalidad(limpiarTexto(modalidad), limpiarTexto(fase)),
      fase: limpiarTexto(fase),
      url,
      emaitza,
      ofiziala: true,
      ...(etxekoa !== etxekoaFinal && { etxekoa_original: etxekoa }),
      ...(kanpokoak !== kanpokoakFinal && { kanpokoak_original: kanpokoak }),
    });
  });

  return partidos;
}

// -----------------------------------------------------
// PROCESAR UNA URL
// -----------------------------------------------------

async function scrapeUrl(url) {
  const html = await fetchHtml(url);
  if (!html) {
    return { ok: false, partidos: [], idsFase: [] };
  }

  const $ = cheerio.load(html);
  const modalidad = extraerModalidad($);
  const fase = extraerFase($, url);

  return {
    ok: true,
    partidos: parsearPartidos($, modalidad, fase, url),
    idsFase: extraerIdsFase($),
  };
}

// -----------------------------------------------------
// LECTURA Y CONSERVACIÓN DE DATOS ANTERIORES
// -----------------------------------------------------

async function leerResultadosAnteriores() {
  try {
    const contenido = await fs.readFile(OUTPUT_FILE, "utf-8");
    const datos = JSON.parse(contenido);
    return Array.isArray(datos) ? datos : [];
  } catch {
    return [];
  }
}

function obtenerIdCompeticion(url) {
  if (!url) return null;
  const coincidencia = String(url).match(/[?&]idCompeticion=(\d+)/i);
  return coincidencia ? Number(coincidencia[1]) : null;
}

function deduplicarPartidos(partidos) {
  const unicos = new Map();

  partidos.forEach((partido) => {
    const clave = [
      partido.fecha || "",
      partido.etxekoa || "",
      partido.kanpokoak || "",
      partido.modalidad || "",
    ].join("|").toUpperCase();

    // Si llega un resultado nuevo para el mismo partido, sustituye al anterior.
    unicos.set(clave, partido);
  });

  return [...unicos.values()];
}

async function guardarResultados(resultados) {
  const dataDir = path.dirname(OUTPUT_FILE);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(resultados, null, 2), "utf-8");
  console.log(`✅ Resultados guardados en ${OUTPUT_FILE}`);
  console.log(`📊 Total de partidos: ${resultados.length}`);
}

// -----------------------------------------------------
// EJECUCIÓN PRINCIPAL
// -----------------------------------------------------

async function main() {
  console.log("🔄 Iniciando scraping de resultados FNP...");
  await cargarEquivalencias();

  const resultadosNuevos = [];
  const competicionesConErrores = new Set();
  let paginasCorrectas = 0;
  let paginasFase = 0;

  for (
    let idComp = ID_COMPETICION_DESDE;
    idComp <= ID_COMPETICION_HASTA;
    idComp++
  ) {
    const urlLiga = `${BASE}&idCompeticion=${idComp}&temp=${TEMPORADA}`;
    console.log(`\n📋 Procesando competición ID: ${idComp}`);

    const paginaCompeticion = await scrapeUrl(urlLiga);

    if (!paginaCompeticion.ok) {
      competicionesConErrores.add(idComp);
      console.warn(`⚠️ Se conserva la información anterior de la competición ${idComp}, si existe.`);
      await esperar(PAUSA_ENTRE_COMPETICIONES_MS);
      continue;
    }

    paginasCorrectas++;
    resultadosNuevos.push(...paginaCompeticion.partidos);

    // Consultamos únicamente las fases cuyos identificadores aparecen en la
    // propia página de la competición. Ya no hacemos 11 peticiones a ciegas
    // para cada una de las 111 competiciones.
    for (const idFase of paginaCompeticion.idsFase) {
      const urlFase = `${BASE}&idCompeticion=${idComp}&idFaseEliminatoria=${idFase}&temp=${TEMPORADA}`;
      console.log(`🏆 Procesando fase ${idFase} (Competición ${idComp})`);

      const paginaFase = await scrapeUrl(urlFase);
      if (!paginaFase.ok) {
        competicionesConErrores.add(idComp);
        continue;
      }

      paginasCorrectas++;
      paginasFase++;
      resultadosNuevos.push(...paginaFase.partidos);
    }

    await esperar(PAUSA_ENTRE_COMPETICIONES_MS);
  }

  const anteriores = await leerResultadosAnteriores();

  // Si alguna competición no se pudo descargar ni siquiera tras los reintentos,
  // mantenemos sus resultados previos para no borrar datos por un fallo temporal.
  const anterioresDeCompeticionesFallidas = anteriores.filter((partido) => {
    const idComp = obtenerIdCompeticion(partido.url);
    return idComp !== null && competicionesConErrores.has(idComp);
  });

  const combinados = [
    ...anterioresDeCompeticionesFallidas,
    ...resultadosNuevos,
  ];

  const unique = deduplicarPartidos(combinados);

  unique.forEach((partido) => {
    if (partido.fecha && partido.fecha.length > 10) {
      partido.fecha = partido.fecha.substring(0, 10).replace(/\//g, "-");
    }
    delete partido.fase;
  });

  // Protección adicional: si ninguna página ha podido descargarse, o el
  // resultado queda vacío pese a existir datos anteriores, no sobrescribimos.
  if (paginasCorrectas === 0) {
    console.error("❌ Ninguna página se ha podido descargar. No se modifica resultados-larraun.json.");
    return;
  }

  if (unique.length === 0 && anteriores.length > 0) {
    console.error("❌ El scraping no ha encontrado resultados. Se conserva el JSON anterior para evitar borrarlo por error.");
    return;
  }

  await guardarResultados(unique);

  const partidosTransformados = unique.filter(
    (partido) => partido.etxekoa_original || partido.kanpokoak_original
  );

  console.log("\n📊 RESUMEN DEL PROCESO");
  console.log(`   Páginas descargadas correctamente: ${paginasCorrectas}`);
  console.log(`   Páginas de fase procesadas: ${paginasFase}`);
  console.log(`   Competiciones con algún error de descarga: ${competicionesConErrores.size}`);
  if (competicionesConErrores.size) {
    console.log(`   IDs con errores: ${[...competicionesConErrores].sort((a, b) => a - b).join(", ")}`);
  }
  console.log(`   Partidos con nombres transformados: ${partidosTransformados.length}`);

  partidosTransformados.slice(0, 5).forEach((partido) => {
    if (partido.etxekoa_original) {
      console.log(`   Local: "${partido.etxekoa_original}" → "${partido.etxekoa}"`);
    }
    if (partido.kanpokoak_original) {
      console.log(`   Visitante: "${partido.kanpokoak_original}" → "${partido.kanpokoak}"`);
    }
  });
}

main().catch((error) => {
  console.error("❌ Error inesperado en el scraper:", error);
  process.exitCode = 1;
});
