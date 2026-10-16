import mongoose from "mongoose";
import dotenv from "dotenv";
import { Order } from "../models/order.model.js";
import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";

dotenv.config();

// Run once after confirming the database contains real V2 orders that need backfilling.
const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const orderIds = await FulfillmentGroup.distinct("orderId");
  const orders = await Order.updateMany(
    { _id: { $in: orderIds }, isMultiMerchant: { $ne: true } },
    { isMultiMerchant: true }
  );
  console.log("orders flagged isMultiMerchant:", orders.modifiedCount);

  const paidOrders = await Order.find({
    _id: { $in: orderIds },
    paidAt: { $ne: null },
    status: { $in: ["CONFIRMED", "PAID"] },
  }).select("_id").lean();
  const groups = await FulfillmentGroup.updateMany(
    { orderId: { $in: paidOrders.map((order) => order._id) }, status: "PENDING" },
    { status: "PAID" }
  );
  console.log("paid groups moved PENDING → PAID:", groups.modifiedCount);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("[backfillV2Orders]", error);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exitCode = 1;
});
