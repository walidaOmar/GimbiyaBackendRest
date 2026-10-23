import crypto from "crypto";
import bcryptjs from "bcryptjs";
import { Invite } from "../models/invite.model.js";
import { User, NIGERIAN_STATES } from "../models/user.model.js";
import { Store } from "../models/store.model.js";
import { Business } from "../models/business.model.js";
import { Branch } from "../models/branch.model.js";
import {
  canInvite, allowedBusinessTypes, isGlobalRole, NODE_STATE, ROLE_LABEL, BUSINESS_TYPE_LABEL, INVITE_TTL_HOURS, HQ_ROLES, STAFF_ROLES,
} from "../policy/invitePolicy.v1.js";
import { TIER_FOR_BUSINESS } from "../policy/marketVisibility.v1.js";
import { enforceCap } from "../services/subscriptionService.js";
import { sendInviteEmail } from "../mailtrap/inviteEmail.js";
import { notifyUser } from "../utils/sseService.js";
import { writeAuditLog } from "../utils/auditLogger.js";

const NODES = NIGERIAN_STATES.filter((s) => s !== "Global");
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isHQ = (role) => HQ_ROLES.includes(role);
const text = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const defaultFloor = (node) => (node === "Tafawa balewa refinery" ? "LEVEL_2" : "LEVEL_1");

export const createInvite = async (req, res) => {
  try {
    const { email, name = "", role } = req.body || {};
    let { assignedState } = req.body || {};

    if (!email || !EMAIL_RE.test(String(email))) return res.status(400).json({ success: false, message: "A valid email is required" });
    if (!role || !canInvite(req.userRole, role)) {
      return res.status(403).json({ success: false, message: "You are not allowed to invite that role" });
    }

    let businessType = null;
    let businessName = "";
    let storeId = null;
    let attributedAffiliateId = null;

    // Where the person will work.
    if (req.userRole === "developer_coordinator" || req.userRole === "affiliate") assignedState = req.userState; // always their own node
    if (isGlobalRole(role)) assignedState = "Global";

    if (role === "business_owner") {
      businessType = text(req.body.businessType, 30);
      businessName = text(req.body.businessName, 120);
      if (!allowedBusinessTypes(req.userRole).includes(businessType)) {
        return res.status(403).json({ success: false, message: "You cannot invite that type of business" });
      }
      if (businessName.length < 2) return res.status(400).json({ success: false, message: "Enter the business name" });
      if (req.userRole === "affiliate") attributedAffiliateId = req.userId; // the affiliate is credited automatically
      else if (req.body.affiliateId) {
        const aff = await User.findOne({ _id: req.body.affiliateId, role: "affiliate", isActive: true }).select("assignedState").lean();
        if (!aff || (assignedState && aff.assignedState !== assignedState)) {
          return res.status(400).json({ success: false, message: "That affiliate does not work in this market" });
        }
        attributedAffiliateId = aff._id;
      }
    }

    if (STAFF_ROLES.includes(role)) {
      const store = req.userRole === "business_owner"
        ? await Store.findOne({ businessOwnerId: req.userId, verificationStatus: "VERIFIED" })
        : await Store.findOne({ _id: req.body.storeId, verificationStatus: "VERIFIED" });
      if (!store) return res.status(400).json({ success: false, message: req.userRole === "business_owner" ? "Your store must be verified before you can invite staff." : "Choose a verified store" });
      if (req.userRole === "developer_coordinator" && store.primaryState !== req.userState) {
        return res.status(403).json({ success: false, message: "That store is in another market" });
      }
      const cap = await enforceCap(store, "staff");
      if (!cap.ok) return res.status(403).json({ success: false, code: "PLAN_LIMIT", message: cap.message });
      storeId = store._id;
      assignedState = store.primaryState;
    }

    if (assignedState !== "Global" && !NODES.includes(assignedState)) return res.status(400).json({ success: false, message: "Choose a valid market / node" });

    const cleanEmail = String(email).toLowerCase().trim();
    if (await User.exists({ email: cleanEmail })) {
      return res.status(409).json({ success: false, message: "An account with this email already exists" });
    }

    // Re-inviting replaces any earlier pending invite for the same email.
    await Invite.updateMany({ email: cleanEmail, status: "PENDING" }, { $set: { status: "REVOKED" } });

    const token = crypto.randomBytes(32).toString("hex");
    const invite = await Invite.create({
      tokenHash: hash(token),
      email: cleanEmail,
      name: text(name, 120),
      role,
      assignedState,
      businessType,
      businessName,
      attributedAffiliateId,
      storeId,
      invitedBy: req.userId,
      inviterRole: req.userRole,
      expiresAt: new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000),
    });

    const inviteUrl = `${(process.env.CLIENT_URL || "").replace(/\/+$/, "")}/invite/${token}`;
    const emailSent = await sendInviteEmail({
      email: cleanEmail,
      name: invite.name,
      roleLabel: role === "business_owner" ? `${BUSINESS_TYPE_LABEL[businessType]} (${businessName})` : ROLE_LABEL[role],
      nodeLabel: assignedState === "Global" ? "all markets" : `${assignedState} (${NODE_STATE[assignedState]})`,
      inviterName: req.user.name,
      inviteUrl,
      hours: INVITE_TTL_HOURS,
    });
    if (emailSent) await Invite.updateOne({ _id: invite._id }, { $set: { emailSent: true } });

    // The raw link is shown once, so the inviter can send it on WhatsApp if the email does not arrive.
    res.status(201).json({ success: true, inviteId: invite._id, inviteUrl, emailSent, expiresAt: invite.expiresAt });
  } catch (error) {
    console.error("[createInvite]", error);
    res.status(500).json({ success: false, message: "Could not create the invitation" });
  }
};

