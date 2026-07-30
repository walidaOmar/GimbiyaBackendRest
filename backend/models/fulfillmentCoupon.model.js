import mongoose from "mongoose";

export const COUPON_STATUSES = ["ACTIVE", "EXHAUSTED", "EXPIRED", "REVOKED"];

const fulfillmentCouponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, index: true },
    affiliateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    coordinatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    waiverRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "WaiverRequest", required: true },
    totalSlots: { type: Number, required: true, min: 1 },
    usedSlots: { type: Number, default: 0, min: 0 },
    budgetKobo: { type: Number, default: 0, min: 0 },
    usedBudgetKobo: { type: Number, default: 0, min: 0 },
    claimedBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        claimedAt: { type: Date, default: Date.now },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
      },
    ],
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: COUPON_STATUSES, default: "ACTIVE", index: true },
  },
  { timestamps: true }
);

fulfillmentCouponSchema.virtual("remainingSlots").get(function () {
  return Math.max(0, this.totalSlots - this.usedSlots);
});

fulfillmentCouponSchema.virtual("remainingBudgetKobo").get(function () {
  return Math.max(0, this.budgetKobo - this.usedBudgetKobo);
});

fulfillmentCouponSchema.set("toJSON", { virtuals: true });

export const FulfillmentCoupon = mongoose.model("FulfillmentCoupon", fulfillmentCouponSchema);
