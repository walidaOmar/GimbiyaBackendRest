import mongoose from "mongoose";

export const INVITE_STATUSES = ["PENDING", "ACCEPTED", "REVOKED"];

const inviteSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true }, // sha256 of the link token; the token itself is never stored
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, default: "", trim: true },
    role: { type: String, required: true },
    assignedState: { type: String, required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    inviterRole: { type: String, required: true },
    // Merchant invites (role business_owner)
    businessType: { type: String, default: null },
    businessName: { type: String, default: "", trim: true },
    attributedAffiliateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // credited for the KPI when the store is brought in
    // Staff invites (role manager / stock_manager)
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", default: null, index: true },
    status: { type: String, enum: INVITE_STATUSES, default: "PENDING", index: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    acceptedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    emailSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

inviteSchema.index({ email: 1, status: 1 });

export const Invite = mongoose.model("Invite", inviteSchema);
