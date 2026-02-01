import fetch from "node-fetch";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";

async function getFile(path) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json"
      }
    }
  );
  return await res.json();
}

async function saveFile(path, content, sha, message) {
  await fetch(
    `https://api.github.com/repos/${REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        content: Buffer.from(JSON.stringify(content, null, 2)).toString("base64"),
        sha,
        branch: BRANCH
      })
    }
  );
}

import express from "express";
import cors from "cors";
import fs from "fs-extra";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: "https://larraunpilota.eus",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());
app.options("*", cors());

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
