import mongoose from "mongoose";

const settlementSchema = new mongoose.Schema({
  monnifyReference: { type: String, required: true, unique: true },
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  amountKobo: { type: Number, required: true, min: 0 },
  bankCode: { type: String, default: "" },
  accountNumber: { type: String, default: "" },
  accountName: { type: String, default: "" },
  status: { type: String, enum: ["PENDING", "PROCESSING", "PAID", "FAILED"], default: "PENDING", index: true },
  assignedState: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true });

export const Settlement = mongoose.model("Settlement", settlementSchema);
