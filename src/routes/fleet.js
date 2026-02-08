const express = require('express');
const router = express.Router();
const path = require('path');
const { Op } = require('sequelize');
const { WorldMembership, UserAircraft, Aircraft, User, Airport, RecurringMaintenance, ScheduledFlight, Route, World, Notification } = require('../models');
const worldTimeService = require('../services/worldTimeService');
const { REGISTRATION_RULES, validateRegistrationSuffix, getRegistrationPrefix, hasSpecificRule } = require(path.join(__dirname, '../../public/js/registrationPrefixes.js'));

// Check durations in minutes
const CHECK_DURATIONS = {
  daily: 60,     // 1 hour
  weekly: 135,   // 2.25 hours
  A: 540,        // 9 hours
  C: 30240,      // 21 days
  D: 108000      // 75 days
};

// Check intervals (how long until check expires) in days
const CHECK_INTERVALS = {
  daily: 2,      // 2 days
  weekly: 8,     // 7-8 days
  A: 112,        // ~112 days (based on flight hours estimate)
  C: 730,        // 2 years
  D: 2190        // ~6 years
};

// How many days before expiry to schedule each check type
const SCHEDULE_BEFORE_EXPIRY = {
  daily: 7,      // Schedule daily checks proactively
  weekly: 3,     // Schedule 3 days before expiry
  A: 14,         // Schedule 2 weeks before expiry
  C: 30,         // Schedule 1 month before expiry
  D: 60          // Schedule 2 months before expiry
};

/**
 * Check if aircraft is at home base during a given time slot
 * Returns true if aircraft is at home base, false if it's at an outstation
 *
 * Logic: Aircraft is at home base:
 * - Before the first flight of the day departs (minus pre-flight)
 * - After the last flight of the day arrives (plus post-flight)
 * - During overnight hours if no overnight flight in progress
 *
 * @param {string} aircraftId - Aircraft ID
 * @param {string} dateStr - Date string YYYY-MM-DD
 * @param {number} startMinutes - Start time in minutes from midnight
 * @param {number} duration - Duration in minutes
 * @returns {Promise<boolean>} True if aircraft is at home base
 */
