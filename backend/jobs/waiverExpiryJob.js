import { WaiverRequest } from "../models/waiverRequest.model.js";
import { WaiverQuota } from "../models/waiverQuota.model.js";

export const runWaiverExpiryCheck = async () => {
  try {
    const now = new Date();
    const staleRequests = await WaiverRequest.find({
      status: "APPROVED",
      expiresAt: { $lt: now },
    }).lean();

    for (const request of staleRequests) {
      const updatedRequest = await WaiverRequest.findByIdAndUpdate(
        request._id,
        { status: "EXPIRED" },
        { new: true }
      );

      if (!updatedRequest) continue;

      const quota = await WaiverQuota.findOne({
        coordinatorId: request.coordinatorId,
      }).sort({ createdAt: -1 });

      if (quota) {
        const nextUsedSlots = Math.max(0, quota.usedSlots - request.requestedSlots);
        quota.usedSlots = nextUsedSlots;
        quota.isActive = quota.usedSlots < quota.totalSlots;
        await quota.save();
      }
    }

    if (staleRequests.length > 0) {
      console.log(`[waiverExpiryJob] Expired ${staleRequests.length} stale waiver approval(s)`);
    }
  } catch (error) {
    console.error("[waiverExpiryJob]", error);
  }
};
