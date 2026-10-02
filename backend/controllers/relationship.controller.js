import { Relationship } from "../models/relationship.model.js";
import { appendStateFilter } from "../middleware/stateIsolation.js";

export const createRelationship = async (req, res) => {
  try {
    const { consumerId, consumerPublicId, region } = req.body;

    if (!consumerId || !consumerPublicId || !region) {
      return res.status(400).json({
        success: false,
        message: "consumerId, consumerPublicId, and region are required",
      });
    }

    const existing = await Relationship.findOne({
      consumerId,
      affiliateOfficerId: req.userId,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Relationship already exists",
      });
    }

    const relationship = await Relationship.create({
      consumerId,
      consumerPublicId,
      affiliateOfficerId: req.userId,
      stateCoordinatorId: req.body.stateCoordinatorId || req.userId,
      region,
      interactionHistory: [{ type: "MARKET_VISIT", note: "Initial relationship established" }],
    });

    return res.status(201).json({ success: true, data: relationship });
  } catch (error) {
    console.error("[createRelationship]", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create relationship",
    });
  }
};

export const logInteraction = async (req, res) => {
  try {
    const { relationshipId } = req.params;
    const { type, note, refId } = req.body;

    if (!type) {
      return res.status(400).json({ success: false, message: "Interaction type is required" });
    }

    const relationship = await Relationship.findOne({
      _id: relationshipId,
      affiliateOfficerId: req.userId,
    });

    if (!relationship) {
      return res.status(404).json({ success: false, message: "Relationship not found" });
    }

    relationship.interactionHistory.push({
      type,
      note: note || "",
      refId: refId || null,
    });

    relationship.lastActivityAt = new Date();
    if (type === "PURCHASE") relationship.lastPurchaseAt = new Date();
    if (relationship.relationshipStatus !== "ACTIVE") relationship.relationshipStatus = "ACTIVE";

    await relationship.save();

    return res.json({ success: true, data: relationship });
  } catch (error) {
    console.error("[logInteraction]", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to log interaction",
    });
  }
};

export const getMyPortfolio = async (req, res) => {
  try {
    const relationships = await Relationship.find({ affiliateOfficerId: req.userId })
      .sort({ lastActivityAt: -1 })
      .lean();

    return res.json({ success: true, data: relationships });
  } catch (error) {
    console.error("[getMyPortfolio]", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch portfolio",
    });
  }
};

export const getRegionalPortfolio = async (req, res) => {
  try {
    const filter = appendStateFilter(req, {}, "region");
    const relationships = await Relationship.find(filter).sort({ lastActivityAt: -1 }).lean();

    return res.json({ success: true, data: relationships });
  } catch (error) {
    console.error("[getRegionalPortfolio]", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch regional portfolio",
    });
  }
};
