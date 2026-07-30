import express from "express";
import {
  updateCart,
  getCart,
  applyFulfillmentCoupon,
  removeFulfillmentCoupon,
  checkout,
  getOrderStatus,
  getOrderHistory,
  cancelOrder,
  bulkFulfillmentPayment,
  getOrdersByCoupon,
} from "../controllers/order.controller.js";
import { verifyToken, requireRole, requireVerified } from "../middleware/verifyToken.js";
import { checkoutLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// ── CART ──────────────────────────────────────────────────────────────────────
router.get( "/cart",  verifyToken, requireRole("buyer"), getCart);
router.post("/cart",  verifyToken, requireRole("buyer"), updateCart);
router.post("/cart/coupon", verifyToken, requireRole("buyer"), applyFulfillmentCoupon);
router.delete("/cart/coupon", verifyToken, requireRole("buyer"), removeFulfillmentCoupon);

// ── CHECKOUT ──────────────────────────────────────────────────────────────────
router.post(
  "/checkout",
  verifyToken,
  requireVerified,
  requireRole("buyer"),
  checkoutLimiter,
  checkout
);

// ── ORDER STATUS ──────────────────────────────────────────────────────────────
router.get("/history",    verifyToken, requireRole("buyer"), getOrderHistory);
router.post("/bulk-payment", verifyToken, bulkFulfillmentPayment);
router.get("/coupon/:couponCode", verifyToken, getOrdersByCoupon);
router.get("/:id",        verifyToken, requireRole("buyer"), getOrderStatus);
router.post("/:id/cancel",verifyToken, requireRole("buyer"), cancelOrder);

export default router;
