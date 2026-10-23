import { WalletEntry } from "../models/walletEntry.model.js";

export async function balanceKobo(userId, session = null) {
  const q = WalletEntry.aggregate([{ $match: { userId } }, { $group: { _id: null, total: { $sum: "$amountKobo" } } }]);
  if (session) q.session(session);
  const rows = await q;
  return rows[0]?.total || 0;
}

/** Writes the entitlement rows for a released group. The unique index makes a second release fail instead of paying twice. */
export async function creditEntitlements(rows, { orderId, fulfillmentGroupId }, session) {
  if (!rows.length) return;
  const docs = rows.map((r) => ({
    userId: r.account === "PLATFORM" ? null : r.userId,
    kind: r.kind,
    amountKobo: r.amountKobo,
    orderId,
    fulfillmentGroupId,
    note: `Release of group ${fulfillmentGroupId}`,
  }));
  // A duplicate here means this group was already released (e.g. two simultaneous submissions).
  // The error is deliberately NOT swallowed: it aborts the second transaction so nobody is paid twice.
  await WalletEntry.insertMany(docs, { session, ordered: true });
}
