import express from "express";
import {
  getAvailableJobs,
  getMyDeliveries,
  claimJob,
  finalizeHandover,
  updateLocation,
} from "../controllers/delivery.controller.js";
import { verifyToken, requireRole, requireKyc } from "../middleware/verifyToken.js";

const router = express.Router();

// All delivery routes require: valid token + delivery role + KYC approved
const riderGuard = [verifyToken, requireRole("delivery"), requireKyc];

// GET /api/delivery/jobs — available unclaimed jobs in rider's state
router.get("/jobs",      ...riderGuard, getAvailableJobs);

// GET /api/delivery/active — rider's current active deliveries
router.get("/active",    ...riderGuard, getMyDeliveries);

// POST /api/delivery/claim — { orderId }
router.post("/claim",    ...riderGuard, claimJob);

// POST /api/delivery/handover — { orderId, submittedOtp, signatureBase64 }
router.post("/handover", ...riderGuard, finalizeHandover);

// POST /api/delivery/location — { orderId, lat, lng }
router.post("/location", ...riderGuard, updateLocation);

export default router;
