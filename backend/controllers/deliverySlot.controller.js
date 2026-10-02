import { DeliverySlot } from "../models/deliverySlot.model.js";
import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";
import { Order } from "../models/order.model.js";
import { NIGERIAN_STATES } from "../models/user.model.js";
import { Store } from "../models/store.model.js";

const VALID_SLOT_TYPES = ["DELIVERY", "PICKUP"];
const isValidState = (state) => NIGERIAN_STATES.includes(state) && state !== "Global";

export const createDeliverySlot = async (req, res) => {
  try {
    const { type, slotDate, startTime, endTime, capacity } = req.body;
    if (!VALID_SLOT_TYPES.includes(type) || !slotDate || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(startTime || "") || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(endTime || "")) {
      return res.status(400).json({ success: false, message: "Valid type, future slotDate, startTime, and endTime are required" });
    }
    const parsedSlotDate = new Date(slotDate);
    if (Number.isNaN(parsedSlotDate.getTime()) || parsedSlotDate <= new Date()) {
      return res.status(400).json({ success: false, message: "slotDate must be in the future" });
    }
    if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1)) {
      return res.status(400).json({ success: false, message: "capacity must be a positive integer" });
    }

    const store = await Store.findOne({
      businessOwnerId: req.userId,
      commerceSegment: "logistics",
      verificationStatus: "VERIFIED",
      primaryState: req.userState,
    }).select("primaryState").lean();
    if (!store) {
      return res.status(403).json({ success: false, message: "Verified logistics store not found" });
    }

    const slot = await DeliverySlot.create({
      providerId: req.userId,
      type,
      slotDate: parsedSlotDate,
      startTime,
      endTime,
      capacity,
      assignedState: store.primaryState,
    });
    return res.status(201).json({ success: true, data: slot });
  } catch (error) {
    console.error("[createDeliverySlot]", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getAvailableSlots = async (req, res) => {
  try {
    const { assignedState, type } = req.query;
    if (!isValidState(assignedState) || !VALID_SLOT_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: "Valid assignedState and type are required" });
    }

    const slots = await DeliverySlot.find({
      assignedState,
      type,
      slotDate: { $gte: new Date() },
      $expr: { $lt: ["$bookedCount", "$capacity"] },
    }).sort({ slotDate: 1 }).lean();

    return res.json({ success: true, data: slots });
  } catch (error) {
    console.error("[getAvailableSlots]", error);
    return res.status(500).json({ success: false, message: "Failed to fetch delivery slots" });
  }
};

export const assignSlotToGroup = async (req, res) => {
  let reservedSlotId = null;
  try {
    const { fulfillmentGroupId, slotId, type } = req.body;
    if (!fulfillmentGroupId || !VALID_SLOT_TYPES.includes(type) || (type === "DELIVERY" && !slotId)) {
      return res.status(400).json({ success: false, message: "fulfillmentGroupId, type, and a delivery slot are required" });
    }

    const group = await FulfillmentGroup.findById(fulfillmentGroupId).lean();
    if (!group) return res.status(404).json({ success: false, message: "Fulfillment group not found" });
    const order = await Order.findOne({ _id: group.orderId, buyerId: req.userId }).select("assignedState").lean();
    if (!order) return res.status(404).json({ success: false, message: "Fulfillment group not found" });
    if (group.status !== "PENDING" || group.logisticsOption) {
      return res.status(409).json({ success: false, message: "Logistics has already been selected or fulfillment has started" });
    }

    let slot = null;
    if (type === "DELIVERY") {
      slot = await DeliverySlot.findOneAndUpdate(
        {
          _id: slotId,
          assignedState: order.assignedState,
          type: "DELIVERY",
          slotDate: { $gte: new Date() },
          $expr: { $lt: ["$bookedCount", "$capacity"] },
        },
        { $inc: { bookedCount: 1 } },
        { new: true }
      );
      if (!slot) {
        return res.status(409).json({ success: false, message: "Slot is full or unavailable for this order's state" });
      }
      reservedSlotId = slot._id;
    }

    const updatedGroup = await FulfillmentGroup.findOneAndUpdate(
      { _id: group._id, status: "PENDING", logisticsOption: null },
      { logisticsOption: type, deliverySlotId: slot?._id || null },
      { new: true, runValidators: true }
    );

    if (!updatedGroup) {
      if (reservedSlotId) await DeliverySlot.updateOne({ _id: reservedSlotId, bookedCount: { $gt: 0 } }, { $inc: { bookedCount: -1 } });
      return res.status(409).json({ success: false, message: "Logistics has already been selected" });
    }

    return res.json({ success: true, data: updatedGroup });
  } catch (error) {
    if (reservedSlotId) {
      await DeliverySlot.updateOne({ _id: reservedSlotId, bookedCount: { $gt: 0 } }, { $inc: { bookedCount: -1 } });
    }
    console.error("[assignSlotToGroup]", error);
    return res.status(500).json({ success: false, message: "Failed to assign delivery slot" });
  }
};
