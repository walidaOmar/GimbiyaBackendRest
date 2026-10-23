import mongoose from "mongoose";

export const AUDIT_ACTIONS = [
  "WAIVER_APPROVED",
  "WAIVER_REJECTED",
  "WAIVER_EXPIRED",
  "ALLOCATION_CREATED",
  "ALLOCATION_ADJUSTED",
  "PAYMENT_CAPTURED",
  "PAYOUT_ISSUED",
  "KYC_TIER_CHANGED",
  "ROLE_CHANGED",
  "BUSINESS_UPGRADE_APPROVED",
  "BUSINESS_UPGRADE_REJECTED",
  "REFUND_ISSUED",
  "WITHDRAWAL_APPROVED",
  "WITHDRAWAL_PAID",
  "WITHDRAWAL_REJECTED",
  "SUBSCRIPTION_CHANGED",
  "STORE_VERIFIED",
  "STORE_REJECTED",
];

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: AUDIT_ACTIONS, required: true, index: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetType: { type: String, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, default: "" },
    ip: { type: String, default: null },
  },
  { timestamps: true }
);

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
