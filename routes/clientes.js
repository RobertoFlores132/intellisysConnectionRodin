import express from "express";
import { obtenerClientes, obtenerClientePorEmail } from "../services/clientesService.js";

const router = express.Router();

// === EXISTENTE ===
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

// === NUEVO: buscar por email ===
router.get("/clientes/by-email/:email", async (req, res) => {
  const { email } = req.params;

  try {
    const cliente = await obtenerClientePorEmail(email);

    if (!cliente) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    res.json({ cliente });
  } catch (error) {
    console.error("Error en /clientes/by-email:", error);
    res.status(500).json({ error: "Error buscando cliente por email" });
  }
});

export default router;