async function isAtHomeBase(aircraftId, dateStr, startMinutes, duration) {
  // Get all flights for this date and adjacent dates (for overnight flights)
  const prevDate = new Date(dateStr);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().split('T')[0];

  const flights = await ScheduledFlight.findAll({
    where: {
      aircraftId,
      [Op.or]: [
        { scheduledDate: dateStr },
        { arrivalDate: dateStr },
        { scheduledDate: prevDateStr, arrivalDate: dateStr }
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

  if (flights.length === 0) {
    // No flights scheduled, aircraft is at home base
    return true;
  }

  const endMinutes = startMinutes + duration;

  // Build periods when aircraft is away from home base
  // Aircraft is away from: pre-flight start to post-flight end (at home base)
  // But during flight + turnaround at destination, it's at the outstation
  const awayPeriods = [];

  for (const flight of flights) {
    const acType = flight.aircraft?.aircraft?.type || 'Narrowbody';
    const pax = flight.aircraft?.aircraft?.passengerCapacity || 150;
    const dist = flight.route?.distance || 0;

    // Pre-flight calculation
    let catering = pax >= 50 && acType !== 'Cargo' ? (pax < 100 ? 5 : pax < 200 ? 10 : 15) : 0;
    let boarding = acType !== 'Cargo' ? (pax < 50 ? 10 : pax < 100 ? 15 : pax < 200 ? 20 : pax < 300 ? 25 : 35) : 0;
    let fuelling = dist < 500 ? 10 : dist < 1500 ? 15 : dist < 3000 ? 20 : 25;
    const preFlight = Math.max(catering + boarding, fuelling);

    const [depH, depM] = flight.departureTime.split(':').map(Number);
    const [arrH, arrM] = flight.arrivalTime.split(':').map(Number);

    // For round-trip routes, aircraft leaves home base at departure and returns on arrival
    // Aircraft is "away" from departure until it arrives back (after post-flight)
    // Since routes are typically outbound+return, the aircraft is away during:
    // - Outbound: from departure to arrival at destination
    // - At destination during turnaround
    // - Return: from destination departure to home base arrival

    // Simplified: aircraft is away from pre-flight start until post-flight at destination
    // Then it's at destination for turnaround, then away again during return
    // Finally back at home after return post-flight

    // For maintenance scheduling, we need to know when aircraft is AT home
    // Aircraft is at home BEFORE the outbound pre-flight starts
    // and AFTER the return post-flight ends

    if (flight.scheduledDate === dateStr) {
      // Flight departs on this date
      // Aircraft leaves home at (departure - preFlight)
      const leavesHome = depH * 60 + depM - preFlight;

      // Check if this is a same-day return or overnight
      if (flight.arrivalDate === dateStr) {
        // Same-day return - aircraft is away from leavesHome to arrival + post-flight
        let deboard = acType !== 'Cargo' ? (pax < 50 ? 5 : pax < 100 ? 8 : pax < 200 ? 12 : pax < 300 ? 15 : 20) : 0;
        let clean = pax < 50 ? 5 : pax < 100 ? 10 : pax < 200 ? 15 : pax < 300 ? 20 : 25;
        const postFlight = deboard + clean;
        const returnsHome = arrH * 60 + arrM + postFlight;
        awayPeriods.push({ start: Math.max(0, leavesHome), end: Math.min(1440, returnsHome) });
      } else {
        // Overnight flight - aircraft is away from leavesHome until end of day
        awayPeriods.push({ start: Math.max(0, leavesHome), end: 1440 });
      }
    }

    // If flight arrives on this date from previous day
    if (flight.arrivalDate === dateStr && flight.scheduledDate !== dateStr) {
      let deboard = acType !== 'Cargo' ? (pax < 50 ? 5 : pax < 100 ? 8 : pax < 200 ? 12 : pax < 300 ? 15 : 20) : 0;
      let clean = pax < 50 ? 5 : pax < 100 ? 10 : pax < 200 ? 15 : pax < 300 ? 20 : 25;
      const postFlight = deboard + clean;
      const returnsHome = arrH * 60 + arrM + postFlight;
      // Aircraft is away from midnight until it returns home
      awayPeriods.push({ start: 0, end: Math.min(1440, returnsHome) });
    }
  }

  // Check if the maintenance slot overlaps with any away period
  for (const away of awayPeriods) {
    if (startMinutes < away.end && endMinutes > away.start) {
      // Maintenance overlaps with away period - aircraft is NOT at home base
      return false;
    }
  }

  // No conflicts - aircraft is at home base
  return true;
}

/**
 * Validate that a proposed maintenance slot doesn't overlap with any flights
 * Returns { valid: true } or { valid: false, reason: string, conflict: object }
 */
async function validateMaintenanceSlot(aircraftId, dateStr, startTime, duration, checkType = 'daily') {
  const [startH, startM] = startTime.split(':').map(Number);
  const maintStart = startH * 60 + startM;
  const maintEnd = maintStart + duration;

  const flightSlots = await getFlightSlotsForDate(aircraftId, dateStr);

  for (const slot of flightSlots) {
    // Check for overlap: maintenance overlaps if it starts before slot ends AND ends after slot starts
    if (maintStart < slot.end && maintEnd > slot.start) {
      return {
        valid: false,
        reason: `Maintenance (${startTime} for ${duration}min) overlaps with flight operation (${Math.floor(slot.start/60)}:${String(slot.start%60).padStart(2,'0')} - ${Math.floor(slot.end/60)}:${String(slot.end%60).padStart(2,'0')})`,
        conflict: slot
      };
    }
  }

  // For non-daily checks, also verify aircraft is at home base
  if (checkType !== 'daily') {
    const atHome = await isAtHomeBase(aircraftId, dateStr, maintStart, duration);
    if (!atHome) {
      return {
        valid: false,
        reason: `Aircraft not at home base during maintenance window`,
        conflict: null
      };
    }
  }

  return { valid: true };
}

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
        { arrivalDate: dateStr },
        // Transit days: aircraft is in-flight/downroute all day
        {
          scheduledDate: { [Op.lt]: dateStr },
          arrivalDate: { [Op.gt]: dateStr }
        }
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

    const flightSchedDate = flight.scheduledDate?.substring?.(0, 10) || flight.scheduledDate;
    const flightArrDate = flight.arrivalDate?.substring?.(0, 10) || flight.arrivalDate;

    // If flight departs on this date
    if (flightSchedDate === dateStr) {
      let startMinutes = depH * 60 + depM - preFlight;
      let endMinutes = arrH * 60 + arrM + postFlight;
      if (flightArrDate !== flightSchedDate) {
        endMinutes = 1440; // Flight extends past midnight
      }
      slots.push({ start: Math.max(0, startMinutes), end: Math.min(1440, endMinutes) });
    }

    // If flight arrives on this date (from previous day)
    if (flightArrDate === dateStr && flightSchedDate !== dateStr) {
      let endMinutes = arrH * 60 + arrM + postFlight;
      slots.push({ start: 0, end: Math.min(1440, endMinutes) });
    }

    // If aircraft is in transit on this date (between departure and arrival days)
    // Aircraft is flying or downroute - busy all day
    if (flightSchedDate < dateStr && flightArrDate > dateStr) {
      slots.push({ start: 0, end: 1440 });
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
 *
 * Preference: Night hours (22:00-05:00) for minimal disruption to flying schedule
 *
 * Home base rules:
 * - Daily checks can be done at any airport (downroute)
 * - Weekly, A, C, D checks must be done at home base only
 *
 * @param {string} aircraftId - Aircraft ID
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {number} duration - Duration in minutes
 * @param {string} checkType - Check type: 'daily', 'weekly', 'A', 'C', 'D' (optional, defaults to 'daily')
 * @param {string} worldMembershipId - World membership ID for fleet-wide staggering (optional)
 */
async function findAvailableSlotOnDate(aircraftId, dateStr, duration, checkType = 'daily', worldMembershipId = null) {
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

  // Get fleet-wide maintenance counts for staggering (avoid all aircraft at same time)
  let fleetMaintCountBySlot = {};
  if (worldMembershipId) {
    try {
      // Get all aircraft in this fleet
      const fleetAircraft = await UserAircraft.findAll({
        where: { worldMembershipId },
        attributes: ['id']
      });
      const fleetAircraftIds = fleetAircraft.map(a => a.id);

      // Get maintenance scheduled on this date for the same check type across fleet
      const fleetMaint = await RecurringMaintenance.findAll({
        where: {
          aircraftId: { [Op.in]: fleetAircraftIds },
          scheduledDate: dateStr,
          checkType,
          status: 'active'
        }
      });

      // Count how many checks at each time slot
      for (const maint of fleetMaint) {
        const slot = maint.startTime.substring(0, 5); // Normalize to HH:MM
        fleetMaintCountBySlot[slot] = (fleetMaintCountBySlot[slot] || 0) + 1;
      }
    } catch (err) {
      console.error('Error getting fleet maintenance for staggering:', err.message);
    }
  }

  // HEAVY PREFERENCE for night hours (22:00-05:00)
  // Order: 22:00, 23:00, 00:00, 01:00, 02:00, 03:00, 04:00, 05:00
  // Then fall back to early morning/late evening if needed
  const basePreferredStarts = [
    1320, 1380, 0, 60, 120, 180, 240, 300,  // Night hours: 22:00-05:00 (primary)
    360, 1260, 1200, 1140,                   // 06:00, 21:00, 20:00, 19:00 (secondary)
    420, 480, 540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080  // Daytime (last resort)
  ];

  // For staggering: sort preferred starts by fleet usage (least used first) within priority tiers
  // Priority tiers: night (0-7), secondary (8-11), daytime (12+)
  let preferredStarts;
  if (Object.keys(fleetMaintCountBySlot).length > 0) {
    const getFleetCount = (mins) => {
      const hours = Math.floor(mins / 60).toString().padStart(2, '0');
      const m = (mins % 60).toString().padStart(2, '0');
      return fleetMaintCountBySlot[`${hours}:${m}`] || 0;
    };

    // Split into tiers and sort each tier by fleet usage
    const nightTier = basePreferredStarts.slice(0, 8).sort((a, b) => getFleetCount(a) - getFleetCount(b));
    const secondaryTier = basePreferredStarts.slice(8, 12).sort((a, b) => getFleetCount(a) - getFleetCount(b));
    const daytimeTier = basePreferredStarts.slice(12).sort((a, b) => getFleetCount(a) - getFleetCount(b));

    preferredStarts = [...nightTier, ...secondaryTier, ...daytimeTier];
  } else {
    preferredStarts = basePreferredStarts;
  }

  // Non-daily checks require home base - check if aircraft will be there
  const requiresHomeBase = checkType !== 'daily';

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

      // For non-daily checks, also verify aircraft is at home base
      if (!conflict && requiresHomeBase) {
        const atHome = await isAtHomeBase(aircraftId, dateStr, preferredStart, duration);
        if (!atHome) {
          conflict = true; // Aircraft is at outstation, can't do this check here
        }
      }

      if (!conflict) {
        const hours = Math.floor(preferredStart / 60).toString().padStart(2, '0');
        const mins = (preferredStart % 60).toString().padStart(2, '0');
        return `${hours}:${mins}`;
      }
    }
  }

  // Try every 30-minute slot as last resort (for daily checks only since non-daily need home base)
  if (!requiresHomeBase) {
    for (let mins = 0; mins < 1440; mins += 30) {
      const slotEnd = mins + duration;
      if (slotEnd > 1440) continue;

      let conflict = false;
      for (const busy of busyPeriods) {
        if (mins < busy.end && slotEnd > busy.start) {
          conflict = true;
          break;
        }
      }
      if (!conflict) {
        const hours = Math.floor(mins / 60).toString().padStart(2, '0');
        const m = (mins % 60).toString().padStart(2, '0');
        return `${hours}:${m}`;
      }
    }
  }

  return null; // No slot available on this date (or no home base slot for non-daily checks)
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

  // HEAVY PREFERENCE for night hours (22:00-05:00)
  // Order: 22:00, 23:00, 00:00, 01:00, 02:00, 03:00, 04:00, 05:00
  const preferredStarts = [
    1320, 1380, 0, 60, 120, 180, 240, 300,  // Night hours: 22:00-05:00 (primary)
    360, 1260, 1200, 1140,                   // 06:00, 21:00, 20:00, 19:00 (secondary)
    420, 480, 540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080  // Daytime (last resort)
  ];

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

  // Try every 30-minute slot as last resort
  for (let mins = 0; mins < 1440; mins += 30) {
    const slotEnd = mins + duration;
    let conflict = false;

    for (const busy of busyPeriods) {
      if (mins < busy.end && slotEnd > busy.start) {
        conflict = true;
        break;
      }
    }

    if (!conflict) {
      const hours = Math.floor(mins / 60).toString().padStart(2, '0');
      const m = (mins % 60).toString().padStart(2, '0');
      return `${hours}:${m}`;
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
async function createAutoScheduledMaintenance(aircraftId, checkTypes, worldId = null, providedGameTime = null) {
  console.log(`[AUTO-SCHEDULE] createAutoScheduledMaintenance called with checkTypes=${checkTypes.join(',')}, aircraftId=${aircraftId}`);
  const createdRecords = [];
  const recordsToCreate = []; // Batch insert at the end

  // Get the aircraft with its check dates
  const aircraft = await UserAircraft.findByPk(aircraftId, {
    include: [{ model: Aircraft, as: 'aircraft' }]
  });

  if (!aircraft) {
    console.error(`Aircraft ${aircraftId} not found for auto-scheduling`);
    return createdRecords;
  }

  // Check if aircraft is IN MAINTENANCE (C/D check actively in progress)
  // Note: "GROUNDED" in the UI means expired checks, but status is still 'active'
  // We only skip daily/weekly for aircraft with status='maintenance' (C/D in progress)
  const isInMaintenance = aircraft.status === 'maintenance';
  console.log(`[AUTO-SCHEDULE] ${aircraft.registration}: status=${aircraft.status}, isInMaintenance=${isInMaintenance}`);

  // Use provided game time if available, otherwise fetch from database
  let gameNow;
  if (providedGameTime) {
    gameNow = new Date(providedGameTime);
  } else if (worldId) {
    const world = await World.findByPk(worldId);
    gameNow = world ? new Date(world.currentTime) : new Date();
  } else {
    const membership = await WorldMembership.findByPk(aircraft.worldMembershipId);
    if (membership) {
      const world = await World.findByPk(membership.worldId);
      gameNow = world ? new Date(world.currentTime) : new Date();
    } else {
      gameNow = new Date();
    }
  }

  // === PRE-FETCH ALL DATA UPFRONT FOR SPEED ===
  // Reduced from 365 to 60 days to prevent DB connection timeouts
  // Weekly refresh will re-run, so we don't need to plan too far ahead
  const planningHorizon = 60;
  const endDate = new Date(gameNow);
  endDate.setDate(endDate.getDate() + planningHorizon);
  const startDateStr = gameNow.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  // 1. Get ALL flights for this aircraft in planning window (single query)
  const allFlights = await ScheduledFlight.findAll({
    where: {
      aircraftId,
      [Op.or]: [
        { scheduledDate: { [Op.between]: [startDateStr, endDateStr] } },
        { arrivalDate: { [Op.between]: [startDateStr, endDateStr] } }
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
  console.log(`[AUTO-SCHEDULE] ${aircraft.registration}: Found ${allFlights.length} flights in planning window ${startDateStr} to ${endDateStr}`);

  // 2. Get ALL existing maintenance for this aircraft (single query)
  const allExistingMaint = await RecurringMaintenance.findAll({
    where: {
      aircraftId,
      status: 'active',
      scheduledDate: { [Op.ne]: null }
    }
  });
  console.log(`[AUTO-SCHEDULE] ${aircraft.registration}: Found ${allExistingMaint.length} existing maintenance records:`,
    allExistingMaint.map(m => `${m.checkType} on ${m.scheduledDate}`));

  // 3. Get fleet aircraft IDs and their maintenance (for staggering) - single queries
  const fleetAircraft = await UserAircraft.findAll({
    where: { worldMembershipId: aircraft.worldMembershipId },
    attributes: ['id'],
    order: [['id', 'ASC']] // Consistent ordering for staggering
  });
  const fleetAircraftIds = fleetAircraft.map(a => a.id);

  // Calculate aircraft's position in fleet for day-level staggering (0-6 for weekly checks)
  const aircraftFleetIndex = fleetAircraftIds.indexOf(aircraftId);
  const weeklyDayOffset = aircraftFleetIndex % 7; // Spread weekly checks across 7 days

  const fleetMaint = await RecurringMaintenance.findAll({
    where: {
      aircraftId: { [Op.in]: fleetAircraftIds },
      status: 'active',
      scheduledDate: { [Op.between]: [startDateStr, endDateStr] }
    }
  });

  // === BUILD IN-MEMORY LOOKUP STRUCTURES ===

  // Index flights by date for quick lookup (including transit days)
  const flightsByDate = {};
  for (const flight of allFlights) {
    const depDate = flight.scheduledDate;
    const arrDate = flight.arrivalDate;
    if (!flightsByDate[depDate]) flightsByDate[depDate] = [];
    flightsByDate[depDate].push(flight);
    if (arrDate && arrDate !== depDate) {
      if (!flightsByDate[arrDate]) flightsByDate[arrDate] = [];
      flightsByDate[arrDate].push(flight);
      // Also index transit days (days between departure and arrival)
      const dep = new Date(depDate + 'T00:00:00');
      const arr = new Date(arrDate + 'T00:00:00');
      const transitDate = new Date(dep);
      transitDate.setDate(transitDate.getDate() + 1);
      while (transitDate < arr) {
        const transitStr = transitDate.toISOString().substring(0, 10);
        if (!flightsByDate[transitStr]) flightsByDate[transitStr] = [];
        flightsByDate[transitStr].push(flight);
        transitDate.setDate(transitDate.getDate() + 1);
      }
    }
  }

  // Index existing maintenance by check type
  const existingByCheckType = {};
  for (const maint of allExistingMaint) {
    if (!existingByCheckType[maint.checkType]) existingByCheckType[maint.checkType] = [];
    existingByCheckType[maint.checkType].push(maint);
  }

  // Index fleet maintenance by date and check type (for staggering)
  const fleetMaintByDateType = {};
  for (const maint of fleetMaint) {
    const key = `${maint.scheduledDate}_${maint.checkType}`;
    if (!fleetMaintByDateType[key]) fleetMaintByDateType[key] = {};
    const slot = maint.startTime.substring(0, 5);
    fleetMaintByDateType[key][slot] = (fleetMaintByDateType[key][slot] || 0) + 1;
  }

  // === HELPER FUNCTIONS USING IN-MEMORY DATA ===

  function getFlightSlotsForDateCached(dateStr) {
    const slots = [];
    const flights = flightsByDate[dateStr] || [];

    for (const flight of flights) {
      const acType = flight.aircraft?.aircraft?.type || 'Narrowbody';
      const pax = flight.aircraft?.aircraft?.passengerCapacity || 150;
      const dist = flight.route?.distance || 0;

      let catering = pax >= 50 && acType !== 'Cargo' ? (pax < 100 ? 5 : pax < 200 ? 10 : 15) : 0;
      let boarding = acType !== 'Cargo' ? (pax < 50 ? 10 : pax < 100 ? 15 : pax < 200 ? 20 : pax < 300 ? 25 : 35) : 0;
      let fuelling = dist < 500 ? 10 : dist < 1500 ? 15 : dist < 3000 ? 20 : 25;
      const preFlight = Math.max(catering + boarding, fuelling);

      let deboard = acType !== 'Cargo' ? (pax < 50 ? 5 : pax < 100 ? 8 : pax < 200 ? 12 : pax < 300 ? 15 : 20) : 0;
      let clean = pax < 50 ? 5 : pax < 100 ? 10 : pax < 200 ? 15 : pax < 300 ? 20 : 25;
      const postFlight = deboard + clean;

      const [depH, depM] = flight.departureTime.split(':').map(Number);
      const [arrH, arrM] = flight.arrivalTime.split(':').map(Number);

      if (flight.scheduledDate === dateStr) {
        let startMinutes = depH * 60 + depM - preFlight;
        let endMinutes = arrH * 60 + arrM + postFlight;
        if (flight.arrivalDate !== flight.scheduledDate) endMinutes = 1440;
        slots.push({ start: Math.max(0, startMinutes), end: Math.min(1440, endMinutes) });
      }

      if (flight.arrivalDate === dateStr && flight.scheduledDate !== dateStr) {
        let endMinutes = arrH * 60 + arrM + postFlight;
        slots.push({ start: 0, end: Math.min(1440, endMinutes) });
      }

      // Transit day: aircraft is in-flight/downroute all day
      if (flight.scheduledDate < dateStr && flight.arrivalDate > dateStr) {
        slots.push({ start: 0, end: 1440 });
      }
    }
    return slots;
  }

  function findAvailableSlotCached(dateStr, duration, checkType) {
    const flightSlots = getFlightSlotsForDateCached(dateStr);
    const targetDate = new Date(dateStr + 'T00:00:00');

    // Get existing maintenance on this date OR multi-day maintenance in progress
    const existingMaintOnDate = allExistingMaint.filter(m => {
      const schedDateStr = String(m.scheduledDate).split('T')[0];

      // Direct match - maintenance starts on this date
      if (schedDateStr === dateStr) return true;

      // Multi-day check (C/D) that spans this date
      if (['C', 'D'].includes(m.checkType)) {
        const schedDate = new Date(schedDateStr + 'T00:00:00');
        const durationDays = Math.ceil(m.duration / 1440);
        const endDate = new Date(schedDate);
        endDate.setDate(endDate.getDate() + durationDays);

        // If targetDate is within the maintenance period (on or after start, before end)
        if (targetDate >= schedDate && targetDate < endDate) {
          return true;
        }
      }
      return false;
    });

    const busyPeriods = [...flightSlots];
    for (const maint of existingMaintOnDate) {
      const schedDateStr = String(maint.scheduledDate).split('T')[0];

      if (schedDateStr === dateStr) {
        // Maintenance starts today - add from start time
        const [h, m] = maint.startTime.split(':').map(Number);
        const start = h * 60 + m;
        busyPeriods.push({ start, end: start + maint.duration });
      } else {
        // Multi-day maintenance in progress - entire day is blocked
        busyPeriods.push({ start: 0, end: 1440 });
      }
    }
    busyPeriods.sort((a, b) => a.start - b.start);

    // Get fleet staggering data for this date/type
    const key = `${dateStr}_${checkType}`;
    const fleetMaintCountBySlot = fleetMaintByDateType[key] || {};

    // Different preferred times based on check type
    let basePreferredStarts;

    if (checkType === 'daily') {
      // Daily checks: prefer early morning 03:00-06:00
      basePreferredStarts = [
        180, 210, 240, 270, 300, 330, 360,  // 03:00-06:00 (ideal for daily)
        150, 120, 90, 60, 30, 0,  // 02:30-00:00 (secondary)
        1380, 1410, 1350, 1320, 1290, 1260,  // 23:00-21:00 (secondary)
        420, 480, 540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080, 1140, 1200  // 07:00-20:00 (daytime last resort)
      ];
    } else {
      // Other checks (weekly, A, C, D): prefer overnight 21:00-04:30
      basePreferredStarts = [
        1260, 1290, 1320, 1350, 1380, 1410,  // 21:00-23:30 (ideal overnight)
        0, 30, 60, 90, 120, 150, 180, 210, 240, 270,  // 00:00-04:30
        300, 330, 360,  // 05:00-06:00 (secondary)
        1200, 1230,     // 20:00-20:30 (secondary)
        420, 480, 540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080, 1140  // 07:00-19:00 (daytime last resort)
      ];
    }

    let preferredStarts;
    if (Object.keys(fleetMaintCountBySlot).length > 0) {
      // Sort by fleet count to stagger across fleet, but keep priority order for ties
      const getFleetCount = (mins) => {
        const hours = Math.floor(mins / 60).toString().padStart(2, '0');
        const m = (mins % 60).toString().padStart(2, '0');
        return fleetMaintCountBySlot[`${hours}:${m}`] || 0;
      };
      // Sort by fleet count, use original index as tiebreaker to maintain priority
      preferredStarts = basePreferredStarts
        .map((mins, idx) => ({ mins, idx, count: getFleetCount(mins) }))
        .sort((a, b) => a.count - b.count || a.idx - b.idx)
        .map(x => x.mins);
    } else {
      preferredStarts = basePreferredStarts;
    }

    // For multi-day checks (C/D), only check for conflicts on the first day
    const isMultiDay = duration > 1440;

    for (const preferredStart of preferredStarts) {
      // For multi-day checks, only check start time conflicts (first day)
      // For single-day checks, check entire duration fits
      const slotEnd = isMultiDay ? 1440 : preferredStart + duration;

      if (slotEnd <= 1440) {
        let conflict = false;
        for (const busy of busyPeriods) {
          if (isMultiDay) {
            // Multi-day: just check if start time conflicts with any busy period
            if (preferredStart >= busy.start && preferredStart < busy.end) {
              conflict = true;
              break;
            }
          } else {
            // Single-day: check full duration overlap
            if (preferredStart < busy.end && slotEnd > busy.start) {
              conflict = true;
              break;
            }
          }
        }
        if (!conflict) {
          const hours = Math.floor(preferredStart / 60).toString().padStart(2, '0');
          const mins = (preferredStart % 60).toString().padStart(2, '0');
          return `${hours}:${mins}`;
        }
      }
    }
    // Log when no slot is found (only for first few attempts to avoid spam)
    if (!findAvailableSlotCached._logCount) findAvailableSlotCached._logCount = 0;
    if (findAvailableSlotCached._logCount < 3) {
      findAvailableSlotCached._logCount++;
      console.log(`[AUTO-SCHEDULE] findAvailableSlotCached returning null for ${dateStr}/${checkType}: flightSlots=${flightSlots.length}, existingMaintOnDate=${existingMaintOnDate.length}, busyPeriods=${JSON.stringify(busyPeriods.slice(0, 5))}`);
    }
    return null;
  }

  // Check field mappings
  // Note: A check uses hours, others use days
  const checkFieldMap = {
    daily: { lastCheck: 'lastDailyCheckDate', interval: CHECK_INTERVALS.daily },
    weekly: { lastCheck: 'lastWeeklyCheckDate', interval: CHECK_INTERVALS.weekly },
    A: { lastCheck: 'lastACheckDate', intervalHours: aircraft.aCheckIntervalHours || CHECK_INTERVALS.A },
    C: { lastCheck: 'lastCCheckDate', interval: aircraft.cCheckIntervalDays || CHECK_INTERVALS.C },
    D: { lastCheck: 'lastDCheckDate', interval: aircraft.dCheckIntervalDays || CHECK_INTERVALS.D }
  };

  // === DETERMINE HEAVIEST EXPIRED CHECK ===
  // Check hierarchy: D > C > A > weekly > daily (heavier checks include lighter ones)
  // If a heavier check is expired, skip scheduling lighter expired checks
  const checkHierarchy = ['D', 'C', 'A', 'weekly', 'daily'];
  let heaviestExpiredCheck = null;

  for (const ct of checkHierarchy) {
    if (!checkTypes.includes(ct)) continue;
    const fi = checkFieldMap[ct];
    const lastCheck = aircraft[fi.lastCheck];

    let isExpired = false;
    if (ct === 'A') {
      // A check is expired if no lastACheckDate OR hours exceeded
      if (!aircraft.lastACheckDate) {
        isExpired = true;
      } else {
        const lastACheckHours = parseFloat(aircraft.lastACheckHours) || 0;
        const currentFlightHours = parseFloat(aircraft.totalFlightHours) || 0;
        const intervalHours = fi.intervalHours || 800;
        const hoursUntilDue = intervalHours - (currentFlightHours - lastACheckHours);
        isExpired = hoursUntilDue <= 0;
      }
    } else {
      // Other checks are expired if no lastCheckDate OR expiry date passed
      if (!lastCheck) {
        isExpired = true;
      } else {
        const expiry = calculateCheckExpiry(lastCheck, fi.interval);
        isExpired = expiry && expiry <= gameNow;
      }
    }

    if (isExpired) {
      heaviestExpiredCheck = ct;
      break;
    }
  }

  // Calculate "now + 2 hours" time for expired checks (gives time to navigate to schedule)
  const immediateStart = new Date(gameNow.getTime() + 2 * 60 * 60 * 1000);
  const immediateStartTime = `${String(immediateStart.getUTCHours()).padStart(2, '0')}:${String(immediateStart.getUTCMinutes()).padStart(2, '0')}`;
  const todayDateStr = gameNow.toISOString().split('T')[0];

  // Sort checkTypes to process heavier checks first (D > C > A > weekly > daily)
  // This ensures that when we process daily, heavier checks are already in recordsToCreate
  // so the coverage detection works correctly
  const sortedCheckTypes = [...checkTypes].sort((a, b) => {
    return checkHierarchy.indexOf(a) - checkHierarchy.indexOf(b);
  });

  // Log grounded aircraft status
  if (isInMaintenance) {
    console.log(`[AUTO-SCHEDULE] Aircraft ${aircraft.registration} is grounded (status: ${aircraft.status})${heaviestExpiredCheck ? ` - expired ${heaviestExpiredCheck} check will be scheduled` : ''}`);
  }

  for (const checkType of sortedCheckTypes) {
    const fieldInfo = checkFieldMap[checkType];
    if (!fieldInfo) continue;

    // If aircraft is in maintenance OR has an expired C/D check, skip ALL lighter checks.
    // During a heavy check (C/D), the aircraft is grounded — scheduling daily/weekly/A/C
    // makes no sense and clutters the schedule. A D check also covers C check requirements.
    if (isInMaintenance || (heaviestExpiredCheck && ['C', 'D'].includes(heaviestExpiredCheck))) {
      if (checkType !== heaviestExpiredCheck) {
        const heavierIdx = checkHierarchy.indexOf(heaviestExpiredCheck);
        const currentIdx = checkHierarchy.indexOf(checkType);
        if (currentIdx > heavierIdx) {
          console.log(`[AUTO-SCHEDULE] Skipping ${checkType} checks — heavy check ${heaviestExpiredCheck} is expired/in-progress for ${aircraft.registration}`);
          continue;
        }
      }
    }

    // Check if this lighter check's IMMEDIATE scheduling should be skipped
    // (because a heavier check is expired and will cover this one)
    // We still schedule FUTURE checks, just not the immediate one
    let skipImmediateScheduling = false;
    if (heaviestExpiredCheck && checkType !== heaviestExpiredCheck) {
      const heavierIndex = checkHierarchy.indexOf(heaviestExpiredCheck);
      const currentIndex = checkHierarchy.indexOf(checkType);
      if (currentIndex > heavierIndex) {
        skipImmediateScheduling = true; // Skip immediate, but continue to schedule future
      }
    }

    // Get last check date and calculate expiry
    const lastCheckDate = aircraft[fieldInfo.lastCheck];
    console.log(`[AUTO-SCHEDULE] ${checkType}: lastCheckDate=${lastCheckDate}, fieldName=${fieldInfo.lastCheck}`);

    // A checks are hours-based, others are days-based
    let expiryDate;
    if (checkType === 'A') {
      // For A checks, estimate expiry based on flight hours and average daily usage
      // If no last A check date, use acquisition date as baseline
      const lastACheckHours = parseFloat(aircraft.lastACheckHours) || 0;
      const currentFlightHours = parseFloat(aircraft.totalFlightHours) || 0;
      const intervalHours = fieldInfo.intervalHours || 800;
      const hoursUntilDue = intervalHours - (currentFlightHours - lastACheckHours);

      // Estimate ~6-8 flight hours per day for planning purposes
      const estimatedDaysUntilDue = Math.max(1, Math.ceil(hoursUntilDue / 7));
      expiryDate = new Date(gameNow);
      expiryDate.setDate(expiryDate.getDate() + estimatedDaysUntilDue);

      console.log(`[A CHECK] ${aircraft.registration}: ${hoursUntilDue.toFixed(0)} hrs until due, estimated ${estimatedDaysUntilDue} days`);
    } else {
      // If no lastCheckDate, treat as immediately expired (set expiry to yesterday)
      if (!lastCheckDate) {
        expiryDate = new Date(gameNow);
        expiryDate.setDate(expiryDate.getDate() - 1);
        console.log(`[AUTO-SCHEDULE] ${checkType}: No last check date - treating as EXPIRED`);
      } else {
        expiryDate = calculateCheckExpiry(lastCheckDate, fieldInfo.interval);
      }
    }

    if (!expiryDate) {
      console.log(`[AUTO-SCHEDULE] SKIP ${checkType}: Could not calculate expiry date`);
      continue;
    }
    console.log(`[AUTO-SCHEDULE] ${checkType}: expiryDate=${expiryDate.toISOString()}, gameNow=${gameNow.toISOString()}`);


    // Delete any old patterns for this check type (cleanup legacy recurring entries)
    await RecurringMaintenance.destroy({
      where: { aircraftId, checkType, scheduledDate: null }
    });

    const duration = CHECK_DURATIONS[checkType];
    const durationDays = Math.ceil(duration / (24 * 60)); // Convert minutes to days (round up)

    // For weekly, A, C, D checks - plan ahead
    if (checkType === 'weekly' || checkType === 'A' || checkType === 'C' || checkType === 'D') {
      const endPlanningDate = new Date(gameNow);
      endPlanningDate.setDate(endPlanningDate.getDate() + planningHorizon);

      // Use pre-fetched existing scheduled checks
      const existingScheduled = existingByCheckType[checkType] || [];

      // For C/D checks, check if one is already IN PROGRESS
      // (scheduled in the past but duration hasn't elapsed)
      if (['C', 'D'].includes(checkType)) {
        const inProgressCheck = existingScheduled.find(m => {
          const schedDateStr = String(m.scheduledDate).split('T')[0];
          const schedDate = new Date(schedDateStr + 'T00:00:00');
          const checkDurationDays = Math.ceil(m.duration / 1440);
          const endDate = new Date(schedDate);
          endDate.setDate(endDate.getDate() + checkDurationDays);

          return schedDate <= gameNow && gameNow < endDate;
        });

        if (inProgressCheck) {
          const schedDateStr = String(inProgressCheck.scheduledDate).split('T')[0];
          console.log(`[AUTO-SCHEDULE] ${checkType} check already IN PROGRESS (started ${schedDateStr}) - skipping`);
          continue; // Skip to next check type
        }
      }

      // Check if this check is EXPIRED (needs immediate attention)
      const isExpired = expiryDate <= gameNow;

      let currentExpiryDate = new Date(expiryDate);
      let checkInterval = fieldInfo.interval;
      if (checkType === 'A') {
        checkInterval = Math.ceil((fieldInfo.intervalHours || 800) / 7);
      }

      let iterationCount = 0;
      const maxIterations = 20;

      while (currentExpiryDate <= endPlanningDate && iterationCount < maxIterations) {
        iterationCount++;

        const bufferDays = durationDays + 2;
        let targetStartDate = new Date(currentExpiryDate);
        targetStartDate.setDate(targetStartDate.getDate() - bufferDays);

        // For weekly checks, stagger across the fleet by adding day offset
        // This spreads weekly checks across different days of the week.
        // Cap offset to avoid pulling target so far back that it overlaps with the previous period.
        if (checkType === 'weekly' && !isExpired) {
          const cappedOffset = Math.min(weeklyDayOffset, Math.floor(checkInterval / 2) - 1);
          targetStartDate.setDate(targetStartDate.getDate() - cappedOffset);
        }

        // If expired or target is in the past, schedule for TODAY (not tomorrow)
        if (targetStartDate < gameNow) {
          targetStartDate = new Date(gameNow);
          // Only add 1 day if NOT expired - expired checks go TODAY
          if (!isExpired || iterationCount > 1) {
            targetStartDate.setDate(targetStartDate.getDate() + 1);
          }
        }

        let targetDateStr = targetStartDate.toISOString().split('T')[0];

        // Check if already scheduled for this period (in DB or newly queued)
        // Use a fraction of the check interval as dedup window to prevent true duplicates
        // without skipping valid future checks that land close due to stagger/push-forward.
        // Weekly (8-day interval) → 2 days; A (112) → 37 days; C/D → much larger.
        const dedupDays = Math.max(2, Math.floor(checkInterval / 3));
        const dedupMs = dedupDays * 24 * 60 * 60 * 1000;
        const alreadyScheduled = existingScheduled.some(s => {
          const schedDate = new Date(s.scheduledDate);
          return Math.abs(schedDate - targetStartDate) < dedupMs;
        }) || recordsToCreate.some(r => {
          return r.checkType === checkType && Math.abs(new Date(r.scheduledDate) - targetStartDate) < dedupMs;
        });

        if (alreadyScheduled) {
          console.log(`[AUTO-SCHEDULE] ${checkType}: Already scheduled near ${targetDateStr}, skipping (existingScheduled=${existingScheduled.length})`);
        }

        if (!alreadyScheduled) {
          let startTime = null;

          // If EXPIRED (first iteration), schedule NOW (current time + 30 min)
          // BUT skip if a heavier check is already handling immediate scheduling
          if (isExpired && iterationCount === 1) {
            if (skipImmediateScheduling) {
              // Skip immediate scheduling - heavier check covers this
              // But continue loop to schedule future checks
              const checkCompletionDate = new Date(gameNow);
              checkCompletionDate.setDate(checkCompletionDate.getDate() + durationDays);
              currentExpiryDate = new Date(checkCompletionDate);
              currentExpiryDate.setDate(currentExpiryDate.getDate() + checkInterval);
              continue;
            }
            targetDateStr = todayDateStr;
            startTime = immediateStartTime;
          } else {
            // Use cached slot finder for ALL check types - prefer overnight hours
            const datesToTry = [targetDateStr];
            // For A/weekly, try nearby dates; for C/D, just use target date
            if (checkType === 'A' || checkType === 'weekly') {
              for (let offset = -2; offset <= 3; offset++) {
                if (offset === 0) continue;
                const altDate = new Date(targetStartDate);
                altDate.setDate(altDate.getDate() + offset);
                if (altDate >= gameNow) {
                  datesToTry.push(altDate.toISOString().split('T')[0]);
                }
              }
            }

            for (const tryDate of datesToTry) {
              const availableTime = findAvailableSlotCached(tryDate, duration, checkType);
              if (availableTime) {
                startTime = availableTime;
                targetDateStr = tryDate;
                break;
              }
            }

            // If no conflict-free slot found, try expanding date range further
            if (!startTime) {
              for (let offset = 4; offset <= 14; offset++) {
                const altDate = new Date(targetStartDate);
                altDate.setDate(altDate.getDate() + offset);
                if (altDate > endPlanningDate) break;
                const altDateStr = altDate.toISOString().split('T')[0];
                const availableTime = findAvailableSlotCached(altDateStr, duration, checkType);
                if (availableTime) {
                  startTime = availableTime;
                  targetDateStr = altDateStr;
                  break;
                }
              }
            }

            // Skip if still no slot found - don't place on top of flights
            if (!startTime) {
              console.log(`[MAINT] No available slot for ${checkType} check on ${targetDateStr} - skipping`);
              // Advance expiry by interval so the loop progresses
              currentExpiryDate = new Date(currentExpiryDate);
              currentExpiryDate.setDate(currentExpiryDate.getDate() + checkInterval);
              continue;
            }
          }

          // Collect for batch insert
          const newRecord = {
            aircraftId,
            checkType,
            scheduledDate: targetDateStr,
            startTime,
            duration,
            status: 'active'
          };
          recordsToCreate.push(newRecord);

          // For C/D checks, also add to allExistingMaint so that findAvailableSlotCached
          // blocks these dates when scheduling lighter checks later in this batch
          if (['C', 'D'].includes(checkType)) {
            allExistingMaint.push(newRecord);
          }
        }

        // Advance to next expiry period.
        // Use the ORIGINAL currentExpiryDate (not targetStartDate which has stagger applied)
        // so that expiry dates stay evenly spaced regardless of stagger offset.
        if (!checkInterval || isNaN(checkInterval)) break;
        currentExpiryDate = new Date(currentExpiryDate);
        currentExpiryDate.setDate(currentExpiryDate.getDate() + checkInterval);
      }
      continue;
    } else if (checkType === 'daily') {
      const daysToSchedule = 7;

      // Use pre-fetched existing daily checks
      const existingDailyChecks = existingByCheckType['daily'] || [];
      const existingDates = new Set(existingDailyChecks.map(m => {
        if (m.scheduledDate instanceof Date) {
          return m.scheduledDate.toISOString().split('T')[0];
        }
        return String(m.scheduledDate).split('T')[0];
      }));

      // Get heavier checks (weekly, A, C, D) - these cover daily requirements
      const heavierChecks = [
        ...(existingByCheckType['weekly'] || []),
        ...(existingByCheckType['A'] || []),
        ...(existingByCheckType['C'] || []),
        ...(existingByCheckType['D'] || []),
        ...recordsToCreate.filter(r => ['weekly', 'A', 'C', 'D'].includes(r.checkType))
      ];
      // Build set of dates covered by heavier checks (including all days of C/D checks)
      const heavierCheckDates = new Set();
      for (const m of heavierChecks) {
        const d = m.scheduledDate;
        const dateStr = d instanceof Date ? d.toISOString().split('T')[0] : String(d).split('T')[0];
        heavierCheckDates.add(dateStr);

        // For C/D checks, add all days they span
        if (['C', 'D'].includes(m.checkType)) {
          const durationDays = Math.ceil((m.duration || 1440) / 1440);
          const startDate = new Date(dateStr + 'T00:00:00');
          for (let dayOffset = 1; dayOffset < durationDays; dayOffset++) {
            const spanDate = new Date(startDate);
            spanDate.setDate(spanDate.getDate() + dayOffset);
            heavierCheckDates.add(spanDate.toISOString().split('T')[0]);
          }
        }
      }

      // Check if daily check is EXPIRED (needs immediate attention)
      const lastDailyCheck = aircraft.lastDailyCheckDate;
      let isDailyExpired = true; // Default to expired if no last check
      if (lastDailyCheck) {
        const lastCheckDate = new Date(lastDailyCheck);
        const expiryDate = new Date(lastCheckDate);
        expiryDate.setDate(expiryDate.getDate() + 1); // Daily valid for check day + next day
        expiryDate.setUTCHours(23, 59, 59, 999);
        isDailyExpired = expiryDate <= gameNow;
      }

      // Try to schedule a daily check EVERY day where possible.
      // If no slot is found on a given day, the 2-day validity from
      // the previous check provides coverage as a safety net.
      console.log(`[AUTO-SCHEDULE] ${aircraft.registration} daily: existingDates=${existingDates.size}, heavierDates=${heavierCheckDates.size}, allExistingMaint=${allExistingMaint.length}, flights=${Object.keys(flightsByDate).length} days`);
      for (let dayOffset = 0; dayOffset < daysToSchedule; dayOffset++) {
        const tryDate = new Date(gameNow);
        tryDate.setDate(tryDate.getDate() + dayOffset);
        const dateStr = tryDate.toISOString().split('T')[0];

        // Skip if there's already a daily check on this day
        if (existingDates.has(dateStr)) continue;

        // Skip if there's a heavier check on this day (it covers daily)
        if (heavierCheckDates.has(dateStr)) continue;

        // For expired checks on day 0, schedule NOW
        // Skip if heavier check is handling immediate scheduling
        let availableTime;
        if (isDailyExpired && dayOffset === 0) {
          if (skipImmediateScheduling) {
            isDailyExpired = false;
            continue;
          }
          availableTime = immediateStartTime;
        } else {
          // Use cached slot finder - daily can be done downroute
          availableTime = findAvailableSlotCached(dateStr, duration, 'daily');
        }

        // No slot found - log why and skip (2-day validity from previous check covers the gap)
        if (!availableTime) {
          console.log(`[AUTO-SCHEDULE] ${aircraft.registration}: No slot for daily on ${dateStr} - flights or maintenance blocking all times`);
          continue;
        }

        recordsToCreate.push({
          aircraftId,
          checkType,
          scheduledDate: dateStr,
          startTime: availableTime,
          duration,
          status: 'active'
        });
        existingDates.add(dateStr);

        if (dayOffset === 0) isDailyExpired = false;
      }
    }
  }

  // === BATCH INSERT ALL RECORDS AT ONCE ===
  console.log(`[AUTO-SCHEDULE] ${aircraft.registration}: Creating ${recordsToCreate.length} maintenance records`);
  if (recordsToCreate.length > 0) {
    console.log(`[AUTO-SCHEDULE] Records to create:`, recordsToCreate.map(r => `${r.checkType} on ${r.scheduledDate} at ${r.startTime}`));
    try {
      const created = await RecurringMaintenance.bulkCreate(recordsToCreate);
      createdRecords.push(...created);
      console.log(`[AUTO-SCHEDULE] Successfully created ${created.length} records`);
    } catch (bulkError) {
      console.error(`[AUTO-SCHEDULE] Batch insert failed:`, bulkError.message);
      // Fallback to individual inserts
      for (const record of recordsToCreate) {
        try {
          const created = await RecurringMaintenance.create(record);
          createdRecords.push(created);
        } catch (err) {
          console.error(`[AUTO-SCHEDULE] Individual insert failed:`, err.message);
        }
      }
    }
  } else {
    console.log(`[AUTO-SCHEDULE] ${aircraft.registration}: No records to create - checks may not be due yet or no available slots`);
  }

  return createdRecords;
}

/**
 * Refresh auto-scheduled maintenance for an aircraft
 * Called periodically or when flight schedule changes
 * @param {string} aircraftId - Aircraft ID
 * @param {string} worldId - World ID (optional)
 * @param {Date} providedGameTime - Pre-fetched game time to avoid DB calls (optional)
 */
async function refreshAutoScheduledMaintenance(aircraftId, worldId = null, providedGameTime = null) {
  const aircraft = await UserAircraft.findByPk(aircraftId);
  if (!aircraft) {
    console.log(`[MAINT REFRESH] Aircraft ${aircraftId} not found`);
    return [];
  }

  console.log(`[MAINT REFRESH] Aircraft ${aircraft.registration} auto-schedule flags:`, {
    daily: aircraft.autoScheduleDaily,
    weekly: aircraft.autoScheduleWeekly,
    A: aircraft.autoScheduleA,
    C: aircraft.autoScheduleC,
    D: aircraft.autoScheduleD
  });

  // Build list of check types that have auto-schedule enabled
  const enabledChecks = [];
  if (aircraft.autoScheduleDaily) enabledChecks.push('daily');
  if (aircraft.autoScheduleWeekly) enabledChecks.push('weekly');
  if (aircraft.autoScheduleA) enabledChecks.push('A');
  if (aircraft.autoScheduleC) enabledChecks.push('C');
  if (aircraft.autoScheduleD) enabledChecks.push('D');

  console.log(`[MAINT REFRESH] Enabled checks for ${aircraft.registration}:`, enabledChecks);

  if (enabledChecks.length === 0) {
    console.log(`[MAINT REFRESH] No auto-schedule enabled for aircraft ${aircraftId}`);
    return [];
  }

  // Use provided game time if available, otherwise fetch from database
  let gameNow;
  if (providedGameTime) {
    gameNow = new Date(providedGameTime);
  } else if (worldId) {
    const world = await World.findByPk(worldId);
    gameNow = world ? new Date(world.currentTime) : new Date();
  } else {
    const membership = await WorldMembership.findByPk(aircraft.worldMembershipId);
    if (membership) {
      const world = await World.findByPk(membership.worldId);
      gameNow = world ? new Date(world.currentTime) : new Date();
    } else {
      gameNow = new Date();
    }
  }
  const gameNowStr = gameNow.toISOString().split('T')[0];

  // Delete existing auto-scheduled maintenance so it can be recreated
  // with correct positioning based on current flight schedule
  // BUT protect in-progress C/D checks (they span multiple days)
  try {
    const existingMaint = await RecurringMaintenance.findAll({
      where: {
        aircraftId,
        checkType: { [Op.in]: enabledChecks },
        status: 'active'
      }
    });

    const toDelete = existingMaint.filter(m => {
      // Protect in-progress C/D checks
      if (['C', 'D'].includes(m.checkType)) {
        const schedDateStr = String(m.scheduledDate).split('T')[0];
        const schedDate = new Date(schedDateStr + 'T00:00:00');
        const durationDays = Math.ceil(m.duration / 1440);
        const endDate = new Date(schedDate);
        endDate.setDate(endDate.getDate() + durationDays);

        // If scheduled in the past and still within duration, it's in progress
        if (schedDate <= gameNow && gameNow < endDate) {
          console.log(`[MAINT REFRESH] Protecting in-progress ${m.checkType} check (started ${schedDateStr})`);
          return false; // Don't delete
        }
      }
      return true; // Delete
    });

    if (toDelete.length > 0) {
      const deleteIds = toDelete.map(m => m.id);
      await RecurringMaintenance.destroy({
        where: { id: { [Op.in]: deleteIds } }
      });
      console.log(`[MAINT REFRESH] Deleted ${toDelete.length} existing maintenance records`);
    } else {
      console.log(`[MAINT REFRESH] No records to delete (all protected)`);
    }
  } catch (deleteErr) {
    console.error(`[MAINT REFRESH] Error deleting maintenance:`, deleteErr.message);
  }

  try {
    console.log(`[MAINT REFRESH] Calling createAutoScheduledMaintenance...`);
    // Pass gameNow to avoid additional DB query
    const created = await createAutoScheduledMaintenance(aircraftId, enabledChecks, worldId, gameNow);
    console.log(`[MAINT REFRESH] Created ${created.length} new maintenance records`);
    return created;
  } catch (createErr) {
    console.error(`[MAINT REFRESH] Error creating maintenance:`, createErr.message);
    console.error(createErr.stack);
    return [];
  }
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
 * EFFICIENT: Position check RIGHT BEFORE the flight starts when possible
 * Returns { success: boolean, newSlot: string | null, error: string | null, deleted: boolean }
 */
async function attemptMaintenanceReschedule(maintenanceId, aircraftId, flightStart, flightEnd) {
  const maint = await RecurringMaintenance.findByPk(maintenanceId);
  if (!maint) return { success: false, error: 'Maintenance not found' };

  const duration = maint.duration;
  const scheduledDate = maint.scheduledDate;
  const checkType = maint.checkType;

  // Get aircraft to check expiry dates
  const aircraft = await UserAircraft.findByPk(aircraftId);
  if (!aircraft) return { success: false, error: 'Aircraft not found' };

  // For daily checks - check if we're still covered by a previous day's check
  // Daily checks are valid for check day + next day, so we can delete this one if yesterday has coverage
  if (checkType === 'daily') {
    const yesterday = new Date(scheduledDate + 'T00:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const yesterdayCheck = await RecurringMaintenance.findOne({
      where: { aircraftId, checkType: 'daily', scheduledDate: yesterdayStr, status: 'active' }
    });

    if (yesterdayCheck) {
      // We have coverage from yesterday - just delete this redundant check
      await maint.destroy();
      console.log(`[MAINT] Deleted redundant daily check on ${scheduledDate} - covered by ${yesterdayStr}`);
      return { success: true, newSlot: 'deleted (covered by previous day)', deleted: true };
    }
  }

  // Get all busy slots on this date
  const flightSlots = await getFlightSlotsForDate(aircraftId, scheduledDate);
  const allBusy = [...flightSlots, { start: flightStart, end: flightEnd }];

  // Get other maintenance on this date (excluding current one)
  const otherMaint = await RecurringMaintenance.findAll({
    where: { aircraftId, scheduledDate, status: 'active', id: { [Op.ne]: maintenanceId } }
  });
  for (const m of otherMaint) {
    const [h, min] = m.startTime.split(':').map(Number);
    allBusy.push({ start: h * 60 + min, end: h * 60 + min + m.duration });
  }

  allBusy.sort((a, b) => a.start - b.start);

  // Helper to check if a time slot is available
  const isSlotFree = (start, end) => {
    for (const busy of allBusy) {
      if (start < busy.end && end > busy.start) return false;
    }
    return true;
  };

  // PRIORITY 1: Position check to END right when the flight starts (most efficient)
  const efficientStart = flightStart - duration;
  if (efficientStart >= 0 && isSlotFree(efficientStart, flightStart)) {
    const newTime = `${Math.floor(efficientStart / 60).toString().padStart(2, '0')}:${(efficientStart % 60).toString().padStart(2, '0')}`;
    await maint.update({ startTime: newTime });
    console.log(`[MAINT] Moved ${checkType} check to ${newTime} (right before flight)`);
    return { success: true, newSlot: newTime };
  }

  // PRIORITY 2: Find the largest gap between busy periods and fit the check there
  const gaps = [];
  let lastEnd = 0;
  for (const busy of allBusy) {
    if (busy.start > lastEnd) {
      gaps.push({ start: lastEnd, end: busy.start, size: busy.start - lastEnd });
    }
    lastEnd = Math.max(lastEnd, busy.end);
  }
  // Gap at end of day
  if (lastEnd < 1440) {
    gaps.push({ start: lastEnd, end: 1440, size: 1440 - lastEnd });
  }

  // Sort gaps by size (prefer larger gaps) and find one that fits
  gaps.sort((a, b) => b.size - a.size);
  for (const gap of gaps) {
    if (gap.size >= duration) {
      // Position at the END of the gap (right before next flight)
      const start = gap.end - duration;
      const newTime = `${Math.floor(start / 60).toString().padStart(2, '0')}:${(start % 60).toString().padStart(2, '0')}`;
      await maint.update({ startTime: newTime });
      console.log(`[MAINT] Moved ${checkType} check to ${newTime} (gap before next activity)`);
      return { success: true, newSlot: newTime };
    }
  }

  // PRIORITY 3: For daily checks, try to delete and rely on next day's check
  if (checkType === 'daily') {
    const tomorrow = new Date(scheduledDate + 'T00:00:00');
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Check if tomorrow already has a daily check scheduled
    const tomorrowCheck = await RecurringMaintenance.findOne({
      where: { aircraftId, checkType: 'daily', scheduledDate: tomorrowStr, status: 'active' }
    });

    if (tomorrowCheck) {
      // Tomorrow has a check - we can delete this one
      await maint.destroy();
      console.log(`[MAINT] Deleted daily check on ${scheduledDate} - will use ${tomorrowStr} check`);
      return { success: true, newSlot: 'deleted (using next day)', deleted: true };
    }

    // Create a check for tomorrow instead
    const tomorrowSlot = await findAvailableSlotOnDate(aircraftId, tomorrowStr, duration, checkType);
    if (tomorrowSlot) {
      await maint.update({ scheduledDate: tomorrowStr, startTime: tomorrowSlot });
      console.log(`[MAINT] Moved ${checkType} check to ${tomorrowStr} @ ${tomorrowSlot}`);
      return { success: true, newSlot: `${tomorrowStr} @ ${tomorrowSlot}` };
    }
  }

  // PRIORITY 4: Try other days if check won't expire (for non-daily checks)
  const intervalDays = aircraft[`${checkType === 'daily' ? '' : checkType.toLowerCase()}CheckIntervalDays`] || CHECK_INTERVALS[checkType];
  const lastCheckField = checkType === 'daily' ? 'lastDailyCheckDate' : `last${checkType}CheckDate`;
  const lastCheck = aircraft[lastCheckField];

  if (lastCheck && scheduledDate) {
    const expiryDate = new Date(lastCheck);
    expiryDate.setDate(expiryDate.getDate() + intervalDays);
    const maintDate = new Date(scheduledDate + 'T00:00:00');
    const daysUntilExpiry = Math.floor((expiryDate - maintDate) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry > 1) {
      for (let dayOffset = 1; dayOffset <= Math.min(daysUntilExpiry, 7); dayOffset++) {
        const tryDate = new Date(maintDate);
        tryDate.setDate(tryDate.getDate() + dayOffset);
        const tryDateStr = tryDate.toISOString().split('T')[0];

        if (tryDateStr === scheduledDate || tryDate > expiryDate) continue;

        const slot = await findAvailableSlotOnDate(aircraftId, tryDateStr, duration, checkType);
        if (slot) {
          await maint.update({ scheduledDate: tryDateStr, startTime: slot });
          return { success: true, newSlot: `${tryDateStr} @ ${slot}` };
        }
      }
    }
  }

  // Check cannot be moved without expiring
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

    // Fetch ALL maintenance for ALL aircraft in a single query (avoid N+1)
    const aircraftIds = fleet.map(a => a.id);
    let allMaintenance = [];
    if (aircraftIds.length > 0) {
      allMaintenance = await RecurringMaintenance.findAll({
        where: { aircraftId: { [Op.in]: aircraftIds } }
      });
    }

    // Group maintenance by aircraftId for O(1) lookup
    const maintenanceByAircraft = {};
    for (const m of allMaintenance) {
      if (!maintenanceByAircraft[m.aircraftId]) {
        maintenanceByAircraft[m.aircraftId] = [];
      }
      maintenanceByAircraft[m.aircraftId].push(m);
    }

    // Attach maintenance to each aircraft
    const fleetWithMaintenance = fleet.map(aircraft => {
      const aircraftJson = aircraft.toJSON();
      aircraftJson.recurringMaintenance = maintenanceByAircraft[aircraft.id] || [];
      return aircraftJson;
    });

    res.json(fleetWithMaintenance);
  } catch (error) {
    console.error('Error fetching fleet:', error);
    res.status(500).json({ error: 'Failed to fetch fleet', details: error.message });
  }
});

/**
 * Get detailed aircraft info including routes and maintenance
 */
router.get('/:aircraftId/details', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(400).json({ error: 'No active world selected' });
    }

    const { aircraftId } = req.params;

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

    // Get aircraft with its routes
    const aircraft = await UserAircraft.findOne({
      where: { id: aircraftId, worldMembershipId: membership.id },
      include: [{ model: Aircraft, as: 'aircraft' }]
    });

    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    // Get routes assigned to this aircraft
    const routes = await Route.findAll({
      where: {
        assignedAircraftId: aircraftId,
        worldMembershipId: membership.id
      },
      include: [
        { model: Airport, as: 'departureAirport', attributes: ['icaoCode', 'name'] },
        { model: Airport, as: 'arrivalAirport', attributes: ['icaoCode', 'name'] }
      ],
      order: [['totalRevenue', 'DESC']]
    });

    // Calculate profit for each route
    const routesWithProfit = routes.map(route => {
      const totalRevenue = parseFloat(route.totalRevenue) || 0;
      const totalCosts = parseFloat(route.totalCosts) || 0;
      const profit = totalRevenue - totalCosts;
      const totalFlights = route.totalFlights || 0;
      const profitPerFlight = totalFlights > 0 ? profit / totalFlights : 0;

      return {
        id: route.id,
        routeNumber: route.routeNumber,
        origin: route.departureAirport?.icaoCode || 'N/A',
        destination: route.arrivalAirport?.icaoCode || 'N/A',
        totalRevenue,
        totalCosts,
        profit,
        totalFlights,
        profitPerFlight,
        isActive: route.isActive
      };
    });

    // Sort to find most and least profitable
    const activeRoutes = routesWithProfit.filter(r => r.isActive && r.totalFlights > 0);
    const sortedByProfit = [...activeRoutes].sort((a, b) => b.profit - a.profit);

    const mostProfitable = sortedByProfit.length > 0 ? sortedByProfit[0] : null;
    const leastProfitable = sortedByProfit.length > 0 ? sortedByProfit[sortedByProfit.length - 1] : null;

    // Calculate next C and D check dates
    const lastCCheck = aircraft.lastCCheckDate ? new Date(aircraft.lastCCheckDate) : null;
    const lastDCheck = aircraft.lastDCheckDate ? new Date(aircraft.lastDCheckDate) : null;
    const cCheckInterval = aircraft.cCheckIntervalDays || 730; // Default 2 years
    const dCheckInterval = aircraft.dCheckIntervalDays || 2190; // Default 6 years

    let nextCCheck = null;
    let nextDCheck = null;

    if (lastCCheck) {
      nextCCheck = new Date(lastCCheck);
      nextCCheck.setDate(nextCCheck.getDate() + cCheckInterval);
    }

    if (lastDCheck) {
      nextDCheck = new Date(lastDCheck);
      nextDCheck.setDate(nextDCheck.getDate() + dCheckInterval);
    }

    res.json({
      routes: routesWithProfit,
      routeCount: routes.length,
      activeRouteCount: activeRoutes.length,
      mostProfitable,
      leastProfitable,
      maintenance: {
        lastCCheck: aircraft.lastCCheckDate,
        lastDCheck: aircraft.lastDCheckDate,
        nextCCheck: nextCCheck ? nextCCheck.toISOString() : null,
        nextDCheck: nextDCheck ? nextDCheck.toISOString() : null,
        cCheckIntervalDays: cCheckInterval,
        dCheckIntervalDays: dCheckInterval
      }
    });
  } catch (error) {
    console.error('Error fetching aircraft details:', error);
    res.status(500).json({ error: 'Failed to fetch aircraft details', details: error.message });
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
      autoScheduleWeekly,
      autoScheduleA,
      autoScheduleC,
      autoScheduleD,
      // Player-to-player listing
      playerListingId
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
      // Daily check: EXPIRED on delivery (3-5 days ago, interval is 2 days)
      // Aircraft needs a daily check before it can fly
      lastDailyCheckDate: new Date(now.getTime() - ((3 + Math.floor(Math.random() * 3)) * 24 * 60 * 60 * 1000)),
      // Weekly check: Valid, done 2-5 days ago (interval is 7-8 days)
      lastWeeklyCheckDate: new Date(now.getTime() - ((2 + Math.floor(Math.random() * 4)) * 24 * 60 * 60 * 1000)),
      // A check: Done at 0 hours (new aircraft or reset on delivery)
      lastACheckDate: new Date(now.getTime() - ((1 + Math.floor(Math.random() * 7)) * 24 * 60 * 60 * 1000)),
      lastACheckHours: 0,
      aCheckIntervalHours: 800 + Math.floor(Math.random() * 200), // 800-1000 hrs
      // Auto-schedule preferences (default to false - user enables per aircraft)
      autoScheduleDaily: autoScheduleDaily === true,
      autoScheduleWeekly: autoScheduleWeekly === true,
      autoScheduleA: autoScheduleA === true,
      autoScheduleC: autoScheduleC === true,
      autoScheduleD: autoScheduleD === true
    });

    // Create auto-scheduled maintenance for explicitly enabled check types
    const autoCheckTypes = [];
    if (autoScheduleDaily === true) autoCheckTypes.push('daily');
    if (autoScheduleWeekly === true) autoCheckTypes.push('weekly');
    if (autoScheduleA === true) autoCheckTypes.push('A');
    if (autoScheduleC === true) autoCheckTypes.push('C');
    if (autoScheduleD === true) autoCheckTypes.push('D');

    if (autoCheckTypes.length > 0) {
      await createAutoScheduledMaintenance(userAircraft.id, autoCheckTypes, activeWorldId);
    }

    // Deduct from balance
    membership.balance -= price;
    await membership.save();

    // Handle player-to-player sale: credit seller and notify
    if (playerListingId) {
      try {
        const sellerAircraft = await UserAircraft.findByPk(playerListingId, {
          include: [{ model: WorldMembership, as: 'membership' }]
        });
        if (sellerAircraft && sellerAircraft.status === 'listed_sale') {
          const sellerMembership = sellerAircraft.membership;
          // Credit seller
          sellerMembership.balance = parseFloat(sellerMembership.balance) + price;
          await sellerMembership.save();
          // Notify seller
          await Notification.create({
            worldMembershipId: sellerMembership.id,
            type: 'aircraft_sold',
            icon: 'plane',
            title: 'Aircraft Sold',
            message: `${sellerAircraft.registration} has been purchased by another airline for $${Number(price).toLocaleString('en-US')}`,
            priority: 2,
            gameTime: now
          });
          // Remove seller's aircraft
          await sellerAircraft.destroy();
        }
      } catch (sellerErr) {
        console.error('Error processing seller side of player sale:', sellerErr);
      }
    }

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
      autoScheduleWeekly,
      autoScheduleA,
      autoScheduleC,
      autoScheduleD,
      // Player-to-player listing
      playerListingId
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
      // Daily check: EXPIRED on delivery (3-5 days ago, interval is 2 days)
      // Aircraft needs a daily check before it can fly
      lastDailyCheckDate: new Date(now.getTime() - ((3 + Math.floor(Math.random() * 3)) * 24 * 60 * 60 * 1000)),
      // Weekly check: Valid, done 2-5 days ago (interval is 7-8 days)
      lastWeeklyCheckDate: new Date(now.getTime() - ((2 + Math.floor(Math.random() * 4)) * 24 * 60 * 60 * 1000)),
      // A check: Done at 0 hours (new aircraft or reset on delivery)
      lastACheckDate: new Date(now.getTime() - ((1 + Math.floor(Math.random() * 7)) * 24 * 60 * 60 * 1000)),
      lastACheckHours: 0,
      aCheckIntervalHours: 800 + Math.floor(Math.random() * 200), // 800-1000 hrs
      // Auto-schedule preferences (default to false - user enables per aircraft)
      autoScheduleDaily: autoScheduleDaily === true,
      autoScheduleWeekly: autoScheduleWeekly === true,
      autoScheduleA: autoScheduleA === true,
      autoScheduleC: autoScheduleC === true,
      autoScheduleD: autoScheduleD === true
    });

    // Create auto-scheduled maintenance for explicitly enabled check types
    const autoCheckTypes = [];
    if (autoScheduleDaily === true) autoCheckTypes.push('daily');
    if (autoScheduleWeekly === true) autoCheckTypes.push('weekly');
    if (autoScheduleA === true) autoCheckTypes.push('A');
    if (autoScheduleC === true) autoCheckTypes.push('C');
    if (autoScheduleD === true) autoCheckTypes.push('D');

    if (autoCheckTypes.length > 0) {
      await createAutoScheduledMaintenance(userAircraft.id, autoCheckTypes, activeWorldId);
    }

    // Deduct first month's payment
    membership.balance -= monthlyPayment;
    await membership.save();

    // Handle player-to-player lease: update owner's aircraft and notify
    if (playerListingId) {
      try {
        const ownerAircraft = await UserAircraft.findByPk(playerListingId, {
          include: [{ model: WorldMembership, as: 'membership' }]
        });
        if (ownerAircraft && ownerAircraft.status === 'listed_lease') {
          const ownerMembership = ownerAircraft.membership;
          const buyerAirlineName = membership.airlineName || 'Another airline';
          // Update owner's aircraft to leased_out + link to lessee
          ownerAircraft.status = 'leased_out';
          ownerAircraft.leaseOutMonthlyRate = monthlyPayment;
          ownerAircraft.leaseOutStartDate = now;
          ownerAircraft.leaseOutEndDate = leaseEnd;
          ownerAircraft.leaseOutTenantName = buyerAirlineName;
          ownerAircraft.playerLesseeAircraftId = userAircraft.id;
          await ownerAircraft.save();
          // Link lessee back to lessor
          userAircraft.playerLessorAircraftId = ownerAircraft.id;
          await userAircraft.save();
          // Credit first month to owner
          ownerMembership.balance = parseFloat(ownerMembership.balance) + monthlyPayment;
          await ownerMembership.save();
          // Notify owner
          await Notification.create({
            worldMembershipId: ownerMembership.id,
            type: 'aircraft_leased_out',
            icon: 'plane',
            title: 'Aircraft Leased Out',
            message: `${ownerAircraft.registration} has been leased by ${buyerAirlineName} at $${Number(monthlyPayment).toLocaleString('en-US')}/mo for ${leaseDurationMonths} months`,
            priority: 2,
            gameTime: now
          });
        }
      } catch (ownerErr) {
        console.error('Error processing owner side of player lease:', ownerErr);
      }
    }

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

    if (!['A', 'C', 'D'].includes(checkType)) {
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
    const now = new Date();
    const updateData = {};

    // Cascading check validation: D → C → A → weekly → daily
    if (checkType === 'A') {
      // A check validates weekly and daily
      updateData.lastACheckDate = now;
      updateData.lastACheckHours = aircraft.totalFlightHours || 0;
      updateData.lastWeeklyCheckDate = now;
      updateData.lastDailyCheckDate = now;
    } else if (checkType === 'C') {
      // C check validates A, weekly, and daily
      updateData.lastCCheckDate = now;
      updateData.lastACheckDate = now;
      updateData.lastACheckHours = aircraft.totalFlightHours || 0;
      updateData.lastWeeklyCheckDate = now;
      updateData.lastDailyCheckDate = now;
    } else if (checkType === 'D') {
      // D check validates C, A, weekly, and daily
      updateData.lastDCheckDate = now;
      updateData.lastCCheckDate = now;
      updateData.lastACheckDate = now;
      updateData.lastACheckHours = aircraft.totalFlightHours || 0;
      updateData.lastWeeklyCheckDate = now;
      updateData.lastDailyCheckDate = now;
    }

    await aircraft.update(updateData);

    res.json({
      message: `${checkType} Check recorded successfully`,
      checkDate: now.toISOString(),
      aircraft: aircraft
    });
  } catch (error) {
    console.error('Error recording maintenance check:', error);
    res.status(500).json({ error: 'Failed to record maintenance check' });
  }
});

/**
 * Perform a maintenance check immediately (mark as complete now)
 */
router.post('/:aircraftId/perform-check', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { aircraftId } = req.params;
    const { checkType } = req.body;

    if (!['daily', 'weekly', 'A', 'C', 'D'].includes(checkType)) {
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
    const now = new Date();
    const updateData = {};

    // Cascading check validation:
    // D → C → A → weekly → daily
    switch (checkType) {
      case 'daily':
        updateData.lastDailyCheckDate = now;
        break;
      case 'weekly':
        // Weekly validates daily
        updateData.lastWeeklyCheckDate = now;
        updateData.lastDailyCheckDate = now;
        break;
      case 'A':
        // A check validates weekly and daily
        updateData.lastACheckDate = now;
        updateData.lastACheckHours = aircraft.totalFlightHours || 0;
        updateData.lastWeeklyCheckDate = now;
        updateData.lastDailyCheckDate = now;
        break;
      case 'C':
        // C check validates A, weekly, and daily
        updateData.lastCCheckDate = now;
        updateData.lastACheckDate = now;
        updateData.lastACheckHours = aircraft.totalFlightHours || 0;
        updateData.lastWeeklyCheckDate = now;
        updateData.lastDailyCheckDate = now;
        break;
      case 'D':
        // D check validates C, A, weekly, and daily
        updateData.lastDCheckDate = now;
        updateData.lastCCheckDate = now;
        updateData.lastACheckDate = now;
        updateData.lastACheckHours = aircraft.totalFlightHours || 0;
        updateData.lastWeeklyCheckDate = now;
        updateData.lastDailyCheckDate = now;
        break;
    }

    await aircraft.update(updateData);

    res.json({
      message: `${checkType} Check performed successfully`,
      checkDate: now.toISOString(),
      flightHours: checkType === 'A' ? (aircraft.totalFlightHours || 0) : undefined,
      aircraft: aircraft
    });
  } catch (error) {
    console.error('Error performing maintenance check:', error);
    res.status(500).json({ error: 'Failed to perform maintenance check' });
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

    if (!checkType || !['daily', 'weekly', 'A', 'C', 'D'].includes(checkType)) {
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
      'weekly': 'autoScheduleWeekly',
      'A': 'autoScheduleA',
      'C': 'autoScheduleC',
      'D': 'autoScheduleD'
    };

    const updateField = fieldMap[checkType];
    await aircraft.update({ [updateField]: enabled });

    // If enabled, create auto-scheduled maintenance; if disabled, remove it
    // Wrap in try-catch so preference save succeeds even if scheduling fails
    let schedulingError = null;
    if (enabled) {
      try {
        await createAutoScheduledMaintenance(aircraftId, [checkType], activeWorldId);
      } catch (schedError) {
        console.error(`Error creating auto-scheduled maintenance for ${checkType}:`, schedError);
        schedulingError = schedError.message;
      }
    } else {
      try {
        await removeAutoScheduledMaintenance(aircraftId, [checkType]);
      } catch (removeError) {
        console.error(`Error removing auto-scheduled maintenance for ${checkType}:`, removeError);
        // Non-critical, don't report as error
      }
    }

    res.json({
      message: `Auto-schedule for ${checkType} check ${enabled ? 'enabled' : 'disabled'}`,
      checkType,
      enabled,
      aircraft: aircraft,
      schedulingWarning: schedulingError
    });
  } catch (error) {
    console.error('Error updating auto-schedule:', error);
    res.status(500).json({ error: 'Failed to update auto-schedule preference' });
  }
});

/**
 * Batch update auto-schedule preferences for an aircraft (faster than individual updates)
 */
router.put('/:aircraftId/auto-schedule/batch', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { aircraftId } = req.params;
    const { preferences } = req.body; // { daily: true, weekly: false, A: true, C: true, D: false }

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ error: 'preferences object required' });
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

    const aircraft = await UserAircraft.findOne({
      where: { id: aircraftId, worldMembershipId: membership.id }
    });

    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    // Get world time to check for expired checks
    const world = await World.findByPk(activeWorldId);
    const gameNow = world ? new Date(world.currentTime) : new Date();

    // Build update object and track which checks to enable/disable
    const fieldMap = {
      'daily': 'autoScheduleDaily',
      'weekly': 'autoScheduleWeekly',
      'A': 'autoScheduleA',
      'C': 'autoScheduleC',
      'D': 'autoScheduleD'
    };

    // Check expiry helper function
    const isCheckExpired = (checkType) => {
      if (checkType === 'daily') {
        if (!aircraft.lastDailyCheckDate) return true;
        const expiry = new Date(aircraft.lastDailyCheckDate);
        expiry.setDate(expiry.getDate() + 1); // Daily valid for check day + next day
        expiry.setUTCHours(23, 59, 59, 999);
        return expiry <= gameNow;
      } else if (checkType === 'weekly') {
        if (!aircraft.lastWeeklyCheckDate) return true;
        const expiry = new Date(aircraft.lastWeeklyCheckDate);
        expiry.setDate(expiry.getDate() + 8); // Weekly valid for ~8 days
        return expiry <= gameNow;
      } else if (checkType === 'A') {
        // If no A check has ever been done, it's expired
        if (!aircraft.lastACheckDate) return true;
        const lastACheckHours = parseFloat(aircraft.lastACheckHours) || 0;
        const currentFlightHours = parseFloat(aircraft.totalFlightHours) || 0;
        const intervalHours = aircraft.aCheckIntervalHours || 800;
        return (currentFlightHours - lastACheckHours) >= intervalHours;
      } else if (checkType === 'C') {
        if (!aircraft.lastCCheckDate) return true;
        const expiry = new Date(aircraft.lastCCheckDate);
        expiry.setDate(expiry.getDate() + (aircraft.cCheckIntervalDays || 730));
        return expiry <= gameNow;
      } else if (checkType === 'D') {
        if (!aircraft.lastDCheckDate) return true;
        const expiry = new Date(aircraft.lastDCheckDate);
        expiry.setDate(expiry.getDate() + (aircraft.dCheckIntervalDays || 2190));
        return expiry <= gameNow;
      }
      return false;
    };

    const updateFields = {};
    const enabledChecks = [];
    const disabledChecks = [];
    const expiredChecks = []; // Checks that can't be enabled because they're expired

    console.log(`[BATCH AUTO-SCHEDULE] ${aircraft.registration}: Received preferences:`, preferences);
    console.log(`[BATCH AUTO-SCHEDULE] ${aircraft.registration}: gameNow=${gameNow.toISOString()}`);

    for (const [checkType, enabled] of Object.entries(preferences)) {
      if (fieldMap[checkType] && typeof enabled === 'boolean') {
        const expired = enabled && isCheckExpired(checkType);
        console.log(`[BATCH AUTO-SCHEDULE] ${aircraft.registration}: ${checkType} enabled=${enabled}, expired=${expired}`);
        if (expired) {
          // Can't enable auto-schedule for an expired check
          expiredChecks.push(checkType);
          // Don't add to updateFields - keep the existing value
        } else {
          updateFields[fieldMap[checkType]] = enabled;
          if (enabled) {
            enabledChecks.push(checkType);
          } else {
            disabledChecks.push(checkType);
          }
        }
      }
    }

    // If any checks were rejected due to expiry, return error
    if (expiredChecks.length > 0) {
      return res.status(400).json({
        error: 'Cannot enable auto-schedule for expired checks',
        expiredChecks,
        message: `Perform ${expiredChecks.join(', ')} check(s) first before enabling auto-schedule`
      });
    }

    // Single database update for all preferences
    console.log(`[BATCH AUTO-SCHEDULE] ${aircraft.registration}: Updating DB with:`, updateFields);
    await aircraft.update(updateFields);

    // Re-fetch to verify update was persisted
    const verifyAircraft = await UserAircraft.findByPk(aircraftId);
    console.log(`[BATCH AUTO-SCHEDULE] ${aircraft.registration}: DB verification - autoScheduleDaily=${verifyAircraft.autoScheduleDaily}, autoScheduleWeekly=${verifyAircraft.autoScheduleWeekly}, autoScheduleA=${verifyAircraft.autoScheduleA}`);
    console.log(`[BATCH AUTO-SCHEDULE] ${aircraft.registration}: enabledChecks=${enabledChecks.join(',')}, disabledChecks=${disabledChecks.join(',')}`);

    // Run scheduling - use refresh which deletes then creates to avoid duplicates
    if (enabledChecks.length > 0) {
      try {
        console.log(`[BATCH AUTO-SCHEDULE] ${aircraft.registration}: Calling refreshAutoScheduledMaintenance...`);
        const created = await refreshAutoScheduledMaintenance(aircraftId, activeWorldId);
        console.log(`[BATCH AUTO-SCHEDULE] ${aircraft.registration}: Created ${created.length} maintenance records`);
      } catch (schedError) {
        console.error('Error creating auto-scheduled maintenance:', schedError);
        console.error(schedError.stack);
      }
    }

    if (disabledChecks.length > 0) {
      try {
        await removeAutoScheduledMaintenance(aircraftId, disabledChecks);
      } catch (removeError) {
        console.error('Error removing auto-scheduled maintenance:', removeError);
      }
    }

    res.json({
      message: 'Auto-schedule preferences updated',
      preferences: updateFields,
      enabledChecks,
      disabledChecks
    });
  } catch (error) {
    console.error('Error batch updating auto-schedule:', error);
    res.status(500).json({ error: 'Failed to update auto-schedule preferences' });
  }
});

