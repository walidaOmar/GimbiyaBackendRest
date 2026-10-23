import { Order } from "../models/order.model.js";
import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";
import { Store } from "../models/store.model.js";
import { decryptOtp } from "../utils/otpVault.js";
import { cancelUnpaidOrder } from "../jobs/releaseUnpaidJob.js";

const summary = (o) => ({
  orderId: o._id, orderRef: o.orderRef, status: o.status, reservationExpiresAt: o.reservationExpiresAt, assignedState: o.assignedState, createdAt: o.createdAt, paidAt: o.paidAt,
  grossTotalKobo: o.grossTotalKobo, platformFeeKobo: o.platformFeeKobo, deliveryFeeKobo: o.deliveryFeeKobo,
  itemCount: (o.items || []).reduce((s, i) => s + i.quantity, 0),
});

// Orders I bought (works for every role that can shop, including retailers buying wholesale).
export const getMyOrdersV2 = async (req, res) => {
  try {
    const orders = await Order.find({ buyerId: req.userId, isMultiMerchant: true }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, data: orders.map(summary) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load your orders" });
  }
};

// One order with its parts. Only the buyer can see it, and only the buyer gets the handover codes.
export const getOrderByRefV2 = async (req, res) => {
  try {
    const order = await Order.findOne({ orderRef: String(req.params.orderRef), buyerId: req.userId }).lean();
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const groups = await FulfillmentGroup.find({ orderId: order._id }).select("+buyerOtpEnc").lean();
    const sellers = await Store.find({ businessOwnerId: { $in: groups.map((g) => g.merchantId) } }).select("businessOwnerId businessName").lean();
    const nameOf = new Map(sellers.map((s) => [String(s.businessOwnerId), s.businessName]));

    res.json({
      success: true,
      data: {
        ...summary(order),
        shippingAddress: order.shippingAddress,
        items: order.items,
        groups: groups.map((g) => ({
          fulfillmentGroupId: g._id,
          groupType: g.groupType,
          sellerName: nameOf.get(String(g.merchantId)) || "Seller",
          status: g.status,
          items: g.items,
          amountKobo: g.settlement?.customerKobo || 0,
          // The code is only useful while the part is still on its way to you.
          handoverCode: ["PAID", "CONFIRMED", "DISPATCHED"].includes(g.status) && g.buyerOtpEnc ? decryptOtp(g.buyerOtpEnc) : null,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load the order" });
  }
};

export const cancelUnpaidV2 = async (req, res) => {
  try {
    const order = await cancelUnpaidOrder({ orderRef: String(req.params.orderRef), buyerId: req.userId }, "Cancelled by buyer before payment.");
    if (!order) return res.status(409).json({ success: false, message: "Only an unpaid order can be cancelled here." });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not cancel the order" });
  }
};

// For merchants: the parts of orders that include their goods or services.
export const getMyJobsV2 = async (req, res) => {
  try {
    const groups = await FulfillmentGroup.find({ merchantId: req.userId, status: { $ne: "CANCELLED" } }).sort({ createdAt: -1 }).limit(100).lean();
    const orders = await Order.find({ _id: { $in: groups.map((g) => g.orderId) } }).select("orderRef shippingAddress assignedState").lean();
    const byId = new Map(orders.map((o) => [String(o._id), o]));
    res.json({
      success: true,
      data: groups.map((g) => ({
        fulfillmentGroupId: g._id, groupType: g.groupType, status: g.status, items: g.items, createdAt: g.createdAt,
        orderRef: byId.get(String(g.orderId))?.orderRef, shippingAddress: byId.get(String(g.orderId))?.shippingAddress,
        youEarnKobo: g.settlement?.merchantKobo || 0,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load your jobs" });
  }
};
