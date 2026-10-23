/**
 * Pilot seed: approved test users, stores, products and services for every role in every market,
 * so each workflow (browse, buy, pay, deliver, release, withdraw, invite, KPI) can be tried end to end.
 *
 *   1) node scripts/seedCommercialNodes.js                      (the three markets)
 *   2) SEED_ALLOW=yes SEED_PASSWORD='a-long-password' node scripts/seedPilot.js
 *   Remove everything the seed made:  SEED_ALLOW=yes node scripts/seedPilot.js --remove
 *
 * Safety: does nothing unless SEED_ALLOW=yes. Test emails end in @pilot.gimbiya.test (not a real domain,
 * so nobody can claim them through "forgot password"). No default password exists: SEED_PASSWORD must be
 * set and at least 12 characters. Prices use the CURRENT HQ Revenue Architecture (or the defaults).
 */
import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import dotenv from "dotenv";
import { User } from "../models/user.model.js";
import { Store } from "../models/store.model.js";
import { Branch } from "../models/branch.model.js";
import { Business } from "../models/business.model.js";
import { Product } from "../models/product.model.js";
import { ServiceOffering } from "../models/serviceOffering.model.js";
import { AffiliateLink } from "../models/cart.model.js";
import { Order } from "../models/order.model.js";
import { FulfillmentGroup } from "../models/fulfillmentGroup.model.js";
import { WalletEntry } from "../models/walletEntry.model.js";
import { Withdrawal } from "../models/withdrawal.model.js";
import { RevenueConfig } from "../models/revenueConfig.model.js";
import { REVENUE_DEFAULTS } from "../utils/revenueCache.js";
import { resolveRate, listedPriceKobo } from "../policy/pricing.v1.js";
import { TIER_FOR_BUSINESS } from "../policy/marketVisibility.v1.js";

dotenv.config();

const DOMAIN = "pilot.gimbiya.test";
const SOURCE = "pilot-seed";
const REMOVE = process.argv.includes("--remove");

if (process.env.SEED_ALLOW !== "yes") {
  console.error("Refusing to run: set SEED_ALLOW=yes to confirm you want to touch this database.");
  process.exit(1);
}
if (!REMOVE && (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 12)) {
  console.error("Set SEED_PASSWORD to at least 12 characters (it becomes every test user's password).");
  process.exit(1);
}

const email = (local) => `${local}@${DOMAIN}`;
const naira = (n) => n * 100;
const yearAhead = () => new Date(Date.now() + 365 * 86400000);

