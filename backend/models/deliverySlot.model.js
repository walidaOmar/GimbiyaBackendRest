import mongoose from "mongoose";
import { NIGERIAN_STATES } from "./user.model.js";

const deliverySlotSchema = new mongoose.Schema(
  {
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    type: { type: String, enum: ["DELIVERY", "PICKUP"], required: true },
    slotDate: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    capacity: { type: Number, default: 10, min: 1, validate: Number.isInteger },
    bookedCount: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    assignedState: { type: String, enum: NIGERIAN_STATES.filter((state) => state !== "Global"), required: true, index: true },
  },
  { timestamps: true }
);

deliverySlotSchema.virtual("isFull").get(function () {
  return this.bookedCount >= this.capacity;
});
deliverySlotSchema.set("toJSON", { virtuals: true });
deliverySlotSchema.index({ assignedState: 1, type: 1, slotDate: 1 });

export const DeliverySlot = mongoose.model("DeliverySlot", deliverySlotSchema);
