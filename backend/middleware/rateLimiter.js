import rateLimit from "express-rate-limit";

// General API: 120 requests per minute per IP
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      120,
  message:  { success: false, message: "Too many requests — please slow down." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// Auth endpoints: 10 attempts per minute (prevents brute force)
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      10,
  message:  { success: false, message: "Too many auth attempts — please wait before trying again." },
});

// Checkout: 5 per minute (prevents order flooding)
export const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      5,
  message:  { success: false, message: "Too many checkout attempts." },
});
