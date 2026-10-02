import express from "express";
import {
  getMyPublicId,
  lookupByPublicId,
  upgradeKycTier,
} from "../controllers/publicId.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();

router.use(verifyToken);

router.get("/me", getMyPublicId);
router.get(
  "/:publicId",
  requireRole("developer_coordinator", "affiliate", "super_admin", "ceo"),
  lookupByPublicId
);
router.post(
  "/:userId/kyc-tier",
  requireRole("developer_coordinator", "affiliate", "super_admin"),
  upgradeKycTier
);

export default router;
