const isProduction = process.env.NODE_ENV === "production";

/** Small set of safe response headers for a JSON API (no extra dependency). */
export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
  if (isProduction) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  next();
}
