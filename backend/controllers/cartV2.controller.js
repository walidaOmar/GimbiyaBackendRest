import crypto from "crypto";
import mongoose from "mongoose";
import { Cart, CartItem, AffiliateLink } from "../models/cart.model.js";
import { Product } from "../models/product.model.js";
import { ServiceOffering } from "../models/serviceOffering.model.js";
import { Order } from "../models/order.model.js";
import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";
import { User } from "../models/user.model.js";
import { createOtpPair } from "../utils/otpService.js";
import { encryptOtp } from "../utils/otpVault.js";
import { resolveViewer } from "../utils/viewer.js";
import { priceForQuantity } from "../utils/productPricing.js";
import { getRevenueConfig } from "../utils/revenueCache.js";
import { getRegionShortCode } from "../utils/pricing.js";
import { buildOrderBreakdown } from "../policy/pricing.v1.js";
import { canBuyTier } from "../policy/marketVisibility.v1.js";

const MAX_QTY = 100000;
const MAX_SERVICES_PER_ITEM = 5;

const getOrCreateCart = (userId) =>
  Cart.findOneAndUpdate({ userId }, { $set: { status: "ACTIVE" } }, { upsert: true, new: true, setDefaultsOnInsert: true });

// B4 — stock reservation (atomic $gte guard; released again if checkout fails or the order goes unpaid)
const RESERVATION_MINUTES = Number(process.env.UNPAID_HOLD_MINUTES || 30);

const reserveStock = async (items, session) => {
  for (const item of items) {
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

/** First product in the cart decides the market the cart belongs to (one cart = one market). */
const cartNode = async (cartId) => {
  const first = await CartItem.findOne({ cartId }).populate("productId", "assignedState").lean();
  return first?.productId?.assignedState || null;
};

export const addToCartV2 = async (req, res) => {
  try {
    const { productId } = req.body;
    const quantity = Number(req.body.quantity);
    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      return res.status(400).json({ success: false, message: "productId and a whole-number quantity (1 or more) are required" });
    }

    const product = await Product.findById(productId).lean();
    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, message: "Product not found or unavailable" });
    }
    if (String(product.merchantId) === String(req.userId)) {
      return res.status(400).json({ success: false, message: "You cannot buy your own product." });
    }

    // Browsing is wide, buying is role-aware: the server re-checks the market tier here.
    const { viewerClass } = await resolveViewer(req);
    if (!canBuyTier(viewerClass, product.marketTier)) {
      return res.status(403).json({ success: false, code: "TIER_NOT_ALLOWED", message: "This product is not available to your account type." });
    }
    if (quantity < (product.minimumOrderQuantity || 1)) {
      return res.status(400).json({ success: false, message: `Minimum order for this product is ${product.minimumOrderQuantity} units.` });
    }
    if (product.stock < quantity) {
      return res.status(400).json({ success: false, message: `Only ${product.stock} units available` });
    }

    const cart = await getOrCreateCart(req.userId);
    const node = await cartNode(cart._id);
    if (node && node !== product.assignedState) {
      return res.status(409).json({ success: false, code: "CART_OTHER_MARKET", message: `Your cart already has items from ${node}. Check out or clear it before shopping in ${product.assignedState}.` });
    }

    const { listedUnitKobo } = priceForQuantity(product, quantity);
    const item = await CartItem.findOneAndUpdate(
      { userId: req.userId, productId },
      { userId: req.userId, cartId: cart._id, productId, quantity, merchantId: product.merchantId, priceSnapshot: listedUnitKobo },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, data: item });
  } catch (error) {
    console.error("[addToCartV2]", error);
    res.status(500).json({ success: false, message: "Could not add to cart" });
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
    if ((item.serviceItems || []).length >= MAX_SERVICES_PER_ITEM) {
      return res.status(400).json({ success: false, message: `You can attach up to ${MAX_SERVICES_PER_ITEM} services to one item.` });
    }

    const product = await Product.findById(item.productId).select("assignedState").lean();
    const offering = await ServiceOffering.findOne({
      _id: offeringId,
      isActive: true,
      assignedState: product?.assignedState,
    }).lean();
    if (!offering) {
      return res.status(404).json({ success: false, message: "Service not found or not available in this market" });
    }
    if (String(offering.providerId) === String(req.userId)) {
      return res.status(400).json({ success: false, message: "You cannot book your own service." });
    }
    if (offering.pricingModel === "QUOTE" || offering.pricingModel === "INSPECTION") {
      return res.status(400).json({ success: false, message: "This service needs a quote first, so it cannot be added to the cart yet." });
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
    console.error("[addServiceToCartItem]", error);
    res.status(500).json({ success: false, message: "Could not attach the service" });
  }
};

