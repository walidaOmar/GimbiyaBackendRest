import mongoose from "mongoose";
import { AffiliateClick } from "../models/affiliateClick.model.js";
import { OnboardingRequest } from "../models/onboardingRequest.model.js";
import { Order } from "../models/order.model.js";

export const recordClick = async (req, res) => {
  try {
    const { referralCode, productId, productName } = req.body;

    const click = await AffiliateClick.create({
      affiliateId: req.userId,
      referralCode,
      productId: productId || null,
      productName: productName || "",
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    });

    res.status(201).json({ success: true, clickId: click._id });
  } catch (error) {
    console.error("[recordClick]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const markConversion = async (req, res) => {
  try {
    const { clickId, orderId } = req.body;

    const click = await AffiliateClick.findById(clickId);
    if (!click) return res.status(404).json({ success: false, message: "Click not found" });

    click.converted = true;
    click.orderId = orderId;
    click.convertedAt = new Date();
    await click.save();

    res.status(200).json({ success: true, message: "Conversion recorded" });
  } catch (error) {
    console.error("[markConversion]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const affiliateId = req.userId;

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const matchStage = { affiliateId: new mongoose.Types.ObjectId(affiliateId) };
    if (Object.keys(dateFilter).length) matchStage.createdAt = dateFilter;

    const [clickStats, onboardingStats, orderStats] = await Promise.all([
      AffiliateClick.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalClicks: { $sum: 1 },
            conversions: { $sum: { $cond: ["$converted", 1, 0] } },
            uniqueProducts: { $addToSet: "$productId" },
          },
        },
      ]),
      OnboardingRequest.aggregate([
        { $match: { affiliateId: new mongoose.Types.ObjectId(affiliateId), status: "APPROVED", ...(Object.keys(dateFilter).length && { createdAt: dateFilter }) } },
        { $group: { _id: null, totalOnboarded: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { affiliateReferralCode: { $exists: true }, ...(Object.keys(dateFilter).length && { createdAt: dateFilter }) } },
        { $group: { _id: null, totalRevenueKobo: { $sum: "$grossTotalKobo" }, totalOrders: { $sum: 1 } } },
      ]),
    ]);

    const clicks = clickStats[0] || { totalClicks: 0, conversions: 0, uniqueProducts: [] };
    const conversionRate = clicks.totalClicks > 0 ? ((clicks.conversions / clicks.totalClicks) * 100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      analytics: {
        totalClicks: clicks.totalClicks,
        conversions: clicks.conversions,
        conversionRate: `${conversionRate}%`,
        uniqueProductsClicked: (clicks.uniqueProducts || []).filter(Boolean).length,
        totalOnboarded: onboardingStats[0]?.totalOnboarded || 0,
        totalRevenueNaira: (orderStats[0]?.totalRevenueKobo || 0) / 100,
        totalReferralOrders: orderStats[0]?.totalOrders || 0,
      },
    });
  } catch (error) {
    console.error("[getAnalytics]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getClickHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [clicks, total] = await Promise.all([
      AffiliateClick.find({ affiliateId: req.userId })
        .populate("productId", "name priceKobo imageUrls")
        .populate("orderId", "orderRef grossTotalKobo status")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      AffiliateClick.countDocuments({ affiliateId: req.userId }),
    ]);

    res.status(200).json({ success: true, clicks, pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total } });
  } catch (error) {
    console.error("[getClickHistory]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
