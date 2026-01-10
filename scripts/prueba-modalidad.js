import https from "https";
import { JSDOM } from "jsdom";

const URL =
  "https://www.fnpelota.com/pub/ModalidadComp.asp?idioma=eu&idCompeticion=3060";

https.get(URL, res => {
  let data = "";
  res.on("data", c => data += c);
  res.on("end", () => {
    const dom = new JSDOM(data);
    const filas = dom.window.document.querySelectorAll("table tr");
    console.log("Filas encontradas:", filas.length);

    // imprime las primeras 3 filas para ver contenido real
    filas.forEach((f, i) => {
      if (i < 3) {
        console.log(
          i,
          f.textContent.replace(/\s+/g, " ").trim()
        );
      }
    });
  });
}).on("error", console.error);
