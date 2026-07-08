import mongoose from "mongoose";
import { User }         from "../models/user.model.js";
import { Order }        from "../models/order.model.js";
import { Product }      from "../models/product.model.js";
import { EscrowLedger } from "../models/ledger.model.js";
import { notifyUser }   from "../utils/sseService.js";
import {
  sendKycApprovedEmail,
  sendKycRejectedEmail,
} from "../mailtrap/emails.js";

// ── SYSTEM METRICS ────────────────────────────────────────────────────────────
export const getSystemMetrics = async (req, res) => {
  try {
    const [totalUsers, totalProducts, activeOrders] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Product.countDocuments({ isActive: true }),
      Order.countDocuments({
        status: { $in: ["PENDING", "CONFIRMED", "PROCESSING", "DISPATCHED"] },
      }),
    ]);

    res.status(200).json({
      success: true,
      platform: { totalUsers, totalProducts, activeOrders },
      nodes: { Abuja: "ONLINE", Kano: "OPTIMIZED", Kaduna: "SECURE" },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── NATIONAL TELEMETRY ────────────────────────────────────────────────────────
export const getNationalTelemetry = async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to)   dateFilter.$lte = new Date(to);
    const createdAtMatch = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};

    const [orderStats, merchantCounts, kycQueue, escrowSummary] = await Promise.all([
      Order.aggregate([
        { $match: createdAtMatch },
        {
          $group: {
            _id:             "$assignedState",
            totalOrders:     { $sum: 1 },
            grossTotalKobo:  { $sum: "$grossTotalKobo" },
            platformFeeKobo: { $sum: "$platformFeeKobo" },
            deliveredCount:  { $sum: { $cond: [{ $eq: ["$status", "DELIVERED"] }, 1, 0] } },
            pendingCount:    { $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] } },
          },
        },
      ]),
      User.aggregate([
        { $match: { role: "business_owner", isActive: true } },
        { $group: { _id: "$assignedState", count: { $sum: 1 } } },
      ]),
      User.countDocuments({ kycStatus: "PENDING" }),
      EscrowLedger.aggregate([
        { $match: { entryType: "LOCK" } },
        { $group: { _id: null, totalLockedKobo: { $sum: "$grossTotalKobo" } } },
      ]),
    ]);

    // Build per-state breakdown
    const stateBreakdown = {};
    for (const state of ["Abuja", "Kano", "Kaduna"]) {
      const orders    = orderStats.find((s) => s._id === state) || {};
      const merchants = merchantCounts.find((m) => m._id === state) || {};
      stateBreakdown[state] = {
        totalOrders:     orders.totalOrders     || 0,
        grossTotalKobo:  orders.grossTotalKobo  || 0,
        grossTotalNaira: (orders.grossTotalKobo || 0) / 100,
        deliveredCount:  orders.deliveredCount  || 0,
        pendingCount:    orders.pendingCount    || 0,
        merchantCount:   merchants.count        || 0,
      };
    }

    const totalGmvKobo = orderStats.reduce((s, r) => s + (r.grossTotalKobo || 0), 0);

    res.status(200).json({
      success: true,
      totalGmvKobo,
      totalGmvNaira:    totalGmvKobo / 100,
      kycPendingCount:  kycQueue,
      escrowLockedKobo: escrowSummary[0]?.totalLockedKobo || 0,
      escrowLockedNaira:(escrowSummary[0]?.totalLockedKobo || 0) / 100,
      stateBreakdown,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[getNationalTelemetry]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── KYC QUEUE ─────────────────────────────────────────────────────────────────
export const getKycQueue = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { kycStatus: status } : {};
    const skip   = (parseInt(page) - 1) * parseInt(limit);

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("name email role assignedState kycStatus kycDocumentUrls createdAt")
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      users,
      pagination: { page: parseInt(page), limit: parseInt(limit), total },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── PROCESS KYC ADJUDICATION ──────────────────────────────────────────────────
export const processKyc = async (req, res) => {
  const { targetUserId, action, rejectionReason } = req.body;

  try {
    if (!targetUserId || !action) {
      return res.status(400).json({ success: false, message: "targetUserId and action are required" });
    }
    if (!["APPROVE", "REJECT"].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be APPROVE or REJECT" });
    }
    if (action === "REJECT" && !rejectionReason) {
      return res.status(400).json({ success: false, message: "rejectionReason is required when rejecting KYC" });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (targetUser.kycStatus === "APPROVED") {
      return res.status(400).json({ success: false, message: "User is already KYC-approved" });
    }

    targetUser.kycStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
    await targetUser.save();

    // Send email notification
    if (action === "APPROVE") {
      await sendKycApprovedEmail(targetUser.email, targetUser.name, targetUser.role);
    } else {
      await sendKycRejectedEmail(targetUser.email, targetUser.name, rejectionReason);
    }

    // Push SSE notification if user is connected
    notifyUser(targetUserId, "kyc:status_changed", {
      userId:    targetUserId,
      newStatus: targetUser.kycStatus,
      message:   action === "APPROVE"
        ? "Your KYC has been approved. Your account is now fully active."
        : `Your KYC was rejected. Reason: ${rejectionReason}`,
    });

    res.status(200).json({
      success:   true,
      userId:    targetUserId,
      newStatus: targetUser.kycStatus,
      message:   `KYC ${action === "APPROVE" ? "approved" : "rejected"} successfully`,
    });
  } catch (error) {
    console.error("[processKyc]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── REVOKE USER ACCESS ────────────────────────────────────────────────────────
export const revokeAccess = async (req, res) => {
  const { targetUserId, reason } = req.body;

  try {
    if (!targetUserId || !reason) {
      return res.status(400).json({ success: false, message: "targetUserId and reason are required" });
    }

    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.role === "super_admin") {
      return res.status(403).json({ success: false, message: "Cannot revoke another super admin" });
    }

    user.isActive = false;
    await user.save();

    notifyUser(targetUserId, "kyc:status_changed", {
      message: `Your account has been suspended. Reason: ${reason}`,
    });

    res.status(200).json({ success: true, message: "User access revoked" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── ESCROW SUMMARY ────────────────────────────────────────────────────────────
export const getEscrowSummary = async (req, res) => {
  try {
    const { from } = req.query;
    const matchFilter = {};
    if (from) matchFilter.timestamp = { $gte: new Date(from) };

    const summary = await EscrowLedger.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id:             "$entryType",
          totalKobo:       { $sum: "$grossTotalKobo" },
          platformFeeKobo: { $sum: "$platformFeeKobo" },
          merchantNetKobo: { $sum: "$merchantNetKobo" },
          count:           { $sum: 1 },
        },
      },
    ]);

    // Add Naira conversions
    const summaryWithNaira = summary.map((s) => ({
      ...s,
      totalNaira:       s.totalKobo       / 100,
      merchantNetNaira: s.merchantNetKobo / 100,
    }));

    res.status(200).json({
      success: true,
      summary: summaryWithNaira,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
