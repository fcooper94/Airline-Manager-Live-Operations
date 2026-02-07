const express = require('express');
const router = express.Router();
const worldTimeService = require('../services/worldTimeService');
const airportGrowthService = require('../services/airportGrowthService');
const historicalCountryService = require('../services/historicalCountryService');
const airportCacheService = require('../services/airportCacheService');
const airportSlotService = require('../services/airportSlotService');
const routeDemandService = require('../services/routeDemandService');
const { World, WorldMembership, User, Airport, UserAircraft, Route, ScheduledFlight, RecurringMaintenance, PricingDefault } = require('../models');

/**
 * Get current world information (from session)
 */
router.get('/info', async (req, res) => {
  try {
    // Get active world from session
    const activeWorldId = req.session?.activeWorldId;

    if (!activeWorldId) {
      return res.status(404).json({
        error: 'No active world selected',
        message: 'Please select a world first'
      });
    }

    // Get the specific world
    const world = await World.findByPk(activeWorldId);

    if (!world) {
      return res.status(404).json({
        error: 'World not found',
        message: 'The selected world does not exist'
      });
    }

    // Get user's membership data for this world (for balance info)
    let membership = null;
    let baseAirport = null;
    if (req.user) {
      const user = await User.findOne({ where: { vatsimId: req.user.vatsimId } });
      if (user) {
        membership = await WorldMembership.findOne({
          where: { userId: user.id, worldId: activeWorldId },
          include: [{
            model: Airport,
            as: 'baseAirport'
          }]
        });

        if (membership && membership.baseAirport) {
          baseAirport = membership.baseAirport;
        }
      }
    }

    // Get the current time from worldTimeService (always up-to-date in memory)
    // instead of reading from database which is only saved every 10 seconds
    let currentTime = worldTimeService.getCurrentTime(activeWorldId);
    let timeSource = 'memory';

    if (!currentTime) {
      // Fall back to database time if world not loaded in memory
      timeSource = 'database';
      currentTime = world.currentTime;

      const timeDiffMs = Date.now() - world.lastTickAt?.getTime();
      if (process.env.NODE_ENV === 'development') {
        console.warn(`⚠ World ${activeWorldId} (${world.name}) not in memory, using database time`);
        console.warn(`  Database time: ${currentTime.toISOString()}`);
        console.warn(`  Last tick: ${world.lastTickAt ? world.lastTickAt.toISOString() : 'never'} (${timeDiffMs ? Math.round(timeDiffMs / 1000) : '?'}s ago)`);
        console.warn(`  Time may be stale - attempting to start world...`);
      }

      // Try to start the world in memory for future requests
      worldTimeService.startWorld(activeWorldId).catch(err => {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to start world:', err.message);
        }
      });
    } else if (process.env.NODE_ENV === 'development') {
      // Log successful in-memory time fetch
      const dbDiff = currentTime.getTime() - world.currentTime.getTime();
      if (Math.abs(dbDiff) > 60000) { // More than 1 minute difference
        console.log(`ℹ World ${world.name} in-memory time: ${currentTime.toISOString()}, DB time: ${world.currentTime.toISOString()} (diff: ${Math.round(dbDiff / 1000)}s)`);
      }
    }

    // Calculate elapsed days based on the world's dates
    const elapsedMs = currentTime.getTime() - world.startDate.getTime();
    const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));

    // Calculate the decade from currentTime (e.g., 1995 -> "90's")
    const currentYear = currentTime.getFullYear();
    const decade = Math.floor(currentYear / 10) * 10;
    const decadeString = `${decade.toString().slice(-2)}'s`;

    // Return world info
    const worldInfo = {
      id: world.id,
      name: world.name,
      description: world.description,
      currentTime: currentTime,
      serverTimestamp: Date.now(), // Include server timestamp for accurate client-side calculation
      timeSource: timeSource, // 'memory' or 'database' - helps debug time issues
      startDate: world.startDate,
      timeAcceleration: world.timeAcceleration,
      era: decadeString,
      status: world.status,
      isPaused: world.isPaused,
      isOperating: world.isOperating ? world.isOperating() : false,
      elapsedDays: elapsedDays,
      // Include user's membership data
      airlineName: membership?.airlineName,
      airlineCode: membership?.airlineCode,
      iataCode: membership?.iataCode,
      balance: membership?.balance || 0,
      reputation: membership?.reputation || 0,
      endDate: world.endDate || null,
      // Include base airport info for registration prefix and route planning
      baseAirport: baseAirport ? {
        id: baseAirport.id,
        icaoCode: baseAirport.icaoCode,
        iataCode: baseAirport.iataCode,
        name: baseAirport.name,
        city: baseAirport.city,
        country: baseAirport.country,
        latitude: parseFloat(baseAirport.latitude),
        longitude: parseFloat(baseAirport.longitude)
      } : null
    };

    res.json(worldInfo);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error getting world info:', error);
    }
    res.status(500).json({ error: 'Failed to get world information' });
  }
});

/**
 * Get current game time
 */