export const removeServiceFromCartItem = async (req, res) => {
  try {
    const { cartItemId, serviceIndex } = req.params;
    const item = await CartItem.findOne({ _id: cartItemId, userId: req.userId });
    if (!item) {
      return res.status(404).json({ success: false, message: "Cart item not found" });
    }
    const index = Number(serviceIndex);
    if (!Number.isInteger(index) || index < 0 || index >= item.serviceItems.length) {
      return res.status(400).json({ success: false, message: "Invalid service position" });
    }
    item.serviceItems.splice(index, 1);
    await item.save();

    res.json({ success: true, data: item });
  } catch (error) {
    console.error("[removeServiceFromCartItem]", error);
    res.status(500).json({ success: false, message: "Could not remove the service" });
  }
};

/**
 * Re-prices the whole cart on the server (current listing prices, stock, tier rules, referral).
 * Used by both the quote endpoint (what the cart page shows) and checkout (what is charged).
 */
export const buildCartQuote = async (req, referralCode) => {
  const cart = await Cart.findOne({ userId: req.userId, status: "ACTIVE" });
  if (!cart) return { empty: true, items: [] };
  const items = await CartItem.find({ cartId: cart._id }).populate("productId");
  if (items.length === 0) return { empty: true, items: [], cart };

  const { viewerClass } = await resolveViewer(req);
  const issues = [];
  const productLines = [];
  const serviceLines = [];
  const lines = [];

  for (const item of items) {
    const p = item.productId;
    const row = { cartItemId: item._id, productId: p?._id, name: p?.name || "Unavailable item", quantity: item.quantity, imageUrl: p?.imageUrls?.[0] || null, services: [], issue: null };
    if (!p || !p.isActive) row.issue = "No longer available";
    else if (p.stock < item.quantity) row.issue = `Only ${p.stock} left`;
    else if (!canBuyTier(viewerClass, p.marketTier)) row.issue = "Not available to your account type";
    else if (item.quantity < (p.minimumOrderQuantity || 1)) row.issue = `Minimum order is ${p.minimumOrderQuantity}`;
    else if (String(p.merchantId) === String(req.userId)) row.issue = "This is your own product";

    if (p) {
      const { baseUnitKobo, listedUnitKobo } = priceForQuantity(p, item.quantity);
      row.unitKobo = listedUnitKobo;
      row.lineKobo = listedUnitKobo * item.quantity;
      if (!row.issue) productLines.push({ merchantId: p.merchantId, productId: p._id, productName: p.name, quantity: item.quantity, baseUnitKobo, listedUnitKobo });
    }
    (item.serviceItems || []).forEach((svc, index) => {
      row.services.push({ index, serviceType: svc.serviceType, priceKobo: svc.priceSnapshot });
      if (!row.issue) serviceLines.push({ providerId: svc.serviceProviderId, serviceType: svc.serviceType, priceKobo: svc.priceSnapshot, offeringId: svc.offeringId, parentProductName: p?.name || null });
    });
    if (row.issue) issues.push(`${row.name}: ${row.issue}`);
    lines.push(row);
  }

  // Referral: only a real, active affiliate link counts, and never the buyer's own.
  let affiliateId = null;
  let code = null;
  if (referralCode) {
    const link = await AffiliateLink.findOne({ code: String(referralCode), isActive: true }).lean();
    const partner = link ? await User.findOne({ _id: link.partnerId, role: "affiliate", isActive: true }).select("_id").lean() : null;
    if (partner && String(partner._id) !== String(req.userId)) { affiliateId = partner._id; code = link.code; }
  }

  const config = getRevenueConfig();
  const breakdown = productLines.length || serviceLines.length
    ? buildOrderBreakdown({ config, productLines, serviceLines, affiliateId })
    : { groups: [], totals: { productSubtotalKobo: 0, serviceSubtotalKobo: 0, feeKobo: 0, deliveryFeeKobo: 0, grossTotalKobo: 0, commissionPoolKobo: 0, merchantNetKobo: 0, referred: false } };

  const first = items.find((i) => i.productId)?.productId;
  return { empty: false, cart, items, lines, issues, breakdown, affiliateId, referralCode: code, config, node: first?.assignedState || null, productLines, serviceLines };
};

export const quoteCartV2 = async (req, res) => {
  try {
    const q = await buildCartQuote(req, req.query.ref);
    if (q.empty) return res.json({ success: true, data: { items: [], totals: null, issues: [] } });
    res.json({
      success: true,
      data: {
        items: q.lines,
        issues: q.issues,
        node: q.node,
        referralApplied: Boolean(q.affiliateId),
        totals: {
          productsKobo: q.breakdown.totals.productSubtotalKobo,
          servicesKobo: q.breakdown.totals.serviceSubtotalKobo,
          feeKobo: q.breakdown.totals.feeKobo,
          deliveryFeeKobo: q.breakdown.totals.deliveryFeeKobo,
          grossTotalKobo: q.breakdown.totals.grossTotalKobo,
          platformFeePct: q.config.platformFeePct,
        },
        groupCount: q.breakdown.groups.length,
      },
    });
  } catch (error) {
    console.error("[quoteCartV2]", error);
    res.status(500).json({ success: false, message: "Could not price your cart" });
  }
};

