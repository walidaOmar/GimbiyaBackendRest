import mongoose from "mongoose";

export const PAYMENT_INTENT_STATUSES = ["INITIATED", "PAID", "FAILED", "EXPIRED"];

const paymentIntentSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    monnifyTransactionReference: { type: String, default: null, index: true },
    checkoutUrl: { type: String, default: null },
    amountKobo: { type: Number, required: true },
    status: { type: String, enum: PAYMENT_INTENT_STATUSES, default: "INITIATED", index: true },
    splits: [{
      fulfillmentGroupId: { type: mongoose.Schema.Types.ObjectId, ref: "FulfillmentGroup", default: null },
      merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      subAccountCode: { type: String, required: true },
      amountKobo: { type: Number, required: true },
    }],
    rawWebhookPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const PaymentIntent = mongoose.model("PaymentIntent", paymentIntentSchema);
