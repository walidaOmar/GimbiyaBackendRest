import express from "express";
import {
  getStores,
  getStoreById,
  submitStoreRequest,
  getPendingStoreRequests,
  getStoreRequestById,
  approveStoreRequest,
  rejectStoreRequest,
  updateStore,
  createBranch,
  updateBranch,
  getAvailableStaff,
} from "../controllers/store.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();

router.use(verifyToken);

// Coordinator: submit store onboarding request
router.post("/requests", requireRole("developer_coordinator"), submitStoreRequest);

// CEO: list pending store requests
router.get("/requests/pending", requireRole("super_admin"), getPendingStoreRequests);

// CEO: get single request details
router.get("/requests/:id", requireRole("super_admin", "developer_coordinator"), getStoreRequestById);

// CEO: approve/reject store request
router.post("/requests/:requestId/approve", requireRole("super_admin"), approveStoreRequest);
router.post("/requests/:requestId/reject", requireRole("super_admin"), rejectStoreRequest);

// Verified stores list
router.get("/", getStores);

// Single store with branches
router.get("/:id", getStoreById);

// Update store
router.patch("/:storeId", requireRole("super_admin"), updateStore);

// Branch management
router.post("/:storeId/branches", requireRole("super_admin"), createBranch);
router.patch("/branches/:branchId", requireRole("super_admin"), updateBranch);

// Staff lookup
router.get("/staff/available", getAvailableStaff);

export default router;
