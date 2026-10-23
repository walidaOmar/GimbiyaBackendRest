/**
 * Merchant subscription tiers, version 1 (from the blueprint).
 * Basic is free; Pro and Legendary are paid yearly (prices come from the HQ Revenue Architecture).
 * `null` = unlimited. Services cap for Basic is not in the blueprint: 2 is a placeholder (open item).
 */
export const TIERS = {
  BASIC:     { label: "Basic",     products: 5,    services: 2,    branches: 1,    staff: 2,    priceEditCooldownHours: 12, canDeleteProducts: false, wholesale: false, bannerAds: false },
  PRO:       { label: "Pro",       products: 50,   services: 5,    branches: 3,    staff: 5,    priceEditCooldownHours: 0,  canDeleteProducts: true,  wholesale: false, bannerAds: false },
  LEGENDARY: { label: "Legendary", products: null, services: null, branches: null, staff: null, priceEditCooldownHours: 0,  canDeleteProducts: true,  wholesale: true,  bannerAds: true },
};

export const TIER_ORDER = ["BASIC", "PRO", "LEGENDARY"];

/** A paid tier that has expired behaves as Basic. */
export function effectiveTier(store, now = new Date()) {
  const tier = store?.subscriptionTier || "BASIC";
  if (tier === "BASIC") return "BASIC";
  if (!store.subscriptionExpiresAt || new Date(store.subscriptionExpiresAt) < now) return "BASIC";
  return tier;
}

export function limitFor(tier, resource) {
  return TIERS[tier]?.[resource] ?? null;
}

/** { ok:true } or { ok:false, message } for adding one more of `resource` when `used` already exist. */
export function checkCap(tier, resource, used) {
  const cap = limitFor(tier, resource);
  if (cap === null) return { ok: true };
  if (used >= cap) {
    return { ok: false, message: `Your ${TIERS[tier].label} plan allows ${cap} ${resource}. Upgrade your subscription to add more.` };
  }
  return { ok: true };
}

/** Hours remaining before the next price edit is allowed (0 = allowed now). */
export function priceEditWaitHours(tier, lastEditAt, now = new Date()) {
  const cooldown = TIERS[tier]?.priceEditCooldownHours || 0;
  if (!cooldown || !lastEditAt) return 0;
  const left = cooldown - (now.getTime() - new Date(lastEditAt).getTime()) / 3600000;
  return left > 0 ? Math.ceil(left * 10) / 10 : 0;
}
