import express from "express";
import {
  addToCartV2,
  addServiceToCartItem,
  removeServiceFromCartItem,
  checkoutV2,
  getCartV2,
  quoteCartV2,
  removeCartItemV2,
} from "../controllers/cartV2.controller.js";
import { getMyOrdersV2, getOrderByRefV2, cancelUnpaidV2, getMyJobsV2 } from "../controllers/orderV2.controller.js";
import { completeServiceV2 } from "../controllers/deliveryV2.controller.js";
import { confirmFulfillmentGroup, getMyFulfillmentGroups } from "../controllers/fulfillmentGroup.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", getCartV2);
router.post("/items", addToCartV2);
router.delete("/items/:cartItemId", removeCartItemV2);
router.post("/items/:cartItemId/services", addServiceToCartItem);
router.delete("/items/:cartItemId/services/:serviceIndex", removeServiceFromCartItem);
router.get("/quote", quoteCartV2);
router.post("/checkout", checkoutV2);

router.get("/orders", getMyOrdersV2);
router.get("/orders/:orderRef", getOrderByRefV2);
router.post("/orders/:orderRef/cancel", cancelUnpaidV2);
router.post("/service-jobs/complete", requireRole("business_owner"), completeServiceV2);
router.get("/my-jobs", requireRole("business_owner"), getMyJobsV2);

router.get("/fulfillment-groups/mine", requireRole("business_owner"), getMyFulfillmentGroups);
router.post("/fulfillment-groups/:groupId/confirm", requireRole("business_owner"), confirmFulfillmentGroup);

export default router;
