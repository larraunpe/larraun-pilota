import express from "express";
import cors from "cors";
import fs from "fs-extra";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const dataPath = path.resolve("./data");

const partidosFile = path.join(dataPath, "partidos-no-oficiales.json");
const resultadosFile = path.join(dataPath, "resultados-no-oficiales.json");

/* ---- PARTIDOS ---- */

// Obtener partidos
app.get("/partidos", async (req, res) => {
  const data = await fs.readJson(partidosFile);
  res.json(data);
});

// Añadir partido
app.post("/partidos", async (req, res) => {
  const partido = req.body;
  const data = await fs.readJson(partidosFile);
  data.push(partido);
  await fs.writeJson(partidosFile, data, { spaces: 2 });
  res.json({ ok: true });
});

/* ---- RESULTADOS ---- */

// Obtener resultados
app.get("/resultados", async (req, res) => {
  const data = await fs.readJson(resultadosFile);
  res.json(data);
});

// Añadir resultado
app.post("/resultados", async (req, res) => {
  const resultado = req.body;
  const data = await fs.readJson(resultadosFile);
  data.push(resultado);
  await fs.writeJson(resultadosFile, data, { spaces: 2 });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`API Larraun funcionando en puerto ${PORT}`);
});
