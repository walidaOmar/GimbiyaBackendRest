import mongoose from "mongoose";
import { PerformanceTarget } from "../models/performanceTarget.model.js";
import { AffiliateLink } from "../models/cart.model.js";
import { AffiliateClick } from "../models/affiliateClick.model.js";
import { Order } from "../models/order.model.js";
import { Product } from "../models/product.model.js";
import { Store } from "../models/store.model.js";
import { User } from "../models/user.model.js";
import { EscrowLedger } from "../models/ledger.model.js";
import { Settlement } from "../models/settlement.model.js";

const isCeo = (req) => ["ceo", "super_admin"].includes(req.userRole);
const scope = (req, field = "assignedState") => isCeo(req) ? {} : { [field]: req.userState };
const objectId = (value) => new mongoose.Types.ObjectId(value);

export const getMyTarget = async (req, res) => {
  try {
    const target = await PerformanceTarget.findOne({ userId: req.userId, ...scope(req) }).sort({ startDate: -1 }).lean();
    const achievedKobo = target?.achievedKobo || 0;
    const targetKobo = target?.targetKobo || 0;
    return res.json({ success: true, targetKobo, achievedKobo, retentionPercent: target?.retentionPercent || 0, status: target?.status || "BEHIND", period: target?.period || null });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getAffiliateSummary = async (req, res) => {
  try {
    const affiliateId = objectId(req.userId);
    const links = await AffiliateLink.find({ partnerId: affiliateId }).select("code clicks").lean();
    const codes = links.map((link) => link.code);
    const [referrals, sales, clicks, payouts] = await Promise.all([
      Order.countDocuments({ affiliateReferralCode: { $in: codes }, ...scope(req) }),
      Order.aggregate([{ $match: { affiliateReferralCode: { $in: codes }, ...scope(req) } }, { $group: { _id: null, salesKobo: { $sum: "$grossTotalKobo" } } }]),
      AffiliateClick.countDocuments({ affiliateId }),
      Settlement.aggregate([{ $match: { merchantId: affiliateId, ...scope(req) } }, { $group: { _id: "$status", amountKobo: { $sum: "$amountKobo" } } }]),
    ]);
    return res.json({ success: true, referrals, salesKobo: sales[0]?.salesKobo || 0, clicks, payouts: payouts.map(({ _id, amountKobo }) => ({ status: _id, amountKobo })) });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getCoordinatorRegion = async (req, res) => {
  try {
    const state = req.userState;
    const [gmv, activeShops, fulfillment] = await Promise.all([
      Order.aggregate([{ $match: { assignedState: state } }, { $group: { _id: null, gmvKobo: { $sum: "$grossTotalKobo" } } }]),
      Store.countDocuments({ primaryState: state, verificationStatus: "VERIFIED" }),
      Order.aggregate([{ $match: { assignedState: state } }, { $group: { _id: null, total: { $sum: 1 }, fulfilled: { $sum: { $cond: [{ $eq: ["$status", "DELIVERED"] }, 1, 0] } } } }]),
    ]);
    const total = fulfillment[0]?.total || 0;
    return res.json({ success: true, assignedState: state, regionalGmvKobo: gmv[0]?.gmvKobo || 0, activeShops, fulfillmentPercent: total ? Math.round((fulfillment[0].fulfilled / total) * 10000) / 100 : 0 });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getCeoMetrics = async (req, res) => {
  try {
    const [gmv, escrow, kycQueue, payoutQueue] = await Promise.all([
      Order.aggregate([{ $group: { _id: null, platformGmvKobo: { $sum: "$grossTotalKobo" } } }]),
      EscrowLedger.aggregate([{ $group: { _id: "$entryType", amountKobo: { $sum: "$grossTotalKobo" }, count: { $sum: 1 } } }]),
      User.countDocuments({ kycStatus: "PENDING" }),
      Settlement.aggregate([{ $match: { status: { $in: ["PENDING", "PROCESSING"] } } }, { $group: { _id: null, count: { $sum: 1 }, amountKobo: { $sum: "$amountKobo" } } }]),
    ]);
    return res.json({ success: true, platformGmvKobo: gmv[0]?.platformGmvKobo || 0, escrowLedger: escrow, kycQueue, payoutQueue: payoutQueue[0] || { count: 0, amountKobo: 0 } });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getCeoTelemetry = async (req, res) => {
  try {
    const [orders, inventory] = await Promise.all([
      Order.find({}).sort({ updatedAt: -1 }).limit(100).select("_id orderRef status assignedState updatedAt").lean(),
      Product.find({ stock: { $lte: 10 }, isActive: true }).sort({ updatedAt: -1 }).limit(100).select("_id name stock assignedState updatedAt").lean(),
    ]);
    const events = [
      ...orders.map((order) => ({ type: "order", event: "order.updated", data: order, timestamp: order.updatedAt })),
      ...inventory.map((product) => ({ type: "inventory", event: "inventory.low_stock", data: product, timestamp: product.updatedAt })),
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return res.json({ success: true, events });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};