/**
 * Global maintenance settings - Apply auto-schedule settings to ALL aircraft
 */
router.post('/global-maintenance-settings', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const {
      autoScheduleDaily,
      autoScheduleWeekly,
      autoScheduleA,
      autoScheduleC,
      autoScheduleD
    } = req.body;

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

    // Get world time for expiry calculations
    const world = await World.findByPk(activeWorldId);
    const gameNow = world ? new Date(world.currentTime) : new Date();

    // Get all aircraft for this membership
    const allAircraft = await UserAircraft.findAll({
      where: { worldMembershipId: membership.id }
    });

    if (allAircraft.length === 0) {
      return res.status(404).json({ error: 'No aircraft found' });
    }

    // Check expiry helper function for an aircraft
    const isCheckExpired = (aircraft, checkType) => {
      if (checkType === 'daily') {
        if (!aircraft.lastDailyCheckDate) return true;
        const expiry = new Date(aircraft.lastDailyCheckDate);
        expiry.setDate(expiry.getDate() + 1);
        expiry.setUTCHours(23, 59, 59, 999);
        return expiry <= gameNow;
      } else if (checkType === 'weekly') {
        if (!aircraft.lastWeeklyCheckDate) return true;
        const expiry = new Date(aircraft.lastWeeklyCheckDate);
        expiry.setDate(expiry.getDate() + 8);
        return expiry <= gameNow;
      } else if (checkType === 'A') {
        if (!aircraft.lastACheckDate) return true;
        const lastACheckHours = parseFloat(aircraft.lastACheckHours) || 0;
        const currentFlightHours = parseFloat(aircraft.totalFlightHours) || 0;
        const intervalHours = aircraft.aCheckIntervalHours || 800;
        return (currentFlightHours - lastACheckHours) >= intervalHours;
      } else if (checkType === 'C') {
        if (!aircraft.lastCCheckDate) return true;
        const expiry = new Date(aircraft.lastCCheckDate);
        expiry.setDate(expiry.getDate() + (aircraft.cCheckIntervalDays || 730));
        return expiry <= gameNow;
      } else if (checkType === 'D') {
        if (!aircraft.lastDCheckDate) return true;
        const expiry = new Date(aircraft.lastDCheckDate);
        expiry.setDate(expiry.getDate() + (aircraft.dCheckIntervalDays || 2190));
        return expiry <= gameNow;
      }
      return false;
    };

    // Check hierarchy: D > C > A > weekly > daily (heavier checks include lighter ones)
    const checkHierarchy = ['D', 'C', 'A', 'weekly', 'daily'];

    // Map of which checks are being enabled
    const enabledChecks = [];
    if (autoScheduleDaily) enabledChecks.push('daily');
    if (autoScheduleWeekly) enabledChecks.push('weekly');
    if (autoScheduleA) enabledChecks.push('A');
    if (autoScheduleC) enabledChecks.push('C');
    if (autoScheduleD) enabledChecks.push('D');

    // Update all aircraft with the new settings
    const updateFields = {
      autoScheduleDaily: !!autoScheduleDaily,
      autoScheduleWeekly: !!autoScheduleWeekly,
      autoScheduleA: !!autoScheduleA,
      autoScheduleC: !!autoScheduleC,
      autoScheduleD: !!autoScheduleD
    };

    await UserAircraft.update(updateFields, {
      where: { worldMembershipId: membership.id }
    });

    // First, refresh auto-scheduled maintenance for all aircraft
    // Then schedule immediate maintenance for expired checks (so it doesn't get deleted by refresh)
    let maintenanceScheduled = 0;
    let immediateMaintenanceScheduled = 0;
    const batchSize = 5;

    for (let i = 0; i < allAircraft.length; i += batchSize) {
      const batch = allAircraft.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (aircraft) => {
          try {
            // First: Refresh auto-scheduled maintenance (this will schedule future checks)
            const result = await refreshAutoScheduledMaintenance(aircraft.id, activeWorldId);
            const refreshCount = Array.isArray(result) ? result.length : 0;

            // Second: Find the heaviest expired check that is being enabled
            let heaviestExpiredCheck = null;
            for (const ct of checkHierarchy) {
              if (!enabledChecks.includes(ct)) continue;
              if (isCheckExpired(aircraft, ct)) {
                heaviestExpiredCheck = ct;
                break;
              }
            }

            let immediateCount = 0;

            // If there's an expired check, schedule it immediately (2 hours from now)
            // This must happen AFTER refresh so it doesn't get deleted
            if (heaviestExpiredCheck) {
              const immediateStart = new Date(gameNow.getTime() + 2 * 60 * 60 * 1000);
              const immediateStartTime = `${String(immediateStart.getUTCHours()).padStart(2, '0')}:${String(immediateStart.getUTCMinutes()).padStart(2, '0')}`;
              const immediateDate = immediateStart.toISOString().split('T')[0];
              const dayOfWeek = immediateStart.getUTCDay();
              const duration = CHECK_DURATIONS[heaviestExpiredCheck];

              // Check if there's already a maintenance scheduled for this check type within the next 7 days
              const sevenDaysFromNow = new Date(gameNow);
              sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
              const existingMaint = await RecurringMaintenance.findOne({
                where: {
                  aircraftId: aircraft.id,
                  checkType: heaviestExpiredCheck,
                  scheduledDate: {
                    [Op.between]: [gameNow.toISOString().split('T')[0], sevenDaysFromNow.toISOString().split('T')[0]]
                  },
                  status: 'active'
                }
              });

              if (!existingMaint) {
                // Create immediate maintenance
                await RecurringMaintenance.create({
                  aircraftId: aircraft.id,
                  checkType: heaviestExpiredCheck,
                  dayOfWeek,
                  scheduledDate: immediateDate,
                  startTime: immediateStartTime,
                  duration,
                  status: 'active'
                });
                immediateCount = 1;
                console.log(`[GLOBAL MAINT] Scheduled immediate ${heaviestExpiredCheck} check for ${aircraft.registration} at ${immediateStartTime} on ${immediateDate}`);
              }
            }

            return { immediate: immediateCount, refresh: refreshCount };
          } catch (err) {
            console.error(`Error processing maintenance for aircraft ${aircraft.id}:`, err);
            return { immediate: 0, refresh: 0 };
          }
        })
      );
      immediateMaintenanceScheduled += results.reduce((sum, r) => sum + r.immediate, 0);
      maintenanceScheduled += results.reduce((sum, r) => sum + r.refresh, 0);
    }

    res.json({
      message: 'Global maintenance settings applied',
      updatedCount: allAircraft.length,
      maintenanceScheduled: maintenanceScheduled + immediateMaintenanceScheduled,
      immediateMaintenanceScheduled,
      settings: updateFields
    });
  } catch (error) {
    console.error('Error applying global maintenance settings:', error);
    res.status(500).json({ error: 'Failed to apply global maintenance settings' });
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
      autoScheduleWeekly: aircraft.autoScheduleWeekly || false,
      autoScheduleA: aircraft.autoScheduleA || false,
      autoScheduleC: aircraft.autoScheduleC || false,
      autoScheduleD: aircraft.autoScheduleD || false
    });
  } catch (error) {
    console.error('Error fetching auto-schedule preferences:', error);
    res.status(500).json({ error: 'Failed to fetch auto-schedule preferences' });
  }
});

