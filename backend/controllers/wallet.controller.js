import crypto from "crypto";
import mongoose from "mongoose";
import { WalletEntry } from "../models/walletEntry.model.js";
import { Withdrawal } from "../models/withdrawal.model.js";
import { User } from "../models/user.model.js";
import { balanceKobo } from "../services/walletService.js";
import { listBanks, validateBankAccount, initiateTransfer, isMonnifySandbox } from "../services/monnifyService.js";
import { writeAuditLog } from "../utils/auditLogger.js";
import { notifyUser } from "../utils/sseService.js";

const MIN_WITHDRAWAL_KOBO = 100000; // ₦1,000
const mongoId = (v) => new mongoose.Types.ObjectId(String(v));

export const getMyWallet = async (req, res) => {
  try {
    const userId = mongoId(req.userId);
    const [balance, entries, withdrawals] = await Promise.all([
      balanceKobo(userId),
      WalletEntry.find({ userId }).sort({ createdAt: -1 }).limit(50).lean(),
      Withdrawal.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    res.json({ success: true, data: { balanceKobo: balance, minWithdrawalKobo: MIN_WITHDRAWAL_KOBO, entries, withdrawals } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load your wallet" });
  }
};

let bankCache = { at: 0, list: [] };
export const getBanks = async (req, res) => {
  try {
    if (Date.now() - bankCache.at > 3600 * 1000 || !bankCache.list.length) {
      bankCache = { at: Date.now(), list: await listBanks() };
    }
    res.json({ success: true, data: bankCache.list });
  } catch (error) {
    console.error("[getBanks]", error?.response?.data || error.message);
    res.status(502).json({ success: false, message: "Could not load the bank list right now." });
  }
};

export const requestWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const amountKobo = Number(req.body.amountKobo);
    const { bankCode, accountNumber } = req.body;
    if (!Number.isInteger(amountKobo) || amountKobo < MIN_WITHDRAWAL_KOBO) {
      return res.status(400).json({ success: false, message: "The minimum withdrawal is ₦1,000." });
    }
    if (!/^\d{3,6}$/.test(String(bankCode || "")) || !/^\d{10}$/.test(String(accountNumber || ""))) {
      return res.status(400).json({ success: false, message: "Choose a bank and enter a 10-digit account number." });
    }
    if (req.user.kycStatus !== "APPROVED") {
      return res.status(403).json({ success: false, message: "Your account must be verified before you can withdraw." });
    }
    if (await Withdrawal.exists({ userId: req.userId, status: { $in: ["REQUESTED", "APPROVED"] } })) {
      return res.status(409).json({ success: false, message: "You already have a withdrawal waiting. Wait for it to finish first." });
    }

    // Account name check only works on live Monnify; in sandbox we store what the user typed.
    let accountName = String(req.body.accountName || "").slice(0, 100);
    let bankName = String(req.body.bankName || "").slice(0, 80);
    if (!isMonnifySandbox()) {
      try {
        const verified = await validateBankAccount({ accountNumber, bankCode });
        accountName = verified.accountName;
      } catch {
        return res.status(400).json({ success: false, message: "We could not verify that bank account. Check the number and bank." });
      }
    }

    let created;
    await session.withTransaction(async () => {
      // Writing to the user row makes two simultaneous requests collide, so the same balance cannot be spent twice.
      await User.updateOne({ _id: req.userId }, { $inc: { walletLock: 1 } }, { session });
      const balance = await balanceKobo(mongoId(req.userId), session);
      if (balance < amountKobo) { const e = new Error("INSUFFICIENT"); e.code = "INSUFFICIENT"; e.balance = balance; throw e; }
      const [withdrawal] = await Withdrawal.create([{
        userId: req.userId, amountKobo, bankCode: String(bankCode), bankName, accountNumber: String(accountNumber), accountName,
        reference: `WD-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      }], { session });
      await WalletEntry.create([{ userId: req.userId, kind: "WITHDRAWAL_HOLD", amountKobo: -amountKobo, withdrawalId: withdrawal._id, note: `Withdrawal ${withdrawal.reference}` }], { session });
      created = withdrawal;
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    if (error.code === "INSUFFICIENT") return res.status(400).json({ success: false, message: "Your wallet balance is too low for that amount." });
    console.error("[requestWithdrawal]", error);
    res.status(500).json({ success: false, message: "Could not request the withdrawal" });
  } finally {
    session.endSession();
  }
};

// ── HQ ─────────────────────────────────────────────────────────────────────────
export const listWithdrawals = async (req, res) => {
  try {
    const filter = req.query.status ? { status: String(req.query.status) } : {};
    const rows = await Withdrawal.find(filter).sort({ createdAt: -1 }).limit(100).populate("userId", "name email role assignedState").lean();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load withdrawals" });
  }
};

const transfersEnabled = () => process.env.MONNIFY_TRANSFERS_ENABLED === "true" && Boolean(process.env.MONNIFY_WALLET_ACCOUNT_NUMBER);

export const approveWithdrawal = async (req, res) => {
  try {
    const w = await Withdrawal.findOneAndUpdate({ _id: req.params.id, status: "REQUESTED" }, { $set: { status: "APPROVED", reviewedBy: req.userId } }, { new: true });
    if (!w) return res.status(409).json({ success: false, message: "Only a waiting withdrawal can be approved." });

    let message = "Approved. Pay it from the Monnify dashboard, then mark it as paid.";
    if (transfersEnabled()) {
      try {
        const result = await initiateTransfer({ amountNaira: w.amountKobo / 100, reference: w.reference, narration: "Gimbiya Mall payout", bankCode: w.bankCode, accountNumber: w.accountNumber });
        w.monnifyRef = result?.reference || w.reference;
        if (result?.status === "SUCCESS") { w.status = "PAID"; w.paidAt = new Date(); message = "Paid out through Monnify."; }
        else message = `Sent to Monnify (status: ${result?.status || "pending"}). Mark it paid once the bank confirms.`;
        await w.save();
      } catch (error) {
        console.error("[approveWithdrawal] transfer failed", error?.response?.data || error.message);
        message = "Approved, but the automatic transfer failed. Pay it manually and mark it as paid.";
      }
    }
    await writeAuditLog({ action: "WITHDRAWAL_APPROVED", performedBy: req.userId, targetType: "Withdrawal", targetId: w._id, newValue: { status: w.status, amountKobo: w.amountKobo } });
    notifyUser(String(w.userId), "wallet:withdrawal", { message: "Your withdrawal was approved." });
    res.json({ success: true, message, data: w });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not approve the withdrawal" });
  }
};

export const markWithdrawalPaid = async (req, res) => {
  try {
    const w = await Withdrawal.findOneAndUpdate(
      { _id: req.params.id, status: { $in: ["APPROVED", "FAILED"] } },
      { $set: { status: "PAID", paidAt: new Date(), reviewedBy: req.userId, reviewNote: String(req.body.note || "").slice(0, 300) } },
      { new: true }
    );
    if (!w) return res.status(409).json({ success: false, message: "Only an approved withdrawal can be marked as paid." });
    await writeAuditLog({ action: "WITHDRAWAL_PAID", performedBy: req.userId, targetType: "Withdrawal", targetId: w._id, newValue: { amountKobo: w.amountKobo } });
    notifyUser(String(w.userId), "wallet:withdrawal", { message: "Your withdrawal was paid." });
    res.json({ success: true, data: w });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not update the withdrawal" });
  }
};

// Rejecting puts the held money back into the user's wallet.
export const rejectWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const note = String(req.body.note || "").trim();
    if (note.length < 5) return res.status(400).json({ success: false, message: "Give a reason of at least 5 characters." });
    let result;
    await session.withTransaction(async () => {
      const w = await Withdrawal.findOneAndUpdate({ _id: req.params.id, status: { $in: ["REQUESTED", "APPROVED", "FAILED"] } }, { $set: { status: "REJECTED", reviewedBy: req.userId, reviewNote: note.slice(0, 300) } }, { new: true, session });
      if (!w) return;
      await WalletEntry.create([{ userId: w.userId, kind: "WITHDRAWAL_RELEASE", amountKobo: w.amountKobo, withdrawalId: w._id, note: `Withdrawal ${w.reference} rejected` }], { session });
      result = w;
    });
    if (!result) return res.status(409).json({ success: false, message: "This withdrawal can no longer be rejected." });
    await writeAuditLog({ action: "WITHDRAWAL_REJECTED", performedBy: req.userId, targetType: "Withdrawal", targetId: result._id, newValue: { note } });
    notifyUser(String(result.userId), "wallet:withdrawal", { message: "Your withdrawal was rejected and the money is back in your wallet." });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not reject the withdrawal" });
  } finally {
    session.endSession();
  }
};

// Platform revenue totals for HQ.
export const platformSummary = async (req, res) => {
  try {
    const rows = await WalletEntry.aggregate([{ $match: { userId: null } }, { $group: { _id: "$kind", totalKobo: { $sum: "$amountKobo" }, count: { $sum: 1 } } }]);
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load the summary" });
  }
};
