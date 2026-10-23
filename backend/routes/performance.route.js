import express from "express";
import { getAffiliatePerformance, setStoreReferral } from "../controllers/performance.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();
router.use(verifyToken);

const VIEWERS = ["developer_coordinator", "ceo", "super_admin", "auditor"];
router.get("/affiliates", requireRole(...VIEWERS), getAffiliatePerformance);
router.put("/stores/:storeId/referral", requireRole("developer_coordinator", "ceo", "super_admin"), setStoreReferral);

export default router;
