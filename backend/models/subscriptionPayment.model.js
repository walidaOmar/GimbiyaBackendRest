import mongoose from "mongoose";

const subscriptionPaymentSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tier: { type: String, enum: ["PRO", "LEGENDARY"], required: true },
    amountKobo: { type: Number, required: true, min: 1 },
    reference: { type: String, required: true, unique: true }, // SUB-... used as the Monnify paymentReference
    monnifyTransactionReference: { type: String, default: null, index: true },
    checkoutUrl: { type: String, default: null },
    status: { type: String, enum: ["INITIATED", "PAID", "FAILED"], default: "INITIATED", index: true },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const SubscriptionPayment = mongoose.model("SubscriptionPayment", subscriptionPaymentSchema);
