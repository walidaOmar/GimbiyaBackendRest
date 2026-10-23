import express from "express";
import {
  getCatalog,
  getProduct,
  publishListing,
  getMyListings,
  updatePrice,
  toggleActive,
  restock,
  getPricingInfo,
} from "../controllers/product.controller.js";
import { getMerchantAnalytics, getMerchantAnalyticsV2, getSettlementLedger } from "../controllers/merchant.controller.js";
import { optionalVerifyToken, verifyToken, requireRole, requireVerified } from "../middleware/verifyToken.js";

const router = express.Router();

// ── PUBLIC ────────────────────────────────────────────────────────────────────
// GET /api/products?assignedState=Tafawa%20balewa%20refinery&buildingFloor=LEVEL_1&page=1&limit=20
router.get("/",     optionalVerifyToken, getCatalog);
router.get("/pricing-info", optionalVerifyToken, getPricingInfo);
router.get("/:id",  optionalVerifyToken, getProduct);

// ── MERCHANT ──────────────────────────────────────────────────────────────────
router.post(
  "/",
  verifyToken,
  requireVerified,
  requireRole("business_owner"),
  publishListing
);

router.get(
  "/merchant/my-listings",
  verifyToken,
  requireRole("business_owner"),
  getMyListings
);

router.patch(
  "/:id/price",
  verifyToken,
  requireRole("business_owner"),
  updatePrice
);

router.post(
  "/:id/restock",
  verifyToken,
  requireRole("business_owner"),
  restock
);

router.patch(
  "/:id/toggle",
  verifyToken,
  requireRole("business_owner"),
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
  "/merchant/analytics-v2",
  verifyToken,
  requireRole("business_owner", "super_admin"),
  getMerchantAnalyticsV2
);

router.get(
  "/merchant/settlement",
  verifyToken,
  requireRole("business_owner", "super_admin", "auditor"),
  getSettlementLedger
);

export default router;
