import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import { Store } from "../models/store.model.js";
import { Branch } from "../models/branch.model.js";
import { User } from "../models/user.model.js";
import { StoreOnboardingRequest } from "../models/storeOnboardingRequest.model.js";

export const VALID_COMMERCE_SEGMENTS = ["manufacturer", "wholesaler", "retailer", "service_provider", "logistics"];

export const isValidCommerceSegment = (value) =>
  typeof value === "string" && VALID_COMMERCE_SEGMENTS.includes(value);

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
        .populate("submittedBy", "name email assignedState")
        .populate("reviewedBy", "name email")
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
        .populate("submittedBy", "name email role")
        .populate("reviewedBy", "name email role")
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

export const submitStoreRequest = async (req, res) => {
  try {
    const {
      businessName,
      businessEmail,
      businessPhone,
      commerceSegment,
      primaryState,
      nin,
      cacNumber,
      tinNumber,
      businessAddress,
      homeAddress,
      accountDetails,
      staffSlots,
    } = req.body;

    if (!businessName || !businessEmail || !commerceSegment || !primaryState || !nin || !cacNumber || !tinNumber) {
      return res.status(400).json({ success: false, message: "All required fields must be provided" });
    }

    if (req.userRole === "developer_coordinator" && primaryState !== req.userState) {
      return res.status(403).json({ success: false, message: `You can only onboard stores in ${req.userState}` });
    }

    if (!staffSlots || !staffSlots.length) {
      return res.status(400).json({ success: false, message: "At least one staff member is required" });
    }

    if (commerceSegment === "logistics") {
      const hasInvalid = staffSlots.some((slot) => slot.role !== "delivery");
      if (hasInvalid) {
        return res.status(400).json({ success: false, message: "Logistics stores can only have Dispatch Riders" });
      }
    } else {
      const hasManager = staffSlots.some((slot) => slot.role === "manager");
      const hasStockManager = staffSlots.some((slot) => slot.role === "stock_manager");
      if (!hasManager || !hasStockManager) {
        return res.status(400).json({ success: false, message: "Non-logistics stores require a Branch Manager and Stock Manager" });
      }
    }

    const duplicate = await StoreOnboardingRequest.findOne({
      businessEmail: businessEmail.toLowerCase(),
      status: "PENDING",
    });
    if (duplicate) {
      return res.status(400).json({ success: false, message: "A pending request already exists for this business email" });
    }

    const request = await StoreOnboardingRequest.create({
      businessName,
      businessEmail: businessEmail.toLowerCase(),
      businessPhone: businessPhone || "",
      commerceSegment,
      primaryState,
      nin,
      cacNumber,
      tinNumber,
      businessAddress,
      homeAddress,
      accountDetails: accountDetails || {},
      staffSlots,
      submittedBy: req.userId,
      coordinatorState: req.userState || primaryState,
    });

    res.status(201).json({
      success: true,
      message: "Store onboarding request submitted to CEO for approval",
      requestId: request._id,
    });
  } catch (error) {
    console.error("[submitStoreRequest]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPendingStoreRequests = async (req, res) => {
  try {
    const { state, page = 1, limit = 20 } = req.query;
    const filter = { status: "PENDING" };
    if (state) filter.coordinatorState = state;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [requests, total] = await Promise.all([
      StoreOnboardingRequest.find(filter)
        .populate("submittedBy", "name email assignedState")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      StoreOnboardingRequest.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      requests,
      pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total },
    });
  } catch (error) {
    console.error("[getPendingStoreRequests]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getStoreRequestById = async (req, res) => {
  try {
    const request = await StoreOnboardingRequest.findById(req.params.id)
      .populate("submittedBy", "name email phone assignedState")
      .lean();

    if (!request) return res.status(404).json({ success: false, message: "Request not found" });

    res.status(200).json({ success: true, request });
  } catch (error) {
    console.error("[getStoreRequestById]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const approveStoreRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { requestId } = req.params;
    const { initialPassword } = req.body;

    const request = await StoreOnboardingRequest.findById(requestId).session(session);
    if (!request) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Request not found" });
    }
    if (request.status !== "PENDING") {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Request already processed" });
    }

    const plainPassword = initialPassword || crypto.randomBytes(4).toString("hex");
    const hashedPassword = await bcryptjs.hash(plainPassword, 10);

    const [owner] = await User.create([
      {
        email: request.businessEmail,
        password: hashedPassword,
        name: request.businessName,
        phone: request.businessPhone,
        role: request.serviceCategory === "property_management" ? "property_admin" : "business_owner",
        assignedState: request.primaryState,
        isVerified: true,
        isActive: true,
        kycStatus: "APPROVED",
        onboardedBy: req.userId,
        onboardingSource: "manual",
        verificationToken: null,
        verificationTokenExpiresAt: null,
      },
    ], { session });

    const [store] = await Store.create([
      {
        businessName: request.businessName,
        businessEmail: request.businessEmail,
        businessPhone: request.businessPhone,
        commerceSegment: request.commerceSegment,
        primaryState: request.primaryState,
        nin: request.nin,
        cacNumber: request.cacNumber,
        tinNumber: request.tinNumber,
        businessAddress: request.businessAddress,
        homeAddress: request.homeAddress,
        accountDetails: request.accountDetails,
        businessOwnerId: owner._id,
        onboardedBy: req.userId,
        verificationStatus: "VERIFIED",
        submittedBy: request.submittedBy,
        submitterRole: "developer_coordinator",
        reviewedBy: req.userId,
        reviewNote: "Approved by CEO via onboarding request",
        reviewedAt: new Date(),
      },
    ], { session });

    const createdStaff = [];
    const branchMap = {};

    for (const slot of request.staffSlots) {
      const staffPassword = crypto.randomBytes(4).toString("hex");
      const staffHash = await bcryptjs.hash(staffPassword, 10);

      const [staffUser] = await User.create([
        {
          email: slot.email.toLowerCase(),
          password: staffHash,
          name: slot.fullName,
          phone: slot.phone,
          role: slot.role,
          assignedState: slot.assignedState,
          isVerified: true,
          isActive: true,
          kycStatus: "APPROVED",
          onboardedBy: req.userId,
          onboardingSource: "manual",
          verificationToken: null,
          verificationTokenExpiresAt: null,
        },
      ], { session });

      // Skip branch mapping for deal initiators
      if (slot.role === "deal_initiator") {
        createdStaff.push({
          _id: staffUser._id,
          name: staffUser.name,
          email: staffUser.email,
          role: staffUser.role,
          tempPassword: staffPassword,
        });
        continue;
      }

      createdStaff.push({
        _id: staffUser._id,
        name: staffUser.name,
        email: staffUser.email,
        role: staffUser.role,
        tempPassword: staffPassword,
      });

      const branchKey = `${slot.assignedState}-${slot.buildingFloor}`;
      if (!branchMap[branchKey]) {
        branchMap[branchKey] = {
          storeId: store._id,
          branchName: `${request.businessName} — ${slot.assignedState} ${slot.buildingFloor}`,
          assignedState: slot.assignedState,
          buildingFloor: slot.buildingFloor,
          managerId: null,
          stockManagerId: null,
          riders: [],
        };
      }

      if (slot.role === "manager") branchMap[branchKey].managerId = staffUser._id;
      if (slot.role === "stock_manager") branchMap[branchKey].stockManagerId = staffUser._id;
      if (slot.role === "delivery") branchMap[branchKey].riders.push(staffUser._id);
    }

    const createdBranches = [];
    for (const key of Object.keys(branchMap)) {
      const branchData = branchMap[key];
      const [branch] = await Branch.create([
        {
          storeId: branchData.storeId,
          branchName: branchData.branchName,
          assignedState: branchData.assignedState,
          buildingFloor: branchData.buildingFloor,
          managerId: branchData.managerId,
          stockManagerId: branchData.stockManagerId,
          isActive: true,
        },
      ], { session });

      createdBranches.push({
        _id: branch._id,
        name: branch.branchName,
        manager: branchData.managerId,
        stockManager: branchData.stockManagerId,
        riders: branchData.riders,
      });
    }

    request.status = "APPROVED";
    request.reviewedBy = req.userId;
    request.reviewedAt = new Date();
    request.createdStoreId = store._id;
    await request.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Store approved. Business owner, staff, and branches created.",
      store: { _id: store._id, businessName: store.businessName, commerceSegment: store.commerceSegment },
      owner: { _id: owner._id, email: owner.email, tempPassword: plainPassword },
      staff: createdStaff,
      branches: createdBranches,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("[approveStoreRequest]", error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

export const rejectStoreRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: "Rejection reason required" });

    const request = await StoreOnboardingRequest.findById(requestId);
    if (!request) return res.status(404).json({ success: false, message: "Request not found" });
    if (request.status !== "PENDING") return res.status(400).json({ success: false, message: "Already processed" });

    request.status = "REJECTED";
    request.reviewedBy = req.userId;
    request.reviewNote = reason;
    request.reviewedAt = new Date();
    await request.save();

    res.status(200).json({ success: true, message: "Store request rejected" });
  } catch (error) {
    console.error("[rejectStoreRequest]", error);
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
    delete updates.submittedBy;

    if (updates.commerceSegment !== undefined && !isValidCommerceSegment(updates.commerceSegment)) {
      return res.status(400).json({ success: false, message: "Invalid commerce segment" });
    }

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
    if (!role || !["manager", "stock_manager", "delivery"].includes(role)) {
      return res.status(400).json({ success: false, message: "role must be manager, stock_manager, or delivery" });
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
