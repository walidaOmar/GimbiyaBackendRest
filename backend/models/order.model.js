import mongoose from "mongoose";

export const ORDER_STATUSES = [
  "PENDING", "CONFIRMED", "PROCESSING", "DISPATCHED", "DELIVERED", "CANCELLED", "DISPUTED", "REFUNDED",
];

export const ESCROW_STATUSES = ["LOCKED", "RELEASED", "REFUNDED", "FROZEN"];

const orderItemSchema = new mongoose.Schema({
  productId:     { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  productName:   { type: String, required: true },   // snapshot at purchase time
  quantity:      { type: Number, required: true, min: 1 },
  unitPriceKobo: { type: Number, required: true, min: 0 },
  subtotalKobo:  { type: Number, required: true, min: 0 },
}, { _id: false });

const timelineSchema = new mongoose.Schema({
  status:    { type: String, enum: ORDER_STATUSES, required: true },
  timestamp: { type: Date, default: Date.now },
  actorId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  note:      { type: String, default: "" },
}, { _id: false });

const orderSchema = new mongoose.Schema(
  {
    orderRef:   { type: String, required: true, unique: true, index: true }, // GM-KN-240001

    buyerId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    riderId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    items: [orderItemSchema],

    // All amounts in Kobo — integer only
    grossTotalKobo:  { type: Number, required: true, min: 0 },
    platformFeeKobo: { type: Number, required: true, min: 0 },
    merchantNetKobo: { type: Number, required: true, min: 0 },

    status:       { type: String, enum: ORDER_STATUSES,  default: "PENDING", index: true },
    escrowStatus: { type: String, enum: ESCROW_STATUSES, default: "LOCKED" },

    // SECURITY: raw OTP never stored — only bcrypt hash
    riderOtpHash:         { type: String, default: null, select: false }, // select:false = NEVER returned by default
    signatureStoragePath: { type: String, default: null },

    shippingAddress:   { type: String, required: true },
    assignedState:     { type: String, enum: ["Abuja", "Kano", "Kaduna"], required: true, index: true },
    monnifyPaymentRef: { type: String, default: null },

    timeline: [timelineSchema],
  },
  { timestamps: true }
);

orderSchema.index({ status: 1, assignedState: 1, createdAt: -1 });
orderSchema.index({ buyerId: 1, status: 1, createdAt: -1 });
orderSchema.index({ riderId: 1, status: 1 });
orderSchema.index({ merchantId: 1, status: 1, createdAt: -1 });

export const Order = mongoose.model("Order", orderSchema);
