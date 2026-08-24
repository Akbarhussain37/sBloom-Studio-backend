const validateQueueQuery = (req, res, next) => {
  const allowedKeys = ['limit', 'access_status'];
  const queryKeys = Object.keys(req.query);

  for (const key of queryKeys) {
    if (!allowedKeys.includes(key)) {
      return sendError(res, 'Unexpected query parameter: ' + key);
    }
  }

  let limit = 50;
  if (req.query.limit !== undefined) {
    if (typeof req.query.limit !== 'string' || !/^\d+$/.test(req.query.limit)) {
      return sendError(res, 'limit must be a positive integer');
    }
    const parsedLimit = parseInt(req.query.limit, 10);
    if (parsedLimit < 1 || parsedLimit > 100) {
      return sendError(res, 'limit must be between 1 and 100 inclusive');
    }
    limit = parsedLimit;
  }
  req.validatedQuery = { limit };

  if (req.query.access_status !== undefined) {
    if (typeof req.query.access_status !== 'string') {
      return sendError(res, 'access_status must be a string');
    }
    const allowedStatuses = ['PENDING_VERIFICATION', 'ACCESS_CONFIRMED', 'ACCESS_REQUIRED'];
    if (!allowedStatuses.includes(req.query.access_status)) {
      return sendError(res, 'access_status must be one of: ' + allowedStatuses.join(', '));
    }
    req.validatedQuery.access_status = req.query.access_status;
  }

  next();
};

const validateIdParam = (req, res, next) => {
  const id = req.params.id;
  if (!id || typeof id !== 'string') {
    return sendError(res, 'id must be a string');
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return sendError(res, 'id must be a valid UUID');
  }
  req.validatedParams = { id };
  next();
};

function sendError(res, message) {
  return res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message
    }
  });
}

module.exports = { validateQueueQuery, validateIdParam };
