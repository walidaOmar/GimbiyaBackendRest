import { Product }       from "../models/product.model.js";
import { Store }         from "../models/store.model.js";
import { getRevenueConfig } from "../utils/revenueCache.js";
import { resolveViewer } from "../utils/viewer.js";
import { listingPrice, productBaseKobo } from "../utils/productPricing.js";
import { tiersForViewer, VIEWER_LABEL, TIER_FOR_BUSINESS } from "../policy/marketVisibility.v1.js";
import { effectiveTier, priceEditWaitHours } from "../policy/entitlements.v1.js";
import { enforceCap } from "../services/subscriptionService.js";

const VALID_STATES = ["Ado bayero mall", "Tafawa balewa refinery", "Sardauna market"];
const FLOORS = ["LEVEL_1", "LEVEL_2"];
const clampInt = (value, min, max, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── GET CATALOG ───────────────────────────────────────────────────────────────
// One shared catalog. The server decides which market tiers the caller may see (utils/viewer.js +
// policy/marketVisibility.v1.js). assignedState is optional: leave it out to browse every market.
export const getCatalog = async (req, res) => {
  try {
    const { assignedState, buildingFloor, categorySlug, category, searchQuery, search, minPriceKobo, maxPriceKobo, sort } = req.query;
    const page = clampInt(req.query.page, 1, 100000, 1);
    const limit = clampInt(req.query.limit, 1, 60, 24);

    if (assignedState && !VALID_STATES.includes(assignedState)) {
      return res.status(400).json({ success: false, message: `assignedState must be one of: ${VALID_STATES.join(", ")}` });
    }

    const { viewerClass } = await resolveViewer(req);
    const allowedTiers = tiersForViewer(viewerClass);
    const filter = { isActive: true, stock: { $gt: 0 }, marketTier: { $in: allowedTiers } };

    // Optional narrowing inside what the viewer is allowed to see (e.g. a manufacturer filtering to wholesale).
    if (req.query.marketTier && allowedTiers.includes(req.query.marketTier)) filter.marketTier = req.query.marketTier;
    if (assignedState) filter.assignedState = assignedState;
    if (buildingFloor && FLOORS.includes(buildingFloor)) filter.buildingFloor = buildingFloor;
    const cat = categorySlug || category;
    if (cat) filter.categorySlug = String(cat);

    const term = String(searchQuery || search || "").trim().slice(0, 80);
    if (term) filter.name = { $regex: escapeRegex(term), $options: "i" };

    const min = parseInt(minPriceKobo, 10);
    const max = parseInt(maxPriceKobo, 10);
    if (Number.isFinite(min) || Number.isFinite(max)) {
      filter.priceKobo = {};
      if (Number.isFinite(min)) filter.priceKobo.$gte = min;
      if (Number.isFinite(max)) filter.priceKobo.$lte = max;
    }

    const sortMap = { price_asc: { priceKobo: 1 }, price_desc: { priceKobo: -1 }, popular: { soldCount: -1 }, newest: { createdAt: -1 } };
    const order = sortMap[sort] || { createdAt: -1 };

    const facetFilter = { isActive: true, stock: { $gt: 0 }, marketTier: { $in: allowedTiers }, ...(assignedState ? { assignedState } : {}) };
    const [products, total, categories] = await Promise.all([
      Product.find(filter)
        .select("name descriptionText priceKobo stock unit categorySlug buildingFloor imageUrls averageRating soldCount assignedState marketTier minimumOrderQuantity bulkPricingTiers wholesaleOnly store merchantId")
        .populate("store", "businessName businessType")
        .sort(order).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
      Product.distinct("categorySlug", facetFilter),
    ]);

    res.status(200).json({
      success: true,
      products: products.map((p) => ({ ...p, sellerName: p.store?.businessName || null, sellerType: p.store?.businessType || null, store: undefined, merchantId: undefined })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      meta: {
        viewerClass,
        view: VIEWER_LABEL[viewerClass],
        tiers: allowedTiers,
        assignedState: assignedState || "ALL",
        categories: categories.sort(),
      },
    });
  } catch (error) {
    console.error("[getCatalog]", error);
    res.status(500).json({ success: false, message: "Could not load the marketplace" });
  }
};

// ── GET SINGLE PRODUCT ────────────────────────────────────────────────────────
export const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("store", "businessName businessType primaryState")
      .lean();
    if (!product || !product.isActive) return res.status(404).json({ success: false, message: "Product not found" });

    const { viewerClass } = await resolveViewer(req);
    const own = req.userId && String(product.merchantId) === String(req.userId);
    if (!own && !tiersForViewer(viewerClass).includes(product.marketTier)) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    const { merchantId, merchant, ...safe } = product; // never expose the merchant's account ids or email
    res.status(200).json({ success: true, product: safe });
  } catch (error) {
    res.status(404).json({ success: false, message: "Product not found" });
  }
};

