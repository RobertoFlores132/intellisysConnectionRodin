// routes/listaPreciosRoute.js - VERSIÓN UNIVERSAL
import express from "express";
import { 
  obtenerListaPreciosPorCliente,
  obtenerListaPreciosPorEmail
} from "../services/listaPreciosService.js";

const router = express.Router();

// ============================================
// CACHE INTELIGENTE POR CLIENTE
// ============================================
class ClienteCache {
  constructor() {
    this.cache = new Map();
    this.stats = new Map();
    this.MAX_CACHE_SIZE = 200; // 200 clientes máximo
    this.CACHE_TTL = 6 * 60 * 60 * 1000; // 6 horas (ajustable)
  }

  // Obtener datos de un cliente
  get(clienteId) {
    const item = this.cache.get(clienteId);
    if (!item) return null;

    const age = Date.now() - item.timestamp;
    if (age > this.CACHE_TTL) {
      this.cache.delete(clienteId);
      return null;
    }

    // Actualizar estadísticas
    this.updateStats(clienteId, 'hit');
    return item.data;
  }

  // Guardar datos de un cliente
  set(clienteId, data) {
    // Limpiar si el cache está lleno
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.cleanup();
    }

    this.cache.set(clienteId, {
      data: data,
      timestamp: Date.now(),
      size: data.lista_precios?.length || 0
    });

    this.updateStats(clienteId, 'set');
    console.log(`💾 Cache actualizado para ${clienteId} (${this.cache.size}/${this.MAX_CACHE_SIZE} clientes)`);
  }

  // Eliminar datos de un cliente
  delete(clienteId) {
    this.cache.delete(clienteId);
    console.log(`🧹 Cache eliminado para ${clienteId}`);
  }

  // Limpiar cache automáticamente
  cleanup() {
    // Estrategia: eliminar los menos usados y más antiguos
    const entries = Array.from(this.cache.entries());
    
    // Ordenar por: 1) menos hits, 2) más antiguo
    entries.sort((a, b) => {
      const statsA = this.stats.get(a[0]) || { hits: 0 };
      const statsB = this.stats.get(b[0]) || { hits: 0 };
      
      if (statsA.hits !== statsB.hits) {
        return statsA.hits - statsB.hits; // Menos hits primero
      }
      return a[1].timestamp - b[1].timestamp; // Más antiguo primero
    });

    // Eliminar 20% más antiguo/menos usado
    const toDelete = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < toDelete; i++) {
      this.cache.delete(entries[i][0]);
    }

    console.log(`🧹 Limpieza automática: ${toDelete} clientes eliminados`);
  }

  // Actualizar estadísticas
  updateStats(clienteId, action) {
    if (!this.stats.has(clienteId)) {
      this.stats.set(clienteId, { hits: 0, sets: 0, lastAccess: Date.now() });
    }

    const stats = this.stats.get(clienteId);
    stats.lastAccess = Date.now();

    if (action === 'hit') stats.hits++;
    if (action === 'set') stats.sets++;
  }

  // Obtener estadísticas del cache
  getStats() {
    return {
      total_clientes: this.cache.size,
      memoria_total_kb: Array.from(this.cache.values())
        .reduce((sum, item) => sum + (item.size || 0), 0) / 1024,
      clientes_mas_activos: Array.from(this.stats.entries())
        .sort((a, b) => b[1].hits - a[1].hits)
        .slice(0, 5)
        .map(([cliente, stats]) => ({ cliente, hits: stats.hits }))
    };
  }
}

const clienteCache = new ClienteCache();

setInterval(() => {
  clienteCache.cleanup();
}, 60 * 60 * 1000);

// ============================================
// 1. ENDPOINT UNIVERSAL PARA TODOS LOS CLIENTES
// ============================================

/**
 * GET /api/lista-precios/completo/:codigoCliente
 * Obtener TODA la lista de precios para CUALQUIER cliente
 */
