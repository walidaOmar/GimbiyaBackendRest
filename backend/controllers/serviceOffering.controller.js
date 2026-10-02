import { ServiceOffering } from "../models/serviceOffering.model.js";
import { Store } from "../models/store.model.js";
import { NIGERIAN_STATES } from "../models/user.model.js";

const isValidState = (state) => NIGERIAN_STATES.includes(state) && state !== "Global";

export const createServiceOffering = async (req, res) => {
  try {
    const { serviceType, descriptionText, priceKobo, estimatedDurationHours, assignedState, store } = req.body;

    if (!serviceType || !Number.isInteger(priceKobo) || priceKobo < 1 || !isValidState(assignedState)) {
      return res.status(400).json({
        success: false,
        message: "serviceType, positive integer priceKobo, and a valid assignedState are required",
      });
    }
    if (assignedState !== req.userState) {
      return res.status(403).json({ success: false, message: "Offering must use your assigned state" });
    }

    const ownedStore = await Store.findOne({
        ...(store ? { _id: store } : {}),
        businessOwnerId: req.userId,
        commerceSegment: "service_provider",
        verificationStatus: "VERIFIED",
        primaryState: assignedState,
      }).lean();
    if (!ownedStore) {
      return res.status(403).json({ success: false, message: "Verified service-provider store not found in this state" });
    }

    const offering = await ServiceOffering.create({
      providerId: req.userId,
      store: ownedStore._id,
      serviceType,
      descriptionText,
      priceKobo,
      estimatedDurationHours,
      assignedState,
    });

    return res.status(201).json({ success: true, data: offering });
  } catch (error) {
    console.error("[createServiceOffering]", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getOfferingsNearLocation = async (req, res) => {
  try {
    const { assignedState, serviceType } = req.query;
    if (assignedState && !isValidState(assignedState)) {
      return res.status(400).json({ success: false, message: "Invalid assignedState" });
    }

    const filter = { isActive: true };
    if (assignedState) filter.assignedState = assignedState;
    if (serviceType) filter.serviceType = serviceType;

    const offerings = await ServiceOffering.find(filter)
      .populate("providerId", "name phone")
      .populate("store", "businessName primaryState")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({ success: true, data: offerings });
  } catch (error) {
    console.error("[getOfferingsNearLocation]", error);
    return res.status(500).json({ success: false, message: "Failed to fetch service offerings" });
  }
};

export const getMyOfferings = async (req, res) => {
  try {
    const offerings = await ServiceOffering.find({ providerId: req.userId }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: offerings });
  } catch (error) {
    console.error("[getMyOfferings]", error);
    return res.status(500).json({ success: false, message: "Failed to fetch your offerings" });
  }
};

export const updateServiceOffering = async (req, res) => {
  try {
    const updates = {};
    for (const field of ["serviceType", "descriptionText", "priceKobo", "estimatedDurationHours", "isActive"]) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No editable offering fields provided" });
    }
    if (updates.priceKobo !== undefined && (!Number.isInteger(updates.priceKobo) || updates.priceKobo < 1)) {
      return res.status(400).json({ success: false, message: "priceKobo must be a positive integer" });
    }

    const offering = await ServiceOffering.findOneAndUpdate(
      { _id: req.params.offeringId, providerId: req.userId },
      updates,
      { new: true, runValidators: true }
    );
    if (!offering) return res.status(404).json({ success: false, message: "Offering not found" });

    return res.json({ success: true, data: offering });
  } catch (error) {
    console.error("[updateServiceOffering]", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};
