import { RevenueConfig } from "../models/revenueConfig.model.js";
import { REVENUE_DEFAULTS, getRevenueConfig, setRevenueConfig } from "../utils/revenueCache.js";

const NODES = Object.keys(REVENUE_DEFAULTS.nodeCommissionPct);
const SPLIT_KEYS = ["affiliate", "platform", "merchant", "rider"];
const FIELDS = ["nodeCommissionPct", "level2CommissionPct", "wholesaleCommissionPct", "platformFeePct", "deliveryFeeKobo", "ratePrecedence", "splitReferred", "splitOrganic", "subscription"];

const isPct = (n, max) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;

export function validateRevenueInput(input) {
  const errors = [];
  const out = {};

  const nodes = input?.nodeCommissionPct;
  if (!nodes || typeof nodes !== "object") errors.push("nodeCommissionPct is required");
  else {
    out.nodeCommissionPct = {};
    for (const node of NODES) {
      const value = Number(nodes[node]);
      if (!isPct(value, 30)) errors.push(`Commission for ${node} must be between 0 and 30`);
      out.nodeCommissionPct[node] = value;
    }
  }

  for (const [key, max] of [["level2CommissionPct", 30], ["wholesaleCommissionPct", 30], ["platformFeePct", 10]]) {
    const value = Number(input?.[key]);
    if (!isPct(value, max)) errors.push(`${key} must be between 0 and ${max}`);
    out[key] = value;
  }

  const delivery = Number(input?.deliveryFeeKobo);
  if (!Number.isInteger(delivery) || delivery < 0 || delivery > 5000000) errors.push("deliveryFeeKobo must be a whole number of kobo between 0 and 5,000,000");
  out.deliveryFeeKobo = delivery;

  const order = input?.ratePrecedence;
  const PRECEDENCE_OK = Array.isArray(order) && order.length === 3 && ["wholesale", "level2", "node"].every((r) => order.includes(r));
  if (!PRECEDENCE_OK) errors.push("ratePrecedence must list wholesale, level2 and node once each");
  out.ratePrecedence = order;

  for (const key of ["splitReferred", "splitOrganic"]) {
    const split = input?.[key];
    if (!split || typeof split !== "object") { errors.push(`${key} is required`); continue; }
    out[key] = {};
    let total = 0;
    for (const part of SPLIT_KEYS) {
      const value = Number(split[part]);
      if (!isPct(value, 100)) errors.push(`${key}.${part} must be between 0 and 100`);
      out[key][part] = value;
      total += value;
    }
    if (Math.abs(total - 100) > 0.001) errors.push(`${key} must add up to exactly 100 (currently ${total})`);
  }

  const sub = input?.subscription;
  if (!sub || typeof sub !== "object") errors.push("subscription is required");
  else {
    out.subscription = {};
    for (const key of ["basicKobo", "proKobo", "legendaryKobo"]) {
      const value = Number(sub[key]);
      if (!Number.isInteger(value) || value < 0) errors.push(`subscription.${key} must be a whole number of kobo`);
      out.subscription[key] = value;
    }
  }

  return { errors, value: out };
}

/** Loads the active config into the cache. Creates version 1 from the defaults on first run. */
export async function loadRevenueConfig() {
  let latest = await RevenueConfig.findOne().sort({ version: -1 }).lean();
  if (!latest) {
    const { version, ...defaults } = REVENUE_DEFAULTS;
    try {
      await RevenueConfig.create({ version: 1, ...defaults, changedBy: null, reason: "System defaults (Release 1 rates)" });
    } catch (error) {
      if (error.code !== 11000) throw error; // another instance created it first
    }
    latest = await RevenueConfig.findOne().sort({ version: -1 }).lean();
  }
  const config = { version: latest.version };
  for (const field of FIELDS) config[field] = latest[field];
  setRevenueConfig(config);
  return getRevenueConfig();
}

export async function publishRevenueConfig(input, userId, reason) {
  const { errors, value } = validateRevenueInput(input);
  if (errors.length) return { errors };
  if (!reason || String(reason).trim().length < 5) return { errors: ["A reason of at least 5 characters is required"] };

  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await RevenueConfig.findOne().sort({ version: -1 }).select("version").lean();
    try {
      const doc = await RevenueConfig.create({ version: (latest?.version || 0) + 1, ...value, changedBy: userId, reason: String(reason).trim() });
      await loadRevenueConfig();
      return { doc };
    } catch (error) {
      if (error.code !== 11000) throw error; // version collision: retry
    }
  }
  return { errors: ["Could not publish, please try again"] };
}
