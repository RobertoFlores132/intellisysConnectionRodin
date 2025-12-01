import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import clientesRouter from "./routes/clientes.js";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas
app.use("/api", clientesRouter);

// Endpoint base
app.get("/", (req, res) => {
  res.json({ message: "API Rodin funcionando correctamente 😎" });
});

// Render usa este puerto automáticamente
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});