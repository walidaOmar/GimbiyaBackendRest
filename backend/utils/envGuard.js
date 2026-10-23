/**
 * Fails fast on a production deploy that is missing critical settings.
 * Fatal: JWT_SECRET, MONGODB_URI. Everything else only warns, so a missing optional
 * variable cannot take the site down.
 */
export function assertEnv() {
  if (process.env.NODE_ENV !== "production") return;

  const fatal = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) fatal.push("JWT_SECRET (32+ random characters)");
  if (!process.env.MONGODB_URI) fatal.push("MONGODB_URI");
  if (fatal.length) {
    console.error(`[env] Refusing to start. Missing or weak: ${fatal.join(", ")}`);
    process.exit(1);
  }

  const warn = ["CORS_ALLOWED_ORIGINS", "CLIENT_URL", "MONNIFY_API_KEY", "MONNIFY_SECRET_KEY", "MONNIFY_CONTRACT_CODE", "MAILTRAP_TOKEN"]
    .filter((name) => !process.env[name]);
  if (warn.length) console.warn(`[env] WARNING: not set: ${warn.join(", ")}`);
}
