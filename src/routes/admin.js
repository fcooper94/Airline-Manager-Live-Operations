const express = require('express');
const router = express.Router();
const { User, WorldMembership, World } = require('../models');

/**
 * Get all users with their credit information
 */
router.get('/users', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const users = await User.findAll({
      attributes: ['id', 'vatsimId', 'firstName', 'lastName', 'email', 'credits', 'lastLogin'],
      order: [['lastName', 'ASC'], ['firstName', 'ASC']]
    });

    // Get membership counts for each user
    const usersWithMemberships = await Promise.all(users.map(async (user) => {
      const membershipCount = await WorldMembership.count({
        where: { userId: user.id, isActive: true }
      });

      return {
        ...user.toJSON(),
        membershipCount
      };
    }));

    res.json(usersWithMemberships);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * Update user credits
 */
router.post('/users/:userId/credits', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { userId } = req.params;
    const { credits } = req.body;

    if (typeof credits !== 'number') {
      return res.status(400).json({ error: 'Credits must be a number' });
    }

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.credits = credits;
    await user.save();

    res.json({
      message: 'Credits updated successfully',
      user: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        credits: user.credits
      }
    });
  } catch (error) {
    console.error('Error updating credits:', error);
    res.status(500).json({ error: 'Failed to update credits' });
  }
});

/**
 * Adjust user credits (add/subtract)
 */
router.post('/users/:userId/adjust-credits', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { userId } = req.params;
    const { amount } = req.body;

    if (typeof amount !== 'number') {
      return res.status(400).json({ error: 'Amount must be a number' });
    }

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.credits += amount;
    await user.save();

    res.json({
      message: 'Credits adjusted successfully',
      user: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        credits: user.credits
      }
    });
  } catch (error) {
    console.error('Error adjusting credits:', error);
    res.status(500).json({ error: 'Failed to adjust credits' });
  }
});

module.exports = router;