// ── PUBLISH LISTING (business owner) ──────────────────────────────────────────
export const publishListing = async (req, res) => {
  try {
    const { name, descriptionText, initialStock, categorySlug, imageUrls, minimumOrderQuantity, bulkPricingTiers, unit } = req.body;
    // basePriceKobo is the new field; priceKobo is still accepted from old clients and is treated as the base too.
    const baseKobo = Number(req.body.basePriceKobo ?? req.body.priceKobo);

    const store = await Store.findOne({ businessOwnerId: req.userId, verificationStatus: "VERIFIED" });
    if (!store) return res.status(403).json({ success: false, message: "Your store must be verified before you can list products." });
    if (store.businessType === "service_provider") {
      return res.status(403).json({ success: false, message: "Service providers publish services, not products." });
    }

    if (!name || String(name).trim().length < 3 || !categorySlug || initialStock === undefined) {
      return res.status(400).json({ success: false, message: "name, a base price, initialStock and categorySlug are required" });
    }
    if (!Number.isInteger(baseKobo) || baseKobo < 1) {
      return res.status(400).json({ success: false, message: "The base price must be a positive whole number of kobo" });
    }
    const stock = Number(initialStock);
    if (!Number.isInteger(stock) || stock < 0) return res.status(400).json({ success: false, message: "initialStock must be a whole number" });

    const cap = await enforceCap(store, "products");
    if (!cap.ok) return res.status(403).json({ success: false, code: "PLAN_LIMIT", message: cap.message });

    // Location and tier come from the verified store, never from the request body.
    const floor = FLOORS.includes(req.body.buildingFloor) ? req.body.buildingFloor : "LEVEL_1";
    const marketTier = TIER_FOR_BUSINESS[store.businessType] || "consumer";
    const draft = { assignedState: store.primaryState, buildingFloor: floor, marketTier };
    const { priceKobo, commissionPct } = listingPrice(baseKobo, draft);

    const tiers = Array.isArray(bulkPricingTiers)
      ? bulkPricingTiers.filter((t) => Number.isInteger(t?.minQty) && t.minQty > 1 && Number.isInteger(t?.priceKobo) && t.priceKobo > 0 && t.priceKobo <= baseKobo)
      : [];

    const product = await Product.create({
      name: String(name).trim(), descriptionText: String(descriptionText || "").slice(0, 2000),
      basePriceKobo: baseKobo, priceKobo, commissionPct,
      stock, categorySlug: String(categorySlug), category: String(categorySlug),
      merchantId: req.userId, merchant: req.userId, store: store._id,
      assignedState: store.primaryState, buildingFloor: floor, marketTier,
      imageUrls: Array.isArray(imageUrls) ? imageUrls.slice(0, 8).map(String) : [],
      unit: unit ? String(unit).slice(0, 20) : "piece",
      minimumOrderQuantity: Math.max(1, parseInt(minimumOrderQuantity, 10) || 1),
      wholesaleOnly: marketTier !== "consumer",
      bulkPricingTiers: tiers,
    });

    res.status(201).json({
      success: true,
      message: `"${product.name}" is live in ${store.primaryState}`,
      productId: product._id,
      basePriceKobo: baseKobo, priceKobo, commissionPct,
    });
  } catch (error) {
    console.error("[publishListing]", error);
    res.status(500).json({ success: false, message: "Could not publish the listing" });
  }
};

