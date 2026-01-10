import https from "https";
import { JSDOM } from "jsdom";

https.get(
  "https://www.fnpelota.com/pub/ModalidadComp.asp?idioma=eu&idCompeticion=3060",
  res => {
    let data = "";
    res.on("data", c => data += c);
    res.on("end", () => {
      const dom = new JSDOM(data);
      console.log(dom.window.document.querySelectorAll("table tr").length);
    });
  }
);
