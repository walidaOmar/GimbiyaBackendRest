import express from "express";
import {
  createInvite, listInvites, revokeInvite, previewInvite, acceptInvite,
  inviteOptions, listPendingMerchants, getPendingMerchantDetail, verifyMerchant, rejectMerchant,
} from "../controllers/invite.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";
import { authLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Public: the person opening the emailed link has no account yet.
router.get("/public/:token", authLimiter, previewInvite);
router.post("/public/:token/accept", authLimiter, acceptInvite);

router.use(verifyToken);
const HQ = ["super_admin", "ceo"];
const INVITERS = [...HQ, "developer_coordinator", "affiliate", "business_owner"];
router.get("/options", requireRole(...INVITERS), inviteOptions);
router.post("/", requireRole(...INVITERS), createInvite);
router.get("/", requireRole(...INVITERS), listInvites);
router.post("/:inviteId/revoke", requireRole(...INVITERS), revokeInvite);

// Merchants who accepted an invite wait here until HQ verifies them (only HQ can approve).
router.get("/merchants/pending", requireRole(...HQ, "developer_coordinator"), listPendingMerchants);
router.get("/merchants/:storeId", requireRole(...HQ), getPendingMerchantDetail);
router.post("/merchants/:storeId/verify", requireRole(...HQ), verifyMerchant);
router.post("/merchants/:storeId/reject", requireRole(...HQ), rejectMerchant);

export default router;
