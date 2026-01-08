fetch("data/pelotariak-kalkulatuta.json")
  .then(res => res.json())
  .then(pelotariak => {

    const mapa = {};
    pelotariak.forEach(p => {
      mapa[p.izena.toUpperCase()] = p;
    });

    document.querySelectorAll(".pelotari").forEach(el => {
      const izena = el.textContent.trim().toUpperCase();
      const p = mapa[izena];

      if (!p) return;

      el.style.backgroundColor = p.kolorea;
      el.style.padding = "2px 6px";
      el.style.borderRadius = "6px";
      el.style.display = "inline-block";

      el.title = `${p.kategoria} (${p.adina} urte)`;

      el.classList.add("categoria-" + p.kategoria.toLowerCase());
    });

  })
  .catch(err => {
    console.error("❌ Pelotariak ezin kargatu:", err);
  });
