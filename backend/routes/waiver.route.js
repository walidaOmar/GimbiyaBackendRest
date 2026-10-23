import express from "express";
import {
  allocateQuota,
  setQuotaProducts,
  getQuotas,
  getMyQuota,
  submitWaiverRequest,
  getPendingRequests,
  approveWaiverRequest,
  rejectWaiverRequest,
  getMyCoupons,
  validateCoupon,
} from "../controllers/waiver.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();

router.get("/coupons/validate/:code", validateCoupon);

router.use(verifyToken);

router.post("/quotas", requireRole("super_admin", "ceo"), allocateQuota);
router.get("/quotas", requireRole("super_admin", "ceo"), getQuotas);
router.put("/quotas/:quotaId/products", requireRole("super_admin", "ceo"), setQuotaProducts);

router.get("/my-quota", requireRole("developer_coordinator"), getMyQuota);
router.get("/requests/pending", requireRole("developer_coordinator"), getPendingRequests);
router.post("/requests/:requestId/approve", requireRole("developer_coordinator"), approveWaiverRequest);
router.post("/requests/:requestId/reject", requireRole("developer_coordinator"), rejectWaiverRequest);

router.post("/requests", requireRole("affiliate"), submitWaiverRequest);
router.get("/my-coupons", requireRole("affiliate"), getMyCoupons);

export default router;
