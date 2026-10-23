import mongoose from "mongoose";

// All 7 platform roles
export const USER_ROLES = [
  "super_admin",          // Global CEO
  "ceo",
  "developer_coordinator",// State Coordinator
  "business_owner",       // Merchant Tenant
  "property_admin",       // Property portfolio admin
  "deal_initiator",       // Property buyer engagement agent
  "manager",              // Branch Manager
  "stock_manager",        // Warehouse Stock Manager
  "delivery",             // Logistics Rider
  "buyer",                // End Consumer
  "affiliate",            // Growth / Affiliate Partner
  "auditor",              // Read-only financial auditor
  "support",              // Customer support
];

export const NIGERIAN_STATES = ["Ado bayero mall", "Tafawa balewa refinery", "Sardauna market", "Global"];
export const KYC_STATUSES    = ["PENDING", "APPROVED", "REJECTED"];
export const KYC_TIERS = [1, 2, 3]; // 1=Basic, 2=Identity Verified (NIN), 3=Financially Verified (BVN)

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
      type: String, enum: NIGERIAN_STATES, default: "Ado bayero mall", index: true,
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
    publicId: {
      type: String, unique: true, sparse: true, index: true,
    },
    kycTier: {
      type: Number, enum: KYC_TIERS, default: 1,
    },
    ninVerified: {
      type: Boolean, default: false,
    },
    ninVerifiedAt: {
      type: Date, default: null,
    },
    bvnVerified: {
      type: Boolean, default: false,
    },
    bvnVerifiedAt: {
      type: Date, default: null,
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
    onboardingDate: {
      type: Date, default: null,
    },
    onboardingSource: {
      type: String, default: null,
    },
    staffNotes: {
      type: String, default: "",
    },
    monnifySubAccountCode: {
      type: String, default: null,
    },
    walletLock: { type: Number, default: 0 }, // bumped inside withdrawal transactions so two requests cannot both spend the same balance
    residentState: {
      type: String, default: null, // state the person says they live in (coordinators: must match their node)
    },
  },
  { timestamps: true }
);

// Compound indexes for common query patterns
userSchema.index({ role: 1, assignedState: 1 });
userSchema.index({ kycStatus: 1, role: 1 });

userSchema.pre("save", async function (next) {
  if (this.isNew && !this.publicId) {
    const { generatePublicId } = await import("../utils/generatePublicId.js");
    this.publicId = await generatePublicId();
  }
  next();
});

export const User = mongoose.model("User", userSchema);
