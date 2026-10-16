import mongoose from "mongoose";
import { Cart, CartItem } from "../models/cart.model.js";
import { Product } from "../models/product.model.js";
import { ServiceOffering } from "../models/serviceOffering.model.js";
import { Order } from "../models/order.model.js";
import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";
import { createOtpPair } from "../utils/otpService.js";

const getOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ userId, status: "ACTIVE" });
  if (!cart) cart = await Cart.create({ userId, status: "ACTIVE" });
  return cart;
};

const getReservationMinutes = () => Number(process.env.UNPAID_HOLD_MINUTES || 30);

const reserveStock = async (items, session) => {
  for (const item of items) {
    if (!item.productId) {
      throw new Error("A product in your cart is no longer available. Refresh your cart and try again.");
    }

    const updated = await Product.findOneAndUpdate(
      { _id: item.productId._id, isActive: true, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity, soldCount: item.quantity } },
      { new: true, session }
    );
    if (!updated) {
      throw new Error(`"${item.productId.name}" is out of stock or no longer available. Reduce the quantity or remove it.`);
    }
  }
};

export const addToCartV2 = async (req, res) => {
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

    const cart = await getOrCreateCart(req.userId);
    const item = await CartItem.findOneAndUpdate(
      { userId: req.userId, productId },
      {
        userId: req.userId,
        cartId: cart._id,
        productId,
        quantity,
        merchantId: product.merchantId,
        priceSnapshot: product.priceKobo,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addServiceToCartItem = async (req, res) => {
  try {
    const { cartItemId } = req.params;
    const { offeringId } = req.body;
    if (!offeringId) {
      return res.status(400).json({ success: false, message: "offeringId is required" });
    }

    const item = await CartItem.findOne({ _id: cartItemId, userId: req.userId });
    if (!item) {
      return res.status(404).json({ success: false, message: "Cart item not found" });
    }

    const product = await Product.findById(item.productId).select("assignedState").lean();
    const offering = await ServiceOffering.findOne({
      _id: offeringId,
      isActive: true,
      assignedState: product?.assignedState,
    }).lean();
    if (!offering) {
      return res.status(404).json({ success: false, message: "Service offering not found or unavailable in this location" });
    }

    item.serviceItems.push({
      offeringId: offering._id,
      serviceProviderId: offering.providerId,
      serviceType: offering.serviceType,
      priceSnapshot: offering.priceKobo,
      status: "PENDING",
    });
    await item.save();

    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const removeServiceFromCartItem = async (req, res) => {
  try {
    const { cartItemId, serviceIndex } = req.params;
    const item = await CartItem.findOne({ _id: cartItemId, userId: req.userId });
    if (!item) {
      return res.status(404).json({ success: false, message: "Cart item not found" });
    }

    item.serviceItems.splice(Number(serviceIndex), 1);
    await item.save();

    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const checkoutV2 = async (req, res) => {
  let session;
  try {
    const reservationMinutes = getReservationMinutes();
    if (!Number.isFinite(reservationMinutes) || reservationMinutes <= 0) {
      throw new Error("UNPAID_HOLD_MINUTES must be a positive number");
    }

    session = await mongoose.startSession();
    session.startTransaction();

    const { shippingAddress, assignedState } = req.body;

    const cart = await Cart.findOne({ userId: req.userId, status: "ACTIVE" }).session(session);
    if (!cart) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "No active cart" });
    }

    const items = await CartItem.find({ cartId: cart._id }).populate("productId").session(session);
    if (items.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    const byMerchant = new Map();
    for (const item of items) {
      const merchantId = item.merchantId || item.productId?.merchantId;
      if (!merchantId) {
        throw new Error(`"${item.productId?.name || "A product"}" has no merchant assigned and cannot be checked out.`);
      }
      const key = String(merchantId);
      if (!byMerchant.has(key)) byMerchant.set(key, []);
      byMerchant.get(key).push(item);
    }

    const byServiceProvider = new Map();
    for (const item of items) {
      for (const service of item.serviceItems || []) {
        const key = String(service.serviceProviderId);
        if (!byServiceProvider.has(key)) byServiceProvider.set(key, []);
        byServiceProvider.get(key).push({ ...service.toObject ? service.toObject() : service, parentProductName: item.productId?.name || null });
      }
    }
    if (byMerchant.size + byServiceProvider.size === 0) {
      throw new Error("Your cart has no items available for checkout.");
    }

    const isMultiMerchant = true;
    const grossTotalKobo = items.reduce(
      (sum, item) => sum + ((item.priceSnapshot ?? item.productId?.priceKobo ?? 0) * item.quantity) + (item.serviceItems || []).reduce((svcSum, service) => svcSum + (service.priceSnapshot || 0), 0),
      0
    );

    await reserveStock(items, session);

    const [order] = await Order.create([{
      orderRef: `GM-${assignedState?.slice(0, 2).toUpperCase() || "XX"}-${Date.now()}`,
      buyerId: req.userId,
      merchantId: items[0].merchantId || items[0].productId?.merchantId,
      items: items.map((item) => ({
        productId: item.productId._id,
        productName: item.productId.name,
        quantity: item.quantity,
        unitPriceKobo: item.priceSnapshot ?? item.productId.priceKobo,
        subtotalKobo: (item.priceSnapshot ?? item.productId.priceKobo) * item.quantity,
      })),
      grossTotalKobo,
      platformFeeKobo: 0,
      merchantNetKobo: grossTotalKobo,
      status: "PENDING",
      escrowStatus: "LOCKED",
      shippingAddress,
      assignedState,
      isMultiMerchant,
      reservationExpiresAt: new Date(Date.now() + reservationMinutes * 60 * 1000),
    }], { session });

    const groupIds = [];
    const groupOtpSummary = [];

    for (const [merchantId, merchantItems] of byMerchant) {
      const { rawOtp, otpHash } = await createOtpPair();
      const [group] = await FulfillmentGroup.create([{
        orderId: order._id,
        groupType: "PRODUCT",
        merchantId,
        items: merchantItems.map((item) => ({
          productId: item.productId._id,
          productName: item.productId.name,
          quantity: item.quantity,
          unitPriceKobo: item.priceSnapshot ?? item.productId.priceKobo,
          subtotalKobo: (item.priceSnapshot ?? item.productId.priceKobo) * item.quantity,
        })),
        status: "PENDING",
        escrowStatus: "LOCKED",
        riderOtpHash: otpHash,
      }], { session });
      groupIds.push(group._id);
      groupOtpSummary.push({ fulfillmentGroupId: group._id, merchantId, groupType: "PRODUCT", rawOtp });
      await CartItem.updateMany(
        { _id: { $in: merchantItems.map((item) => item._id) } },
        { fulfillmentGroupId: group._id },
        { session }
      );
    }

    for (const [serviceProviderId, services] of byServiceProvider) {
      const { rawOtp, otpHash } = await createOtpPair();
      const [group] = await FulfillmentGroup.create([{
        orderId: order._id,
        groupType: "SERVICE",
        merchantId: serviceProviderId,
        items: services.map((service) => ({
          serviceType: service.serviceType,
          unitPriceKobo: service.priceSnapshot,
          subtotalKobo: service.priceSnapshot,
          quantity: 1,
        })),
        status: "PENDING",
        escrowStatus: "LOCKED",
        riderOtpHash: otpHash,
      }], { session });
      groupIds.push(group._id);
      groupOtpSummary.push({ fulfillmentGroupId: group._id, merchantId: serviceProviderId, groupType: "SERVICE", rawOtp });
    }

    order.fulfillmentGroupIds = groupIds;
    await order.save({ session });

    cart.status = "CHECKED_OUT";
    await cart.save({ session });
    await session.commitTransaction();

    res.json({
      success: true,
      data: {
        order,
        fulfillmentGroupCount: groupIds.length,
        groupOtpSummary,
      },
    });
  } catch (error) {
    if (session?.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("[checkoutV2] transaction rollback failed", abortError);
      }
    }
    console.error("[checkoutV2]", error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    await session?.endSession();
  }
};

export const getCartV2 = async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.userId, status: "ACTIVE" }).lean();
    if (!cart) return res.json({ success: true, data: { cart: null, items: [] } });

    const items = await CartItem.find({ cartId: cart._id })
      .populate("productId", "name priceKobo imageUrls stock isActive")
      .lean();
    res.json({ success: true, data: { cart, items } });
  } catch (error) {
    console.error("[getCartV2]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const removeCartItemV2 = async (req, res) => {
  try {
    const item = await CartItem.findOneAndDelete({
      _id: req.params.cartItemId,
      userId: req.userId,
    });
    if (!item) return res.status(404).json({ success: false, message: "Cart item not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("[removeCartItemV2]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
