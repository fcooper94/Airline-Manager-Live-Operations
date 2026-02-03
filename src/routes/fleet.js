const express = require('express');
const router = express.Router();
const path = require('path');
const { Op } = require('sequelize');
const { WorldMembership, UserAircraft, Aircraft, User, Airport, RecurringMaintenance, ScheduledFlight, Route, World } = require('../models');
const { REGISTRATION_RULES, validateRegistrationSuffix, getRegistrationPrefix, hasSpecificRule } = require(path.join(__dirname, '../../public/js/registrationPrefixes.js'));

// Check durations in minutes
const CHECK_DURATIONS = {
  daily: 60,     // 1 hour
  A: 180,        // 3 hours
  B: 360,        // 6 hours
  C: 20160,      // 14 days
  D: 86400       // 60 days
};

// Check intervals in days (how long until check expires)
const CHECK_INTERVALS = {
  daily: 2,      // 2 days
  A: 42,         // ~6 weeks
  B: 210,        // ~7 months
  C: 660,        // ~22 months
  D: 2920        // ~8 years
};

// How many days before expiry to schedule each check type
const SCHEDULE_BEFORE_EXPIRY = {
  daily: 1,      // Schedule 1 day before expiry
  A: 7,          // Schedule 1 week before expiry
  B: 14,         // Schedule 2 weeks before expiry
  C: 30,         // Schedule 1 month before expiry
  D: 60          // Schedule 2 months before expiry
};

/**
 * Get flights for an aircraft on a specific date
 * Returns time slots that are occupied by flights
 */
async function getFlightSlotsForDate(aircraftId, dateStr) {
  const slots = [];

  const flights = await ScheduledFlight.findAll({
    where: {
      aircraftId,
      [Op.or]: [
        { scheduledDate: dateStr },
        { arrivalDate: dateStr }
      ]
    },
    include: [{
      model: Route,
      as: 'route'
    }, {
      model: UserAircraft,
      as: 'aircraft',
      include: [{ model: Aircraft, as: 'aircraft' }]
    }]
  });

  for (const flight of flights) {
    const acType = flight.aircraft?.aircraft?.type || 'Narrowbody';
    const pax = flight.aircraft?.aircraft?.passengerCapacity || 150;
    const dist = flight.route?.distance || 0;

    // Pre-flight calculation
    let catering = pax >= 50 && acType !== 'Cargo' ? (pax < 100 ? 5 : pax < 200 ? 10 : 15) : 0;
    let boarding = acType !== 'Cargo' ? (pax < 50 ? 10 : pax < 100 ? 15 : pax < 200 ? 20 : pax < 300 ? 25 : 35) : 0;
    let fuelling = dist < 500 ? 10 : dist < 1500 ? 15 : dist < 3000 ? 20 : 25;
    const preFlight = Math.max(catering + boarding, fuelling);

    // Post-flight calculation
    let deboard = acType !== 'Cargo' ? (pax < 50 ? 5 : pax < 100 ? 8 : pax < 200 ? 12 : pax < 300 ? 15 : 20) : 0;
    let clean = pax < 50 ? 5 : pax < 100 ? 10 : pax < 200 ? 15 : pax < 300 ? 20 : 25;
    const postFlight = deboard + clean;

    const [depH, depM] = flight.departureTime.split(':').map(Number);
    const [arrH, arrM] = flight.arrivalTime.split(':').map(Number);

    // If flight departs on this date
    if (flight.scheduledDate === dateStr) {
      let startMinutes = depH * 60 + depM - preFlight;
      let endMinutes = arrH * 60 + arrM + postFlight;
      if (flight.arrivalDate !== flight.scheduledDate) {
        endMinutes = 1440; // Flight extends past midnight
      }
      slots.push({ start: Math.max(0, startMinutes), end: Math.min(1440, endMinutes) });
    }

    // If flight arrives on this date (from previous day)
    if (flight.arrivalDate === dateStr && flight.scheduledDate !== dateStr) {
      let endMinutes = arrH * 60 + arrM + postFlight;
      slots.push({ start: 0, end: Math.min(1440, endMinutes) });
    }
  }

  return slots;
}

/**
 * Get flights for an aircraft on a specific day of week (legacy - for compatibility)
 * Returns time slots that are occupied by flights
 */
