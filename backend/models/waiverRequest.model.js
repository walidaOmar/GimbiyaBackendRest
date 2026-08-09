import mongoose from "mongoose";

export const WAIVER_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

const waiverRequestSchema = new mongoose.Schema(
  {
    affiliateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    coordinatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    proposedState: { type: String, enum: ["Ado bayero mall", "Tafawa balewa refinery", "Sardauna market", "Global"], required: true },
    requestedSlots: { type: Number, required: true, min: 1 },
    reason: { type: String, default: "" },
    status: { type: String, enum: WAIVER_STATUSES, default: "PENDING", index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewNote: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: "FulfillmentCoupon", default: null },
  },
  { timestamps: true }
);

waiverRequestSchema.index({ coordinatorId: 1, status: 1 });
waiverRequestSchema.index({ affiliateId: 1, createdAt: -1 });

export const WaiverRequest = mongoose.model("WaiverRequest", waiverRequestSchema);
