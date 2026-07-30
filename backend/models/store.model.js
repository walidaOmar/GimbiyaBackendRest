import mongoose from "mongoose";

export const STORE_STATUSES = ["PENDING", "VERIFIED", "SUSPENDED"];

const accountDetailsSchema = new mongoose.Schema(
  {
    bankName:      { type: String, default: "" },
    accountNumber: { type: String, default: "" },
    accountName:   { type: String, default: "" },
  },
  { _id: false }
);

const storeSchema = new mongoose.Schema(
  {
    businessName:     { type: String, required: true, trim: true },
    businessEmail:    { type: String, required: true, lowercase: true, trim: true },
    businessPhone:    { type: String, default: "" },

    nin:              { type: String, required: true },
    cacNumber:        { type: String, required: true },
    tinNumber:        { type: String, required: true },
    businessAddress:  { type: String, required: true },
    homeAddress:      { type: String, required: true },
    accountDetails:   { type: accountDetailsSchema, default: () => ({}) },

    businessOwnerId:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    onboardedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    verificationStatus: {
      type: String,
      enum: STORE_STATUSES,
      default: "PENDING",
      index: true,
    },
    verificationNote: { type: String, default: "" },

    primaryState:     { type: String, enum: ["Abuja", "Kano", "Kaduna"], required: true },
  },
  { timestamps: true }
);

storeSchema.index({ verificationStatus: 1, primaryState: 1 });
storeSchema.index({ businessOwnerId: 1 });
storeSchema.index({ onboardedBy: 1 });

export const Store = mongoose.model("Store", storeSchema);
