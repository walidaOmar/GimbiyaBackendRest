import express from "express";
import {
  createServiceOffering,
  getOfferingsNearLocation,
  getMyOfferings,
  updateServiceOffering,
} from "../controllers/serviceOffering.controller.js";
import {
  createDeliverySlot,
  getAvailableSlots,
  assignSlotToGroup,
} from "../controllers/deliverySlot.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();

router.get("/offerings", getOfferingsNearLocation);
router.get("/slots", getAvailableSlots);

router.use(verifyToken);
router.post("/offerings", requireRole("business_owner"), createServiceOffering);
router.get("/offerings/mine", requireRole("business_owner"), getMyOfferings);
router.patch("/offerings/:offeringId", requireRole("business_owner"), updateServiceOffering);
router.post("/slots", requireRole("business_owner"), createDeliverySlot);
router.post("/slots/assign", requireRole("buyer"), assignSlotToGroup);

export default router;
