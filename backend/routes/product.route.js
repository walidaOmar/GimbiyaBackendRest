import express from "express";
import {
  getCatalog,
  getProduct,
  publishListing,
  getMyListings,
  updatePrice,
  toggleActive,
} from "../controllers/product.controller.js";
import { getMerchantAnalytics, getSettlementLedger } from "../controllers/merchant.controller.js";
import { verifyToken, requireRole, requireVerified } from "../middleware/verifyToken.js";

const router = express.Router();

// ── PUBLIC ────────────────────────────────────────────────────────────────────
// GET /api/products?assignedState=Kano&buildingFloor=LEVEL_1&page=1&limit=20
router.get("/",     getCatalog);
router.get("/:id",  getProduct);

// ── MERCHANT ──────────────────────────────────────────────────────────────────
router.post(
  "/",
  verifyToken,
  requireVerified,
  requireRole("business_owner", "developer_coordinator", "super_admin"),
  publishListing
);

router.get(
  "/merchant/my-listings",
  verifyToken,
  requireRole("business_owner", "developer_coordinator", "super_admin"),
  getMyListings
);

router.patch(
  "/:id/price",
  verifyToken,
  requireRole("business_owner", "super_admin"),
  updatePrice
);

router.patch(
  "/:id/toggle",
  verifyToken,
  requireRole("business_owner", "super_admin"),
  toggleActive
);

// ── MERCHANT ANALYTICS + SETTLEMENT ──────────────────────────────────────────
router.get(
  "/merchant/analytics",
  verifyToken,
  requireRole("business_owner", "super_admin"),
  getMerchantAnalytics
);

router.get(
  "/merchant/settlement",
  verifyToken,
  requireRole("business_owner", "super_admin", "auditor"),
  getSettlementLedger
);

export default router;
