const validateQuery = (req, res, next) => {
  const allowedKeys = ['limit', 'project_id'];
  const queryKeys = Object.keys(req.query);

  // Check for unexpected parameters
  for (const key of queryKeys) {
    if (!allowedKeys.includes(key)) {
      return sendError(res, 'Unexpected query parameter: ' + key);
    }
  }

  // Validate limit
  let limit = 50;
  if (req.query.limit !== undefined) {
    // Must be a valid integer string
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

  // Validate project_id
  if (req.query.project_id !== undefined) {
    if (typeof req.query.project_id !== 'string') {
      return sendError(res, 'project_id must be a string');
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(req.query.project_id)) {
      return sendError(res, 'project_id must be a valid UUID');
    }
    req.validatedQuery.project_id = req.query.project_id;
  }

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

module.exports = { validateQuery };
