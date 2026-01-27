const express = require('express');
const router = express.Router();
const { PricingDefault, WorldMembership, User } = require('../models');

/**
 * Get global pricing defaults for the current world membership
 */
router.get('/global', async (req, res) => {
  try {
    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(404).json({ error: 'No active world selected' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findOne({ where: { vatsimId: req.user.vatsimId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const membership = await WorldMembership.findOne({
      where: { userId: user.id, worldId: activeWorldId }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Not a member of this world' });
    }

    // Get global pricing for this membership
    let pricing = await PricingDefault.findOne({
      where: {
        worldMembershipId: membership.id,
        pricingType: 'global'
      }
    });

    if (!pricing) {
      // Return default values
      return res.json({
        economyPrice: 0,
        economyPlusPrice: 0,
        businessPrice: 0,
        firstPrice: 0,
        cargoLightRate: 0,
        cargoStandardRate: 0,
        cargoHeavyRate: 0
      });
    }

    res.json(pricing);
  } catch (error) {
    console.error('Error fetching global pricing:', error);
    res.status(500).json({ error: 'Failed to fetch global pricing' });
  }
});

/**
 * Save global pricing defaults
 */
router.post('/global', async (req, res) => {
  try {
    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(404).json({ error: 'No active world selected' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findOne({ where: { vatsimId: req.user.vatsimId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const membership = await WorldMembership.findOne({
      where: { userId: user.id, worldId: activeWorldId }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Not a member of this world' });
    }

    const {
      economyPrice,
      economyPlusPrice,
      businessPrice,
      firstPrice,
      cargoLightRate,
      cargoStandardRate,
      cargoHeavyRate
    } = req.body;

    // Upsert global pricing
    const [pricing] = await PricingDefault.upsert({
      worldMembershipId: membership.id,
      pricingType: 'global',
      economyPrice: economyPrice || 0,
      economyPlusPrice: economyPlusPrice || 0,
      businessPrice: businessPrice || 0,
      firstPrice: firstPrice || 0,
      cargoLightRate: cargoLightRate || 0,
      cargoStandardRate: cargoStandardRate || 0,
      cargoHeavyRate: cargoHeavyRate || 0
    });

    res.json(pricing);
  } catch (error) {
    console.error('Error saving global pricing:', error);
    res.status(500).json({ error: 'Failed to save global pricing' });
  }
});

/**
 * Get aircraft type pricing defaults
 */
router.get('/aircraft-types', async (req, res) => {
  try {
    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(404).json({ error: 'No active world selected' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findOne({ where: { vatsimId: req.user.vatsimId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const membership = await WorldMembership.findOne({
      where: { userId: user.id, worldId: activeWorldId }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Not a member of this world' });
    }

    // Get all aircraft type pricing for this membership
    const pricingList = await PricingDefault.findAll({
      where: {
        worldMembershipId: membership.id,
        pricingType: 'aircraft_type'
      }
    });

    // Convert to object keyed by aircraftTypeKey
    const pricingMap = {};
    pricingList.forEach(pricing => {
      pricingMap[pricing.aircraftTypeKey] = pricing;
    });

    res.json(pricingMap);
  } catch (error) {
    console.error('Error fetching aircraft type pricing:', error);
    res.status(500).json({ error: 'Failed to fetch aircraft type pricing' });
  }
});

/**
 * Save aircraft type pricing
 */
router.post('/aircraft-types', async (req, res) => {
  try {
    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(404).json({ error: 'No active world selected' });
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findOne({ where: { vatsimId: req.user.vatsimId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const membership = await WorldMembership.findOne({
      where: { userId: user.id, worldId: activeWorldId }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Not a member of this world' });
    }

    const {
      aircraftTypeKey,
      economyPrice,
      economyPlusPrice,
      businessPrice,
      firstPrice,
      cargoLightRate,
      cargoStandardRate,
      cargoHeavyRate
    } = req.body;

    if (!aircraftTypeKey) {
      return res.status(400).json({ error: 'Aircraft type key is required' });
    }

    // Upsert aircraft type pricing
    const [pricing] = await PricingDefault.upsert({
      worldMembershipId: membership.id,
      pricingType: 'aircraft_type',
      aircraftTypeKey: aircraftTypeKey,
      economyPrice: economyPrice || null,
      economyPlusPrice: economyPlusPrice || null,
      businessPrice: businessPrice || null,
      firstPrice: firstPrice || null,
      cargoLightRate: cargoLightRate || null,
      cargoStandardRate: cargoStandardRate || null,
      cargoHeavyRate: cargoHeavyRate || null
    });

    res.json(pricing);
  } catch (error) {
    console.error('Error saving aircraft type pricing:', error);
    res.status(500).json({ error: 'Failed to save aircraft type pricing' });
  }
});

module.exports = router;
