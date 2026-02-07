const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const { User, SystemSettings } = require('../models');

// Login route - redirects to VATSIM OAuth
router.get('/login', passport.authenticate('vatsim'));

// Check if dev bypass is enabled (public endpoint for login page)
// Can be enabled via: 1) SystemSettings in DB, 2) DEV_BYPASS_ENABLED env var, 3) NODE_ENV=development
router.get('/bypass-enabled', async (req, res) => {
  try {
    // Check environment variable first (allows bypass without DB access)
    if (process.env.DEV_BYPASS_ENABLED === 'true' || process.env.NODE_ENV === 'development') {
      return res.json({ enabled: true });
    }
    const enabled = await SystemSettings.get('devBypassEnabled', false);
    res.json({ enabled: enabled === true || enabled === 'true' });
  } catch (error) {
    // If DB fails but we're in dev mode, still allow bypass
    if (process.env.NODE_ENV === 'development') {
      return res.json({ enabled: true });
    }
    res.json({ enabled: false });
  }
});

// Dev bypass login - only works when enabled in settings or dev environment
router.post('/dev-bypass', async (req, res) => {
  try {
    // Check environment first
    const envEnabled = process.env.DEV_BYPASS_ENABLED === 'true' || process.env.NODE_ENV === 'development';

    if (!envEnabled) {
      // Fall back to DB setting
      const enabled = await SystemSettings.get('devBypassEnabled', false);
      if (enabled !== true && enabled !== 'true') {
        return res.status(403).json({ error: 'Dev bypass is not enabled' });
      }
    }

    const { bypassPassword } = req.body;

    // Validate bypass password from environment variable (defaults to 'devpass' if not set)
    const expectedPassword = process.env.DEV_BYPASS_PASSWORD || 'devpass';
    if (bypassPassword !== expectedPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Find or create the dev user
    let user = await User.findOne({ where: { vatsimId: '10000010' } });

    if (!user) {
      user = await User.create({
        vatsimId: '10000010',
        firstName: 'WebTen',
        lastName: 'Dev',
        email: 'dev@localhost',
        rating: 'C1',
        pilotRating: 0,
        division: 'DEV',
        isAdmin: true,
        credits: 100
      });
    }

    // Log the user in
    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Login failed' });
      }
      res.json({ success: true, redirect: '/world-selection' });
    });
  } catch (error) {
    console.error('Dev bypass error:', error);
    res.status(500).json({ error: 'Dev bypass failed' });
  }
});

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
      // Fetch full user data from database to get current credits and roles
      const dbUser = await User.findOne({
        where: { vatsimId: req.user.vatsimId },
        attributes: ['credits', 'isAdmin', 'isContributor', 'unlimitedCredits']
      });

      res.json({
        authenticated: true,
        user: {
          vatsimId: req.user.vatsimId,
          name: `${req.user.firstName} ${req.user.lastName}`,
          rating: req.user.rating,
          credits: dbUser ? dbUser.credits : 0,
          isAdmin: dbUser ? dbUser.isAdmin : false,
          isContributor: dbUser ? dbUser.isContributor : false,
          unlimitedCredits: dbUser ? dbUser.unlimitedCredits : false
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
          credits: 0,
          isAdmin: false,
          isContributor: false
        }
      });
    }
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;