async function getFlightSlotsForDay(aircraftId, dayOfWeek) {
  // Get flights for the next 4 weeks on this day of week
  const today = new Date();
  const slots = [];

  for (let week = 0; week < 4; week++) {
    const targetDate = new Date(today);
    const daysUntil = (dayOfWeek - today.getDay() + 7) % 7 + (week * 7);
    targetDate.setDate(today.getDate() + daysUntil);
    const dateStr = targetDate.toISOString().split('T')[0];

    const flights = await ScheduledFlight.findAll({
      where: {
        aircraftId,
        scheduledDate: dateStr
      },
      include: [{
        model: Route,
        as: 'route'
      }, {
        model: UserAircraft,
        as: 'aircraft',
        include: [{ model: Aircraft, as: 'aircraft' }]
      }]
    });

    for (const flight of flights) {
      // Calculate operation window with turnaround times
      const acType = flight.aircraft?.aircraft?.type || 'Narrowbody';
      const pax = flight.aircraft?.aircraft?.passengerCapacity || 150;
      const dist = flight.route?.distance || 0;

      // Pre-flight calculation
      let catering = pax >= 50 && acType !== 'Cargo' ? (pax < 100 ? 5 : pax < 200 ? 10 : 15) : 0;
      let boarding = acType !== 'Cargo' ? (pax < 50 ? 10 : pax < 100 ? 15 : pax < 200 ? 20 : pax < 300 ? 25 : 35) : 0;
      let fuelling = dist < 500 ? 10 : dist < 1500 ? 15 : dist < 3000 ? 20 : 25;
      const preFlight = Math.max(catering + boarding, fuelling);

      // Post-flight calculation
      let deboard = acType !== 'Cargo' ? (pax < 50 ? 5 : pax < 100 ? 8 : pax < 200 ? 12 : pax < 300 ? 15 : 20) : 0;
      let clean = pax < 50 ? 5 : pax < 100 ? 10 : pax < 200 ? 15 : pax < 300 ? 20 : 25;
      const postFlight = deboard + clean;

      const [depH, depM] = flight.departureTime.split(':').map(Number);
      const [arrH, arrM] = flight.arrivalTime.split(':').map(Number);

      let startMinutes = depH * 60 + depM - preFlight;
      let endMinutes = arrH * 60 + arrM + postFlight;

      // Handle overnight flights
      if (flight.arrivalDate !== flight.scheduledDate) {
        endMinutes += 1440;
      }

      slots.push({ start: startMinutes, end: endMinutes, date: dateStr });
    }
  }

  return slots;
}

/**
 * Find an available time slot for maintenance on a specific date
 * Returns the best start time or null if no slot available
 */
async function findAvailableSlotOnDate(aircraftId, dateStr, duration) {
  const flightSlots = await getFlightSlotsForDate(aircraftId, dateStr);

  // Get existing maintenance on this date
  const existingMaint = await RecurringMaintenance.findAll({
    where: { aircraftId, scheduledDate: dateStr, status: 'active' }
  });

  // Combine flight and maintenance into busy periods
  const busyPeriods = [...flightSlots];
  for (const maint of existingMaint) {
    const [h, m] = maint.startTime.split(':').map(Number);
    const start = h * 60 + m;
    busyPeriods.push({ start, end: start + maint.duration });
  }

  // Sort by start time
  busyPeriods.sort((a, b) => a.start - b.start);

  // For short checks (daily, A, B), prefer early morning or late night
  // For long checks (C, D), we need to find multi-day slots differently
  const preferredStarts = [120, 180, 240, 60, 300, 1320, 1380, 0]; // 02:00, 03:00, 04:00, 01:00, 05:00, 22:00, 23:00, 00:00

  for (const preferredStart of preferredStarts) {
    const slotEnd = preferredStart + duration;

    // For same-day slots (duration < 1440 minutes)
    if (slotEnd <= 1440) {
      let conflict = false;
      for (const busy of busyPeriods) {
        if (preferredStart < busy.end && slotEnd > busy.start) {
          conflict = true;
          break;
        }
      }
      if (!conflict) {
        const hours = Math.floor(preferredStart / 60).toString().padStart(2, '0');
        const mins = (preferredStart % 60).toString().padStart(2, '0');
        return `${hours}:${mins}`;
      }
    }
  }

  // Try any hour if preferred slots are busy
  for (let hour = 0; hour < 24; hour++) {
    const start = hour * 60;
    const end = Math.min(start + duration, 1440);
    let conflict = false;
    for (const busy of busyPeriods) {
      if (start < busy.end && end > busy.start) {
        conflict = true;
        break;
      }
    }
    if (!conflict) {
      return `${hour.toString().padStart(2, '0')}:00`;
    }
  }

  return null; // No slot available on this date
}

/**
 * Find an available time slot for maintenance on a given day of week (legacy)
 * Returns the best start time or null if no slot available
 */
async function findAvailableMaintenanceSlot(aircraftId, dayOfWeek, duration) {
  const flightSlots = await getFlightSlotsForDay(aircraftId, dayOfWeek);
  const existingMaint = await RecurringMaintenance.findAll({
    where: { aircraftId, dayOfWeek, status: 'active' }
  });

  // Combine flight and maintenance into busy periods
  const busyPeriods = [...flightSlots];
  for (const maint of existingMaint) {
    const [h, m] = maint.startTime.split(':').map(Number);
    const start = h * 60 + m;
    busyPeriods.push({ start, end: start + maint.duration });
  }

  // Sort by start time
  busyPeriods.sort((a, b) => a.start - b.start);

  // Try to find gaps - prefer early morning (02:00-06:00) or late night (22:00-02:00)
  const preferredStarts = [120, 180, 240, 60, 300, 1320, 1380, 0]; // 02:00, 03:00, 04:00, 01:00, 05:00, 22:00, 23:00, 00:00

  for (const preferredStart of preferredStarts) {
    const slotEnd = preferredStart + duration;
    let conflict = false;

    for (const busy of busyPeriods) {
      if (preferredStart < busy.end && slotEnd > busy.start) {
        conflict = true;
        break;
      }
    }

    if (!conflict) {
      const hours = Math.floor(preferredStart / 60).toString().padStart(2, '0');
      const mins = (preferredStart % 60).toString().padStart(2, '0');
      return `${hours}:${mins}`;
    }
  }

  // If no preferred slot, try any hour
  for (let hour = 0; hour < 24; hour++) {
    const start = hour * 60;
    const end = start + duration;
    let conflict = false;

    for (const busy of busyPeriods) {
      if (start < busy.end && end > busy.start) {
        conflict = true;
        break;
      }
    }

    if (!conflict) {
      return `${hour.toString().padStart(2, '0')}:00`;
    }
  }

  return null; // No slot available on this day
}

