const express = require('express');
const router = express.Router();
const { User, WorldMembership, World, Aircraft, Airport } = require('../models');
const airportCacheService = require('../services/airportCacheService');

/**
 * Get all users with their credit information
 */
router.get('/users', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const users = await User.findAll({
      attributes: ['id', 'vatsimId', 'firstName', 'lastName', 'email', 'credits', 'isAdmin', 'isContributor', 'lastLogin'],
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
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching users:', error);
    }
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
    if (process.env.NODE_ENV === 'development') {
      console.error('Error updating credits:', error);
    }
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
    if (process.env.NODE_ENV === 'development') {
      console.error('Error adjusting credits:', error);
    }
    res.status(500).json({ error: 'Failed to adjust credits' });
  }
});

/**
 * Update user permissions (admin/contributor status)
 */
router.post('/users/:userId/permissions', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { userId } = req.params;
    const { isAdmin, isContributor } = req.body;

    // Validate input
    if (isAdmin !== undefined && typeof isAdmin !== 'boolean') {
      return res.status(400).json({ error: 'isAdmin must be a boolean' });
    }

    if (isContributor !== undefined && typeof isContributor !== 'boolean') {
      return res.status(400).json({ error: 'isContributor must be a boolean' });
    }

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update permissions if provided
    if (isAdmin !== undefined) {
      user.isAdmin = isAdmin;
    }

    if (isContributor !== undefined) {
      user.isContributor = isContributor;
    }

    await user.save();

    res.json({
      message: 'Permissions updated successfully',
      user: {
        id: user.id,
        vatsimId: user.vatsimId,
        name: `${user.firstName} ${user.lastName}`,
        isAdmin: user.isAdmin,
        isContributor: user.isContributor
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error updating permissions:', error);
    }
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

/**
 * Get all aircraft
 */
router.get('/aircraft', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const aircraft = await Aircraft.findAll({
      order: [['manufacturer', 'ASC'], ['model', 'ASC']]
    });

    res.json(aircraft);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching aircraft:', error);
    }
    res.status(500).json({ error: 'Failed to fetch aircraft' });
  }
});

/**
 * Create new aircraft
 */
router.post('/aircraft', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const {
      manufacturer,
      model,
      variant,
      type,
      rangeCategory,
      rangeNm,
      cruiseSpeed,
      passengerCapacity,
      cargoCapacityKg,
      fuelCapacityLiters,
      purchasePrice,
      usedPrice,
      maintenanceCostPerHour,
      maintenanceCostPerMonth,
      fuelBurnPerHour,
      firstIntroduced,
      availableFrom,
      availableUntil,
      requiredPilots,
      requiredCabinCrew,
      isActive,
      description
    } = req.body;

    // Validate required fields
    if (!manufacturer || !model || !type || !rangeCategory) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const aircraft = await Aircraft.create({
      manufacturer,
      model,
      variant,
      type,
      rangeCategory,
      rangeNm,
      cruiseSpeed,
      passengerCapacity,
      cargoCapacityKg,
      fuelCapacityLiters,
      purchasePrice,
      usedPrice,
      maintenanceCostPerHour,
      maintenanceCostPerMonth,
      fuelBurnPerHour,
      firstIntroduced,
      availableFrom,
      availableUntil,
      requiredPilots: requiredPilots !== undefined ? requiredPilots : 2,
      requiredCabinCrew: requiredCabinCrew !== undefined ? requiredCabinCrew : 0,
      isActive: isActive !== undefined ? isActive : true,
      description
    });

    res.json({
      message: 'Aircraft created successfully',
      aircraft
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating aircraft:', error);
    }
    res.status(500).json({ error: 'Failed to create aircraft' });
  }
});

/**
 * Update aircraft
 */
router.put('/aircraft/:aircraftId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { aircraftId } = req.params;
    const aircraft = await Aircraft.findByPk(aircraftId);

    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    // Update fields
    await aircraft.update(req.body);

    res.json({
      message: 'Aircraft updated successfully',
      aircraft
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error updating aircraft:', error);
    }
    res.status(500).json({ error: 'Failed to update aircraft' });
  }
});

