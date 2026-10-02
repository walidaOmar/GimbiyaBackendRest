import express from "express";
import {
  getAvailableJobsV2,
  getMyDeliveriesV2,
  claimJobV2,
  finalizeHandoverV2,
  updateLocationV2,
} from "../controllers/deliveryV2.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();
router.use(verifyToken, requireRole("delivery"));

router.get("/jobs/available", getAvailableJobsV2);
router.get("/jobs/mine", getMyDeliveriesV2);
router.post("/jobs/claim", claimJobV2);
router.post("/jobs/finalize", finalizeHandoverV2);
router.post("/jobs/location", updateLocationV2);

export default router;
