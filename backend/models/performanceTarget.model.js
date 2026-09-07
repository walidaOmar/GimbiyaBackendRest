import mongoose from "mongoose";

const performanceTargetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  period: { type: String, required: true },
  startDate: { type: Date, required: true },
  assignedState: { type: String, required: true, index: true },
  targetKobo: { type: Number, required: true, min: 0 },
  achievedKobo: { type: Number, default: 0, min: 0 },
  referralCount: { type: Number, default: 0, min: 0 },
  salesKobo: { type: Number, default: 0, min: 0 },
  retentionPercent: { type: Number, default: 0, min: 0, max: 100 },
  status: { type: String, enum: ["BEHIND", "ON_TRACK", "ACHIEVED"], default: "BEHIND" },
}, { timestamps: true });

performanceTargetSchema.index({ userId: 1, period: 1, startDate: 1 }, { unique: true });
export const PerformanceTarget = mongoose.model("PerformanceTarget", performanceTargetSchema);
