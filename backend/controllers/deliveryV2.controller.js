import mongoose from "mongoose";
import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";
import { Order } from "../models/order.model.js";
import { EscrowLedger } from "../models/ledger.model.js";
import { verifyOtp } from "../utils/otpService.js";
import { notifyUser } from "../utils/sseService.js";
import { getFirebaseStorage } from "../config/firebase.js";

export const getAvailableJobsV2 = async (req, res) => {
  try {
    if (req.userState === "Global") {
      return res.status(403).json({ success: false, message: "Riders must be assigned to a specific state" });
    }

    const orders = await Order.find({ assignedState: req.userState, isMultiMerchant: true }).select("_id orderRef").lean();
    const orderIds = orders.map((order) => order._id);

    const jobs = await FulfillmentGroup.find({ orderId: { $in: orderIds }, status: "CONFIRMED", riderId: null })
      .populate("orderId", "orderRef shippingAddress assignedState")
      .sort({ createdAt: 1 })
      .limit(50)
      .lean();

    res.status(200).json({ success: true, jobs, count: jobs.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyDeliveriesV2 = async (req, res) => {
  try {
    const deliveries = await FulfillmentGroup.find({
      riderId: req.userId,
      status: { $in: ["DISPATCHED", "PROCESSING"] },
    }).populate("orderId", "orderRef shippingAddress").sort({ updatedAt: -1 }).lean();

    res.status(200).json({ success: true, deliveries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const claimJobV2 = async (req, res) => {
  try {
    const { fulfillmentGroupId } = req.body;
    const group = await FulfillmentGroup.findOneAndUpdate(
      { _id: fulfillmentGroupId, status: "CONFIRMED", riderId: null },
      { $set: { riderId: req.userId, status: "DISPATCHED" } },
      { new: true }
    );

    if (!group) {
      return res.status(409).json({ success: false, message: "This job is no longer available — it may have been claimed by another rider." });
    }

    const order = await Order.findById(group.orderId).select("buyerId orderRef").lean();
    notifyUser(order.buyerId.toString(), "fulfillment:rider_assigned", {
      fulfillmentGroupId: group._id,
      orderRef: order.orderRef,
      message: "A rider has picked up part of your order and is on the way.",
    });
    notifyUser(group.merchantId.toString(), "fulfillment:status_changed", {
      fulfillmentGroupId: group._id,
      newStatus: "DISPATCHED",
    });

    res.status(200).json({ success: true, fulfillmentGroupId: group._id, orderRef: order.orderRef });
  } catch (error) {
    console.error("[claimJobV2]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const finalizeHandoverV2 = async (req, res) => {
  const { fulfillmentGroupId, submittedOtp, signatureBase64 } = req.body;

  try {
    if (!fulfillmentGroupId || !submittedOtp || !signatureBase64) {
      return res.status(400).json({ success: false, message: "fulfillmentGroupId, submittedOtp, and signatureBase64 are required" });
    }
    if (!/^\d{4}$/.test(submittedOtp)) {
      return res.status(400).json({ success: false, message: "OTP must be exactly 4 digits" });
    }

    const group = await FulfillmentGroup.findOne({
      _id: fulfillmentGroupId,
      riderId: req.userId,
      status: "DISPATCHED",
    }).select("+riderOtpHash");

    if (!group) return res.status(404).json({ success: false, message: "Active delivery not found or not assigned to you" });
    if (!group.riderOtpHash) return res.status(500).json({ success: false, message: "OTP configuration error on this fulfillment group" });

    const otpValid = await verifyOtp(submittedOtp, group.riderOtpHash);
    if (!otpValid) return res.status(401).json({ success: false, message: "Invalid OTP." });

    let signatureStoragePath;
    try {
      const storage = getFirebaseStorage();
      const bucket = storage.bucket();
      const filePath = `delivery_signatures/fg_${group._id}.png`;
      const base64 = signatureBase64.replace(/^data:image\/\w+;base64,/, "");
      await bucket.file(filePath).save(Buffer.from(base64, "base64"), { metadata: { contentType: "image/png" }, resumable: false });
      signatureStoragePath = filePath;
    } catch (storageErr) {
      console.error("[finalizeHandoverV2] Storage upload failed:", storageErr.message);
      return res.status(500).json({ success: false, message: "Failed to store delivery signature. Please retry." });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const groupGrossKobo = group.items.reduce((sum, item) => sum + item.subtotalKobo, 0);

      group.status = "DELIVERED";
      group.escrowStatus = "RELEASED";
      group.signatureStoragePath = signatureStoragePath;
      await group.save({ session });

      await EscrowLedger.create([{
        orderId: group.orderId,
        fulfillmentGroupId: group._id,
        entryType: "RELEASE",
        grossTotalKobo: groupGrossKobo,
        platformFeeKobo: 0,
        merchantNetKobo: groupGrossKobo,
        escrowStatus: "RELEASED",
        actorId: req.userId,
        noteText: `Escrow released for fulfillment group ${group._id}`,
      }], { session });

      const siblingGroups = await FulfillmentGroup.find({ orderId: group.orderId }).session(session).lean();
      const allDelivered = siblingGroups.every((item) => item.status === "DELIVERED");
      if (allDelivered) {
        await Order.findByIdAndUpdate(group.orderId, { status: "DELIVERED", escrowStatus: "RELEASED" }, { session });
      }

      await session.commitTransaction();
    } catch (txErr) {
      await session.abortTransaction();
      throw txErr;
    } finally {
      session.endSession();
    }

    const order = await Order.findById(group.orderId).select("buyerId orderRef").lean();
    notifyUser(order.buyerId.toString(), "fulfillment:status_changed", {
      fulfillmentGroupId: group._id,
      newStatus: "DELIVERED",
      message: "Part of your order has been delivered.",
    });
    notifyUser(group.merchantId.toString(), "escrow:released", { fulfillmentGroupId: group._id });

    res.status(200).json({ success: true, fulfillmentGroupId: group._id, message: "Delivery confirmed. Escrow released." });
  } catch (error) {
    console.error("[finalizeHandoverV2]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateLocationV2 = async (req, res) => {
  const { fulfillmentGroupId, lat, lng } = req.body;
  try {
    const group = await FulfillmentGroup.findOne({ _id: fulfillmentGroupId, riderId: req.userId, status: "DISPATCHED" }).lean();
    if (!group) return res.status(404).json({ success: false, message: "Active delivery not found" });

    const order = await Order.findById(group.orderId).select("buyerId").lean();
    notifyUser(order.buyerId.toString(), "fulfillment:status_changed", { fulfillmentGroupId, type: "GPS_UPDATE", lat, lng });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
