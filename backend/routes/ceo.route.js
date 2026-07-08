import express from "express";
import {
  getSystemMetrics,
  getNationalTelemetry,
  getKycQueue,
  processKyc,
  revokeAccess,
  getEscrowSummary,
} from "../controllers/ceo.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();

// All CEO routes require super_admin role
const ceoGuard = [verifyToken, requireRole("super_admin")];

// GET /api/ceo/metrics
router.get("/metrics",     ...ceoGuard, getSystemMetrics);

// GET /api/ceo/telemetry?from=2024-01-01&to=2024-12-31
router.get("/telemetry",   ...ceoGuard, getNationalTelemetry);

// GET /api/ceo/kyc?status=PENDING&page=1&limit=20
router.get("/kyc",         ...ceoGuard, getKycQueue);

// POST /api/ceo/kyc/adjudicate — { targetUserId, action, rejectionReason? }
router.post("/kyc/adjudicate", ...ceoGuard, processKyc);

// POST /api/ceo/users/revoke — { targetUserId, reason }
router.post("/users/revoke",   ...ceoGuard, revokeAccess);

// GET /api/ceo/escrow?from=2024-01-01
// Auditor can also read escrow summary
router.get("/escrow",
  verifyToken,
  requireRole("super_admin", "auditor"),
  getEscrowSummary
);

export default router;
