const express = require('express');
const { requireAuth, requireCreator } = require('../middleware/auth');
const { validateProductionSubmission } = require('../validation/productionSubmission');
const { validateQuery } = require('../validation/productionSubmissionQuery');
const productionSubmissionService = require('../services/productionSubmissionService');

const router = express.Router();

router.post('/submissions', requireAuth, requireCreator, validateProductionSubmission, async (req, res, next) => {
  try {
    const { userId, accessToken } = req.auth;
    const data = req.body;

    const submission = await productionSubmissionService.createSubmission(userId, accessToken, data);

    res.status(201).json({ submission });
  } catch (error) {
    next(error);
  }
});

router.get('/submissions', requireAuth, requireCreator, validateQuery, async (req, res, next) => {
  try {
    const { accessToken } = req.auth;
    const options = req.validatedQuery;

    const result = await productionSubmissionService.listSubmissions(accessToken, options);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
