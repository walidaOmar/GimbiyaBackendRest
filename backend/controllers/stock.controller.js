import { Product }       from "../models/product.model.js";
import { InventoryAudit } from "../models/ledger.model.js";
import { notifyUser }     from "../utils/sseService.js";

const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD || "10", 10);

// ── GET WAREHOUSE MANIFEST ────────────────────────────────────────────────────
export const getManifest = async (req, res) => {
  try {
    const { lowStockOnly, page = 1, limit = 50 } = req.query;

    // State boundary: non-global users see only their state
    const stateFilter = req.userState === "Global"
      ? {}
      : { assignedState: req.userState };

    const filter = { ...stateFilter, isActive: true };
    if (lowStockOnly === "true") filter.stock = { $lte: LOW_STOCK_THRESHOLD };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate("merchantId", "name email")
        .sort({ stock: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Product.countDocuments(filter),
    ]);

    const manifest = products.map((p) => ({
      ...p,
      isLowStock:  p.stock <= LOW_STOCK_THRESHOLD,
      stockStatus: p.stock === 0 ? "OUT_OF_STOCK" : p.stock <= LOW_STOCK_THRESHOLD ? "LOW" : "OK",
    }));

    res.status(200).json({ success: true, manifest, pagination: { page: parseInt(page), total }, lowStockThreshold: LOW_STOCK_THRESHOLD });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── ADJUST INVENTORY — ATOMIC $inc ────────────────────────────────────────────
// MANDATE: ALWAYS use $inc. NEVER product.stock = x.
export const adjustStock = async (req, res) => {
  const { productId, deltaCount, reasonCode, noteText } = req.body;

  try {
    if (!productId || deltaCount === undefined || !reasonCode) {
      return res.status(400).json({ success: false, message: "productId, deltaCount, and reasonCode are required" });
    }
    if (!Number.isInteger(Number(deltaCount)) || Number(deltaCount) === 0) {
      return res.status(400).json({ success: false, message: "deltaCount must be a non-zero integer" });
    }

    const VALID_REASONS = ["AUDIT", "DAMAGED", "RECOUNT", "INBOUND", "RETURN"];
    if (!VALID_REASONS.includes(reasonCode)) {
      return res.status(400).json({ success: false, message: `reasonCode must be one of: ${VALID_REASONS.join(", ")}` });
    }

    // Fetch current state for audit snapshot
    const stateFilter = req.userState === "Global" ? {} : { assignedState: req.userState };
    const productBefore = await Product.findOne({ _id: productId, ...stateFilter }).lean();
    if (!productBefore) {
      return res.status(404).json({ success: false, message: "Product not found in your region" });
    }

    const delta = Number(deltaCount);

    // Build atomic update with $gte guard on decrements
    const atomicFilter = { _id: productId };
    if (delta < 0) atomicFilter.stock = { $gte: Math.abs(delta) };

    const updated = await Product.findOneAndUpdate(
      atomicFilter,
      { $inc: { stock: delta } },
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: `Cannot reduce stock below zero. Current: ${productBefore.stock}, requested reduction: ${Math.abs(delta)}`,
      });
    }

    // Write append-only audit log
    await InventoryAudit.create({
      productId,
      actorId:     req.userId,
      deltaCount:  delta,
      reasonCode,
      stockBefore: productBefore.stock,
      stockAfter:  updated.stock,
      noteText:    noteText || "",
      orderId:     null,
    });

    // Fire SSE low-stock alert
    if (updated.stock <= LOW_STOCK_THRESHOLD) {
      notifyUser(updated.merchantId.toString(), "inventory:low_stock", {
        productId:   updated._id, productName: updated.name,
        currentQty:  updated.stock, threshold: LOW_STOCK_THRESHOLD,
      });
    }

    res.status(200).json({
      success:    true,
      productId:  updated._id,
      productName: updated.name,
      stockBefore: productBefore.stock,
      stockAfter:  updated.stock,
      delta,
      reasonCode,
      isLowStock:  updated.stock <= LOW_STOCK_THRESHOLD,
    });
  } catch (error) {
    console.error("[adjustStock]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET AUDIT LOG ─────────────────────────────────────────────────────────────
export const getAuditLog = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const entries = await InventoryAudit.find({ productId: req.params.productId })
      .populate("actorId", "name role")
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();
    res.status(200).json({ success: true, entries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── PROCESS INBOUND MANIFEST ──────────────────────────────────────────────────
export const processInbound = async (req, res) => {
  const { items, invoiceRef } = req.body;
  try {
    if (!items?.length) {
      return res.status(400).json({ success: false, message: "items array is required" });
    }
    const results = [];
    for (const item of items) {
      const before  = await Product.findById(item.productId).lean();
      if (!before) continue;
      const updated = await Product.findByIdAndUpdate(
        item.productId, { $inc: { stock: item.quantity } }, { new: true }
      );
      await InventoryAudit.create({
        productId: item.productId, actorId: req.userId,
        deltaCount: item.quantity, reasonCode: "INBOUND",
        stockBefore: before.stock, stockAfter: updated.stock,
        noteText: `Inbound from supplier. Ref: ${invoiceRef || "N/A"}`,
        orderId: null,
      });
      results.push({ productId: item.productId, added: item.quantity, newStock: updated.stock });
    }
    res.status(200).json({ success: true, processedItems: results.length, results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
