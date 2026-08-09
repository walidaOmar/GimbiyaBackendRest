import mongoose from "mongoose";

export const GROUP_ORDER_STATUSES = ["OPEN", "FULFILLED", "CANCELLED", "EXPIRED"];

const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceKobo: { type: Number, required: true, min: 0 },
    subtotalKobo: { type: Number, required: true, min: 0 },
    joinedAt: { type: Date, default: Date.now },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  },
  { _id: true }
);

const groupOrderSchema = new mongoose.Schema(
  {
    fulfillmentCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      uppercase: true,
    },
    initiatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    productImageUrl: { type: String, default: "" },
    basePriceKobo: { type: Number, required: true, min: 0 },
    targetQuantity: { type: Number, required: true, min: 2 },
    currentQuantity: { type: Number, default: 0, min: 0 },
    maxQuantity: { type: Number, default: 100, min: 2 },
    discountTiers: [
      {
        minQty: { type: Number, required: true },
        discountPct: { type: Number, required: true, min: 0, max: 100 },
      },
    ],
    participants: [participantSchema],
    status: { type: String, enum: GROUP_ORDER_STATUSES, default: "OPEN", index: true },
    assignedState: { type: String, enum: ["Ado bayero mall", "Tafawa balewa refinery", "Sardauna market"], required: true },
    expiresAt: { type: Date, required: true },
    fulfilledAt: { type: Date, default: null },
    masterOrderRef: { type: String, default: null },
  },
  { timestamps: true }
);

groupOrderSchema.index({ status: 1, assignedState: 1, expiresAt: 1 });
groupOrderSchema.index({ initiatorId: 1, status: 1 });

export const GroupOrder = mongoose.model("GroupOrder", groupOrderSchema);