/**
 * Delete aircraft
 */
router.delete('/aircraft/:aircraftId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { aircraftId } = req.params;
    const aircraft = await Aircraft.findByPk(aircraftId);

    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    await aircraft.destroy();

    res.json({ message: 'Aircraft deleted successfully' });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error deleting aircraft:', error);
    }
    res.status(500).json({ error: 'Failed to delete aircraft' });
  }
});

/**
 * Get all worlds
 */
router.get('/worlds', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const worlds = await World.findAll({
      order: [['createdAt', 'ASC']]
    });

    // Add member count to each world
    const worldsWithCounts = await Promise.all(worlds.map(async (world) => {
      const memberCount = await WorldMembership.count({
        where: { worldId: world.id, isActive: true }
      });

      return {
        ...world.toJSON(),
        memberCount
      };
    }));

    res.json(worldsWithCounts);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching worlds:', error);
    }
    res.status(500).json({ error: 'Failed to fetch worlds' });
  }
});

/**
 * Create new world
 */
router.post('/worlds', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const {
      name,
      era,
      startDate,
      timeAcceleration,
      maxPlayers,
      status,
      description
    } = req.body;

    // Debug: Log received data
    console.log('Creating world with data:', {
      name,
      era,
      startDate,
      startDateType: typeof startDate,
      timeAcceleration,
      maxPlayers,
      status
    });

    // Validate required fields
    if (!name || !era || !startDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Ensure startDate is a proper Date object
    const startDateObj = new Date(startDate);
    console.log('Parsed startDate:', startDateObj, 'ISO:', startDateObj.toISOString());

    const world = await World.create({
      name,
      era,
      startDate: startDateObj,
      currentTime: startDateObj, // Start with the start date
      timeAcceleration: timeAcceleration || 60,
      maxPlayers: maxPlayers || 100,
      status: status || 'setup',
      description
    });

    console.log('Created world:', {
      id: world.id,
      name: world.name,
      startDate: world.startDate,
      currentTime: world.currentTime,
      era: world.era
    });

    res.json({
      message: 'World created successfully',
      world
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating world:', error);
    }
    res.status(500).json({ error: 'Failed to create world' });
  }
});

/**
 * Update world
 */
router.put('/worlds/:worldId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { worldId } = req.params;
    const world = await World.findByPk(worldId);

    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    // Update fields
    await world.update(req.body);

    res.json({
      message: 'World updated successfully',
      world
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error updating world:', error);
    }
    res.status(500).json({ error: 'Failed to update world' });
  }
});

/**
 * Delete world
 */
router.delete('/worlds/:worldId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { worldId } = req.params;
    const world = await World.findByPk(worldId);

    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    // Delete all memberships in this world first
    await WorldMembership.destroy({
      where: { worldId: world.id }
    });

    // Then delete the world
    await world.destroy();

    res.json({ message: 'World deleted successfully' });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error deleting world:', error);
    }
    res.status(500).json({ error: 'Failed to delete world' });
  }
});

/**
 * Get all airports
 */
router.get('/airports', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const airports = await Airport.findAll({
      order: [['icaoCode', 'ASC']]
    });

    res.json(airports);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching airports:', error);
    }
    res.status(500).json({ error: 'Failed to fetch airports' });
  }
});

/**
 * Create new airport
 */