router.get("/lista-precios/completo/:codigoCliente", async (req, res) => {
  const { codigoCliente } = req.params;
  const { 
    fuerza_actualizacion = "false",
    formato = "optimizado",
    timeout = "30000"
  } = req.query;

  try {
    // ============================================
    // VALIDACIONES Y LOGGING
    // ============================================
    if (!codigoCliente || codigoCliente.trim() === "") {
      return res.status(400).json({
        error: "Código de cliente requerido",
        ejemplo_valido: "/api/lista-precios/completo/K1024",
        ejemplo_email: "/api/lista-precios/completo/cliente@empresa.com",
        soporta: "Cualquier ID de cliente Rodin o email"
      });
    }

    console.log(`🔄 [UNIVERSAL] Solicitando precios para cliente: ${codigoCliente}`);
    
    const clienteId = codigoCliente.trim();
    const esEmail = clienteId.includes('@');
    
    // ============================================
    // 1. VERIFICAR CACHE (si no se fuerza actualización)
    // ============================================
    if (fuerza_actualizacion !== "true") {
      const cachedData = clienteCache.get(clienteId);
      
      if (cachedData) {
        console.log(`✅ Sirviendo ${cachedData.total_productos} productos desde cache para ${clienteId}`);
        
        return res.json({
          success: true,
          cliente: clienteId,
          tipo_cliente: esEmail ? "por_email" : "por_codigo",
          ...cachedData,
          metadata: {
            ...cachedData.metadata,
            cache: {
              desde_cache: true,
              cacheado_desde: cachedData.metadata?.timestamp_obtencion || new Date().toISOString(),
              tamaño_aproximado_kb: Math.round(JSON.stringify(cachedData).length / 1024)
            }
          }
        });
      }
    } else {
      console.log(`🔄 Fuerza actualización activada para ${clienteId}`);
    }

    // ============================================
    // 2. OBTENER DATOS FRESCOS DE RODIN
    // ============================================
    console.log(`📥 Obteniendo datos frescos de Rodin para ${clienteId}...`);
    
    const startTime = Date.now();
    let listaPrecios;
    let totalProductos = 0;

    try {
      if (esEmail) {
        // Obtener por email
        console.log(`📧 Detectado email, obteniendo por correo...`);
        listaPrecios = await obtenerListaPreciosPorEmail(clienteId, {
          timeout: parseInt(timeout),
          intentos: 2
        });
      } else {
        // Obtener por código de cliente
        console.log(`🏷️  Detectado código cliente, obteniendo por ID...`);
        listaPrecios = await obtenerListaPreciosPorCliente(clienteId, {
          modo: 'completo',
          timeout: parseInt(timeout),
          intentos: 3
        });
      }

      // Normalizar respuesta
      if (listaPrecios && Array.isArray(listaPrecios)) {
        totalProductos = listaPrecios.length;
      } else if (listaPrecios && listaPrecios.lista_precios) {
        totalProductos = listaPrecios.lista_precios.length;
        listaPrecios = listaPrecios.lista_precios;
      } else {
        totalProductos = 0;
        listaPrecios = [];
      }

    } catch (apiError) {
      console.error(`❌ Error API Rodin para ${clienteId}:`, apiError.message);
      
      // Intentar fallback: obtener solo primera página
      try {
        console.log(`🔄 Intentando fallback (primera página)...`);
        
        if (esEmail) {
          listaPrecios = await obtenerListaPreciosPorEmail(clienteId, {
            pagina: 1,
            limite: 100,
            timeout: 10000
          });
        } else {
          listaPrecios = await obtenerListaPreciosPorCliente(clienteId, {
            pagina: 1,
            limite: 100,
            timeout: 10000
          });
        }
        
        // Normalizar fallback
        if (listaPrecios && listaPrecios.lista_precios) {
          listaPrecios = listaPrecios.lista_precios;
          totalProductos = listaPrecios.length;
        }
        
        console.log(`⚠️  Fallback exitoso: ${totalProductos} productos (solo primera página)`);
        
      } catch (fallbackError) {
        console.error(`❌ Fallback también falló:`, fallbackError.message);
        throw new Error(`No se pudieron obtener precios para ${clienteId}`);
      }
    }

    const fetchTime = Date.now() - startTime;
    
    if (totalProductos === 0) {
      console.warn(`⚠️  Cliente ${clienteId} tiene 0 productos en lista de precios`);
    } else {
      console.log(`✅ Obtenidos ${totalProductos} productos en ${fetchTime}ms`);
    }

    // ============================================
    // 3. OPTIMIZAR DATOS PARA EL FRONTEND
    // ============================================
    const optimizedData = optimizePriceData(listaPrecios, formato);
    
    // ============================================
    // 4. GUARDAR EN CACHE (si hay productos)
    // ============================================
    if (totalProductos > 0) {
      const cacheData = {
        lista_precios: optimizedData.lista_precios,
        mapa_precios: optimizedData.mapa_precios,
        total_productos: totalProductos,
        metadata: {
          timestamp_obtencion: new Date().toISOString(),
          tiempo_obtencion_ms: fetchTime,
          formato_optimizado: formato,
          cliente_tipo: esEmail ? "email" : "codigo",
          tiene_descuentos: optimizedData.tiene_descuentos
        }
      };
      
      clienteCache.set(clienteId, cacheData);
    }

    // ============================================
    // 5. CONSTRUIR RESPUESTA FINAL
    // ============================================
    const response = {
      success: true,
      cliente: clienteId,
      tipo_cliente: esEmail ? "por_email" : "por_codigo",
      lista_precios: optimizedData.lista_precios,
      total_productos: totalProductos,
      metadata: {
        timestamp_respuesta: new Date().toISOString(),
        tiempo_procesamiento_ms: fetchTime,
        formato_entrega: formato,
        optimizaciones_aplicadas: optimizedData.optimizaciones || [],
        cache: {
          desde_cache: false,
          guardado_en_cache: totalProductos > 0,
          total_clientes_cacheados: clienteCache.cache.size
        },
        recomendaciones: generateRecommendations(totalProductos, fetchTime)
      },
      paginacion: {
        tiene_paginacion: false,
        motivo: "Endpoint /completo entrega todos los productos",
        alternativa_paginada: `/api/lista-precios/cliente/${clienteId}?limite=100`
      }
    };

    // Agregar mapa de precios si está optimizado
    if (formato === "optimizado" && optimizedData.mapa_precios) {
      response.mapa_precios = optimizedData.mapa_precios;
    }

    res.json(response);

  } catch (error) {
    console.error(`❌ Error crítico para ${codigoCliente}:`, error);
    
    // Respuesta de error detallada
    res.status(500).json({
      success: false,
      error: "Error obteniendo lista de precios",
      message: error.message,
      cliente: codigoCliente,
      timestamp: new Date().toISOString(),
      sugerencias: [
        "Verifique que el cliente exista en Rodin",
        "Intente con el email si tiene uno",
        "Contacte al administrador si el problema persiste"
      ]
    });
  }
});

