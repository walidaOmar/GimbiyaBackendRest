import { User } from "../models/user.model.js";
import { OnboardingRequest } from "../models/onboardingRequest.model.js";

const CAN_ONBOARD = {
  super_admin: ["business_owner", "manager", "stock_manager", "delivery", "affiliate", "buyer", "auditor", "support", "developer_coordinator"],
  developer_coordinator: ["business_owner", "manager", "stock_manager", "delivery", "affiliate", "buyer"],
  business_owner: ["manager", "stock_manager", "delivery"],
  manager: ["stock_manager", "delivery"],
  affiliate: ["buyer", "business_owner"],
};

const canOnboard = (actorRole, targetRole) => Boolean(CAN_ONBOARD[actorRole]?.includes(targetRole));

export const submitRequest = async (req, res) => {
  try {
    const {
      prospectEmail,
      prospectName,
      prospectPhone,
      proposedRole,
      proposedState,
      proposedSegment,
      govIdType,
      govIdNumber,
      idDocumentUrl,
      authorizationLetterUrl,
    } = req.body;

    const submitter = req.user;

    if (!canOnboard(submitter.role, proposedRole)) {
      return res.status(403).json({
        success: false,
        message: `As a ${submitter.role}, you cannot onboard a ${proposedRole}`,
      });
    }

    if (submitter.role === "developer_coordinator" && proposedState !== submitter.assignedState) {
      return res.status(403).json({
        success: false,
        message: `You can only onboard users in your assigned state: ${submitter.assignedState}`,
      });
    }

    if (submitter.role === "affiliate" && proposedState !== submitter.assignedState) {
      return res.status(403).json({
        success: false,
        message: `You can only onboard users in your assigned state: ${submitter.assignedState}`,
      });
    }

    const existing = await User.findOne({ email: prospectEmail.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: "A user with this email already exists" });
    }

    const duplicate = await OnboardingRequest.findOne({
      prospectEmail: prospectEmail.toLowerCase(),
      status: "PENDING",
    });
    if (duplicate) {
      return res.status(400).json({ success: false, message: "A pending onboarding request already exists for this email" });
    }

    const request = await OnboardingRequest.create({
      prospectEmail,
      prospectName,
      prospectPhone: prospectPhone || "",
      proposedRole,
      proposedState,
      proposedSegment: proposedSegment || "general",
      govIdType,
      govIdNumber,
      idDocumentUrl: idDocumentUrl || null,
      authorizationLetterUrl: authorizationLetterUrl || null,
      submittedBy: submitter._id,
      submitterRole: submitter.role,
      referralCodeUsed: submitter.referralCode || null,
    });

    res.status(201).json({
      success: true,
      message: "Onboarding request submitted for verification",
      requestId: request._id,
    });
  } catch (error) {
    console.error("[submitRequest]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export { CAN_ONBOARD };
