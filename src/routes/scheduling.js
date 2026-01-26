const express = require('express');
const router = express.Router();
const { ScheduledFlight, Route, UserAircraft, Airport, Aircraft, WorldMembership, User } = require('../models');

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

module.exports = router;
