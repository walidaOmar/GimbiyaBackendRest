import mongoose from "mongoose";

// ─── ESCROW LEDGER — APPEND ONLY ─────────────────────────────────────────────
// RULE: No UPDATE or DELETE ever defined on this collection.
// Every state change appends a new document.
const escrowLedgerSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true,
    },
    entryType: {
      type: String,
      enum: ["LOCK", "RELEASE", "REFUND", "FEE_CAPTURE", "FREEZE", "UNFREEZE"],
      required: true,
    },
    grossTotalKobo:  { type: Number, required: true, min: 0 },
    platformFeeKobo: { type: Number, required: true, min: 0 },
    merchantNetKobo: { type: Number, required: true, min: 0 },
    escrowStatus:    { type: String, enum: ["LOCKED","RELEASED","REFUNDED","FROZEN"], required: true },
    actorId:         { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    noteText:        { type: String, default: "" },
    monnifyRef:      { type: String, default: null },
    timestamp:       { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, timestamps: false } // append-only — no updatedAt needed
);

escrowLedgerSchema.index({ orderId: 1, timestamp: -1 });

export const EscrowLedger = mongoose.model("EscrowLedger", escrowLedgerSchema);


// ─── INVENTORY AUDIT — APPEND ONLY ───────────────────────────────────────────
// RULE: No UPDATE or DELETE ever defined. Every stock change writes new doc.
const inventoryAuditSchema = new mongoose.Schema(
  {
    productId:   { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    actorId:     { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true },
    deltaCount:  { type: Number, required: true },        // signed: +add / -remove
    reasonCode:  { type: String, required: true },        // AUDIT | DAMAGED | RECOUNT | INBOUND | SALE | RETURN
    stockBefore: { type: Number, required: true, min: 0 },
    stockAfter:  { type: Number, required: true, min: 0 },
    noteText:    { type: String, default: "" },
    orderId:     { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    timestamp:   { type: Date, default: Date.now, index: true },
  },
  { versionKey: false, timestamps: false }
);

inventoryAuditSchema.index({ productId: 1, timestamp: -1 });

export const InventoryAudit = mongoose.model("InventoryAudit", inventoryAuditSchema);
