const authService = require('../services/authService');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' }
      });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' }
      });
    }

    let user;
    try {
      user = await authService.verifyTokenAndGetUser(token);
    } catch (err) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token.' }
      });
    }

    try {
      const profile = await authService.getUserProfile(user.id, token);
      req.auth = {
        userId: user.id,
        email: user.email,
        accessToken: token,
        profile: profile
      };
      next();
    } catch (err) {
      if (err.code === 'PROFILE_REQUIRED') {
        return res.status(403).json({
          error: { code: 'PROFILE_REQUIRED', message: 'User profile is required.' }
        });
      }
      throw err;
    }
  } catch (error) {
    next(error);
  }
}

function requireCreator(req, res, next) {
  if (!req.auth || !req.auth.profile) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' }
    });
  }

  if (req.auth.profile.role !== 'creator') {
    return res.status(403).json({
      error: { code: 'CREATOR_REQUIRED', message: 'Creator access required.' }
    });
  }

  next();
}

module.exports = {
  requireAuth,
  requireCreator
};
