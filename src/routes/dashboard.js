const express = require('express');
const router = express.Router();
const { WorldMembership, UserAircraft, Aircraft, Route, ScheduledFlight, User, World } = require('../models');
const worldTimeService = require('../services/worldTimeService');

router.get('/notifications', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(400).json({ error: 'No active world selected' });
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

    // Get current game time
    let currentTime = worldTimeService.getCurrentTime(activeWorldId);
    if (!currentTime) {
      const world = await World.findByPk(activeWorldId);
      currentTime = world ? world.currentTime : new Date();
    }

    const notifications = [];

    // --- Fleet checks ---
    const fleet = await UserAircraft.findAll({
      where: { worldMembershipId: membership.id, status: 'active' },
      include: [{ model: Aircraft, as: 'aircraft', attributes: ['manufacturer', 'model', 'variant'] }]
    });

    if (fleet.length === 0) {
      notifications.push({
        type: 'info',
        icon: 'plane',
        title: 'No Aircraft',
        message: 'Your fleet is empty. Purchase or lease aircraft to start operations.',
        link: '/aircraft-marketplace',
        priority: 1
      });
    } else {
      // Check for upcoming C/D checks
      const gameNow = new Date(currentTime);
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      for (const ac of fleet) {
        const acName = ac.registration || (ac.aircraft ? `${ac.aircraft.manufacturer} ${ac.aircraft.model}` : 'Unknown');

        // C Check due
        if (ac.lastCCheckDate && ac.cCheckIntervalDays) {
          const cDue = new Date(new Date(ac.lastCCheckDate).getTime() + ac.cCheckIntervalDays * 24 * 60 * 60 * 1000);
          const daysUntilC = Math.ceil((cDue.getTime() - gameNow.getTime()) / (24 * 60 * 60 * 1000));
          if (daysUntilC <= 30 && daysUntilC > 0) {
            notifications.push({
              type: 'maintenance',
              icon: 'wrench',
              title: `C-Check Due: ${acName}`,
              message: `Due in ${daysUntilC} day${daysUntilC !== 1 ? 's' : ''}. Schedule maintenance to avoid grounding.`,
              link: '/maintenance',
              priority: daysUntilC <= 7 ? 2 : 4
            });
          } else if (daysUntilC <= 0) {
            notifications.push({
              type: 'maintenance',
              icon: 'wrench',
              title: `C-Check Overdue: ${acName}`,
              message: 'This aircraft needs an immediate C-Check.',
              link: '/maintenance',
              priority: 1
            });
          }
        }

        // D Check due
        if (ac.lastDCheckDate && ac.dCheckIntervalDays) {
          const dDue = new Date(new Date(ac.lastDCheckDate).getTime() + ac.dCheckIntervalDays * 24 * 60 * 60 * 1000);
          const daysUntilD = Math.ceil((dDue.getTime() - gameNow.getTime()) / (24 * 60 * 60 * 1000));
          if (daysUntilD <= 60 && daysUntilD > 0) {
            notifications.push({
              type: 'maintenance',
              icon: 'wrench',
              title: `D-Check Due: ${acName}`,
              message: `Due in ${daysUntilD} day${daysUntilD !== 1 ? 's' : ''}. Plan ahead - D-Checks take 2-3 months.`,
              link: '/maintenance',
              priority: daysUntilD <= 14 ? 2 : 4
            });
          } else if (daysUntilD <= 0) {
            notifications.push({
              type: 'maintenance',
              icon: 'wrench',
              title: `D-Check Overdue: ${acName}`,
              message: 'This aircraft needs an immediate D-Check.',
              link: '/maintenance',
              priority: 1
            });
          }
        }
      }

      // Check for idle aircraft (no scheduled flights)
      const aircraftWithFlights = await ScheduledFlight.findAll({
        where: { aircraft_id: fleet.map(a => a.id) },
        attributes: ['aircraft_id'],
        group: ['aircraft_id']
      });
      const busyIds = new Set(aircraftWithFlights.map(f => f.aircraft_id));
      const idleAircraft = fleet.filter(ac => !busyIds.has(ac.id));

      if (idleAircraft.length > 0) {
        const names = idleAircraft.slice(0, 3).map(ac => ac.registration || 'Unregistered').join(', ');
        notifications.push({
          type: 'operations',
          icon: 'alert',
          title: `${idleAircraft.length} Idle Aircraft`,
          message: `${names}${idleAircraft.length > 3 ? ` and ${idleAircraft.length - 3} more` : ''} ha${idleAircraft.length === 1 ? 's' : 've'} no scheduled flights.`,
          link: '/scheduling',
          priority: 5
        });
      }
    }

    // --- Route checks ---
    const routes = await Route.findAll({
      where: { worldMembershipId: membership.id, isActive: true }
    });

    if (routes.length === 0 && fleet.length > 0) {
      notifications.push({
        type: 'operations',
        icon: 'route',
        title: 'No Routes',
        message: 'You have aircraft but no routes. Create routes to generate revenue.',
        link: '/routes/create',
        priority: 2
      });
    } else {
      // Check for unprofitable routes
      const unprofitable = routes.filter(r => {
        const revenue = parseFloat(r.totalRevenue) || 0;
        const costs = parseFloat(r.totalCosts) || 0;
        return r.totalFlights > 0 && costs > 0 && revenue < costs;
      });

      if (unprofitable.length > 0) {
        notifications.push({
          type: 'finance',
          icon: 'chart',
          title: `${unprofitable.length} Unprofitable Route${unprofitable.length !== 1 ? 's' : ''}`,
          message: 'Review pricing or consider cancelling routes that are losing money.',
          link: '/routes',
          priority: 4
        });
      }
    }

    // --- Finance checks ---
    const balance = parseFloat(membership.balance) || 0;
    if (balance < 50000 && balance >= 0) {
      notifications.push({
        type: 'finance',
        icon: 'dollar',
        title: 'Low Balance',
        message: `Your balance is $${balance.toLocaleString()}. Consider adjusting operations to improve cash flow.`,
        link: '/finances',
        priority: 2
      });
    } else if (balance < 0) {
      notifications.push({
        type: 'finance',
        icon: 'dollar',
        title: 'Negative Balance',
        message: `Your balance is -$${Math.abs(balance).toLocaleString()}. Take immediate action to avoid bankruptcy.`,
        link: '/finances',
        priority: 1
      });
    }

    // Sort by priority (1 = highest)
    notifications.sort((a, b) => a.priority - b.priority);

    res.json(notifications);
  } catch (error) {
    console.error('Error loading dashboard notifications:', error);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

module.exports = router;
