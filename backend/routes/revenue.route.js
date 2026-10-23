import express from "express";
import { getCurrentRevenue, getRevenueHistory, publishRevenue } from "../controllers/revenue.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();
router.use(verifyToken);

router.get("/", requireRole("ceo", "super_admin", "developer_coordinator", "auditor"), getCurrentRevenue);
router.get("/history", requireRole("ceo", "super_admin", "auditor"), getRevenueHistory);
router.post("/", requireRole("ceo", "super_admin"), publishRevenue);

export default router;
