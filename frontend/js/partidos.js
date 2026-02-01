const API = "https://larraun-api.onrender.com";

document.getElementById("partidoForm").addEventListener("submit", async e => {
  e.preventDefault();

  const partido = {
    fecha: document.getElementById("fecha").value.replaceAll("-", "/"),
    hora: document.getElementById("hora").value,
    zkia: document.getElementById("zkia").value,
    fronton: document.getElementById("fronton").value,
    etxekoa: document.getElementById("etxekoa").value,
    kanpokoak: document.getElementById("kanpokoak").value,
    lehiaketa: document.getElementById("lehiaketa").value,
    ofiziala: document.getElementById("ofiziala").value
  };

  await fetch(`${API}/partidos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partido)
  });

  alert("Partido guardado ✔️");
  e.target.reset();
});
