import { FulfillmentCoupon } from "../models/fulfillmentCoupon.model.js";
import { Order } from "../models/order.model.js";
import { User } from "../models/user.model.js";

export const generateFulfillmentInvoice = async (req, res) => {
  try {
    const { couponCode } = req.params;
    const userId = req.userId;

    const coupon = await FulfillmentCoupon.findOne({ code: couponCode.toUpperCase() }).lean();
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });

    const isAuthorized = coupon.affiliateId.toString() === userId || req.userRole === "super_admin";
    if (!isAuthorized) return res.status(403).json({ success: false, message: "Unauthorized" });

    const affiliate = await User.findById(coupon.affiliateId).lean();
    const coordinator = await User.findById(coupon.coordinatorId).lean();

    const orders = await Order.find({ fulfillmentCouponCode: couponCode.toUpperCase() })
      .populate("buyerId", "name email phone")
      .populate("items.productId", "name priceKobo")
      .sort({ createdAt: -1 })
      .lean();

    const paidOrders = orders.filter((o) => o.status === "PAID" || o.paymentMethod === "FULFILLMENT_COUPON");
    const totalPaidKobo = paidOrders.reduce((sum, o) => sum + (o.grossTotalKobo || 0), 0);

    const invoice = {
      invoiceNumber: `INV-FUL-${coupon.code}-${Date.now().toString(36).toUpperCase()}`,
      issuedAt: new Date(),
      billedTo: {
        name: affiliate?.name || "Unknown",
        email: affiliate?.email || "",
        phone: affiliate?.phone || "",
        role: "Affiliate Officer",
      },
      coordinator: {
        name: coordinator?.name || "Unknown",
        email: coordinator?.email || "",
      },
      coupon: {
        code: coupon.code,
        totalSlots: coupon.totalSlots,
        usedSlots: coupon.usedSlots,
        budgetKobo: coupon.budgetKobo,
        usedBudgetKobo: coupon.usedBudgetKobo,
      },
      lineItems: paidOrders.map((o) => ({
        orderRef: o.orderRef,
        date: o.createdAt,
        customer: o.buyerId?.name || "Unknown",
        customerEmail: o.buyerId?.email || "",
        items: o.items?.map((i) => ({
          productName: i.productId?.name || i.name || "Unknown",
          quantity: i.quantity,
          unitPriceKobo: i.unitPriceKobo,
          subtotalKobo: i.subtotalKobo,
        })) || [],
        orderTotalKobo: o.grossTotalKobo,
        status: o.status,
      })),
      summary: {
        totalOrders: paidOrders.length,
        totalAmountKobo: totalPaidKobo,
        totalAmountNaira: totalPaidKobo / 100,
        paymentMethod: "Fulfillment Coupon",
        status: "PAID",
      },
    };

    res.status(200).json({ success: true, invoice });
  } catch (error) {
    console.error("[generateFulfillmentInvoice]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMyInvoices = async (req, res) => {
  try {
    const coupons = await FulfillmentCoupon.find({ affiliateId: req.userId })
      .select("code usedBudgetKobo budgetKobo usedSlots totalSlots createdAt expiresAt status")
      .sort({ createdAt: -1 })
      .lean();

    const invoices = coupons.map((c) => ({
      invoiceNumber: `INV-FUL-${c.code}`,
      couponCode: c.code,
      issuedAt: c.createdAt,
      totalAmountNaira: (c.usedBudgetKobo || 0) / 100,
      totalOrders: c.usedSlots,
      status: c.status,
      expiresAt: c.expiresAt,
    }));

    res.status(200).json({ success: true, invoices });
  } catch (error) {
    console.error("[getMyInvoices]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
