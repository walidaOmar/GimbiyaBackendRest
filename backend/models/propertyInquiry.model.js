import mongoose from "mongoose";

export const INQUIRY_STATUSES = [
  "new", "contacted", "viewing_scheduled", "negotiating", "offer_made", "closed", "lost",
];

const timelineEntrySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    note: { type: String, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const propertyInquirySchema = new mongoose.Schema(
  {
    propertyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PropertyListing",
      required: true,
      index: true,
    },
    portfolioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    propertyAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    dealInitiatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    buyerName: { type: String, required: true },
    buyerEmail: { type: String, required: true },
    buyerPhone: { type: String, default: "" },
    buyerBudgetKobo: { type: Number, default: null },
    buyerMessage: { type: String, default: "" },
    status: {
      type: String,
      enum: INQUIRY_STATUSES,
      default: "new",
      index: true,
    },
    timeline: { type: [timelineEntrySchema], default: [] },
    agreedPriceKobo: { type: Number, default: null },
    commissionKobo: { type: Number, default: null },
    platformFeeKobo: { type: Number, default: null },
    viewingDate: { type: Date, default: null },
    viewingNotes: { type: String, default: "" },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

propertyInquirySchema.index({ propertyAdminId: 1, status: 1 });
propertyInquirySchema.index({ dealInitiatorId: 1, status: 1 });
propertyInquirySchema.index({ buyerId: 1, createdAt: -1 });

export const PropertyInquiry = mongoose.model("PropertyInquiry", propertyInquirySchema);
