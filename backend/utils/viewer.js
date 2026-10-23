import { Store } from "../models/store.model.js";

const ADMIN_ROLES = ["super_admin", "ceo", "developer_coordinator", "auditor", "support"];

/**
 * Works out which marketplace view a request gets. Never trusts the client.
 * Returns { viewerClass, store } where store is the viewer's own store (business owners only).
 */
export async function resolveViewer(req) {
  if (!req.user) return { viewerClass: "consumer", store: null };
  if (ADMIN_ROLES.includes(req.userRole)) return { viewerClass: "admin", store: null };
  if (req.userRole === "business_owner") {
    const store = await Store.findOne({ businessOwnerId: req.userId }).lean();
    const map = { retailer: "retailer", wholesaler: "wholesaler", manufacturer: "manufacturer" };
    return { viewerClass: map[store?.businessType] || "consumer", store };
  }
  return { viewerClass: "consumer", store: null };
}
