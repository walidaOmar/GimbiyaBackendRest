/**
 * Pricing and settlement rules, version 1. PURE: no database, no clock, no environment.
 * Money is integer kobo. Percentages are converted to basis points (1% = 100 bp) before
 * any multiplication so there is no floating-point drift.
 *
 *   listedPrice   = round(base x (1 + rate/100))                  (decision D25, treated as locked)
 *   commissionPool = (listedPrice - base) x quantity
 *   platformFee   = round(1.5% x (product subtotal + service subtotal)), paid by the customer on top
 *   pool split    = referred 50/20/20/10, organic 0/30/60/10  (affiliate/platform/merchant/rider)
 *   customerTotal = product subtotal + service subtotal + platformFee + delivery fees
 */

export const B2B_TIERS = ["wholesale", "manufacturing"];
export const DEFAULT_PRECEDENCE = ["wholesale", "level2", "node"]; // decision D26: HQ can change this

const bp = (pct) => Math.round(Number(pct) * 100);

/** Which commission rate applies to a listing. `config.ratePrecedence` decides which rule wins. */
export function resolveRate(config, { node, floor, marketTier }) {
  const order = Array.isArray(config.ratePrecedence) && config.ratePrecedence.length ? config.ratePrecedence : DEFAULT_PRECEDENCE;
  for (const rule of order) {
    if (rule === "wholesale" && B2B_TIERS.includes(marketTier)) return { pct: config.wholesaleCommissionPct, rule };
    if (rule === "level2" && (floor === "LEVEL_2" || floor === 2)) return { pct: config.level2CommissionPct, rule };
    if (rule === "node") break;
  }
  const nodeRate = config.nodeCommissionPct?.[node];
  return { pct: typeof nodeRate === "number" ? nodeRate : 5.0, rule: "node" };
}

export function listedPriceKobo(baseKobo, ratePct) {
  if (!Number.isInteger(baseKobo) || baseKobo < 0) throw new Error("baseKobo must be a non-negative integer");
  return Math.round((baseKobo * (10000 + bp(ratePct))) / 10000);
}

/** Inverse of listedPriceKobo, used only to back-fill old products so customers keep seeing the same price. */
export function baseFromListedKobo(listedKobo, ratePct) {
  return Math.round((listedKobo * 10000) / (10000 + bp(ratePct)));
}

export function platformFeeKobo(subtotalKobo, feePct) {
  return Math.round((subtotalKobo * bp(feePct)) / 10000);
}

/** Unit base price for a quantity, honouring the merchant's bulk tiers (tier prices are base prices). */
export function unitBaseForQuantity(product, quantity) {
  let unit = product.basePriceKobo;
  const tiers = [...(product.bulkPricingTiers || [])].sort((a, b) => a.minQty - b.minQty);
  for (const tier of tiers) if (quantity >= tier.minQty && tier.priceKobo > 0) unit = tier.priceKobo;
  return unit;
}

/** Splits an integer amount by percentages; any leftover kobo goes to `remainderTo`. Always sums exactly. */
export function splitByPercent(totalKobo, shares, remainderTo = "platform") {
  const out = {};
  let used = 0;
  for (const [key, pct] of Object.entries(shares)) {
    out[key] = Math.floor((totalKobo * bp(pct)) / 10000);
    used += out[key];
  }
  out[remainderTo] = (out[remainderTo] || 0) + (totalKobo - used);
  return out;
}

/** Spreads `totalKobo` over weights so the parts add up exactly (leftover goes to the last part). */
export function allocateProportionally(totalKobo, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const parts = weights.map((w) => Math.floor((totalKobo * w) / sum));
  const diff = totalKobo - parts.reduce((a, b) => a + b, 0);
  parts[parts.length - 1] += diff;
  return parts;
}

/**
 * Builds the full money picture for an order.
 * productLines : [{ merchantId, productId, productName, quantity, baseUnitKobo, listedUnitKobo }]
 * serviceLines : [{ providerId, serviceType, priceKobo, offeringId }]
 * affiliateId  : set when the order is referred (valid ?ref=CODE), otherwise null (organic)
 */
