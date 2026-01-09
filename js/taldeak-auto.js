document.addEventListener("DOMContentLoaded", () => {

  Promise.all([
    fetch("data/pelotariak-kalkulatuta.json").then(r => r.json()),
    fetch("data/grupos.json").then(r => r.json())
  ]).then(([pelotariak, grupos]) => {

    const mapa = {};
    pelotariak.forEach(p => {
      mapa[p.izena.toUpperCase()] = p;
    });

    const contenedor = document.getElementById("taldeak-auto");
    if (!contenedor) {
      console.error("❌ No existe #taldeak-auto");
      return;
    }

    Object.entries(grupos).forEach(([modalitatea, taldeak]) => {
      Object.entries(taldeak).forEach(([izena, lista]) => {

        const blokea = document.createElement("div");
        blokea.className = "talde-blokea";

        blokea.innerHTML = `
          <div class="talde-titulua">
            ${modalitatea.toUpperCase()} · Taldea ${izena}
          </div>
          <div class="pelotari-lista"></div>
        `;

        const listaDiv = blokea.querySelector(".pelotari-lista");

        lista.forEach(n => {
          const p = mapa[n.toUpperCase()];
          if (!p) return;

          const span = document.createElement("span");
          span.className = "pelotari";
          span.textContent = p.izena;
          span.style.backgroundColor = p.kolorea;
          span.style.padding = "4px 8px";
          span.style.borderRadius = "6px";
          span.title = `${p.kategoria} · ${p.adina} urte`;

          listaDiv.appendChild(span);
        });

        contenedor.appendChild(blokea);
      });
    });

  }).catch(err => {
    console.error("❌ Error cargando grupos:", err);
  });

});
