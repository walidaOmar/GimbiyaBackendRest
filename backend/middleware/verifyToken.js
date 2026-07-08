import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

/**
 * verifyToken
 * Verifies the JWT from the httpOnly cookie.
 * Attaches req.userId, req.user (full doc), req.userRole, req.userState.
 * Based on MERN starter pattern — extended with role/state for RBAC.
 */
export const verifyToken = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized — no token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded) {
      return res.status(401).json({ success: false, message: "Unauthorized — invalid token" });
    }

    // Fetch full user document to get role, state, permissions
    const user = await User.findById(decoded.userId).select("-password");
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "Unauthorized — account not found or inactive" });
    }

    req.userId    = decoded.userId;
    req.user      = user;
    req.userRole  = user.role;
    req.userState = user.assignedState;

    next();
  } catch (error) {
    console.error("[verifyToken]", error.message);
    return res.status(401).json({ success: false, message: "Unauthorized — token expired or invalid" });
  }
};

/**
 * requireRole
 * Middleware factory — restricts route to specific roles.
 * Usage: router.get("/admin", verifyToken, requireRole("super_admin"), handler)
 */
export const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden — required role(s): [${allowedRoles.join(", ")}]. Your role: ${req.userRole}`,
      });
    }
    next();
  };
};

/**
 * requireVerified
 * Ensures the user has verified their email before accessing protected routes.
 */
export const requireVerified = (req, res, next) => {
  if (!req.user?.isVerified) {
    return res.status(403).json({
      success: false,
      message: "Email not verified — please verify your email address first",
    });
  }
  next();
};

/**
 * requireKyc
 * Ensures KYC has been approved for roles that require it (merchants, riders).
 */
export const requireKyc = (req, res, next) => {
  if (req.user?.kycStatus !== "APPROVED") {
    return res.status(403).json({
      success: false,
      message: "KYC verification required — your account is pending approval",
    });
  }
  next();
};
