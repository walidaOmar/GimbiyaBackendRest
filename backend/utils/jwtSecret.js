const DEV_ONLY_SECRET = "dev-only-secret-never-use-in-production";

/**
 * Read at call time (not import time) so dotenv has already loaded.
 * In production a missing or short secret stops the request instead of silently
 * signing tokens with a publicly known default.
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set to a random string of at least 32 characters in production");
  }
  return secret || DEV_ONLY_SECRET;
}
