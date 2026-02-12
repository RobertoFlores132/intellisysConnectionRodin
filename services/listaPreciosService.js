import axios from "axios";
import qs from "qs";
import { obtenerToken } from "./authService.js";

/**
 * Obtener lista de precios por cliente (CORREGIDO - usa GET)
 * @param {string} codigoCliente - Código del cliente en Rodin
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<Array>} - Array de productos con precios
 */
export async function obtenerListaPreciosPorCliente(codigoCliente, options = {}) {
  const url = "https://rodin.com.mx/b2b/api/get_lista_precios.php";
  const token = await obtenerToken();

  if (!token) {
    throw new Error("❌ No se pudo obtener token de autenticación");
  }

  // Construir parámetros según la documentación PHP
  const params = {
    cliente: codigoCliente,
    pagina: options.pagina || 1,
    ...(options.articulo && { articulo: options.articulo }),
    ...(options.ultima_actualizacion && { ultima_actualizacion: options.ultima_actualizacion })
  };

  // Crear query string
  const queryString = new URLSearchParams(params).toString();
  const fullUrl = `${url}?${queryString}`;

  console.log(`🔍 Solicitando lista de precios:`, {
    url: fullUrl,
    cliente: codigoCliente,
    params: params
  });

  try {
    const response = await axios.get(fullUrl, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      },
      timeout: options.timeout || 30000,
    });

    console.log(`📊 Respuesta lista precios para ${codigoCliente}:`, {
      status: response.status,
      tieneData: !!response.data,
      dataKeys: response.data ? Object.keys(response.data) : 'no data'
    });

    // Manejar respuesta
    if (response.data) {
      // Si es string, parsear
      if (typeof response.data === 'string') {
        try {
          const parsed = JSON.parse(response.data);
          if (parsed.lista_precios && Array.isArray(parsed.lista_precios)) {
            console.log(`✅ Lista de precios obtenida: ${parsed.lista_precios.length} productos`);
            return parsed.lista_precios;
          }
          return parsed;
        } catch (parseError) {
          console.error(`❌ Error parseando JSON:`, parseError.message);
          return [];
        }
      }
      
      // Si ya es objeto
      if (response.data.lista_precios && Array.isArray(response.data.lista_precios)) {
        console.log(`✅ Lista de precios obtenida: ${response.data.lista_precios.length} productos`);
        return response.data.lista_precios;
      }
      
      // Si es array directo
      if (Array.isArray(response.data)) {
        console.log(`✅ Array directo: ${response.data.length} productos`);
        return response.data;
      }
      
      // Si hay error
      if (response.data.error) {
        console.error(`❌ Error en respuesta Rodin:`, response.data.error);
        throw new Error(response.data.error);
      }
    }

    console.warn("⚠️ Respuesta vacía o formato no reconocido");
    return [];

  } catch (error) {
    console.error("❌ Error al obtener lista de precios:", {
      cliente: codigoCliente,
      errorMessage: error.message,
      responseStatus: error.response?.status,
      responseData: error.response?.data
    });

    if (error.response) {
      if (error.response.status === 401) {
        throw new Error("Token expirado o inválido");
      } else if (error.response.status === 404) {
        throw new Error(`Cliente ${codigoCliente} no encontrado`);
      } else if (error.response.status === 400) {
        throw new Error(`Solicitud inválida para cliente ${codigoCliente}`);
      }
    }

    throw new Error(`Error al obtener lista de precios: ${error.message}`);
  }
}

/**
 * Obtener lista de precios por email del cliente
 */
export async function obtenerListaPreciosPorEmail(email, options = {}) {
  try {
    const { obtenerClientePorEmail } = await import("./clientesService.js");
    
    // Buscar cliente por email
    const cliente = await obtenerClientePorEmail(email);
    
    if (!cliente) {
      throw new Error(`Cliente con email ${email} no encontrado`);
    }

    if (!cliente.cliente) {
      throw new Error(`Cliente encontrado pero sin código (ID) asociado`);
    }

    console.log(`✅ Cliente encontrado: ${cliente.nombre} (${cliente.cliente})`);
    
    // Obtener lista de precios
    const listaPrecios = await obtenerListaPreciosPorCliente(cliente.cliente, options);
    
    // Enriquecer respuesta
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
 * Buscar producto específico por SKU
 */
export async function buscarProductoEnLista(codigoCliente, sku) {
  try {
    const listaPrecios = await obtenerListaPreciosPorCliente(codigoCliente, {
      articulo: sku
    });

    if (!Array.isArray(listaPrecios) || listaPrecios.length === 0) {
      return null;
    }

    // Encontrar el producto exacto
    return listaPrecios.find(producto => 
      producto.articulo?.toString() === sku.toString()
    ) || null;

  } catch (error) {
    console.error("❌ Error en buscarProductoEnLista:", error);
    throw error;
  }
}