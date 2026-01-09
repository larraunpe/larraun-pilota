fetch("data/kategoriak.json")
  .then(r => r.json())
  .then(kategoriak => {

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1; // 1–12

    // año de referencia según temporada
    const refYear = month >= 9 ? year + 1 : year;

    const container = document.getElementById("kategoriak-container");

    kategoriak.forEach(k => {
      const urteMax = refYear - k.min;
      const urteMin = refYear - k.max;

      const euText = `Jaiotze urtea: ${urteMin} – ${urteMax}`;
      const esText = `Año de nacimiento: ${urteMin} – ${urteMax}`;

      const card = document.createElement("div");
      card.className = "kategoria-card";

      card.innerHTML = `
        <div class="kategoria" style="background:${k.kolorea}">
          ${k.izena}
        </div>
        <p class="eu">${euText}</p>
        <p class="es">${esText}</p>
      `;

      container.appendChild(card);
    });
  });