/**
 * Calculate when a check expires based on last check date and interval
 */
function calculateCheckExpiry(lastCheckDate, intervalDays) {
  if (!lastCheckDate) return null;
  const expiry = new Date(lastCheckDate);
  expiry.setDate(expiry.getDate() + intervalDays);
  return expiry;
}

/**
 * Schedule maintenance for an aircraft - Just-In-Time approach
 * ALL checks are one-time scheduled events, scheduled close to expiry
 * to keep the aircraft legal without disrupting the flying program.
 */
async function createAutoScheduledMaintenance(aircraftId, checkTypes, worldId = null) {
  const createdRecords = [];

  // Get the aircraft with its check dates
  const aircraft = await UserAircraft.findByPk(aircraftId, {
    include: [{ model: Aircraft, as: 'aircraft' }]
  });

  if (!aircraft) {
    console.error(`Aircraft ${aircraftId} not found for auto-scheduling`);
    return createdRecords;
  }

  // Get world time if worldId provided, otherwise use membership's world
  let gameNow;
  if (worldId) {
    const world = await World.findByPk(worldId);
    gameNow = world ? new Date(world.currentTime) : new Date();
  } else {
    // Try to get world from membership
    const membership = await WorldMembership.findByPk(aircraft.worldMembershipId);
    if (membership) {
      const world = await World.findByPk(membership.worldId);
      gameNow = world ? new Date(world.currentTime) : new Date();
    } else {
      gameNow = new Date();
    }
  }

  // Check field mappings
  const checkFieldMap = {
    daily: { lastCheck: 'lastDailyCheckDate', interval: CHECK_INTERVALS.daily },
    A: { lastCheck: 'lastACheckDate', interval: CHECK_INTERVALS.A },
    B: { lastCheck: 'lastBCheckDate', interval: CHECK_INTERVALS.B },
    C: { lastCheck: 'lastCCheckDate', interval: aircraft.cCheckIntervalDays || CHECK_INTERVALS.C },
    D: { lastCheck: 'lastDCheckDate', interval: aircraft.dCheckIntervalDays || CHECK_INTERVALS.D }
  };

  for (const checkType of checkTypes) {
    const fieldInfo = checkFieldMap[checkType];
    if (!fieldInfo) continue;

    // Get last check date and calculate expiry
    const lastCheckDate = aircraft[fieldInfo.lastCheck];
    const expiryDate = calculateCheckExpiry(lastCheckDate, fieldInfo.interval);

    if (!expiryDate) {
      console.log(`No last check date for ${checkType} on aircraft ${aircraft.registration}`);
      continue;
    }

    // Calculate days until expiry
    const daysUntilExpiry = Math.floor((expiryDate - gameNow) / (1000 * 60 * 60 * 24));
    const scheduleBefore = SCHEDULE_BEFORE_EXPIRY[checkType];

    console.log(`${aircraft.registration} ${checkType} check: ${daysUntilExpiry} days until expiry, schedule threshold: ${scheduleBefore} days`);

    // Only schedule if within the scheduling window
    if (daysUntilExpiry > scheduleBefore) {
      console.log(`${checkType} check not due yet for ${aircraft.registration}`);
      continue;
    }

    // Check if already scheduled for this check type
    const existingScheduled = await RecurringMaintenance.findOne({
      where: {
        aircraftId,
        checkType,
        status: 'active',
        scheduledDate: { [Op.ne]: null }
      }
    });

    if (existingScheduled) {
      console.log(`${checkType} check already scheduled for ${aircraft.registration} on ${existingScheduled.scheduledDate}`);
      createdRecords.push(existingScheduled);
      continue;
    }

    // Delete any old patterns for this check type (cleanup legacy recurring entries)
    await RecurringMaintenance.destroy({
      where: { aircraftId, checkType, scheduledDate: null }
    });

    const duration = CHECK_DURATIONS[checkType];

    // For C and D checks (heavy maintenance spanning multiple days),
    // we need to find a window where the aircraft can be grounded
    if (checkType === 'C' || checkType === 'D') {
      // Calculate the target date (aim for just before expiry)
      // For C check: 14 days, for D check: 60 days of downtime
      const daysNeeded = checkType === 'C' ? 14 : 60;

      // Find a start date that allows the check to complete before expiry
      let targetStartDate = new Date(expiryDate);
      targetStartDate.setDate(targetStartDate.getDate() - daysNeeded - 1); // 1 day buffer

      // Don't schedule in the past
      if (targetStartDate < gameNow) {
        targetStartDate = new Date(gameNow);
        targetStartDate.setDate(targetStartDate.getDate() + 1);
      }

      const targetDateStr = targetStartDate.toISOString().split('T')[0];

      // For heavy maintenance, just schedule it - flights need to be cleared
      const record = await RecurringMaintenance.create({
        aircraftId,
        checkType,
        scheduledDate: targetDateStr,
        startTime: '00:00',
        duration,
        status: 'active'
      });
      createdRecords.push(record);
      console.log(`Scheduled ${checkType} check for ${aircraft.registration} on ${targetDateStr} (${daysNeeded} days)`);
    } else {
      // For daily, A, B checks - find available slots
      // Try dates starting from today up to expiry
      let scheduled = false;
      const maxDaysToTry = Math.min(daysUntilExpiry + 1, 30); // Don't search more than 30 days

      for (let dayOffset = 0; dayOffset < maxDaysToTry && !scheduled; dayOffset++) {
        const tryDate = new Date(gameNow);
        tryDate.setDate(tryDate.getDate() + dayOffset);
        const dateStr = tryDate.toISOString().split('T')[0];

        const availableTime = await findAvailableSlotOnDate(aircraftId, dateStr, duration);

        if (availableTime) {
          const record = await RecurringMaintenance.create({
            aircraftId,
            checkType,
            scheduledDate: dateStr,
            startTime: availableTime,
            duration,
            status: 'active'
          });
          createdRecords.push(record);
          scheduled = true;
          console.log(`Scheduled ${checkType} check for ${aircraft.registration} on ${dateStr} at ${availableTime}`);
        }
      }

      // If no slot found, force schedule on the day before expiry
      if (!scheduled) {
        const expiryDateStr = new Date(expiryDate);
        expiryDateStr.setDate(expiryDateStr.getDate() - 1);
        const forceDateStr = expiryDateStr.toISOString().split('T')[0];

        const record = await RecurringMaintenance.create({
          aircraftId,
          checkType,
          scheduledDate: forceDateStr,
          startTime: '02:00', // Default early morning
          duration,
          status: 'active'
        });
        createdRecords.push(record);
        console.log(`Force scheduled ${checkType} check for ${aircraft.registration} on ${forceDateStr} (conflicts may exist)`);
      }
    }
  }

  return createdRecords;
}

