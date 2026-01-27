const express = require('express');
const router = express.Router();
const { ScheduledFlight, RecurringMaintenance, Route, UserAircraft, Airport, Aircraft, WorldMembership, User } = require('../models');

/**
 * GET /api/schedule/flights
 * Fetch all scheduled flights for the current user's active world
 */
router.get('/flights', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get active world from session
    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(404).json({ error: 'No active world selected' });
    }

    // Get user's membership
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

    const worldMembershipId = membership.id;

    // Build query
    const whereClause = {};

    if (startDate && endDate) {
      whereClause.scheduledDate = {
        [require('sequelize').Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      whereClause.scheduledDate = {
        [require('sequelize').Op.gte]: startDate
      };
    }

    // Fetch scheduled flights
    const scheduledFlights = await ScheduledFlight.findAll({
      where: whereClause,
      include: [
        {
          model: Route,
          as: 'route',
          required: true,
          where: {
            worldMembershipId: worldMembershipId
          },
          include: [
            { model: Airport, as: 'departureAirport' },
            { model: Airport, as: 'arrivalAirport' }
          ]
        },
        {
          model: UserAircraft,
          as: 'aircraft',
          include: [
            { model: Aircraft, as: 'aircraft' }
          ]
        }
      ],
      order: [
        ['scheduledDate', 'ASC'],
        ['departureTime', 'ASC']
      ]
    });

    res.json(scheduledFlights);
  } catch (error) {
    console.error('Error fetching scheduled flights:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/schedule/flight
 * Create a new scheduled flight
 */
router.post('/flight', async (req, res) => {
  try {
    const { routeId, aircraftId, scheduledDate, departureTime } = req.body;

    // Get active world from session
    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(404).json({ error: 'No active world selected' });
    }

    // Get user's membership
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

    const worldMembershipId = membership.id;

    // Validate route belongs to user's world
    const route = await Route.findOne({
      where: {
        id: routeId,
        worldMembershipId: worldMembershipId
      }
    });

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    // Validate aircraft belongs to user's world
    const aircraft = await UserAircraft.findOne({
      where: {
        id: aircraftId,
        worldMembershipId: worldMembershipId
      }
    });

    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    // Check for conflicts (same aircraft, date, and time)
    const conflict = await ScheduledFlight.findOne({
      where: {
        aircraftId,
        scheduledDate,
        departureTime
      }
    });

    if (conflict) {
      return res.status(409).json({ error: 'Aircraft is already scheduled at this time' });
    }

    // Create scheduled flight
    const scheduledFlight = await ScheduledFlight.create({
      routeId,
      aircraftId,
      scheduledDate,
      departureTime,
      status: 'scheduled'
    });

    // Fetch complete flight data
    const completeFlightData = await ScheduledFlight.findByPk(scheduledFlight.id, {
      include: [
        {
          model: Route,
          as: 'route',
          include: [
            { model: Airport, as: 'departureAirport' },
            { model: Airport, as: 'arrivalAirport' }
          ]
        },
        {
          model: UserAircraft,
          as: 'aircraft',
          include: [
            { model: Aircraft, as: 'aircraft' }
          ]
        }
      ]
    });

    res.status(201).json(completeFlightData);
  } catch (error) {
    console.error('Error creating scheduled flight:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/schedule/flight/:id
 * Delete a scheduled flight
 */
router.delete('/flight/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get active world from session
    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(404).json({ error: 'No active world selected' });
    }

    // Get user's membership
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

    const worldMembershipId = membership.id;

    // Find the scheduled flight and verify ownership
    const scheduledFlight = await ScheduledFlight.findByPk(id, {
      include: [
        {
          model: Route,
          as: 'route',
          where: {
            worldMembershipId: worldMembershipId
          }
        }
      ]
    });

    if (!scheduledFlight) {
      return res.status(404).json({ error: 'Scheduled flight not found' });
    }

    await scheduledFlight.destroy();

    res.json({ message: 'Scheduled flight deleted successfully' });
  } catch (error) {
    console.error('Error deleting scheduled flight:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/schedule/flight/:id
 * Update a scheduled flight (status, time, etc.)
 */
router.put('/flight/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledDate, departureTime, status } = req.body;

    // Get active world from session
    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(404).json({ error: 'No active world selected' });
    }

    // Get user's membership
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

    const worldMembershipId = membership.id;

    // Find the scheduled flight and verify ownership
    const scheduledFlight = await ScheduledFlight.findByPk(id, {
      include: [
        {
          model: Route,
          as: 'route',
          where: {
            worldMembershipId: worldMembershipId
          }
        }
      ]
    });

    if (!scheduledFlight) {
      return res.status(404).json({ error: 'Scheduled flight not found' });
    }

    // Update fields
    if (scheduledDate !== undefined) scheduledFlight.scheduledDate = scheduledDate;
    if (departureTime !== undefined) scheduledFlight.departureTime = departureTime;
    if (status !== undefined) scheduledFlight.status = status;

    await scheduledFlight.save();

    // Fetch updated data with associations
    const updatedFlight = await ScheduledFlight.findByPk(scheduledFlight.id, {
      include: [
        {
          model: Route,
          as: 'route',
          include: [
            { model: Airport, as: 'departureAirport' },
            { model: Airport, as: 'arrivalAirport' }
          ]
        },
        {
          model: UserAircraft,
          as: 'aircraft',
          include: [
            { model: Aircraft, as: 'aircraft' }
          ]
        }
      ]
    });

    res.json(updatedFlight);
  } catch (error) {
    console.error('Error updating scheduled flight:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/schedule/maintenance
 * Fetch all scheduled maintenance checks for the current user's active world
 */
router.get('/maintenance', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get active world from session
    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(404).json({ error: 'No active world selected' });
    }

    // Get user's membership
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

    const worldMembershipId = membership.id;

    // Fetch all active recurring maintenance patterns for user's aircraft
    const recurringPatterns = await RecurringMaintenance.findAll({
      where: {
        status: 'active'
      },
      include: [
        {
          model: UserAircraft,
          as: 'aircraft',
          required: true,
          where: {
            worldMembershipId: worldMembershipId
          },
          include: [
            { model: Aircraft, as: 'aircraft' }
          ]
        }
      ]
    });

    // Generate maintenance blocks for the requested date range
    const maintenanceBlocks = [];

    if (startDate && endDate) {
      // Parse dates
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      const start = new Date(Date.UTC(startYear, startMonth - 1, startDay));
      const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));

      // For each date in range
      const currentDate = new Date(start);
      while (currentDate <= end) {
        const dayOfWeek = currentDate.getUTCDay();
        const dateStr = currentDate.toISOString().split('T')[0];

        // Check if there's a weekly check on this day
        const weeklyPattern = recurringPatterns.find(
          p => p.dayOfWeek === dayOfWeek && p.checkType === 'B'
        );

        // Add all matching patterns for this day
        for (const pattern of recurringPatterns) {
          if (pattern.dayOfWeek === dayOfWeek) {
            // Skip daily checks if weekly check exists on this day
            if (pattern.checkType === 'A' && weeklyPattern) {
              continue;
            }

            // Generate a maintenance block for this date
            maintenanceBlocks.push({
              id: `${pattern.id}-${dateStr}`, // Composite ID for frontend tracking
              patternId: pattern.id,
              aircraftId: pattern.aircraftId,
              checkType: pattern.checkType,
              scheduledDate: dateStr,
              startTime: pattern.startTime,
              duration: pattern.duration,
              status: 'scheduled',
              aircraft: pattern.aircraft
            });
          }
        }

        // Move to next day
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }
    }

    // Sort by date and time
    maintenanceBlocks.sort((a, b) => {
      if (a.scheduledDate !== b.scheduledDate) {
        return a.scheduledDate.localeCompare(b.scheduledDate);
      }
      return a.startTime.localeCompare(b.startTime);
    });

    res.json(maintenanceBlocks);
  } catch (error) {
    console.error('Error fetching maintenance:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/schedule/maintenance
 * Create a new scheduled maintenance check
 */
router.post('/maintenance', async (req, res) => {
  try {
    const { aircraftId, checkType, scheduledDate, startTime, repeat } = req.body;

    // Get active world from session
    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(404).json({ error: 'No active world selected' });
    }

    // Get user's membership
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

    const worldMembershipId = membership.id;

    // Validate aircraft belongs to user's world
    const aircraft = await UserAircraft.findOne({
      where: {
        id: aircraftId,
        worldMembershipId: worldMembershipId
      }
    });

    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    // Validate check type and set duration (60 minutes for Daily, 120 minutes for Weekly)
    if (!['A', 'B'].includes(checkType)) {
      return res.status(400).json({ error: 'Invalid check type. Must be A or B' });
    }

    const duration = checkType === 'A' ? 60 : 120; // Duration in minutes

    // Get day of week from scheduledDate
    const [year, month, day] = scheduledDate.split('-').map(Number);
    const baseDate = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = baseDate.getUTCDay(); // 0=Sunday, 6=Saturday

    // Determine which day-of-week patterns to create
    const daysToSchedule = [];

    if (repeat) {
      if (checkType === 'A') {
        // Daily checks: create pattern for every day of the week (0-6)
        for (let i = 0; i < 7; i++) {
          daysToSchedule.push(i);
        }
      } else {
        // Weekly checks: create pattern for the selected day only
        daysToSchedule.push(dayOfWeek);
      }
    } else {
      // Non-repeating: create pattern for just this day
      daysToSchedule.push(dayOfWeek);
    }

    console.log(`Creating recurring maintenance patterns for days: ${daysToSchedule}`);

    // If this is a weekly check, delete any daily check patterns on the same day of week
    if (checkType === 'B') {
      const deleted = await RecurringMaintenance.destroy({
        where: {
          aircraftId,
          dayOfWeek: daysToSchedule,
          checkType: 'A'
        }
      });
      console.log(`Deleted ${deleted} daily check patterns for day(s) ${daysToSchedule}`);
    }

    // Create recurring maintenance patterns
    const createdPatterns = [];
    for (const day of daysToSchedule) {
      // Check for conflicts (same aircraft, day of week, and time)
      const conflict = await RecurringMaintenance.findOne({
        where: {
          aircraftId,
          dayOfWeek: day,
          startTime,
          status: 'active'
        }
      });

      if (conflict) {
        console.log(`Conflict found for day ${day} at ${startTime}, skipping`);
        continue;
      }

      // If this is a daily check, check if there's a weekly check on this day
      if (checkType === 'A') {
        const weeklyCheckExists = await RecurringMaintenance.findOne({
          where: {
            aircraftId,
            dayOfWeek: day,
            checkType: 'B',
            status: 'active'
          }
        });

        if (weeklyCheckExists) {
          console.log(`Weekly check exists for day ${day}, skipping daily check`);
          continue;
        }
      }

      // Create recurring maintenance pattern
      console.log(`Creating maintenance pattern for day ${day} at ${startTime}`);
      const pattern = await RecurringMaintenance.create({
        aircraftId,
        checkType,
        dayOfWeek: day,
        startTime,
        duration,
        status: 'active'
      });

      createdPatterns.push(pattern.id);
    }

    console.log(`Created ${createdPatterns.length} recurring maintenance patterns`);

    // Fetch complete pattern data
    const completePatternData = await RecurringMaintenance.findAll({
      where: {
        id: createdPatterns
      },
      include: [
        {
          model: UserAircraft,
          as: 'aircraft',
          include: [
            { model: Aircraft, as: 'aircraft' }
          ]
        }
      ]
    });

    res.status(201).json(completePatternData);
  } catch (error) {
    console.error('Error creating recurring maintenance:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/schedule/maintenance/:id
 * Delete a recurring maintenance pattern
 */
router.delete('/maintenance/:id', async (req, res) => {
  try {
    let { id } = req.params;

    // If ID is composite (pattern-date format), extract pattern ID
    if (id.includes('-')) {
      const parts = id.split('-');
      // Check if last parts look like a date (YYYY-MM-DD)
      if (parts.length >= 4 && parts[parts.length - 3].match(/^\d{4}$/)) {
        // Extract everything before the date
        id = parts.slice(0, parts.length - 3).join('-');
      }
    }

    // Get active world from session
    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(404).json({ error: 'No active world selected' });
    }

    // Get user's membership
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

    const worldMembershipId = membership.id;

    // Find the recurring maintenance pattern and verify ownership
    const recurringMaintenance = await RecurringMaintenance.findByPk(id, {
      include: [
        {
          model: UserAircraft,
          as: 'aircraft',
          where: {
            worldMembershipId: worldMembershipId
          }
        }
      ]
    });

    if (!recurringMaintenance) {
      return res.status(404).json({ error: 'Recurring maintenance pattern not found' });
    }

    await recurringMaintenance.destroy();

    res.json({ message: 'Recurring maintenance pattern deleted successfully' });
  } catch (error) {
    console.error('Error deleting recurring maintenance:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
