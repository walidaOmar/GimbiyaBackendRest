import mongoose from "mongoose";

export const RELATIONSHIP_STATUSES = ["ACTIVE", "AT_RISK", "DORMANT"];

const interactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["MARKET_VISIT", "BUSINESS_UPGRADE", "PURCHASE", "WAIVER", "SUPPORT", "REFERRAL"],
      required: true,
    },
    note: { type: String, default: "" },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    occurredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const relationshipSchema = new mongoose.Schema(
  {
    consumerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    consumerPublicId: { type: String, required: true, index: true },
    affiliateOfficerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    stateCoordinatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    region: {
      type: String,
      enum: ["Ado bayero mall", "Tafawa balewa refinery", "Sardauna market", "Global"],
      required: true,
    },
    relationshipStatus: { type: String, enum: RELATIONSHIP_STATUSES, default: "ACTIVE", index: true },
    startedAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
    lastPurchaseAt: { type: Date, default: null },
    interactionHistory: [interactionSchema],
  },
  { timestamps: true }
);

relationshipSchema.index({ consumerId: 1, affiliateOfficerId: 1 }, { unique: true });

export const Relationship = mongoose.model("Relationship", relationshipSchema);