router.get('/time', async (req, res) => {
  try {
    const currentTime = await worldTimeService.getCurrentTime();

    if (!currentTime) {
      return res.status(404).json({ error: 'No active world found' });
    }

    res.json({
      gameTime: currentTime.toISOString(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error getting world time:', error);
    }
    res.status(500).json({ error: 'Failed to get world time' });
  }
});

/**
 * Pause the world
 */
router.post('/pause', async (req, res) => {
  try {
    await worldTimeService.pauseWorld();
    res.json({ message: 'World paused', status: 'paused' });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error pausing world:', error);
    }
    res.status(500).json({ error: 'Failed to pause world' });
  }
});

/**
 * Resume the world
 */
router.post('/resume', async (req, res) => {
  try {
    await worldTimeService.resumeWorld();
    res.json({ message: 'World resumed', status: 'active' });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error resuming world:', error);
    }
    res.status(500).json({ error: 'Failed to resume world' });
  }
});

/**
 * Set time acceleration
 */
router.post('/acceleration', async (req, res) => {
  try {
    const { factor } = req.body;

    if (!factor || factor <= 0) {
      return res.status(400).json({ error: 'Invalid acceleration factor' });
    }

    await worldTimeService.setTimeAcceleration(parseFloat(factor));

    res.json({
      message: 'Time acceleration updated',
      factor: parseFloat(factor)
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error setting acceleration:', error);
    }
    res.status(500).json({ error: 'Failed to set time acceleration' });
  }
});

/**
 * Get all worlds
 */
router.get('/list', async (req, res) => {
  try {
    const worlds = await World.findAll({
      order: [['createdAt', 'DESC']]
    });

    res.json(worlds);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error listing worlds:', error);
    }
    res.status(500).json({ error: 'Failed to list worlds' });
  }
});

/**
 * Get specific world information by ID
 */
router.get('/:worldId/info', async (req, res) => {
  try {
    const { worldId } = req.params;

    // Get the specific world
    const world = await World.findByPk(worldId);

    if (!world) {
      return res.status(404).json({
        error: 'World not found',
        message: 'The requested world does not exist'
      });
    }

    // Calculate elapsed days based on the world's dates
    const elapsedMs = world.currentTime.getTime() - world.startDate.getTime();
    const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));

    // Calculate the decade from currentTime (e.g., 1995 -> "90's")
    const currentYear = world.currentTime.getFullYear();
    const decade = Math.floor(currentYear / 10) * 10;
    const decadeString = `${decade.toString().slice(-2)}'s`;

    // Return world info directly without using the service
    const worldInfo = {
      id: world.id,
      name: world.name,
      description: world.description,
      currentTime: world.currentTime,
      startDate: world.startDate,
      timeAcceleration: world.timeAcceleration,
      era: decadeString,
      status: world.status,
      isPaused: world.isPaused,
      isOperating: world.isOperating ? world.isOperating() : false,
      elapsedDays: elapsedDays
    };

    res.json(worldInfo);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error getting world info:', error);
    }
    res.status(500).json({ error: 'Failed to get world information' });
  }
});

/**
 * Get all airports for base selection (with caching)
 */
router.get('/airports', async (req, res) => {
  try {
    const startTime = Date.now();
    const { type, search, country, worldId } = req.query;

    // Determine effective world ID
    const effectiveWorldId = worldId || req.session?.activeWorldId;

    console.log(`[AIRPORT API] Request - worldId: ${effectiveWorldId}, type: ${type}, country: ${country}, search: ${search}`);

    // Try to get from cache first
    let airportsData = airportCacheService.get(effectiveWorldId, type, country, search);
    let isFirstLoad = false;

    // If not in cache, fetch from database and cache it
    if (!airportsData) {
      console.log('[AIRPORT API] Cache MISS - fetching from database...');
      isFirstLoad = true;
      airportsData = await airportCacheService.fetchAndCacheAirports(
        effectiveWorldId,
        type,
        country,
        search
      );
    } else {
      console.log('[AIRPORT API] Cache HIT - returning cached data');
    }

    const duration = Date.now() - startTime;
    console.log(`[AIRPORT API] Response time: ${duration}ms, airports: ${airportsData.length}`);

    res.json({
      airports: airportsData,
      isFirstLoad: isFirstLoad,
      count: airportsData.length
    });
  } catch (error) {
    console.error('Error fetching airports:', error);
    if (process.env.NODE_ENV === 'development') {
      console.error('Full error details:', error.stack);
    }
    res.status(500).json({ error: 'Failed to fetch airports', details: error.message });
  }
});

/**
 * Get airport by ICAO code
 */
router.get('/airports/:icaoCode', async (req, res) => {
  try {
    const { icaoCode } = req.params;

    const airport = await Airport.findOne({
      where: { icaoCode: icaoCode.toUpperCase() }
    });

    if (!airport) {
      return res.status(404).json({ error: 'Airport not found' });
    }

    res.json(airport);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching airport:', error);
    }
    res.status(500).json({ error: 'Failed to fetch airport' });
  }
});

/**
 * Get top destinations with demand from an airport
 */
