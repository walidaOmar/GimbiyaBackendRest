import { AuditLog } from "../models/auditLog.model.js";

export const writeAuditLog = async ({
  action,
  performedBy,
  targetType,
  targetId,
  oldValue = null,
  newValue = null,
  reason = "",
  req = null,
}) => {
  try {
    await AuditLog.create({
      action,
      performedBy,
      targetType,
      targetId,
      oldValue,
      newValue,
      reason,
      ip: req?.ip || null,
    });
  } catch (err) {
    console.error("Audit log write failed:", err.message);
  }
};
