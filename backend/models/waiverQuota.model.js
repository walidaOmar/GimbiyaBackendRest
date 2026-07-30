import mongoose from "mongoose";

const waiverQuotaSchema = new mongoose.Schema(
  {
    coordinatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    allocatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    totalSlots: { type: Number, required: true, min: 1 },
    usedSlots: { type: Number, default: 0, min: 0 },
    budgetKobo: { type: Number, default: 0, min: 0 },
    usedBudgetKobo: { type: Number, default: 0, min: 0 },
    note: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

waiverQuotaSchema.virtual("remainingSlots").get(function () {
  return Math.max(0, this.totalSlots - this.usedSlots);
});

waiverQuotaSchema.set("toJSON", { virtuals: true });

export const WaiverQuota = mongoose.model("WaiverQuota", waiverQuotaSchema);
