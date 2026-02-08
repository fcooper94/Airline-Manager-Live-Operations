const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { WorldMembership, UserAircraft, Aircraft, Route, ScheduledFlight, User, World, RecurringMaintenance, Notification } = require('../models');
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
      where: { worldMembershipId: membership.id, status: ['active', 'maintenance'] },
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
      // Check for upcoming C/D checks and in-progress heavy maintenance
      const gameNow = new Date(currentTime);
      const gameDateStr = gameNow.toISOString().split('T')[0];

      // Get all C/D maintenance records for the fleet to detect in-progress checks
      const allFleetIds = fleet.map(ac => ac.id);
      const heavyMaint = await RecurringMaintenance.findAll({
        where: {
          aircraftId: { [Op.in]: allFleetIds },
          checkType: ['C', 'D'],
          status: 'active',
          scheduledDate: { [Op.ne]: null }
        },
        order: [['scheduledDate', 'DESC']]
      });

      // Build map of aircraftId -> in-progress check info
      // A check is "in progress" if scheduledDate <= today AND scheduledDate + duration > today
      const inProgressMap = new Map();
      for (const m of heavyMaint) {
        const schedDate = new Date(String(m.scheduledDate).split('T')[0] + 'T00:00:00Z');
        const durationDays = Math.ceil(m.duration / 1440);
        const returnDate = new Date(schedDate);
        returnDate.setUTCDate(returnDate.getUTCDate() + durationDays);

        // Only count as in-progress if started and not yet complete
        if (schedDate <= gameNow && returnDate > gameNow) {
          if (inProgressMap.has(m.aircraftId)) continue; // take first match (most recent)
          inProgressMap.set(m.aircraftId, {
            checkType: m.checkType,
            returnDate,
            daysRemaining: Math.max(0, Math.ceil((returnDate - gameNow) / (24 * 60 * 60 * 1000)))
          });
        }
      }

      for (const ac of fleet) {
        const acName = ac.registration || (ac.aircraft ? `${ac.aircraft.manufacturer} ${ac.aircraft.model}` : 'Unknown');

        // Check if aircraft has a C/D check in progress (regardless of status field)
        const progress = inProgressMap.get(ac.id);
        if (progress) {
          const returnStr = progress.returnDate.toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric'
          });
          notifications.push({
            type: 'maintenance-progress',
            icon: 'wrench',
            title: `${progress.checkType}-Check In Progress: ${acName}`,
            message: `Expected to return to service ${returnStr} (${progress.daysRemaining} day${progress.daysRemaining !== 1 ? 's' : ''} remaining).`,
            link: '/maintenance',
            priority: 6
          });
          continue; // Skip due/overdue checks - maintenance is already happening
        }

        // If aircraft status is 'maintenance' but no record found, show generic
        if (ac.status === 'maintenance') {
          notifications.push({
            type: 'maintenance-progress',
            icon: 'wrench',
            title: `Heavy Maintenance: ${acName}`,
            message: 'This aircraft is undergoing maintenance.',
            link: '/maintenance',
            priority: 6
          });
          continue;
        }

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

      // Check for idle aircraft (no scheduled flights) - only active aircraft
      const activeFleet = fleet.filter(ac => ac.status === 'active');
      const aircraftWithFlights = activeFleet.length > 0 ? await ScheduledFlight.findAll({
        where: { aircraft_id: activeFleet.map(a => a.id) },
        attributes: ['aircraft_id'],
        group: ['aircraft_id']
      }) : [];
      const busyIds = new Set(aircraftWithFlights.map(f => f.aircraft_id));
      const idleAircraft = activeFleet.filter(ac => !busyIds.has(ac.id));

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

    // Merge persistent notifications (sale/lease events)
    const persistentNotifs = await Notification.findAll({
      where: {
        worldMembershipId: membership.id,
        isRead: false
      },
      order: [['createdAt', 'DESC']],
      limit: 20
    });

    for (const pn of persistentNotifs) {
      notifications.push({
        id: pn.id,
        type: pn.type,
        icon: pn.icon,
        title: pn.title,
        message: pn.message,
        link: pn.link,
        priority: pn.priority,
        persistent: true
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

/**
 * POST /api/dashboard/notifications/:id/read
 * Mark a persistent notification as read (dismissed)
 */
router.post('/notifications/:id/read', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const notification = await Notification.findByPk(req.params.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await notification.update({ isRead: true });
    res.json({ message: 'Notification dismissed' });
  } catch (error) {
    console.error('Error dismissing notification:', error);
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

module.exports = router;
