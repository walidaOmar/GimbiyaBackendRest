import { getRevenueConfig } from "./revenueCache.js";
import { resolveRate, listedPriceKobo, baseFromListedKobo, unitBaseForQuantity } from "../policy/pricing.v1.js";

/** Current commission rule for a product (node, floor and tier come from the stored product, never the client). */
export function currentRate(product) {
  return resolveRate(getRevenueConfig(), { node: product.assignedState, floor: product.buildingFloor, marketTier: product.marketTier });
}

/** Base price of a product. Old products (before the base/listed split) are backfilled from their listed price. */
export function productBaseKobo(product) {
  if (Number.isInteger(product.basePriceKobo)) return product.basePriceKobo;
  const pct = typeof product.commissionPct === "number" ? product.commissionPct : currentRate(product).pct;
  return baseFromListedKobo(product.priceKobo, pct);
}

/**
 * The server-authoritative unit price for a quantity: bulk tiers move the BASE price, then the
 * platform commission is applied on top. Uses the rate snapshot stored on the product when present,
 * so a customer is always charged the same price that was shown on the listing.
 */
export function priceForQuantity(product, quantity) {
  const pct = typeof product.commissionPct === "number" ? product.commissionPct : currentRate(product).pct;
  const base = unitBaseForQuantity({ ...product, basePriceKobo: productBaseKobo(product) }, quantity);
  return { baseUnitKobo: base, listedUnitKobo: listedPriceKobo(base, pct), pct };
}

/** Used when a merchant publishes or edits a price. */
export function listingPrice(baseKobo, product) {
  const { pct } = currentRate(product);
  return { priceKobo: listedPriceKobo(baseKobo, pct), commissionPct: pct };
}