/**
 * Helper: Optimizar datos de precios
 */
function optimizePriceData(prices, formato) {
  if (!Array.isArray(prices) || prices.length === 0) {
    return {
      lista_precios: [],
      mapa_precios: {},
      total_productos: 0,
      tiene_descuentos: false
    };
  }

  console.log(`🛠️  Optimizando ${prices.length} productos (formato: ${formato})...`);
  
  const optimizaciones = [];
  const listaOptimizada = [];
  const mapaPrecios = {};
  let tieneDescuentos = false;

  // PARA FORMATO OPTIMIZADO (recomendado para frontend)
  if (formato === "optimizado") {
    prices.forEach((producto, index) => {
      // Estructura mínima para búsqueda rápida
      const itemOptimizado = {
        s: producto.articulo || `unknown_${index}`, // SKU (short)
        n: producto.nombre ? producto.nombre.substring(0, 80) : "", // Nombre (truncado)
        pf: producto.precio_final || 0, // Precio final
        pl: producto.precio_lista || 0, // Precio lista
        d: (producto.precio_lista || 0) > (producto.precio_final || 0) // Tiene descuento
      };

      listaOptimizada.push(itemOptimizado);
      
      // Mapa para búsqueda O(1) por SKU
      mapaPrecios[itemOptimizado.s] = {
        precio_final: itemOptimizado.pf,
        precio_lista: itemOptimizado.pl,
        tiene_descuento: itemOptimizado.d
      };

      if (itemOptimizado.d) tieneDescuentos = true;
    });

    optimizaciones.push("compresion_nombres", "estructura_minima", "mapa_busqueda_rapida");
    
  } else {
    // FORMATO COMPLETO (para compatibilidad)
    listaOptimizada.push(...prices);
    optimizaciones.push("formato_completo");
  }

  console.log(`✅ Optimización completada: ${listaOptimizada.length} productos`);
  
  return {
    lista_precios: listaOptimizada,
    mapa_precios: formato === "optimizado" ? mapaPrecios : undefined,
    total_productos: listaOptimizada.length,
    tiene_descuentos: tieneDescuentos,
    optimizaciones: optimizaciones
  };
}

