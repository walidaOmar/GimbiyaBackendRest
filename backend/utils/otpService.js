import bcryptjs from "bcryptjs";

const ROUNDS = parseInt(process.env.OTP_BCRYPT_ROUNDS || "10", 10);

/**
 * createOtpPair
 * Generates a 4-digit OTP and its bcrypt hash atomically.
 * rawOtp  → return to buyer UI ONLY, once, never store
 * otpHash → store in order.riderOtpHash, never expose
 */
export async function createOtpPair() {
  const rawOtp  = String(Math.floor(1000 + Math.random() * 9000));
  const otpHash = await bcryptjs.hash(rawOtp, ROUNDS);
  return { rawOtp, otpHash };
}

/**
 * verifyOtp
 * Compares rider-submitted OTP against stored bcrypt hash.
 */
export async function verifyOtp(submittedOtp, storedHash) {
  return bcryptjs.compare(submittedOtp, storedHash);
}