export const checkoutV2 = async (req, res) => {
  let session;
  try {
    const { shippingAddress, affiliateReferralCode } = req.body;
    if (!shippingAddress || String(shippingAddress).trim().length < 5) {
      return res.status(400).json({ success: false, message: "Please enter a delivery address (at least 5 characters)." });
    }

    const quote = await buildCartQuote(req, affiliateReferralCode);
    if (quote.empty) return res.status(400).json({ success: false, message: "Your cart is empty" });
    if (quote.issues.length) {
      return res.status(409).json({ success: false, code: "CART_ISSUES", message: `Fix these first: ${quote.issues.join("; ")}`, issues: quote.issues });
    }
    const { items, breakdown, affiliateId, config, node, cart } = quote;
    const assignedState = node; // always the market the products belong to, never the client's claim

    session = await mongoose.startSession();
    session.startTransaction();
    await reserveStock(items, session);

    const [order] = await Order.create([{
      orderRef: `GM-${getRegionShortCode(assignedState)}-${Date.now()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
      buyerId: req.userId,
      merchantId: items[0].merchantId || items[0].productId?.merchantId,
      items: quote.productLines.map((l) => ({
        productId: l.productId, productName: l.productName, quantity: l.quantity,
        unitPriceKobo: l.listedUnitKobo, subtotalKobo: l.listedUnitKobo * l.quantity,
      })),
      grossTotalKobo: breakdown.totals.grossTotalKobo,
      platformFeeKobo: breakdown.totals.feeKobo,
      merchantNetKobo: breakdown.totals.merchantNetKobo,
      deliveryFeeKobo: breakdown.totals.deliveryFeeKobo,
      commissionPoolKobo: breakdown.totals.commissionPoolKobo,
      revenueConfigVersion: config.version ?? null,
      affiliateId,
      affiliateReferralCode: quote.referralCode,
      status: "PENDING",
      escrowStatus: "LOCKED",
      shippingAddress: String(shippingAddress).trim().slice(0, 300),
      assignedState,
      isMultiMerchant: true, // every V2 order uses fulfillment groups, even with one merchant
      reservationExpiresAt: new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000),
    }], { session });

    const groupIds = [];
    const groupOtpSummary = [];

    for (const g of breakdown.groups) {
      const { rawOtp, otpHash } = await createOtpPair();
      const isProduct = g.type === "PRODUCT";
      const [group] = await FulfillmentGroup.create([{
        orderId: order._id,
        groupType: g.type,
        merchantId: g.merchantId,
        items: g.lines.map((l) => isProduct
          ? { productId: l.productId, productName: l.productName, quantity: l.quantity, unitPriceKobo: l.listedUnitKobo, subtotalKobo: l.listedUnitKobo * l.quantity }
          : { serviceType: l.serviceType, unitPriceKobo: l.priceKobo, subtotalKobo: l.priceKobo, quantity: 1 }),
        status: "PENDING",
        escrowStatus: "LOCKED",
        riderOtpHash: otpHash,
        buyerOtpEnc: encryptOtp(rawOtp),
        settlement: {
          baseKobo: g.baseKobo, listedKobo: g.listedKobo, serviceKobo: g.serviceKobo, poolKobo: g.poolKobo,
          feeKobo: g.feeKobo, deliveryFeeKobo: g.deliveryFeeKobo, merchantKobo: g.merchantKobo, riderKobo: g.riderKobo,
          affiliateKobo: g.affiliateKobo, platformKobo: g.platformKobo, customerKobo: g.customerKobo,
        },
      }], { session });
      groupIds.push(group._id);
      groupOtpSummary.push({ fulfillmentGroupId: group._id, merchantId: g.merchantId, groupType: g.type, rawOtp });
    }

    order.fulfillmentGroupIds = groupIds;
    await order.save({ session });

    // The cart is spent: clear its lines and keep the (unique per user) cart document for next time.
    await CartItem.deleteMany({ cartId: cart._id }, { session });
    await session.commitTransaction();

    res.json({
      success: true,
      data: {
        order,
        fulfillmentGroupCount: groupIds.length,
        groupOtpSummary,
        totals: {
          productsKobo: breakdown.totals.productSubtotalKobo,
          servicesKobo: breakdown.totals.serviceSubtotalKobo,
          feeKobo: breakdown.totals.feeKobo,
          deliveryFeeKobo: breakdown.totals.deliveryFeeKobo,
          grossTotalKobo: breakdown.totals.grossTotalKobo,
        },
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
      .populate("productId", "name priceKobo imageUrls stock isActive marketTier minimumOrderQuantity assignedState")
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
