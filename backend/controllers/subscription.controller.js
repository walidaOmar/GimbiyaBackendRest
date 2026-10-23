import crypto from "crypto";
import { Store } from "../models/store.model.js";
import { User } from "../models/user.model.js";
import { SubscriptionPayment } from "../models/subscriptionPayment.model.js";
import { getRevenueConfig } from "../utils/revenueCache.js";
import { TIERS, effectiveTier } from "../policy/entitlements.v1.js";
import { usageFor } from "../services/subscriptionService.js";
import { initiateTransaction } from "../services/monnifyService.js";
import { writeAuditLog } from "../utils/auditLogger.js";

const priceFor = (tier) => {
  const s = getRevenueConfig().subscription;
  return tier === "PRO" ? s.proKobo : tier === "LEGENDARY" ? s.legendaryKobo : 0;
};

export const getMySubscription = async (req, res) => {
  try {
    const store = await Store.findOne({ businessOwnerId: req.userId });
    if (!store) return res.status(404).json({ success: false, message: "You do not have a store yet." });
    const tier = effectiveTier(store);
    res.json({
      success: true,
      data: {
        storeName: store.businessName,
        tier,
        paidTier: store.subscriptionTier,
        expiresAt: store.subscriptionExpiresAt,
        limits: TIERS[tier],
        usage: await usageFor(store),
        plans: ["BASIC", "PRO", "LEGENDARY"].map((t) => ({ tier: t, ...TIERS[t], priceKobo: priceFor(t) })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load your plan" });
  }
};

export const startSubscriptionCheckout = async (req, res) => {
  try {
    const { tier } = req.body;
    if (!["PRO", "LEGENDARY"].includes(tier)) return res.status(400).json({ success: false, message: "Choose PRO or LEGENDARY." });
    const amountKobo = priceFor(tier);
    if (!amountKobo) return res.status(400).json({ success: false, message: "That plan has no price set yet. Please contact support." });

    const store = await Store.findOne({ businessOwnerId: req.userId, verificationStatus: "VERIFIED" });
    if (!store) return res.status(403).json({ success: false, message: "Your store must be verified first." });

    const reference = `SUB-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const monnify = await initiateTransaction({
      amount: amountKobo / 100,
      customerName: req.user.name,
      customerEmail: req.user.email,
      paymentReference: reference,
      paymentDescription: `Gimbiya Mall ${tier} plan (1 year)`,
      currencyCode: "NGN",
      contractCode: process.env.MONNIFY_CONTRACT_CODE || "",
      redirectUrl: `${(process.env.CLIENT_URL || "").replace(/\/+$/, "")}/merchant/subscription`,
      paymentMethods: ["ACCOUNT_TRANSFER", "CARD"],
    });
    await SubscriptionPayment.create({
      storeId: store._id, userId: req.userId, tier, amountKobo, reference,
      monnifyTransactionReference: monnify.transactionReference, checkoutUrl: monnify.checkoutUrl,
    });
    res.json({ success: true, checkoutUrl: monnify.checkoutUrl });
  } catch (error) {
    console.error("[startSubscriptionCheckout]", error?.response?.data || error.message);
    res.status(500).json({ success: false, message: "Could not start the payment. Please try again." });
  }
};

// HQ can grant or change a plan by hand (pilot stores, goodwill, corrections). Always audited.
export const setStorePlan = async (req, res) => {
  try {
    const { tier, days = 365, reason } = req.body;
    if (!["BASIC", "PRO", "LEGENDARY"].includes(tier)) return res.status(400).json({ success: false, message: "Invalid tier" });
    if (!reason || String(reason).trim().length < 5) return res.status(400).json({ success: false, message: "A reason of at least 5 characters is required" });
    const store = await Store.findById(req.params.storeId);
    if (!store) return res.status(404).json({ success: false, message: "Store not found" });
    const old = { tier: store.subscriptionTier, expiresAt: store.subscriptionExpiresAt };
    store.subscriptionTier = tier;
    store.subscriptionExpiresAt = tier === "BASIC" ? null : new Date(Date.now() + Math.min(Math.max(Number(days) || 365, 1), 1095) * 86400000);
    await store.save();
    await writeAuditLog({ action: "SUBSCRIPTION_CHANGED", performedBy: req.userId, targetType: "Store", targetId: store._id, oldValue: old, newValue: { tier, expiresAt: store.subscriptionExpiresAt }, reason: String(reason).trim() });
    res.json({ success: true, data: { tier: store.subscriptionTier, expiresAt: store.subscriptionExpiresAt } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not change the plan" });
  }
};
