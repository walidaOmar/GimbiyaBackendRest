import { EscrowLedger } from "../models/ledger.model.js";
import { Order } from "../models/order.model.js";
import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";
import { entitlementsForGroup } from "../policy/pricing.v1.js";
import { creditEntitlements } from "./walletService.js";

/**
 * Releases escrow for one group after its OTP was accepted: marks it delivered, appends the
 * ledger row, credits everyone's wallet from the checkout snapshot, and closes the order when
 * every group is done. Call inside a transaction.
 */
export async function releaseGroup(group, { session, actorId }) {
  const s = group.settlement || {};
  const order = await Order.findById(group.orderId).session(session).select("affiliateId");

  group.status = "DELIVERED";
  group.escrowStatus = "RELEASED";
  group.settledAt = new Date();
  await group.save({ session });

  const rows = entitlementsForGroup(
    {
      type: group.groupType,
      merchantId: group.merchantId,
      merchantKobo: s.merchantKobo || 0,
      riderKobo: s.riderKobo || 0,
      affiliateKobo: s.affiliateKobo || 0,
      platformKobo: s.platformKobo || 0,
    },
    { affiliateId: order?.affiliateId || null, riderId: group.riderId || null }
  );
  await creditEntitlements(rows, { orderId: group.orderId, fulfillmentGroupId: group._id }, session);

  await EscrowLedger.create([{
    orderId: group.orderId,
    fulfillmentGroupId: group._id,
    entryType: "RELEASE",
    grossTotalKobo: s.customerKobo || 0,
    platformFeeKobo: s.platformKobo || 0,
    merchantNetKobo: s.merchantKobo || 0,
    escrowStatus: "RELEASED",
    actorId,
    noteText: `Escrow released for fulfillment group ${group._id}`,
  }], { session });

  const siblings = await FulfillmentGroup.find({ orderId: group.orderId }).session(session).select("status").lean();
  if (siblings.every((g) => g.status === "DELIVERED")) {
    await Order.findByIdAndUpdate(group.orderId, { status: "DELIVERED", escrowStatus: "RELEASED" }, { session });
  }
  return rows;
}
