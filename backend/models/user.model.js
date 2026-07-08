import mongoose from "mongoose";

// All 7 platform roles
export const USER_ROLES = [
  "super_admin",          // Global CEO
  "developer_coordinator",// State Coordinator
  "business_owner",       // Merchant Tenant
  "manager",              // Branch Manager
  "stock_manager",        // Warehouse Stock Manager
  "delivery",             // Logistics Rider
  "buyer",                // End Consumer
  "affiliate",            // Growth / Affiliate Partner
  "auditor",              // Read-only financial auditor
  "support",              // Customer support
];

export const NIGERIAN_STATES = ["Abuja", "Kano", "Kaduna", "Global"];
export const KYC_STATUSES    = ["PENDING", "APPROVED", "REJECTED"];

const userSchema = new mongoose.Schema(
  {
    // ── FROM MERN STARTER (kept exactly) ────────────────────────────────────
    email: {
      type: String, required: true, unique: true, lowercase: true, trim: true,
    },
    password: {
      type: String, required: true,
    },
    name: {
      type: String, required: true, trim: true,
    },
    lastLogin: {
      type: Date, default: Date.now,
    },
    isVerified: {
      type: Boolean, default: false,
    },
    resetPasswordToken:      String,
    resetPasswordExpiresAt:  Date,
    verificationToken:       String,
    verificationTokenExpiresAt: Date,

    // ── GIMBIYA MALL EXTENSIONS ──────────────────────────────────────────────
    role: {
      type: String, enum: USER_ROLES, default: "buyer", index: true,
    },
    assignedState: {
      type: String, enum: NIGERIAN_STATES, default: "Abuja", index: true,
    },
    phone: {
      type: String, default: "",
    },
    permissions: {
      type: [String], default: [],
    },
    isActive: {
      type: Boolean, default: true, index: true,
    },
    kycStatus: {
      type: String, enum: KYC_STATUSES, default: "PENDING",
    },
    kycDocumentUrls: {
      type: [String], default: [],
    },
    onboardedBy: {
      type: mongoose.Schema.Types.ObjectId, ref: "User", default: null,
    },
    monnifySubAccountCode: {
      type: String, default: null,
    },
  },
  { timestamps: true }
);

// Compound indexes for common query patterns
userSchema.index({ role: 1, assignedState: 1 });
userSchema.index({ kycStatus: 1, role: 1 });

export const User = mongoose.model("User", userSchema);
