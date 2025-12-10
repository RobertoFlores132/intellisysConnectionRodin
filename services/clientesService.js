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


export async function obtenerClientePorEmail(email) {
  try {
    // 1. Obtener la primera página
    const clientes = await obtenerClientes({ pagina: 1 });

    if (!clientes || clientes.length === 0) {
      console.log("⚠️ No se recibieron clientes");
      return null;
    }

    // 2. Hacer match exacto por correo (corregido)
    const cliente = clientes.find(
      c => 
        c.contacto1_correo?.toLowerCase() === email.toLowerCase() || 
        c.contacto2_correo?.toLowerCase() === email.toLowerCase()
    );

    if (cliente) {
      console.log(`✅ Cliente encontrado: ${cliente.nombre} (${cliente.cliente})`);
    } else {
      console.log(`⚠️ Cliente no encontrado para email: ${email}`);
      // Mostrar los primeros correos disponibles para debug
      console.log("Primeros 5 clientes con correos:");
      clientes.slice(0, 5).forEach((c, i) => {
        console.log(`${i+1}. ${c.nombre} - contacto1: ${c.contacto1_correo}, contacto2: ${c.contacto2_correo}`);
      });
    }

    return cliente || null;
  } catch (error) {
    console.error("❌ Error buscando cliente por email:", error);
    return null;
  }
}