export function buildOrderBreakdown({ config, productLines, serviceLines = [], affiliateId = null }) {
  const referred = Boolean(affiliateId);
  const shares = referred ? config.splitReferred : config.splitOrganic;
  const deliveryFee = Number(config.deliveryFeeKobo) || 0;

  const byMerchant = new Map();
  for (const line of productLines) {
    const key = String(line.merchantId);
    if (!byMerchant.has(key)) byMerchant.set(key, { type: "PRODUCT", merchantId: line.merchantId, lines: [] });
    byMerchant.get(key).lines.push(line);
  }
  const byProvider = new Map();
  for (const line of serviceLines) {
    const key = String(line.providerId);
    if (!byProvider.has(key)) byProvider.set(key, { type: "SERVICE", merchantId: line.providerId, lines: [] });
    byProvider.get(key).lines.push(line);
  }

  const groups = [...byMerchant.values(), ...byProvider.values()].map((group) => {
    if (group.type === "PRODUCT") {
      const baseKobo = group.lines.reduce((s, l) => s + l.baseUnitKobo * l.quantity, 0);
      const listedKobo = group.lines.reduce((s, l) => s + l.listedUnitKobo * l.quantity, 0);
      return { ...group, baseKobo, listedKobo, poolKobo: listedKobo - baseKobo, serviceKobo: 0, subtotalKobo: listedKobo, deliveryFeeKobo: deliveryFee };
    }
    const serviceKobo = group.lines.reduce((s, l) => s + l.priceKobo, 0);
    return { ...group, baseKobo: 0, listedKobo: 0, poolKobo: 0, serviceKobo, subtotalKobo: serviceKobo, deliveryFeeKobo: 0 };
  });

  const orderSubtotal = groups.reduce((s, g) => s + g.subtotalKobo, 0);
  const feeTotal = 0 + (config.platformFeePct ? platformFeeKobo(orderSubtotal, config.platformFeePct) : 0);
  const fees = allocateProportionally(feeTotal, groups.map((g) => g.subtotalKobo));

  groups.forEach((group, i) => {
    group.feeKobo = fees[i];
    const split = splitByPercent(group.poolKobo, shares);
    if (!affiliateId) { split.platform += split.affiliate; split.affiliate = 0; } // nobody to pay: platform keeps it
    group.split = split;
    group.merchantKobo = group.baseKobo + split.merchant + group.serviceKobo; // service providers receive the service price in full
    group.riderKobo = split.rider + group.deliveryFeeKobo;
    group.affiliateKobo = split.affiliate;
    group.platformKobo = split.platform + group.feeKobo;
    group.customerKobo = group.subtotalKobo + group.feeKobo + group.deliveryFeeKobo;
  });

  const totals = {
    productSubtotalKobo: groups.filter((g) => g.type === "PRODUCT").reduce((s, g) => s + g.listedKobo, 0),
    serviceSubtotalKobo: groups.reduce((s, g) => s + g.serviceKobo, 0),
    feeKobo: feeTotal,
    deliveryFeeKobo: groups.reduce((s, g) => s + g.deliveryFeeKobo, 0),
    commissionPoolKobo: groups.reduce((s, g) => s + g.poolKobo, 0),
    merchantNetKobo: groups.reduce((s, g) => s + g.merchantKobo, 0),
    grossTotalKobo: groups.reduce((s, g) => s + g.customerKobo, 0),
    referred,
  };
  return { groups, totals };
}

/** What each party is credited when a group is released (OTP accepted). Sums to group.customerKobo. */
export function entitlementsForGroup(group, { affiliateId, riderId }) {
  const rows = [];
  if (group.merchantKobo > 0) rows.push({ account: "USER", userId: group.merchantId, kind: group.type === "SERVICE" ? "SERVICE_PAYOUT" : "MERCHANT_SALE", amountKobo: group.merchantKobo });
  if (group.riderKobo > 0) {
    if (riderId) rows.push({ account: "USER", userId: riderId, kind: "RIDER_EARNING", amountKobo: group.riderKobo });
    else rows.push({ account: "PLATFORM", userId: null, kind: "UNASSIGNED_RIDER_SHARE", amountKobo: group.riderKobo });
  }
  if (group.affiliateKobo > 0 && affiliateId) rows.push({ account: "USER", userId: affiliateId, kind: "AFFILIATE_COMMISSION", amountKobo: group.affiliateKobo });
  const platform = group.platformKobo + (group.affiliateKobo > 0 && !affiliateId ? group.affiliateKobo : 0);
  if (platform > 0) rows.push({ account: "PLATFORM", userId: null, kind: "PLATFORM_REVENUE", amountKobo: platform });
  return rows;
}
