import mongoose from "mongoose";

const businessSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  assignedState: { type: String, required: true, index: true },
  segment: { type: String, default: "retailer" },
  isApproved: { type: Boolean, default: false, index: true },
}, { timestamps: true });

businessSchema.index({ email: 1 }, { unique: true });
export const Business = mongoose.model("Business", businessSchema);
