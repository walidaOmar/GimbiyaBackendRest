import express from "express";
import {
  addToCartV2,
  addServiceToCartItem,
  removeServiceFromCartItem,
  checkoutV2,
  getCartV2,
  removeCartItemV2,
} from "../controllers/cartV2.controller.js";
import { confirmFulfillmentGroup, getMyFulfillmentGroups } from "../controllers/fulfillmentGroup.controller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", getCartV2);
router.post("/items", addToCartV2);
router.delete("/items/:cartItemId", removeCartItemV2);
router.post("/items/:cartItemId/services", addServiceToCartItem);
router.delete("/items/:cartItemId/services/:serviceIndex", removeServiceFromCartItem);
router.post("/checkout", checkoutV2);

router.get("/fulfillment-groups/mine", requireRole("business_owner"), getMyFulfillmentGroups);
router.post("/fulfillment-groups/:groupId/confirm", requireRole("business_owner"), confirmFulfillmentGroup);

export default router;
