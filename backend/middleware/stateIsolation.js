const STATE_FIELDS = ["state", "primaryState", "assignedState"];

const isCoordinator = (req) => req.userRole === "developer_coordinator";

export const restrictToOwnState = (req, res, next) => {
  if (isCoordinator(req) && req.userState) {
    for (const field of STATE_FIELDS) {
      if (req.body?.[field] !== undefined) req.body[field] = req.userState;
    }
  }
  next();
};

export const validateStateScope = (req, res, next) => {
  if (!isCoordinator(req) || !req.userState) return next();

  const requestedState = STATE_FIELDS
    .map((field) => req.body?.[field] || req.query?.[field] || req.params?.[field])
    .find(Boolean);

  if (requestedState && requestedState !== req.userState) {
    return res.status(403).json({
      success: false,
      message: `You can only access records in ${req.userState}`,
    });
  }

  next();
};

export const appendStateFilter = (req, filter, field = "assignedState") => {
  if (isCoordinator(req) && req.userState) filter[field] = req.userState;
  return filter;
};
