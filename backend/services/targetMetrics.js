import { PerformanceTarget } from "../models/performanceTarget.model.js";

const startOfMonth = (date = new Date()) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

export const incrementTargetMetrics = async (orderAmountKobo, affiliateId, coordinatorId, state, session) => {
  if (!Number.isInteger(orderAmountKobo) || orderAmountKobo < 0) throw new Error("orderAmountKobo must be a non-negative integer");
  const startDate = startOfMonth();
  const period = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const users = [affiliateId, coordinatorId].filter(Boolean);
  await Promise.all(users.map((userId) => PerformanceTarget.updateOne(
    { userId, period, startDate },
    {
      $setOnInsert: { assignedState: state, targetKobo: userId === coordinatorId ? 500_000_000 : 10_000_000, achievedKobo: 0, referralCount: 0, salesKobo: 0, retentionPercent: 0, status: "BEHIND" },
      $inc: { achievedKobo: orderAmountKobo, salesKobo: orderAmountKobo, referralCount: userId === affiliateId ? 1 : 0 },
    },
    { upsert: true, session },
  )));
};
