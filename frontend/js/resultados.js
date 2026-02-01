const API = "https://larraun-api.onrender.com";
const lista = document.getElementById("lista");

fetch(`${API}/partidos`)
  .then(r => r.json())
  .then(partidos => {
    partidos.forEach(p => {
      const div = document.createElement("div");
      div.innerHTML = `
        <strong>${p.fecha} – ${p.fronton}</strong><br>
        ${p.etxekoa} vs ${p.kanpokoak}<br>
        <button>Resultado</button>
      `;
      div.querySelector("button").onclick = () => crearResultado(p);
      lista.appendChild(div);
    });
  });

function crearResultado(p) {
  const tanteoa = prompt("Tanteoa:");
  const sets = prompt("Sets:");
  const emaitza = prompt("irabazita / galduta:");
  const url = prompt("URL:");

  const resultado = {
    fecha: p.fecha.replaceAll("/", "-"),
    fronton: p.fronton,
    etxekoa: p.etxekoa,
    kanpokoak: p.kanpokoak,
    tanteoa,
    sets: sets ? [sets] : [],
    modalidad: p.lehiaketa,
    emaitza,
    ofiziala: p.ofiziala,
    url
  };

  fetch(`${API}/resultados`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(resultado)
  }).then(() => alert("Resultado guardado ✔️"));
}