/**
 * Refresh auto-scheduled maintenance for an aircraft
 * Called periodically or when flight schedule changes
 */
async function refreshAutoScheduledMaintenance(aircraftId, worldId = null) {
  const aircraft = await UserAircraft.findByPk(aircraftId);
  if (!aircraft) return [];

  // Build list of check types that have auto-schedule enabled
  const enabledChecks = [];
  if (aircraft.autoScheduleDaily) enabledChecks.push('daily');
  if (aircraft.autoScheduleA) enabledChecks.push('A');
  if (aircraft.autoScheduleB) enabledChecks.push('B');
  if (aircraft.autoScheduleC) enabledChecks.push('C');
  if (aircraft.autoScheduleD) enabledChecks.push('D');

  if (enabledChecks.length === 0) return [];

  return createAutoScheduledMaintenance(aircraftId, enabledChecks, worldId);
}

/**
 * Remove auto-scheduled maintenance for specific check types
 */
async function removeAutoScheduledMaintenance(aircraftId, checkTypes) {
  for (const checkType of checkTypes) {
    await RecurringMaintenance.destroy({
      where: { aircraftId, checkType }
    });
  }
}

/**
 * Check if a flight time slot conflicts with maintenance
 * Returns { conflicts: boolean, maintenance: RecurringMaintenance | null }
 */
async function checkMaintenanceConflict(aircraftId, scheduledDate, departureTime, arrivalTime, arrivalDate, preFlight = 30, postFlight = 20) {
  const [year, month, day] = scheduledDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();

  // Calculate flight window in minutes
  const [depH, depM] = departureTime.split(':').map(Number);
  const [arrH, arrM] = arrivalTime.split(':').map(Number);
  const flightStart = depH * 60 + depM - preFlight;
  let flightEnd = arrH * 60 + arrM + postFlight;
  if (arrivalDate !== scheduledDate) flightEnd += 1440;

  // Check for maintenance on this day of week
  const maintenance = await RecurringMaintenance.findAll({
    where: { aircraftId, dayOfWeek, status: 'active' }
  });

  for (const maint of maintenance) {
    const [mH, mM] = maint.startTime.split(':').map(Number);
    const maintStart = mH * 60 + mM;
    const maintEnd = maintStart + maint.duration;

    if (flightStart < maintEnd && flightEnd > maintStart) {
      return { conflicts: true, maintenance: maint };
    }
  }

  return { conflicts: false, maintenance: null };
}

/**
 * Attempt to reschedule maintenance to avoid flight conflict
 * Returns { success: boolean, newSlot: string | null, error: string | null }
 */
