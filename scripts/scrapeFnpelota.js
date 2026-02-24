const axios = require("axios")
const cheerio = require("cheerio")

const BASE =
  "https://www.fnpelota.com/pub/modalidadComp.asp?idioma=eu"

const TEMPORADA = 2025

// 🔎 RANGOS CONFIGURABLES
const ID_COMPETICION_DESDE = 3059
const ID_COMPETICION_HASTA = 3060

const ID_FASE_DESDE = 20613
const ID_FASE_HASTA = 20616

// -----------------------------------------------------

async function fetchHtml(url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      timeout: 15000,
    })
    return data
  } catch (err) {
    console.log("Error cargando:", url)
    return null
  }
}

// -----------------------------------------------------

function extraerModalidad($) {
  const titulo = $("h1").first().text().trim()
  return titulo || ""
}

// -----------------------------------------------------

function extraerFase($, url) {
  // Si NO es eliminatoria → LIGAXKA
  if (!url.includes("idFaseEliminatoria")) {
    return "LIGAXKA"
  }

  // Intento 1: opción selected
  let fase = $('select[name="idFaseEliminatoria"] option:selected')
    .text()
    .trim()

  if (fase) return fase

  // Intento 2: buscar option que coincida con el id de la URL
  const idMatch = url.match(/idFaseEliminatoria=(\d+)/)
  if (idMatch) {
    const idBuscado = idMatch[1]

    $('select[name="idFaseEliminatoria"] option').each((_, el) => {
      const value = $(el).attr("value")
      if (value === idBuscado) {
        fase = $(el).text().trim()
      }
    })
  }

  return fase || ""
}

// -----------------------------------------------------

function parsearPartidos($, modalidad, fase, url) {
  const partidos = []

  $("table tr").each((_, row) => {
    const celdas = $(row).find("td")

    if (celdas.length < 6) return

    const fecha = $(celdas[0]).text().trim()
    const fronton = $(celdas[1]).text().trim()
    const etxekoa = $(celdas[2]).text().trim()
    const kanpokoak = $(celdas[3]).text().trim()
    const tanteoa = $(celdas[4]).text().trim()
    const setsRaw = $(celdas[5]).text().trim()

    if (!fecha || !tanteoa) return

    const sets = setsRaw
      .split(/\s+/)
      .filter((s) => s.includes("-"))

    const [etx, kan] = tanteoa.split("-").map((x) => x.trim())

    let emaitza = ""
    if (etx && kan) {
      emaitza = Number(etx) > Number(kan) ? "irabazita" : "galduta"
    }

    partidos.push({
      fecha,
      fronton,
      etxekoa,
      kanpokoak,
      tanteoa,
      sets,
      modalidad,
      fase,
      url,
      emaitza,
      ofiziala: true,
    })
  })

  return partidos
}

// -----------------------------------------------------

async function scrapeUrl(url) {
  const html = await fetchHtml(url)
  if (!html) return []

  const $ = cheerio.load(html)

  const modalidad = extraerModalidad($)
  const fase = extraerFase($, url)

  return parsearPartidos($, modalidad, fase, url)
}

// -----------------------------------------------------

async function main() {
  const resultados = []
  const urlsVisitadas = new Set()

  for (
    let idComp = ID_COMPETICION_DESDE;
    idComp <= ID_COMPETICION_HASTA;
    idComp++
  ) {
    // 1️⃣ LIGAXKA
    const urlLiga = `${BASE}&idCompeticion=${idComp}&temp=${TEMPORADA}`

    if (!urlsVisitadas.has(urlLiga)) {
      urlsVisitadas.add(urlLiga)
      const partidos = await scrapeUrl(urlLiga)
      resultados.push(...partidos)
    }

    // 2️⃣ ELIMINATORIAS
    for (
      let idFase = ID_FASE_DESDE;
      idFase <= ID_FASE_HASTA;
      idFase++
    ) {
      const urlFase = `${BASE}&idCompeticion=${idComp}&idFaseEliminatoria=${idFase}&temp=${TEMPORADA}`

      if (!urlsVisitadas.has(urlFase)) {
        urlsVisitadas.add(urlFase)
        const partidos = await scrapeUrl(urlFase)
        resultados.push(...partidos)
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
  )

  console.log(JSON.stringify(unique, null, 2))
}

main()
