import mongoose from "mongoose";

export const WITHDRAWAL_STATUSES = ["REQUESTED", "APPROVED", "PAID", "REJECTED", "FAILED"];

const withdrawalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amountKobo: { type: Number, required: true, min: 100000, validate: { validator: Number.isInteger, message: "amountKobo must be an integer" } },
    bankCode: { type: String, required: true },
    bankName: { type: String, default: "" },
    accountNumber: { type: String, required: true },
    accountName: { type: String, default: "" },
    status: { type: String, enum: WITHDRAWAL_STATUSES, default: "REQUESTED", index: true },
    reference: { type: String, required: true, unique: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewNote: { type: String, default: "" },
    monnifyRef: { type: String, default: null },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema);