async function attemptMaintenanceReschedule(maintenanceId, aircraftId, flightStart, flightEnd) {
  const maint = await RecurringMaintenance.findByPk(maintenanceId);
  if (!maint) return { success: false, error: 'Maintenance not found' };

  const duration = maint.duration;
  const dayOfWeek = maint.dayOfWeek;

  // Get aircraft to check expiry dates
  const aircraft = await UserAircraft.findByPk(aircraftId);
  if (!aircraft) return { success: false, error: 'Aircraft not found' };

  // Get check expiry info
  const checkType = maint.checkType;
  const intervalDays = aircraft[`${checkType === 'daily' ? '' : checkType.toLowerCase()}CheckIntervalDays`] || CHECK_INTERVALS[checkType];

  // Get last check date
  const lastCheckField = checkType === 'daily' ? 'lastDailyCheckDate' : `last${checkType}CheckDate`;
  const lastCheck = aircraft[lastCheckField];

  // Calculate expiry
  let expiryDate = null;
  if (lastCheck) {
    expiryDate = new Date(lastCheck);
    expiryDate.setDate(expiryDate.getDate() + intervalDays);
  }

  // Try to find alternative slot on same day first
  const flightSlots = await getFlightSlotsForDay(aircraftId, dayOfWeek);
  const allBusy = [...flightSlots, { start: flightStart, end: flightEnd }];

  // Get other maintenance on this day (excluding current one)
  const otherMaint = await RecurringMaintenance.findAll({
    where: { aircraftId, dayOfWeek, status: 'active', id: { [Op.ne]: maintenanceId } }
  });
  for (const m of otherMaint) {
    const [h, min] = m.startTime.split(':').map(Number);
    allBusy.push({ start: h * 60 + min, end: h * 60 + min + m.duration });
  }

  allBusy.sort((a, b) => a.start - b.start);

  // Try preferred times first
  const preferredStarts = [120, 180, 240, 60, 300, 1320, 1380, 0];
  for (const start of preferredStarts) {
    const end = start + duration;
    let ok = true;
    for (const busy of allBusy) {
      if (start < busy.end && end > busy.start) { ok = false; break; }
    }
    if (ok) {
      const newTime = `${Math.floor(start / 60).toString().padStart(2, '0')}:${(start % 60).toString().padStart(2, '0')}`;
      await maint.update({ startTime: newTime });
      return { success: true, newSlot: newTime };
    }
  }

  // Try any hour on same day
  for (let h = 0; h < 24; h++) {
    const start = h * 60;
    const end = start + duration;
    let ok = true;
    for (const busy of allBusy) {
      if (start < busy.end && end > busy.start) { ok = false; break; }
    }
    if (ok) {
      const newTime = `${h.toString().padStart(2, '0')}:00`;
      await maint.update({ startTime: newTime });
      return { success: true, newSlot: newTime };
    }
  }

  // Try other days if check won't expire
  if (expiryDate) {
    const today = new Date();
    const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry > 7) {
      // Can skip a week, try different day
      for (let tryDay = 0; tryDay < 7; tryDay++) {
        if (tryDay === dayOfWeek) continue;
        const slot = await findAvailableMaintenanceSlot(aircraftId, tryDay, duration);
        if (slot) {
          await maint.update({ dayOfWeek: tryDay, startTime: slot });
          return { success: true, newSlot: `Day ${tryDay} @ ${slot}` };
        }
      }
    }
  }

  // Check is about to expire and can't be moved
  return {
    success: false,
    error: `Cannot reschedule ${checkType} check - it would expire. Please clear flights first.`
  };
}

// Export functions for use in scheduling routes
// Export helper functions for use in other routes

/**
 * Get user's fleet for current world
 */
router.get('/', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(400).json({ error: 'No active world selected' });
    }

    // Get user's membership
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

    // Get fleet
    const fleet = await UserAircraft.findAll({
      where: { worldMembershipId: membership.id },
      include: [
        {
          model: Aircraft,
          as: 'aircraft'
        }
      ],
      order: [['acquiredAt', 'DESC']]
    });

    // Fetch recurring maintenance for each aircraft separately to avoid association issues
    const fleetWithMaintenance = await Promise.all(fleet.map(async (aircraft) => {
      const aircraftJson = aircraft.toJSON();
      try {
        const maintenance = await RecurringMaintenance.findAll({
          where: { aircraftId: aircraft.id }
        });
        aircraftJson.recurringMaintenance = maintenance;
      } catch (err) {
        console.error('Error fetching recurring maintenance for aircraft:', aircraft.id, err);
        aircraftJson.recurringMaintenance = [];
      }
      return aircraftJson;
    }));

    res.json(fleetWithMaintenance);
  } catch (error) {
    console.error('Error fetching fleet:', error);
    res.status(500).json({ error: 'Failed to fetch fleet', details: error.message });
  }
});

/**
 * Purchase aircraft
 */
