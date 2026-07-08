import { Product }       from "../models/product.model.js";
import { InventoryAudit } from "../models/ledger.model.js";

// ── GET CATALOG (public) ──────────────────────────────────────────────────────
export const getCatalog = async (req, res) => {
  try {
    const {
      assignedState, buildingFloor, categorySlug,
      searchQuery, minPriceKobo, maxPriceKobo,
      page = 1, limit = 20,
    } = req.query;

    const VALID_STATES = ["Abuja", "Kano", "Kaduna"];
    if (!assignedState || !VALID_STATES.includes(assignedState)) {
      return res.status(400).json({
        success: false,
        message: `assignedState is required and must be one of: ${VALID_STATES.join(", ")}`,
      });
    }

    const filter = { assignedState, isActive: true };

    if (buildingFloor && ["LEVEL_1", "LEVEL_2"].includes(buildingFloor)) {
      filter.buildingFloor = buildingFloor;
    }
    if (categorySlug)  filter.categorySlug = categorySlug;
    if (searchQuery)   filter.$text = { $search: searchQuery };
    if (minPriceKobo)  filter.priceKobo = { ...filter.priceKobo, $gte: parseInt(minPriceKobo) };
    if (maxPriceKobo)  filter.priceKobo = { ...filter.priceKobo, $lte: parseInt(maxPriceKobo) };

    const skip       = (parseInt(page) - 1) * parseInt(limit);
    const [products, total] = await Promise.all([
      Product.find(filter)
        .select("name priceKobo stock categorySlug buildingFloor imageUrls averageRating soldCount assignedState")
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Product.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      products,
      pagination: {
        page:       parseInt(page),
        limit:      parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("[getCatalog]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET SINGLE PRODUCT (public) ───────────────────────────────────────────────
export const getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("merchantId", "name email")
      .lean();

    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    res.status(200).json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── PUBLISH LISTING (merchant) ────────────────────────────────────────────────
export const publishListing = async (req, res) => {
  try {
    const { name, descriptionText, priceKobo, initialStock, categorySlug, assignedState, buildingFloor, imageUrls } = req.body;

    if (!name || !priceKobo || initialStock === undefined || !categorySlug || !assignedState || !buildingFloor) {
      return res.status(400).json({ success: false, message: "name, priceKobo, initialStock, categorySlug, assignedState, buildingFloor are required" });
    }
    if (!Number.isInteger(Number(priceKobo)) || Number(priceKobo) < 1) {
      return res.status(400).json({ success: false, message: "priceKobo must be a positive integer (value in Kobo)" });
    }

    // State boundary: merchant can only list in their own state
    if (req.userRole === "business_owner" && assignedState !== req.userState) {
      return res.status(403).json({
        success: false,
        message: `You can only list products in your assigned state: ${req.userState}`,
      });
    }

    const product = await Product.create({
      name, descriptionText, priceKobo: Number(priceKobo),
      stock: Number(initialStock), categorySlug,
      merchantId: req.userId, assignedState, buildingFloor,
      imageUrls: imageUrls || [],
    });

    res.status(201).json({
      success:   true,
      message:   `Listing "${product.name}" published to ${assignedState} ${buildingFloor}`,
      productId: product._id,
    });
  } catch (error) {
    console.error("[publishListing]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET MY LISTINGS (merchant) ────────────────────────────────────────────────
export const getMyListings = async (req, res) => {
  try {
    const { page = 1, limit = 20, isActive } = req.query;
    const filter = { merchantId: req.userId };
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Product.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, products, pagination: { page: parseInt(page), total } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── UPDATE PRICE (merchant) ────────────────────────────────────────────────────
export const updatePrice = async (req, res) => {
  try {
    const { priceKobo } = req.body;
    if (!Number.isInteger(Number(priceKobo)) || Number(priceKobo) < 1) {
      return res.status(400).json({ success: false, message: "priceKobo must be a positive integer" });
    }

    const product = await Product.findOne({ _id: req.params.id, merchantId: req.userId });
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found or you do not own it" });
    }

    const previousPriceKobo = product.priceKobo;
    product.priceKobo = Number(priceKobo);
    await product.save();

    res.status(200).json({
      success: true, productId: product._id,
      previousPriceKobo, newPriceKobo: Number(priceKobo),
      previousPriceNaira: previousPriceKobo / 100,
      newPriceNaira:      Number(priceKobo) / 100,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── TOGGLE ACTIVE (merchant) ──────────────────────────────────────────────────
export const toggleActive = async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, merchantId: req.userId },
      { isActive: req.body.isActive },
      { new: true }
    );
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    res.status(200).json({ success: true, isActive: product.isActive });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
