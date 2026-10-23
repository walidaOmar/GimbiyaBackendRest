import mongoose from "mongoose";
import { Order } from "../models/order.model.js";
import { Product } from "../models/product.model.js";
import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";

/** Cancels one unpaid order and puts its stock back. The status claim makes it safe to run twice. */
export async function cancelUnpaidOrder(filter, note) {
  const session = await mongoose.startSession();
  let cancelled = null;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOneAndUpdate(
        { ...filter, status: "PENDING", paidAt: null },
        { $set: { status: "CANCELLED", escrowStatus: "REFUNDED" }, $push: { timeline: { status: "CANCELLED", timestamp: new Date(), note } } },
        { new: true, session }
      );
      if (!order) return;

      for (const item of order.items) {
        const result = await Product.updateOne(
          { _id: item.productId },
          { $inc: { stock: item.quantity, soldCount: -item.quantity } },
          { session }
        );
        if (result.matchedCount !== 1) {
          throw new Error(`Product ${item.productId} for order ${order.orderRef} no longer exists`);
        }
      }
      await FulfillmentGroup.updateMany(
        { orderId: order._id },
        { status: "CANCELLED", escrowStatus: "REFUNDED" },
        { session }
      );
      cancelled = order;
    });
    return cancelled;
  } finally {
    await session.endSession();
  }
}

/** Releases stock held by Cart V2 orders that were never paid. */
export async function runUnpaidRelease() {
  const expired = await Order.find({ status: "PENDING", paidAt: null, reservationExpiresAt: { $lt: new Date() } }).select("_id").lean();
  let released = 0;
  for (const { _id } of expired) {
    const order = await cancelUnpaidOrder({ _id }, "Auto-cancelled: unpaid, stock released.");
    if (order) { released += 1; console.log("released:", order.orderRef); }
  }
  return released;
}
