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

  get(clienteId) {
    const item = this.cache.get(clienteId);
    if (!item) return null;

    const age = Date.now() - item.timestamp;
    if (age > this.CACHE_TTL) {
      this.cache.delete(clienteId);
      return null;
    }

    this.updateStats(clienteId, 'hit');
    return item.data;
  }

  set(clienteId, data) {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.cleanup();
    }

    this.cache.set(clienteId, {
      data: data,
      timestamp: Date.now(),
      size: JSON.stringify(data).length
    });

    this.updateStats(clienteId, 'set');
    console.log(`💾 Cache actualizado para ${clienteId} (${this.cache.size}/${this.MAX_CACHE_SIZE} clientes)`);
  }

  delete(clienteId) {
    this.cache.delete(clienteId);
    console.log(`🧹 Cache eliminado para ${clienteId}`);
  }

  cleanup() {
    const entries = Array.from(this.cache.entries());
    
    entries.sort((a, b) => {
      const statsA = this.stats.get(a[0]) || { hits: 0 };
      const statsB = this.stats.get(b[0]) || { hits: 0 };
      
      if (statsA.hits !== statsB.hits) {
        return statsA.hits - statsB.hits;
      }
      return a[1].timestamp - b[1].timestamp;
    });

    const toDelete = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < toDelete; i++) {
      this.cache.delete(entries[i][0]);
    }

    console.log(`🧹 Limpieza automática: ${toDelete} clientes eliminados`);
  }

  updateStats(clienteId, action) {
    if (!this.stats.has(clienteId)) {
      this.stats.set(clienteId, { hits: 0, sets: 0, lastAccess: Date.now() });
    }

    const stats = this.stats.get(clienteId);
    stats.lastAccess = Date.now();

    if (action === 'hit') stats.hits++;
    if (action === 'set') stats.sets++;
  }

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

// ============================================
// 1. ENDPOINT UNIVERSAL PARA TODOS LOS CLIENTES
// ============================================

router.get("/lista-precios/completo/:codigoCliente", async (req, res) => {
  const { codigoCliente } = req.params;
  const { 
    fuerza_actualizacion = "false",
    formato = "optimizado",
    timeout = "30000"
  } = req.query;

  try {
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

    console.log(`📥 Obteniendo datos frescos de Rodin para ${clienteId}...`);
    
    const startTime = Date.now();
    let listaPrecios;
    let totalProductos = 0;

    try {
      if (esEmail) {
        listaPrecios = await obtenerListaPreciosPorEmail(clienteId, {
          timeout: parseInt(timeout),
          intentos: 2
        });
      } else {
        listaPrecios = await obtenerListaPreciosPorCliente(clienteId, {
          modo: 'completo',
          timeout: parseInt(timeout),
          intentos: 3
        });
      }

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
      throw apiError;
    }

    const fetchTime = Date.now() - startTime;

    const optimizedData = optimizePriceData(listaPrecios, formato);

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

    if (formato === "optimizado" && optimizedData.mapa_precios) {
      response.mapa_precios = optimizedData.mapa_precios;
    }

    res.json(response);

  } catch (error) {
    console.error(`❌ Error crítico para ${codigoCliente}:`, error);
    
    res.status(500).json({
      success: false,
      error: "Error obteniendo lista de precios",
      message: error.message,
      cliente: codigoCliente,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================
// Helpers (SIN this.)
// ============================================

function optimizePriceData(prices, formato) {
  if (!Array.isArray(prices) || prices.length === 0) {
    return {
      lista_precios: [],
      mapa_precios: {},
      total_productos: 0,
      tiene_descuentos: false
    };
  }

  const listaOptimizada = [];
  const mapaPrecios = {};
  let tieneDescuentos = false;

  if (formato === "optimizado") {
    prices.forEach((producto, index) => {
      const itemOptimizado = {
        s: producto.articulo || `unknown_${index}`,
        n: producto.nombre ? producto.nombre.substring(0, 80) : "",
        pf: producto.precio_final || 0,
        pl: producto.precio_lista || 0,
        d: (producto.precio_lista || 0) > (producto.precio_final || 0)
      };

      listaOptimizada.push(itemOptimizado);
      
      mapaPrecios[itemOptimizado.s] = {
        precio_final: itemOptimizado.pf,
        precio_lista: itemOptimizado.pl,
        tiene_descuento: itemOptimizado.d
      };

      if (itemOptimizado.d) tieneDescuentos = true;
    });
    
  } else {
    listaOptimizada.push(...prices);
  }

  return {
    lista_precios: listaOptimizada,
    mapa_precios: formato === "optimizado" ? mapaPrecios : undefined,
    total_productos: listaOptimizada.length,
    tiene_descuentos: tieneDescuentos
  };
}

function generateRecommendations(totalProductos, tiempoMs) {
  const recomendaciones = [];
  
  if (totalProductos > 10000) {
    recomendaciones.push({
      nivel: "alto",
      mensaje: `Cliente con ${totalProductos.toLocaleString()} productos`,
      accion: "Usar carga progresiva en frontend"
    });
  }
  
  if (tiempoMs > 5000) {
    recomendaciones.push({
      nivel: "advertencia",
      mensaje: `Tiempo de obtención alto: ${tiempoMs}ms`
    });
  }
  
  return recomendaciones;
}

// ============================================
// ESTADÍSTICAS (fix MAX_CACHE_SIZE)
// ============================================

router.get("/lista-precios/estadisticas", async (req, res) => {
  try {
    const cacheStats = clienteCache.getStats();
    
    const estadisticas = {
      cache: {
        ...cacheStats,
        ttl_horas: 6,
        max_clientes: clienteCache.MAX_CACHE_SIZE
      }
    };

    res.json(estadisticas);

  } catch (error) {
    res.status(500).json({
      error: "Error obteniendo estadísticas",
      message: error.message
    });
  }
});

export default router;