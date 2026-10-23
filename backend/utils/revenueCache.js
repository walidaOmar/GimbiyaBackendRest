/**
 * In-memory copy of the active Revenue Architecture. Pure (no database imports) so
 * utils/pricing.js can read it synchronously. services/revenueConfig.service.js fills it.
 * Defaults = the agreed Release 1 ("old") rates.
 */
export const REVENUE_DEFAULTS = Object.freeze({
  version: 0,
  nodeCommissionPct: {
    "Ado bayero mall": 5.5,
    "Tafawa balewa refinery": 5.0,
    "Sardauna market": 4.5,
  },
  level2CommissionPct: 3.0,
  wholesaleCommissionPct: 2.5,
  platformFeePct: 1.5,
  deliveryFeeKobo: 150000, // flat ₦1,500 per product group, 100% to the rider (decision D-NEW: HQ can change)
  ratePrecedence: ["wholesale", "level2", "node"], // decision D26: which commission rule wins first
  splitReferred: { affiliate: 50, platform: 20, merchant: 20, rider: 10 },
  splitOrganic: { affiliate: 0, platform: 30, merchant: 60, rider: 10 },
  subscription: { basicKobo: 0, proKobo: 4500000, legendaryKobo: 12000000 },
});

let current = REVENUE_DEFAULTS;

export const getRevenueConfig = () => current;
export const setRevenueConfig = (config) => {
  current = Object.freeze({ ...REVENUE_DEFAULTS, ...config });
};
