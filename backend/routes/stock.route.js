import express from "express";
import {
  getManifest,
  adjustStock,
  getAuditLog,
  processInbound,
} from "../controllers/stock.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();

const STOCK_ROLES = ["stock_manager", "business_owner", "developer_coordinator", "super_admin"];

// GET /api/stock/manifest?lowStockOnly=true&page=1&limit=50
router.get("/manifest",        verifyToken, requireRole(...STOCK_ROLES), getManifest);

// POST /api/stock/adjust
// body: { productId, deltaCount, reasonCode, noteText? }
router.post("/adjust",         verifyToken, requireRole(...STOCK_ROLES), adjustStock);

// POST /api/stock/inbound
// body: { items: [{ productId, quantity }], invoiceRef? }
router.post("/inbound",        verifyToken, requireRole(...STOCK_ROLES), processInbound);

// GET /api/stock/audit/:productId
router.get("/audit/:productId",verifyToken, requireRole(...STOCK_ROLES), getAuditLog);

export default router;
