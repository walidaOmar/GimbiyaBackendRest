import mongoose from "mongoose";

export const WALLET_KINDS = [
  "MERCHANT_SALE", "SERVICE_PAYOUT", "RIDER_EARNING", "AFFILIATE_COMMISSION", "PLATFORM_REVENUE", "UNASSIGNED_RIDER_SHARE",
  "WITHDRAWAL_HOLD", "WITHDRAWAL_RELEASE", "SUBSCRIPTION_PAYMENT", "REFUND_REVERSAL",
];

/**
 * Append-only wallet ledger. A user's balance = SUM(amountKobo) of their rows.
 * Credits are positive, debits (withdrawal holds) are negative. Platform money uses userId = null.
 * The unique {groupId, kind, userId} index makes crediting a delivered group idempotent.
 */
const walletEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true }, // null = platform
    kind: { type: String, enum: WALLET_KINDS, required: true },
    amountKobo: { type: Number, required: true, validate: { validator: Number.isInteger, message: "amountKobo must be an integer" } },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null, index: true },
    fulfillmentGroupId: { type: mongoose.Schema.Types.ObjectId, ref: "FulfillmentGroup", default: null },
    withdrawalId: { type: mongoose.Schema.Types.ObjectId, ref: "Withdrawal", default: null },
    note: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

walletEntrySchema.index({ fulfillmentGroupId: 1, kind: 1, userId: 1 }, { unique: true, partialFilterExpression: { fulfillmentGroupId: { $type: "objectId" } } });

export const WalletEntry = mongoose.model("WalletEntry", walletEntrySchema);
