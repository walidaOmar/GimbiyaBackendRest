import { CommercialNode } from "../models/commercialNode.model.js";
import { User } from "../models/user.model.js";
import { Relationship } from "../models/relationship.model.js";
import { Order } from "../models/order.model.js";
import { Store } from "../models/store.model.js";
import { WaiverQuota } from "../models/waiverQuota.model.js";
import { ServiceOffering } from "../models/serviceOffering.model.js";

const REVENUE_STATUSES = ["PAID", "CONFIRMED", "PROCESSING", "DISPATCHED", "DELIVERED"];

export const getRegionTree = async (_req, res) => {
  try {
    const nodes = await CommercialNode.find({ isActive: true })
      .sort({ region: 1, state: 1, market: 1, name: 1 })
      .lean();
    const tree = [];

    for (const node of nodes) {
      let region = tree.find((item) => item.region === node.region);
      if (!region) tree.push((region = { region: node.region, states: [] }));

      let state = region.states.find((item) => item.state === node.state);
      if (!state) region.states.push((state = { state: node.state, markets: [] }));

      let market = state.markets.find((item) => item.market === node.market);
      if (!market) state.markets.push((market = { market: node.market, nodes: [] }));

      market.nodes.push(node);
    }

    res.json({ success: true, tree, nodes });
  } catch (error) {
    console.error("[getRegionTree]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getRegionOverview = async (req, res) => {
  try {
    const isCoordinator = req.userRole === "developer_coordinator";
    const nodeKey = isCoordinator ? req.userState : req.query.node;
    if (!nodeKey || nodeKey === "Global") {
      return res.status(400).json({ success: false, message: "A specific commercial node is required" });
    }

    const node = await CommercialNode.findOne({ key: nodeKey }).lean();
    const [
      activeAffiliates,
      merchants,
      services,
      consumers,
      activeRelationships,
      repeatAgg,
      gmvAgg,
      fulfilmentAgg,
      quota,
    ] = await Promise.all([
      User.countDocuments({ role: "affiliate", assignedState: nodeKey, isActive: true }),
      Store.countDocuments({ primaryState: nodeKey, verificationStatus: "VERIFIED" }),
      ServiceOffering.countDocuments({ assignedState: nodeKey, isActive: true }),
      Relationship.distinct("consumerId", { region: nodeKey }),
      Relationship.countDocuments({ region: nodeKey, relationshipStatus: "ACTIVE" }),
      Relationship.aggregate([
        { $match: { region: nodeKey } },
        {
          $project: {
            purchases: {
              $size: {
                $filter: {
                  input: "$interactionHistory",
                  as: "interaction",
                  cond: { $eq: ["$$interaction.type", "PURCHASE"] },
                },
              },
            },
          },
        },
        { $match: { purchases: { $gte: 2 } } },
        { $count: "n" },
      ]),
      Order.aggregate([
        { $match: { assignedState: nodeKey, status: { $in: REVENUE_STATUSES } } },
        { $group: { _id: null, gmvKobo: { $sum: "$grossTotalKobo" }, orders: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: { assignedState: nodeKey, isMultiMerchant: true } },
        {
          $lookup: {
            from: "fulfillmentgroups",
            localField: "_id",
            foreignField: "orderId",
            as: "groups",
          },
        },
        { $unwind: "$groups" },
        { $group: { _id: "$groups.status", n: { $sum: 1 } } },
      ]),
      isCoordinator
        ? WaiverQuota.findOne({
            coordinatorId: req.userId,
            isActive: true,
            expiresAt: { $gt: new Date() },
          }).lean()
        : null,
    ]);

    const groupTotal = fulfilmentAgg.reduce((total, result) => total + result.n, 0);
    const delivered = fulfilmentAgg.find((result) => result._id === "DELIVERED")?.n || 0;

    res.json({
      success: true,
      data: {
        node,
        activeAffiliates,
        merchants,
        services,
        consumers: consumers.length,
        activeRelationships,
        repeatRelationships: repeatAgg[0]?.n || 0,
        gmvKobo: gmvAgg[0]?.gmvKobo || 0,
        orders: gmvAgg[0]?.orders || 0,
        fulfilment: {
          total: groupTotal,
          delivered,
          successRate: groupTotal ? Math.round((delivered / groupTotal) * 100) : null,
        },
        waiver: quota
          ? {
              totalSlots: quota.totalSlots,
              usedSlots: quota.usedSlots,
              utilisationPct: Math.round((quota.usedSlots / quota.totalSlots) * 100),
            }
          : null,
      },
    });
  } catch (error) {
    console.error("[getRegionOverview]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateNode = async (req, res) => {
  try {
    const allowedFields = [
      "name",
      "region",
      "state",
      "market",
      "floors",
      "industryCategories",
      "operatingHours",
      "isActive",
    ];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([field]) => allowedFields.includes(field))
    );
    const node = await CommercialNode.findOneAndUpdate({ key: req.params.key }, updates, {
      new: true,
      runValidators: true,
    });
    if (!node) return res.status(404).json({ success: false, message: "Node not found" });
    res.json({ success: true, data: node });
  } catch (error) {
    console.error("[updateNode]", error);
    res.status(400).json({ success: false, message: error.message });
  }
};
