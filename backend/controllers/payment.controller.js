import { Order } from "../models/order.model.js";
import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";
import { User } from "../models/user.model.js";
import { PaymentIntent } from "../models/paymentIntent.model.js";
import { buildMonnifyPayload, getPlatformCommission } from "../utils/pricing.js";
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
    if (!["PENDING", "AWAITING_FULFILLMENT_PAYMENT"].includes(order.status)) {
      return res.status(409).json({ success: false, message: `Cannot pay for a ${order.status} order` });
    }
    if (order.reservationExpiresAt && order.reservationExpiresAt <= new Date()) {
      return res.status(409).json({ success: false, message: "This order's stock reservation has expired. Please place a new order." });
    }

    const buyer = await User.findById(req.userId).select("name email");
    const pricing = {
      grossTotalKobo: order.grossTotalKobo,
      grossTotalNaira: order.grossTotalKobo / 100,
      merchantNetKobo: order.merchantNetKobo,
      merchantNetNaira: order.merchantNetKobo / 100,
    };

    let splits;
    if (order.isMultiMerchant) {
      const groups = await FulfillmentGroup.find({ orderId: order._id });
      const merchants = await User.find({ _id: { $in: groups.map((group) => group.merchantId) } }).select("monnifySubAccountCode");
      const subAccountByMerchant = new Map(merchants.map((merchant) => [String(merchant._id), merchant.monnifySubAccountCode]));

      splits = groups.map((group) => {
        const groupGrossKobo = group.items.reduce((sum, item) => sum + item.subtotalKobo, 0);
        const commissionPct = getPlatformCommission(order.assignedState);
        const groupNetKobo = Math.round(groupGrossKobo * (1 - commissionPct / 100));
        return {
          fulfillmentGroupId: group._id,
          merchantId: group.merchantId,
          subAccountCode: subAccountByMerchant.get(String(group.merchantId)),
          splitAmountKobo: groupNetKobo,
          splitAmountNaira: groupNetKobo / 100,
        };
      });
    } else {
      const merchant = await User.findById(order.merchantId).select("monnifySubAccountCode");
      splits = [{
        fulfillmentGroupId: null,
        merchantId: order.merchantId,
        subAccountCode: merchant?.monnifySubAccountCode,
        splitAmountKobo: order.merchantNetKobo,
        splitAmountNaira: order.merchantNetKobo / 100,
      }];
    }

    if (splits.some((split) => !split.subAccountCode)) {
      return res.status(400).json({
        success: false,
        message: "One or more merchants in this order have no Monnify sub-account configured yet.",
      });
    }

    const payload = buildMonnifyPayload(pricing, order.orderRef, splits, buyer.name, buyer.email, req.body.paymentMethod);
    const monnifyResponse = await initiateTransaction(payload);

    const paymentIntent = await PaymentIntent.create({
      orderId: order._id,
      buyerId: req.userId,
      monnifyTransactionReference: monnifyResponse.transactionReference,
      checkoutUrl: monnifyResponse.checkoutUrl,
      amountKobo: order.grossTotalKobo,
      splits,
    });

    res.json({ success: true, checkoutUrl: paymentIntent.checkoutUrl, paymentIntentId: paymentIntent._id });
  } catch (error) {
    console.error("[initiatePayment]", error);
    res.status(500).json({ success: false, message: error.message });
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

    const intent = await PaymentIntent.findOne({ monnifyTransactionReference: transactionReference });
    if (!intent) {
      return res.status(404).json({ success: false, message: "Unknown payment intent" });
    }

    const verified = await verifyTransactionStatus(transactionReference);
    if (verified.paymentStatus === "PAID") {
      intent.status = "PAID";
      intent.paidAt = new Date();
      intent.rawWebhookPayload = event;
      await intent.save();

      let order = await Order.findOneAndUpdate(
        {
          _id: intent.orderId,
          status: { $in: ["PENDING", "AWAITING_FULFILLMENT_PAYMENT"] },
          $or: [
            { reservationExpiresAt: null },
            { reservationExpiresAt: { $gt: new Date() } },
          ],
        },
        { status: "CONFIRMED", monnifyPaymentRef: transactionReference, paidAt: new Date() },
        { new: true }
      );
      const newlyConfirmed = Boolean(order);

      if (!order) {
        order = await Order.findById(intent.orderId);
        if (order?.status === "CANCELLED") {
          console.error(`[handleMonnifyWebhook] REFUND REQUIRED: payment ${transactionReference} arrived for CANCELLED order ${intent.orderId}`);
          return res.status(200).json({ success: true });
        }
        if (order?.reservationExpiresAt && order.reservationExpiresAt <= new Date()) {
          console.error(`[handleMonnifyWebhook] REFUND REQUIRED: payment ${transactionReference} arrived after stock reservation expired for order ${intent.orderId}`);
          return res.status(200).json({ success: true });
        }
        if (order?.status !== "CONFIRMED" || order.monnifyPaymentRef !== transactionReference) {
          return res.status(200).json({ success: true });
        }
      }

      if (order.isMultiMerchant) {
        await FulfillmentGroup.updateMany(
          { orderId: order._id, status: "PENDING" },
          { status: "PAID" }
        );
        if (newlyConfirmed) {
          const groups = await FulfillmentGroup.find({ orderId: order._id }).select("merchantId").lean();
          for (const group of groups) {
            notifyUser(String(group.merchantId), "fulfillment:status_changed", {
              orderRef: order.orderRef,
              newStatus: "PAID",
              message: `Order ${order.orderRef} is paid. Confirm it to release it for pickup.`,
            });
          }
        }
      }

      if (newlyConfirmed) {
        notifyUser(String(order.buyerId), "payment:confirmed", {
          orderRef: order.orderRef,
          message: `Payment confirmed for ${order.orderRef}.`,
        });

        await writeAuditLog({
          action: "PAYMENT_CAPTURED",
          performedBy: order.buyerId,
          targetType: "Order",
          targetId: order._id,
          newValue: { status: "CONFIRMED" },
        });
      }
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
