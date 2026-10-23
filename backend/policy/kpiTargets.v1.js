/** KPI targets (v1). Money in kobo. Changing a target = a new versioned file. */
export const KPI = {
  affiliateMonthlyGmvKobo: 10_000_000,      // ₦100,000 per affiliate officer per Lagos month
  coordinatorMonthlyGmvKobo: 500_000_000,   // ₦5,000,000 per node per Lagos month
  coordinatorActiveShops: 50,               // active shops per node per month
  activeShopDeliveredOrders: 5,             // an "active shop" = 5 OTP-delivered parent orders in the month
};
