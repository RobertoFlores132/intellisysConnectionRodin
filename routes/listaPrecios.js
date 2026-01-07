import express from "express";
import { 
  obtenerListaPreciosPorCliente, 
  obtenerListaPreciosPorEmail,
  buscarProductoEnLista
} from "../services/listaPreciosService.js";

const router = express.Router();

/**
 * GET /api/lista-precios/cliente/:codigoCliente
 * Obtener lista de precios por código de cliente
 */
router.get("/lista-precios/cliente/:codigoCliente", async (req, res) => {
  const { codigoCliente } = req.params;
  const { 
    pagina = 1, 
    limite = 50, 
    sku,
    nombre,
    desde_fecha 
  } = req.query;

  try {
    if (!codigoCliente) {
      return res.status(400).json({
        error: "Código de cliente requerido"
      });
    }

    console.log(`📋 Solicitando lista de precios para: ${codigoCliente}`);
    
    // Opciones para la API de Rodin
    const options = {
      pagina: pagina,
      ...(sku && { articulo: sku }),
      ...(desde_fecha && { ultima_actualizacion: desde_fecha })
    };

    const listaPrecios = await obtenerListaPreciosPorCliente(codigoCliente, options);

    // Aplicar filtros adicionales si es necesario
    let productosFiltrados = Array.isArray(listaPrecios) ? listaPrecios : [];
    
    if (nombre && productosFiltrados.length > 0) {
      const nombreLower = nombre.toLowerCase();
      productosFiltrados = productosFiltrados.filter(p =>
        p.nombre?.toLowerCase().includes(nombreLower)
      );
    }

    // Paginación local (si la API de Rodin no la hace)
    const paginaActual = parseInt(pagina);
    const itemsPorPagina = parseInt(limite);
    const inicio = (paginaActual - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    
    const productosPaginados = productosFiltrados.slice(inicio, fin);

    // Formatear respuesta
    const respuesta = {
      cliente: codigoCliente,
      lista_precios: productosPaginados,
      total_productos: productosFiltrados.length,
      paginacion: {
        pagina: paginaActual,
        items_por_pagina: itemsPorPagina,
        total_paginas: Math.ceil(productosFiltrados.length / itemsPorPagina),
        total_items: productosFiltrados.length
      },
      filtros: {
        sku: sku || null,
        nombre: nombre || null,
        desde_fecha: desde_fecha || null
      },
      timestamp: new Date().toISOString()
    };

    res.json(respuesta);

  } catch (error) {
    console.error(`❌ Error en lista-precios/cliente/${codigoCliente}:`, error);
    
    const statusCode = error.message.includes('no encontrado') ? 404 :
                      error.message.includes('Token') ? 401 :
                      error.message.includes('inválida') ? 400 : 500;

    res.status(statusCode).json({
      error: "Error obteniendo lista de precios",
      message: error.message,
      cliente: codigoCliente,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/lista-precios/email/:email
 * Obtener lista de precios por email
 */
router.get("/lista-precios/email/:email", async (req, res) => {
  const { email } = req.params;
  const { pagina = 1, limite = 50, sku, desde_fecha } = req.query;

  try {
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: "Email inválido" });
    }

    console.log(`📋 Solicitando lista de precios para email: ${email}`);
    
    const options = {
      pagina: pagina,
      ...(sku && { articulo: sku }),
      ...(desde_fecha && { ultima_actualizacion: desde_fecha })
    };

    const resultado = await obtenerListaPreciosPorEmail(email, options);

    // Aplicar paginación si la API de Rodin no la hizo
    if (Array.isArray(resultado.lista_precios)) {
      const paginaActual = parseInt(pagina);
      const itemsPorPagina = parseInt(limite);
      const inicio = (paginaActual - 1) * itemsPorPagina;
      const fin = inicio + itemsPorPagina;
      
      resultado.lista_precios = resultado.lista_precios.slice(inicio, fin);
      resultado.paginacion = {
        pagina: paginaActual,
        items_por_pagina: itemsPorPagina,
        total_paginas: Math.ceil(resultado.total_productos / itemsPorPagina)
      };
    }

    res.json(resultado);

  } catch (error) {
    console.error(`❌ Error en lista-precios/email/${email}:`, error);
    
    const statusCode = error.message.includes('no encontrado') ? 404 :
                      error.message.includes('Token') ? 401 : 500;

    res.status(statusCode).json({
      error: "Error obteniendo lista de precios",
      message: error.message,
      email: email,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/lista-precios/producto/:sku
 * Buscar producto específico
 */
router.get("/lista-precios/producto/:sku", async (req, res) => {
  const { sku } = req.params;
  const { cliente, email } = req.query;

  try {
    if (!sku) {
      return res.status(400).json({ error: "SKU requerido" });
    }

    let codigoCliente;
    let clienteInfo = {};

    if (email) {
      const { obtenerClientePorEmail } = await import("../services/clientesService.js");
      const clienteData = await obtenerClientePorEmail(email);
      if (!clienteData) {
        return res.status(404).json({ error: "Cliente no encontrado" });
      }
      codigoCliente = clienteData.cliente;
      clienteInfo = {
        codigo: clienteData.cliente,
        nombre: clienteData.nombre,
        email: email
      };
    } else if (cliente) {
      codigoCliente = cliente;
      clienteInfo = { codigo: cliente };
    } else {
      return res.status(400).json({ 
        error: "Debe proporcionar 'cliente' o 'email'" 
      });
    }

    const producto = await buscarProductoEnLista(codigoCliente, sku);

    if (!producto) {
      return res.status(404).json({
        error: "Producto no encontrado",
        message: `El producto ${sku} no está en la lista del cliente`,
        cliente: clienteInfo,
        sku: sku
      });
    }

    res.json({
      producto: producto,
      cliente: clienteInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`❌ Error en lista-precios/producto/${sku}:`, error);
    
    res.status(500).json({
      error: "Error buscando producto",
      message: error.message,
      sku: sku
    });
  }
});

/**
 * GET /api/lista-precios/test
 * Endpoint de prueba directa
 */
router.get("/lista-precios/test", async (req, res) => {
  const { cliente = "10007" } = req.query;
  
  try {
    // Test directo con axios
    const axios = (await import("axios")).default;
    const qs = (await import("qs")).default;
    const { obtenerToken } = await import("../services/authService.js");
    
    // 1. Obtener token
    const token = await obtenerToken();
    if (!token) {
      return res.status(500).json({ error: "No se pudo obtener token" });
    }
    
    // 2. Hacer request según documentación PHP
    const url = "https://rodin.com.mx/b2b/api/get_lista_precios.php";
    const params = new URLSearchParams({
      cliente: cliente,
      pagina: "1"
    });
    
    const fullUrl = `${url}?${params}`;
    
    console.log("🔍 Probando URL:", fullUrl);
    
    const response = await axios.get(fullUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      timeout: 15000
    });
    
    res.json({
      test: "directo",
      url: fullUrl,
      status: response.status,
      headers: response.headers,
      data: response.data,
      has_data: !!response.data,
      has_lista_precios: !!(response.data && response.data.lista_precios),
      data_preview: response.data ? JSON.stringify(response.data).substring(0, 500) : null
    });
    
  } catch (error) {
    console.error("❌ Error en test:", error);
    res.status(500).json({
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
  }
});

export default router;