router.get('/airports/:id/demand', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;
    const worldId = req.session?.activeWorldId;

    if (!worldId) {
      return res.status(400).json({ error: 'No active world' });
    }

    const world = await World.findByPk(worldId);
    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    const currentYear = world.currentTime.getFullYear();

    const airport = await Airport.findByPk(id);
    if (!airport) {
      return res.status(404).json({ error: 'Airport not found' });
    }

    const destinations = await routeDemandService.getTopDestinations(
      id,
      currentYear,
      parseInt(limit)
    );

    res.json({
      airport,
      destinations,
      worldYear: currentYear
    });

  } catch (error) {
    console.error('Error fetching route demand:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get detailed slot information for an airport
 */
router.get('/airports/:id/slots', async (req, res) => {
  try {
    const { id } = req.params;
    const worldId = req.session?.activeWorldId;

    if (!worldId) {
      return res.status(400).json({ error: 'No active world' });
    }

    const world = await World.findByPk(worldId);
    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    const currentYear = world.currentTime.getFullYear();
    const airport = await Airport.findByPk(id);
    if (!airport) {
      return res.status(404).json({ error: 'Airport not found' });
    }

    const metrics = airportGrowthService.getAirportMetricsExtended(airport, currentYear);
    const slots = await airportSlotService.getSlotAvailability(id, worldId);

    res.json({
      airport: {
        id: airport.id,
        icaoCode: airport.icaoCode,
        name: airport.name
      },
      slots,
      metrics: {
        movementsIndex: metrics.movementsIndex,
        infrastructureLevel: metrics.infrastructureLevel,
        runways: metrics.runways
      }
    });

  } catch (error) {
    console.error('Error fetching slot data:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Declare bankruptcy - liquidate all assets and reset airline
 */
router.post('/bankruptcy', async (req, res) => {
  const sequelize = require('../config/database');
  const transaction = await sequelize.transaction();

  try {
    const activeWorldId = req.session?.activeWorldId;

    if (!activeWorldId) {
      await transaction.rollback();
      return res.status(400).json({ error: 'No active world selected' });
    }

    if (!req.user) {
      await transaction.rollback();
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get user
    const user = await User.findOne({ where: { vatsimId: req.user.vatsimId } });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    // Get membership
    const membership = await WorldMembership.findOne({
      where: { userId: user.id, worldId: activeWorldId },
      include: [
        { model: UserAircraft, as: 'fleet' },
        { model: Route, as: 'routes' }
      ]
    });

    if (!membership) {
      await transaction.rollback();
      return res.status(404).json({ error: 'No airline found in this world' });
    }

    // Calculate liquidation value (50% of aircraft purchase prices)
    let liquidationValue = 0;
    const aircraftSold = [];

    if (membership.fleet && membership.fleet.length > 0) {
      for (const aircraft of membership.fleet) {
        const saleValue = Math.round(parseFloat(aircraft.purchasePrice || 0) * 0.5);
        liquidationValue += saleValue;
        aircraftSold.push({
          registration: aircraft.registration,
          purchasePrice: parseFloat(aircraft.purchasePrice || 0),
          saleValue: saleValue
        });
      }
    }

    // Get aircraft IDs for deleting related records
    const aircraftIds = membership.fleet ? membership.fleet.map(a => a.id) : [];
    const routeIds = membership.routes ? membership.routes.map(r => r.id) : [];

    // Delete all related records in order (respect foreign keys)

    // 1. Delete scheduled flights for all routes
    if (routeIds.length > 0) {
      await ScheduledFlight.destroy({
        where: { routeId: routeIds },
        transaction
      });
    }

    // 2. Delete scheduled flights for all aircraft (maintenance blocks)
    if (aircraftIds.length > 0) {
      await ScheduledFlight.destroy({
        where: { aircraftId: aircraftIds },
        transaction
      });
    }

    // 3. Delete recurring maintenance
    if (aircraftIds.length > 0) {
      await RecurringMaintenance.destroy({
        where: { aircraftId: aircraftIds },
        transaction
      });
    }

    // 4. Delete routes
    await Route.destroy({
      where: { worldMembershipId: membership.id },
      transaction
    });

    // 5. Delete fleet
    await UserAircraft.destroy({
      where: { worldMembershipId: membership.id },
      transaction
    });

    // 6. Delete pricing defaults
    await PricingDefault.destroy({
      where: { worldMembershipId: membership.id },
      transaction
    });

    // 7. Delete the membership itself
    await membership.destroy({ transaction });

    // Clear the active world from session
    req.session.activeWorldId = null;

    await transaction.commit();

    console.log(`[BANKRUPTCY] User ${user.id} declared bankruptcy in world ${activeWorldId}. Liquidation value: $${liquidationValue}`);

    res.json({
      success: true,
      message: 'Bankruptcy declared successfully',
      summary: {
        airlineName: membership.airlineName,
        aircraftSold: aircraftSold.length,
        routesCancelled: routeIds.length,
        liquidationValue: liquidationValue,
        details: aircraftSold
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error declaring bankruptcy:', error);
    res.status(500).json({ error: 'Failed to declare bankruptcy', details: error.message });
  }
});

module.exports = router;
