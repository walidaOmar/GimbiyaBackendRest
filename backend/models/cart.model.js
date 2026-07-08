import mongoose from "mongoose";

// ─── CART ITEM ────────────────────────────────────────────────────────────────
const cartItemSchema = new mongoose.Schema(
  {
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity:  { type: Number, required: true, min: 1 },
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
