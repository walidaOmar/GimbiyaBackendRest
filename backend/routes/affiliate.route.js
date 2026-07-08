import express from "express";
import {
  createCampaign,
  getMyCampaigns,
  trackClick,
  getAnalytics,
} from "../controllers/affiliate.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();

// GET /api/affiliate/click/:code — track referral click (public)
router.get("/click/:code", trackClick);

// Protected affiliate routes
router.post("/campaigns",    verifyToken, requireRole("affiliate", "super_admin"), createCampaign);
router.get("/campaigns",     verifyToken, requireRole("affiliate", "super_admin"), getMyCampaigns);
router.get("/analytics",     verifyToken, requireRole("affiliate", "super_admin"), getAnalytics);

export default router;
