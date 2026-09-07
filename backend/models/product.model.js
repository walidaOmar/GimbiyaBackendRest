import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name:            { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    descriptionText: { type: String, default: "", maxlength: 2000 },

    // MANDATE: Price stored as integer Kobo — NEVER Naira floats
    priceKobo: {
      type: Number, required: true, min: 1,
      validate: { validator: Number.isInteger, message: "priceKobo must be an integer" },
    },

    // MANDATE: stock modified ONLY via $inc — never direct overwrite
    stock: {
      type: Number, required: true, min: 0,
      validate: { validator: Number.isInteger, message: "stock must be a whole number" },
    },

    categorySlug:  { type: String, required: true, index: true },
    category:      { type: String, default: null, trim: true },
    merchantId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    merchant:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    store:         { type: mongoose.Schema.Types.ObjectId, ref: "Store", default: null },
    assignedState: { type: String, enum: ["Ado bayero mall", "Tafawa balewa refinery", "Sardauna market"], required: true, index: true },
    buildingFloor: { type: String, enum: ["LEVEL_1", "LEVEL_2"], required: true },
    imageUrls:     { type: [String], default: [] },
    isActive:      { type: Boolean, default: true, index: true },
    soldCount:     { type: Number, default: 0, min: 0 },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount:   { type: Number, default: 0, min: 0 },
    marketTier: {
      type: String,
      enum: ["consumer", "wholesale", "manufacturing"],
      default: "consumer",
      index: true,
    },
    minimumOrderQuantity: { type: Number, default: 1, min: 1 },
    bulkPricingTiers: [{
      minQty: { type: Number, required: true, min: 1 },
      priceKobo: { type: Number, required: true, min: 0 },
    }],
  },
  { timestamps: true }
);

// Catalog query index
productSchema.index({ assignedState: 1, buildingFloor: 1, isActive: 1 });
productSchema.index({ assignedState: 1, marketTier: 1, isActive: 1, categorySlug: 1 });
// Text search
productSchema.index({ name: "text", descriptionText: "text" });

export const Product = mongoose.model("Product", productSchema);
