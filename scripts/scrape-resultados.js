import axios from "axios"
import * as cheerio from "cheerio"
import iconv from "iconv-lite"

const BASE =
  "https://www.fnpelota.com/pub/modalidadComp.asp?idioma=eu"

const TEMPORADA = 2025

const ID_COMPETICION_DESDE = 3059
const ID_COMPETICION_HASTA = 3060

const ID_FASE_DESDE = 20613
const ID_FASE_HASTA = 20616

// -----------------------------------------------------

async function fetchHtml(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      responseType: "arraybuffer",
      timeout: 15000,
    })

    // 🔥 decodificación correcta real para esta web
    const html = iconv.decode(response.data, "win1252")

    return html
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

  return titulo.replace(/\s+/g, " ").trim()
}

// -----------------------------------------------------

function extraerFase($, url) {
  if (!url.includes("idFaseEliminatoria")) {
    return "LIGAXKA"
  }

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

    // 🔹 FECHA: solo 10 caracteres (YYYY/MM/DD)
    let fecha = $(celdas[0])
      .clone()
      .find("br")
      .remove()
      .end()
      .text()
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 10) // <-- mantiene solo YYYY/MM/DD

    // 🔹 FRONTÓN
    let fronton = $(celdas[1])
      .text()
      .replace(/\s+/g, " ")
      .trim()

    // 🔹 EQUIPOS
    let etxekoa = $(celdas[2])
      .clone()
      .find("br")
      .replaceWith(" ")
      .end()
      .text()
      .replace(/\s+/g, " ")
      .trim()

    let kanpokoak = $(celdas[4])
      .clone()
      .find("br")
      .replaceWith(" ")
      .end()
      .text()
      .replace(/\s+/g, " ")
      .trim()

    // 🔹 TANTEO
    const tanteoCell = $(celdas[3])
    const tanteoa = tanteoCell
      .contents()
      .filter(function () {
        return this.type === "text"
      })
      .text()
      .replace(/\s+/g, " ")
      .trim()

    // 🔹 SETS
    const sets = []
    tanteoCell.find("span.small").each((_, el) => {
      const texto = $(el).text()
      const matches = texto.match(/\((.*?)\)/g)
      if (matches) {
        matches.forEach((m) => sets.push(m.replace(/[()]/g, "").trim()))
      }
    })

    if (!fecha || !tanteoa) return

    // 🔹 EMATZA
    const [etx, kan] = tanteoa.split("-").map((x) => x.trim())
    const emaitza =
      etx && kan ? (Number(etx) > Number(kan) ? "irabazita" : "galduta") : ""

    // 🔹 Reemplazar � por ñ
    fronton = fronton.replace(/�/g, "ñ")
    etxekoa = etxekoa.replace(/�/g, "ñ")
    kanpokoak = kanpokoak.replace(/�/g, "ñ")

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
    const urlLiga = `${BASE}&idCompeticion=${idComp}&temp=${TEMPORADA}`

    if (!urlsVisitadas.has(urlLiga)) {
      urlsVisitadas.add(urlLiga)
      const partidos = await scrapeUrl(urlLiga)
      resultados.push(...partidos)
    }

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