// ── Markets, stores, products, services ────────────────────────────────────────────────────
// Product: [name, base price in naira, stock, unit, category, minimum order, bulk tiers [[minQty, base naira]]]
// Service: [type, category, base naira, pricing model, hours, area]
const NODES = [
  {
    key: "Ado bayero mall", city: "Kano", code: "kano", floor: "LEVEL_1",
    stores: [
      { id: "a", name: "Kano Premium Retail", type: "retailer", plan: "PRO",
        products: [
          ["Leather Handbag", 45000, 40, "piece", "fashion"], ["Designer Sunglasses", 25000, 60, "piece", "fashion"],
          ["Perfume Gift Set", 18000, 50, "set", "household"], ["Ankara Two-Piece Set", 22000, 35, "set", "fashion"],
          ["Wireless Earbuds", 15000, 80, "piece", "electronics"], ["Smart Watch", 38000, 30, "piece", "electronics"],
        ] },
      { id: "b", name: "Kano Dining and Household", type: "retailer", plan: "BASIC",
        products: [
          ["Jollof Party Tray (serves 10)", 15000, 40, "tray", "groceries"], ["Suya Platter", 8000, 60, "platter", "groceries"],
          ["Fresh Juice 6-Pack", 4500, 120, "pack", "groceries"], ["Non-stick Pot Set", 28000, 25, "set", "household"],
          ["Bedsheet Set (Queen)", 16000, 45, "set", "household"],
        ] },
      { id: "c", name: "Kano Textile Wholesale", type: "wholesaler", plan: "BASIC",
        products: [
          ["Ankara Fabric Bale (20 pieces)", 180000, 40, "bale", "fashion", 2, [[5, 170000]]],
          ["Lace Fabric Roll (50 yards)", 250000, 30, "roll", "fashion", 1],
          ["School Uniform Fabric (100 yards)", 90000, 50, "roll", "fashion", 2, [[10, 85000]]],
          ["Men's Cap Carton (100 pieces)", 120000, 40, "carton", "fashion", 1],
          ["Shoe Carton (24 pairs)", 160000, 25, "carton", "fashion", 1],
        ] },
      { id: "d", name: "Kano Tailoring and Repairs", type: "service_provider", plan: "PRO",
        services: [
          ["Custom tailoring", "tailoring", 15000, "FIXED", 72, "Kano city"], ["Uniform alterations", "tailoring", 3500, "PER_UNIT", 24, "Kano city"],
          ["Phone screen repair", "repair", 12000, "FIXED", 3, "Kano city"], ["Key cutting", "repair", 1500, "PER_UNIT", 1, "Kano city"],
        ] },
    ],
  },
  {
    key: "Tafawa balewa refinery", city: "Abuja", code: "abuja", floor: "LEVEL_2",
    stores: [
      { id: "a", name: "Abuja Energy Retail", type: "retailer", plan: "BASIC",
        products: [
          ["Solar Lantern", 12000, 80, "piece", "electronics"], ["Power Bank 20000mAh", 15000, 90, "piece", "electronics"],
          ["Gas Cylinder 12.5kg (refill)", 22000, 50, "piece", "household"], ["Rechargeable Fan", 32000, 30, "piece", "household"],
          ["Inverter Battery 12V", 145000, 15, "piece", "industrial"],
        ] },
      { id: "b", name: "Abuja Heavy Processing", type: "manufacturer", plan: "BASIC",
        products: [
          ["Steel Rod Bundle (12mm)", 95000, 60, "bundle", "building", 5, [[20, 90000]]],
          ["Cement Pallet (50 bags)", 78000, 80, "pallet", "building", 2, [[10, 74000]]],
          ["Industrial Pipe Set (PVC 6in)", 64000, 40, "set", "industrial", 3],
          ["Roofing Sheets (bundle of 20)", 140000, 35, "bundle", "building", 2],
          ["Packaging Film Roll (industrial)", 52000, 70, "roll", "industrial", 5],
        ] },
      { id: "c", name: "Abuja Industrial Supply", type: "wholesaler", plan: "BASIC",
        products: [
          ["Safety Boots Carton (12 pairs)", 96000, 30, "carton", "industrial", 1], ["Hard Hat Carton (50)", 60000, 25, "carton", "industrial", 1],
          ["Electrical Cable 100m Drum", 85000, 40, "drum", "building", 2, [[10, 80000]]],
          ["Paint Bucket Carton (4 x 20L)", 110000, 35, "carton", "building", 2], ["Welding Electrodes Carton", 48000, 60, "carton", "industrial", 3],
        ] },
      { id: "d", name: "Abuja Logistics Hub", type: "service_provider", plan: "LEGENDARY",
        services: [
          ["Local parcel delivery", "logistics", 3000, "FIXED", 4, "Abuja"], ["Same-day delivery", "logistics", 6000, "FIXED", 6, "Abuja"],
          ["Bulk goods transport", "logistics", 85000, "FIXED", 24, "Abuja and FCT"], ["Market-to-store restocking", "logistics", 25000, "FIXED", 12, "Abuja"],
          ["Equipment maintenance", "technical", 18000, "HOURLY", 4, "Abuja"],
        ] },
    ],
  },
  {
    key: "Sardauna market", city: "Kaduna", code: "kaduna", floor: "LEVEL_1",
    stores: [
      { id: "a", name: "Kaduna Traditional Retail", type: "retailer", plan: "BASIC",
        products: [
          ["Ankara Fabric 6 yards", 12000, 100, "piece", "fashion"], ["Shea Butter 1kg", 6500, 90, "tub", "groceries"],
          ["Hand-woven Cap", 4000, 150, "piece", "fashion"], ["Kuli-kuli Pack (500g)", 1800, 200, "pack", "groceries"], ["Dried Hibiscus (zobo) 1kg", 3200, 120, "bag", "groceries"],
        ] },
      { id: "b", name: "Kaduna Consumer Goods", type: "retailer", plan: "BASIC",
        products: [
          ["Rice 10kg Bag", 17500, 90, "bag", "groceries"], ["Vegetable Oil 5L", 11500, 100, "bottle", "groceries"],
          ["Detergent 2kg", 3800, 150, "pack", "household"], ["Exercise Books (pack of 10)", 2500, 200, "pack", "office"], ["Plastic Storage Bins (set of 3)", 9000, 70, "set", "household"],
        ] },
      { id: "c", name: "Kaduna Foods Manufacturing", type: "manufacturer", plan: "BASIC",
        products: [
          ["Packaged Rice 50kg (factory)", 58000, 120, "bag", "groceries", 5, [[20, 55000]]],
          ["Cooking Oil 25L Drum (factory)", 48000, 90, "drum", "groceries", 4, [[20, 45000]]],
          ["Flour 50kg Sack (mill)", 42000, 100, "sack", "groceries", 5], ["Fertilizer NPK 50kg", 36000, 150, "bag", "agriculture", 10, [[50, 34000]]],
          ["Animal Feed 25kg", 14500, 200, "bag", "agriculture", 10],
        ] },
      { id: "d", name: "Kaduna Grain Wholesale", type: "wholesaler", plan: "LEGENDARY",
        products: [
          ["Rice 50kg Bag", 62000, 200, "bag", "groceries", 5, [[20, 59000]]], ["Maize 100kg Bag", 54000, 180, "bag", "agriculture", 5],
          ["Vegetable Oil 25L", 51000, 120, "drum", "groceries", 4], ["Beans 100kg Bag", 98000, 100, "bag", "groceries", 3],
          ["Sugar 50kg Bag", 72000, 140, "bag", "groceries", 5, [[20, 69000]]], ["Millet 100kg Bag", 61000, 130, "bag", "agriculture", 5],
        ] },
      { id: "e", name: "Kaduna Print and Branding", type: "service_provider", plan: "BASIC",
        services: [
          ["Business branding and logo", "creative", 35000, "FIXED", 96, "Kaduna"], ["T-shirt and uniform printing", "creative", 2500, "PER_UNIT", 48, "Kaduna"],
        ] },
    ],
  },
];

