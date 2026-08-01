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
router.get("/cart", verifyToken, requireRole("buyer", "affiliate"), getCart);
router.post("/cart", verifyToken, requireRole("buyer", "affiliate"), updateCart);
router.post("/cart/coupon", verifyToken, requireRole("buyer", "affiliate"), applyFulfillmentCoupon);
router.delete("/cart/coupon", verifyToken, requireRole("buyer", "affiliate"), removeFulfillmentCoupon);

// ── CHECKOUT ──────────────────────────────────────────────────────────────────
router.post(
  "/checkout",
  verifyToken,
  requireVerified,
  requireRole("buyer", "affiliate"),
  checkoutLimiter,
  checkout
);

// ── ORDER STATUS ──────────────────────────────────────────────────────────────
router.get("/history", verifyToken, requireRole("buyer", "affiliate"), getOrderHistory);
router.post("/bulk-payment", verifyToken, bulkFulfillmentPayment);
router.get("/coupon/:couponCode", verifyToken, getOrdersByCoupon);
router.get("/:id", verifyToken, requireRole("buyer", "affiliate"), getOrderStatus);
router.post("/:id/cancel", verifyToken, requireRole("buyer", "affiliate"), cancelOrder);

export default router;
