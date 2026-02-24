import axios from "axios"
import * as cheerio from "cheerio"

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
  let titulo = $("h1").first().text().trim()

  if (!titulo) {
    titulo = $(".titulo").first().text().trim()
  }

  if (!titulo) {
    titulo = $("title").text().trim()
  }

  return titulo || ""
}

// -----------------------------------------------------

function extraerFase($, url) {
  // Si no hay parámetro de fase → es liga
  if (!url.includes("idFaseEliminatoria")) {
    return "LIGAXKA"
  }

  // Buscar option selected
  const selected = $('select[name="selFase"] option[selected]')

  if (selected.length) {
    return selected.text().trim()
  }

  return ""
}
// -----------------------------------------------------

function parsearPartidos($, modalidad, fase, url) {
  const partidos = []

  $("table tr").each((_, row) => {
    const celdas = $(row).find("td")

    if (celdas.length < 5) return

    const fecha = $(celdas[0]).text().trim()
    const fronton = $(celdas[1]).text().trim()
    const etxekoa = $(celdas[2]).find("b").text().trim()
const kanpokoak = $(celdas[4]).find("b").text().trim()
const tanteoa = tanteoCell
  .contents()
  .filter(function () {
    return this.type === "text"
  })
  .text()
  .trim()

const sets = []

tanteoCell.find("span.small").each((_, el) => {
  const texto = $(el).text()
  const matches = texto.match(/\((.*?)\)/g)

  if (matches) {
    matches.forEach((m) => {
      sets.push(m.replace(/[()]/g, "").trim())
    })
  }
})
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