const FALLBACK_DESCRIPTION = "Pilot test listing";

async function activeConfig() {
  const latest = await RevenueConfig.findOne().sort({ version: -1 }).lean();
  return { ...REVENUE_DEFAULTS, ...(latest || {}) };
}

async function remove() {
  const users = await User.find({ onboardingSource: SOURCE }).select("_id").lean();
  const ids = users.map((u) => u._id);
  const stores = await Store.find({ businessOwnerId: { $in: ids } }).select("_id").lean();
  const storeIds = stores.map((s) => s._id);
  const orders = await Order.find({ buyerId: { $in: ids } }).select("_id").lean();
  const results = {
    orders: (await Order.deleteMany({ _id: { $in: orders.map((o) => o._id) } })).deletedCount,
    groups: (await FulfillmentGroup.deleteMany({ orderId: { $in: orders.map((o) => o._id) } })).deletedCount,
    wallet: (await WalletEntry.deleteMany({ userId: { $in: ids } })).deletedCount,
    withdrawals: (await Withdrawal.deleteMany({ userId: { $in: ids } })).deletedCount,
    links: (await AffiliateLink.deleteMany({ partnerId: { $in: ids } })).deletedCount,
    services: (await ServiceOffering.deleteMany({ providerId: { $in: ids } })).deletedCount,
    products: (await Product.deleteMany({ merchantId: { $in: ids } })).deletedCount,
    branches: (await Branch.deleteMany({ storeId: { $in: storeIds } })).deletedCount,
    stores: (await Store.deleteMany({ _id: { $in: storeIds } })).deletedCount,
    businesses: (await Business.deleteMany({ ownerId: { $in: ids } })).deletedCount,
    users: (await User.deleteMany({ _id: { $in: ids } })).deletedCount,
  };
  console.log("Removed:", results);
}

