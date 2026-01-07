import express from "express";
import { 
  obtenerListaPreciosPorCliente, 
  obtenerListaPreciosPorEmail,
  buscarEnListaPrecios
} from "../services/listaPreciosService.js";

const router = express.Router();

/**
 * GET /api/lista-precios/cliente/:codigoCliente
 * Obtener lista de precios por código de cliente (formato Rodin)
 */
router.get("/lista-precios/cliente/:codigoCliente", async (req, res) => {
  const { codigoCliente } = req.params;
  const { 
    pagina = 1, 
    limite = 50, 
    sku, 
    nombre,
    ordenar = 'articulo' 
  } = req.query;

  try {
    if (!codigoCliente || codigoCliente.trim() === "") {
      return res.status(400).json({
        error: "Código de cliente requerido",
        message: "Debe proporcionar un código de cliente válido"
      });
    }

    console.log(`📋 Solicitando lista de precios para cliente: ${codigoCliente}`);
    
    const listaPrecios = await obtenerListaPreciosPorCliente(codigoCliente);

    // Formatear respuesta según el formato de Rodin
    const respuesta = {
      cliente: codigoCliente,
      lista_precios: [],
      total_productos: 0,
      paginacion: {},
      timestamp: new Date().toISOString()
    };

    if (!Array.isArray(listaPrecios) || listaPrecios.length === 0) {
      return res.json(respuesta);
    }

    // Aplicar filtros si existen
    let productosFiltrados = listaPrecios;
    
    if (sku) {
      const skuLower = sku.toLowerCase();
      productosFiltrados = productosFiltrados.filter(p =>
        p.articulo?.toString().toLowerCase().includes(skuLower)
      );
    }
    
    if (nombre) {
      const nombreLower = nombre.toLowerCase();
      productosFiltrados = productosFiltrados.filter(p =>
        p.nombre?.toLowerCase().includes(nombreLower)
      );
    }

    // Ordenar
    if (ordenar === 'precio') {
      productosFiltrados.sort((a, b) => a.precio_final - b.precio_final);
    } else if (ordenar === 'nombre') {
      productosFiltrados.sort((a, b) => a.nombre?.localeCompare(b.nombre));
    }

    // Paginación
    const paginaActual = parseInt(pagina);
    const itemsPorPagina = parseInt(limite);
    const inicio = (paginaActual - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    
    const productosPaginados = productosFiltrados.slice(inicio, fin);

    // Formatear productos para consistencia
    const productosFormateados = productosPaginados.map(producto => ({
      sku: producto.articulo,
      nombre: producto.nombre,
      marca: producto.marca || '',
      precio_lista: producto.precio_lista,
      precio_final: producto.precio_final,
      lista_precios: producto.lista_precios,
      moneda: 'MXN', // Asumiendo que es pesos mexicanos
      ultima_actualizacion: producto.ultima_actualizacion,
      // Campos adicionales para Shopify
      disponible: true,
      inventario: 999 // Asumiendo disponible, ajustar según API
    }));

    respuesta.lista_precios = productosFormateados;
    respuesta.total_productos = productosFiltrados.length;
    respuesta.paginacion = {
      pagina: paginaActual,
      items_por_pagina: itemsPorPagina,
      total_paginas: Math.ceil(productosFiltrados.length / itemsPorPagina),
      total_items: productosFiltrados.length
    };

    res.json(respuesta);

  } catch (error) {
    console.error(`❌ Error en /lista-precios/cliente/${codigoCliente}:`, error);
    
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
 * Obtener lista de precios por email del cliente
 */
router.get("/lista-precios/email/:email", async (req, res) => {
  const { email } = req.params;
  const { 
    pagina = 1, 
    limite = 50,
    sku,
    nombre
  } = req.query;

  try {
    if (!email || !email.includes('@')) {
      return res.status(400).json({
        error: "Email inválido",
        message: "Debe proporcionar un email válido"
      });
    }

    console.log(`📋 Solicitando lista de precios para email: ${email}`);
    
    const resultado = await obtenerListaPreciosPorEmail(email);

    // Aplicar filtros si se especifican
    if ((sku || nombre) && Array.isArray(resultado.lista_precios)) {
      let productosFiltrados = resultado.lista_precios;
      
      if (sku) {
        const skuLower = sku.toLowerCase();
        productosFiltrados = productosFiltrados.filter(p =>
          p.articulo?.toString().toLowerCase().includes(skuLower)
        );
      }
      
      if (nombre) {
        const nombreLower = nombre.toLowerCase();
        productosFiltrados = productosFiltrados.filter(p =>
          p.nombre?.toLowerCase().includes(nombreLower)
        );
      }
      
      resultado.lista_precios = productosFiltrados;
      resultado.total_productos = productosFiltrados.length;
    }

    // Paginación
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
    console.error(`❌ Error en /lista-precios/email/${email}:`, error);
    
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
 * GET /api/lista-precios/buscar
 * Búsqueda avanzada en lista de precios
 */
router.get("/lista-precios/buscar", async (req, res) => {
  const { 
    cliente, 
    email, 
    sku, 
    nombre, 
    pagina = 1, 
    limite = 20,
    precio_min,
    precio_max
  } = req.query;

  try {
    let listaPrecios = [];
    let clienteInfo = {};

    // Determinar cómo obtener la lista de precios
    if (email) {
      const resultado = await obtenerListaPreciosPorEmail(email);
      listaPrecios = resultado.lista_precios;
      clienteInfo = resultado.cliente;
    } else if (cliente) {
      listaPrecios = await obtenerListaPreciosPorCliente(cliente);
      clienteInfo = { codigo: cliente };
    } else {
      return res.status(400).json({
        error: "Parámetros insuficientes",
        message: "Debe proporcionar 'cliente' o 'email'"
      });
    }

    if (!Array.isArray(listaPrecios) || listaPrecios.length === 0) {
      return res.json({
        cliente: clienteInfo,
        lista_precios: [],
        total: 0,
        message: "No se encontraron productos",
        timestamp: new Date().toISOString()
      });
    }

    // Aplicar todos los filtros
    let productosFiltrados = listaPrecios;
    
    if (sku) {
      const skuLower = sku.toLowerCase();
      productosFiltrados = productosFiltrados.filter(p =>
        p.articulo?.toString().toLowerCase().includes(skuLower)
      );
    }
    
    if (nombre) {
      const nombreLower = nombre.toLowerCase();
      productosFiltrados = productosFiltrados.filter(p =>
        p.nombre?.toLowerCase().includes(nombreLower)
      );
    }
    
    if (precio_min) {
      const precioMinNum = parseFloat(precio_min);
      productosFiltrados = productosFiltrados.filter(p =>
        p.precio_final >= precioMinNum
      );
    }
    
    if (precio_max) {
      const precioMaxNum = parseFloat(precio_max);
      productosFiltrados = productosFiltrados.filter(p =>
        p.precio_final <= precioMaxNum
      );
    }

    // Paginación
    const paginaActual = parseInt(pagina);
    const itemsPorPagina = parseInt(limite);
    const inicio = (paginaActual - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    
    const productosPaginados = productosFiltrados.slice(inicio, fin);

    // Formatear para Shopify
    const productosFormateados = productosPaginados.map(producto => ({
      id: `rodin_${producto.articulo}_${clienteInfo.codigo}`,
      sku: producto.articulo,
      title: producto.nombre,
      body_html: `<p>${producto.nombre}</p>`,
      vendor: producto.marca || 'Rodin',
      product_type: 'Producto Rodin',
      price: producto.precio_final,
      compare_at_price: producto.precio_lista,
      inventory_quantity: 999,
      inventory_management: 'shopify',
      inventory_policy: 'continue',
      requires_shipping: true,
      taxable: true,
      status: 'active',
      published_scope: 'global',
      tags: producto.lista_precios ? `lista:${producto.lista_precios}` : '',
      variants: [{
        sku: producto.articulo,
        price: producto.precio_final,
        compare_at_price: producto.precio_lista,
        inventory_quantity: 999,
        inventory_management: 'shopify',
        inventory_policy: 'continue',
        requires_shipping: true,
        taxable: true,
        option1: 'Default'
      }],
      metafields: [{
        namespace: 'rodin',
        key: 'precio_lista',
        value: producto.precio_lista.toString(),
        type: 'number_decimal'
      }, {
        namespace: 'rodin',
        key: 'lista_precios',
        value: producto.lista_precios,
        type: 'single_line_text_field'
      }, {
        namespace: 'rodin',
        key: 'ultima_actualizacion',
        value: producto.ultima_actualizacion,
        type: 'date_time'
      }],
      rodin_data: producto
    }));

    const respuesta = {
      products: productosFormateados,
      cliente: clienteInfo,
      pagination: {
        current_page: paginaActual,
        per_page: itemsPorPagina,
        total: productosFiltrados.length,
        total_pages: Math.ceil(productosFiltrados.length / itemsPorPagina)
      },
      filters_applied: {
        sku: sku || null,
        nombre: nombre || null,
        precio_min: precio_min || null,
        precio_max: precio_max || null
      },
      timestamp: new Date().toISOString()
    };

    res.json(respuesta);

  } catch (error) {
    console.error("❌ Error en /lista-precios/buscar:", error);
    
    res.status(500).json({
      error: "Error buscando productos",
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/lista-precios/producto/:sku
 * Buscar un producto específico en todas las listas (para ver precio por cliente)
 */
router.get("/lista-precios/producto/:sku", async (req, res) => {
  const { sku } = req.params;
  const { cliente, email } = req.query;

  try {
    if (!sku) {
      return res.status(400).json({
        error: "SKU requerido",
        message: "Debe proporcionar un SKU de producto"
      });
    }

    let listaPrecios = [];
    let clienteInfo = {};

    if (email) {
      const resultado = await obtenerListaPreciosPorEmail(email);
      listaPrecios = resultado.lista_precios;
      clienteInfo = resultado.cliente;
    } else if (cliente) {
      listaPrecios = await obtenerListaPreciosPorCliente(cliente);
      clienteInfo = { codigo: cliente };
    } else {
      return res.status(400).json({
        error: "Cliente requerido",
        message: "Debe proporcionar 'cliente' o 'email' para buscar precios"
      });
    }

    // Buscar el producto específico
    const producto = Array.isArray(listaPrecios) 
      ? listaPrecios.find(p => p.articulo?.toString() === sku)
      : null;

    if (!producto) {
      return res.status(404).json({
        error: "Producto no encontrado",
        message: `El producto con SKU ${sku} no está en la lista de precios del cliente`,
        cliente: clienteInfo,
        sku: sku,
        timestamp: new Date().toISOString()
      });
    }

    const respuesta = {
      producto: {
        sku: producto.articulo,
        nombre: producto.nombre,
        marca: producto.marca,
        precio_lista: producto.precio_lista,
        precio_final: producto.precio_final,
        lista_precios: producto.lista_precios,
        ultima_actualizacion: producto.ultima_actualizacion
      },
      cliente: clienteInfo,
      timestamp: new Date().toISOString()
    };

    res.json(respuesta);

  } catch (error) {
    console.error(`❌ Error en /lista-precios/producto/${sku}:`, error);
    
    res.status(500).json({
      error: "Error buscando producto",
      message: error.message,
      sku: sku,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;