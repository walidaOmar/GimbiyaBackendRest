import crypto from "crypto";
import { AffiliateLink } from "../models/cart.model.js";
import { Order }         from "../models/order.model.js";

// ── CREATE CAMPAIGN LINK ──────────────────────────────────────────────────────
export const createCampaign = async (req, res) => {
  try {
    const { campaignName } = req.body;
    if (!campaignName) {
      return res.status(400).json({ success: false, message: "campaignName is required" });
    }

    // Generate unique referral code
    const code = `GML-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    const link = await AffiliateLink.create({
      partnerId:    req.userId,
      campaignName,
      code,
    });

    res.status(201).json({
      success:      true,
      campaignId:   link._id,
      code:         link.code,
      referralUrl:  `${process.env.CLIENT_URL}/shop?ref=${link.code}`,
      message:      "Campaign created successfully",
    });
  } catch (error) {
    console.error("[createCampaign]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET MY CAMPAIGNS ──────────────────────────────────────────────────────────
export const getMyCampaigns = async (req, res) => {
  try {
    const campaigns = await AffiliateLink.find({ partnerId: req.userId })
      .sort({ createdAt: -1 })
      .lean();

    const enriched = campaigns.map((c) => ({
      ...c,
      conversionRate:       c.clicks > 0
        ? ((c.conversions / c.clicks) * 100).toFixed(2)
        : "0.00",
      commissionNaira:      c.commissionKobo / 100,
      referralUrl:          `${process.env.CLIENT_URL}/shop?ref=${c.code}`,
    }));

    res.status(200).json({ success: true, campaigns: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── TRACK CLICK ───────────────────────────────────────────────────────────────
// Called when a buyer lands on /shop?ref=CODE
export const trackClick = async (req, res) => {
  try {
    const { code } = req.params;
    const link = await AffiliateLink.findOneAndUpdate(
      { code, isActive: true },
      { $inc: { clicks: 1 } },
      { new: true }
    );
    if (!link) {
      return res.status(404).json({ success: false, message: "Invalid referral code" });
    }
    res.status(200).json({ success: true, message: "Click tracked" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET AFFILIATE ANALYTICS ───────────────────────────────────────────────────
export const getAnalytics = async (req, res) => {
  try {
    const campaigns = await AffiliateLink.find({ partnerId: req.userId }).lean();

    const totalClicks      = campaigns.reduce((s, c) => s + c.clicks, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);
    const totalCommissionKobo = campaigns.reduce((s, c) => s + c.commissionKobo, 0);

    res.status(200).json({
      success: true,
      summary: {
        totalClicks,
        totalConversions,
        totalCommissionKobo,
        totalCommissionNaira: totalCommissionKobo / 100,
        overallCvr: totalClicks > 0
          ? ((totalConversions / totalClicks) * 100).toFixed(2)
          : "0.00",
        campaignCount: campaigns.length,
      },
      campaigns,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
