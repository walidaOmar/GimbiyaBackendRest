import mongoose from "mongoose";

/**
 * Append-only. The highest `version` is the active Revenue Architecture.
 * Changing a rate = publishing a new version (never editing an old one), so there is a
 * permanent record of who changed what, when and why.
 */
const revenueConfigSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true, unique: true, index: true },
    nodeCommissionPct: { type: mongoose.Schema.Types.Mixed, required: true },
    level2CommissionPct: { type: Number, required: true, min: 0, max: 30 },
    wholesaleCommissionPct: { type: Number, required: true, min: 0, max: 30 },
    platformFeePct: { type: Number, required: true, min: 0, max: 10 },
    deliveryFeeKobo: { type: Number, default: 150000, min: 0 },
    ratePrecedence: { type: [String], default: ["wholesale", "level2", "node"] },
    splitReferred: { type: mongoose.Schema.Types.Mixed, required: true },
    splitOrganic: { type: mongoose.Schema.Types.Mixed, required: true },
    subscription: { type: mongoose.Schema.Types.Mixed, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // null = system default
    reason: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export const RevenueConfig = mongoose.model("RevenueConfig", revenueConfigSchema);
