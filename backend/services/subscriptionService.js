import { Store } from "../models/store.model.js";
import { Product } from "../models/product.model.js";
import { ServiceOffering } from "../models/serviceOffering.model.js";
import { Branch } from "../models/branch.model.js";
import { Invite } from "../models/invite.model.js";
import { effectiveTier, checkCap } from "../policy/entitlements.v1.js";

export async function storeForOwner(userId) {
  return Store.findOne({ businessOwnerId: userId });
}

export async function usageFor(store) {
  const [products, services, branches, branchDocs, pendingStaff] = await Promise.all([
    Product.countDocuments({ merchantId: store.businessOwnerId }),
    ServiceOffering.countDocuments({ providerId: store.businessOwnerId }),
    Branch.countDocuments({ storeId: store._id, isActive: true }),
    Branch.find({ storeId: store._id, isActive: true }).select("managerId stockManagerId").lean(),
    Invite.countDocuments({ storeId: store._id, status: "PENDING", role: { $in: ["manager", "stock_manager"] }, expiresAt: { $gt: new Date() } }),
  ]);
  const staff = new Set();
  for (const b of branchDocs) { if (b.managerId) staff.add(String(b.managerId)); if (b.stockManagerId) staff.add(String(b.stockManagerId)); }
  return { products, services, branches, staff: staff.size + pendingStaff };
}

/** { ok, message, tier } for adding one more `resource` to this store. */
export async function enforceCap(store, resource) {
  const tier = effectiveTier(store);
  const usage = await usageFor(store);
  const result = checkCap(tier, resource, usage[resource]);
  return { ...result, tier };
}
