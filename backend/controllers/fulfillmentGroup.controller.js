import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";
import { Order } from "../models/order.model.js";
import { notifyUser } from "../utils/sseService.js";

export const confirmFulfillmentGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await FulfillmentGroup.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Fulfillment group not found" });
    }
    if (String(group.merchantId) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: "Not your fulfillment group" });
    }

    group.status = "CONFIRMED";
    group.confirmedAt = new Date();
    group.confirmedBy = req.userId;
    await group.save();

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
