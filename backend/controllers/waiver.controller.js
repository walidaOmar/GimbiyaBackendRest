import crypto from "crypto";
import mongoose from "mongoose";
import { WaiverQuota } from "../models/waiverQuota.model.js";
import { WaiverRequest } from "../models/waiverRequest.model.js";
import { FulfillmentCoupon } from "../models/fulfillmentCoupon.model.js";
import { User } from "../models/user.model.js";

function generateCouponCode() {
  return "FUL-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

export const allocateQuota = async (req, res) => {
  try {
    const { coordinatorId, totalSlots, budgetKobo, note, expiresInDays = 30 } = req.body;

    const coordinator = await User.findById(coordinatorId);
    if (!coordinator || coordinator.role !== "developer_coordinator") {
      return res.status(400).json({ success: false, message: "Invalid coordinator" });
    }

    const quota = await WaiverQuota.create({
      coordinatorId,
      allocatedBy: req.userId,
      totalSlots: Number(totalSlots),
      budgetKobo: Number(budgetKobo) || 0,
      note: note || "",
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    });

    res.status(201).json({ success: true, quota });
  } catch (error) {
    console.error("[allocateQuota]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getQuotas = async (req, res) => {
  try {
    const { coordinatorId, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (coordinatorId) filter.coordinatorId = coordinatorId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [quotas, total] = await Promise.all([
      WaiverQuota.find(filter)
        .populate("coordinatorId", "name email assignedState")
        .populate("allocatedBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      WaiverQuota.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, quotas, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (error) {
    console.error("[getQuotas]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyQuota = async (req, res) => {
  try {
    const quota = await WaiverQuota.findOne({
      coordinatorId: req.userId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    }).lean();

    if (!quota) {
      return res.status(200).json({ success: true, quota: null, message: "No active quota allocated" });
    }

    res.status(200).json({ success: true, quota });
  } catch (error) {
    console.error("[getMyQuota]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const submitWaiverRequest = async (req, res) => {
  try {
    const { targetUserIds, requestedSlots, reason } = req.body;

    if (!targetUserIds?.length || !requestedSlots) {
      return res.status(400).json({ success: false, message: "targetUserIds and requestedSlots are required" });
    }

    if (targetUserIds.length !== Number(requestedSlots)) {
      return res.status(400).json({ success: false, message: "Number of targetUserIds must match requestedSlots" });
    }

    const affiliate = await User.findById(req.userId);
    const coordinatorId = affiliate?.onboardingChain?.[affiliate.onboardingChain.length - 1] || affiliate?.onboardedBy;

    if (!coordinatorId) {
      return res.status(400).json({ success: false, message: "No coordinator found in your onboarding chain" });
    }

    const targetUsers = await User.find({ _id: { $in: targetUserIds } }).select("_id name email");
    if (targetUsers.length !== targetUserIds.length) {
      return res.status(400).json({ success: false, message: "One or more target user IDs are invalid" });
    }

    const quota = await WaiverQuota.findOne({
      coordinatorId,
      isActive: true,
      expiresAt: { $gt: new Date() },
      $expr: { $gt: [{ $subtract: ["$totalSlots", "$usedSlots"] }, 0] },
    });

    if (!quota) {
      return res.status(400).json({ success: false, message: "Your coordinator has no available waiver quota" });
    }

    const request = await WaiverRequest.create({
      affiliateId: req.userId,
      coordinatorId,
      targetUserIds,
      requestedSlots: Number(requestedSlots),
      proposedState: affiliate.assignedState,
      reason: reason || "",
    });

    res.status(201).json({ success: true, message: "Waiver request submitted to your coordinator", request });
  } catch (error) {
    console.error("[submitWaiverRequest]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPendingRequests = async (req, res) => {
  try {
    const requests = await WaiverRequest.find({ coordinatorId: req.userId, status: "PENDING" })
      .populate("affiliateId", "name email phone")
      .populate("targetUserIds", "name email assignedState")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, requests });
  } catch (error) {
    console.error("[getPendingRequests]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const approveWaiverRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { requestId } = req.params;

    const request = await WaiverRequest.findById(requestId).session(session);
    if (!request) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Request not found" });
    }
    if (request.coordinatorId.toString() !== req.userId) {
      await session.abortTransaction();
      return res.status(403).json({ success: false, message: "Not your request to approve" });
    }
    if (request.status !== "PENDING") {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Already processed" });
    }

    const quota = await WaiverQuota.findOne({
      coordinatorId: req.userId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    }).session(session);

    if (!quota || quota.remainingSlots < request.requestedSlots) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Insufficient quota slots" });
    }

    const coupon = await FulfillmentCoupon.create(
      [{
        code: generateCouponCode(),
        affiliateId: request.affiliateId,
        coordinatorId: req.userId,
        waiverRequestId: request._id,
        totalSlots: request.requestedSlots,
        budgetKobo: quota.budgetKobo > 0
          ? Math.floor(quota.budgetKobo / Math.max(1, quota.remainingSlots)) * request.requestedSlots
          : 0,
        expiresAt: quota.expiresAt,
      }],
      { session }
    );

    request.status = "APPROVED";
    request.reviewedBy = req.userId;
    request.reviewedAt = new Date();
    request.couponId = coupon[0]._id;
    await request.save({ session });

    quota.usedSlots += request.requestedSlots;
    if (quota.usedSlots >= quota.totalSlots) quota.isActive = false;
    await quota.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Waiver approved. Coupon generated.",
      coupon: {
        code: coupon[0].code,
        totalSlots: coupon[0].totalSlots,
        expiresAt: coupon[0].expiresAt,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("[approveWaiverRequest]", error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

export const rejectWaiverRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: "Rejection reason required" });

    const request = await WaiverRequest.findOne({ _id: requestId, coordinatorId: req.userId });
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });
    if (request.status !== "PENDING") return res.status(400).json({ success: false, message: "Already processed" });

    request.status = "REJECTED";
    request.reviewedBy = req.userId;
    request.reviewNote = reason;
    request.reviewedAt = new Date();
    await request.save();

    res.status(200).json({ success: true, message: "Request rejected" });
  } catch (error) {
    console.error("[rejectWaiverRequest]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyCoupons = async (req, res) => {
  try {
    const coupons = await FulfillmentCoupon.find({ affiliateId: req.userId })
      .populate("claimedBy.userId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, coupons });
  } catch (error) {
    console.error("[getMyCoupons]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const validateCoupon = async (req, res) => {
  try {
    const { code } = req.params;
    const coupon = await FulfillmentCoupon.findOne({ code: code.toUpperCase() }).lean();

    if (!coupon) return res.status(404).json({ success: false, message: "Invalid coupon" });
    if (coupon.status !== "ACTIVE") return res.status(400).json({ success: false, message: "Coupon is not active" });
    if (new Date() > coupon.expiresAt) return res.status(400).json({ success: false, message: "Coupon expired" });
    if (coupon.remainingSlots <= 0) return res.status(400).json({ success: false, message: "No slots remaining" });

    res.status(200).json({
      success: true,
      coupon: {
        code: coupon.code,
        remainingSlots: coupon.remainingSlots,
        remainingBudgetKobo: coupon.remainingBudgetKobo,
        expiresAt: coupon.expiresAt,
      },
    });
  } catch (error) {
    console.error("[validateCoupon]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
