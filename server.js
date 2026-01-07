// server.js - CONFIGURACIÓN PARA PRODUCCIÓN
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import clientesRouter from "./routes/clientes.js";
import listaPreciosRouter from "./routes/listaPrecios.js";

dotenv.config();

const app = express();

// =================== CONFIGURACIÓN CORS PARA PRODUCCIÓN ===================
const allowedOrigins = [
  // Shopify Admin
  'https://admin.shopify.com',
  'https://*.admin.shopify.com',
  
  // Todas las tiendas Shopify
  /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/,
  
  // Tu tienda específica (desde variable de entorno)
  process.env.SHOPIFY_STORE_URL, // Esto debería ser https://rodin-shop.myshopify.com

  'https://rodin.mx',
  
  // Desarrollo local
  'http://localhost:3000',
  'http://localhost:9292',
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (como mobile apps o curl)
    if (!origin) return callback(null, true);
    
    // Verificar si el origen está en la lista permitida
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed;
      }
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS bloqueado: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With'
  ],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400, // 24 horas en segundos
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Aplicar CORS
app.use(cors(corsOptions));

// Headers adicionales de seguridad
app.use((req, res, next) => {
  // Headers de seguridad
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  
  // Cache control para API
  res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  
  next();
});

// =================== MIDDLEWARE ===================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =================== ROUTES ===================
app.use("/api", clientesRouter);
app.use("/api", listaPreciosRouter);

// =================== ENDPOINTS DE HEALTH & INFO ===================
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "Rodin B2B API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    cors: {
      allowedOrigins: allowedOrigins.map(o => o.toString())
    }
  });
});

app.get("/api/info", (req, res) => {
  res.json({
    name: "Rodin B2B API",
    description: "API para integración B2B con Shopify",
    version: "1.1.0",
    author: "Intellisys Connection",
    endpoints: {
      clientes: {
        all: "GET /api/clientes",
        byEmail: "GET /api/clientes/by-email/:email",
        queryParams: "?pagina=1&cliente=ID&fecha=YYYY-MM-DD"
      },
      lista_precios: {
        byCliente: "GET /api/lista-precios/cliente/:codigoCliente",
        byEmail: "GET /api/lista-precios/email/:email",
        search: "GET /api/lista-precios/search?cliente=CODIGO&sku=XXX&pagina=1",
        queryParams: {
          cliente: "Código de cliente",
          email: "Email del cliente",
          sku: "SKU del producto",
          descripcion: "Texto en descripción",
          pagina: "Número de página",
          limite: "Items por página",
          moneda: "Filtrar por moneda"
        }
      },
      health: "GET /api/health"
    }
  });
});

// =================== RATE LIMITING (Básico) ===================
const rateLimit = {};
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutos
const MAX_REQUESTS = 100; // 100 requests por IP en 15 minutos

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimit[ip]) {
    rateLimit[ip] = { count: 1, startTime: now };
    return next();
  }
  
  if (now - rateLimit[ip].startTime > RATE_LIMIT_WINDOW) {
    // Reiniciar contador si ha pasado el tiempo
    rateLimit[ip] = { count: 1, startTime: now };
    return next();
  }
  
  rateLimit[ip].count++;
  
  if (rateLimit[ip].count > MAX_REQUESTS) {
    console.warn(`⚠️ Rate limit excedido para IP: ${ip}`);
    return res.status(429).json({
      error: "Too many requests",
      message: "Por favor, espera antes de hacer más solicitudes",
      retryAfter: Math.ceil((rateLimit[ip].startTime + RATE_LIMIT_WINDOW - now) / 1000)
    });
  }
  
  next();
});

// =================== MANEJO DE ERRORES ===================
app.use((req, res, next) => {
  res.status(404).json({
    error: "Endpoint no encontrado",
    message: `La ruta ${req.originalUrl} no existe`,
    availableEndpoints: ["/api/clientes", "/api/clientes/by-email/:email", "/api/health", "/api/info"]
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Error del servidor:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // Si es error de CORS
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: "CORS Error",
      message: "Origen no permitido",
      origin: req.headers.origin,
      allowedOrigins: allowedOrigins.map(o => o.toString())
    });
  }
  
  res.status(500).json({
    error: "Error interno del servidor",
    message: process.env.NODE_ENV === 'development' ? err.message : "Contacta al administrador",
    requestId: req.headers['x-request-id'] || Date.now().toString(36)
  });
});

// =================== GRACEFUL SHUTDOWN ===================
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM recibido. Cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT recibido. Cerrando servidor...');
  process.exit(0);
});

// =================== INICIAR SERVIDOR ===================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 ===============================================
   Rodin B2B API v1.0.0
   🔗 URL: http://0.0.0.0:${PORT}
   📅 Iniciado: ${new Date().toISOString()}
   🌍 Ambiente: ${process.env.NODE_ENV || 'production'}
   🔒 CORS: ${allowedOrigins.length} orígenes permitidos
===============================================
  `);
  
  // Mostrar orígenes permitidos (sans información sensible)
  console.log('✅ Orígenes permitidos:');
  allowedOrigins.forEach((origin, i) => {
    console.log(`   ${i + 1}. ${origin}`);
  });
  console.log('===============================================\n');
});

// Manejo de errores del servidor
server.on('error', (error) => {
  console.error('💥 Error al iniciar servidor:', error);
  process.exit(1);
});