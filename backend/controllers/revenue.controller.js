import { RevenueConfig } from "../models/revenueConfig.model.js";
import { loadRevenueConfig, publishRevenueConfig } from "../services/revenueConfig.service.js";
import { getRevenueConfig } from "../utils/revenueCache.js";

export const getCurrentRevenue = async (_req, res) => {
  try {
    await loadRevenueConfig();
    const config = getRevenueConfig();
    const effectiveRates = Object.entries(config.nodeCommissionPct).map(([node, pct]) => ({
      node,
      level1Pct: pct,
      level2Pct: config.level2CommissionPct,
      wholesalePct: config.wholesaleCommissionPct,
    }));
    res.json({ success: true, config, effectiveRates });
  } catch (error) {
    console.error("[getCurrentRevenue]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getRevenueHistory = async (_req, res) => {
  try {
    const history = await RevenueConfig.find().sort({ version: -1 }).limit(50).populate("changedBy", "name email").lean();
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const publishRevenue = async (req, res) => {
  try {
    const { reason, ...input } = req.body || {};
    const result = await publishRevenueConfig(input, req.userId, reason);
    if (result.errors) return res.status(400).json({ success: false, message: result.errors.join(". "), errors: result.errors });
    res.status(201).json({ success: true, message: `Revenue Architecture v${result.doc.version} is now live`, config: getRevenueConfig() });
  } catch (error) {
    console.error("[publishRevenue]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
