import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

/**
 * verifyToken
 * Verifies the JWT from the httpOnly cookie or an Authorization Bearer header.
 * Attaches req.userId, req.user, req.userRole, req.userState.
 */
export const verifyToken = async (req, res, next) => {
  const cookieToken = req.cookies?.token;
  const headerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const token = cookieToken || headerToken;

  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized — no token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded?.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized — invalid token" });
    }

    const user = await User.findById(decoded.userId).select("-password");
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "Unauthorized — account not found or inactive" });
    }

    req.userId = decoded.userId;
    req.user = user;
    req.userRole = user.role;
    req.userState = user.assignedState;

    next();
  } catch (error) {
    console.error("[verifyToken]", error.message);
    return res.status(401).json({ success: false, message: "Unauthorized — token expired or invalid" });
  }
};

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

export const requireVerified = (req, res, next) => {
  if (!req.user?.isVerified) {
    return res.status(403).json({
      success: false,
      message: "Email not verified — please verify your email address first",
    });
  }
  next();
};

export const requireKyc = (req, res, next) => {
  if (req.user?.kycStatus !== "APPROVED") {
    return res.status(403).json({
      success: false,
      message: "KYC verification required — your account is pending approval",
    });
  }
  next();
};
