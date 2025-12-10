import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import clientesRouter from "./routes/clientes.js";

dotenv.config();

const app = express();

// Configurar CORS para Shopify
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir todas las peticiones de Shopify Admin y tu tienda
    const allowedOrigins = [
      'https://admin.shopify.com',
      /\.myshopify\.com$/, // Cualquier tienda Shopify
      'http://localhost:3000', // Desarrollo local
      process.env.SHOPIFY_STORE_URL // Tu tienda específica
    ].filter(Boolean);
    
    if (!origin || allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') return origin === allowed;
      if (allowed instanceof RegExp) return allowed.test(origin);
      return false;
    })) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions)); // Usar esta configuración
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas
app.use("/api", clientesRouter);

// Endpoint base
app.get("/", (req, res) => {
  res.json({ message: "API Rodin funcionando correctamente 😎" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});