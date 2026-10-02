import mongoose from "mongoose";

export const CART_STATUSES = ["ACTIVE", "CHECKED_OUT", "ABANDONED"];

const cartSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    status: { type: String, enum: CART_STATUSES, default: "ACTIVE", index: true },
  },
  { timestamps: true }
);

export const Cart = mongoose.model("Cart", cartSchema);

// ─── CART ITEM ────────────────────────────────────────────────────────────────
const cartItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    cartId: { type: mongoose.Schema.Types.ObjectId, ref: "Cart", default: null, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    priceSnapshot: { type: Number, default: null },
    serviceItems: [{
      offeringId: { type: mongoose.Schema.Types.ObjectId, ref: "ServiceOffering", default: null },
      serviceProviderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      serviceType: { type: String, required: true },
      priceSnapshot: { type: Number, required: true },
      status: { type: String, enum: ["PENDING", "CONFIRMED", "DECLINED", "COMPLETED"], default: "PENDING" },
      addedAt: { type: Date, default: Date.now },
    }],
    paymentSource: { type: String, enum: ["CONSUMER", "AFFILIATE_WAIVER"], default: "CONSUMER" },
    waiverAllocationId: { type: mongoose.Schema.Types.ObjectId, ref: "WaiverAllocation", default: null },
    fulfillmentCouponCode: { type: String, default: null },
    fulfillmentGroupId: { type: mongoose.Schema.Types.ObjectId, ref: "FulfillmentGroup", default: null },
  },
  { timestamps: true }
);

// Composite unique — one entry per user per product
cartItemSchema.index({ userId: 1, productId: 1 }, { unique: true });

export const CartItem = mongoose.model("CartItem", cartItemSchema);


// ─── CATEGORY ─────────────────────────────────────────────────────────────────
const categorySchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    slug:        { type: String, required: true, unique: true, lowercase: true, index: true },
    description: { type: String, default: "" },
    imageUrl:    { type: String, default: "" },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Category = mongoose.model("Category", categorySchema);


// ─── AFFILIATE LINK ───────────────────────────────────────────────────────────
const affiliateLinkSchema = new mongoose.Schema(
  {
    partnerId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    campaignName:{ type: String, required: true },
    code:        { type: String, required: true, unique: true },  // unique referral code
    clicks:      { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    commissionKobo: { type: Number, default: 0 },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const AffiliateLink = mongoose.model("AffiliateLink", affiliateLinkSchema);
