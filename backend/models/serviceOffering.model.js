import mongoose from "mongoose";
import { NIGERIAN_STATES } from "./user.model.js";

const serviceOfferingSchema = new mongoose.Schema(
  {
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", default: null },
    serviceType: { type: String, required: true, trim: true },
    descriptionText: { type: String, default: "", maxlength: 2000 },
    priceKobo: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: "priceKobo must be an integer" },
    },
    estimatedDurationHours: { type: Number, default: null, min: 0 },
    category: { type: String, default: "other", trim: true, index: true },
    pricingModel: { type: String, enum: ["FIXED", "HOURLY", "PER_UNIT", "QUOTE", "INSPECTION"], default: "FIXED" },
    serviceArea: { type: String, default: "", trim: true },
    assignedState: { type: String, enum: NIGERIAN_STATES.filter((state) => state !== "Global"), required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

serviceOfferingSchema.index({ assignedState: 1, serviceType: 1, isActive: 1 });

export const ServiceOffering = mongoose.model("ServiceOffering", serviceOfferingSchema);