/**
 * POST /:aircraftId/optimize-maintenance
 * Re-optimize all maintenance positions for an aircraft
 * Moves daily checks to right before flights for efficiency
 */
router.post('/:aircraftId/optimize-maintenance', async (req, res) => {
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

    // Get all scheduled maintenance dates for this aircraft
    const maintenanceRecords = await RecurringMaintenance.findAll({
      where: { aircraftId, status: 'active' },
      attributes: ['scheduledDate']
    });

    const dates = [...new Set(maintenanceRecords.map(m => m.scheduledDate).filter(Boolean))];

    if (dates.length === 0) {
      return res.json({ message: 'No maintenance to optimize', optimized: [] });
    }

    // Run optimization
    const optimized = await optimizeMaintenanceForDates(aircraftId, dates);

    res.json({
      message: `Optimized maintenance on ${dates.length} dates`,
      optimized
    });
  } catch (error) {
    console.error('Error optimizing maintenance:', error);
    res.status(500).json({ error: 'Failed to optimize maintenance' });
  }
});

/**
 * Optimize maintenance positions for given dates
 * Called after a flight is scheduled to reposition checks efficiently
 * Places daily checks RIGHT BEFORE the first flight DEPARTURE of the day
 * If a date only has arriving flights (no departures), move the check to the departure date
 */
