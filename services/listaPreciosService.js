import axios from "axios";
import qs from "qs";
import { obtenerToken } from "./authService.js";

/**
 * Obtener lista de precios por cliente
 * @param {string} codigoCliente - Código del cliente en Rodin
 * @returns {Promise<Array>} - Array de productos con precios
 */
export async function obtenerListaPreciosPorCliente(codigoCliente) {
  const url = "https://rodin.com.mx/b2b/api/get_lista_precios.php";
  const token = await obtenerToken();

  if (!token) {
    throw new Error("❌ No se pudo obtener token de autenticación");
  }

  // Preparar los datos según lo que espera la API de Rodin
  const data = qs.stringify({
    cliente: codigoCliente
  });

  try {
    console.log(`🔍 Solicitando lista de precios para cliente: ${codigoCliente}`);

    const response = await axios.post(url, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Bearer ${token}`
      },
      timeout: 30000 // 30 segundos timeout para listas grandes
    });

    // Depuración: ver qué responde la API
    console.log(`📊 Respuesta lista precios para ${codigoCliente}:`, {
      status: response.status,
      tieneData: !!response.data,
      estructura: response.data ? Object.keys(response.data) : 'sin data'
    });

    // Manejar el formato específico de la API de Rodin
    if (response.data && response.data.lista_precios) {
      // Formato: {"lista_precios": [{...}, {...}]}
      console.log(`✅ Lista de precios obtenida: ${response.data.lista_precios.length} productos`);
      return response.data.lista_precios;
    } else if (response.data && Array.isArray(response.data)) {
      // Si la respuesta es directamente un array
      console.log(`✅ Lista de precios obtenida: ${response.data.length} productos (formato array)`);
      return response.data;
    } else if (response.data && response.data.error) {
      // Si hay error en la respuesta
      throw new Error(response.data.error || "Error en la API de Rodin");
    } else {
      console.warn("⚠️ Formato de respuesta no reconocido o lista vacía");
      return [];
    }

  } catch (error) {
    console.error("❌ Error al obtener lista de precios:", {
      cliente: codigoCliente,
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });

    // Manejar errores específicos
    if (error.response) {
      if (error.response.status === 401) {
        throw new Error("Token expirado o inválido");
      } else if (error.response.status === 404) {
        throw new Error(`Cliente ${codigoCliente} no encontrado`);
      } else if (error.response.status === 400) {
        throw new Error(`Solicitud inválida para cliente ${codigoCliente}`);
      } else if (error.response.data && error.response.data.error) {
        throw new Error(error.response.data.error);
      }
    }

    throw new Error(`Error al obtener lista de precios: ${error.message}`);
  }
}

/**
 * Obtener lista de precios por email del cliente
 * Primero busca el cliente por email, luego obtiene su lista de precios
 */
export async function obtenerListaPreciosPorEmail(email) {
  try {
    // Importar dinámicamente para evitar dependencias circulares
    const { obtenerClientePorEmail } = await import("./clientesService.js");
    
    // 1. Buscar cliente por email
    const cliente = await obtenerClientePorEmail(email);
    
    if (!cliente) {
      throw new Error(`Cliente con email ${email} no encontrado`);
    }

    if (!cliente.cliente) {
      throw new Error(`Cliente encontrado pero sin código (ID) asociado`);
    }

    console.log(`✅ Cliente encontrado: ${cliente.nombre} (${cliente.cliente})`);
    
    // 2. Obtener lista de precios usando el código del cliente
    const listaPrecios = await obtenerListaPreciosPorCliente(cliente.cliente);
    
    // 3. Enriquecer la respuesta con información del cliente
    return {
      cliente: {
        codigo: cliente.cliente,
        nombre: cliente.nombre,
        email: cliente.contacto1_correo || cliente.contacto2_correo || email,
        telefono: cliente.contacto_telefonos,
        direccion: {
          calle: cliente.calle,
          numero_exterior: cliente.exterior,
          numero_interior: cliente.interior,
          colonia: cliente.colonia,
          municipio: cliente.delegacion,
          estado: cliente.estado,
          pais: cliente.pais,
          cp: cliente.cp
        },
        condiciones: {
          credito: cliente.credito_disponible > 0 ? 'Con crédito' : 'Sin crédito',
          credito_disponible: cliente.credito_disponible,
          credito_asignado: cliente.credito_asignado,
          condicion_pago: cliente.condicion,
          descuento: cliente.descuento,
          lista_precios: cliente.lista_precios,
          status: cliente.status
        }
      },
      lista_precios: listaPrecios,
      total_productos: Array.isArray(listaPrecios) ? listaPrecios.length : 0,
      timestamp: new Date().toISOString(),
      ultima_actualizacion: Array.isArray(listaPrecios) && listaPrecios.length > 0 
        ? listaPrecios[0].ultima_actualizacion 
        : null
    };

  } catch (error) {
    console.error("❌ Error en obtenerListaPreciosPorEmail:", error);
    throw error;
  }
}

/**
 * Buscar productos en la lista de precios por SKU o nombre
 */
export async function buscarEnListaPrecios(codigoCliente, filtros = {}) {
  try {
    const listaPrecios = await obtenerListaPreciosPorCliente(codigoCliente);
    
    if (!Array.isArray(listaPrecios) || listaPrecios.length === 0) {
      return [];
    }

    let resultados = [...listaPrecios];
    
    // Aplicar filtros
    if (filtros.sku) {
      const skuLower = filtros.sku.toLowerCase();
      resultados = resultados.filter(producto =>
        producto.articulo?.toString().toLowerCase().includes(skuLower)
      );
    }
    
    if (filtros.nombre) {
      const nombreLower = filtros.nombre.toLowerCase();
      resultados = resultados.filter(producto =>
        producto.nombre?.toLowerCase().includes(nombreLower)
      );
    }
    
    if (filtros.marca) {
      const marcaLower = filtros.marca.toLowerCase();
      resultados = resultados.filter(producto =>
        producto.marca?.toLowerCase().includes(marcaLower)
      );
    }

    return resultados;
  } catch (error) {
    console.error("❌ Error en buscarEnListaPrecios:", error);
    throw error;
  }
}