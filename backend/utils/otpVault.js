import crypto from "crypto";
import { getJwtSecret } from "./jwtSecret.js";

// AES-256-GCM. The key is derived from OTP_ENC_KEY when set, otherwise from the JWT secret.
const key = () => crypto.createHash("sha256").update(`${process.env.OTP_ENC_KEY || getJwtSecret()}|otp-vault`).digest();

export function encryptOtp(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptOtp(packed) {
  try {
    const [iv, tag, enc] = String(packed).split(".").map((p) => Buffer.from(p, "base64"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