async function optimizeMaintenanceForDates(aircraftId, dates) {
  const optimized = [];

  for (const dateStr of dates) {
    // Get all daily checks on this date
    const dailyChecks = await RecurringMaintenance.findAll({
      where: { aircraftId, scheduledDate: dateStr, checkType: 'daily', status: 'active' }
    });

    if (dailyChecks.length === 0) continue;

    // Get flights that DEPART on this date (not just arrive)
    const departingFlights = await ScheduledFlight.findAll({
      where: {
        aircraftId,
        scheduledDate: dateStr  // Only flights that DEPART on this date
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

    // Check if there are only arriving flights (from previous day) on this date
    const arrivingOnlyFlights = await ScheduledFlight.findAll({
      where: {
        aircraftId,
        arrivalDate: dateStr,
        scheduledDate: { [Op.ne]: dateStr }  // Departed on different day
      }
    });

    // If NO departing flights on this date, but there ARE arriving flights
    // This means the daily check should be on the departure date instead
    if (departingFlights.length === 0 && arrivingOnlyFlights.length > 0) {
      // Move daily checks to the departure date of the arriving flight(s)
      for (const check of dailyChecks) {
        // Get the departure date from the arriving flight
        const depDate = arrivingOnlyFlights[0].scheduledDate;

        // Check if there's already a daily check on the departure date
        const existingOnDepDate = await RecurringMaintenance.findOne({
          where: { aircraftId, scheduledDate: depDate, checkType: 'daily', status: 'active' }
        });

        if (existingOnDepDate) {
          // Already have a check on the departure date, remove this redundant one
          await check.update({ status: 'inactive' });
          optimized.push({
            date: dateStr,
            checkType: 'daily',
            action: 'removed',
            reason: `Covered by check on ${depDate}`
          });
          console.log(`[OPTIMIZE] Removed redundant daily check on ${dateStr} (covered by ${depDate})`);
        } else {
          // Move this check to the departure date
          await check.update({ scheduledDate: depDate });
          optimized.push({
            date: dateStr,
            checkType: 'daily',
            action: 'moved',
            newDate: depDate,
            reason: 'Moved to actual departure date'
          });
          console.log(`[OPTIMIZE] Moved daily check from ${dateStr} to ${depDate} (actual departure date)`);

          // Now optimize the check on its new date
          dates.push(depDate); // Add to dates to process
        }
      }
      continue;
    }

    // If we have departing flights, optimize the check position
    if (departingFlights.length === 0) continue;

    // Calculate pre-flight times for departing flights
    const departureSlots = [];
    for (const flight of departingFlights) {
      const acType = flight.aircraft?.aircraft?.type || 'Narrowbody';
      const pax = flight.aircraft?.aircraft?.passengerCapacity || 150;
      const dist = flight.route?.distance || 0;

      // Pre-flight calculation
      let catering = pax >= 50 && acType !== 'Cargo' ? (pax < 100 ? 5 : pax < 200 ? 10 : 15) : 0;
      let boarding = acType !== 'Cargo' ? (pax < 50 ? 10 : pax < 100 ? 15 : pax < 200 ? 20 : pax < 300 ? 25 : 35) : 0;
      let fuelling = dist < 500 ? 10 : dist < 1500 ? 15 : dist < 3000 ? 20 : 25;
      const preFlight = Math.max(catering + boarding, fuelling);

      const [depH, depM] = flight.departureTime.split(':').map(Number);
      const preFlightStart = depH * 60 + depM - preFlight;

      departureSlots.push({
        start: Math.max(0, preFlightStart),
        departureTime: depH * 60 + depM,
        preFlight
      });
    }

    // Sort by earliest pre-flight start
    departureSlots.sort((a, b) => a.start - b.start);

    // Get all flight activity on this date (for conflict checking)
    const allFlights = await getFlightSlotsForDate(aircraftId, dateStr);

    // Get other maintenance (non-daily) on this date
    const otherMaint = await RecurringMaintenance.findAll({
      where: {
        aircraftId,
        scheduledDate: dateStr,
        checkType: { [Op.ne]: 'daily' },
        status: 'active'
      }
    });
    const otherMaintSlots = otherMaint.map(m => {
      const [h, min] = m.startTime.split(':').map(Number);
      return { start: h * 60 + min, end: h * 60 + min + m.duration };
    });

    // Position check to END right when pre-flight starts (before first departure)
    const firstPreFlightStart = departureSlots[0].start;

    // For each daily check, try to position it right before the first departure's pre-flight
    for (const check of dailyChecks) {
      const duration = check.duration;
      const optimalStart = firstPreFlightStart - duration;

      // Check if this slot is actually free
      if (optimalStart < 0) continue; // Can't fit before midnight

      const allBusy = [...allFlights, ...otherMaintSlots];
      let isFree = true;
      for (const busy of allBusy) {
        if (optimalStart < busy.end && (optimalStart + duration) > busy.start) {
          isFree = false;
          break;
        }
      }

      if (isFree) {
        const newTime = `${Math.floor(optimalStart / 60).toString().padStart(2, '0')}:${(optimalStart % 60).toString().padStart(2, '0')}`;
        const oldTime = check.startTime.substring(0, 5);

        if (newTime !== oldTime) {
          await check.update({ startTime: newTime });
          optimized.push({ date: dateStr, checkType: 'daily', oldTime, newTime });
          console.log(`[OPTIMIZE] Moved daily check on ${dateStr} from ${oldTime} to ${newTime} (right before departure pre-flight)`);
        }
      }
    }
  }

  return optimized;
}

/**
 * POST /refresh-all-maintenance
 * Manually trigger maintenance refresh for all aircraft with auto-schedule enabled
 * Useful after DB connection issues or to ensure all aircraft have maintenance scheduled
 */
router.post('/refresh-all-maintenance', async (req, res) => {
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

    // Get all aircraft with any auto-schedule enabled
    const aircraftToRefresh = await UserAircraft.findAll({
      where: {
        worldMembershipId: membership.id,
        [Op.or]: [
          { autoScheduleDaily: true },
          { autoScheduleWeekly: true },
          { autoScheduleA: true },
          { autoScheduleC: true },
          { autoScheduleD: true }
        ]
      },
      attributes: ['id', 'registration']
    });

    if (aircraftToRefresh.length === 0) {
      return res.json({ message: 'No aircraft with auto-schedule enabled', refreshed: 0 });
    }

    console.log(`[REFRESH ALL] Starting maintenance refresh for ${aircraftToRefresh.length} aircraft`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Process each aircraft with delay to avoid DB overload
    for (const aircraft of aircraftToRefresh) {
      let retries = 2;
      let success = false;

      while (retries > 0 && !success) {
        try {
          const created = await refreshAutoScheduledMaintenance(aircraft.id, activeWorldId);
          results.push({
            registration: aircraft.registration,
            status: 'success',
            checksScheduled: created.length
          });
          successCount++;
          success = true;
        } catch (err) {
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            results.push({
              registration: aircraft.registration,
              status: 'error',
              error: err.message
            });
            errorCount++;
          }
        }
      }

      // Delay between aircraft
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`[REFRESH ALL] Complete: ${successCount} success, ${errorCount} errors`);

    res.json({
      message: `Refreshed maintenance for ${successCount} aircraft`,
      total: aircraftToRefresh.length,
      success: successCount,
      errors: errorCount,
      results
    });
  } catch (error) {
    console.error('Error refreshing all maintenance:', error);
    res.status(500).json({ error: 'Failed to refresh maintenance' });
  }
});

/**
 * POST /restagger-fleet-maintenance
 * Re-stagger all maintenance checks across the fleet to spread them out
 * Deletes current scheduled maintenance and re-creates with staggered times
 */
router.post('/restagger-fleet-maintenance', async (req, res) => {
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

    // Get all aircraft in the fleet
    const fleetAircraft = await UserAircraft.findAll({
      where: { worldMembershipId: membership.id, status: 'active' },
      include: [{ model: Aircraft, as: 'aircraft' }]
    });

    if (fleetAircraft.length === 0) {
      return res.json({ message: 'No aircraft in fleet', staggered: 0 });
    }

    console.log(`[RESTAGGER] Starting fleet maintenance staggering for ${fleetAircraft.length} aircraft`);

    // For each aircraft, delete existing scheduled maintenance and re-create with staggering
    let totalRescheduled = 0;
    const results = [];

    for (const aircraft of fleetAircraft) {
      // Get enabled check types
      const enabledChecks = [];
      if (aircraft.autoScheduleDaily) enabledChecks.push('daily');
      if (aircraft.autoScheduleWeekly) enabledChecks.push('weekly');
      if (aircraft.autoScheduleA) enabledChecks.push('A');
      if (aircraft.autoScheduleC) enabledChecks.push('C');
      if (aircraft.autoScheduleD) enabledChecks.push('D');

      if (enabledChecks.length === 0) {
        results.push({ registration: aircraft.registration, checks: 0, reason: 'No auto-schedule enabled' });
        continue;
      }

      // Delete existing scheduled maintenance for this aircraft (only auto-scheduled ones)
      const deleted = await RecurringMaintenance.destroy({
        where: {
          aircraftId: aircraft.id,
          checkType: { [Op.in]: enabledChecks },
          status: 'active'
        }
      });

      // Re-create with staggering (the updated findAvailableSlotOnDate will spread them out)
      const created = await createAutoScheduledMaintenance(aircraft.id, enabledChecks, activeWorldId);
      totalRescheduled += created.length;

      results.push({
        registration: aircraft.registration,
        deleted,
        created: created.length,
        checkTypes: enabledChecks
      });

      console.log(`[RESTAGGER] ${aircraft.registration}: deleted ${deleted}, created ${created.length} checks`);
    }

    res.json({
      message: `Fleet maintenance staggered across ${fleetAircraft.length} aircraft`,
      totalRescheduled,
      results
    });
  } catch (error) {
    console.error('Error restaggering fleet maintenance:', error);
    res.status(500).json({ error: 'Failed to restagger fleet maintenance' });
  }
});

/**
 * POST /fix-maintenance-overlaps
 * Find and fix maintenance checks that overlap with flights
 * Either moves them to a non-conflicting time or removes them if no slot available
 */
router.post('/fix-maintenance-overlaps', async (req, res) => {
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

    // Get all aircraft in the fleet
    const fleetAircraft = await UserAircraft.findAll({
      where: { worldMembershipId: membership.id, status: 'active' },
      include: [{ model: Aircraft, as: 'aircraft' }]
    });

    const results = {
      checked: 0,
      overlaps: [],
      fixed: 0,
      removed: 0
    };

    for (const aircraft of fleetAircraft) {
      // Get all scheduled maintenance for this aircraft
      const maintenance = await RecurringMaintenance.findAll({
        where: {
          aircraftId: aircraft.id,
          status: 'active',
          scheduledDate: { [Op.ne]: null }
        }
      });

      for (const maint of maintenance) {
        results.checked++;
        const dateStr = typeof maint.scheduledDate === 'string'
          ? maint.scheduledDate
          : maint.scheduledDate.toISOString().split('T')[0];

        // Validate this maintenance slot
        const validation = await validateMaintenanceSlot(
          aircraft.id,
          dateStr,
          maint.startTime.substring(0, 5),
          maint.duration,
          maint.checkType
        );

        if (!validation.valid) {
          results.overlaps.push({
            registration: aircraft.registration,
            checkType: maint.checkType,
            date: dateStr,
            time: maint.startTime,
            reason: validation.reason
          });

          // Try to find a new slot
          const newTime = await findAvailableSlotOnDate(
            aircraft.id,
            dateStr,
            maint.duration,
            maint.checkType,
            aircraft.worldMembershipId
          );

          if (newTime) {
            // Verify the new time is valid
            const newValidation = await validateMaintenanceSlot(
              aircraft.id,
              dateStr,
              newTime,
              maint.duration,
              maint.checkType
            );

            if (newValidation.valid) {
              await maint.update({ startTime: newTime });
              results.fixed++;
              console.log(`[FIX-OVERLAP] ${aircraft.registration} ${maint.checkType} on ${dateStr}: moved from ${maint.startTime} to ${newTime}`);
            } else {
              // No valid slot - remove the maintenance
              await maint.update({ status: 'inactive' });
              results.removed++;
              console.log(`[FIX-OVERLAP] ${aircraft.registration} ${maint.checkType} on ${dateStr}: removed (no valid slot)`);
            }
          } else {
            // No slot available - remove the maintenance
            await maint.update({ status: 'inactive' });
            results.removed++;
            console.log(`[FIX-OVERLAP] ${aircraft.registration} ${maint.checkType} on ${dateStr}: removed (no slot available)`);
          }
        }
      }
    }

    res.json({
      message: `Checked ${results.checked} maintenance records, found ${results.overlaps.length} overlaps`,
      fixed: results.fixed,
      removed: results.removed,
      overlaps: results.overlaps
    });
  } catch (error) {
    console.error('Error fixing maintenance overlaps:', error);
    res.status(500).json({ error: 'Failed to fix maintenance overlaps' });
  }
});

