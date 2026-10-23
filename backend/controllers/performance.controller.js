import mongoose from "mongoose";
import { Store } from "../models/store.model.js";
import { User, NIGERIAN_STATES } from "../models/user.model.js";
import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";
import { Order } from "../models/order.model.js";
import { KPI } from "../policy/kpiTargets.v1.js";
import { NODE_STATE } from "../policy/invitePolicy.v1.js";

const NODES = NIGERIAN_STATES.filter((s) => s !== "Global");
const HOUR = 3600 * 1000;

/** Start/end of a calendar month in Lagos time (UTC+1, no daylight saving). month = "YYYY-MM". */
export function lagosMonthRange(month) {
  let year; let monthIndex;
  if (/^\d{4}-\d{2}$/.test(month || "")) {
    year = Number(month.slice(0, 4));
    monthIndex = Number(month.slice(5, 7)) - 1;
  } else {
    const lagosNow = new Date(Date.now() + HOUR);
    year = lagosNow.getUTCFullYear();
    monthIndex = lagosNow.getUTCMonth();
  }
  const start = new Date(Date.UTC(year, monthIndex, 1) - HOUR);
  const end = new Date(Date.UTC(year, monthIndex + 1, 1) - HOUR);
  const label = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  return { start, end, label };
}

function resolveNode(req) {
  const node = req.userRole === "developer_coordinator" ? req.userState : req.query.node || req.body?.node;
  return NODES.includes(node) ? node : null;
}

export const getAffiliatePerformance = async (req, res) => {
  try {
    const node = resolveNode(req);
    if (!node) return res.status(400).json({ success: false, message: "Choose a valid market / node" });
    const { start, end, label } = lagosMonthRange(req.query.month);

    const [stores, affiliates] = await Promise.all([
      Store.find({ primaryState: node, verificationStatus: "VERIFIED" })
        .select("businessName businessType commerceSegment businessOwnerId referredByAffiliateId")
        .lean(),
      User.find({ role: "affiliate", assignedState: node, isActive: true }).select("name email publicId").lean(),
    ]);

    const ownerIds = stores.map((s) => s.businessOwnerId).filter(Boolean);
    const [v2, v1] = ownerIds.length
      ? await Promise.all([
          FulfillmentGroup.aggregate([
            { $match: { merchantId: { $in: ownerIds }, status: "DELIVERED", updatedAt: { $gte: start, $lt: end } } },
            { $addFields: { gmv: { $sum: "$items.subtotalKobo" } } },
            { $group: { _id: { m: "$merchantId", o: "$orderId" }, gmv: { $sum: "$gmv" } } },
            { $group: { _id: "$_id.m", orders: { $sum: 1 }, gmvKobo: { $sum: "$gmv" } } },
          ]),
          Order.aggregate([
            { $match: { merchantId: { $in: ownerIds }, isMultiMerchant: false, status: "DELIVERED", updatedAt: { $gte: start, $lt: end } } },
            { $group: { _id: "$merchantId", orders: { $sum: 1 }, gmvKobo: { $sum: "$grossTotalKobo" } } },
          ]),
        ])
      : [[], []];

    const byOwner = new Map();
    for (const row of [...v2, ...v1]) {
      const key = String(row._id);
      const current = byOwner.get(key) || { orders: 0, gmvKobo: 0 };
      byOwner.set(key, { orders: current.orders + row.orders, gmvKobo: current.gmvKobo + row.gmvKobo });
    }

    const storeRows = stores.map((store) => {
      const stats = byOwner.get(String(store.businessOwnerId)) || { orders: 0, gmvKobo: 0 };
      return {
        storeId: store._id,
        businessName: store.businessName,
        businessType: store.businessType,
        referredByAffiliateId: store.referredByAffiliateId || null,
        deliveredOrders: stats.orders,
        gmvKobo: stats.gmvKobo,
        isActiveShop: stats.orders >= KPI.activeShopDeliveredOrders,
      };
    });

    const affiliateRows = affiliates.map((affiliate) => {
      const mine = storeRows.filter((s) => String(s.referredByAffiliateId) === String(affiliate._id));
      const gmvKobo = mine.reduce((sum, s) => sum + s.gmvKobo, 0);
      return {
        affiliateId: affiliate._id,
        name: affiliate.name,
        email: affiliate.email,
        publicId: affiliate.publicId,
        storesOnboarded: mine.length,
        retailStores: mine.filter((s) => s.businessType === "retailer").length,
        activeShops: mine.filter((s) => s.isActiveShop).length,
        gmvKobo,
        targetKobo: KPI.affiliateMonthlyGmvKobo,
        attainmentPct: Math.round((gmvKobo / KPI.affiliateMonthlyGmvKobo) * 100),
      };
    }).sort((a, b) => b.gmvKobo - a.gmvKobo);

    const nodeGmvKobo = storeRows.reduce((sum, s) => sum + s.gmvKobo, 0);
    res.json({
      success: true,
      node,
      stateName: NODE_STATE[node],
      month: label,
      summary: {
        verifiedStores: storeRows.length,
        activeShops: storeRows.filter((s) => s.isActiveShop).length,
        activeShopsTarget: KPI.coordinatorActiveShops,
        gmvKobo: nodeGmvKobo,
        gmvTargetKobo: KPI.coordinatorMonthlyGmvKobo,
        unattributedStores: storeRows.filter((s) => !s.referredByAffiliateId).length,
      },
      affiliates: affiliateRows,
      stores: storeRows,
    });
  } catch (error) {
    console.error("[getAffiliatePerformance]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/performance/stores/:storeId/referral  { affiliateId | null }
export const setStoreReferral = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { affiliateId } = req.body || {};
    if (!mongoose.isValidObjectId(storeId)) return res.status(400).json({ success: false, message: "Invalid store" });

    const store = await Store.findById(storeId).select("primaryState");
    if (!store) return res.status(404).json({ success: false, message: "Store not found" });
    if (req.userRole === "developer_coordinator" && store.primaryState !== req.userState) {
      return res.status(403).json({ success: false, message: "That store is outside your node" });
    }

    if (affiliateId) {
      const affiliate = await User.findOne({ _id: affiliateId, role: "affiliate", isActive: true }).select("assignedState");
      if (!affiliate || affiliate.assignedState !== store.primaryState) {
        return res.status(400).json({ success: false, message: "Choose an active affiliate officer from the same node" });
      }
    }

    store.referredByAffiliateId = affiliateId || null;
    store.referralAttributedBy = req.userId;
    store.referralAttributedAt = new Date();
    await store.save();
    res.json({ success: true });
  } catch (error) {
    console.error("[setStoreReferral]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