export const listInvites = async (req, res) => {
  try {
    const filter = {};
    if (!isHQ(req.userRole)) filter.invitedBy = req.userId; // everyone except HQ sees only their own
    if (req.query.status) filter.status = String(req.query.status);
    const invites = await Invite.find(filter)
      .select("-tokenHash")
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("invitedBy", "name")
      .lean();
    const now = Date.now();
    res.json({
      success: true,
      invites: invites.map((i) => ({ ...i, displayStatus: i.status === "PENDING" && new Date(i.expiresAt).getTime() < now ? "EXPIRED" : i.status })),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load invitations" });
  }
};

export const revokeInvite = async (req, res) => {
  try {
    const filter = { _id: req.params.inviteId, status: "PENDING" };
    if (!isHQ(req.userRole)) filter.invitedBy = req.userId;
    const invite = await Invite.findOneAndUpdate(filter, { $set: { status: "REVOKED" } }, { new: true });
    if (!invite) return res.status(404).json({ success: false, message: "Pending invite not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not revoke the invitation" });
  }
};

// What the invite form may offer this person: roles, business types, and (for staff) stores.
export const inviteOptions = async (req, res) => {
  try {
    const roles = ["developer_coordinator", "affiliate", "support", "auditor", "business_owner", "delivery", "manager", "stock_manager"].filter((r) => canInvite(req.userRole, r));
    const data = {
      roles: roles.map((r) => ({ value: r, label: ROLE_LABEL[r] })),
      businessTypes: allowedBusinessTypes(req.userRole).map((t) => ({ value: t, label: BUSINESS_TYPE_LABEL[t] })),
      fixedNode: ["developer_coordinator", "affiliate"].includes(req.userRole) ? req.userState : null,
      stores: [],
      affiliates: [],
    };
    if (req.userRole === "developer_coordinator" || isHQ(req.userRole)) {
      const scope = req.userRole === "developer_coordinator" ? { primaryState: req.userState } : {};
      data.stores = (await Store.find({ verificationStatus: "VERIFIED", ...scope }).select("businessName primaryState businessType").limit(300).lean())
        .map((s) => ({ value: String(s._id), label: `${s.businessName} (${s.primaryState})` }));
      const affScope = req.userRole === "developer_coordinator" ? { assignedState: req.userState } : {};
      data.affiliates = (await User.find({ role: "affiliate", isActive: true, ...affScope }).select("name assignedState").limit(300).lean())
        .map((u) => ({ value: String(u._id), label: `${u.name} (${u.assignedState})` }));
    }
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load options" });
  }
};

// ── Merchant approval (HQ only) ────────────────────────────────────────────────────────
export const listPendingMerchants = async (req, res) => {
  try {
    const filter = { verificationStatus: "PENDING", submitterRole: "invite" };
    if (req.userRole === "developer_coordinator") filter.primaryState = req.userState;
    const stores = await Store.find(filter).sort({ createdAt: -1 }).limit(100)
      .populate("businessOwnerId", "name email phone")
      .populate("referredByAffiliateId", "name")
      .select("-nin -tinNumber -cacNumber -homeAddress") // sensitive identity numbers are not shown in the list
      .lean();
    res.json({ success: true, data: stores });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load pending merchants" });
  }
};

export const getPendingMerchantDetail = async (req, res) => {
  try {
    const store = await Store.findOne({ _id: req.params.storeId, verificationStatus: "PENDING" }).populate("businessOwnerId", "name email phone").lean();
    if (!store) return res.status(404).json({ success: false, message: "Pending store not found" });
    res.json({ success: true, data: store });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load the store" });
  }
};

export const verifyMerchant = async (req, res) => {
  try {
    const store = await Store.findOneAndUpdate(
      { _id: req.params.storeId, verificationStatus: "PENDING" },
      { $set: { verificationStatus: "VERIFIED", reviewedBy: req.userId, reviewedAt: new Date(), reviewNote: text(req.body.note, 300) } },
      { new: true }
    );
    if (!store) return res.status(409).json({ success: false, message: "This store is not waiting for approval." });

    await Business.updateOne({ ownerId: store.businessOwnerId }, { $set: { isApproved: true } });
    await User.updateOne({ _id: store.businessOwnerId }, { $set: { kycStatus: "APPROVED", kycTier: 2 } });
    if (!(await Branch.exists({ storeId: store._id }))) {
      await Branch.create({ storeId: store._id, branchName: `${store.businessName} - Main`, assignedState: store.primaryState, buildingFloor: defaultFloor(store.primaryState) });
    }
    await writeAuditLog({ action: "STORE_VERIFIED", performedBy: req.userId, targetType: "Store", targetId: store._id, newValue: { businessName: store.businessName } });
    notifyUser(String(store.businessOwnerId), "store:verified", { message: "Your store was approved. You can start listing now." });
    res.json({ success: true });
  } catch (error) {
    console.error("[verifyMerchant]", error);
    res.status(500).json({ success: false, message: "Could not approve the store" });
  }
};

export const rejectMerchant = async (req, res) => {
  try {
    const note = text(req.body.note, 300);
    if (note.length < 5) return res.status(400).json({ success: false, message: "Give a reason of at least 5 characters." });
    const store = await Store.findOneAndUpdate(
      { _id: req.params.storeId, verificationStatus: "PENDING" },
      { $set: { verificationStatus: "SUSPENDED", reviewedBy: req.userId, reviewedAt: new Date(), reviewNote: note } },
      { new: true }
    );
    if (!store) return res.status(409).json({ success: false, message: "This store is not waiting for approval." });
    await writeAuditLog({ action: "STORE_REJECTED", performedBy: req.userId, targetType: "Store", targetId: store._id, reason: note });
    notifyUser(String(store.businessOwnerId), "store:rejected", { message: "Your store application was not approved." });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not reject the store" });
  }
};

// ── Public (no login) ───────────────────────────────────────────────────────────────────
const findOpenInvite = (token) =>
  Invite.findOne({ tokenHash: hash(String(token)), status: "PENDING", expiresAt: { $gt: new Date() } });

export const previewInvite = async (req, res) => {
  try {
    const invite = await findOpenInvite(req.params.token).lean();
    if (!invite) return res.status(404).json({ success: false, message: "This invitation is invalid, used or expired" });
    res.json({
      success: true,
      invite: {
        email: invite.email,
        name: invite.name,
        role: invite.role,
        roleLabel: ROLE_LABEL[invite.role],
        assignedState: invite.assignedState,
        stateName: NODE_STATE[invite.assignedState] || "All markets",
        needsResidence: invite.role === "developer_coordinator",
        needsBusinessDetails: invite.role === "business_owner",
        businessType: invite.businessType,
        businessTypeLabel: BUSINESS_TYPE_LABEL[invite.businessType] || null,
        businessName: invite.businessName,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not read the invitation" });
  }
};

export const acceptInvite = async (req, res) => {
  const { password, name, phone, residentState } = req.body || {};
  try {
    if (!password || String(password).length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    const preview = await findOpenInvite(req.params.token).lean();
    if (!preview) return res.status(404).json({ success: false, message: "This invitation is invalid, used or expired" });

    const finalName = text(name || preview.name, 120);
    if (finalName.length < 2) return res.status(400).json({ success: false, message: "Please enter your full name" });

    // Coordinators must live in the state their node is in.
    if (preview.role === "developer_coordinator" && residentState !== NODE_STATE[preview.assignedState]) {
      return res.status(400).json({ success: false, message: `A coordinator for this node must live in ${NODE_STATE[preview.assignedState]}` });
    }

    // Business owners must give the details HQ needs to verify them.
    let biz = null;
    if (preview.role === "business_owner") {
      biz = {
        nin: text(req.body.nin, 30), cacNumber: text(req.body.cacNumber, 30), tinNumber: text(req.body.tinNumber, 30),
        businessAddress: text(req.body.businessAddress, 250), homeAddress: text(req.body.homeAddress, 250),
        businessPhone: text(req.body.businessPhone || phone, 30),
      };
      if (!biz.nin || !biz.cacNumber || !biz.tinNumber || biz.businessAddress.length < 5 || biz.homeAddress.length < 5) {
        return res.status(400).json({ success: false, message: "NIN, CAC number, TIN, business address and home address are all required" });
      }
    }

    // Claim first (one-time use), then create the user; release the claim if creation fails.
    const claimed = await Invite.findOneAndUpdate(
      { _id: preview._id, status: "PENDING", expiresAt: { $gt: new Date() } },
      { $set: { status: "ACCEPTED", acceptedAt: new Date() } },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ success: false, message: "This invitation was just used" });

    const isMerchant = claimed.role === "business_owner";
    let user;
    let store = null;
    try {
      user = await User.create({
        email: claimed.email,
        password: await bcryptjs.hash(String(password), 10),
        name: finalName,
        phone: phone ? text(phone, 30) : "",
        role: claimed.role,
        assignedState: claimed.assignedState,
        residentState: claimed.role === "developer_coordinator" ? residentState : null,
        isVerified: true, // they proved they own the email by opening the link
        isActive: true,
        // Merchants stay PENDING until HQ verifies the store; everyone else was vouched for by their inviter.
        kycStatus: isMerchant ? "PENDING" : "APPROVED",
        onboardedBy: claimed.invitedBy,
        onboardingDate: new Date(),
        onboardingSource: "invite",
      });

      if (isMerchant) {
        const type = claimed.businessType;
        store = await Store.create({
          businessName: claimed.businessName, businessEmail: claimed.email, businessPhone: biz.businessPhone,
          nin: biz.nin, cacNumber: biz.cacNumber, tinNumber: biz.tinNumber,
          businessAddress: biz.businessAddress, homeAddress: biz.homeAddress,
          businessOwnerId: user._id, onboardedBy: claimed.invitedBy,
          referredByAffiliateId: claimed.attributedAffiliateId || null,
          referralAttributedBy: claimed.attributedAffiliateId ? claimed.invitedBy : null,
          referralAttributedAt: claimed.attributedAffiliateId ? new Date() : null,
          verificationStatus: "PENDING", primaryState: claimed.assignedState,
          commerceSegment: type, businessType: type, marketTier: TIER_FOR_BUSINESS[type] || "consumer",
          submittedBy: claimed.invitedBy, submitterRole: "invite",
        });
        await Business.create({ name: claimed.businessName, email: claimed.email, ownerId: user._id, assignedState: claimed.assignedState, segment: type, isApproved: false });
      }

      // Staff join their store's first branch that still has the seat free.
      if (STAFF_ROLES.includes(claimed.role) && claimed.storeId) {
        const field = claimed.role === "manager" ? "managerId" : "stockManagerId";
        await Branch.findOneAndUpdate({ storeId: claimed.storeId, isActive: true, [field]: null }, { $set: { [field]: user._id } });
      }
    } catch (error) {
      if (store) await Store.deleteOne({ _id: store._id }).catch(() => {});
      if (user) await User.deleteOne({ _id: user._id }).catch(() => {});
      await Invite.updateOne({ _id: claimed._id }, { $set: { status: "PENDING", acceptedAt: null } });
      if (error.code === 11000) return res.status(409).json({ success: false, message: "An account with this email already exists" });
      throw error;
    }

    await Invite.updateOne({ _id: claimed._id }, { $set: { acceptedUserId: user._id } });
    notifyUser(String(claimed.invitedBy), "invite:accepted", { message: `${user.name} accepted your invitation as ${ROLE_LABEL[user.role]}.` });

    res.status(201).json({
      success: true,
      message: isMerchant ? "Account created. HQ will verify your business, then you can start listing. You can sign in now." : "Account created. You can sign in now.",
    });
  } catch (error) {
    console.error("[acceptInvite]", error);
    res.status(500).json({ success: false, message: "Could not accept the invitation" });
  }
};