/**
 * Refresh auto-scheduled maintenance for an aircraft
 * Called after adding/removing flights to reschedule maintenance around flights
 */
router.post('/:aircraftId/refresh-maintenance', async (req, res) => {
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

    // Refresh auto-scheduled maintenance
    const results = await refreshAutoScheduledMaintenance(aircraftId, activeWorldId);

    res.json({
      message: 'Auto-maintenance refreshed',
      aircraftId,
      scheduledChecks: results.length,
      checks: results.map(r => ({ checkType: r.checkType, scheduledDate: r.scheduledDate, startTime: r.startTime }))
    });
  } catch (error) {
    console.error('Error refreshing maintenance:', error);
    res.status(500).json({ error: 'Failed to refresh maintenance' });
  }
});

// ============================================================
// Aircraft Lifecycle: Cancel Lease / Sell / Lease Out / Withdraw
// ============================================================

/**
 * Helper: get authenticated user's membership and verify aircraft ownership
 */
async function getOwnedAircraft(req, aircraftId) {
  const activeWorldId = req.session?.activeWorldId;
  if (!activeWorldId) throw Object.assign(new Error('No active world selected'), { status: 404 });
  if (!req.user) throw Object.assign(new Error('Not authenticated'), { status: 401 });

  const user = await User.findOne({ where: { vatsimId: req.user.vatsimId } });
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const membership = await WorldMembership.findOne({ where: { userId: user.id, worldId: activeWorldId } });
  if (!membership) throw Object.assign(new Error('Not a member of this world'), { status: 404 });

  const aircraft = await UserAircraft.findOne({
    where: { id: aircraftId, worldMembershipId: membership.id },
    include: [{ model: Aircraft, as: 'aircraft' }]
  });
  if (!aircraft) throw Object.assign(new Error('Aircraft not found'), { status: 404 });

  return { user, membership, aircraft, activeWorldId };
}

