import mongoose from "mongoose";

const affiliateClickSchema = new mongoose.Schema(
  {
    affiliateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    referralCode: { type: String, required: true, index: true },

    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    productName: { type: String, default: "" },

    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },

    converted: { type: Boolean, default: false },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    convertedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

affiliateClickSchema.index({ affiliateId: 1, createdAt: -1 });
affiliateClickSchema.index({ affiliateId: 1, converted: 1 });

export const AffiliateClick = mongoose.model("AffiliateClick", affiliateClickSchema);