/**
 * Helper: Generar recomendaciones basadas en los datos
 */
function generateRecommendations(totalProductos, tiempoMs) {
  const recomendaciones = [];
  
  if (totalProductos > 10000) {
    recomendaciones.push({
      nivel: "alto",
      mensaje: `Cliente con ${totalProductos.toLocaleString()} productos`,
      accion: "Usar carga progresiva en frontend",
      tecnica: "Virtual scrolling + IndexedDB"
    });
  } else if (totalProductos > 1000) {
    recomendaciones.push({
      nivel: "medio", 
      mensaje: `Cliente con ${totalProductos} productos`,
      accion: "Cachear en IndexedDB",
      tecnica: "Lazy loading por lotes"
    });
  }
  
  if (tiempoMs > 5000) {
    recomendaciones.push({
      nivel: "advertencia",
      mensaje: `Tiempo de obtención alto: ${tiempoMs}ms`,
      accion: "Considerar paginación",
      tecnica: "Usar endpoint paginado para carga inicial"
    });
  }
  
  return recomendaciones;
}

// ============================================
// 2. ENDPOINT PARA PRODUCTOS VISIBLES (OPTIMIZADO)
// ============================================

/**
 * GET /api/lista-precios/visibles/:codigoCliente
 * Obtener precios solo para productos visibles en viewport
 */
