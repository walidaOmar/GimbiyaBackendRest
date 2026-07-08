import mongoose from "mongoose";
import { Order }        from "../models/order.model.js";
import { EscrowLedger } from "../models/ledger.model.js";
import { verifyOtp }    from "../utils/otpService.js";
import { notifyUser }   from "../utils/sseService.js";
import { getFirebaseStorage } from "../config/firebase.js";

// ── GET AVAILABLE JOBS ────────────────────────────────────────────────────────
export const getAvailableJobs = async (req, res) => {
  try {
    if (req.userState === "Global") {
      return res.status(403).json({ success: false, message: "Riders must be assigned to a specific state" });
    }

    const jobs = await Order.find({
      status:        "CONFIRMED",
      assignedState: req.userState,
      riderId:       null,              // unclaimed only
    })
      .select("orderRef items shippingAddress assignedState grossTotalKobo createdAt")
      .sort({ createdAt: 1 })          // FIFO — oldest first
      .limit(50)
      .lean();

    res.status(200).json({ success: true, jobs, count: jobs.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET MY ACTIVE DELIVERIES ──────────────────────────────────────────────────
export const getMyDeliveries = async (req, res) => {
  try {
    const deliveries = await Order.find({
      riderId: req.userId,
      status:  { $in: ["DISPATCHED", "PROCESSING"] },
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.status(200).json({ success: true, deliveries });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── CLAIM JOB ─────────────────────────────────────────────────────────────────
// Atomic — only one rider can claim. If claimed by another, update returns null.
export const claimJob = async (req, res) => {
  const { orderId } = req.body;

  try {
    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId is required" });
    }

    const order = await Order.findOneAndUpdate(
      {
        _id:           orderId,
        status:        "CONFIRMED",
        assignedState: req.userState,  // state boundary enforced from session
        riderId:       null,           // unclaimed guard
      },
      {
        $set:  { riderId: req.userId, status: "DISPATCHED" },
        $push: {
          timeline: {
            status: "DISPATCHED", timestamp: new Date(),
            actorId: req.userId, note: "Rider claimed job. In transit.",
          },
        },
      },
      { new: true }
    );

    if (!order) {
      return res.status(409).json({
        success: false,
        message: "This job is no longer available — it may have been claimed by another rider.",
      });
    }

    // Notify buyer and merchant
    notifyUser(order.buyerId.toString(), "order:rider_assigned", {
      orderId:  order._id, orderRef: order.orderRef,
      message:  "Your order has been picked up and is on its way!",
    });
    notifyUser(order.merchantId.toString(), "order:status_changed", {
      orderId:   order._id, newStatus: "DISPATCHED",
    });

    res.status(200).json({
      success:  true,
      orderId:  order._id,
      orderRef: order.orderRef,
      message:  "Job claimed. Navigate to pickup location.",
    });
  } catch (error) {
    console.error("[claimJob]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── FINALIZE SECURE HANDOVER ──────────────────────────────────────────────────
// Most security-critical endpoint on the platform.
// GEF Trace:
//   Entry:  order.status=DISPATCHED, order.escrowStatus=LOCKED, order.riderOtpHash=bcrypt(rawOtp)
//   Step 1: bcrypt.compare(submittedOtp, storedHash) — false → UNAUTHORIZED
//   Step 2: Upload signatureBase64 to Firebase Storage
//   Step 3: Atomic transaction — update order + write EscrowLedger RELEASE entry
//   Exit:   order.status=DELIVERED, order.escrowStatus=RELEASED
export const finalizeHandover = async (req, res) => {
  const { orderId, submittedOtp, signatureBase64 } = req.body;

  try {
    if (!orderId || !submittedOtp || !signatureBase64) {
      return res.status(400).json({ success: false, message: "orderId, submittedOtp, and signatureBase64 are required" });
    }
    if (!/^\d{4}$/.test(submittedOtp)) {
      return res.status(400).json({ success: false, message: "OTP must be exactly 4 digits" });
    }

    // Fetch order WITH riderOtpHash (field is select:false by default — must request explicitly)
    const order = await Order.findOne({
      _id:    orderId,
      riderId: req.userId,
      status: "DISPATCHED",
    }).select("+riderOtpHash");

    if (!order) {
      return res.status(404).json({ success: false, message: "Active delivery not found or not assigned to you" });
    }
    if (!order.riderOtpHash) {
      return res.status(500).json({ success: false, message: "OTP configuration error on this order" });
    }

    // Step 1: Verify OTP against bcrypt hash
    const otpValid = await verifyOtp(submittedOtp, order.riderOtpHash);
    if (!otpValid) {
      return res.status(401).json({ success: false, message: "Invalid OTP. The buyer must confirm the correct 4-digit code." });
    }

    // Step 2: Upload signature to Firebase Storage
    let signatureStoragePath;
    try {
      const storage  = getFirebaseStorage();
      const bucket   = storage.bucket();
      const filePath = `delivery_signatures/${order._id}.png`;
      const fileRef  = bucket.file(filePath);
      const base64   = signatureBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer   = Buffer.from(base64, "base64");

      await fileRef.save(buffer, { metadata: { contentType: "image/png" }, resumable: false });
      signatureStoragePath = filePath;
    } catch (storageErr) {
      console.error("[finalizeHandover] Storage upload failed:", storageErr.message);
      return res.status(500).json({ success: false, message: "Failed to store delivery signature. Please retry." });
    }

    // Step 3: Atomic transaction — update order + append ledger entry
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      order.status               = "DELIVERED";
      order.escrowStatus         = "RELEASED";
      order.signatureStoragePath = signatureStoragePath;
      order.timeline.push({
        status: "DELIVERED", timestamp: new Date(),
        actorId: req.userId, note: "OTP verified. Delivery confirmed. Escrow released.",
      });
      await order.save({ session });

      await EscrowLedger.create([{
        orderId: order._id, entryType: "RELEASE",
        grossTotalKobo:  order.grossTotalKobo,
        platformFeeKobo: order.platformFeeKobo,
        merchantNetKobo: order.merchantNetKobo,
        escrowStatus: "RELEASED", actorId: req.userId,
        noteText: `Escrow released on OTP handover. Order ${order.orderRef}`,
      }], { session });

      await session.commitTransaction();
    } catch (txErr) {
      await session.abortTransaction();
      throw txErr;
    } finally {
      session.endSession();
    }

    // Step 4: Notify buyer and merchant via SSE
    notifyUser(order.buyerId.toString(), "order:status_changed", {
      orderId: order._id, orderRef: order.orderRef,
      newStatus: "DELIVERED", message: "Your order has been delivered. Thank you for shopping at Gimbiya Mall!",
    });
    notifyUser(order.merchantId.toString(), "escrow:released", {
      orderId:          order._id, orderRef: order.orderRef,
      merchantNetKobo:  order.merchantNetKobo,
      merchantNetNaira: order.merchantNetKobo / 100,
      message:          "Escrow released. Funds will be settled in your next cycle.",
    });

    res.status(200).json({
      success:  true,
      orderId:  order._id,
      orderRef: order.orderRef,
      message:  "Delivery confirmed. Escrow released to merchant.",
    });
  } catch (error) {
    console.error("[finalizeHandover]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── UPDATE RIDER GPS ──────────────────────────────────────────────────────────
export const updateLocation = async (req, res) => {
  const { orderId, lat, lng } = req.body;
  try {
    if (!orderId || lat === undefined || lng === undefined) {
      return res.status(400).json({ success: false, message: "orderId, lat, and lng are required" });
    }
    const order = await Order.findOne({ _id: orderId, riderId: req.userId, status: "DISPATCHED" }).lean();
    if (!order) return res.status(404).json({ success: false, message: "Active delivery not found" });

    notifyUser(order.buyerId.toString(), "order:status_changed", {
      orderId, type: "GPS_UPDATE", lat, lng,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
