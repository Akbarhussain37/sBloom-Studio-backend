const express = require('express');
const { requireAuth, requireCreator } = require('../middleware/auth');
const router = express.Router();

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.auth.userId,
      email: req.auth.email
    },
    profile: {
      role: req.auth.profile.role
    }
  });
});

router.get('/creator/me', requireAuth, requireCreator, (req, res) => {
  res.json({
    user: {
      id: req.auth.userId,
      email: req.auth.email
    },
    profile: {
      role: req.auth.profile.role
    }
  });
});

module.exports = router;
