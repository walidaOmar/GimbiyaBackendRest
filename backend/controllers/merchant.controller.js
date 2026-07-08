import mongoose from "mongoose";
import { Order }        from "../models/order.model.js";
import { Product }      from "../models/product.model.js";
import { EscrowLedger } from "../models/ledger.model.js";

// ── MERCHANT ANALYTICS ────────────────────────────────────────────────────────
export const getMerchantAnalytics = async (req, res) => {
  try {
    const merchantId = new mongoose.Types.ObjectId(req.userId);

    const [orderStats, topProducts] = await Promise.all([
      Order.aggregate([
        { $match: { merchantId } },
        {
          $group: {
            _id:             "$status",
            count:           { $sum: 1 },
            totalKobo:       { $sum: "$grossTotalKobo" },
            merchantNetKobo: { $sum: "$merchantNetKobo" },
          },
        },
      ]),
      Product.find({ merchantId: req.userId })
        .select("name priceKobo soldCount stock averageRating")
        .sort({ soldCount: -1 })
        .limit(5)
        .lean(),
    ]);

    const orderStatsWithNaira = orderStats.map((s) => ({
      ...s,
      totalNaira:       s.totalKobo       / 100,
      merchantNetNaira: s.merchantNetKobo / 100,
    }));

    res.status(200).json({
      success:        true,
      orderBreakdown: orderStatsWithNaira,
      topProducts,
      generatedAt:    new Date().toISOString(),
    });
  } catch (error) {
    console.error("[getMerchantAnalytics]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── SETTLEMENT LEDGER ─────────────────────────────────────────────────────────
export const getSettlementLedger = async (req, res) => {
  try {
    const { page = 1, limit = 20, from, to } = req.query;

    const orderFilter = { merchantId: req.userId };
    if (from) orderFilter.createdAt = { ...orderFilter.createdAt, $gte: new Date(from) };
    if (to)   orderFilter.createdAt = { ...orderFilter.createdAt, $lte: new Date(to) };

    const merchantOrders = await Order.find(orderFilter).select("_id").lean();
    const orderIds       = merchantOrders.map((o) => o._id);

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [entries, total] = await Promise.all([
      EscrowLedger.find({ orderId: { $in: orderIds } })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      EscrowLedger.countDocuments({ orderId: { $in: orderIds } }),
    ]);

    const released          = entries.filter((e) => e.entryType === "RELEASE");
    const totalReleasedKobo = released.reduce((s, e) => s + e.merchantNetKobo, 0);

    res.status(200).json({
      success: true,
      entries,
      summary: {
        totalReleasedKobo,
        totalReleasedNaira: totalReleasedKobo / 100,
        entryCount:         total,
      },
      pagination: { page: parseInt(page), limit: parseInt(limit), total },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
