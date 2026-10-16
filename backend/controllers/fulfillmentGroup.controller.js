import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";
import { Order } from "../models/order.model.js";
import { notifyUser } from "../utils/sseService.js";

export const confirmFulfillmentGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await FulfillmentGroup.findOneAndUpdate(
      { _id: groupId, merchantId: req.userId, status: "PAID" },
      { $set: { status: "CONFIRMED", confirmedAt: new Date(), confirmedBy: req.userId } },
      { new: true }
    );

    if (!group) {
      const existing = await FulfillmentGroup.findById(groupId).select("merchantId status");
      if (!existing) return res.status(404).json({ success: false, message: "Fulfillment group not found" });
      if (String(existing.merchantId) !== String(req.userId)) {
        return res.status(403).json({ success: false, message: "Not your fulfillment group" });
      }
      const message = existing.status === "PENDING"
        ? "The customer has not paid for this order yet. You can confirm it once payment is received."
        : `This group is already ${existing.status} and cannot be confirmed.`;
      return res.status(409).json({ success: false, message });
    }

    const order = await Order.findById(group.orderId).select("buyerId orderRef").lean();
    if (order) {
      notifyUser(String(order.buyerId), "fulfillment:confirmed", {
        orderRef: order.orderRef,
        message: "A merchant confirmed part of your order.",
      });
    }

    res.json({ success: true, data: group });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyFulfillmentGroups = async (req, res) => {
  try {
    const groups = await FulfillmentGroup.find({ merchantId: req.userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
