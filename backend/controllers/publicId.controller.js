import { User } from "../models/user.model.js";
import { writeAuditLog } from "../utils/auditLogger.js";

export const getMyPublicId = async (req, res) => {
  const user = await User.findById(req.user._id).select("publicId kycTier ninVerified bvnVerified");

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  return res.json({ success: true, data: user });
};

export const lookupByPublicId = async (req, res) => {
  const { publicId } = req.params;
  const user = await User.findOne({ publicId }).select("publicId name role kycTier assignedState");

  if (!user) {
    return res.status(404).json({ success: false, message: "No user with this Public ID" });
  }

  return res.json({ success: true, data: user });
};

export const upgradeKycTier = async (req, res) => {
  const { userId } = req.params;
  const { verificationType } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  const oldTier = user.kycTier;

  if (verificationType === "NIN") {
    user.ninVerified = true;
    user.ninVerifiedAt = new Date();
    user.kycTier = Math.max(user.kycTier, 2);
  } else if (verificationType === "BVN") {
    if (!user.ninVerified) {
      return res.status(400).json({
        success: false,
        message: "NIN must be verified before BVN (Tier 2 before Tier 3)",
      });
    }

    user.bvnVerified = true;
    user.bvnVerifiedAt = new Date();
    user.kycTier = 3;
  } else {
    return res.status(400).json({ success: false, message: "verificationType must be NIN or BVN" });
  }

  await user.save();

  await writeAuditLog({
    action: "KYC_TIER_CHANGED",
    performedBy: req.user._id,
    targetType: "User",
    targetId: user._id,
    oldValue: { kycTier: oldTier },
    newValue: { kycTier: user.kycTier },
    req,
  });

  return res.json({ success: true, data: { publicId: user.publicId, kycTier: user.kycTier } });
};
