const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { ScheduledFlight, RecurringMaintenance, Route, UserAircraft, Airport, Aircraft, WorldMembership, User, World } = require('../models');

/**
 * Calculate arrival date and time based on departure and full round-trip duration
 * Accounts for outbound + turnaround + return, and tech stops if present
 * @param {string} departureDate - YYYY-MM-DD format
 * @param {string} departureTime - HH:MM:SS format
 * @param {object} route - Route object with distance, turnaroundTime, and optional techStopAirport
 * @param {number} cruiseSpeed - Aircraft cruise speed in knots (defaults to 450)
 * @returns {{ arrivalDate: string, arrivalTime: string }}
 */
function calculateArrivalDateTime(departureDate, departureTime, route, cruiseSpeed = 450) {
  // Parse departure datetime
  const depDateTime = new Date(`${departureDate}T${departureTime}`);

  // Handle both old API (distanceNm as number) and new API (route object)
  const distance = typeof route === 'object' ? (parseFloat(route.distance) || 500) : (parseFloat(route) || 500);
  const speed = cruiseSpeed || 450;
  const turnaroundMinutes = typeof route === 'object' ? (route.turnaroundTime || 45) : 45;
  const hasTechStop = typeof route === 'object' && route.techStopAirport;

  let totalFlightMs;

  if (hasTechStop) {
    // Tech stop route: leg1 + techStop + leg2 + turnaround + leg3 + techStop + leg4
    const techStopMinutes = 30; // 30 min tech stop time
    const leg1Distance = route.legOneDistance || Math.round(distance * 0.4);
    const leg2Distance = route.legTwoDistance || Math.round(distance * 0.6);

    // Calculate each leg (simplified - no wind adjustment here for consistency)
    const leg1Hours = leg1Distance / speed;
    const leg2Hours = leg2Distance / speed;
    const leg3Hours = leg2Distance / speed; // Return leg (ARR→TECH)
    const leg4Hours = leg1Distance / speed; // Return leg (TECH→DEP)

    const totalHours = leg1Hours + (techStopMinutes / 60) + leg2Hours +
                       (turnaroundMinutes / 60) +
                       leg3Hours + (techStopMinutes / 60) + leg4Hours;
    totalFlightMs = totalHours * 60 * 60 * 1000;
  } else {
    // Standard round-trip: outbound + turnaround + return
    const oneWayHours = distance / speed;
    const totalHours = oneWayHours + (turnaroundMinutes / 60) + oneWayHours;
    totalFlightMs = totalHours * 60 * 60 * 1000;
  }

  // Calculate arrival datetime (when the round-trip completes)
  const arrDateTime = new Date(depDateTime.getTime() + totalFlightMs);

  // Format arrival date and time using local time (avoids UTC timezone shift)
  const year = arrDateTime.getFullYear();
  const month = String(arrDateTime.getMonth() + 1).padStart(2, '0');
  const day = String(arrDateTime.getDate()).padStart(2, '0');
  const arrivalDate = `${year}-${month}-${day}`;
  const arrivalTime = arrDateTime.toTimeString().split(' ')[0]; // HH:MM:SS

  return { arrivalDate, arrivalTime };
}

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
    const { Op } = require('sequelize');

    // Build query - include flights that depart OR arrive within the date range
    let whereClause = {};

    if (startDate && endDate) {
      // Include flights that depart, arrive, or are in-transit within the date range
      whereClause = {
        [Op.or]: [
          // Flights departing in the range
          { scheduledDate: { [Op.between]: [startDate, endDate] } },
          // Flights arriving in the range (overnight flights)
          { arrivalDate: { [Op.between]: [startDate, endDate] } },
          // Flights in-transit (departed before range, arriving after range)
          {
            [Op.and]: [
              { scheduledDate: { [Op.lt]: startDate } },
              { arrivalDate: { [Op.gt]: endDate } }
            ]
          }
        ]
      };
    } else if (startDate) {
      whereClause = {
        [Op.or]: [
          { scheduledDate: { [Op.gte]: startDate } },
          { arrivalDate: { [Op.gte]: startDate } },
          // Flights in-transit on startDate
          {
            [Op.and]: [
              { scheduledDate: { [Op.lt]: startDate } },
              { arrivalDate: { [Op.gt]: startDate } }
            ]
          }
        ]
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
            { model: Airport, as: 'arrivalAirport' },
            { model: Airport, as: 'techStopAirport' }
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

    // Validate aircraft belongs to user's world and get aircraft details
    const aircraft = await UserAircraft.findOne({
      where: {
        id: aircraftId,
        worldMembershipId: worldMembershipId
      },
      include: [{ model: Aircraft, as: 'aircraft' }]
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

    // Calculate arrival date and time (for full round-trip including tech stops)
    const { arrivalDate, arrivalTime } = calculateArrivalDateTime(
      scheduledDate,
      departureTime,
      route,
      aircraft.aircraft?.cruiseSpeed
    );

    // Create scheduled flight
    const scheduledFlight = await ScheduledFlight.create({
      routeId,
      aircraftId,
      scheduledDate,
      departureTime,
      arrivalDate,
      arrivalTime,
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
            { model: Airport, as: 'arrivalAirport' },
            { model: Airport, as: 'techStopAirport' }
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
 * POST /api/schedule/flights/batch
 * Create multiple scheduled flights at once (for weekly scheduling)
 * Much faster than making individual requests
 */
router.post('/flights/batch', async (req, res) => {
  try {
    const { routeId, aircraftId, flights } = req.body;
    // flights is an array of { scheduledDate, departureTime }

    if (!flights || !Array.isArray(flights) || flights.length === 0) {
      return res.status(400).json({ error: 'No flights provided' });
    }

    if (flights.length > 14) {
      return res.status(400).json({ error: 'Maximum 14 flights per batch' });
    }

    // Get active world from session
    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(404).json({ error: 'No active world selected' });
    }

    // Get user's membership (validate once)
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

    // Validate route belongs to user's world (validate once)
    const route = await Route.findOne({
      where: {
        id: routeId,
        worldMembershipId: worldMembershipId
      }
    });

    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    // Validate aircraft belongs to user's world (validate once)
    const aircraft = await UserAircraft.findOne({
      where: {
        id: aircraftId,
        worldMembershipId: worldMembershipId
      },
      include: [{ model: Aircraft, as: 'aircraft' }]
    });

    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    const cruiseSpeed = aircraft.aircraft?.cruiseSpeed;

    // Check for conflicts for all flights at once
    const scheduleDates = flights.map(f => f.scheduledDate);
    const existingFlights = await ScheduledFlight.findAll({
      where: {
        aircraftId,
        scheduledDate: { [Op.in]: scheduleDates }
      }
    });

    // Build a set of existing date+time combinations
    const existingSlots = new Set(
      existingFlights.map(f => `${f.scheduledDate}_${f.departureTime}`)
    );

    // Filter out conflicting flights and prepare batch data
    const flightsToCreate = [];
    const conflicts = [];

    for (const flight of flights) {
      const slotKey = `${flight.scheduledDate}_${flight.departureTime}`;
      if (existingSlots.has(slotKey)) {
        conflicts.push(flight.scheduledDate);
      } else {
        // Calculate arrival date and time
        const { arrivalDate, arrivalTime } = calculateArrivalDateTime(
          flight.scheduledDate,
          flight.departureTime,
          route,
          cruiseSpeed
        );

        flightsToCreate.push({
          routeId,
          aircraftId,
          scheduledDate: flight.scheduledDate,
          departureTime: flight.departureTime,
          arrivalDate,
          arrivalTime,
          status: 'scheduled'
        });
      }
    }

    if (flightsToCreate.length === 0) {
      return res.status(409).json({
        error: 'All flights conflict with existing schedule',
        conflicts
      });
    }

    // Bulk create all flights at once
    const createdFlights = await ScheduledFlight.bulkCreate(flightsToCreate);

    // Fetch complete flight data for all created flights
    const completeFlightData = await ScheduledFlight.findAll({
      where: {
        id: { [Op.in]: createdFlights.map(f => f.id) }
      },
      include: [
        {
          model: Route,
          as: 'route',
          include: [
            { model: Airport, as: 'departureAirport' },
            { model: Airport, as: 'arrivalAirport' },
            { model: Airport, as: 'techStopAirport' }
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

    res.status(201).json({
      created: completeFlightData,
      conflicts: conflicts.length > 0 ? conflicts : undefined
    });
  } catch (error) {
    console.error('Error batch creating scheduled flights:', error);
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
            { model: Airport, as: 'arrivalAirport' },
            { model: Airport, as: 'techStopAirport' }
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

/**
 * GET /api/schedule/active
 * Fetch all currently active (in_progress) flights for the world map
 */
router.get('/active', async (req, res) => {
  try {
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

    // Fetch flights with status 'in_progress'
    const activeFlights = await ScheduledFlight.findAll({
      where: {
        status: 'in_progress'
      },
      include: [
        {
          model: Route,
          as: 'route',
          required: true,
          where: {
            worldMembershipId: worldMembershipId
          },
          include: [
            {
              model: Airport,
              as: 'departureAirport',
              attributes: ['id', 'icaoCode', 'iataCode', 'name', 'city', 'country', 'latitude', 'longitude']
            },
            {
              model: Airport,
              as: 'arrivalAirport',
              attributes: ['id', 'icaoCode', 'iataCode', 'name', 'city', 'country', 'latitude', 'longitude']
            },
            {
              model: Airport,
              as: 'techStopAirport',
              attributes: ['id', 'icaoCode', 'iataCode', 'name', 'city', 'country', 'latitude', 'longitude']
            }
          ]
        },
        {
          model: UserAircraft,
          as: 'aircraft',
          include: [
            {
              model: Aircraft,
              as: 'aircraft'
            }
          ]
        }
      ],
      order: [
        ['scheduledDate', 'ASC'],
        ['departureTime', 'ASC']
      ]
    });

    // Transform data for the map
    const flights = activeFlights.map(flight => ({
      id: flight.id,
      scheduledDate: flight.scheduledDate,
      departureTime: flight.departureTime,
      arrivalTime: flight.arrivalTime,
      arrivalDate: flight.arrivalDate,
      status: flight.status,
      route: {
        id: flight.route.id,
        routeNumber: flight.route.routeNumber,
        returnRouteNumber: flight.route.returnRouteNumber,
        distance: flight.route.distance,
        turnaroundTime: flight.route.turnaroundTime || 45,
        techStopAirport: flight.route.techStopAirport || null,
        demand: flight.route.demand || 0,
        averageLoadFactor: parseFloat(flight.route.averageLoadFactor) || 0
      },
      departureAirport: flight.route.departureAirport,
      arrivalAirport: flight.route.arrivalAirport,
      aircraft: flight.aircraft ? {
        id: flight.aircraft.id,
        registration: flight.aircraft.registration,
        aircraftType: flight.aircraft.aircraft,
        passengerCapacity: flight.aircraft.aircraft?.passengerCapacity || 0
      } : null
    }));

    res.json({ flights });
  } catch (error) {
    console.error('Error fetching active flights:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/schedule/active-all
 * Fetch all currently active (in_progress) flights for ALL airlines in the world
 */
router.get('/active-all', async (req, res) => {
  try {
    // Get active world from session
    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(404).json({ error: 'No active world selected' });
    }

    // Get user's membership to identify their own flights
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await User.findOne({ where: { vatsimId: req.user.vatsimId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userMembership = await WorldMembership.findOne({
      where: { userId: user.id, worldId: activeWorldId }
    });

    if (!userMembership) {
      return res.status(404).json({ error: 'Not a member of this world' });
    }

    const userMembershipId = userMembership.id;

    // Get all memberships in this world to filter flights
    const allMemberships = await WorldMembership.findAll({
      where: { worldId: activeWorldId },
      attributes: ['id', 'airlineName', 'airlineCode']
    });

    const membershipIds = allMemberships.map(m => m.id);
    const membershipMap = new Map(allMemberships.map(m => [m.id, { airlineName: m.airlineName, airlineCode: m.airlineCode }]));

    // Fetch all active flights in this world
    const activeFlights = await ScheduledFlight.findAll({
      where: {
        status: 'in_progress'
      },
      include: [
        {
          model: Route,
          as: 'route',
          required: true,
          where: {
            worldMembershipId: { [Op.in]: membershipIds }
          },
          include: [
            {
              model: Airport,
              as: 'departureAirport',
              attributes: ['id', 'icaoCode', 'iataCode', 'name', 'city', 'country', 'latitude', 'longitude']
            },
            {
              model: Airport,
              as: 'arrivalAirport',
              attributes: ['id', 'icaoCode', 'iataCode', 'name', 'city', 'country', 'latitude', 'longitude']
            },
            {
              model: Airport,
              as: 'techStopAirport',
              attributes: ['id', 'icaoCode', 'iataCode', 'name', 'city', 'country', 'latitude', 'longitude']
            }
          ]
        },
        {
          model: UserAircraft,
          as: 'aircraft',
          include: [
            {
              model: Aircraft,
              as: 'aircraft'
            }
          ]
        }
      ],
      order: [
        ['scheduledDate', 'ASC'],
        ['departureTime', 'ASC']
      ]
    });

    // Transform data for the map, including airline info
    const flights = activeFlights.map(flight => {
      const membershipId = flight.route.worldMembershipId;
      const airlineInfo = membershipMap.get(membershipId) || {};
      const isOwnFlight = membershipId === userMembershipId;

      return {
        id: flight.id,
        scheduledDate: flight.scheduledDate,
        departureTime: flight.departureTime,
        arrivalTime: flight.arrivalTime,
        arrivalDate: flight.arrivalDate,
        status: flight.status,
        isOwnFlight: isOwnFlight,
        airlineName: airlineInfo.airlineName || 'Unknown Airline',
        airlineCode: airlineInfo.airlineCode || '??',
        route: {
          id: flight.route.id,
          routeNumber: flight.route.routeNumber,
          returnRouteNumber: flight.route.returnRouteNumber,
          distance: flight.route.distance,
          turnaroundTime: flight.route.turnaroundTime || 45,
          techStopAirport: flight.route.techStopAirport || null,
          demand: flight.route.demand || 0,
          averageLoadFactor: parseFloat(flight.route.averageLoadFactor) || 0
        },
        departureAirport: flight.route.departureAirport,
        arrivalAirport: flight.route.arrivalAirport,
        aircraft: flight.aircraft ? {
          id: flight.aircraft.id,
          registration: flight.aircraft.registration,
          aircraftType: flight.aircraft.aircraft,
          passengerCapacity: flight.aircraft.aircraft?.passengerCapacity || 0
        } : null
      };
    });

    res.json({ flights });
  } catch (error) {
    console.error('Error fetching all active flights:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/schedule/clear-all
 * Clear all scheduled flights and maintenance for the specified aircraft
 * Only clears schedules for aircraft owned by the user in the current world
 */
router.post('/clear-all', async (req, res) => {
  try {
    const { aircraftIds } = req.body;

    if (!aircraftIds || !Array.isArray(aircraftIds) || aircraftIds.length === 0) {
      return res.status(400).json({ error: 'Aircraft IDs are required' });
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

    // Verify all aircraft belong to this user's membership
    const ownedAircraft = await UserAircraft.findAll({
      where: {
        id: { [Op.in]: aircraftIds },
        worldMembershipId: worldMembershipId
      },
      attributes: ['id']
    });

    const ownedAircraftIds = ownedAircraft.map(a => a.id);

    if (ownedAircraftIds.length === 0) {
      return res.status(400).json({ error: 'No valid aircraft found to clear' });
    }

    // Delete all scheduled flights for these aircraft
    const flightsDeleted = await ScheduledFlight.destroy({
      where: {
        aircraftId: { [Op.in]: ownedAircraftIds }
      }
    });

    // Delete all recurring maintenance for these aircraft
    const maintenanceDeleted = await RecurringMaintenance.destroy({
      where: {
        aircraftId: { [Op.in]: ownedAircraftIds }
      }
    });

    console.log(`Cleared schedules: ${flightsDeleted} flights, ${maintenanceDeleted} maintenance for ${ownedAircraftIds.length} aircraft`);

    res.json({
      message: 'Schedules cleared successfully',
      flightsDeleted,
      maintenanceDeleted,
      aircraftCount: ownedAircraftIds.length
    });
  } catch (error) {
    console.error('Error clearing schedules:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
