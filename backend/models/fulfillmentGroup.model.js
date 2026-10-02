import mongoose from "mongoose";
import { ORDER_STATUSES, ESCROW_STATUSES } from "./order.model.js";

const fulfillmentItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
  productName: { type: String, default: null },
  quantity: { type: Number, default: 1 },
  unitPriceKobo: { type: Number, default: 0 },
  subtotalKobo: { type: Number, default: 0 },
  serviceType: { type: String, default: null },
}, { _id: false });

const fulfillmentGroupSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    groupType: { type: String, enum: ["PRODUCT", "SERVICE"], default: "PRODUCT" },
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    logisticsOption: { type: String, enum: ["DELIVERY", "PICKUP"], default: null },
    deliverySlotId: { type: mongoose.Schema.Types.ObjectId, ref: "DeliverySlot", default: null },

    items: [fulfillmentItemSchema],

    status: { type: String, enum: ORDER_STATUSES, default: "PENDING", index: true },
    escrowStatus: { type: String, enum: ESCROW_STATUSES, default: "LOCKED" },

    riderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    riderOtpHash: { type: String, default: null, select: false },
    signatureStoragePath: { type: String, default: null },

    readyDate: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

fulfillmentGroupSchema.index({ orderId: 1, merchantId: 1 });
fulfillmentGroupSchema.index({ merchantId: 1, status: 1, createdAt: -1 });

export const FulfillmentGroup = mongoose.model("FulfillmentGroup", fulfillmentGroupSchema);
