import mongoose from "mongoose";

export const PROPERTY_TYPES = ["residential", "commercial", "land", "industrial"];
export const LISTING_TYPES = ["sale", "rent", "lease"];
export const PROPERTY_STATUSES = ["draft", "active", "under_offer", "sold", "withdrawn"];
export const VERIFICATION_STATUSES = ["pending", "verified", "rejected"];

const propertyListingSchema = new mongoose.Schema(
  {
    portfolioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    propertyAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    assignedDealInitiatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    propertyType: {
      type: String,
      enum: PROPERTY_TYPES,
      required: true,
    },
    listingType: {
      type: String,
      enum: LISTING_TYPES,
      required: true,
    },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    priceKobo: { type: Number, required: true, min: 0 },
    priceNegotiable: { type: Boolean, default: false },
    imageUrls: { type: [String], default: [] },
    documentUrls: { type: [String], default: [] },
    bedrooms: { type: Number, default: null },
    bathrooms: { type: Number, default: null },
    squareMeters: { type: Number, default: null },
    parkingSpaces: { type: Number, default: null },
    amenities: { type: [String], default: [] },
    status: {
      type: String,
      enum: PROPERTY_STATUSES,
      default: "draft",
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: "pending",
      index: true,
    },
    verificationNote: { type: String, default: "" },
    viewCount: { type: Number, default: 0 },
    inquiryCount: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

propertyListingSchema.index({ status: 1, verificationStatus: 1, propertyType: 1 });
propertyListingSchema.index({ status: 1, state: 1, city: 1 });
propertyListingSchema.index({ priceKobo: 1 });
propertyListingSchema.index({ propertyAdminId: 1, status: 1 });
propertyListingSchema.index({ assignedDealInitiatorId: 1, status: 1 });

export const PropertyListing = mongoose.model("PropertyListing", propertyListingSchema);
