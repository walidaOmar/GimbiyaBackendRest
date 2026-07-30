import crypto from "crypto";
import { GroupOrder } from "../models/groupOrder.model.js";
import { Product } from "../models/product.model.js";

function generateCode() {
  return "GRP-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

export const createGroupOrder = async (req, res) => {
  try {
    const { productId, targetQuantity, maxQuantity, discountTiers, assignedState, expiresInHours = 48 } = req.body;

    if (!productId || !targetQuantity || !assignedState) {
      return res.status(400).json({ success: false, message: "productId, targetQuantity, and assignedState are required" });
    }

    const product = await Product.findById(productId).lean();
    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, message: "Product not found or unavailable" });
    }

    if (product.assignedState !== assignedState) {
      return res.status(403).json({ success: false, message: `Product is only available in ${product.assignedState}` });
    }

    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const groupOrder = await GroupOrder.create({
      fulfillmentCode: generateCode(),
      initiatorId: req.userId,
      productId: product._id,
      productName: product.name,
      productImageUrl: product.imageUrls?.[0] || "",
      basePriceKobo: product.priceKobo,
      targetQuantity: Number(targetQuantity),
      maxQuantity: maxQuantity ? Number(maxQuantity) : 100,
      discountTiers: discountTiers || [{ minQty: targetQuantity, discountPct: 10 }],
      participants: [],
      currentQuantity: 0,
      status: "OPEN",
      assignedState,
      expiresAt,
    });

    res.status(201).json({
      success: true,
      message: "Group order created. Share the fulfillment code to invite others.",
      groupOrder: {
        _id: groupOrder._id,
        fulfillmentCode: groupOrder.fulfillmentCode,
        productName: groupOrder.productName,
        targetQuantity: groupOrder.targetQuantity,
        expiresAt: groupOrder.expiresAt,
      },
    });
  } catch (error) {
    console.error("[createGroupOrder]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const joinGroupOrder = async (req, res) => {
  try {
    const { fulfillmentCode } = req.params;
    const { quantity } = req.body;
    const qty = Number(quantity) || 1;

    if (!fulfillmentCode) {
      return res.status(400).json({ success: false, message: "Fulfillment code is required" });
    }

    const group = await GroupOrder.findOne({ fulfillmentCode: fulfillmentCode.toUpperCase() });
    if (!group) {
      return res.status(404).json({ success: false, message: "Invalid fulfillment code" });
    }

    if (group.status !== "OPEN") {
      return res.status(400).json({ success: false, message: `This group order is ${group.status.toLowerCase()}` });
    }

    if (new Date() > group.expiresAt) {
      group.status = "EXPIRED";
      await group.save();
      return res.status(400).json({ success: false, message: "This group order has expired" });
    }

    const alreadyJoined = group.participants.find((participant) => participant.userId.toString() === req.userId);
    if (alreadyJoined) {
      return res.status(400).json({ success: false, message: "You have already joined this group order" });
    }

    if (group.currentQuantity + qty > group.maxQuantity) {
      return res.status(400).json({ success: false, message: `Only ${group.maxQuantity - group.currentQuantity} slots remaining` });
    }

    const applicableTier = group.discountTiers
      .filter((tier) => group.currentQuantity + qty >= tier.minQty)
      .sort((a, b) => b.discountPct - a.discountPct)[0];

    const discountPct = applicableTier ? applicableTier.discountPct : 0;
    const discountedPriceKobo = Math.round(group.basePriceKobo * (1 - discountPct / 100));
    const subtotalKobo = discountedPriceKobo * qty;

    group.participants.push({
      userId: req.userId,
      quantity: qty,
      unitPriceKobo: discountedPriceKobo,
      subtotalKobo,
    });

    group.currentQuantity += qty;

    if (group.currentQuantity >= group.targetQuantity) {
      group.status = "FULFILLED";
      group.fulfilledAt = new Date();
    }

    await group.save();

    res.status(200).json({
      success: true,
      message: group.status === "FULFILLED" ? "Target reached! Group order fulfilled." : "Joined successfully.",
      groupOrder: {
        fulfillmentCode: group.fulfillmentCode,
        currentQuantity: group.currentQuantity,
        targetQuantity: group.targetQuantity,
        status: group.status,
        yourPrice: discountedPriceKobo / 100,
        yourSubtotal: subtotalKobo / 100,
      },
    });
  } catch (error) {
    console.error("[joinGroupOrder]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getGroupOrderByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const group = await GroupOrder.findOne({ fulfillmentCode: code.toUpperCase() })
      .populate("initiatorId", "name")
      .populate("participants.userId", "name")
      .lean();

    if (!group) return res.status(404).json({ success: false, message: "Group order not found" });

    const bestTier = group.discountTiers
      .filter((tier) => group.currentQuantity >= tier.minQty)
      .sort((a, b) => b.discountPct - a.discountPct)[0];

    const nextTier = group.discountTiers
      .filter((tier) => group.currentQuantity < tier.minQty)
      .sort((a, b) => a.minQty - b.minQty)[0];

    res.status(200).json({
      success: true,
      groupOrder: {
        ...group,
        currentBestDiscount: bestTier ? bestTier.discountPct : 0,
        nextTier: nextTier ? { minQty: nextTier.minQty, discountPct: nextTier.discountPct } : null,
        progressPct: Math.min(100, Math.round((group.currentQuantity / group.targetQuantity) * 100)),
      },
    });
  } catch (error) {
    console.error("[getGroupOrderByCode]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const listOpenGroupOrders = async (req, res) => {
  try {
    const { state, page = 1, limit = 20 } = req.query;
    const filter = { status: "OPEN", expiresAt: { $gt: new Date() } };
    if (state) filter.assignedState = state;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      GroupOrder.find(filter)
        .populate("initiatorId", "name")
        .select("-participants")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      GroupOrder.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, orders, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (error) {
    console.error("[listOpenGroupOrders]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyGroupOrders = async (req, res) => {
  try {
    const [initiated, joined] = await Promise.all([
      GroupOrder.find({ initiatorId: req.userId }).sort({ createdAt: -1 }).lean(),
      GroupOrder.find({ "participants.userId": req.userId }).sort({ createdAt: -1 }).lean(),
    ]);

    res.status(200).json({ success: true, initiated, joined });
  } catch (error) {
    console.error("[getMyGroupOrders]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
