import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../models/user.model.js";
import { Store } from "../models/store.model.js";
import { Product } from "../models/product.model.js";
import { PropertyListing } from "../models/propertyListing.model.js";
import { PropertyInquiry } from "../models/propertyInquiry.model.js";

dotenv.config();
const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/gimbiya";
const DEFAULT_STATE = "Ado bayero mall";

const PRODUCT_IMAGES = [
  "https://images.unsplash.com/photo-1610945265078-3858a0828671?w=400",
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400",
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
  "https://images.unsplash.com/photo-1572569028738-411a197b83cd?w=400",
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400",
  "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400",
];

const PROPERTY_IMAGES = [
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800",
  "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800",
];

const requiredStoreFields = {
  nin: "TEST-NIN-0001",
  cacNumber: "TEST-CAC-0001",
  tinNumber: "TEST-TIN-0001",
  businessAddress: "15 Bompai Road, Kano",
  homeAddress: "15 Bompai Road, Kano",
};

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    let propAdmin = await User.findOne({ email: "propadmin@gimbiya.com" });
    let dealInitiator = await User.findOne({ email: "deals@gimbiya.com" });
    let merchant = await User.findOne({ email: "merchant@gimbiya.com" });
    const buyer = await User.findOne({ email: "buyer@gimbiya.com" });
    const manager = await User.findOne({ email: "manager@gimbiya.com" });
    const support = await User.findOne({ email: "support@gimbiya.com" });

    if (!propAdmin && manager) {
      manager.role = "property_admin";
      manager.name = "Property Admin";
      await manager.save();
      propAdmin = manager;
    }
    if (!dealInitiator && support) {
      support.role = "deal_initiator";
      support.name = "Deal Initiator";
      support.onboardedBy = propAdmin?._id || null;
      await support.save();
      dealInitiator = support;
    }
    if (!merchant) {
      merchant = await User.findOne({ role: "business_owner" });
      if (!merchant) merchant = propAdmin;
    }

    if (!propAdmin) throw new Error("No property admin found");
    if (!merchant) throw new Error("No merchant found");

    await Product.deleteMany({ name: { $regex: /^\[TEST\]/ } });
    await PropertyListing.deleteMany({ title: { $regex: /^\[TEST\]/ } });
    await PropertyInquiry.deleteMany({ buyerEmail: { $regex: /@test\.com$/ } });
    await Store.deleteMany({ businessEmail: { $regex: /@test\.com$/ } });

    const propStore = await Store.create({
      ...requiredStoreFields,
      businessName: "[TEST] Metro Properties Ltd",
      businessEmail: "metro@test.com",
      businessPhone: "+2348111111111",
      commerceSegment: "service_provider",
      serviceCategory: "property_management",
      businessOwnerId: propAdmin._id,
      onboardedBy: propAdmin._id,
      primaryState: propAdmin.assignedState || DEFAULT_STATE,
      verificationStatus: "VERIFIED",
    });

    const merchStore = await Store.create({
      ...requiredStoreFields,
      businessName: "[TEST] Kano Electronics",
      businessEmail: "electronics@test.com",
      businessPhone: "+2348222222222",
      commerceSegment: "wholesaler",
      businessAddress: "Shop 42, Level 1, Ado Bayero Mall",
      homeAddress: "Shop 42, Level 1, Ado Bayero Mall",
      businessOwnerId: merchant._id,
      onboardedBy: merchant._id,
      primaryState: merchant.assignedState || DEFAULT_STATE,
      verificationStatus: "VERIFIED",
    });

    const products = await Product.insertMany([
      { name: "[TEST] Samsung Galaxy S25 Ultra", descriptionText: "Latest flagship smartphone with 200MP camera and AI features.", priceKobo: 125000000, stock: 45, categorySlug: "electronics", assignedState: merchant.assignedState || DEFAULT_STATE, buildingFloor: "LEVEL_1", imageUrls: [PRODUCT_IMAGES[0]], merchantId: merchant._id },
      { name: "[TEST] Apple Watch Series 10", descriptionText: "Advanced health monitoring, GPS, always-on Retina display.", priceKobo: 65000000, stock: 18, categorySlug: "electronics", assignedState: merchant.assignedState || DEFAULT_STATE, buildingFloor: "LEVEL_1", imageUrls: [PRODUCT_IMAGES[1]], merchantId: merchant._id },
      { name: "[TEST] Sony WH-1000XM5 Headphones", descriptionText: "Industry-leading noise cancellation, 30-hour battery.", priceKobo: 38000000, stock: 8, categorySlug: "electronics", assignedState: merchant.assignedState || DEFAULT_STATE, buildingFloor: "LEVEL_2", imageUrls: [PRODUCT_IMAGES[2]], merchantId: merchant._id },
      { name: "[TEST] Canon EOS R6 Camera", descriptionText: "Full-frame mirrorless camera with 20MP sensor, 4K video.", priceKobo: 210000000, stock: 5, categorySlug: "electronics", assignedState: merchant.assignedState || DEFAULT_STATE, buildingFloor: "LEVEL_1", imageUrls: [PRODUCT_IMAGES[3]], merchantId: merchant._id },
      { name: "[TEST] Nike Air Jordan 1 Retro", descriptionText: "Iconic high-top sneakers in Chicago colorway.", priceKobo: 18500000, stock: 12, categorySlug: "fashion", assignedState: merchant.assignedState || DEFAULT_STATE, buildingFloor: "LEVEL_2", imageUrls: [PRODUCT_IMAGES[4]], merchantId: merchant._id },
      { name: "[TEST] Polaroid Instant Camera", descriptionText: "Vintage-style instant camera with autofocus.", priceKobo: 9500000, stock: 30, categorySlug: "electronics", assignedState: merchant.assignedState || DEFAULT_STATE, buildingFloor: "LEVEL_1", imageUrls: [PRODUCT_IMAGES[5]], merchantId: merchant._id },
    ]);

    const properties = await PropertyListing.insertMany([
      { portfolioId: propStore._id, propertyAdminId: propAdmin._id, assignedDealInitiatorId: dealInitiator?._id || null, title: "[TEST] Luxury 4 Bedroom Duplex in Bompai", description: "Spacious 4-bedroom duplex with swimming pool, private gym, and 24/7 armed security.", propertyType: "residential", listingType: "sale", address: "25 Bompai Road", city: "Kano", state: "Kano", coordinates: { lat: 12.0022, lng: 8.592 }, priceKobo: 12500000000, priceNegotiable: true, imageUrls: [PROPERTY_IMAGES[0], PROPERTY_IMAGES[1]], bedrooms: 4, bathrooms: 5, squareMeters: 450, parkingSpaces: 3, amenities: ["pool", "gym", "security", "garden", "air conditioning", "generator"], status: "active", verificationStatus: "verified", verificationNote: "Verified by CEO", viewCount: 42, inquiryCount: 1, featured: true },
      { portfolioId: propStore._id, propertyAdminId: propAdmin._id, title: "[TEST] Modern 3 Bedroom Apartment in Sabon Gari", description: "Newly built apartment complex with elevator access, backup power.", propertyType: "residential", listingType: "rent", address: "12 Bello Road", city: "Kano", state: "Kano", coordinates: { lat: 12.0156, lng: 8.5256 }, priceKobo: 250000000, bedrooms: 3, bathrooms: 3, squareMeters: 180, parkingSpaces: 1, amenities: ["security", "generator", "elevator"], status: "active", verificationStatus: "verified", viewCount: 18, featured: false },
      { portfolioId: propStore._id, propertyAdminId: propAdmin._id, title: "[TEST] Commercial Plaza in City Centre", description: "Prime commercial property with 12 office suites, conference facilities.", propertyType: "commercial", listingType: "lease", address: "5 Murtala Mohammed Way", city: "Kano", state: "Kano", coordinates: { lat: 12.0089, lng: 8.5345 }, priceKobo: 500000000, priceNegotiable: true, bathrooms: 8, squareMeters: 1200, parkingSpaces: 25, amenities: ["security", "generator", "elevator", "conference room", "kitchen"], status: "active", verificationStatus: "verified", viewCount: 67, inquiryCount: 2, featured: true },
      { portfolioId: propStore._id, propertyAdminId: propAdmin._id, title: "[TEST] 2 Hectare Industrial Land in Bichi", description: "Flat, fenced industrial land with road access and nearby power substation.", propertyType: "land", listingType: "sale", address: "Bichi Expressway", city: "Bichi", state: "Kano", coordinates: { lat: 12.2334, lng: 8.2456 }, priceKobo: 3500000000, priceNegotiable: true, squareMeters: 20000, amenities: ["fenced", "road access", "power nearby"], status: "active", verificationStatus: "verified", viewCount: 12, featured: false },
    ]);

    if (buyer && properties[0]) {
      await PropertyInquiry.create({ propertyId: properties[0]._id, portfolioId: propStore._id, buyerId: buyer._id, propertyAdminId: propAdmin._id, dealInitiatorId: dealInitiator?._id || null, buyerName: buyer.name || "Test Buyer", buyerEmail: buyer.email, buyerPhone: buyer.phone || "+2348000000000", buyerBudgetKobo: 12000000000, buyerMessage: "I am very interested in this property. Can we schedule a viewing this weekend?", status: "new", timeline: [{ status: "new", note: "Buyer submitted inquiry via marketplace", createdBy: buyer._id }] });
    }

    console.log("SEED COMPLETE!");
    console.log(`Products: ${products.length}, Properties: ${properties.length}`);
  } catch (error) {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seed();
