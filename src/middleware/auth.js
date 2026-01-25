// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/');
};

// Middleware to check if user is already authenticated
const redirectIfAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return res.redirect('/world-selection');
  }
  next();
};

// Middleware to check if user has selected a world
const requireWorld = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/');
  }

  if (!req.session.activeWorldId) {
    return res.redirect('/world-selection');
  }

  next();
};

module.exports = {
  requireAuth,
  redirectIfAuth,
  requireWorld
};