async function seed() {
  const hash = await bcryptjs.hash(process.env.SEED_PASSWORD, 10);
  const config = await activeConfig();
  const created = [];
  const counts = { products: 0, services: 0 };

  const ensureUser = async (local, name, role, assignedState, extra = {}) => {
    const addr = email(local);
    let user = await User.findOne({ email: addr });
    if (!user) {
      user = new User({
        email: addr, password: hash, name, role, assignedState,
        isVerified: true, isActive: true, kycStatus: "APPROVED", kycTier: 2,
        onboardingSource: SOURCE, onboardingDate: new Date(), ...extra,
      });
      await user.save();
    }
    created.push({ email: addr, role, node: assignedState });
    return user;
  };

  // HQ, Gimbiya Desk, auditor
  const hq = await ensureUser("ceo", "Pilot HQ (Super Admin)", "super_admin", "Global");
  await ensureUser("ceo.exec", "Pilot CEO", "ceo", "Global");
  await ensureUser("support", "Pilot Desk Support", "support", "Global");
  await ensureUser("auditor", "Pilot Auditor", "auditor", "Global");

  for (const node of NODES) {
    await ensureUser(`coord.${node.code}`, `${node.city} Coordinator`, "developer_coordinator", node.key, { residentState: node.city, onboardedBy: hq._id });

    const affiliates = [];
    for (const n of [1, 2]) {
      const aff = await ensureUser(`aff${n}.${node.code}`, `${node.city} Affiliate ${n}`, "affiliate", node.key, { onboardedBy: hq._id });
      affiliates.push(aff);
      const code = `GML-PILOT-${node.code.toUpperCase()}${n}`;
      await AffiliateLink.updateOne({ code }, { $setOnInsert: { partnerId: aff._id, campaignName: `Pilot ${node.city} ${n}`, code } }, { upsert: true });
    }
    for (const n of [1, 2]) await ensureUser(`buyer${n}.${node.code}`, `${node.city} Shopper ${n}`, "buyer", node.key);
    for (const n of [1, 2]) await ensureUser(`rider${n}.${node.code}`, `${node.city} Rider ${n}`, "delivery", node.key, { onboardedBy: hq._id });

    for (const spec of node.stores) {
      const tag = `${node.code}.${spec.id}`;
      const isService = spec.type === "service_provider";
      const owner = await ensureUser(`owner.${tag}`, `${spec.name} Owner`, "business_owner", node.key);
      const manager = await ensureUser(`mgr.${tag}`, `${spec.name} Manager`, "manager", node.key);
      const stockMgr = await ensureUser(`stock.${tag}`, `${spec.name} Stock Manager`, "stock_manager", node.key);

      const bizEmail = email(`store.${tag}`);
      const tier = TIER_FOR_BUSINESS[spec.type];
      const referrer = spec.id === "a" ? affiliates[0] : spec.id === "b" ? affiliates[1] : null;
      let store = await Store.findOne({ businessEmail: bizEmail });
      if (!store) {
        store = await Store.create({
          businessName: spec.name, businessEmail: bizEmail, businessPhone: "08000000000",
          nin: `SEED-NIN-${tag}`, cacNumber: `SEED-CAC-${tag}`, tinNumber: `SEED-TIN-${tag}`,
          businessAddress: `${node.city} (pilot test address)`, homeAddress: `${node.city} (pilot test address)`,
          businessOwnerId: owner._id, onboardedBy: hq._id,
          referredByAffiliateId: referrer?._id || null, referralAttributedBy: referrer ? hq._id : null, referralAttributedAt: referrer ? new Date() : null,
          verificationStatus: "VERIFIED", primaryState: node.key,
          commerceSegment: spec.type, businessType: spec.type, marketTier: tier,
          submittedBy: hq._id, submitterRole: SOURCE, reviewedBy: hq._id, reviewedAt: new Date(),
        });
      }
      await Store.updateOne({ _id: store._id }, { $set: { subscriptionTier: spec.plan, subscriptionExpiresAt: spec.plan === "BASIC" ? null : yearAhead() } });
      if (!(await Business.exists({ email: bizEmail }))) {
        await Business.create({ name: spec.name, email: bizEmail, ownerId: owner._id, assignedState: node.key, segment: spec.type, isApproved: true });
      }
      if (!(await Branch.exists({ storeId: store._id }))) {
        await Branch.create({ storeId: store._id, branchName: `${spec.name} - Main`, assignedState: node.key, buildingFloor: node.floor, managerId: manager._id, stockManagerId: stockMgr._id });
      }

      for (const [name, baseNaira, stock, unit, category, moq = 1, bulk = []] of spec.products || []) {
        if (await Product.exists({ merchantId: owner._id, name })) continue;
        const baseKobo = naira(baseNaira);
        const { pct } = resolveRate(config, { node: node.key, floor: node.floor, marketTier: tier });
        await Product.create({
          name, descriptionText: FALLBACK_DESCRIPTION,
          basePriceKobo: baseKobo, priceKobo: listedPriceKobo(baseKobo, pct), commissionPct: pct,
          stock, unit, categorySlug: category, category,
          merchantId: owner._id, merchant: owner._id, store: store._id,
          assignedState: node.key, buildingFloor: node.floor, marketTier: tier,
          minimumOrderQuantity: moq, wholesaleOnly: tier !== "consumer",
          bulkPricingTiers: bulk.map(([minQty, p]) => ({ minQty, priceKobo: naira(p) })),
        });
        counts.products += 1;
      }

      if (isService) {
        for (const [serviceType, category, baseNaira, pricingModel, hours, area] of spec.services || []) {
          if (await ServiceOffering.exists({ providerId: owner._id, serviceType })) continue;
          await ServiceOffering.create({
            providerId: owner._id, store: store._id, serviceType, category, pricingModel,
            descriptionText: FALLBACK_DESCRIPTION, priceKobo: naira(baseNaira),
            estimatedDurationHours: hours, serviceArea: area, assignedState: node.key,
          });
          counts.services += 1;
        }
      }
    }
  }

  console.table(created);
  console.log(`\nDone. ${created.length} users, ${counts.products} new products, ${counts.services} new services.`);
  console.log("Every account uses the password you set in SEED_PASSWORD. Referral codes: GML-PILOT-KANO1, GML-PILOT-ABUJA2, etc.");
}

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  if (REMOVE) await remove(); else await seed();
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
