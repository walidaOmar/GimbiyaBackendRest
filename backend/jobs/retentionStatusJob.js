import { Relationship } from "../models/relationship.model.js";

const AT_RISK_DAYS = parseInt(process.env.RELATIONSHIP_AT_RISK_DAYS || "30", 10);
const DORMANT_DAYS = parseInt(process.env.RELATIONSHIP_DORMANT_DAYS || "90", 10);

export const runRetentionStatusCheck = async () => {
  const now = Date.now();
  const atRiskCutoff = new Date(now - AT_RISK_DAYS * 24 * 60 * 60 * 1000);
  const dormantCutoff = new Date(now - DORMANT_DAYS * 24 * 60 * 60 * 1000);

  const toAtRisk = await Relationship.updateMany(
    {
      lastActivityAt: { $lt: atRiskCutoff, $gte: dormantCutoff },
      relationshipStatus: "ACTIVE",
    },
    { relationshipStatus: "AT_RISK" }
  );

  const toDormant = await Relationship.updateMany(
    {
      lastActivityAt: { $lt: dormantCutoff },
      relationshipStatus: { $ne: "DORMANT" },
    },
    { relationshipStatus: "DORMANT" }
  );

  console.log(
    `[retentionStatusJob] ${toAtRisk.modifiedCount} -> AT_RISK, ${toDormant.modifiedCount} -> DORMANT`
  );
};
