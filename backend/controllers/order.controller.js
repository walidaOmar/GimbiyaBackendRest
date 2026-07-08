import mongoose from "mongoose";
import { Product }        from "../models/product.model.js";
import { Order }          from "../models/order.model.js";
import { CartItem }       from "../models/cart.model.js";
import { EscrowLedger, InventoryAudit } from "../models/ledger.model.js";
import { calculateOrderPricing, generateOrderRef } from "../utils/pricing.js";
import { createOtpPair }  from "../utils/otpService.js";
import { notifyUser }     from "../utils/sseService.js";

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

// ── ESCROW CHECKOUT ───────────────────────────────────────────────────────────
export const checkout = async (req, res) => {
  const { cartItems, shippingAddress, buyerPhone, paymentMethod } = req.body;

  try {
    if (!cartItems?.length || !shippingAddress) {
      return res.status(400).json({ success: false, message: "cartItems and shippingAddress are required" });
    }

    // Step 1: Validate and snapshot all products
    const productIds = cartItems.map((i) => new mongoose.Types.ObjectId(i.productId));
    const products   = await Product.find({ _id: { $in: productIds }, isActive: true }).lean();

    if (products.length !== cartItems.length) {
      return res.status(400).json({ success: false, message: "One or more products are unavailable" });
    }

    const productMap  = new Map(products.map((p) => [p._id.toString(), p]));
    let merchantId    = null;
    let orderState    = null;

    const pricedItems = cartItems.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);
      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for "${product.name}". Available: ${product.stock}`);
      }
      if (!merchantId) {
        merchantId = product.merchantId;
        orderState = product.assignedState;
      }
      return {
        productId:     product._id,
        productName:   product.name,
        quantity:      item.quantity,
        unitPriceKobo: product.priceKobo,
        subtotalKobo:  product.priceKobo * item.quantity,
      };
    });

    // Step 2: Calculate pricing — SINGLE SOURCE OF TRUTH
    const pricing = calculateOrderPricing(
      pricedItems.map((i) => ({ unitPriceKobo: i.unitPriceKobo, quantity: i.quantity }))
    );

    // Step 3: Generate OTP pair — rawOtp shown to buyer only
    const { rawOtp, otpHash } = await createOtpPair();

    // Step 4: MongoDB transaction — atomic across stock, order, ledger, audit
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 4a. Atomically decrement stock with $gte guard — NEVER direct overwrite
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

      // 4b. Generate order reference
      const orderCount = await Order.countDocuments({}, { session });

      // 4c. Create order document
      const [order] = await Order.create([{
        orderRef:        generateOrderRef(orderState, orderCount + 1),
        buyerId:         req.userId,
        merchantId,
        items:           pricedItems,
        grossTotalKobo:  pricing.grossTotalKobo,
        platformFeeKobo: pricing.platformFeeKobo,
        merchantNetKobo: pricing.merchantNetKobo,
        status:          "PENDING",
        escrowStatus:    "LOCKED",
        riderOtpHash:    otpHash,   // bcrypt hash only — raw OTP never stored
        shippingAddress,
        assignedState:   orderState,
        timeline: [{
          status: "PENDING", timestamp: new Date(),
          actorId: req.userId, note: "Order created. Escrow locked.",
        }],
      }], { session });

      // 4d. Append EscrowLedger LOCK entry
      await EscrowLedger.create([{
        orderId: order._id, entryType: "LOCK",
        grossTotalKobo:  pricing.grossTotalKobo,
        platformFeeKobo: pricing.platformFeeKobo,
        merchantNetKobo: pricing.merchantNetKobo,
        escrowStatus: "LOCKED", actorId: req.userId,
        noteText: `Escrow locked for order ${order.orderRef}`,
      }], { session });

      // 4e. Write InventoryAudit for each item
      const audits = pricedItems.map((item) => ({
        productId:   item.productId, actorId: req.userId,
        deltaCount:  -item.quantity, reasonCode: "SALE",
        stockBefore: productMap.get(item.productId.toString()).stock,
        stockAfter:  productMap.get(item.productId.toString()).stock - item.quantity,
        noteText:    `Deducted by order ${order.orderRef}`, orderId: order._id,
      }));
      await InventoryAudit.create(audits, { session });

      await session.commitTransaction();

      // Clear cart (non-critical, outside transaction)
      await CartItem.deleteMany({ userId: req.userId });

      // Notify merchant via SSE
      notifyUser(merchantId.toString(), "order:status_changed", {
        orderId: order._id, orderRef: order.orderRef,
        newStatus: "PENDING", message: "New order received",
      });

      return res.status(201).json({
        success:          true,
        orderId:          order._id,
        orderRef:         order.orderRef,
        rawOtp,           // ← Buyer sees this ONCE. Never stored in plain text.
        grossTotalNaira:  pricing.grossTotalNaira,
        platformFeeNaira: pricing.platformFeeNaira,
        merchantNetNaira: pricing.merchantNetNaira,
        message:          "Order placed. Funds locked in escrow.",
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
export const cancelOrder = async (req, res) => {
  const { reason } = req.body;
  try {
    const order = await Order.findOne({ _id: req.params.id, buyerId: req.userId });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (!["PENDING", "CONFIRMED"].includes(order.status)) {
      return res.status(400).json({ success: false, message: `Cannot cancel a ${order.status} order` });
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stock: item.quantity, soldCount: -item.quantity },
        }, { session });
      }
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
