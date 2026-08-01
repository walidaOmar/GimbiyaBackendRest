import express from "express";
import {
  createCampaign,
  getMyCampaigns,
  trackClick,
  getAnalytics as getAffiliateCampaignAnalytics,
} from "../controllers/affiliate.controller.js";
import {
  recordClick,
  getAnalytics,
  getClickHistory,
} from "../controllers/affiliateAnalytics.controller.js";
import {
  generateFulfillmentInvoice,
  getMyInvoices,
} from "../controllers/invoice.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();

// GET /api/affiliate/click/:code — track referral click (public)
router.get("/click/:code", trackClick);

// Protected affiliate routes
router.post("/campaigns", verifyToken, requireRole("affiliate", "super_admin"), createCampaign);
router.get("/campaigns", verifyToken, requireRole("affiliate", "super_admin"), getMyCampaigns);
router.get("/analytics", verifyToken, requireRole("affiliate", "super_admin"), getAffiliateCampaignAnalytics);

// Analytics
router.post("/clicks", verifyToken, requireRole("affiliate", "super_admin"), recordClick);
router.get("/analytics/details", verifyToken, requireRole("affiliate", "super_admin"), getAnalytics);
router.get("/clicks/history", verifyToken, requireRole("affiliate", "super_admin"), getClickHistory);

// Invoices
router.get("/invoices", verifyToken, requireRole("affiliate", "super_admin"), getMyInvoices);
router.get("/invoices/:couponCode", verifyToken, requireRole("affiliate", "super_admin"), generateFulfillmentInvoice);

export default router;
