import axios from "axios";
import qs from "qs";
import { obtenerToken } from "./authService.js";

export async function obtenerClientes({ pagina = 1, cliente = null, fecha = null }) {
  const url = "https://rodin.com.mx/b2b/api/get_clientes.php";
  const token = await obtenerToken();

  if (!token) throw new Error("❌ No se pudo obtener token");

  const data = qs.stringify({
    pagina,
    cliente,
    fecha
  });

  try {
    const response = await axios.post(url, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Bearer ${token}`
      },
      timeout: 15000
    });

    return response.data.clientes;
  } catch (error) {
    console.error("❌ Error al obtener clientes:", error.response?.data || error);
    return [];
  }
}

// =======================================================
//   🔍 NUEVO: Buscar cliente por email 
// =======================================================
export async function obtenerClientePorEmail(email) {
  try {
    // 1. Obtener la primera página (Rodin suele devolver TODO)
    const clientes = await obtenerClientes({ pagina: 1 });

    if (!clientes || clientes.length === 0) {
      console.log("⚠️ No se recibieron clientes");
      return null;
    }

    // 2. Hacer match exacto por correo
    const cliente = clientes.find(
      c => c.correo?.toLowerCase() === email.toLowerCase()
    );

    return cliente || null;
  } catch (error) {
    console.error("❌ Error buscando cliente por email:", error);
    return null;
  }
}
