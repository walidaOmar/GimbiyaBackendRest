import express from "express";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";
import {
  getProperties, getPropertyById, createProperty, updateProperty, deleteProperty,
  getMyListings, getPropertyAdminDashboard, createInquiry, assignInquiry,
  getDealInitiatorDashboard, updateInquiryStatus,
} from "../controllers/property.controller.js";

const router = express.Router();

// PUBLIC
router.get("/", getProperties);

// PROPERTY ADMIN
router.post("/", verifyToken, requireRole("property_admin", "super_admin"), createProperty);
router.get("/admin/my-listings", verifyToken, requireRole("property_admin"), getMyListings);
router.patch("/:id", verifyToken, requireRole("property_admin"), updateProperty);
router.delete("/:id", verifyToken, requireRole("property_admin"), deleteProperty);
router.get("/admin/dashboard", verifyToken, requireRole("property_admin"), getPropertyAdminDashboard);

// DEAL INITIATOR
router.get("/deal-initiator/dashboard", verifyToken, requireRole("deal_initiator"), getDealInitiatorDashboard);

// INQUIRIES
router.post("/:id/inquire", verifyToken, requireRole("buyer"), createInquiry);
router.patch("/inquiries/:id/assign", verifyToken, requireRole("property_admin"), assignInquiry);
router.patch("/inquiries/:id/status", verifyToken, requireRole("deal_initiator", "property_admin"), updateInquiryStatus);

router.get("/:id", getPropertyById);

export default router;
