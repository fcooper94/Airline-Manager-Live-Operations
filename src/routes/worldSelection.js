const express = require('express');
const router = express.Router();
const { World, WorldMembership, User, Airport } = require('../models');
const eraEconomicService = require('../services/eraEconomicService');

/**
 * Get all available worlds for user to join
 */
router.get('/available', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Find user in database
    const user = await User.findOne({ where: { vatsimId: req.user.vatsimId } });

    // Get all active worlds
    const worlds = await World.findAll({
      where: { status: 'active' },
      attributes: ['id', 'name', 'description', 'era', 'currentTime', 'timeAcceleration', 'maxPlayers', 'joinCost', 'weeklyCost', 'freeWeeks', 'endDate'],
      order: [['createdAt', 'DESC']]
    });

    // Get user's memberships if they exist
    let userMemberships = [];
    if (user) {
      userMemberships = await WorldMembership.findAll({
        where: { userId: user.id },
        attributes: ['worldId', 'airlineName', 'airlineCode', 'iataCode', 'lastVisited']
      });
    }

    const membershipMap = new Map(userMemberships.map(m => [m.worldId, m]));

    // Enhance worlds with membership status
    const worldsWithStatus = await Promise.all(worlds.map(async (world) => {
      const memberCount = await WorldMembership.count({ where: { worldId: world.id } });
      const membership = membershipMap.get(world.id);

      // Calculate the decade from currentTime (e.g., 1995 -> "90's")
      const currentYear = world.currentTime.getFullYear();
      const decade = Math.floor(currentYear / 10) * 10;
      const decadeString = `${decade.toString().slice(-2)}'s`;

      return {
        ...world.toJSON(),
        era: decadeString,
        memberCount,
        isMember: !!membership,
        airlineName: membership?.airlineName,
        airlineCode: membership?.airlineCode,
        iataCode: membership?.iataCode,
        lastVisited: membership?.lastVisited || null
      };
    }));

    res.json(worldsWithStatus);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching worlds:', error);
    }
    res.status(500).json({ error: 'Failed to fetch worlds' });
  }
});

/**
 * Join a world
 */
router.post('/join', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { worldId, airlineName, airlineCode, iataCode, baseAirportId } = req.body;

    if (!worldId || !airlineName || !airlineCode || !iataCode || !baseAirportId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate airline code format (3 letters ICAO)
    if (!/^[A-Z]{3}$/.test(airlineCode)) {
      return res.status(400).json({ error: 'ICAO code must be 3 uppercase letters' });
    }

    // Validate IATA code format (2 letters)
    if (!/^[A-Z]{2}$/.test(iataCode)) {
      return res.status(400).json({ error: 'IATA code must be 2 uppercase letters' });
    }

    // Verify airport exists and get region from airport
    const airport = await Airport.findByPk(baseAirportId);
    if (!airport) {
      return res.status(404).json({ error: 'Selected airport not found' });
    }

    // Derive region from airport's country
    const region = airport.country;

    // Check if world exists first (need it for era calculation)
    const world = await World.findByPk(worldId);
    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    // Get world's current year for era-based starting capital
    const worldYear = new Date(world.currentTime).getFullYear();

    // Determine starting balance based on world era (everyone starts with same capital)
    // This ensures fair gameplay across all time periods
    const startingBalance = eraEconomicService.getStartingCapital(worldYear);

    if (process.env.NODE_ENV === 'development') {
      console.log(`Starting capital for ${worldYear}: $${startingBalance.toLocaleString()}`);
    }

    // Cost to join this world (from world settings, default 10)
    const JOIN_COST_CREDITS = world.joinCost !== undefined ? world.joinCost : 10;

    // Find or create user
    const [user] = await User.findOrCreate({
      where: { vatsimId: req.user.vatsimId },
      defaults: {
        vatsimId: req.user.vatsimId,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        rating: req.user.rating,
        pilotRating: req.user.pilotRating,
        division: req.user.division,
        subdivision: req.user.subdivision,
        lastLogin: new Date()
      }
    });

    // Check if user has enough credits to join
    if (user.credits < JOIN_COST_CREDITS) {
      return res.status(400).json({
        error: `Not enough credits to join a world. You need ${JOIN_COST_CREDITS} credits but only have ${user.credits}.`,
        creditsRequired: JOIN_COST_CREDITS,
        creditsAvailable: user.credits
      });
    }

    // Check if already a member
    const existing = await WorldMembership.findOne({
      where: { userId: user.id, worldId }
    });

    if (existing) {
      return res.status(400).json({ error: 'Already a member of this world' });
    }

    // Check if ICAO airline code is taken
    const icaoCodeTaken = await WorldMembership.findOne({
      where: { worldId, airlineCode }
    });

    if (icaoCodeTaken) {
      return res.status(400).json({ error: 'ICAO code already taken in this world' });
    }

    // Check if IATA code is taken
    const iataCodeTaken = await WorldMembership.findOne({
      where: { worldId, iataCode }
    });

    if (iataCodeTaken) {
      return res.status(400).json({ error: 'IATA code already taken in this world' });
    }

    // Calculate credit deduction start time (offset by free weeks if applicable)
    const freeWeeks = world.freeWeeks || 0;
    let creditDeductionStart = new Date(world.currentTime);
    if (freeWeeks > 0) {
      creditDeductionStart = new Date(creditDeductionStart.getTime() + (freeWeeks * 7 * 24 * 60 * 60 * 1000));
    }

    // Create membership
    const membership = await WorldMembership.create({
      userId: user.id,
      worldId,
      airlineName,
      airlineCode,
      iataCode,
      region,
      baseAirportId,
      balance: startingBalance,
      reputation: 50,
      lastCreditDeduction: creditDeductionStart // Offset by free weeks so deductions start later
    });

    // Deduct credits for joining
    user.credits -= JOIN_COST_CREDITS;
    await user.save();

    if (process.env.NODE_ENV === 'development') {
      console.log(`Deducted ${JOIN_COST_CREDITS} credits from user ${user.id} for joining world. New balance: ${user.credits}`);
    }

    res.json({
      message: 'Successfully joined world',
      membership: {
        worldId: membership.worldId,
        airlineName: membership.airlineName,
        airlineCode: membership.airlineCode,
        iataCode: membership.iataCode,
        balance: membership.balance
      },
      creditsDeducted: JOIN_COST_CREDITS,
      creditsRemaining: user.credits
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error joining world:', error);
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Airline code already taken' });
    }

    res.status(500).json({ error: 'Failed to join world' });
  }
});