/**
 * Helper: remove all flights and maintenance for an aircraft
 */
async function clearAircraftSchedule(aircraftId) {
  const flightsDeleted = await ScheduledFlight.destroy({ where: { aircraftId } });
  const maintDeleted = await RecurringMaintenance.destroy({ where: { aircraftId } });
  // Also unassign from any routes
  await Route.update({ assignedAircraftId: null }, { where: { assignedAircraftId: aircraftId } });
  return { flightsDeleted, maintDeleted };
}

/**
 * POST /api/fleet/:aircraftId/cancel-lease
 * Cancel a lease and return the aircraft to the lessor
 * For player leases: lessee pays 3 months' lease rate as early termination penalty
 */
router.post('/:aircraftId/cancel-lease', async (req, res) => {
  try {
    const { membership, aircraft, activeWorldId } = await getOwnedAircraft(req, req.params.aircraftId);

    if (aircraft.acquisitionType !== 'lease') {
      return res.status(400).json({ error: 'This aircraft is not leased' });
    }
    if (!['active', 'maintenance', 'storage'].includes(aircraft.status)) {
      return res.status(400).json({ error: 'Cannot cancel lease on this aircraft' });
    }

    const reg = aircraft.registration;
    const monthlyPayment = parseFloat(aircraft.leaseMonthlyPayment) || 0;

    // Find owner aircraft: first by direct link, then by reverse lookup
    let ownerAircraft = null;
    if (aircraft.playerLessorAircraftId) {
      ownerAircraft = await UserAircraft.findByPk(aircraft.playerLessorAircraftId, {
        include: [{ model: WorldMembership, as: 'membership' }]
      });
    }
    if (!ownerAircraft) {
      // Reverse lookup: find a leased_out aircraft pointing to this one
      ownerAircraft = await UserAircraft.findOne({
        where: { playerLesseeAircraftId: aircraft.id, status: 'leased_out' },
        include: [{ model: WorldMembership, as: 'membership' }]
      });
    }

    const isPlayerLease = !!ownerAircraft;

    // Player lease: apply 3-month early termination penalty
    if (isPlayerLease) {
      const penalty = monthlyPayment * 3;
      if (parseFloat(membership.balance) < penalty) {
        return res.status(400).json({
          error: `Insufficient funds for early termination penalty ($${Number(penalty).toLocaleString('en-US')}). You need 3 months' lease rate.`
        });
      }

      const gameTime = worldTimeService.getCurrentTime(activeWorldId) || new Date();

      // Deduct penalty from lessee
      membership.balance = parseFloat(membership.balance) - penalty;
      await membership.save();
      if (ownerAircraft) {
        const ownerMembership = ownerAircraft.membership;
        ownerAircraft.status = 'active';
        ownerAircraft.leaseOutMonthlyRate = null;
        ownerAircraft.leaseOutStartDate = null;
        ownerAircraft.leaseOutEndDate = null;
        ownerAircraft.leaseOutTenantName = null;
        ownerAircraft.playerLesseeAircraftId = null;
        ownerAircraft.listingPrice = null;
        ownerAircraft.listedAt = null;
        await ownerAircraft.save();

        // Credit penalty to lessor
        ownerMembership.balance = parseFloat(ownerMembership.balance) + penalty;
        await ownerMembership.save();

        // Notify lessor
        const lesseeName = membership.airlineName || 'A tenant airline';
        await Notification.create({
          worldMembershipId: ownerMembership.id,
          type: 'lease_cancelled',
          icon: 'plane',
          title: 'Lease Cancelled Early',
          message: `${lesseeName} cancelled the lease on ${ownerAircraft.registration}. Early termination penalty of $${Number(penalty).toLocaleString('en-US')} has been credited to your account.`,
          priority: 2,
          gameTime
        });
      }

      await clearAircraftSchedule(aircraft.id);
      await aircraft.destroy();

      console.log(`Player lease cancelled: ${reg} - penalty $${penalty} from lessee to lessor`);
      res.json({ message: 'Lease cancelled successfully', registration: reg, penalty });
    } else {
      // NPC lease: no penalty, just delete
      await clearAircraftSchedule(aircraft.id);
      await aircraft.destroy();

      console.log(`Lease cancelled: ${reg} returned by membership ${membership.id}`);
      res.json({ message: 'Lease cancelled successfully', registration: reg });
    }
  } catch (error) {
    console.error('Error cancelling lease:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * POST /api/fleet/:aircraftId/sell
 * List an owned aircraft for sale on the used market
 */
router.post('/:aircraftId/sell', async (req, res) => {
  try {
    const { aircraft, activeWorldId } = await getOwnedAircraft(req, req.params.aircraftId);

    if (aircraft.acquisitionType !== 'purchase') {
      return res.status(400).json({ error: 'Can only sell owned aircraft' });
    }
    if (!['active', 'storage'].includes(aircraft.status)) {
      return res.status(400).json({ error: 'Aircraft must be active or in storage to sell' });
    }

    const askingPrice = parseFloat(req.body.askingPrice);
    if (!askingPrice || askingPrice <= 0) {
      return res.status(400).json({ error: 'Valid asking price is required' });
    }

    // Get current game time for the listing date
    const gameTime = worldTimeService.getCurrentTime(activeWorldId) || new Date();

    await clearAircraftSchedule(aircraft.id);
    await aircraft.update({
      status: 'listed_sale',
      listingPrice: askingPrice,
      listedAt: gameTime
    });

    console.log(`Aircraft listed for sale: ${aircraft.registration} at $${askingPrice}`);
    res.json({ message: 'Aircraft listed for sale', aircraft, newStatus: 'listed_sale' });
  } catch (error) {
    console.error('Error listing aircraft for sale:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * POST /api/fleet/:aircraftId/lease-out
 * List an owned aircraft for lease to other airlines
 */
router.post('/:aircraftId/lease-out', async (req, res) => {
  try {
    const { aircraft, activeWorldId } = await getOwnedAircraft(req, req.params.aircraftId);

    if (aircraft.acquisitionType !== 'purchase') {
      return res.status(400).json({ error: 'Can only lease out owned aircraft' });
    }
    if (!['active', 'storage'].includes(aircraft.status)) {
      return res.status(400).json({ error: 'Aircraft must be active or in storage to lease out' });
    }

    const monthlyRate = parseFloat(req.body.monthlyRate);
    if (!monthlyRate || monthlyRate <= 0) {
      return res.status(400).json({ error: 'Valid monthly rate is required' });
    }

    const gameTime = worldTimeService.getCurrentTime(activeWorldId) || new Date();

    await clearAircraftSchedule(aircraft.id);
    await aircraft.update({
      status: 'listed_lease',
      listingPrice: monthlyRate,
      listedAt: gameTime
    });

    console.log(`Aircraft listed for lease: ${aircraft.registration} at $${monthlyRate}/mo`);
    res.json({ message: 'Aircraft listed for lease', aircraft, newStatus: 'listed_lease' });
  } catch (error) {
    console.error('Error listing aircraft for lease:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * POST /api/fleet/:aircraftId/withdraw-listing
 * Withdraw a sale or lease listing, returning aircraft to active status
 */
router.post('/:aircraftId/withdraw-listing', async (req, res) => {
  try {
    const { aircraft } = await getOwnedAircraft(req, req.params.aircraftId);

    if (!['listed_sale', 'listed_lease'].includes(aircraft.status)) {
      return res.status(400).json({ error: 'Aircraft is not currently listed' });
    }

    await aircraft.update({
      status: 'active',
      listingPrice: null,
      listedAt: null
    });

    console.log(`Listing withdrawn: ${aircraft.registration} returned to active`);
    res.json({ message: 'Listing withdrawn', aircraft, newStatus: 'active' });
  } catch (error) {
    console.error('Error withdrawing listing:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

/**
 * POST /api/fleet/:aircraftId/recall-aircraft
 * Lessor recalls a leased-out aircraft early
 * Lessor pays 3 months' lease rate as compensation to the lessee
 */
router.post('/:aircraftId/recall-aircraft', async (req, res) => {
  try {
    const { membership, aircraft, activeWorldId } = await getOwnedAircraft(req, req.params.aircraftId);

    if (aircraft.status !== 'leased_out') {
      return res.status(400).json({ error: 'Aircraft is not currently leased out' });
    }

    // Find the lessee's aircraft: first by direct link, then by reverse lookup
    let lesseeAircraft = null;
    if (aircraft.playerLesseeAircraftId) {
      lesseeAircraft = await UserAircraft.findByPk(aircraft.playerLesseeAircraftId, {
        include: [{ model: WorldMembership, as: 'membership' }]
      });
    }
    if (!lesseeAircraft) {
      // Reverse lookup: find a leased aircraft pointing back to this one
      lesseeAircraft = await UserAircraft.findOne({
        where: { playerLessorAircraftId: aircraft.id },
        include: [{ model: WorldMembership, as: 'membership' }]
      });
    }

    if (!lesseeAircraft) {
      // No player lessee found - this is an NPC lease, just return to active
      await aircraft.update({
        status: 'active',
        leaseOutMonthlyRate: null,
        leaseOutStartDate: null,
        leaseOutEndDate: null,
        leaseOutTenantName: null,
        playerLesseeAircraftId: null,
        listingPrice: null,
        listedAt: null
      });
      console.log(`NPC lease ended early: ${aircraft.registration} returned to active`);
      return res.json({ message: 'Aircraft returned to fleet', registration: aircraft.registration, compensation: 0 });
    }

    const monthlyRate = parseFloat(aircraft.leaseOutMonthlyRate) || 0;
    const compensation = monthlyRate * 3;

    if (parseFloat(membership.balance) < compensation) {
      return res.status(400).json({
        error: `Insufficient funds for recall compensation ($${Number(compensation).toLocaleString('en-US')}). You must pay 3 months' lease rate to the lessee.`
      });
    }

    const gameTime = worldTimeService.getCurrentTime(activeWorldId) || new Date();

    // Deduct compensation from lessor
    membership.balance = parseFloat(membership.balance) - compensation;
    await membership.save();

    if (lesseeAircraft) {
      const lesseeMembership = lesseeAircraft.membership;

      // Credit compensation to lessee
      lesseeMembership.balance = parseFloat(lesseeMembership.balance) + compensation;
      await lesseeMembership.save();

      // Notify lessee
      const lessorName = membership.airlineName || 'The aircraft owner';
      await Notification.create({
        worldMembershipId: lesseeMembership.id,
        type: 'lease_recalled',
        icon: 'plane',
        title: 'Aircraft Recalled by Owner',
        message: `${lessorName} has recalled ${aircraft.registration}. Compensation of $${Number(compensation).toLocaleString('en-US')} (3 months' lease) has been credited to your account. All flights for this aircraft have been removed.`,
        priority: 1,
        gameTime
      });

      // Clear lessee's schedule and destroy their aircraft copy
      await clearAircraftSchedule(lesseeAircraft.id);
      await lesseeAircraft.destroy();
    }

    // Return owner's aircraft to active
    await aircraft.update({
      status: 'active',
      leaseOutMonthlyRate: null,
      leaseOutStartDate: null,
      leaseOutEndDate: null,
      leaseOutTenantName: null,
      playerLesseeAircraftId: null,
      listingPrice: null,
      listedAt: null
    });

    console.log(`Aircraft recalled: ${aircraft.registration} - compensation $${compensation} from lessor to lessee`);
    res.json({ message: 'Aircraft recalled successfully', registration: aircraft.registration, compensation });
  } catch (error) {
    console.error('Error recalling aircraft:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Export router as default and helper functions
module.exports = router;
module.exports.checkMaintenanceConflict = checkMaintenanceConflict;
module.exports.attemptMaintenanceReschedule = attemptMaintenanceReschedule;
module.exports.findAvailableMaintenanceSlot = findAvailableMaintenanceSlot;
module.exports.findAvailableSlotOnDate = findAvailableSlotOnDate;
module.exports.validateMaintenanceSlot = validateMaintenanceSlot;
module.exports.createAutoScheduledMaintenance = createAutoScheduledMaintenance;
module.exports.refreshAutoScheduledMaintenance = refreshAutoScheduledMaintenance;
module.exports.optimizeMaintenanceForDates = optimizeMaintenanceForDates;
