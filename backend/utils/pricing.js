/**
 * backend/utils/pricing.js
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for all Gimbiya Mall financial logic.
 *
 * MANDATE: No other file performs financial arithmetic on order totals.
 * All values are integers (Kobo). Naira is derived at runtime for display only.
 *
 * Calculation sequence (from spec §6):
 *   1. Gross  = SUM(priceKobo × quantity)
 *   2. Fee    = Math.round(Gross × 0.015)   → 1.5% platform fee
 *   3. Net    = Gross - Fee                  → merchant payout
 */

// Platform service fee — 1.5% of gross order total
export const PLATFORM_FEE_RATE = 0.015;

// Minimum order value requiring escrow (Kobo). Default: ₦500 = 50,000 Kobo
export const ESCROW_MIN_KOBO = parseInt(process.env.ESCROW_MIN_AMOUNT_KOBO || "50000", 10);

/**
 * calculateOrderPricing
 * @param {Array<{ unitPriceKobo: number, quantity: number }>} items
 * @returns {{ grossTotalKobo, platformFeeKobo, merchantNetKobo, grossTotalNaira, platformFeeNaira, merchantNetNaira }}
 */
export function calculateOrderPricing(items) {
  // Validate all inputs are positive integers
  for (const item of items) {
    if (!Number.isInteger(item.unitPriceKobo) || item.unitPriceKobo < 0)
      throw new Error(`Invalid unitPriceKobo: ${item.unitPriceKobo}`);
    if (!Number.isInteger(item.quantity) || item.quantity < 1)
      throw new Error(`Invalid quantity: ${item.quantity}`);
  }

  // Step 1: Gross Order Total
  const grossTotalKobo = items.reduce(
    (sum, item) => sum + item.unitPriceKobo * item.quantity, 0
  );

  // Step 2: Platform Fee — 1.5%, rounded to nearest Kobo
  const platformFeeKobo = Math.round(grossTotalKobo * PLATFORM_FEE_RATE);

  // Step 3: Merchant Net — exact integer subtraction
  const merchantNetKobo = grossTotalKobo - platformFeeKobo;

  return {
    grossTotalKobo,
    platformFeeKobo,
    merchantNetKobo,
    // Naira conversions — for display and Monnify API only, NEVER stored
    grossTotalNaira:  grossTotalKobo  / 100,
    platformFeeNaira: platformFeeKobo / 100,
    merchantNetNaira: merchantNetKobo / 100,
  };
}

/**
 * generateOrderRef — human-readable order reference e.g. GM-KN-240001
 */
export function generateOrderRef(state, sequenceNum) {
  const code = state.slice(0, 2).toUpperCase();
  const now  = new Date();
  const yy   = String(now.getFullYear()).slice(2);
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const dd   = String(now.getDate()).padStart(2, "0");
  const seq  = String(sequenceNum).padStart(4, "0");
  return `GM-${code}-${yy}${mm}${dd}${seq}`;
}

/**
 * buildMonnifyPayload — constructs payment payload for Monnify API
 */
export function buildMonnifyPayload(pricing, orderRef, merchantSubAccountCode, customerName, customerEmail, paymentMethod) {
  if (pricing.grossTotalKobo <= 0)
    throw new Error("Cannot build Monnify payload for zero-value order.");

  const merchantSplitPct = parseFloat(
    ((pricing.merchantNetKobo / pricing.grossTotalKobo) * 100).toFixed(4)
  );

  return {
    amount:             pricing.grossTotalNaira,
    customerName,
    customerEmail,
    paymentReference:   orderRef,
    paymentDescription: `Gimbiya Mall Order ${orderRef}`,
    currencyCode:       "NGN",
    contractCode:       process.env.MONNIFY_CONTRACT_CODE || "",
    redirectUrl:        `${process.env.CLIENT_URL}/orders/${orderRef}/status`,
    paymentMethods:     [paymentMethod || "ACCOUNT_TRANSFER"],
    incomeSplitConfig: [{
      subAccountCode: merchantSubAccountCode,
      feePercentage:  merchantSplitPct,
      splitAmount:    pricing.merchantNetNaira,
      feeBearer:      false,
    }],
  };
}

/** Format Kobo integer as Nigerian Naira string e.g. ₦12,500.00 */
export function formatNaira(kobo) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency: "NGN", minimumFractionDigits: 2,
  }).format(kobo / 100);
}
