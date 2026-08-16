import mongoose from "mongoose";
import { PropertyListing } from "../models/propertyListing.model.js";
import { PropertyInquiry } from "../models/propertyInquiry.model.js";
import { User } from "../models/user.model.js";
import { Store } from "../models/store.model.js";

// PUBLIC: Search Properties
export const getProperties = async (req, res) => {
  try {
    const {
      propertyType, listingType, state, city,
      minPrice, maxPrice, featured,
      page = 1, limit = 20, search, sortBy = "createdAt", sortOrder = "desc",
    } = req.query;

    const filter = { status: "active", verificationStatus: "verified" };
    if (propertyType) filter.propertyType = propertyType;
    if (listingType) filter.listingType = listingType;
    if (state) filter.state = { $regex: state, $options: "i" };
    if (city) filter.city = { $regex: city, $options: "i" };
    if (featured === "true") filter.featured = true;
    if (minPrice || maxPrice) {
      filter.priceKobo = {};
      if (minPrice) filter.priceKobo.$gte = parseInt(minPrice, 10);
      if (maxPrice) filter.priceKobo.$lte = parseInt(maxPrice, 10);
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const [properties, total] = await Promise.all([
      PropertyListing.find(filter)
        .populate("propertyAdminId", "name email phone")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      PropertyListing.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      properties,
      pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total },
    });
  } catch (error) {
    console.error("[getProperties]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUBLIC: Single Property
export const getPropertyById = async (req, res) => {
  try {
    const property = await PropertyListing.findById(req.params.id)
      .populate("propertyAdminId", "name email phone")
      .populate("assignedDealInitiatorId", "name email phone")
      .lean();

    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }
    PropertyListing.updateOne({ _id: req.params.id }, { $inc: { viewCount: 1 } }).catch(() => {});
    res.status(200).json({ success: true, property });
  } catch (error) {
    console.error("[getPropertyById]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PROPERTY ADMIN: Create
export const createProperty = async (req, res) => {
  try {
    const { title, description, propertyType, listingType, address, city, state, coordinates, priceKobo, priceNegotiable, imageUrls, documentUrls, bedrooms, bathrooms, squareMeters, parkingSpaces, amenities, portfolioId } = req.body;
    if (!title || !propertyType || !listingType || !address || !city || !state || !priceKobo) {
      return res.status(400).json({ success: false, message: "Required fields missing" });
    }
    const store = await Store.findOne({
      _id: portfolioId,
      businessOwnerId: req.userId,
      commerceSegment: "service_provider",
    }).lean();
    if (!store) {
      return res.status(403).json({ success: false, message: "Invalid portfolio" });
    }
    const property = await PropertyListing.create({
      portfolioId, propertyAdminId: req.userId,
      title, description, propertyType, listingType, address, city, state, coordinates,
      priceKobo: parseInt(priceKobo, 10), priceNegotiable: !!priceNegotiable,
      imageUrls: imageUrls || [], documentUrls: documentUrls || [],
      bedrooms, bathrooms, squareMeters, parkingSpaces, amenities: amenities || [],
    });
    res.status(201).json({ success: true, property });
  } catch (error) {
    console.error("[createProperty]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PROPERTY ADMIN: Update
export const updateProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    delete updates.propertyAdminId; delete updates.portfolioId; delete updates.viewCount; delete updates.inquiryCount;
    if (updates.priceKobo) updates.priceKobo = parseInt(updates.priceKobo, 10);
    const property = await PropertyListing.findOneAndUpdate(
      { _id: id, propertyAdminId: req.userId }, updates, { new: true }
    ).lean();
    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found or not owned by you" });
    }
    res.status(200).json({ success: true, property });
  } catch (error) {
    console.error("[updateProperty]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PROPERTY ADMIN: Delete
export const deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const property = await PropertyListing.findOneAndDelete({ _id: id, propertyAdminId: req.userId }).lean();
    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found or not owned by you" });
    }
    await PropertyInquiry.deleteMany({ propertyId: id });
    res.status(200).json({ success: true, message: "Property deleted" });
  } catch (error) {
    console.error("[deleteProperty]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PROPERTY ADMIN: My Listings
export const getMyListings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = { propertyAdminId: req.userId };
    if (status) filter.status = status;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [listings, total] = await Promise.all([
      PropertyListing.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      PropertyListing.countDocuments(filter),
    ]);
    res.status(200).json({ success: true, listings, pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total } });
  } catch (error) {
    console.error("[getMyListings]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PROPERTY ADMIN: Dashboard
export const getPropertyAdminDashboard = async (req, res) => {
  try {
    const [listings, inquiries, staff, portfolio] = await Promise.all([
      PropertyListing.find({ propertyAdminId: req.userId }).lean(),
      PropertyInquiry.find({ propertyAdminId: req.userId })
        .populate("buyerId", "name email phone")
        .populate("propertyId", "title imageUrls")
        .sort({ createdAt: -1 }).limit(20).lean(),
      User.find({ onboardedBy: req.userId, role: "deal_initiator" })
        .select("name email phone isActive createdAt").lean(),
      Store.findOne({ businessOwnerId: req.userId }).lean(),
    ]);
    const stats = {
      totalListings: listings.length,
      activeListings: listings.filter((l) => l.status === "active").length,
      soldListings: listings.filter((l) => l.status === "sold").length,
      totalInquiries: inquiries.length,
      newInquiries: inquiries.filter((i) => i.status === "new").length,
      closedDeals: inquiries.filter((i) => i.status === "closed").length,
      totalStaff: staff.length,
    };
    res.status(200).json({ success: true, stats, listings, inquiries, staff, portfolio });
  } catch (error) {
    console.error("[getPropertyAdminDashboard]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// BUYER: Create Inquiry
export const createInquiry = async (req, res) => {
  try {
    const { id: propertyId } = req.params;
    const { buyerBudgetKobo, buyerMessage, buyerPhone } = req.body;
    const property = await PropertyListing.findById(propertyId).lean();
    if (!property) return res.status(404).json({ success: false, message: "Property not found" });
    if (property.status !== "active") return res.status(400).json({ success: false, message: "Property is not available" });
    const inquiry = await PropertyInquiry.create({
      propertyId, portfolioId: property.portfolioId, buyerId: req.userId,
      propertyAdminId: property.propertyAdminId, dealInitiatorId: property.assignedDealInitiatorId,
      buyerName: req.user.name, buyerEmail: req.user.email,
      buyerPhone: buyerPhone || req.user.phone || "",
      buyerBudgetKobo: buyerBudgetKobo ? parseInt(buyerBudgetKobo, 10) : null,
      buyerMessage: buyerMessage || "",
      timeline: [{ status: "new", note: "Buyer submitted inquiry", createdBy: req.userId }],
    });
    PropertyListing.updateOne({ _id: propertyId }, { $inc: { inquiryCount: 1 } }).catch(() => {});
    res.status(201).json({ success: true, inquiry });
  } catch (error) {
    console.error("[createInquiry]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PROPERTY ADMIN: Assign Inquiry
export const assignInquiry = async (req, res) => {
  try {
    const { id: inquiryId } = req.params;
    const { dealInitiatorId } = req.body;
    const inquiry = await PropertyInquiry.findOne({ _id: inquiryId, propertyAdminId: req.userId });
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });
    const di = await User.findOne({ _id: dealInitiatorId, onboardedBy: req.userId, role: "deal_initiator", isActive: true }).lean();
    if (!di) return res.status(400).json({ success: false, message: "Invalid deal initiator" });
    inquiry.dealInitiatorId = dealInitiatorId;
    inquiry.status = "contacted";
    inquiry.timeline.push({ status: "contacted", note: `Assigned to deal initiator: ${di.name}`, createdBy: req.userId });
    await inquiry.save();
    res.status(200).json({ success: true, inquiry });
  } catch (error) {
    console.error("[assignInquiry]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// DEAL INITIATOR: Dashboard
export const getDealInitiatorDashboard = async (req, res) => {
  try {
    const [inquiries, performance] = await Promise.all([
      PropertyInquiry.find({ dealInitiatorId: req.userId })
        .populate("propertyId", "title imageUrls address priceKobo")
        .populate("buyerId", "name email phone")
        .sort({ createdAt: -1 }).lean(),
      PropertyInquiry.aggregate([
        { $match: { dealInitiatorId: new mongoose.Types.ObjectId(req.userId) } },
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, deals: { $sum: 1 }, closed: { $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] } }, earnings: { $sum: { $ifNull: ["$commissionKobo", 0] } } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    const stats = {
      totalAssigned: inquiries.length,
      activeDeals: inquiries.filter((i) => !["closed", "lost"].includes(i.status)).length,
      closedDeals: inquiries.filter((i) => i.status === "closed").length,
      totalEarnings: inquiries.reduce((sum, i) => sum + (i.commissionKobo || 0), 0),
      successRate: inquiries.length ? Math.round((inquiries.filter((i) => i.status === "closed").length / inquiries.length) * 100) : 0,
    };
    res.status(200).json({ success: true, stats, inquiries, performance });
  } catch (error) {
    console.error("[getDealInitiatorDashboard]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// DEAL INITIATOR / ADMIN: Update Inquiry Status
export const updateInquiryStatus = async (req, res) => {
  try {
    const { id: inquiryId } = req.params;
    const { status, note, viewingDate, agreedPriceKobo, commissionKobo } = req.body;
    const filter = { _id: inquiryId };
    if (req.userRole === "deal_initiator") filter.dealInitiatorId = req.userId;
    else if (req.userRole === "property_admin") filter.propertyAdminId = req.userId;
    const inquiry = await PropertyInquiry.findOne(filter);
    if (!inquiry) return res.status(404).json({ success: false, message: "Inquiry not found" });
    if (status) inquiry.status = status;
    if (viewingDate) inquiry.viewingDate = new Date(viewingDate);
    if (agreedPriceKobo) inquiry.agreedPriceKobo = parseInt(agreedPriceKobo, 10);
    if (commissionKobo) inquiry.commissionKobo = parseInt(commissionKobo, 10);
    if (status === "closed") { inquiry.closedAt = new Date(); inquiry.closedBy = req.userId; }
    inquiry.timeline.push({ status: status || inquiry.status, note: note || `Status updated to ${status || inquiry.status}`, createdBy: req.userId });
    await inquiry.save();
    res.status(200).json({ success: true, inquiry });
  } catch (error) {
    console.error("[updateInquiryStatus]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
