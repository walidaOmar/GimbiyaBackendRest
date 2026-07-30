import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import { Store } from "../models/store.model.js";
import { Branch } from "../models/branch.model.js";
import { User } from "../models/user.model.js";

export const getStores = async (req, res) => {
  try {
    const { status = "VERIFIED", state, page = 1, limit = 20, search } = req.query;
    const filter = {};

    if (status) filter.verificationStatus = status;
    if (state) filter.primaryState = state;
    if (search) {
      filter.$or = [
        { businessName: { $regex: search, $options: "i" } },
        { businessEmail: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [stores, total] = await Promise.all([
      Store.find(filter)
        .populate("businessOwnerId", "name email phone role isActive")
        .populate("onboardedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Store.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      stores,
      pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total },
    });
  } catch (error) {
    console.error("[getStores]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getStoreById = async (req, res) => {
  try {
    const { id } = req.params;

    const [store, branches] = await Promise.all([
      Store.findById(id)
        .populate("businessOwnerId", "name email phone role assignedState isActive")
        .populate("onboardedBy", "name email role")
        .lean(),
      Branch.find({ storeId: id })
        .populate("managerId", "name email phone")
        .populate("stockManagerId", "name email phone")
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    if (!store) return res.status(404).json({ success: false, message: "Store not found" });

    res.status(200).json({ success: true, store, branches });
  } catch (error) {
    console.error("[getStoreById]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createStoreOnboarding = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      businessName,
      businessEmail,
      businessPhone,
      nin,
      cacNumber,
      tinNumber,
      businessAddress,
      homeAddress,
      accountDetails,
      primaryState,
    } = req.body;

    if (
      !businessName ||
      !businessEmail ||
      !nin ||
      !cacNumber ||
      !tinNumber ||
      !businessAddress ||
      !homeAddress ||
      !primaryState
    ) {
      return res.status(400).json({ success: false, message: "All required fields must be provided" });
    }

    const [existingStore, existingUser] = await Promise.all([
      Store.findOne({ businessEmail: businessEmail.toLowerCase() }),
      User.findOne({ email: businessEmail.toLowerCase() }),
    ]);

    if (existingStore) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "A store with this business email already exists" });
    }
    if (existingUser) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "A user with this email already exists" });
    }

    const [store] = await Store.create(
      [
        {
          businessName,
          businessEmail: businessEmail.toLowerCase(),
          businessPhone: businessPhone || "",
          nin,
          cacNumber,
          tinNumber,
          businessAddress,
          homeAddress,
          accountDetails: accountDetails || {},
          onboardedBy: req.userId,
          primaryState,
          verificationStatus: "PENDING",
        },
      ],
      { session }
    );

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: "Store onboarding submitted. It will appear in Pending for verification.",
      storeId: store._id,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("[createStoreOnboarding]", error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

export const verifyStore = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { storeId } = req.params;
    const { initialPassword, verificationNote } = req.body;

    const store = await Store.findById(storeId).session(session);
    if (!store) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Store not found" });
    }
    if (store.verificationStatus !== "PENDING") {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Store is already processed" });
    }

    const plainPassword = initialPassword || crypto.randomBytes(6).toString("hex");
    const hashedPassword = await bcryptjs.hash(plainPassword, 10);

    const [owner] = await User.create(
      [
        {
          email: store.businessEmail,
          password: hashedPassword,
          name: store.businessName,
          phone: store.businessPhone,
          role: "business_owner",
          assignedState: store.primaryState,
          isVerified: true,
          isActive: true,
          kycStatus: "APPROVED",
          onboardedBy: req.userId,
          onboardingSource: "manual",
          verificationToken: null,
          verificationTokenExpiresAt: null,
        },
      ],
      { session }
    );

    store.businessOwnerId = owner._id;
    store.verificationStatus = "VERIFIED";
    store.verificationNote = verificationNote || "Verified by CEO";
    await store.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Store verified and business owner account created",
      store: {
        _id: store._id,
        businessName: store.businessName,
        businessEmail: store.businessEmail,
        verificationStatus: store.verificationStatus,
      },
      owner: {
        _id: owner._id,
        email: owner.email,
        tempPassword: plainPassword,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("[verifyStore]", error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

export const rejectStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: "Rejection reason is required" });

    const store = await Store.findById(storeId);
    if (!store) return res.status(404).json({ success: false, message: "Store not found" });
    if (store.verificationStatus !== "PENDING") {
      return res.status(400).json({ success: false, message: "Store is already processed" });
    }

    store.verificationStatus = "SUSPENDED";
    store.verificationNote = reason;
    await store.save();

    res.status(200).json({ success: true, message: "Store onboarding rejected", reason });
  } catch (error) {
    console.error("[rejectStore]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const updates = { ...req.body };

    delete updates.businessOwnerId;
    delete updates.onboardedBy;
    delete updates.verificationStatus;

    const store = await Store.findByIdAndUpdate(storeId, updates, { new: true }).lean();
    if (!store) return res.status(404).json({ success: false, message: "Store not found" });

    res.status(200).json({ success: true, store });
  } catch (error) {
    console.error("[updateStore]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createBranch = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { branchName, assignedState, buildingFloor, managerId, stockManagerId } = req.body;

    if (!branchName || !assignedState || !buildingFloor) {
      return res.status(400).json({ success: false, message: "branchName, assignedState, and buildingFloor are required" });
    }

    const store = await Store.findById(storeId);
    if (!store) return res.status(404).json({ success: false, message: "Store not found" });
    if (store.verificationStatus !== "VERIFIED") {
      return res.status(400).json({ success: false, message: "Cannot add branches to unverified stores" });
    }

    if (managerId) {
      const mgr = await User.findById(managerId);
      if (!mgr || mgr.role !== "manager") {
        return res.status(400).json({ success: false, message: "Invalid manager selection" });
      }
    }
    if (stockManagerId) {
      const sm = await User.findById(stockManagerId);
      if (!sm || sm.role !== "stock_manager") {
        return res.status(400).json({ success: false, message: "Invalid stock manager selection" });
      }
    }

    const branch = await Branch.create({
      storeId,
      branchName,
      assignedState,
      buildingFloor,
      managerId: managerId || null,
      stockManagerId: stockManagerId || null,
    });

    res.status(201).json({ success: true, message: `Branch "${branchName}" created`, branch });
  } catch (error) {
    console.error("[createBranch]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateBranch = async (req, res) => {
  try {
    const { branchId } = req.params;
    const { branchName, assignedState, buildingFloor, managerId, stockManagerId, isActive } = req.body;

    const updates = {};
    if (branchName) updates.branchName = branchName;
    if (assignedState) updates.assignedState = assignedState;
    if (buildingFloor) updates.buildingFloor = buildingFloor;
    if (managerId !== undefined) updates.managerId = managerId || null;
    if (stockManagerId !== undefined) updates.stockManagerId = stockManagerId || null;
    if (isActive !== undefined) updates.isActive = isActive;

    if (managerId) {
      const mgr = await User.findById(managerId);
      if (!mgr || mgr.role !== "manager") {
        return res.status(400).json({ success: false, message: "Invalid manager" });
      }
    }
    if (stockManagerId) {
      const sm = await User.findById(stockManagerId);
      if (!sm || sm.role !== "stock_manager") {
        return res.status(400).json({ success: false, message: "Invalid stock manager" });
      }
    }

    const branch = await Branch.findByIdAndUpdate(branchId, updates, { new: true })
      .populate("managerId", "name email phone")
      .populate("stockManagerId", "name email phone")
      .lean();

    if (!branch) return res.status(404).json({ success: false, message: "Branch not found" });

    res.status(200).json({ success: true, branch });
  } catch (error) {
    console.error("[updateBranch]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAvailableStaff = async (req, res) => {
  try {
    const { role, state } = req.query;
    if (!role || !["manager", "stock_manager"].includes(role)) {
      return res.status(400).json({ success: false, message: "role must be manager or stock_manager" });
    }

    const filter = { role, isActive: true };
    if (state) filter.assignedState = state;

    const staff = await User.find(filter)
      .select("name email phone assignedState")
      .sort({ name: 1 })
      .lean();

    res.status(200).json({ success: true, staff });
  } catch (error) {
    console.error("[getAvailableStaff]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPendingStores = async (req, res) => {
  try {
    const { page = 1, limit = 20, state } = req.query;
    const filter = { verificationStatus: "PENDING" };
    if (state) filter.primaryState = state;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [stores, total] = await Promise.all([
      Store.find(filter)
        .populate("onboardedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Store.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      stores,
      pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total },
    });
  } catch (error) {
    console.error("[getPendingStores]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
