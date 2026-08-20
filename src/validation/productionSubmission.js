const allowedFields = [
  'project_id',
  'source_type',
  'source_provider',
  'source_url',
  'source_name',
  'instructions',
  'source_access_attested'
];

const prohibitedFields = [
  'id',
  'user_id',
  'access_status',
  'source_access_attested_at',
  'submitted_at',
  'created_at',
  'updated_at'
];

const validSourceTypes = ['FILE', 'FOLDER'];
const validSourceProviders = ['GOOGLE_DRIVE', 'ONEDRIVE', 'SHAREPOINT', 'DROPBOX', 'OTHER'];
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateProductionSubmission(req, res, next) {
  const body = req.body || {};

  // Check for prohibited fields
  for (const field of prohibitedFields) {
    if (body[field] !== undefined) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `Field '${field}' is not allowed.` }
      });
    }
  }

  // Check for any unallowed fields
  const keys = Object.keys(body);
  for (const key of keys) {
    if (!allowedFields.includes(key)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: `Unexpected field '${key}' provided.` }
      });
    }
  }

  // project_id
  if (!body.project_id || typeof body.project_id !== 'string' || !uuidRegex.test(body.project_id)) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid project_id. Must be a valid UUID.' }
    });
  }

  // source_type
  if (!validSourceTypes.includes(body.source_type)) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid source_type.' }
    });
  }

  // source_provider
  if (!validSourceProviders.includes(body.source_provider)) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid source_provider.' }
    });
  }

  // source_url
  if (!body.source_url || typeof body.source_url !== 'string') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid source_url.' }
    });
  }
  const trimmedUrl = body.source_url.trim();
  if (trimmedUrl.length === 0 || trimmedUrl.length > 2048) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid source_url length.' }
    });
  }
  try {
    const parsedUrl = new URL(trimmedUrl);
    if (parsedUrl.protocol !== 'https:') {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'source_url must use https protocol.' }
      });
    }
  } catch (err) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Malformed source_url.' }
    });
  }
  req.body.source_url = trimmedUrl;

  // source_name
  let normalizedSourceName = null;
  if (body.source_name !== undefined && body.source_name !== null) {
    if (typeof body.source_name !== 'string') {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'source_name must be a string if provided.' }
      });
    }
    const trimmedName = body.source_name.trim();
    if (trimmedName.length > 0) {
      if (trimmedName.length > 255) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'source_name must be at most 255 characters.' }
        });
      }
      normalizedSourceName = trimmedName;
    }
  }
  req.body.source_name = normalizedSourceName;

  // instructions
  if (!body.instructions || typeof body.instructions !== 'string') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid instructions.' }
    });
  }
  const trimmedInstructions = body.instructions.trim();
  if (trimmedInstructions.length === 0 || trimmedInstructions.length > 5000) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'instructions must be between 1 and 5000 characters.' }
    });
  }
  req.body.instructions = trimmedInstructions;

  // source_access_attested
  if (body.source_access_attested !== true) {
    return res.status(400).json({
      error: { code: 'SOURCE_ACCESS_ATTESTATION_REQUIRED', message: 'You must attest that you have provided access.' }
    });
  }

  next();
}

module.exports = {
  validateProductionSubmission
};
