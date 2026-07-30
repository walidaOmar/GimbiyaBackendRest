import express from "express";
import {
  getStores,
  getStoreById,
  createStoreOnboarding,
  verifyStore,
  rejectStore,
  updateStore,
  createBranch,
  updateBranch,
  getAvailableStaff,
  getPendingStores,
} from "../controllers/store.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();

router.use(verifyToken, requireRole("super_admin", "developer_coordinator"));

router.get("/", getStores);
router.get("/pending", getPendingStores);
router.get("/:id", getStoreById);

router.post("/", requireRole("super_admin"), createStoreOnboarding);
router.post("/:storeId/verify", requireRole("super_admin"), verifyStore);
router.post("/:storeId/reject", requireRole("super_admin"), rejectStore);
router.patch("/:storeId", requireRole("super_admin"), updateStore);
router.post("/:storeId/branches", requireRole("super_admin"), createBranch);
router.patch("/branches/:branchId", requireRole("super_admin"), updateBranch);
router.get("/staff/available", getAvailableStaff);

export default router;
