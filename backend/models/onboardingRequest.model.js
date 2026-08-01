import mongoose from "mongoose";

export const ONBOARDING_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

const onboardingRequestSchema = new mongoose.Schema(
  {
    prospectEmail: { type: String, required: true, lowercase: true, trim: true },
    prospectName: { type: String, required: true, trim: true },
    prospectPhone: { type: String, default: "" },
    proposedRole: { type: String, required: true },
    proposedState: { type: String, required: true },
    proposedSegment: { type: String, default: "general" },
    govIdType: { type: String, default: "" },
    govIdNumber: { type: String, default: "" },
    idDocumentUrl: { type: String, default: null },
    authorizationLetterUrl: { type: String, default: null },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    submitterRole: { type: String, default: null },
    referralCodeUsed: { type: String, default: null },
    affiliateId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ONBOARDING_REQUEST_STATUSES, default: "PENDING", index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewNote: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

onboardingRequestSchema.index({ prospectEmail: 1, status: 1 });
onboardingRequestSchema.index({ submittedBy: 1, createdAt: -1 });

export const OnboardingRequest = mongoose.model("OnboardingRequest", onboardingRequestSchema);
