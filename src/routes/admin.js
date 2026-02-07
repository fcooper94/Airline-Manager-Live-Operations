const express = require('express');
const router = express.Router();
const { User, WorldMembership, World, Aircraft, Airport, SystemSettings, UserAircraft, UsedAircraftForSale } = require('../models');
const airportCacheService = require('../services/airportCacheService');
const { sellingAirlines, leasingCompanies, aircraftBrokers } = require('../data/aircraftSellers');

/**
 * Get all users with their credit information
 */
router.get('/users', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const users = await User.findAll({
      attributes: ['id', 'vatsimId', 'firstName', 'lastName', 'email', 'credits', 'isAdmin', 'isContributor', 'unlimitedCredits', 'lastLogin'],
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
    const { credits, unlimitedCredits } = req.body;

    if (typeof credits !== 'number') {
      return res.status(400).json({ error: 'Credits must be a number' });
    }

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.credits = credits;
    if (unlimitedCredits !== undefined) {
      user.unlimitedCredits = !!unlimitedCredits;
    }
    await user.save();

    res.json({
      message: 'Credits updated successfully',
      user: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        credits: user.credits,
        unlimitedCredits: user.unlimitedCredits
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
      description,
      joinCost,
      weeklyCost,
      freeWeeks,
      endDate
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
      description,
      joinCost: joinCost !== undefined ? joinCost : 10,
      weeklyCost: weeklyCost !== undefined ? weeklyCost : 1,
      freeWeeks: freeWeeks !== undefined ? freeWeeks : 0,
      endDate: endDate ? new Date(endDate) : null
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

/**
 * Get all system settings
 */
router.get('/settings', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const settings = await SystemSettings.findAll();
    const settingsMap = {};
    settings.forEach(s => {
      try {
        settingsMap[s.key] = JSON.parse(s.value);
      } catch {
        settingsMap[s.key] = s.value;
      }
    });

    res.json(settingsMap);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching settings:', error);
    }
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * Get a specific setting
 */
router.get('/settings/:key', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { key } = req.params;
    const value = await SystemSettings.get(key);

    res.json({ key, value });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching setting:', error);
    }
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

/**
 * Update a setting
 */
router.post('/settings/:key', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { key } = req.params;
    const { value, description } = req.body;

    await SystemSettings.set(key, value, description);

    res.json({ message: 'Setting updated successfully', key, value });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error updating setting:', error);
    }
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// ==================== AIRLINES MANAGEMENT ====================

/**
 * Get all airlines in a world
 */
router.get('/airlines', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { worldId } = req.query;

    if (!worldId) {
      return res.status(400).json({ error: 'World ID is required' });
    }

    const airlines = await WorldMembership.findAll({
      where: { worldId, isActive: true },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'vatsimId', 'firstName', 'lastName']
        },
        {
          model: Airport,
          as: 'baseAirport',
          attributes: ['id', 'icaoCode', 'name', 'city']
        }
      ],
      order: [['airlineName', 'ASC']]
    });

    // Get fleet counts for each airline
    const airlinesWithFleet = await Promise.all(airlines.map(async (airline) => {
      const fleetCount = await UserAircraft.count({
        where: { worldMembershipId: airline.id }
      });

      return {
        ...airline.toJSON(),
        fleetCount
      };
    }));

    res.json(airlinesWithFleet);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching airlines:', error);
    }
    res.status(500).json({ error: 'Failed to fetch airlines' });
  }
});

/**
 * Update airline balance
 */
router.post('/airlines/:airlineId/balance', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { airlineId } = req.params;
    const { balance } = req.body;

    if (typeof balance !== 'number') {
      return res.status(400).json({ error: 'Balance must be a number' });
    }

    const airline = await WorldMembership.findByPk(airlineId);

    if (!airline) {
      return res.status(404).json({ error: 'Airline not found' });
    }

    airline.balance = balance;
    await airline.save();

    res.json({
      message: 'Balance updated successfully',
      airline: {
        id: airline.id,
        airlineName: airline.airlineName,
        balance: airline.balance
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error updating airline balance:', error);
    }
    res.status(500).json({ error: 'Failed to update balance' });
  }
});

/**
 * Get airline fleet
 */
router.get('/airlines/:airlineId/fleet', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { airlineId } = req.params;

    const fleet = await UserAircraft.findAll({
      where: { worldMembershipId: airlineId },
      include: [
        {
          model: Aircraft,
          as: 'aircraft',
          attributes: ['id', 'manufacturer', 'model', 'variant', 'type']
        }
      ],
      order: [['registration', 'ASC']]
    });

    res.json(fleet);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching fleet:', error);
    }
    res.status(500).json({ error: 'Failed to fetch fleet' });
  }
});

/**
 * Add aircraft to airline fleet
 */
