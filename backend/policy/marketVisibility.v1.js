/**
 * Who sees which marketplace tier. One shared catalog, role-aware discovery.
 *   consumer     -> retail products (marketTier "consumer") from every node, plus all services
 *   retailer     -> wholesaler products ("wholesale"), plus all services
 *   wholesaler   -> manufacturer products ("manufacturing"), plus all services
 *   manufacturer -> every tier, plus all services
 *   admin        -> every tier (HQ, coordinators)
 * Browsing is separate from buying: the server re-checks this on add-to-cart and checkout.
 */
export const ALL_TIERS = ["consumer", "wholesale", "manufacturing"];

export const VISIBLE_TIERS = {
  consumer: ["consumer"],
  retailer: ["wholesale"],
  wholesaler: ["manufacturing"],
  manufacturer: ALL_TIERS,
  admin: ALL_TIERS,
};

export const VIEWER_LABEL = {
  consumer: { label: "Public Retail", badge: "B2C", note: "Retail products and services from every market." },
  retailer: { label: "Wholesale Procurement", badge: "B2B", note: "Wholesaler stock for restocking your shop, plus services." },
  wholesaler: { label: "Manufacturer Direct", badge: "B2B", note: "Manufacturer stock for bulk procurement, plus services." },
  manufacturer: { label: "Full Marketplace", badge: "ALL", note: "Every product tier and every service." },
  admin: { label: "Full Catalog", badge: "ADMIN", note: "All tiers across all markets." },
};

export const tiersForViewer = (viewerClass) => VISIBLE_TIERS[viewerClass] || VISIBLE_TIERS.consumer;

/** HQ and coordinators can browse everything but, like any shopper, only buy retail items. */
export const BUYABLE_TIERS = { ...VISIBLE_TIERS, admin: ["consumer"] };
export const canBuyTier = (viewerClass, marketTier) => (BUYABLE_TIERS[viewerClass] || BUYABLE_TIERS.consumer).includes(marketTier);

/** The tier a store's own products belong to. Never taken from the client. */
export const TIER_FOR_BUSINESS = { retailer: "consumer", wholesaler: "wholesale", manufacturer: "manufacturing", service_provider: "consumer" };