router.post('/purchase', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(400).json({ error: 'No active world selected' });
    }

    const {
      aircraftId,
      category, // 'new' or 'used'
      condition,
      conditionPercentage,
      ageYears,
      purchasePrice,
      maintenanceCostPerHour,
      fuelBurnPerHour,
      registration,
      // Check validity (days remaining) - for used aircraft
      cCheckRemainingDays,
      dCheckRemainingDays,
      // Auto-schedule preferences
      autoScheduleDaily,
      autoScheduleA,
      autoScheduleB,
      autoScheduleC,
      autoScheduleD
    } = req.body;

    if (!aircraftId || !category || !purchasePrice || !registration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get user's membership
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

    // Check if user has enough balance
    const price = Number(purchasePrice);
    if (membership.balance < price) {
      return res.status(400).json({
        error: 'Insufficient funds',
        required: price,
        available: membership.balance
      });
    }

    // Verify aircraft exists
    const aircraft = await Aircraft.findByPk(aircraftId);
    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    // Get base airport to determine country for registration validation
    let baseAirportCode = null;
    let baseCountry = null;
    if (membership.baseAirportId) {
      const baseAirport = await Airport.findByPk(membership.baseAirportId);
      if (baseAirport) {
        baseAirportCode = baseAirport.icaoCode;
        baseCountry = baseAirport.country;
      }
    }

    // Validate registration format
    const registrationUpper = registration.trim().toUpperCase();

    // Basic validation
    if (registrationUpper.length < 3 || registrationUpper.length > 10) {
      return res.status(400).json({ error: 'Registration must be between 3 and 10 characters' });
    }
    if (!/^[A-Z0-9]/.test(registrationUpper)) {
      return res.status(400).json({ error: 'Registration must start with a letter or number' });
    }
    if (!/^[A-Z0-9-]+$/.test(registrationUpper)) {
      return res.status(400).json({ error: 'Registration can only contain letters, numbers, and hyphens' });
    }

    // Country-specific validation if we know the base country
    if (baseCountry) {
      const prefix = getRegistrationPrefix(baseCountry);
      if (registrationUpper.startsWith(prefix.replace('-', ''))) {
        // Extract suffix (part after prefix)
        const suffix = registrationUpper.substring(prefix.length);
        const validation = validateRegistrationSuffix(suffix, prefix);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.message });
        }
      }
    }

    // Check if registration is already in use
    const existingAircraft = await UserAircraft.findOne({ where: { registration: registrationUpper } });
    if (existingAircraft) {
      return res.status(400).json({ error: 'Registration already in use' });
    }

    // Get the world's current time (game world time, not real world time)
    const world = await World.findByPk(activeWorldId);
    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }
    const now = new Date(world.currentTime);

    // Default intervals
    const defaultCInterval = 660; // ~22 months
    const defaultDInterval = 2920; // ~8 years

    let lastCCheckDate, lastDCheckDate;
    let cInterval = defaultCInterval;
    let dInterval = defaultDInterval;

    if (category === 'new') {
      // New aircraft: all checks just done, full validity
      lastCCheckDate = now;
      lastDCheckDate = now;
      // Randomize intervals slightly for variety
      cInterval = 600 + Math.floor(Math.random() * 120); // 600-720 days
      dInterval = 2190 + Math.floor(Math.random() * 1460); // 2190-3650 days
    } else {
      // Used aircraft: calculate last check date based on remaining days
      if (cCheckRemainingDays) {
        const cDaysAgo = cInterval - cCheckRemainingDays;
        lastCCheckDate = new Date(now.getTime() - (cDaysAgo * 24 * 60 * 60 * 1000));
      } else {
        // Default: 6 months validity remaining
        const cDaysAgo = cInterval - 180;
        lastCCheckDate = new Date(now.getTime() - (cDaysAgo * 24 * 60 * 60 * 1000));
      }

      if (dCheckRemainingDays) {
        const dDaysAgo = dInterval - dCheckRemainingDays;
        lastDCheckDate = new Date(now.getTime() - (dDaysAgo * 24 * 60 * 60 * 1000));
      } else {
        // Default: 2 years validity remaining
        const dDaysAgo = dInterval - 730;
        lastDCheckDate = new Date(now.getTime() - (dDaysAgo * 24 * 60 * 60 * 1000));
      }
    }

    // Create user aircraft
    const userAircraft = await UserAircraft.create({
      worldMembershipId: membership.id,
      aircraftId,
      acquisitionType: 'purchase',
      condition: condition || 'New',
      conditionPercentage: conditionPercentage || 100,
      ageYears: ageYears || 0,
      purchasePrice: price,
      maintenanceCostPerHour,
      fuelBurnPerHour,
      registration: registrationUpper,
      currentAirport: baseAirportCode,
      status: 'active',
      // Check dates and intervals
      lastCCheckDate,
      lastDCheckDate,
      cCheckIntervalDays: cInterval,
      dCheckIntervalDays: dInterval,
      // For new aircraft, also set all other checks as just done
      lastDailyCheckDate: now,
      lastACheckDate: now,
      lastBCheckDate: now,
      // Auto-schedule preferences
      autoScheduleDaily: autoScheduleDaily || false,
      autoScheduleA: autoScheduleA || false,
      autoScheduleB: autoScheduleB || false,
      autoScheduleC: autoScheduleC || false,
      autoScheduleD: autoScheduleD || false
    });

    // Create auto-scheduled maintenance for enabled check types
    const autoCheckTypes = [];
    if (autoScheduleDaily) autoCheckTypes.push('daily');
    if (autoScheduleA) autoCheckTypes.push('A');
    if (autoScheduleB) autoCheckTypes.push('B');
    if (autoScheduleC) autoCheckTypes.push('C');
    if (autoScheduleD) autoCheckTypes.push('D');

    if (autoCheckTypes.length > 0) {
      await createAutoScheduledMaintenance(userAircraft.id, autoCheckTypes, activeWorldId);
    }

    // Deduct from balance
    membership.balance -= price;
    await membership.save();

    // Include aircraft details in response
    const result = await UserAircraft.findByPk(userAircraft.id, {
      include: [{
        model: Aircraft,
        as: 'aircraft'
      }]
    });

    res.json({
      message: 'Aircraft purchased successfully',
      aircraft: result,
      newBalance: membership.balance
    });
  } catch (error) {
    console.error('Error purchasing aircraft:', error);
    res.status(500).json({
      error: 'Failed to purchase aircraft',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Lease aircraft
 */
router.post('/lease', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(400).json({ error: 'No active world selected' });
    }

    const {
      aircraftId,
      category,
      condition,
      conditionPercentage,
      ageYears,
      leaseMonthlyPayment,
      leaseDurationMonths,
      maintenanceCostPerHour,
      fuelBurnPerHour,
      purchasePrice, // For reference
      registration,
      // Check validity (days remaining) - for used aircraft
      cCheckRemainingDays,
      dCheckRemainingDays,
      // Auto-schedule preferences
      autoScheduleDaily,
      autoScheduleA,
      autoScheduleB,
      autoScheduleC,
      autoScheduleD
    } = req.body;

    if (!aircraftId || !leaseMonthlyPayment || !leaseDurationMonths || !registration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get user's membership
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

    // Check if user can afford first month's payment
    const monthlyPayment = Number(leaseMonthlyPayment);
    if (membership.balance < monthlyPayment) {
      return res.status(400).json({
        error: 'Insufficient funds for first lease payment',
        required: monthlyPayment,
        available: membership.balance
      });
    }

    // Verify aircraft exists
    const aircraft = await Aircraft.findByPk(aircraftId);
    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    // Get base airport to determine country for registration validation
    let baseAirportCode = null;
    let baseCountry = null;
    if (membership.baseAirportId) {
      const baseAirport = await Airport.findByPk(membership.baseAirportId);
      if (baseAirport) {
        baseAirportCode = baseAirport.icaoCode;
        baseCountry = baseAirport.country;
      }
    }

    // Validate registration format
    const registrationUpper = registration.trim().toUpperCase();

    // Basic validation
    if (registrationUpper.length < 3 || registrationUpper.length > 10) {
      return res.status(400).json({ error: 'Registration must be between 3 and 10 characters' });
    }
    if (!/^[A-Z0-9]/.test(registrationUpper)) {
      return res.status(400).json({ error: 'Registration must start with a letter or number' });
    }
    if (!/^[A-Z0-9-]+$/.test(registrationUpper)) {
      return res.status(400).json({ error: 'Registration can only contain letters, numbers, and hyphens' });
    }

    // Country-specific validation if we know the base country
    if (baseCountry) {
      const prefix = getRegistrationPrefix(baseCountry);
      if (registrationUpper.startsWith(prefix.replace('-', ''))) {
        // Extract suffix (part after prefix)
        const suffix = registrationUpper.substring(prefix.length);
        const validation = validateRegistrationSuffix(suffix, prefix);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.message });
        }
      }
    }

    // Check if registration is already in use
    const existingAircraft = await UserAircraft.findOne({ where: { registration: registrationUpper } });
    if (existingAircraft) {
      return res.status(400).json({ error: 'Registration already in use' });
    }

    // Get the world's current time (game world time, not real world time)
    const world = await World.findByPk(activeWorldId);
    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }
    const now = new Date(world.currentTime);
    const leaseEnd = new Date(now);
    leaseEnd.setMonth(leaseEnd.getMonth() + parseInt(leaseDurationMonths));

    // Calculate check dates based on category and remaining validity
    const defaultCInterval = 660; // ~22 months
    const defaultDInterval = 2920; // ~8 years

    let lastCCheckDate, lastDCheckDate;
    let cInterval = defaultCInterval;
    let dInterval = defaultDInterval;

    if (category === 'new') {
      // New aircraft: all checks just done, full validity
      lastCCheckDate = now;
      lastDCheckDate = now;
      cInterval = 600 + Math.floor(Math.random() * 120);
      dInterval = 2190 + Math.floor(Math.random() * 1460);
    } else {
      // Used aircraft: calculate last check date based on remaining days
      if (cCheckRemainingDays) {
        const cDaysAgo = cInterval - cCheckRemainingDays;
        lastCCheckDate = new Date(now.getTime() - (cDaysAgo * 24 * 60 * 60 * 1000));
      } else {
        const cDaysAgo = cInterval - 180;
        lastCCheckDate = new Date(now.getTime() - (cDaysAgo * 24 * 60 * 60 * 1000));
      }

      if (dCheckRemainingDays) {
        const dDaysAgo = dInterval - dCheckRemainingDays;
        lastDCheckDate = new Date(now.getTime() - (dDaysAgo * 24 * 60 * 60 * 1000));
      } else {
        const dDaysAgo = dInterval - 730;
        lastDCheckDate = new Date(now.getTime() - (dDaysAgo * 24 * 60 * 60 * 1000));
      }
    }

    // Create leased aircraft
    const userAircraft = await UserAircraft.create({
      worldMembershipId: membership.id,
      aircraftId,
      acquisitionType: 'lease',
      condition: condition || 'New',
      conditionPercentage: conditionPercentage || 100,
      ageYears: ageYears || 0,
      purchasePrice: purchasePrice || null,
      leaseMonthlyPayment: monthlyPayment,
      leaseDurationMonths: parseInt(leaseDurationMonths),
      leaseStartDate: now,
      leaseEndDate: leaseEnd,
      maintenanceCostPerHour,
      fuelBurnPerHour,
      registration: registrationUpper,
      currentAirport: baseAirportCode,
      status: 'active',
      // Check dates and intervals
      lastCCheckDate,
      lastDCheckDate,
      cCheckIntervalDays: cInterval,
      dCheckIntervalDays: dInterval,
      lastDailyCheckDate: now,
      lastACheckDate: now,
      lastBCheckDate: now,
      // Auto-schedule preferences
      autoScheduleDaily: autoScheduleDaily || false,
      autoScheduleA: autoScheduleA || false,
      autoScheduleB: autoScheduleB || false,
      autoScheduleC: autoScheduleC || false,
      autoScheduleD: autoScheduleD || false
    });

    // Create auto-scheduled maintenance for enabled check types
    const autoCheckTypes = [];
    if (autoScheduleDaily) autoCheckTypes.push('daily');
    if (autoScheduleA) autoCheckTypes.push('A');
    if (autoScheduleB) autoCheckTypes.push('B');
    if (autoScheduleC) autoCheckTypes.push('C');
    if (autoScheduleD) autoCheckTypes.push('D');

    if (autoCheckTypes.length > 0) {
      await createAutoScheduledMaintenance(userAircraft.id, autoCheckTypes, activeWorldId);
    }

    // Deduct first month's payment
    membership.balance -= monthlyPayment;
    await membership.save();

    // Include aircraft details in response
    const result = await UserAircraft.findByPk(userAircraft.id, {
      include: [{
        model: Aircraft,
        as: 'aircraft'
      }]
    });

    res.json({
      message: 'Aircraft leased successfully',
      aircraft: result,
      newBalance: membership.balance
    });
  } catch (error) {
    console.error('Error leasing aircraft:', error);
    res.status(500).json({
      error: 'Failed to lease aircraft',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get maintenance status for all aircraft
 */
router.get('/maintenance', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(400).json({ error: 'No active world selected' });
    }

    // Get user's membership
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

    // Get fleet with maintenance check dates
    const fleet = await UserAircraft.findAll({
      where: { worldMembershipId: membership.id },
      include: [
        {
          model: Aircraft,
          as: 'aircraft'
        }
      ],
      order: [['registration', 'ASC']]
    });

    res.json(fleet);
  } catch (error) {
    console.error('Error fetching maintenance data:', error);
    res.status(500).json({ error: 'Failed to fetch maintenance data' });
  }
});

