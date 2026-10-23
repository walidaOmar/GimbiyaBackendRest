/**
 * Who may invite whom (v2). Pure data + pure functions, no database access.
 *   HQ ............ coordinators, affiliates, support, auditors, business owners (any type), riders
 *   Coordinator ... affiliates, business owners (any type), riders, branch/stock managers, all in their own node
 *   Affiliate ..... retailers only (the retailer is credited to that affiliate automatically)
 *   Business owner  their own branch manager and stock manager (limited by their subscription plan)
 * Consumers sign up publicly.
 */
export const INVITE_MATRIX = {
  super_admin: ["developer_coordinator", "affiliate", "support", "auditor", "business_owner", "delivery"],
  ceo: ["developer_coordinator", "affiliate", "support", "auditor", "business_owner", "delivery"],
  developer_coordinator: ["affiliate", "business_owner", "delivery", "manager", "stock_manager"],
  affiliate: ["business_owner"],
  business_owner: ["manager", "stock_manager"],
};

export const BUSINESS_TYPES = ["retailer", "wholesaler", "manufacturer", "service_provider"];
export const AFFILIATE_BUSINESS_TYPES = ["retailer"];
export const HQ_ROLES = ["super_admin", "ceo"];
export const STAFF_ROLES = ["manager", "stock_manager"];

export const NODE_STATE = {
  "Ado bayero mall": "Kano",
  "Tafawa balewa refinery": "Abuja",
  "Sardauna market": "Kaduna",
};

export const ROLE_LABEL = {
  developer_coordinator: "State Coordinator",
  affiliate: "Affiliate Officer",
  support: "Gimbiya Desk (support)",
  auditor: "Auditor",
  business_owner: "Business Owner",
  manager: "Branch Manager",
  stock_manager: "Stock Manager",
  delivery: "Rider",
};

export const BUSINESS_TYPE_LABEL = {
  retailer: "Retailer",
  wholesaler: "Wholesaler",
  manufacturer: "Manufacturer",
  service_provider: "Service Provider",
};

export const INVITE_TTL_HOURS = 72;

export const canInvite = (inviterRole, targetRole) => (INVITE_MATRIX[inviterRole] || []).includes(targetRole);

/** Business types this inviter may bring in. */
export const allowedBusinessTypes = (inviterRole) =>
  inviterRole === "affiliate" ? AFFILIATE_BUSINESS_TYPES : canInvite(inviterRole, "business_owner") ? BUSINESS_TYPES : [];

/** Roles that work across all markets (no node). */
export const isGlobalRole = (role) => ["support", "auditor"].includes(role);