// ── GET MY LISTINGS ───────────────────────────────────────────────────────────
export const getMyListings = async (req, res) => {
  try {
    const page = clampInt(req.query.page, 1, 100000, 1);
    const limit = clampInt(req.query.limit, 1, 100, 50);
    const filter = { merchantId: req.userId };
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";

    const [rows, total, store] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
      Store.findOne({ businessOwnerId: req.userId }).lean(),
    ]);
    const tier = effectiveTier(store);
    const products = rows.map((p) => ({
      ...p,
      basePriceKobo: productBaseKobo(p),
      priceEditWaitHours: priceEditWaitHours(tier, p.lastPriceEditAt),
    }));
    res.status(200).json({ success: true, products, pagination: { page, limit, total }, tier });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load your listings" });
  }
};

// ── UPDATE PRICE (business owner) ─────────────────────────────────────────────
export const updatePrice = async (req, res) => {
  try {
    const baseKobo = Number(req.body.basePriceKobo ?? req.body.priceKobo);
    if (!Number.isInteger(baseKobo) || baseKobo < 1) {
      return res.status(400).json({ success: false, message: "The base price must be a positive whole number of kobo" });
    }
    const product = await Product.findOne({ _id: req.params.id, merchantId: req.userId });
    if (!product) return res.status(404).json({ success: false, message: "Product not found or you do not own it" });

    const store = await Store.findOne({ businessOwnerId: req.userId }).lean();
    const wait = priceEditWaitHours(effectiveTier(store), product.lastPriceEditAt);
    if (wait > 0) {
      return res.status(429).json({ success: false, code: "PRICE_COOLDOWN", message: `Basic plans can change a price once every 12 hours. Try again in about ${wait} hour(s), or upgrade your plan.` });
    }

    const previousBaseKobo = productBaseKobo(product);
    const { priceKobo, commissionPct } = listingPrice(baseKobo, product);
    product.basePriceKobo = baseKobo;
    product.priceKobo = priceKobo;
    product.commissionPct = commissionPct;
    product.lastPriceEditAt = new Date();
    // Bulk tiers can never be above the new base price.
    product.bulkPricingTiers = (product.bulkPricingTiers || []).filter((t) => t.priceKobo <= baseKobo);
    await product.save();

    res.status(200).json({ success: true, productId: product._id, previousBaseKobo, basePriceKobo: baseKobo, priceKobo, commissionPct });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not update the price" });
  }
};

// ── TOGGLE ACTIVE (business owner) ────────────────────────────────────────────
export const toggleActive = async (req, res) => {
  try {
    if (typeof req.body.isActive !== "boolean") return res.status(400).json({ success: false, message: "isActive must be true or false" });
    const product = await Product.findOneAndUpdate({ _id: req.params.id, merchantId: req.userId }, { isActive: req.body.isActive }, { new: true });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    res.status(200).json({ success: true, isActive: product.isActive });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not update the product" });
  }
};

// ── RESTOCK (business owner) ──────────────────────────────────────────────────
export const restock = async (req, res) => {
  try {
    const add = Number(req.body.addUnits);
    if (!Number.isInteger(add) || add < 1 || add > 100000) return res.status(400).json({ success: false, message: "addUnits must be a whole number from 1 to 100000" });
    const product = await Product.findOneAndUpdate({ _id: req.params.id, merchantId: req.userId }, { $inc: { stock: add } }, { new: true });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    res.status(200).json({ success: true, stock: product.stock });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not restock" });
  }
};

export const getPricingInfo = async (req, res) => {
  const c = getRevenueConfig();
  // For a signed-in merchant, also tell them the exact markup their next listing would get (their node, tier and chosen floor).
  let myRatePct = null;
  if (req.userRole === "business_owner") {
    const store = await Store.findOne({ businessOwnerId: req.userId }).select("primaryState businessType").lean();
    if (store) {
      const floor = FLOORS.includes(req.query.floor) ? req.query.floor : "LEVEL_1";
      myRatePct = listingPrice(100000, { assignedState: store.primaryState, buildingFloor: floor, marketTier: TIER_FOR_BUSINESS[store.businessType] || "consumer" }).commissionPct;
    }
  }
  res.json({ success: true, myRatePct, platformFeePct: c.platformFeePct, deliveryFeeKobo: c.deliveryFeeKobo, nodeCommissionPct: c.nodeCommissionPct, level2CommissionPct: c.level2CommissionPct, wholesaleCommissionPct: c.wholesaleCommissionPct });
};