/**
 * Record a maintenance check
 */
router.post('/maintenance/:aircraftId/check', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { aircraftId } = req.params;
    const { checkType } = req.body;

    if (!['A', 'B', 'C', 'D'].includes(checkType)) {
      return res.status(400).json({ error: 'Invalid check type' });
    }

    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(400).json({ error: 'No active world selected' });
    }

    // Get user's membership
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

    // Find the aircraft and verify ownership
    const aircraft = await UserAircraft.findOne({
      where: { id: aircraftId, worldMembershipId: membership.id }
    });

    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    // Update the appropriate check date
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    const updateField = {
      'A': 'lastACheckDate',
      'B': 'lastBCheckDate',
      'C': 'lastCCheckDate',
      'D': 'lastDCheckDate'
    }[checkType];

    await aircraft.update({ [updateField]: today });

    res.json({
      message: `${checkType} Check recorded successfully`,
      checkDate: today,
      aircraft: aircraft
    });
  } catch (error) {
    console.error('Error recording maintenance check:', error);
    res.status(500).json({ error: 'Failed to record maintenance check' });
  }
});

/**
 * Update auto-schedule preferences for an aircraft
 */
router.put('/:aircraftId/auto-schedule', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { aircraftId } = req.params;
    const { checkType, enabled } = req.body;

    if (!checkType || !['daily', 'A', 'B', 'C', 'D'].includes(checkType)) {
      return res.status(400).json({ error: 'Invalid check type' });
    }

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }

    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(400).json({ error: 'No active world selected' });
    }

    // Get user's membership
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

    // Find the aircraft and verify ownership
    const aircraft = await UserAircraft.findOne({
      where: { id: aircraftId, worldMembershipId: membership.id }
    });

    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    // Update the appropriate auto-schedule field
    const fieldMap = {
      'daily': 'autoScheduleDaily',
      'A': 'autoScheduleA',
      'B': 'autoScheduleB',
      'C': 'autoScheduleC',
      'D': 'autoScheduleD'
    };

    const updateField = fieldMap[checkType];
    await aircraft.update({ [updateField]: enabled });

    // If enabled, create auto-scheduled maintenance; if disabled, remove it
    if (enabled) {
      await createAutoScheduledMaintenance(aircraftId, [checkType], activeWorldId);
    } else {
      await removeAutoScheduledMaintenance(aircraftId, [checkType]);
    }

    res.json({
      message: `Auto-schedule for ${checkType} check ${enabled ? 'enabled' : 'disabled'}`,
      checkType,
      enabled,
      aircraft: aircraft
    });
  } catch (error) {
    console.error('Error updating auto-schedule:', error);
    res.status(500).json({ error: 'Failed to update auto-schedule preference' });
  }
});

