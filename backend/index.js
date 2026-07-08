import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";

import { connectDB } from "./db/connectDB.js";
import { connectRedis } from "./config/redis.js";
import { initFirebase } from "./config/firebase.js";

import authRoutes     from "./routes/auth.route.js";
import userRoutes     from "./routes/user.route.js";
import productRoutes  from "./routes/product.route.js";
import orderRoutes    from "./routes/order.route.js";
import stockRoutes    from "./routes/stock.route.js";
import deliveryRoutes from "./routes/delivery.route.js";
import ceoRoutes      from "./routes/ceo.route.js";
import affiliateRoutes from "./routes/affiliate.route.js";

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 8080;

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// ── BODY & COOKIE ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" })); // 10mb for base64 signatures
app.use(cookieParser());

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status:    "GIMBIYA MALL BACKEND ONLINE",
    version:   "1.0.0",
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV,
  });
});

// ── API ROUTES ────────────────────────────────────────────────────────────────
app.use("/api/auth",     authRoutes);
app.use("/api/users",    userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders",   orderRoutes);
app.use("/api/stock",    stockRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/ceo",      ceoRoutes);
app.use("/api/affiliate",affiliateRoutes);

// ── SSE — Real-Time Events ─────────────────────────────────────────────────────
import { handleSSEConnection } from "./utils/sseService.js";
import { verifyToken }         from "./middleware/verifyToken.js";

app.get("/api/events/subscribe", verifyToken, handleSSEConnection);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ── GLOBAL ERROR HANDLER ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[Error]", err.message);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});

// ── STARTUP ───────────────────────────────────────────────────────────────────
async function bootstrap() {
  await connectDB();
  await connectRedis();
  initFirebase();

  app.listen(PORT, () => {
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log(`║  GIMBIYA MALL BACKEND — PORT ${PORT}            ║`);
    console.log(`║  ENV: ${(process.env.NODE_ENV || "development").padEnd(38)}║`);
    console.log("║  Routes:                                     ║");
    console.log("║    POST   /api/auth/signup                   ║");
    console.log("║    POST   /api/auth/login                    ║");
    console.log("║    GET    /api/products                      ║");
    console.log("║    POST   /api/orders/checkout               ║");
    console.log("║    GET    /api/events/subscribe (SSE)        ║");
    console.log("║    GET    /health                            ║");
    console.log("╚══════════════════════════════════════════════╝\n");
  });
}

process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received. Shutting down...");
  process.exit(0);
});

bootstrap().catch((err) => {
  console.error("[Bootstrap] Fatal error:", err);
  process.exit(1);
});