router.post('/airports', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const {
      icaoCode,
      iataCode,
      name,
      city,
      country,
      latitude,
      longitude,
      elevation,
      type,
      timezone,
      isActive,
      operationalFrom,
      operationalUntil
    } = req.body;

    // Validate required fields
    if (!icaoCode || !name || !city || !country || latitude === undefined || longitude === undefined || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate ICAO code format (4 letters)
    if (!/^[A-Z]{4}$/.test(icaoCode.toUpperCase())) {
      return res.status(400).json({ error: 'ICAO code must be exactly 4 uppercase letters' });
    }

    // Validate IATA code if provided (3 letters)
    if (iataCode && !/^[A-Z]{3}$/.test(iataCode.toUpperCase())) {
      return res.status(400).json({ error: 'IATA code must be exactly 3 uppercase letters' });
    }

    // Check if ICAO code already exists
    const existingAirport = await Airport.findOne({
      where: { icaoCode: icaoCode.toUpperCase() }
    });

    if (existingAirport) {
      return res.status(400).json({ error: 'Airport with this ICAO code already exists' });
    }

    const airport = await Airport.create({
      icaoCode: icaoCode.toUpperCase(),
      iataCode: iataCode ? iataCode.toUpperCase() : null,
      name,
      city,
      country,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      elevation: elevation ? parseInt(elevation) : null,
      type,
      timezone,
      isActive: isActive !== undefined ? isActive : true,
      operationalFrom: operationalFrom ? parseInt(operationalFrom) : null,
      operationalUntil: operationalUntil ? parseInt(operationalUntil) : null
    });

    // Clear airport cache since data changed
    airportCacheService.clearAll();

    res.json({
      message: 'Airport created successfully',
      airport
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating airport:', error);
    }
    res.status(500).json({ error: 'Failed to create airport' });
  }
});

/**
 * Update airport
 */
router.put('/airports/:airportId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { airportId } = req.params;
    const airport = await Airport.findByPk(airportId);

    if (!airport) {
      return res.status(404).json({ error: 'Airport not found' });
    }

    // If ICAO code is being changed, validate it
    if (req.body.icaoCode && req.body.icaoCode !== airport.icaoCode) {
      if (!/^[A-Z]{4}$/.test(req.body.icaoCode.toUpperCase())) {
        return res.status(400).json({ error: 'ICAO code must be exactly 4 uppercase letters' });
      }

      const existingAirport = await Airport.findOne({
        where: { icaoCode: req.body.icaoCode.toUpperCase() }
      });

      if (existingAirport) {
        return res.status(400).json({ error: 'Airport with this ICAO code already exists' });
      }

      req.body.icaoCode = req.body.icaoCode.toUpperCase();
    }

    // Validate IATA code if provided
    if (req.body.iataCode && !/^[A-Z]{3}$/.test(req.body.iataCode.toUpperCase())) {
      return res.status(400).json({ error: 'IATA code must be exactly 3 uppercase letters' });
    }

    if (req.body.iataCode) {
      req.body.iataCode = req.body.iataCode.toUpperCase();
    }

    // Update fields
    await airport.update(req.body);

    // Clear airport cache since data changed
    airportCacheService.clearAll();

    res.json({
      message: 'Airport updated successfully',
      airport
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error updating airport:', error);
    }
    res.status(500).json({ error: 'Failed to update airport' });
  }
});

/**
 * Delete airport
 */
router.delete('/airports/:airportId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { airportId } = req.params;
    const airport = await Airport.findByPk(airportId);

    if (!airport) {
      return res.status(404).json({ error: 'Airport not found' });
    }

    // Check if any airlines are using this as their base airport
    const airlinesUsingAirport = await WorldMembership.count({
      where: { baseAirportId: airportId }
    });

    if (airlinesUsingAirport > 0) {
      return res.status(400).json({
        error: `Cannot delete airport: ${airlinesUsingAirport} airline(s) are using this as their base airport`
      });
    }

    await airport.destroy();

    // Clear airport cache since data changed
    airportCacheService.clearAll();

    res.json({ message: 'Airport deleted successfully' });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error deleting airport:', error);
    }
    res.status(500).json({ error: 'Failed to delete airport' });
  }
});

/**
 * Clear airport cache (force refresh)
 */
router.post('/airports/clear-cache', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const cleared = airportCacheService.clearAll();

    res.json({
      message: 'Airport cache cleared successfully',
      entriesCleared: cleared
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error clearing airport cache:', error);
    }
    res.status(500).json({ error: 'Failed to clear airport cache' });
  }
});

/**
 * Get airport cache statistics
 */
router.get('/airports/cache-stats', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const stats = airportCacheService.getStats();
    res.json(stats);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error getting cache stats:', error);
    }
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

module.exports = router;
