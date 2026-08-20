import mongoose from "mongoose";

export const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

const staffSlotSchema = new mongoose.Schema({
  role: { type: String, enum: ["manager", "stock_manager", "delivery", "deal_initiator"], required: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  phone: { type: String, default: "" },
  assignedState: { type: String, enum: ["Ado bayero mall", "Tafawa balewa refinery", "Sardauna market"], required: true },
  buildingFloor: { type: String, enum: ["LEVEL_1", "LEVEL_2"], required: true },
}, { _id: true });

const storeOnboardingRequestSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true, trim: true },
    businessEmail: { type: String, required: true, lowercase: true, trim: true },
    businessPhone: { type: String, default: "" },
    commerceSegment: { type: String, enum: ["manufacturer", "wholesaler", "retailer", "service_provider", "logistics"], required: true },
    serviceCategory: { type: String, default: null },
    primaryState: { type: String, enum: ["Ado bayero mall", "Tafawa balewa refinery", "Sardauna market"], required: true },

    nin: { type: String, required: true },
    cacNumber: { type: String, required: true },
    tinNumber: { type: String, required: true },
    businessAddress: { type: String, required: true },
    homeAddress: { type: String, required: true },
    accountDetails: {
      bankName: { type: String, default: "" },
      accountNumber: { type: String, default: "" },
      accountName: { type: String, default: "" },
    },

    staffSlots: [staffSlotSchema],

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    coordinatorState: { type: String, enum: ["Ado bayero mall", "Tafawa balewa refinery", "Sardauna market"], required: true },

    status: { type: String, enum: REQUEST_STATUSES, default: "PENDING", index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewNote: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },

    createdStoreId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", default: null },
  },
  { timestamps: true }
);

storeOnboardingRequestSchema.index({ status: 1, coordinatorState: 1 });
storeOnboardingRequestSchema.index({ submittedBy: 1, createdAt: -1 });

export const StoreOnboardingRequest = mongoose.model("StoreOnboardingRequest", storeOnboardingRequestSchema);
