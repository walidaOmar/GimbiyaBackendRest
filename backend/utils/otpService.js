import bcryptjs from "bcryptjs";
import crypto from "crypto";

const ROUNDS = parseInt(process.env.OTP_BCRYPT_ROUNDS || "10", 10);

export const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || "5", 10);
export const OTP_LOCK_MINUTES = parseInt(process.env.OTP_LOCK_MINUTES || "15", 10);

/**
 * createOtpPair
 * Generates a 4-digit OTP (cryptographically random) and its bcrypt hash.
 * rawOtp  -> return to buyer UI ONLY, once, never store
 * otpHash -> store in riderOtpHash, never expose
 */
export async function createOtpPair() {
  const rawOtp = String(crypto.randomInt(1000, 10000));
  const otpHash = await bcryptjs.hash(rawOtp, ROUNDS);
  return { rawOtp, otpHash };
}

export async function verifyOtp(submittedOtp, storedHash) {
  return bcryptjs.compare(submittedOtp, storedHash);
}

/** Minutes left on a lock, or 0 when not locked. */
export function otpLockMinutesLeft(doc) {
  if (!doc?.otpLockedUntil) return 0;
  const ms = new Date(doc.otpLockedUntil).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

/**
 * Records a wrong code against an Order or FulfillmentGroup (atomic $inc).
 * After OTP_MAX_ATTEMPTS wrong codes the delivery locks for OTP_LOCK_MINUTES.
 */
export async function recordOtpFailure(Model, id) {
  const updated = await Model.findByIdAndUpdate(id, { $inc: { otpAttempts: 1 } }, { new: true }).select("otpAttempts");
  const attempts = updated?.otpAttempts || 0;
  if (attempts >= OTP_MAX_ATTEMPTS) {
    await Model.updateOne(
      { _id: id },
      { $set: { otpAttempts: 0, otpLockedUntil: new Date(Date.now() + OTP_LOCK_MINUTES * 60000) } }
    );
    return { locked: true, attemptsLeft: 0 };
  }
  return { locked: false, attemptsLeft: OTP_MAX_ATTEMPTS - attempts };
}
