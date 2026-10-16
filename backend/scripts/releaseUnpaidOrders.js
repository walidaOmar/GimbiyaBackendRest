import mongoose from "mongoose";
import dotenv from "dotenv";
import { Order } from "../models/order.model.js";
import { Product } from "../models/product.model.js";
import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";

dotenv.config();

// Run every 15 minutes; only Cart V2 orders have a reservationExpiresAt value.
const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const expiredOrders = await Order.find({
    status: "PENDING",
    paidAt: null,
    reservationExpiresAt: { $lte: new Date() },
  }).select("_id orderRef").lean();

  let released = 0;
  let failed = 0;

  for (const { _id, orderRef } of expiredOrders) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const order = await Order.findOneAndUpdate(
        {
          _id,
          status: "PENDING",
          paidAt: null,
          reservationExpiresAt: { $lte: new Date() },
        },
        {
          $set: { status: "CANCELLED", escrowStatus: "REFUNDED" },
          $push: {
            timeline: {
              status: "CANCELLED",
              timestamp: new Date(),
              note: "Auto-cancelled: unpaid, stock released.",
            },
          },
        },
        { new: true, session }
      );

      if (!order) {
        await session.abortTransaction();
        continue;
      }

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
      await session.commitTransaction();
      released += 1;
      console.log("released:", order.orderRef);
    } catch (error) {
      if (session.inTransaction()) {
        try {
          await session.abortTransaction();
        } catch (abortError) {
          console.error(`[releaseUnpaidOrders] rollback failed for ${orderRef}`, abortError);
        }
      }
      failed += 1;
      console.error(`[releaseUnpaidOrders] failed for ${orderRef}`, error);
    } finally {
      await session.endSession();
    }
  }

  console.log(`done — ${released} order(s) released, ${failed} failed`);
  await mongoose.disconnect();
  if (failed) process.exitCode = 1;
};

run().catch(async (error) => {
  console.error("[releaseUnpaidOrders]", error);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exitCode = 1;
});