/**
 * Get auto-schedule preferences for an aircraft
 */
router.get('/:aircraftId/auto-schedule', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { aircraftId } = req.params;

    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(400).json({ error: 'No active world selected' });
    }

    // Get user's membership
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

    // Find the aircraft and verify ownership
    const aircraft = await UserAircraft.findOne({
      where: { id: aircraftId, worldMembershipId: membership.id }
    });

    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    res.json({
      aircraftId,
      autoScheduleDaily: aircraft.autoScheduleDaily || false,
      autoScheduleA: aircraft.autoScheduleA || false,
      autoScheduleB: aircraft.autoScheduleB || false,
      autoScheduleC: aircraft.autoScheduleC || false,
      autoScheduleD: aircraft.autoScheduleD || false
    });
  } catch (error) {
    console.error('Error fetching auto-schedule preferences:', error);
    res.status(500).json({ error: 'Failed to fetch auto-schedule preferences' });
  }
});

// Export router as default and helper functions
module.exports = router;
module.exports.checkMaintenanceConflict = checkMaintenanceConflict;
module.exports.attemptMaintenanceReschedule = attemptMaintenanceReschedule;
module.exports.findAvailableMaintenanceSlot = findAvailableMaintenanceSlot;
module.exports.findAvailableSlotOnDate = findAvailableSlotOnDate;
module.exports.createAutoScheduledMaintenance = createAutoScheduledMaintenance;
module.exports.refreshAutoScheduledMaintenance = refreshAutoScheduledMaintenance;
