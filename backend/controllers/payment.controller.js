import { Order } from "../models/order.model.js";
import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";
import { User } from "../models/user.model.js";
import { PaymentIntent } from "../models/paymentIntent.model.js";
import { buildMonnifyPayload } from "../utils/pricing.js";
import { SubscriptionPayment } from "../models/subscriptionPayment.model.js";
import { Store } from "../models/store.model.js";
import { initiateTransaction, verifyTransactionStatus, verifyWebhookSignature } from "../services/monnifyService.js";
import { writeAuditLog } from "../utils/auditLogger.js";
import { notifyUser } from "../utils/sseService.js";

export const initiatePayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId is required" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    if (String(order.buyerId) !== String(req.userId)) {
      return res.status(403).json({ success: false, message: "Not your order" });
    }
    if (!["PENDING", "AWAITING_FULFILLMENT_PAYMENT"].includes(order.status) || order.paidAt) {
      return res.status(409).json({ success: false, message: "This order cannot be paid any more." });
    }
    if (order.reservationExpiresAt && order.reservationExpiresAt < new Date()) {
      return res.status(409).json({ success: false, message: "Your hold on these items expired. Please check out again." });
    }

    const buyer = await User.findById(req.userId).select("name email");
    const pricing = {
      grossTotalKobo: order.grossTotalKobo,
      grossTotalNaira: order.grossTotalKobo / 100,
      merchantNetKobo: order.merchantNetKobo,
      merchantNetNaira: order.merchantNetKobo / 100,
    };

    // Collect-all: the customer pays the full amount into Gimbiya's Monnify wallet. Each party's share
    // is credited to the internal wallet ledger when the delivery/service OTP is accepted (escrow).
    const payload = buildMonnifyPayload(pricing, order.orderRef, [], buyer.name, buyer.email, req.body.paymentMethod);
    const monnifyResponse = await initiateTransaction(payload);

    const paymentIntent = await PaymentIntent.create({
      orderId: order._id,
      buyerId: req.userId,
      monnifyTransactionReference: monnifyResponse.transactionReference,
      checkoutUrl: monnifyResponse.checkoutUrl,
      amountKobo: order.grossTotalKobo,
      splits: [],
    });

    res.json({ success: true, checkoutUrl: paymentIntent.checkoutUrl, paymentIntentId: paymentIntent._id });
  } catch (error) {
    console.error("[initiatePayment]", error?.response?.data || error.message);
    res.status(500).json({ success: false, message: "Could not start the payment. Please try again." });
  }
};

