import fs from "fs";

// ---------- CARGA DE DATOS ----------
const pelotariak = JSON.parse(
  fs.readFileSync("data/pelotariak.json", "utf-8")
);

const kategoriak = JSON.parse(
  fs.readFileSync("data/kategoriak.json", "utf-8")
);

// ---------- FECHA Y TEMPORADA ----------
const gaur = new Date();
const urtea = gaur.getFullYear();
const hilabetea = gaur.getMonth() + 1; // 1-12

function kalkulatuAdina(jaiotzaUrtea) {
  // Temporada: 1 sep → 31 ago
  if (hilabetea >= 9) {
    // septiembre–diciembre
    return urtea + 1 - jaiotzaUrtea;
  } else {
    // enero–agosto
    return urtea - jaiotzaUrtea;
  }
}

// ---------- BUSCAR CATEGORÍA ----------
function aurkituKategoria(adina) {
  return kategoriak.find(
    k => adina >= k.min && adina <= k.max
  );
}

// ---------- PROCESO PRINCIPAL ----------
const emaitza = pelotariak.map(p => {
  const adina = kalkulatuAdina(p.urtea);
  const kategoria = aurkituKategoria(adina);

  if (!kategoria) {
    console.warn(
      `⚠️  Kategoriarik ez: ${p.izena} (${adina} urte)`
    );
  }

  return {
    id: p.id,
    izena: p.izena,
    urtea: p.urtea,
    adina,
    kategoria: kategoria?.izena || "EZEZAGUNA",
    kolorea: kategoria?.kolorea || "#999999",
    modalitateak: p.modalitateak,
    oharrak: p.oharrak || ""
  };
});

// ---------- GUARDAR ----------
fs.writeFileSync(
  "data/pelotariak-kalkulatuta.json",
  JSON.stringify(emaitza, null, 2)
);

console.log(
  `✔️ Pelotariak kalkulatuta: ${emaitza.length}`
);
