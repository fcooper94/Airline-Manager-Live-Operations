const express = require('express');
const router = express.Router();
const worldTimeService = require('../services/worldTimeService');
const airportGrowthService = require('../services/airportGrowthService');
const historicalCountryService = require('../services/historicalCountryService');
const { World, WorldMembership, User, Airport } = require('../models');

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
 * Get all airports for base selection
 */
router.get('/airports', async (req, res) => {
  try {
    const { type, search, country, worldId } = req.query;
    const { Op } = require('sequelize');

    // Build where clause
    const whereClause = { isActive: true };

    if (type) {
      whereClause.type = type;
    }

    if (country) {
      whereClause.country = country;
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } },
        { icaoCode: { [Op.iLike]: `%${search}%` } },
        { iataCode: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Filter by operational dates based on world's current time
    if (worldId) {
      const world = await World.findByPk(worldId);
      if (world && world.currentTime) {
        const worldYear = world.currentTime.getFullYear();

        // Airport must have opened before or during the world year
        whereClause[Op.and] = [
          {
            [Op.or]: [
              { operationalFrom: null }, // No start date specified
              { operationalFrom: { [Op.lte]: worldYear } } // Opened on or before world year
            ]
          },
          {
            [Op.or]: [
              { operationalUntil: null }, // Still operational
              { operationalUntil: { [Op.gte]: worldYear } } // Closed on or after world year
            ]
          }
        ];
      }
    } else {
      // If no worldId, use session's active world
      const activeWorldId = req.session?.activeWorldId;
      if (activeWorldId) {
        const world = await World.findByPk(activeWorldId);
        if (world && world.currentTime) {
          const worldYear = world.currentTime.getFullYear();

          whereClause[Op.and] = [
            {
              [Op.or]: [
                { operationalFrom: null },
                { operationalFrom: { [Op.lte]: worldYear } }
              ]
            },
            {
              [Op.or]: [
                { operationalUntil: null },
                { operationalUntil: { [Op.gte]: worldYear } }
              ]
            }
          ];
        }
      }
    }

    // Use a more efficient query with LEFT JOIN to get airline counts
    const sequelize = require('../config/database');
    const { QueryTypes } = require('sequelize');

    // Build the SQL query dynamically based on whereClause
    let whereClauses = ['a.is_active = true'];
    let replacements = {};

    if (type) {
      whereClauses.push('a.type = :type');
      replacements.type = type;
    }

    if (country) {
      whereClauses.push('a.country = :country');
      replacements.country = country;
    }

    if (search) {
      whereClauses.push(`(
        a.name ILIKE :search OR
        a.city ILIKE :search OR
        a.icao_code ILIKE :search OR
        a.iata_code ILIKE :search
      )`);
      replacements.search = `%${search}%`;
    }

    // Add world year filtering if applicable
    if (worldId) {
      const world = await World.findByPk(worldId);
      if (world && world.currentTime) {
        const worldYear = world.currentTime.getFullYear();
        whereClauses.push(`(
          (a.operational_from IS NULL OR a.operational_from <= :worldYear) AND
          (a.operational_until IS NULL OR a.operational_until >= :worldYear)
        )`);
        replacements.worldYear = worldYear;
      }
    } else if (req.session?.activeWorldId) {
      const world = await World.findByPk(req.session.activeWorldId);
      if (world && world.currentTime) {
        const worldYear = world.currentTime.getFullYear();
        whereClauses.push(`(
          (a.operational_from IS NULL OR a.operational_from <= :worldYear) AND
          (a.operational_until IS NULL OR a.operational_until >= :worldYear)
        )`);
        replacements.worldYear = worldYear;
      }
    }

    const whereSQL = whereClauses.join(' AND ');

    // Use different limits based on whether this is a search or browse all
    // For search queries, limit to 200 for performance
    // For browsing all airports, return up to 5000 (or unlimited)
    const limit = search ? 200 : 5000;

    const airportsWithData = await sequelize.query(`
      SELECT
        a.id,
        a.icao_code as "icaoCode",
        a.iata_code as "iataCode",
        a.name,
        a.city,
        a.country,
        a.latitude,
        a.longitude,
        a.elevation,
        a.type,
        a.timezone,
        a.is_active as "isActive",
        a.operational_from as "operationalFrom",
        a.operational_until as "operationalUntil",
        a.traffic_demand as "trafficDemand",
        a.infrastructure_level as "infrastructureLevel",
        a.created_at as "createdAt",
        a.updated_at as "updatedAt",
        COALESCE(COUNT(wm.id), 0)::int as "airlinesBasedHere"
      FROM airports a
      LEFT JOIN world_memberships wm ON wm.base_airport_id = a.id
      WHERE ${whereSQL}
      GROUP BY a.id
      ORDER BY
        CASE a.type
          WHEN 'International Hub' THEN 1
          WHEN 'Major' THEN 2
          WHEN 'Regional' THEN 3
          WHEN 'Small Regional' THEN 4
          ELSE 5
        END,
        a.name ASC
      LIMIT ${limit}
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    // Calculate dynamic traffic and infrastructure based on world year
    let worldYear = 2024; // Default to current year
    if (worldId) {
      const world = await World.findByPk(worldId);
      if (world && world.currentTime) {
        worldYear = world.currentTime.getFullYear();
      }
    } else if (req.session?.activeWorldId) {
      const world = await World.findByPk(req.session.activeWorldId);
      if (world && world.currentTime) {
        worldYear = world.currentTime.getFullYear();
      }
    }

    // Apply dynamic metrics and historical country names to each airport
    const airportsWithDynamicData = airportsWithData.map(airport => {
      const metrics = airportGrowthService.getAirportMetrics(airport, worldYear);
      const historicalCountry = historicalCountryService.getHistoricalCountryName(airport.country, worldYear);

      return {
        ...airport,
        country: historicalCountry, // Use era-appropriate country name
        trafficDemand: metrics.trafficDemand,
        infrastructureLevel: metrics.infrastructureLevel,
        annualPassengers: metrics.annualPassengers,
        runways: metrics.runways,
        stands: metrics.stands
      };
    });

    // Sort by annual passengers (descending) for browse all, or keep search order for searches
    if (!search) {
      airportsWithDynamicData.sort((a, b) => {
        const paxA = Number(a.annualPassengers) || 0;
        const paxB = Number(b.annualPassengers) || 0;
        return paxB - paxA;
      });
    }

    res.json(airportsWithDynamicData);
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

module.exports = router;