export const handleMonnifyWebhook = async (req, res) => {
  try {
    const signature = req.headers["monnify-signature"];
    const rawBody = req.rawBody || JSON.stringify(req.body || {});

    if (!verifyWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ success: false, message: "Invalid webhook signature" });
    }

    const event = req.body;
    const transactionReference = event?.eventData?.transactionReference;
    if (!transactionReference) {
      return res.status(400).json({ success: false, message: "Missing transaction reference" });
    }

    const subscription = await SubscriptionPayment.findOne({ monnifyTransactionReference: transactionReference });
    if (subscription) {
      await settleSubscriptionPayment(subscription, transactionReference);
      return res.status(200).json({ success: true });
    }

    const intent = await PaymentIntent.findOne({ monnifyTransactionReference: transactionReference });
    if (!intent) {
      return res.status(404).json({ success: false, message: "Unknown payment intent" });
    }

    const verified = await verifyTransactionStatus(transactionReference);
    if (verified.paymentStatus === "PAID") {
      // Never trust the webhook body: check what Monnify itself says was paid.
      const paidKobo = Math.round(Number(verified.amountPaid ?? verified.amount) * 100);
      if (!Number.isFinite(paidKobo) || paidKobo < intent.amountKobo) {
        console.error(`[webhook] AMOUNT MISMATCH ref=${transactionReference} paidKobo=${paidKobo} expectedKobo=${intent.amountKobo}`);
        return res.status(200).json({ success: true });
      }
      const expectedRef = (await Order.findById(intent.orderId).select("orderRef").lean())?.orderRef;
      if (verified.paymentReference && expectedRef && verified.paymentReference !== expectedRef) {
        console.error(`[webhook] REFERENCE MISMATCH ref=${transactionReference} got=${verified.paymentReference} expected=${expectedRef}`);
        return res.status(200).json({ success: true });
      }

      intent.status = "PAID";
      intent.paidAt = new Date();
      intent.rawWebhookPayload = event;
      await intent.save();

      // Only an order that is still awaiting payment can be marked paid. This makes webhook retries
      // harmless and stops a late payment from reviving an order whose stock was already released.
      const order = await Order.findOneAndUpdate(
        { _id: intent.orderId, status: { $in: ["PENDING", "AWAITING_FULFILLMENT_PAYMENT"] } },
        { status: "CONFIRMED", monnifyPaymentRef: transactionReference, paidAt: new Date() },
        { new: true }
      );

      if (!order) {
        const current = await Order.findById(intent.orderId).select("status");
        if (current?.status === "CANCELLED") {
          console.error(`[webhook] REFUND REQUIRED: payment ${transactionReference} arrived for CANCELLED order ${intent.orderId}`);
        }
        return res.status(200).json({ success: true });
      }

      if (order.isMultiMerchant) {
        // B3: payment moves each group to PAID. Merchants must still confirm before riders can see the job.
        await FulfillmentGroup.updateMany({ orderId: order._id, status: "PENDING" }, { status: "PAID" });
        const groups = await FulfillmentGroup.find({ orderId: order._id }).select("merchantId").lean();
        for (const g of groups) {
          notifyUser(String(g.merchantId), "fulfillment:status_changed", {
            orderRef: order.orderRef,
            newStatus: "PAID",
            message: `Order ${order.orderRef} is paid. Confirm it to release it for pickup.`,
          });
        }
      }
      notifyUser(String(order.buyerId), "payment:confirmed", { orderRef: order.orderRef, message: `Payment confirmed for ${order.orderRef}.` });

      await writeAuditLog({
        action: "PAYMENT_CAPTURED",
        performedBy: order.buyerId,
        targetType: "Order",
        targetId: order._id,
        newValue: { status: "CONFIRMED" },
      });
    } else if (verified.paymentStatus === "FAILED") {
      intent.status = "FAILED";
      await intent.save();
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("[handleMonnifyWebhook]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const YEAR_MS = 365 * 24 * 3600 * 1000;

// A paid subscription activates (or extends) the store's tier for a year. Idempotent: only an INITIATED payment can settle.
async function settleSubscriptionPayment(payment, transactionReference) {
  const verified = await verifyTransactionStatus(transactionReference);
  if (verified.paymentStatus !== "PAID") {
    if (verified.paymentStatus === "FAILED") { payment.status = "FAILED"; await payment.save(); }
    return;
  }
  const paidKobo = Math.round(Number(verified.amountPaid ?? verified.amount) * 100);
  if (!Number.isFinite(paidKobo) || paidKobo < payment.amountKobo || (verified.paymentReference && verified.paymentReference !== payment.reference)) {
    console.error(`[webhook] SUBSCRIPTION MISMATCH ref=${transactionReference} paidKobo=${paidKobo} expected=${payment.amountKobo}`);
    return;
  }
  const claimed = await SubscriptionPayment.findOneAndUpdate(
    { _id: payment._id, status: "INITIATED" },
    { $set: { status: "PAID", paidAt: new Date() } },
    { new: true }
  );
  if (!claimed) return;

  const store = await Store.findById(claimed.storeId);
  if (!store) return;
  const base = store.subscriptionTier === claimed.tier && store.subscriptionExpiresAt && store.subscriptionExpiresAt > new Date()
    ? store.subscriptionExpiresAt.getTime() : Date.now();
  store.subscriptionTier = claimed.tier;
  store.subscriptionExpiresAt = new Date(base + YEAR_MS);
  await store.save();
  notifyUser(String(claimed.userId), "subscription:active", { tier: claimed.tier, message: `Your ${claimed.tier} plan is active.` });
}
