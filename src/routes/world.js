const express = require('express');
const router = express.Router();
const worldTimeService = require('../services/worldTimeService');
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
    if (req.user) {
      const user = await User.findOne({ where: { vatsimId: req.user.vatsimId } });
      if (user) {
        membership = await WorldMembership.findOne({
          where: { userId: user.id, worldId: activeWorldId }
        });
      }
    }

    // Calculate elapsed days based on the world's dates
    const elapsedMs = world.currentTime.getTime() - world.startDate.getTime();
    const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));

    // Calculate the decade from currentTime (e.g., 1995 -> "90's")
    const currentYear = world.currentTime.getFullYear();
    const decade = Math.floor(currentYear / 10) * 10;
    const decadeString = `${decade.toString().slice(-2)}'s`;

    // Return world info
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
      elapsedDays: elapsedDays,
      // Include user's membership data
      airlineName: membership?.airlineName,
      airlineCode: membership?.airlineCode,
      balance: membership?.balance || 0,
      reputation: membership?.reputation || 0
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

    const airports = await Airport.findAll({
      where: whereClause,
      order: [
        ['type', 'ASC'], // International Hubs first
        ['name', 'ASC']
      ],
      limit: 200 // Limit results to prevent overwhelming response
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
