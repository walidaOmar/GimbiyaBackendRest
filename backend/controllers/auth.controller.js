import bcryptjs from "bcryptjs";
import crypto    from "crypto";

import { generateTokenAndSetCookie } from "../utils/generateTokenAndSetCookie.js";
import {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendResetSuccessEmail,
} from "../mailtrap/emails.js";
import { User } from "../models/user.model.js";

// ── SIGNUP ────────────────────────────────────────────────────────────────────
// Taken from MERN starter, extended with role + assignedState + phone
export const signup = async (req, res) => {
  const { email, password, name, phone, role, assignedState } = req.body;

  try {
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: "Name, email, and password are required" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "An account with this email already exists" });
    }

    const hashedPassword      = await bcryptjs.hash(password, 10);
    const verificationToken   = Math.floor(100000 + Math.random() * 900000).toString();

    const user = new User({
      email:                        email.toLowerCase(),
      password:                     hashedPassword,
      name,
      phone:                        phone || "",
      role:                         role || "buyer",
      assignedState:                assignedState || "Abuja",
      verificationToken,
      verificationTokenExpiresAt:   Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    });

    await user.save();

    generateTokenAndSetCookie(res, user._id);
    await sendVerificationEmail(user.email, verificationToken);

    res.status(201).json({
      success: true,
      message: "Account created successfully. Please check your email for your verification code.",
      user: {
        _id:           user._id,
        name:          user.name,
        email:         user.email,
        role:          user.role,
        assignedState: user.assignedState,
        isVerified:    user.isVerified,
        kycStatus:     user.kycStatus,
      },
    });
  } catch (error) {
    console.error("[signup]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── VERIFY EMAIL ──────────────────────────────────────────────────────────────
export const verifyEmail = async (req, res) => {
  const { code } = req.body;

  try {
    if (!code) {
      return res.status(400).json({ success: false, message: "Verification code is required" });
    }

    const user = await User.findOne({
      verificationToken:          code,
      verificationTokenExpiresAt: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired verification code" });
    }

    user.isVerified                    = true;
    user.verificationToken             = undefined;
    user.verificationTokenExpiresAt    = undefined;
    await user.save();

    await sendWelcomeEmail(user.email, user.name);

    res.status(200).json({
      success: true,
      message: "Email verified successfully! Welcome to Gimbiya Mall.",
      user: {
        _id:           user._id,
        name:          user.name,
        email:         user.email,
        role:          user.role,
        assignedState: user.assignedState,
        isVerified:    user.isVerified,
        kycStatus:     user.kycStatus,
      },
    });
  } catch (error) {
    console.error("[verifyEmail]", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: "Account has been suspended. Contact support." });
    }

    const isPasswordValid = await bcryptjs.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    generateTokenAndSetCookie(res, user._id);
    user.lastLogin = new Date();
    await user.save();

    res.status(200).json({
      success: true,
      message: "Logged in successfully",
      user: {
        _id:           user._id,
        name:          user.name,
        email:         user.email,
        role:          user.role,
        assignedState: user.assignedState,
        isVerified:    user.isVerified,
        kycStatus:     user.kycStatus,
        lastLogin:     user.lastLogin,
      },
    });
  } catch (error) {
    console.error("[login]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── LOGOUT ────────────────────────────────────────────────────────────────────
export const logout = async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.status(200).json({ success: true, message: "Logged out successfully" });
};

// ── FORGOT PASSWORD ───────────────────────────────────────────────────────────
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal whether email exists — security best practice
      return res.status(200).json({ success: true, message: "If that email exists, a reset link has been sent." });
    }

    const resetToken          = crypto.randomBytes(20).toString("hex");
    const resetTokenExpiresAt = Date.now() + 1 * 60 * 60 * 1000; // 1 hour

    user.resetPasswordToken       = resetToken;
    user.resetPasswordExpiresAt   = resetTokenExpiresAt;
    await user.save();

    await sendPasswordResetEmail(
      user.email,
      `${process.env.CLIENT_URL}/reset-password/${resetToken}`
    );

    res.status(200).json({ success: true, message: "If that email exists, a reset link has been sent." });
  } catch (error) {
    console.error("[forgotPassword]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── RESET PASSWORD ────────────────────────────────────────────────────────────
export const resetPassword = async (req, res) => {
  const { token }    = req.params;
  const { password } = req.body;

  try {
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const user = await User.findOne({
      resetPasswordToken:       token,
      resetPasswordExpiresAt:   { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset token" });
    }

    user.password               = await bcryptjs.hash(password, 10);
    user.resetPasswordToken     = undefined;
    user.resetPasswordExpiresAt = undefined;
    await user.save();

    await sendResetSuccessEmail(user.email);

    res.status(200).json({ success: true, message: "Password reset successful. You can now log in." });
  } catch (error) {
    console.error("[resetPassword]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── CHECK AUTH ────────────────────────────────────────────────────────────────
export const checkAuth = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("[checkAuth]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
