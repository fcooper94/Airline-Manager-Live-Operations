const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const { User } = require('../models');

// Login route - redirects to VATSIM OAuth
router.get('/login', passport.authenticate('vatsim'));

// OAuth callback route
router.get('/vatsim/callback',
  passport.authenticate('vatsim', { failureRedirect: '/' }),
  (req, res) => {
    // Successful authentication, redirect to world selection
    res.redirect('/world-selection');
  }
);

// Logout route
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// Check auth status
router.get('/status', async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      // Fetch full user data from database to get current credits
      const dbUser = await User.findOne({
        where: { vatsimId: req.user.vatsimId },
        attributes: ['credits']
      });

      res.json({
        authenticated: true,
        user: {
          vatsimId: req.user.vatsimId,
          name: `${req.user.firstName} ${req.user.lastName}`,
          rating: req.user.rating,
          credits: dbUser ? dbUser.credits : 0
        }
      });
    } catch (error) {
      console.error('Error fetching user credits:', error);
      res.json({
        authenticated: true,
        user: {
          vatsimId: req.user.vatsimId,
          name: `${req.user.firstName} ${req.user.lastName}`,
          rating: req.user.rating,
          credits: 0
        }
      });
    }
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;
