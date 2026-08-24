const express = require('express');
const { requireAuth, requireStaff } = require('../middleware/auth');
const { validateQueueQuery, validateIdParam } = require('../validation/adminProduction');
const adminProductionService = require('../services/adminProductionService');

const router = express.Router();

router.get('/submissions', requireAuth, requireStaff, validateQueueQuery, async (req, res, next) => {
  try {
    const options = req.validatedQuery;
    const result = await adminProductionService.listSubmissions(options);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/submissions/:id', requireAuth, requireStaff, validateIdParam, async (req, res, next) => {
  try {
    const { id } = req.validatedParams;
    const submission = await adminProductionService.getSubmission(id);
    res.status(200).json(submission);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
