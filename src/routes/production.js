const express = require('express');
const { requireAuth, requireCreator } = require('../middleware/auth');
const { validateProductionSubmission } = require('../validation/productionSubmission');
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

module.exports = router;