/**
 * Leave a world (declare bankruptcy)
 */
router.post('/leave', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { worldId } = req.body;

    if (!worldId) {
      return res.status(400).json({ error: 'World ID required' });
    }

    const user = await User.findOne({ where: { vatsimId: req.user.vatsimId } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find membership
    const membership = await WorldMembership.findOne({
      where: { userId: user.id, worldId }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Not a member of this world' });
    }

    // Delete membership (declare bankruptcy)
    await membership.destroy();

    res.json({ message: 'Successfully left world' });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error leaving world:', error);
    }
    res.status(500).json({ error: 'Failed to leave world' });
  }
});

/**
 * Get user's worlds with details
 */
router.get('/my-worlds', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findOne({ where: { vatsimId: req.user.vatsimId } });

    if (!user) {
      return res.json([]);
    }

    const memberships = await WorldMembership.findAll({
      where: { userId: user.id, isActive: true },
      include: [{
        model: World,
        as: 'world',
        attributes: ['id', 'name', 'description', 'era', 'currentTime', 'timeAcceleration', 'status']
      }],
      order: [['joinedAt', 'DESC']]
    });

    const myWorlds = memberships.map(m => ({
      worldId: m.worldId,
      worldName: m.world.name,
      worldEra: m.world.era,
      worldStatus: m.world.status,
      airlineName: m.airlineName,
      airlineCode: m.airlineCode,
      balance: m.balance,
      reputation: m.reputation,
      joinedAt: m.joinedAt
    }));

    res.json(myWorlds);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching user worlds:', error);
    }
    res.status(500).json({ error: 'Failed to fetch your worlds' });
  }
});

/**
 * Get starting capital for a world
 */
router.get('/:worldId/starting-capital', async (req, res) => {
  try {
    const { worldId } = req.params;

    const world = await World.findByPk(worldId);
    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    const worldYear = new Date(world.currentTime).getFullYear();
    const startingCapital = eraEconomicService.getStartingCapital(worldYear);
    const eraInfo = eraEconomicService.getStartingCapitalInfo(worldYear);

    res.json({
      worldYear,
      startingCapital,
      formattedCapital: eraInfo.displayCapital,
      eraName: eraInfo.eraName,
      multiplier: eraInfo.multiplier
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error getting starting capital:', error);
    }
    res.status(500).json({ error: 'Failed to get starting capital' });
  }
});

/**
 * Set active world in session
 */
router.post('/set-active', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { worldId } = req.body;

    if (!worldId) {
      return res.status(400).json({ error: 'World ID required' });
    }

    // Verify the user is a member of this world
    const user = await User.findOne({ where: { vatsimId: req.user.vatsimId } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const membership = await WorldMembership.findOne({
      where: { userId: user.id, worldId }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this world' });
    }

    // Update last visited timestamp
    await membership.update({ lastVisited: new Date() });

    // Verify world exists
    const world = await World.findByPk(worldId);
    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    // Set active world in session
    req.session.activeWorldId = worldId;

    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({
      message: 'Active world set successfully',
      worldId,
      worldName: world.name
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error setting active world:', error);
    }
    res.status(500).json({ error: 'Failed to set active world' });
  }
});

module.exports = router;
