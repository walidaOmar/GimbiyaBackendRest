import express from "express";
import {
  signup,
  verifyEmail,
  login,
  logout,
  forgotPassword,
  resetPassword,
  checkAuth,
} from "../controllers/auth.controller.js";
import { verifyToken }  from "../middleware/verifyToken.js";
import { authLimiter }  from "../middleware/rateLimiter.js";

const router = express.Router();

// Public routes
router.post("/signup",        authLimiter, signup);
router.post("/verify-email",  authLimiter, verifyEmail);
router.post("/login",         authLimiter, login);
router.post("/logout",        logout);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password/:token", authLimiter, resetPassword);

// Protected — requires valid JWT cookie
router.get("/check-auth", verifyToken, checkAuth);

export default router;
