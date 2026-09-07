import express from "express";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";
import { getMyTarget, getAffiliateSummary, getCoordinatorRegion } from "../controllers/tracking.controller.js";

const router = express.Router();
router.get("/me", verifyToken, requireRole("affiliate", "developer_coordinator", "ceo", "super_admin", "business_owner"), getMyTarget);
router.get("/affiliate/summary", verifyToken, requireRole("affiliate"), getAffiliateSummary);
router.get("/coordinator/region", verifyToken, requireRole("developer_coordinator"), getCoordinatorRegion);
export default router;
