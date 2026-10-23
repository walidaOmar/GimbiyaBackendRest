import express from "express";
import { getMySubscription, startSubscriptionCheckout, setStorePlan } from "../controllers/subscription.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();
router.use(verifyToken);

router.get("/me", requireRole("business_owner"), getMySubscription);
router.post("/checkout", requireRole("business_owner"), startSubscriptionCheckout);
router.put("/admin/stores/:storeId", requireRole("super_admin", "ceo"), setStorePlan);

export default router;
