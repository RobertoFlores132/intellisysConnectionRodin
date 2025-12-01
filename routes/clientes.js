import express from "express";
import { obtenerClientes } from "../services/clientesService.js";

const router = express.Router();

router.get("/clientes", async (req, res) => {
  const { pagina, cliente, fecha } = req.query;

  try {
    const clientes = await obtenerClientes({
      pagina: pagina || 1,
      cliente: cliente || null,
      fecha: fecha || null
    });

    res.json({ clientes });
  } catch (error) {
    res.status(500).json({ error: "Error obteniendo clientes" });
  }
});

export default router;