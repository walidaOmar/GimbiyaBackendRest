import mongoose from "mongoose";
import { Product }        from "../models/product.model.js";
import { Order }          from "../models/order.model.js";
import { CartItem }       from "../models/cart.model.js";
import { EscrowLedger, InventoryAudit } from "../models/ledger.model.js";
import { calculateOrderPricing, generateOrderRef, getPlatformCommission } from "../utils/pricing.js";
import { createOtpPair }  from "../utils/otpService.js";
import { notifyUser }     from "../utils/sseService.js";
import { FulfillmentCoupon } from "../models/fulfillmentCoupon.model.js";
import { AffiliateClick } from "../models/affiliateClick.model.js";
import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";
import { ServiceOffering } from "../models/serviceOffering.model.js";

// ── CART ──────────────────────────────────────────────────────────────────────
export const updateCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: "productId and quantity (min 1) are required" });
    }
    const product = await Product.findById(productId).lean();
    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, message: "Product not found or unavailable" });
    }
    if (product.stock < quantity) {
      return res.status(400).json({ success: false, message: `Only ${product.stock} units available` });
    }
    await CartItem.findOneAndUpdate(
      { userId: req.userId, productId },
      { quantity },
      { upsert: true, new: true }
    );
    res.status(200).json({ success: true, message: "Cart updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCart = async (req, res) => {
  try {
    const items = await CartItem.find({ userId: req.userId })
      .populate("productId", "name priceKobo stock imageUrls isActive")
      .lean();
    const active = items.filter((i) => i.productId?.isActive);
    res.status(200).json({ success: true, items: active });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const applyFulfillmentCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.userId;

    const coupon = await FulfillmentCoupon.findOne({ code: code.toUpperCase() });
    if (!coupon) return res.status(404).json({ success: false, message: "Invalid coupon code" });
    if (coupon.status !== "ACTIVE") return res.status(400).json({ success: false, message: "Coupon not active" });
    if (new Date() > coupon.expiresAt) return res.status(400).json({ success: false, message: "Coupon expired" });
    if (coupon.remainingSlots <= 0) return res.status(400).json({ success: false, message: "No slots left" });

    if (coupon.eligibleUserIds?.length > 0 && !coupon.eligibleUserIds.some((id) => id.toString() === userId)) {
      return res.status(403).json({ success: false, message: "This fulfillment code was not issued for your account" });
    }

    const alreadyClaimed = coupon.claimedBy.find((entry) => entry.userId?.toString() === userId);
    if (alreadyClaimed) {
      await CartItem.updateMany({ userId }, { fulfillmentCouponCode: coupon.code });
      return res.status(200).json({ success: true, message: "Coupon re-applied", coupon: { code: coupon.code } });
    }

    if (coupon.claimedBy.length >= coupon.totalSlots) {
      return res.status(400).json({ success: false, message: "All slots claimed" });
    }

    coupon.claimedBy.push({ userId, claimedAt: new Date() });
    coupon.usedSlots += 1;
    if (coupon.usedSlots >= coupon.totalSlots) coupon.status = "EXHAUSTED";
    await coupon.save();

    await CartItem.updateMany({ userId }, { fulfillmentCouponCode: coupon.code });

    res.status(200).json({
      success: true,
      message: "Coupon applied. Your cart is now covered by this fulfillment code.",
      coupon: { code: coupon.code, remainingSlots: coupon.remainingSlots },
    });
  } catch (error) {
    console.error("[applyFulfillmentCoupon]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const removeFulfillmentCoupon = async (req, res) => {
  try {
    await CartItem.updateMany({ userId: req.userId }, { $unset: { fulfillmentCouponCode: 1 } });
    res.status(200).json({ success: true, message: "Coupon removed from cart" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── ESCROW CHECKOUT ───────────────────────────────────────────────────────────
export const checkout = async (req, res) => {
  const { cartItems, shippingAddress, buyerPhone, paymentMethod, affiliateReferralCode, fulfillmentCouponCode } = req.body;

  try {
    if (!cartItems?.length || !shippingAddress) {
      return res.status(400).json({ success: false, message: "cartItems and shippingAddress are required" });
    }

    // Step 1: Validate and snapshot all products
    const productIds = cartItems.map((i) => new mongoose.Types.ObjectId(i.productId));
    const products = await Product.find({ _id: { $in: productIds }, isActive: true }).lean();

    if (products.length !== cartItems.length) {
      return res.status(400).json({ success: false, message: "One or more products are unavailable" });
    }

    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const orderState = products[0].assignedState;

    const pricedItems = cartItems.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);
      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock}`);
      }
      return {
        productId: product._id,
        productName: product.name,
        quantity: item.quantity,
        unitPriceKobo: product.priceKobo,
        subtotalKobo: product.priceKobo * item.quantity,
        merchantId: product.merchantId,
        buildingFloor: product.buildingFloor,
      };
    });

    // Validate + price any attached services against the real catalog — never trust client-sent price
    const serviceOfferingIds = cartItems.flatMap((i) => (i.serviceItems || []).map((s) => s.offeringId)).filter(Boolean);
    const offerings = serviceOfferingIds.length
      ? await ServiceOffering.find({ _id: { $in: serviceOfferingIds }, isActive: true }).lean()
      : [];
    const offeringMap = new Map(offerings.map((o) => [o._id.toString(), o]));

    const pricedServiceItems = cartItems.flatMap((item) =>
      (item.serviceItems || []).map((s) => {
        const offering = offeringMap.get(s.offeringId);
        if (!offering) throw new Error(`Service offering ${s.offeringId} not found or inactive`);
        return {
          parentProductId: item.productId,
          providerId: offering.providerId,
          serviceType: offering.serviceType,
          priceKobo: offering.priceKobo,
        };
      })
    );

    // Group by fulfillment party: one group per merchant, one per distinct service provider
    const merchantGroups = new Map();
    for (const item of pricedItems) {
      const key = item.merchantId.toString();
      if (!merchantGroups.has(key)) merchantGroups.set(key, []);
      merchantGroups.get(key).push(item);
    }
    const serviceGroups = new Map();
    for (const svc of pricedServiceItems) {
      const key = svc.providerId.toString();
      if (!serviceGroups.has(key)) serviceGroups.set(key, []);
      serviceGroups.get(key).push(svc);
    }

    const isMultiMerchant = merchantGroups.size > 1 || serviceGroups.size > 0;

    // Price EACH group with its own correct commission rate, then sum — fixes the flat-rate-from-first-item bug
    const groupPricings = [];
    for (const [merchantId, items] of merchantGroups) {
      const commissionPct = getPlatformCommission(orderState, items[0].buildingFloor);
      const pricing = calculateOrderPricing(items.map((i) => ({ unitPriceKobo: i.unitPriceKobo, quantity: i.quantity })), commissionPct);
      groupPricings.push({ type: "PRODUCT", merchantId, items, pricing });
    }
    for (const [providerId, services] of serviceGroups) {
      const commissionPct = getPlatformCommission(orderState);
      const pricing = calculateOrderPricing(services.map((s) => ({ unitPriceKobo: s.priceKobo, quantity: 1 })), commissionPct);
      groupPricings.push({ type: "SERVICE", merchantId: providerId, items: services, pricing });
    }

    const pricing = {
      grossTotalKobo: groupPricings.reduce((s, g) => s + g.pricing.grossTotalKobo, 0),
      platformFeeKobo: groupPricings.reduce((s, g) => s + g.pricing.platformFeeKobo, 0),
      merchantNetKobo: groupPricings.reduce((s, g) => s + g.pricing.merchantNetKobo, 0),
      grossTotalNaira: 0,
      platformFeeNaira: 0,
      merchantNetNaira: 0,
    };
    pricing.grossTotalNaira = pricing.grossTotalKobo / 100;
    pricing.platformFeeNaira = pricing.platformFeeKobo / 100;
    pricing.merchantNetNaira = pricing.merchantNetKobo / 100;

    // Step 4: MongoDB transaction — atomic across stock, order, fulfillment groups, ledger, audit
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 4a. Atomically decrement stock with $gte guard — unchanged, already correct across multiple merchants
      for (const item of pricedItems) {
        const result = await Product.findOneAndUpdate(
          { _id: item.productId, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity, soldCount: item.quantity } },
          { session, new: true }
        );
        if (!result) {
          throw new Error(`Stock depleted for "${item.productName}" during checkout. Please refresh.`);
        }
      }

      const orderCount = await Order.countDocuments({}, { session });
      const orderRef = generateOrderRef(orderState, orderCount + 1);
      const couponCode = fulfillmentCouponCode || cartItems?.[0]?.fulfillmentCouponCode || null;
      const groupOtps = [];
      let order;

      if (!isMultiMerchant) {
        const { rawOtp, otpHash } = await createOtpPair();
        [order] = await Order.create([{
          orderRef,
          buyerId: req.userId,
          merchantId: groupPricings[0].merchantId,
          items: pricedItems,
          grossTotalKobo: pricing.grossTotalKobo,
          platformFeeKobo: pricing.platformFeeKobo,
          merchantNetKobo: pricing.merchantNetKobo,
          status: "PENDING",
          escrowStatus: "LOCKED",
          riderOtpHash: otpHash,
          shippingAddress,
          assignedState: orderState,
          fulfillmentCouponCode: couponCode,
          affiliateReferralCode: affiliateReferralCode || null,
          timeline: [{ status: "PENDING", timestamp: new Date(), actorId: req.userId, note: "Order created. Escrow locked." }],
        }], { session });

        await EscrowLedger.create([{
          orderId: order._id,
          entryType: "LOCK",
          grossTotalKobo: pricing.grossTotalKobo,
          platformFeeKobo: pricing.platformFeeKobo,
          merchantNetKobo: pricing.merchantNetKobo,
          escrowStatus: "LOCKED",
          actorId: req.userId,
          noteText: `Escrow locked for order ${order.orderRef}`,
        }], { session });

        groupOtps.push({ fulfillmentGroupId: null, rawOtp });
      } else {
        [order] = await Order.create([{
          orderRef,
          buyerId: req.userId,
          merchantId: groupPricings[0].merchantId,
          items: pricedItems,
          grossTotalKobo: pricing.grossTotalKobo,
          platformFeeKobo: pricing.platformFeeKobo,
          merchantNetKobo: pricing.merchantNetKobo,
          status: "PENDING",
          escrowStatus: "LOCKED",
          shippingAddress,
          assignedState: orderState,
          fulfillmentCouponCode: couponCode,
          affiliateReferralCode: affiliateReferralCode || null,
          isMultiMerchant: true,
          timeline: [{ status: "PENDING", timestamp: new Date(), actorId: req.userId, note: "Multi-party order created. Escrow locked per group." }],
        }], { session });

        const groupIds = [];
        for (const group of groupPricings) {
          const { rawOtp, otpHash } = await createOtpPair();
          const [fg] = await FulfillmentGroup.create([{
            orderId: order._id,
            groupType: group.type,
            merchantId: group.merchantId,
            items: group.items.map((i) => group.type === "PRODUCT"
              ? {
                  productId: i.productId,
                  productName: i.productName,
                  quantity: i.quantity,
                  unitPriceKobo: i.unitPriceKobo,
                  subtotalKobo: i.subtotalKobo,
                }
              : {
                  serviceType: i.serviceType,
                  quantity: 1,
                  unitPriceKobo: i.priceKobo,
                  subtotalKobo: i.priceKobo,
                }
            ),
            status: "PENDING",
            escrowStatus: "LOCKED",
            riderOtpHash: otpHash,
          }], { session });

          await EscrowLedger.create([{
            orderId: order._id,
            fulfillmentGroupId: fg._id,
            entryType: "LOCK",
            grossTotalKobo: group.pricing.grossTotalKobo,
            platformFeeKobo: group.pricing.platformFeeKobo,
            merchantNetKobo: group.pricing.merchantNetKobo,
            escrowStatus: "LOCKED",
            actorId: req.userId,
            noteText: `Escrow locked for fulfillment group ${fg._id} (order ${order.orderRef})`,
          }], { session });

          groupIds.push(fg._id);
          groupOtps.push({ fulfillmentGroupId: fg._id, groupType: group.type, rawOtp });
        }

        order.fulfillmentGroupIds = groupIds;
        await order.save({ session });
      }

      const audits = pricedItems.map((item) => ({
        productId: item.productId,
        actorId: req.userId,
        deltaCount: -item.quantity,
        reasonCode: "SALE",
        stockBefore: productMap.get(item.productId.toString()).stock,
        stockAfter: productMap.get(item.productId.toString()).stock - item.quantity,
        noteText: `Deducted by order ${order.orderRef}`,
        orderId: order._id,
      }));
      await InventoryAudit.create(audits, { session });

      if (affiliateReferralCode) {
        await AffiliateClick.findOneAndUpdate(
          { referralCode: affiliateReferralCode, converted: false },
          { converted: true, orderId: order._id, convertedAt: new Date() },
          { new: true }
        );
      }

      await session.commitTransaction();

      await CartItem.deleteMany({ userId: req.userId });

      for (const group of groupPricings) {
        notifyUser(group.merchantId.toString(), "order:status_changed", {
          orderId: order._id,
          orderRef: order.orderRef,
          newStatus: "PENDING",
          message: "New order received",
        });
      }

      return res.status(201).json({
        success: true,
        orderId: order._id,
        orderRef: order.orderRef,
        isMultiMerchant,
        otps: groupOtps,
        grossTotalNaira: pricing.grossTotalNaira,
        platformFeeNaira: pricing.platformFeeNaira,
        merchantNetNaira: pricing.merchantNetNaira,
        message: "Order placed. Funds locked in escrow.",
      });
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("[checkout]", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

// ── GET ORDER STATUS ──────────────────────────────────────────────────────────
export const getOrderStatus = async (req, res) => {
  try {
    // riderOtpHash excluded by select:false on the model — never returned
    const order = await Order.findOne({ _id: req.params.id, buyerId: req.userId }).lean();
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    res.status(200).json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET ORDER HISTORY ─────────────────────────────────────────────────────────
export const getOrderHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      Order.find({ buyerId: req.userId })
        .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Order.countDocuments({ buyerId: req.userId }),
    ]);
    res.status(200).json({ success: true, orders, pagination: { page: parseInt(page), total } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── CANCEL ORDER ──────────────────────────────────────────────────────────────
export const bulkFulfillmentPayment = async (req, res) => {
  let session;
  try {
    const { couponCode } = req.body;
    if (typeof couponCode !== "string" || !couponCode.trim()) {
      return res.status(400).json({ success: false, message: "Coupon code is required" });
    }
    const userId = req.userId;

    session = await mongoose.startSession();
    session.startTransaction();

    const coupon = await FulfillmentCoupon.findOne({ code: couponCode.toUpperCase() }).session(session);
    if (!coupon) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    const isAuthorized = coupon.affiliateId.toString() === userId || req.userRole === "super_admin";
    if (!isAuthorized) {
      await session.abortTransaction();
      return res.status(403).json({ success: false, message: "Not authorized to pay for this coupon" });
    }

    const orders = await Order.find({
      fulfillmentCouponCode: couponCode.toUpperCase(),
      status: { $in: ["PENDING", "AWAITING_FULFILLMENT_PAYMENT"] },
      $or: [
        { reservationExpiresAt: null },
        { reservationExpiresAt: { $gt: new Date() } },
      ],
    }).session(session);

    if (!orders.length) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "No pending orders for this coupon" });
    }

    const totalKobo = orders.reduce((sum, order) => sum + (order.grossTotalKobo || 0), 0);

    if (coupon.budgetKobo > 0 && coupon.remainingBudgetKobo < totalKobo) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Insufficient coupon budget. Need ₦${(totalKobo / 100).toLocaleString()}, have ₦${(coupon.remainingBudgetKobo / 100).toLocaleString()}`,
      });
    }

    const notifications = [];
    for (const order of orders) {
      order.status = "PAID";
      order.paymentMethod = "FULFILLMENT_COUPON";
      order.paidAt = new Date();
      await order.save({ session });
      if (order.isMultiMerchant) {
        const groups = await FulfillmentGroup.find({
          orderId: order._id,
          status: "PENDING",
        }).select("merchantId").session(session);
        await FulfillmentGroup.updateMany(
          { orderId: order._id, status: "PENDING" },
          { status: "PAID" },
          { session }
        );
        for (const group of groups) {
          notifications.push([String(group.merchantId), {
            orderRef: order.orderRef,
            newStatus: "PAID",
            message: `Order ${order.orderRef} is paid. Confirm it to release it for pickup.`,
          }]);
        }
      }

      const claim = coupon.claimedBy.find((entry) => entry.userId?.toString() === order.buyerId.toString());
      if (claim) claim.orderId = order._id;
    }

    if (coupon.budgetKobo > 0) {
      coupon.usedBudgetKobo += totalKobo;
    }
    await coupon.save({ session });
    await session.commitTransaction();

    for (const [merchantId, payload] of notifications) {
      notifyUser(merchantId, "fulfillment:status_changed", payload);
    }

    res.status(200).json({
      success: true,
      message: `Paid ${orders.length} orders totaling ₦${(totalKobo / 100).toLocaleString()}`,
      ordersPaid: orders.length,
      totalKobo,
    });
  } catch (error) {
    if (session?.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("[bulkFulfillmentPayment] transaction rollback failed", abortError);
      }
    }
    console.error("[bulkFulfillmentPayment]", error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    await session?.endSession();
  }
};

export const getOrdersByCoupon = async (req, res) => {
  try {
    const { couponCode } = req.params;
    const coupon = await FulfillmentCoupon.findOne({ code: couponCode.toUpperCase() }).lean();
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });

    const isAuthorized = coupon.affiliateId.toString() === req.userId || req.userRole === "super_admin";
    if (!isAuthorized) return res.status(403).json({ success: false, message: "Unauthorized" });

    const orders = await Order.find({ fulfillmentCouponCode: couponCode.toUpperCase() })
      .populate("buyerId", "name email phone")
      .populate("items.productId", "name priceKobo")
      .sort({ createdAt: -1 })
      .lean();

    const totalPending = orders.filter((order) => order.status === "PENDING" || order.status === "AWAITING_FULFILLMENT_PAYMENT").length;
    const totalKobo = orders.reduce((sum, order) => sum + (order.grossTotalKobo || 0), 0);

    res.status(200).json({
      success: true,
      coupon,
      orders,
      summary: { totalOrders: orders.length, totalPending, totalKobo },
    });
  } catch (error) {
    console.error("[getOrdersByCoupon]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const cancelOrder = async (req, res) => {
  const { reason } = req.body;
  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await Order.findOne({ _id: req.params.id, buyerId: req.userId }).session(session);
      if (!order) {
        await session.abortTransaction();
        return res.status(404).json({ success: false, message: "Order not found" });
      }
      if (!["PENDING", "CONFIRMED"].includes(order.status)) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: `Cannot cancel a ${order.status} order` });
      }

      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stock: item.quantity, soldCount: -item.quantity },
        }, { session });
      }
      await FulfillmentGroup.updateMany(
        { orderId: order._id, status: { $in: ["PENDING", "PAID", "CONFIRMED"] } },
        { status: "CANCELLED", escrowStatus: "REFUNDED" },
        { session }
      );
      order.status       = "CANCELLED";
      order.escrowStatus = "REFUNDED";
      order.timeline.push({ status: "CANCELLED", timestamp: new Date(), actorId: req.userId, note: reason || "Cancelled by buyer" });
      await order.save({ session });

      await EscrowLedger.create([{
        orderId: order._id, entryType: "REFUND",
        grossTotalKobo: order.grossTotalKobo, platformFeeKobo: order.platformFeeKobo, merchantNetKobo: order.merchantNetKobo,
        escrowStatus: "REFUNDED", actorId: req.userId, noteText: `Refund: buyer cancellation`,
      }], { session });

      await session.commitTransaction();
      res.status(200).json({ success: true, message: "Order cancelled and escrow refunded" });
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("[cancelOrder]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
