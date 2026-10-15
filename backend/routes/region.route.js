import express from "express";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";
import { getRegionTree, getRegionOverview, updateNode } from "../controllers/region.controller.js";

const router = express.Router();

router.use(verifyToken);

router.get("/tree", getRegionTree);
router.get("/overview", requireRole("developer_coordinator", "super_admin", "ceo"), getRegionOverview);
router.patch("/nodes/:key", requireRole("super_admin"), updateNode);

export default router;