router.post('/airlines/:airlineId/fleet', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { airlineId } = req.params;
    const { aircraftId, registration, ageYears, totalFlightHours } = req.body;

    if (!aircraftId || !registration) {
      return res.status(400).json({ error: 'Aircraft ID and registration are required' });
    }

    // Verify airline exists
    const airline = await WorldMembership.findByPk(airlineId);
    if (!airline) {
      return res.status(404).json({ error: 'Airline not found' });
    }

    // Verify aircraft type exists
    const aircraftType = await Aircraft.findByPk(aircraftId);
    if (!aircraftType) {
      return res.status(404).json({ error: 'Aircraft type not found' });
    }

    // Check if registration already exists in this world
    const existingAircraft = await UserAircraft.findOne({
      where: { registration: registration.toUpperCase() },
      include: [{
        model: WorldMembership,
        as: 'membership',
        where: { worldId: airline.worldId }
      }]
    });

    if (existingAircraft) {
      return res.status(400).json({ error: 'Registration already exists in this world' });
    }

    const newAircraft = await UserAircraft.create({
      worldMembershipId: airlineId,
      aircraftId,
      registration: registration.toUpperCase(),
      ageYears: ageYears || 0,
      totalFlightHours: totalFlightHours || 0,
      status: 'active'
    });

    res.json({
      message: 'Aircraft added successfully',
      aircraft: newAircraft
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error adding aircraft to fleet:', error);
    }
    res.status(500).json({ error: 'Failed to add aircraft' });
  }
});

/**
 * Remove aircraft from fleet
 * Optionally add to used aircraft market
 */
router.delete('/airlines/fleet/:aircraftId', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { aircraftId } = req.params;
    const { addToMarket } = req.query;

    const userAircraft = await UserAircraft.findByPk(aircraftId, {
      include: [
        { model: Aircraft, as: 'aircraft' },
        { model: WorldMembership, as: 'membership' }
      ]
    });

    if (!userAircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    // If adding to market, create a UsedAircraftForSale listing
    if (addToMarket === 'true' && userAircraft.aircraft && userAircraft.membership) {
      // Generate random seller from the combined list
      const allSellers = [
        ...sellingAirlines.map(s => ({ ...s, type: 'airline' })),
        ...leasingCompanies.map(s => ({ ...s, type: 'lessor', reason: 'Off-Lease' })),
        ...aircraftBrokers.map(s => ({ ...s, type: 'broker', reason: 'Remarketing' }))
      ];
      const randomSeller = allSellers[Math.floor(Math.random() * allSellers.length)];

      // Calculate used price based on age and condition
      const basePrice = parseFloat(userAircraft.aircraft.purchasePrice) || 50000000;
      const age = userAircraft.ageYears || 0;
      const conditionPct = userAircraft.conditionPercentage || 70;

      // Depreciation factor based on age
      let depreciationFactor;
      if (age <= 5) depreciationFactor = 0.70 - (age * 0.05);
      else if (age <= 10) depreciationFactor = 0.45 - ((age - 5) * 0.04);
      else if (age <= 15) depreciationFactor = 0.25 - ((age - 10) * 0.03);
      else depreciationFactor = Math.max(0.10 - ((age - 15) * 0.01), 0.05);

      depreciationFactor *= (conditionPct / 100);
      depreciationFactor = Math.max(depreciationFactor, 0.03);

      const usedPrice = basePrice * depreciationFactor;
      const leasePrice = usedPrice * (0.003 + Math.random() * 0.002);

      // Calculate check validity (randomized)
      const cCheckRemainingDays = 180 + Math.floor(Math.random() * 365);
      const dCheckRemainingDays = 365 + Math.floor(Math.random() * 1460);

      // Determine condition string
      let conditionStr;
      if (conditionPct >= 85) conditionStr = 'Excellent';
      else if (conditionPct >= 70) conditionStr = 'Very Good';
      else if (conditionPct >= 55) conditionStr = 'Good';
      else if (conditionPct >= 40) conditionStr = 'Fair';
      else conditionStr = 'Poor';

      await UsedAircraftForSale.create({
        worldId: userAircraft.membership.worldId,
        aircraftId: userAircraft.aircraftId,
        sellerName: randomSeller.name,
        sellerType: randomSeller.type,
        sellerCountry: randomSeller.country,
        sellerReason: randomSeller.reason || 'Fleet Restructuring',
        condition: conditionStr,
        conditionPercentage: conditionPct,
        ageYears: age,
        totalFlightHours: parseFloat(userAircraft.totalFlightHours) || 0,
        purchasePrice: usedPrice.toFixed(2),
        leasePrice: leasePrice.toFixed(2),
        cCheckRemainingDays,
        dCheckRemainingDays,
        status: 'available'
      });

      console.log(`[ADMIN] Aircraft ${userAircraft.registration} added to used market. Seller: ${randomSeller.name}`);
    }

    await userAircraft.destroy();

    res.json({
      message: addToMarket === 'true'
        ? 'Aircraft removed and added to used market'
        : 'Aircraft removed successfully'
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error removing aircraft:', error);
    }
    res.status(500).json({ error: 'Failed to remove aircraft' });
  }
});

module.exports = router;