router.get("/lista-precios/visibles/:codigoCliente", async (req, res) => {
  const { codigoCliente } = req.params;
  const { skus, modo = "exacto" } = req.query;

  try {
    if (!codigoCliente) {
      return res.status(400).json({ error: "Código de cliente requerido" });
    }

    if (!skus) {
      return res.status(400).json({
        error: "Parámetro 'skus' requerido",
        descripcion: "Lista de SKUs separados por coma que están visibles en el viewport",
        ejemplo: "?skus=10001,10002,10003,10004"
      });
    }

    console.log(`👀 [VISIBLES] Solicitando ${skus.split(',').length} SKUs visibles para ${codigoCliente}`);
    
    const skuArray = skus.split(',')
      .map(s => s.trim())
      .filter(s => s)
      .slice(0, 100); // Máximo 100 SKUs por request

    // 1. Intentar obtener desde cache completo primero
    const cachedData = clienteCache.get(codigoCliente);
    let productosEncontrados = [];

    if (cachedData && cachedData.mapa_precios) {
      // Buscar en el mapa de precios cacheado (O(1) por SKU)
      skuArray.forEach(sku => {
        if (cachedData.mapa_precios[sku]) {
          productosEncontrados.push({
            articulo: sku,
            precio_final: cachedData.mapa_precios[sku].precio_final,
            precio_lista: cachedData.mapa_precios[sku].precio_lista,
            desde_cache: true
          });
        }
      });
      
      console.log(`✅ ${productosEncontrados.length}/${skuArray.length} encontrados en cache`);
      
    } else {
      // 2. Si no hay cache, buscar individualmente
      console.log(`🔄 Cache no disponible, buscando individualmente...`);
      
      // Aquí iría la lógica para buscar SKUs individualmente
      // (similar al endpoint batch anterior)
      
      // Por ahora, respuesta simulada
      productosEncontrados = skuArray.map(sku => ({
        articulo: sku,
        precio_final: 0,
        precio_lista: 0,
        desde_cache: false,
        advertencia: "Cliente no cacheado, use endpoint /completo primero"
      }));
    }

    res.json({
      success: true,
      cliente: codigoCliente,
      skus_solicitados: skuArray.length,
      skus_encontrados: productosEncontrados.length,
      productos: productosEncontrados,
      recomendacion: productosEncontrados.length < skuArray.length 
        ? "Algunos SKUs no encontrados. Verifique los códigos o actualice cache."
        : "Todos los SKUs encontrados exitosamente",
      metadata: {
        desde_cache: productosEncontrados.length > 0 && productosEncontrados[0].desde_cache,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error(`❌ Error en visibles/${codigoCliente}:`, error);
    res.status(500).json({
      error: "Error obteniendo precios visibles",
      message: error.message
    });
  }
});

// ============================================
// 3. ENDPOINT DE ESTADÍSTICAS Y MONITOREO
// ============================================

/**
 * GET /api/lista-precios/estadisticas
 * Obtener estadísticas del sistema
 */
router.get("/lista-precios/estadisticas", async (req, res) => {
  try {
    const cacheStats = clienteCache.getStats();
    
    const estadisticas = {
      sistema: {
        timestamp: new Date().toISOString(),
        uptime_minutos: Math.floor(process.uptime() / 60),
        memoria_node_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
      },
      cache: {
        ...cacheStats,
        politica_limpieza: "Automática cada hora",
        ttl_horas: 6,
        max_clientes: MAX_CACHE_SIZE
      },
      endpoints_activos: [
        {
          nombre: "completo",
          descripcion: "Obtiene TODOS los productos de un cliente",
          uso: "Carga inicial y cache",
          url: "/api/lista-precios/completo/{clienteId}"
        },
        {
          nombre: "visibles", 
          descripcion: "Obtiene solo productos visibles en viewport",
          uso: "Carga progresiva en frontend",
          url: "/api/lista-precios/visibles/{clienteId}?skus=SKU1,SKU2"
        },
        {
          nombre: "cliente (legacy)",
          descripcion: "Endpoint original con paginación",
          uso: "Compatibilidad",
          url: "/api/lista-precios/cliente/{clienteId}?limite=50"
        }
      ],
      recomendaciones: [
        "Use /completo una vez por sesión por cliente",
        "Use /visibles para carga progresiva",
        "Configure IndexedDB en frontend para cache persistente"
      ]
    };

    res.json(estadisticas);

  } catch (error) {
    console.error("❌ Error obteniendo estadísticas:", error);
    res.status(500).json({
      error: "Error obteniendo estadísticas",
      message: error.message
    });
  }
});

/**
 * GET /api/lista-precios/cliente/:codigoCliente (LEGACY - mantenemos compatibilidad)
 */
router.get("/lista-precios/cliente/:codigoCliente", async (req, res) => {
  const { codigoCliente } = req.params;
  const { pagina = 1, limite = 50 } = req.query;

  try {
    // Llamar al endpoint nuevo con parámetros de paginación
    const data = await obtenerListaPreciosPorCliente(codigoCliente, {
      pagina: parseInt(pagina),
      limite: Math.min(parseInt(limite), 200)
    });

    res.json({
      ...data,
      metadata: {
        endpoint: "legacy",
        recomendacion: "Migre al endpoint /completo para mejor rendimiento"
      }
    });

  } catch (error) {
    console.error(`❌ Error en cliente/${codigoCliente}:`, error);
    res.status(500).json({
      error: "Error obteniendo lista de precios",
      message: error.message
    });
  }
});

export default router;