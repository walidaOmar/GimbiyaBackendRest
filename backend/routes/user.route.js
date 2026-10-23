import express from "express";
import { User, USER_ROLES, NIGERIAN_STATES } from "../models/user.model.js";
import { writeAuditLog } from "../utils/auditLogger.js";
import { verifyToken, requireRole, requireVerified } from "../middleware/verifyToken.js";

const router = express.Router();

// GET /api/users/me — get own profile
router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password").lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/users/me — update own profile (name, phone)
router.patch("/me", verifyToken, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const updates = {};
    if (name)  updates.name  = name;
    if (phone) updates.phone = phone;

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true })
      .select("-password");
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/users — list users (CEO / coordinator only)
router.get(
  "/",
  verifyToken,
  requireRole("super_admin", "developer_coordinator"),
  async (req, res) => {
    try {
      const { role, assignedState, page = 1, limit = 20 } = req.query;
      const filter = {};

      // Coordinators can only see users in their own state
      if (req.userRole === "developer_coordinator") {
        filter.assignedState = req.userState;
      } else if (assignedState) {
        filter.assignedState = assignedState;
      }

      if (role) filter.role = role;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const [users, total] = await Promise.all([
        User.find(filter).select("-password").skip(skip).limit(parseInt(limit)).lean(),
        User.countDocuments(filter),
      ]);

      res.status(200).json({
        success: true, users,
        pagination: { page: parseInt(page), limit: parseInt(limit), total },
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// GET /api/users/:id — get any user by ID (CEO only)
router.get(
  "/:id",
  verifyToken,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id).select("-password").lean();
      if (!user) return res.status(404).json({ success: false, message: "User not found" });
      res.status(200).json({ success: true, user });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// PATCH /api/users/:id/role — update role (CEO only)
router.patch(
  "/:id/role",
  verifyToken,
  requireRole("super_admin"),
  async (req, res) => {
    try {
      const { role, assignedState } = req.body;
      if (!role) return res.status(400).json({ success: false, message: "role is required" });
      if (!USER_ROLES.includes(role)) {
        return res.status(400).json({ success: false, message: "Unknown role" });
      }
      if (role === "super_admin") {
        return res.status(403).json({ success: false, message: "super_admin cannot be granted through the API" });
      }
      if (assignedState && !NIGERIAN_STATES.includes(assignedState)) {
        return res.status(400).json({ success: false, message: "Unknown market / node" });
      }
      if (String(req.params.id) === String(req.userId)) {
        return res.status(400).json({ success: false, message: "You cannot change your own role" });
      }

      const before = await User.findById(req.params.id).select("role assignedState").lean();
      if (!before) return res.status(404).json({ success: false, message: "User not found" });
      if (before.role === "super_admin") {
        return res.status(403).json({ success: false, message: "A super_admin account cannot be changed through the API" });
      }

      const updates = { role };
      if (assignedState) updates.assignedState = assignedState;

      const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
        .select("-password");

      await writeAuditLog({
        action: "ROLE_CHANGED",
        performedBy: req.userId,
        targetType: "User",
        targetId: user._id,
        oldValue: before,
        newValue: { role: user.role, assignedState: user.assignedState },
        req,
      });

      res.status(200).json({ success: true, user, message: "Role updated successfully" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

export default router;
