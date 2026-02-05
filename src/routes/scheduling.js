const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { ScheduledFlight, RecurringMaintenance, Route, UserAircraft, Airport, Aircraft, WorldMembership, User, World } = require('../models');
const { checkMaintenanceConflict, attemptMaintenanceReschedule, optimizeMaintenanceForDates, createAutoScheduledMaintenance, refreshAutoScheduledMaintenance } = require('./fleet');

// Wind and route variation constants (must match frontend scheduling-v3.js)
const WIND_ADJUSTMENT_FACTOR = 0.13; // 13% variation for jet stream effect
const ROUTE_VARIATION_FACTOR = 0.035; // ±3.5% for natural-looking times

/**
 * Calculate wind multiplier based on flight direction (matches frontend logic)
 * Eastbound flights are faster (tailwind), westbound are slower (headwind)
 */
function getWindMultiplier(depLng, arrLng, depLat = 0, arrLat = 0) {
  // Calculate longitude difference (handling date line crossing)
  let lngDiff = arrLng - depLng;
  if (lngDiff > 180) lngDiff -= 360;
  else if (lngDiff < -180) lngDiff += 360;

  // Scale effect based on latitude (strongest at mid-latitudes 30-60°)
  const avgLat = Math.abs((depLat + arrLat) / 2);
  let latitudeScale = 1.0;
  if (avgLat < 20) latitudeScale = 0.2;
  else if (avgLat < 30) latitudeScale = 0.5;
  else if (avgLat > 60) latitudeScale = 0.6;

  // Only apply wind effect for significant east-west travel
  if (Math.abs(lngDiff) < 10) return 1.0;

  // Eastbound (positive lngDiff) = faster, Westbound = slower
  const direction = lngDiff > 0 ? -1 : 1;
  const eastWestRatio = Math.min(1, Math.abs(lngDiff) / 90);
  return 1 + (direction * WIND_ADJUSTMENT_FACTOR * latitudeScale * eastWestRatio);
}

/**
 * Calculate route variation for natural-looking times (matches frontend logic)
 * Deterministic based on coordinates so same route always has same variation
 */
function getRouteVariation(depLat, depLng, arrLat, arrLng) {
  const coordSum = (depLat * 7.3) + (depLng * 11.7) + (arrLat * 13.1) + (arrLng * 17.9);
  const hash = Math.sin(coordSum) * 10000;
  const normalized = hash - Math.floor(hash);
  const variation = (normalized - 0.5) * 2 * ROUTE_VARIATION_FACTOR;
  return 1 + variation;
}

/**
 * Calculate flight minutes with wind and route variation (matches frontend logic)
 */
function calculateFlightMinutes(distanceNm, cruiseSpeed, depLng, arrLng, depLat, arrLat) {
  const baseMinutes = (distanceNm / cruiseSpeed) * 60;
  const windMultiplier = getWindMultiplier(depLng, arrLng, depLat, arrLat);
  const routeVariation = getRouteVariation(depLat, depLng, arrLat, arrLng);
  return Math.round(baseMinutes * windMultiplier * routeVariation);
}

/**
 * Calculate arrival date and time based on departure and full round-trip duration
 * Accounts for outbound + turnaround + return, tech stops, wind effects, and route variation
 * @param {string} departureDate - YYYY-MM-DD format
 * @param {string} departureTime - HH:MM:SS format
 * @param {object} route - Route object with distance, turnaroundTime, airports with coordinates
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

  // Get coordinates for wind calculation
  const depLat = parseFloat(route.departureAirport?.latitude) || 0;
  const depLng = parseFloat(route.departureAirport?.longitude) || 0;
  const arrLat = parseFloat(route.arrivalAirport?.latitude) || 0;
  const arrLng = parseFloat(route.arrivalAirport?.longitude) || 0;

  let totalMinutes;

  if (hasTechStop) {
    // Tech stop route: leg1 + techStop + leg2 + turnaround + leg3 + techStop + leg4
    const techStopMinutes = 30;
    const techLat = parseFloat(route.techStopAirport?.latitude) || 0;
    const techLng = parseFloat(route.techStopAirport?.longitude) || 0;
    const leg1Distance = route.legOneDistance || Math.round(distance * 0.4);
    const leg2Distance = route.legTwoDistance || Math.round(distance * 0.6);

    // Calculate each leg with wind effects
    const leg1Minutes = calculateFlightMinutes(leg1Distance, speed, depLng, techLng, depLat, techLat);
    const leg2Minutes = calculateFlightMinutes(leg2Distance, speed, techLng, arrLng, techLat, arrLat);
    const leg3Minutes = calculateFlightMinutes(leg2Distance, speed, arrLng, techLng, arrLat, techLat);
    const leg4Minutes = calculateFlightMinutes(leg1Distance, speed, techLng, depLng, techLat, depLat);

    totalMinutes = leg1Minutes + techStopMinutes + leg2Minutes +
                   turnaroundMinutes +
                   leg3Minutes + techStopMinutes + leg4Minutes;
  } else {
    // Standard round-trip with wind effects
    const outboundMinutes = calculateFlightMinutes(distance, speed, depLng, arrLng, depLat, arrLat);
    const returnMinutes = calculateFlightMinutes(distance, speed, arrLng, depLng, arrLat, depLat);
    totalMinutes = outboundMinutes + turnaroundMinutes + returnMinutes;
  }

  // Calculate arrival datetime (when the round-trip completes)
  const arrDateTime = new Date(depDateTime.getTime() + totalMinutes * 60 * 1000);

  // Round minutes to nearest 5
  const rawMinutes = arrDateTime.getMinutes();
  const roundedMinutes = Math.round(rawMinutes / 5) * 5;
  if (roundedMinutes === 60) {
    arrDateTime.setHours(arrDateTime.getHours() + 1);
    arrDateTime.setMinutes(0);
  } else {
    arrDateTime.setMinutes(roundedMinutes);
  }
  arrDateTime.setSeconds(0);

  // Format arrival date and time using local time (avoids UTC timezone shift)
  const year = arrDateTime.getFullYear();
  const month = String(arrDateTime.getMonth() + 1).padStart(2, '0');
  const day = String(arrDateTime.getDate()).padStart(2, '0');
  const arrivalDate = `${year}-${month}-${day}`;
  const hours = String(arrDateTime.getHours()).padStart(2, '0');
  const mins = String(arrDateTime.getMinutes()).padStart(2, '0');
  const arrivalTime = `${hours}:${mins}:00`;

  return { arrivalDate, arrivalTime };
}

/**
 * GET /api/schedule/data
 * Combined endpoint - returns fleet, routes, flights, and maintenance in a single request
 * This is much faster than making 4 separate requests
 */
router.get('/data', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Get active world from session
    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(404).json({ error: 'No active world selected' });
    }

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

    // Run all queries in parallel for maximum speed
    const [fleet, routes, flights, maintenancePatterns] = await Promise.all([
      // Fleet query
      UserAircraft.findAll({
        where: { worldMembershipId },
        include: [{ model: Aircraft, as: 'aircraft' }],
        order: [['acquiredAt', 'DESC']]
      }),

      // Routes query
      Route.findAll({
        where: { worldMembershipId },
        include: [
          { model: Airport, as: 'departureAirport' },
          { model: Airport, as: 'arrivalAirport' },
          { model: Airport, as: 'techStopAirport' }
        ]
      }),

      // Flights query (with date filter)
      (async () => {
        let whereClause = {};
        if (startDate && endDate) {
          whereClause = {
            [Op.or]: [
              { scheduledDate: { [Op.between]: [startDate, endDate] } },
              { arrivalDate: { [Op.between]: [startDate, endDate] } },
              {
                [Op.and]: [
                  { scheduledDate: { [Op.lt]: startDate } },
                  { arrivalDate: { [Op.gt]: endDate } }
                ]
              }
            ]
          };
        }

        return ScheduledFlight.findAll({
          where: whereClause,
          include: [
            {
              model: Route,
              as: 'route',
              required: true,
              where: { worldMembershipId },
              include: [
                { model: Airport, as: 'departureAirport' },
                { model: Airport, as: 'arrivalAirport' },
                { model: Airport, as: 'techStopAirport' }
              ]
            },
            {
              model: UserAircraft,
              as: 'aircraft',
              include: [{ model: Aircraft, as: 'aircraft' }]
            }
          ],
          order: [['scheduledDate', 'ASC'], ['departureTime', 'ASC']]
        });
      })(),

      // Maintenance patterns query - return ALL scheduled maintenance (no date filter)
      // so modal can show "Next Scheduled" for far-future checks like A, C, D
      (async () => {
        const aircraftIds = await UserAircraft.findAll({
          where: { worldMembershipId },
          attributes: ['id'],
          raw: true
        }).then(rows => rows.map(r => r.id));

        if (aircraftIds.length === 0) return [];

        return RecurringMaintenance.findAll({
          where: {
            aircraftId: { [Op.in]: aircraftIds },
            status: 'active'
          }
        });
      })()
    ]);

    // Efficiently attach maintenance to fleet (O(n) instead of O(n*m))
    const maintenanceByAircraft = {};
    for (const m of maintenancePatterns) {
      if (!maintenanceByAircraft[m.aircraftId]) {
        maintenanceByAircraft[m.aircraftId] = [];
      }
      maintenanceByAircraft[m.aircraftId].push(m);
    }

    const fleetWithMaintenance = fleet.map(aircraft => {
      const aircraftJson = aircraft.toJSON();
      aircraftJson.recurringMaintenance = maintenanceByAircraft[aircraft.id] || [];
      return aircraftJson;
    });

    // Background: clean up auto-scheduled maintenance for aircraft with no flights
    // Aircraft with no flights shouldn't have auto-scheduled maintenance cluttering the view
    (async () => {
      try {
        const aircraftWithFlights = new Set(flights.map(f => f.aircraftId));
        for (const aircraft of fleet) {
          if (!aircraftWithFlights.has(aircraft.id) && (
            aircraft.autoScheduleDaily || aircraft.autoScheduleWeekly ||
            aircraft.autoScheduleA || aircraft.autoScheduleC || aircraft.autoScheduleD
          )) {
            // Disable auto-scheduling for aircraft with no flights
            await aircraft.update({
              autoScheduleDaily: false,
              autoScheduleWeekly: false,
              autoScheduleA: false,
              autoScheduleC: false,
              autoScheduleD: false
            });
            // Remove their auto-scheduled maintenance
            await RecurringMaintenance.destroy({
              where: { aircraftId: aircraft.id, status: 'active' }
            });
          }
        }

        // Also fix transit day conflicts for remaining maintenance
        for (const maint of maintenancePatterns) {
          if (maint.status !== 'active') continue;
          const maintDate = typeof maint.scheduledDate === 'string'
            ? maint.scheduledDate.substring(0, 10) : maint.scheduledDate;
          if (!maintDate) continue;

          const transitFlight = flights.find(f => {
            if (f.aircraftId !== maint.aircraftId) return false;
            const fDep = typeof f.scheduledDate === 'string' ? f.scheduledDate.substring(0, 10) : '';
            const fArr = f.arrivalDate ? (typeof f.arrivalDate === 'string' ? f.arrivalDate.substring(0, 10) : '') : fDep;
            return fDep < maintDate && fArr > maintDate;
          });

          if (transitFlight) {
            console.log(`[MAINT-FIX] ${maint.checkType} check on ${maintDate} conflicts with transit day - rescheduling`);
            await attemptMaintenanceReschedule(maint.id, maint.aircraftId, 0, 1440);
          }
        }
      } catch (err) {
        console.error('[MAINT-FIX] Error in background maintenance cleanup:', err.message);
      }
    })();

    res.json({
      fleet: fleetWithMaintenance,
      routes,
      flights,
      maintenance: maintenancePatterns
    });
  } catch (error) {
    console.error('Error fetching schedule data:', error);
    res.status(500).json({ error: error.message });
  }
});

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

    // Calculate pre-flight and post-flight durations based on aircraft type
    const acType = aircraft.aircraft?.type || 'Narrowbody';
    const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;
    const routeDistance = route.distance || 0;

    // Pre-flight: max(catering + boarding, fuelling)
    let cateringDuration = 0;
    if (paxCapacity >= 50 && acType !== 'Cargo') {
      if (paxCapacity < 100) cateringDuration = 5;
      else if (paxCapacity < 200) cateringDuration = 10;
      else cateringDuration = 15;
    }
    let boardingDuration = 0;
    if (acType !== 'Cargo') {
      if (paxCapacity < 50) boardingDuration = 10;
      else if (paxCapacity < 100) boardingDuration = 15;
      else if (paxCapacity < 200) boardingDuration = 20;
      else if (paxCapacity < 300) boardingDuration = 25;
      else boardingDuration = 35;
    }
    let fuellingDuration = 0;
    if (routeDistance < 500) fuellingDuration = 10;
    else if (routeDistance < 1500) fuellingDuration = 15;
    else if (routeDistance < 3000) fuellingDuration = 20;
    else fuellingDuration = 25;
    const preFlightDuration = Math.max(cateringDuration + boardingDuration, fuellingDuration);

    // Post-flight: deboarding + cleaning
    let deboardingDuration = 0;
    if (acType !== 'Cargo') {
      if (paxCapacity < 50) deboardingDuration = 5;
      else if (paxCapacity < 100) deboardingDuration = 8;
      else if (paxCapacity < 200) deboardingDuration = 12;
      else if (paxCapacity < 300) deboardingDuration = 15;
      else deboardingDuration = 20;
    }
    let cleaningDuration;
    if (paxCapacity < 50) cleaningDuration = 5;
    else if (paxCapacity < 100) cleaningDuration = 10;
    else if (paxCapacity < 200) cleaningDuration = 15;
    else if (paxCapacity < 300) cleaningDuration = 20;
    else cleaningDuration = 25;
    const postFlightDuration = deboardingDuration + cleaningDuration;

    // Calculate arrival date and time (for full round-trip including tech stops)
    const { arrivalDate, arrivalTime } = calculateArrivalDateTime(
      scheduledDate,
      departureTime,
      route,
      aircraft.aircraft?.cruiseSpeed
    );

    // Calculate full operation window (pre-flight start to post-flight end)
    const [depH, depM] = departureTime.split(':').map(Number);
    const depMinutes = depH * 60 + depM;
    const preFlightStartMinutes = depMinutes - preFlightDuration;

    const [arrH, arrM] = arrivalTime.split(':').map(Number);
    const arrMinutes = arrH * 60 + arrM;
    const postFlightEndMinutes = arrMinutes + postFlightDuration;

    // Create datetime objects for the operation window
    const opStartDateTime = new Date(`${scheduledDate}T00:00:00`);
    opStartDateTime.setMinutes(opStartDateTime.getMinutes() + preFlightStartMinutes);

    const opEndDateTime = new Date(`${arrivalDate}T00:00:00`);
    opEndDateTime.setMinutes(opEndDateTime.getMinutes() + postFlightEndMinutes);

    // Check for overlapping flights
    const existingFlights = await ScheduledFlight.findAll({
      where: {
        aircraftId,
        [Op.or]: [
          // Flight departs or arrives on the same days as our operation
          { scheduledDate: { [Op.between]: [scheduledDate, arrivalDate] } },
          { arrivalDate: { [Op.between]: [scheduledDate, arrivalDate] } },
          // Flight spans our operation dates
          {
            [Op.and]: [
              { scheduledDate: { [Op.lte]: scheduledDate } },
              { arrivalDate: { [Op.gte]: arrivalDate } }
            ]
          }
        ]
      },
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
          include: [{ model: Aircraft, as: 'aircraft' }]
        }
      ]
    });

    // Check each existing flight for time overlap
    for (const existingFlight of existingFlights) {
      // Calculate existing flight's operation window
      const existingAcType = existingFlight.aircraft?.aircraft?.type || 'Narrowbody';
      const existingPax = existingFlight.aircraft?.aircraft?.passengerCapacity || 150;
      const existingDist = existingFlight.route?.distance || 0;

      // Calculate existing pre-flight duration
      let exCatering = 0;
      if (existingPax >= 50 && existingAcType !== 'Cargo') {
        if (existingPax < 100) exCatering = 5;
        else if (existingPax < 200) exCatering = 10;
        else exCatering = 15;
      }
      let exBoarding = 0;
      if (existingAcType !== 'Cargo') {
        if (existingPax < 50) exBoarding = 10;
        else if (existingPax < 100) exBoarding = 15;
        else if (existingPax < 200) exBoarding = 20;
        else if (existingPax < 300) exBoarding = 25;
        else exBoarding = 35;
      }
      let exFuelling = 0;
      if (existingDist < 500) exFuelling = 10;
      else if (existingDist < 1500) exFuelling = 15;
      else if (existingDist < 3000) exFuelling = 20;
      else exFuelling = 25;
      const exPreFlight = Math.max(exCatering + exBoarding, exFuelling);

      // Calculate existing post-flight duration
      let exDeboard = 0;
      if (existingAcType !== 'Cargo') {
        if (existingPax < 50) exDeboard = 5;
        else if (existingPax < 100) exDeboard = 8;
        else if (existingPax < 200) exDeboard = 12;
        else if (existingPax < 300) exDeboard = 15;
        else exDeboard = 20;
      }
      let exClean;
      if (existingPax < 50) exClean = 5;
      else if (existingPax < 100) exClean = 10;
      else if (existingPax < 200) exClean = 15;
      else if (existingPax < 300) exClean = 20;
      else exClean = 25;
      const exPostFlight = exDeboard + exClean;

      // Calculate existing flight's operation window
      const [exDepH, exDepM] = existingFlight.departureTime.split(':').map(Number);
      const exDepMinutes = exDepH * 60 + exDepM;
      const exPreStartMinutes = exDepMinutes - exPreFlight;

      const [exArrH, exArrM] = existingFlight.arrivalTime.split(':').map(Number);
      const exArrMinutes = exArrH * 60 + exArrM;
      const exPostEndMinutes = exArrMinutes + exPostFlight;

      const exOpStart = new Date(`${existingFlight.scheduledDate}T00:00:00`);
      exOpStart.setMinutes(exOpStart.getMinutes() + exPreStartMinutes);

      const exOpEnd = new Date(`${existingFlight.arrivalDate}T00:00:00`);
      exOpEnd.setMinutes(exOpEnd.getMinutes() + exPostEndMinutes);

      // Check for overlap: operations overlap if one starts before the other ends
      const overlaps = opStartDateTime < exOpEnd && opEndDateTime > exOpStart;

      if (overlaps) {
        const depAirport = existingFlight.route?.departureAirport?.iataCode || existingFlight.route?.departureAirport?.icaoCode || '???';
        const arrAirport = existingFlight.route?.arrivalAirport?.iataCode || existingFlight.route?.arrivalAirport?.icaoCode || '???';
        const routeNum = existingFlight.route?.routeNumber || 'Unknown';
        const returnNum = existingFlight.route?.returnRouteNumber || '';

        // Format dates as DD/MM/YYYY
        const exDateParts = existingFlight.scheduledDate.split('-');
        const formattedExDate = `${exDateParts[2]}/${exDateParts[1]}/${exDateParts[0]}`;

        return res.status(409).json({
          error: 'Schedule conflict detected',
          conflict: {
            type: 'flight',
            routeNumber: routeNum,
            returnRouteNumber: returnNum,
            departure: depAirport,
            arrival: arrAirport,
            date: formattedExDate,
            departureTime: existingFlight.departureTime.substring(0, 5),
            arrivalTime: existingFlight.arrivalTime.substring(0, 5),
            message: `Conflicts with ${routeNum}/${returnNum} (${depAirport}→${arrAirport}) on ${formattedExDate} departing ${existingFlight.departureTime.substring(0, 5)}`
          }
        });
      }
    }

    // Check for overlapping maintenance and attempt to reschedule
    // Query maintenance for departure date, arrival date, AND transit days (multi-day flights)
    const datesToCheck = [scheduledDate];
    if (arrivalDate && arrivalDate !== scheduledDate) {
      datesToCheck.push(arrivalDate);
      // Add transit days between departure and arrival
      const depDateObj = new Date(scheduledDate + 'T00:00:00');
      const arrDateObj = new Date(arrivalDate + 'T00:00:00');
      const transitDate = new Date(depDateObj);
      transitDate.setDate(transitDate.getDate() + 1);
      while (transitDate < arrDateObj) {
        datesToCheck.push(transitDate.toISOString().split('T')[0]);
        transitDate.setDate(transitDate.getDate() + 1);
      }
    }

    const maintenancePatterns = await RecurringMaintenance.findAll({
      where: {
        aircraftId,
        status: 'active',
        scheduledDate: { [Op.in]: datesToCheck }
      }
    });

    const rescheduledMaintenance = [];

    for (const maint of maintenancePatterns) {
      const [maintH, maintM] = maint.startTime.split(':').map(Number);
      const maintStartMinutes = maintH * 60 + maintM;
      const maintEndMinutes = maintStartMinutes + maint.duration;
      const maintDate = typeof maint.scheduledDate === 'string' ? maint.scheduledDate.substring(0, 10) : maint.scheduledDate;

      // Calculate overlap based on which date this maintenance is on
      let maintOverlaps = false;

      if (maintDate === scheduledDate) {
        // Maintenance is on departure date - check from pre-flight start to midnight (or arrival if same day)
        const opEndOnDepDate = (arrivalDate === scheduledDate) ? postFlightEndMinutes : 1440;
        maintOverlaps = preFlightStartMinutes < maintEndMinutes && opEndOnDepDate > maintStartMinutes;
      } else if (maintDate === arrivalDate) {
        // Maintenance is on arrival date - check from midnight to post-flight end
        maintOverlaps = 0 < maintEndMinutes && postFlightEndMinutes > maintStartMinutes;
      } else if (maintDate > scheduledDate && maintDate < arrivalDate) {
        // Maintenance is on a transit day - aircraft is flying/downroute, always overlaps
        maintOverlaps = true;
      }

      if (maintOverlaps) {
        const checkNames = { 'daily': 'Daily Check', 'weekly': 'Weekly Check', 'A': 'A Check', 'C': 'C Check', 'D': 'D Check' };
        const checkName = checkNames[maint.checkType] || `${maint.checkType} Check`;

        // Calculate the blocked time window for this date
        let blockedStart, blockedEnd;
        if (maintDate === scheduledDate) {
          blockedStart = preFlightStartMinutes;
          blockedEnd = (arrivalDate === scheduledDate) ? postFlightEndMinutes : 1440;
        } else if (maintDate === arrivalDate) {
          blockedStart = 0;
          blockedEnd = postFlightEndMinutes;
        } else {
          // Transit day - aircraft busy all day
          blockedStart = 0;
          blockedEnd = 1440;
        }

        // Try to reschedule the maintenance
        const rescheduleResult = await attemptMaintenanceReschedule(
          maint.id,
          aircraftId,
          blockedStart,
          blockedEnd
        );

        if (rescheduleResult.success) {
          // Maintenance was successfully rescheduled
          rescheduledMaintenance.push({
            checkType: maint.checkType,
            checkName: checkName,
            originalTime: maint.startTime.substring(0, 5),
            newSlot: rescheduleResult.newSlot
          });
        } else {
          // Cannot reschedule - return error
          return res.status(409).json({
            error: 'Cannot schedule flight - maintenance check would expire',
            conflict: {
              type: 'maintenance',
              checkType: maint.checkType,
              checkName: checkName,
              startTime: maint.startTime.substring(0, 5),
              duration: maint.duration,
              message: rescheduleResult.error || `${checkName} cannot be moved without expiring. Clear some flights first.`
            }
          });
        }
      }
    }

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

    // Optimize maintenance positions on affected dates (reposition checks efficiently)
    const datesToOptimize = [scheduledDate];
    if (arrivalDate && arrivalDate !== scheduledDate) {
      datesToOptimize.push(arrivalDate);
    }
    const optimizedMaintenance = await optimizeMaintenanceForDates(aircraftId, datesToOptimize);

    // Re-run auto-scheduler in background (don't block the response)
    const activeWorldId2 = req.session?.activeWorldId;
    refreshAutoScheduledMaintenance(aircraftId, activeWorldId2).catch(e =>
      console.log('[SCHEDULE] Auto-scheduler re-run failed:', e.message)
    );

    // Include rescheduled and optimized maintenance info in response
    const response = completeFlightData.toJSON();
    if (rescheduledMaintenance.length > 0) {
      response.rescheduledMaintenance = rescheduledMaintenance;
    }
    if (optimizedMaintenance.length > 0) {
      response.optimizedMaintenance = optimizedMaintenance;
    }

    res.status(201).json(response);
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

    // Calculate pre-flight and post-flight durations for this aircraft/route
    const acType = aircraft.aircraft?.type || 'Narrowbody';
    const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;
    const routeDistance = route.distance || 0;

    // Pre-flight: max(catering + boarding, fuelling)
    let cateringDuration = 0;
    if (paxCapacity >= 50 && acType !== 'Cargo') {
      if (paxCapacity < 100) cateringDuration = 5;
      else if (paxCapacity < 200) cateringDuration = 10;
      else cateringDuration = 15;
    }
    let boardingDuration = 0;
    if (acType !== 'Cargo') {
      if (paxCapacity < 50) boardingDuration = 10;
      else if (paxCapacity < 100) boardingDuration = 15;
      else if (paxCapacity < 200) boardingDuration = 20;
      else if (paxCapacity < 300) boardingDuration = 25;
      else boardingDuration = 35;
    }
    let fuellingDuration = 0;
    if (routeDistance < 500) fuellingDuration = 10;
    else if (routeDistance < 1500) fuellingDuration = 15;
    else if (routeDistance < 3000) fuellingDuration = 20;
    else fuellingDuration = 25;
    const preFlightDuration = Math.max(cateringDuration + boardingDuration, fuellingDuration);

    // Post-flight: deboarding + cleaning
    let deboardingDuration = 0;
    if (acType !== 'Cargo') {
      if (paxCapacity < 50) deboardingDuration = 5;
      else if (paxCapacity < 100) deboardingDuration = 8;
      else if (paxCapacity < 200) deboardingDuration = 12;
      else if (paxCapacity < 300) deboardingDuration = 15;
      else deboardingDuration = 20;
    }
    let cleaningDuration;
    if (paxCapacity < 50) cleaningDuration = 5;
    else if (paxCapacity < 100) cleaningDuration = 10;
    else if (paxCapacity < 200) cleaningDuration = 15;
    else if (paxCapacity < 300) cleaningDuration = 20;
    else cleaningDuration = 25;
    const postFlightDuration = deboardingDuration + cleaningDuration;

    // Get all dates that could be affected (include day before first and day after last)
    const scheduleDates = flights.map(f => f.scheduledDate);
    const minDate = new Date(Math.min(...scheduleDates.map(d => new Date(d))));
    const maxDate = new Date(Math.max(...scheduleDates.map(d => new Date(d))));
    minDate.setDate(minDate.getDate() - 1);
    maxDate.setDate(maxDate.getDate() + 2); // +2 for multi-day flights

    // Query all flights that could potentially overlap
    const existingFlights = await ScheduledFlight.findAll({
      where: {
        aircraftId,
        [Op.or]: [
          { scheduledDate: { [Op.between]: [minDate.toISOString().split('T')[0], maxDate.toISOString().split('T')[0]] } },
          { arrivalDate: { [Op.between]: [minDate.toISOString().split('T')[0], maxDate.toISOString().split('T')[0]] } }
        ]
      },
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
          include: [{ model: Aircraft, as: 'aircraft' }]
        }
      ]
    });

    // Helper to calculate existing flight's operation window
    const getExistingFlightWindow = (existingFlight) => {
      const exAcType = existingFlight.aircraft?.aircraft?.type || 'Narrowbody';
      const exPax = existingFlight.aircraft?.aircraft?.passengerCapacity || 150;
      const exDist = existingFlight.route?.distance || 0;

      // Pre-flight
      let exCatering = 0;
      if (exPax >= 50 && exAcType !== 'Cargo') {
        if (exPax < 100) exCatering = 5;
        else if (exPax < 200) exCatering = 10;
        else exCatering = 15;
      }
      let exBoarding = 0;
      if (exAcType !== 'Cargo') {
        if (exPax < 50) exBoarding = 10;
        else if (exPax < 100) exBoarding = 15;
        else if (exPax < 200) exBoarding = 20;
        else if (exPax < 300) exBoarding = 25;
        else exBoarding = 35;
      }
      let exFuelling = 0;
      if (exDist < 500) exFuelling = 10;
      else if (exDist < 1500) exFuelling = 15;
      else if (exDist < 3000) exFuelling = 20;
      else exFuelling = 25;
      const exPreFlight = Math.max(exCatering + exBoarding, exFuelling);

      // Post-flight
      let exDeboard = 0;
      if (exAcType !== 'Cargo') {
        if (exPax < 50) exDeboard = 5;
        else if (exPax < 100) exDeboard = 8;
        else if (exPax < 200) exDeboard = 12;
        else if (exPax < 300) exDeboard = 15;
        else exDeboard = 20;
      }
      let exClean;
      if (exPax < 50) exClean = 5;
      else if (exPax < 100) exClean = 10;
      else if (exPax < 200) exClean = 15;
      else if (exPax < 300) exClean = 20;
      else exClean = 25;
      const exPostFlight = exDeboard + exClean;

      const [exDepH, exDepM] = existingFlight.departureTime.split(':').map(Number);
      const exDepMinutes = exDepH * 60 + exDepM;
      const exPreStartMinutes = exDepMinutes - exPreFlight;

      const [exArrH, exArrM] = existingFlight.arrivalTime.split(':').map(Number);
      const exArrMinutes = exArrH * 60 + exArrM;
      const exPostEndMinutes = exArrMinutes + exPostFlight;

      const exOpStart = new Date(`${existingFlight.scheduledDate}T00:00:00`);
      exOpStart.setMinutes(exOpStart.getMinutes() + exPreStartMinutes);

      const exOpEnd = new Date(`${existingFlight.arrivalDate || existingFlight.scheduledDate}T00:00:00`);
      exOpEnd.setMinutes(exOpEnd.getMinutes() + exPostEndMinutes);

      return { start: exOpStart, end: exOpEnd };
    };

    // Pre-calculate existing flight windows
    const existingWindows = existingFlights.map(f => ({
      flight: f,
      window: getExistingFlightWindow(f)
    }));

    // Filter out conflicting flights and prepare batch data
    const flightsToCreate = [];
    const conflicts = [];

    for (const flight of flights) {
      // Calculate this new flight's operation window
      const { arrivalDate, arrivalTime } = calculateArrivalDateTime(
        flight.scheduledDate,
        flight.departureTime,
        route,
        cruiseSpeed
      );

      const [depH, depM] = flight.departureTime.split(':').map(Number);
      const depMinutes = depH * 60 + depM;
      const preFlightStartMinutes = depMinutes - preFlightDuration;

      const [arrH, arrM] = arrivalTime.split(':').map(Number);
      const arrMinutes = arrH * 60 + arrM;
      const postFlightEndMinutes = arrMinutes + postFlightDuration;

      const opStartDateTime = new Date(`${flight.scheduledDate}T00:00:00`);
      opStartDateTime.setMinutes(opStartDateTime.getMinutes() + preFlightStartMinutes);

      const opEndDateTime = new Date(`${arrivalDate}T00:00:00`);
      opEndDateTime.setMinutes(opEndDateTime.getMinutes() + postFlightEndMinutes);

      // Check for overlap with existing flights
      let hasConflict = false;
      for (const { flight: existingFlight, window: exWindow } of existingWindows) {
        const overlaps = opStartDateTime < exWindow.end && opEndDateTime > exWindow.start;
        if (overlaps) {
          hasConflict = true;
          break;
        }
      }

      if (hasConflict) {
        conflicts.push(flight.scheduledDate);
      } else {
        flightsToCreate.push({
          routeId,
          aircraftId,
          scheduledDate: flight.scheduledDate,
          departureTime: flight.departureTime,
          arrivalDate,
          arrivalTime,
          status: 'scheduled'
        });

        // Add this flight to existing windows for checking subsequent flights in batch
        existingWindows.push({
          flight: { scheduledDate: flight.scheduledDate, arrivalDate, departureTime: flight.departureTime, arrivalTime },
          window: { start: opStartDateTime, end: opEndDateTime }
        });
      }
    }

    if (flightsToCreate.length === 0) {
      return res.status(409).json({
        error: 'All flights conflict with existing schedule',
        conflicts
      });
    }

    // Check for maintenance conflicts and attempt to reschedule
    const allAffectedDates = new Set();
    for (const flight of flightsToCreate) {
      allAffectedDates.add(flight.scheduledDate);
      if (flight.arrivalDate && flight.arrivalDate !== flight.scheduledDate) {
        allAffectedDates.add(flight.arrivalDate);
        // Add transit days between departure and arrival
        const depDateObj = new Date(flight.scheduledDate + 'T00:00:00');
        const arrDateObj = new Date(flight.arrivalDate + 'T00:00:00');
        const transitDate = new Date(depDateObj);
        transitDate.setDate(transitDate.getDate() + 1);
        while (transitDate < arrDateObj) {
          allAffectedDates.add(transitDate.toISOString().split('T')[0]);
          transitDate.setDate(transitDate.getDate() + 1);
        }
      }
    }

    const conflictingMaint = await RecurringMaintenance.findAll({
      where: {
        aircraftId,
        status: 'active',
        scheduledDate: { [Op.in]: [...allAffectedDates] }
      }
    });

    const rescheduledMaintenance = [];
    for (const maint of conflictingMaint) {
      const [maintH, maintM] = maint.startTime.split(':').map(Number);
      const maintStartMinutes = maintH * 60 + maintM;
      const maintEndMinutes = maintStartMinutes + maint.duration;
      const maintDate = String(maint.scheduledDate).split('T')[0];

      // Check if this maintenance overlaps with any of the new flights
      let overlappingFlight = null;
      for (const flight of flightsToCreate) {
        const [fDepH, fDepM] = flight.departureTime.split(':').map(Number);
        const fDepMinutes = fDepH * 60 + fDepM;
        const fPreStart = fDepMinutes - preFlightDuration;
        const [fArrH, fArrM] = flight.arrivalTime.split(':').map(Number);
        const fArrMinutes = fArrH * 60 + fArrM;
        const fPostEnd = fArrMinutes + postFlightDuration;

        let overlaps = false;
        if (maintDate === flight.scheduledDate) {
          const opEnd = (flight.arrivalDate === flight.scheduledDate) ? fPostEnd : 1440;
          overlaps = fPreStart < maintEndMinutes && opEnd > maintStartMinutes;
        } else if (maintDate === flight.arrivalDate) {
          overlaps = 0 < maintEndMinutes && fPostEnd > maintStartMinutes;
        } else if (maintDate > flight.scheduledDate && maintDate < flight.arrivalDate) {
          // Transit day - aircraft busy all day
          overlaps = true;
        }

        if (overlaps) {
          overlappingFlight = flight;
          break;
        }
      }

      if (overlappingFlight) {
        let blockedStart, blockedEnd;
        const isTransitDay = maintDate > overlappingFlight.scheduledDate && maintDate < overlappingFlight.arrivalDate;
        if (isTransitDay) {
          // Transit day - aircraft busy all day
          blockedStart = 0;
          blockedEnd = 1440;
        } else {
          const [fDepH, fDepM] = overlappingFlight.departureTime.split(':').map(Number);
          const fDepMinutes = fDepH * 60 + fDepM;
          blockedStart = fDepMinutes - preFlightDuration;
          const [fArrH, fArrM] = overlappingFlight.arrivalTime.split(':').map(Number);
          const fArrMinutes = fArrH * 60 + fArrM;
          blockedEnd = (maintDate === overlappingFlight.scheduledDate && overlappingFlight.arrivalDate !== overlappingFlight.scheduledDate)
            ? 1440
            : fArrMinutes + postFlightDuration;
        }

        const result = await attemptMaintenanceReschedule(maint.id, aircraftId, blockedStart, blockedEnd);
        if (result.success) {
          rescheduledMaintenance.push({
            checkType: maint.checkType,
            originalTime: maint.startTime.substring(0, 5),
            newSlot: result.newSlot
          });
        }
        // If rescheduling fails, log but still create the flight (don't block batch)
        else {
          console.log(`[BATCH] Could not reschedule ${maint.checkType} on ${maintDate}: ${result.error}`);
        }
      }
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

    // Optimize maintenance positions on all affected dates
    const allDates = new Set();
    for (const flight of flightsToCreate) {
      allDates.add(flight.scheduledDate);
      if (flight.arrivalDate && flight.arrivalDate !== flight.scheduledDate) {
        allDates.add(flight.arrivalDate);
      }
    }
    await optimizeMaintenanceForDates(aircraftId, [...allDates]);

    // Re-run auto-scheduler in background (don't block the response)
    refreshAutoScheduledMaintenance(aircraftId, activeWorldId).catch(e =>
      console.log('[BATCH] Auto-scheduler re-run failed:', e.message)
    );

    res.status(201).json({
      created: completeFlightData,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      rescheduledMaintenance: rescheduledMaintenance.length > 0 ? rescheduledMaintenance : undefined
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

    const aircraftId = scheduledFlight.aircraftId;
    await scheduledFlight.destroy();

    // Re-optimize maintenance in background (don't block the response)
    refreshAutoScheduledMaintenance(aircraftId, activeWorldId).catch(e =>
      console.log('[DELETE] Auto-scheduler re-run failed:', e.message)
    );

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

    // Re-optimize maintenance in background (don't block the response)
    refreshAutoScheduledMaintenance(scheduledFlight.aircraftId, activeWorldId).catch(e =>
      console.log('[UPDATE] Auto-scheduler re-run failed:', e.message)
    );

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

    // Get user's aircraft IDs first (single query)
    const userAircraftIds = await UserAircraft.findAll({
      where: { worldMembershipId },
      attributes: ['id'],
      raw: true
    }).then(rows => rows.map(r => r.id));

    if (userAircraftIds.length === 0) {
      return res.json({ maintenance: [], debug: { aircraftCount: 0 } });
    }

    // Fetch all active maintenance for user's aircraft in a single optimized query
    // Filter by date range at database level when possible
    let dateFilter = {};
    if (startDate && endDate) {
      // For scheduled maintenance, we need records where:
      // 1. scheduledDate is within range, OR
      // 2. For multi-day maintenance, scheduledDate is before range but extends into it
      // To be safe, fetch records from (startDate - 90 days) to cover long C/D checks
      const extendedStartDate = new Date(startDate);
      extendedStartDate.setDate(extendedStartDate.getDate() - 90);
      const extendedStartStr = extendedStartDate.toISOString().split('T')[0];

      dateFilter = {
        [Op.or]: [
          { scheduledDate: { [Op.between]: [extendedStartStr, endDate] } },
          { scheduledDate: null } // Legacy day-of-week patterns
        ]
      };
    }

    const recurringPatterns = await RecurringMaintenance.findAll({
      where: {
        aircraftId: { [Op.in]: userAircraftIds },
        status: 'active',
        ...dateFilter
      },
      include: [
        {
          model: UserAircraft,
          as: 'aircraft',
          attributes: ['id', 'registration', 'worldMembershipId'],
          include: [
            { model: Aircraft, as: 'aircraft', attributes: ['id', 'manufacturer', 'model', 'variant'] }
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

        // Add all matching patterns for this day
        for (const pattern of recurringPatterns) {
          // Match by dayOfWeek (recurring pattern) OR by specific scheduledDate
          const matchesByDayOfWeek = pattern.dayOfWeek === dayOfWeek && !pattern.scheduledDate;

          // Normalize scheduledDate for comparison (could be Date object or string)
          let patternDateStr = null;
          if (pattern.scheduledDate) {
            if (pattern.scheduledDate instanceof Date) {
              patternDateStr = pattern.scheduledDate.toISOString().split('T')[0];
            } else {
              patternDateStr = String(pattern.scheduledDate).split('T')[0];
            }
          }

          // For multi-day maintenance (C, D checks) or overnight maintenance (A checks),
          // check if current date falls within maintenance period
          let matchesByDateRange = false;
          if (patternDateStr && ['A', 'C', 'D'].includes(pattern.checkType)) {
            const patternStart = new Date(patternDateStr + 'T00:00:00Z');

            // For A checks, calculate if it spans overnight
            // For C/D checks, use days-based calculation
            let daysSpan;
            if (pattern.checkType === 'A') {
              // A check: calculate based on start time + duration crossing midnight
              const startTimeParts = (pattern.startTime || '00:00:00').split(':');
              const startMinutes = parseInt(startTimeParts[0]) * 60 + parseInt(startTimeParts[1]);
              const endMinutes = startMinutes + (pattern.duration || 540);
              daysSpan = Math.ceil(endMinutes / 1440); // How many calendar days it spans
            } else {
              // C/D checks: days-based
              daysSpan = Math.ceil((pattern.duration || 60) / 1440);
            }

            const patternEnd = new Date(patternStart);
            patternEnd.setUTCDate(patternEnd.getUTCDate() + daysSpan - 1); // -1 because start day counts

            const checkDate = new Date(dateStr + 'T00:00:00Z');
            matchesByDateRange = checkDate >= patternStart && checkDate <= patternEnd;
          }

          const matchesByDate = patternDateStr === dateStr;

          if (matchesByDayOfWeek || matchesByDate || matchesByDateRange) {
            // Generate a maintenance block for this date
            // For multi-day maintenance on subsequent days, adjust the display
            const isMultiDayOngoing = matchesByDateRange && !matchesByDate;

            // For A checks: only create ONE block (on the scheduled date), not separate ongoing blocks
            // The single block will include spansOvernight info for frontend rendering
            if (pattern.checkType === 'A' && isMultiDayOngoing) {
              // Skip creating the "day 2" ongoing block for A checks
              // The original block already has all the info needed
              continue;
            }

            // Calculate display duration for the current day
            let displayDuration = pattern.duration;
            if (isMultiDayOngoing) {
              // For C/D checks: full day on subsequent days
              displayDuration = 1440;
            }

            // For A checks, check if it spans overnight
            let spansOvernight = false;
            let endTimeNextDay = null;
            if (pattern.checkType === 'A') {
              const startTimeParts = (pattern.startTime || '00:00:00').split(':');
              const startMinutes = parseInt(startTimeParts[0]) * 60 + parseInt(startTimeParts[1]);
              const endMinutes = startMinutes + (pattern.duration || 540);
              if (endMinutes > 1440) {
                spansOvernight = true;
                const nextDayMinutes = endMinutes - 1440;
                const nextDayHours = Math.floor(nextDayMinutes / 60);
                const nextDayMins = nextDayMinutes % 60;
                endTimeNextDay = `${String(nextDayHours).padStart(2, '0')}:${String(nextDayMins).padStart(2, '0')}`;
              }
            }

            maintenanceBlocks.push({
              id: `${pattern.id}-${dateStr}`, // Composite ID for frontend tracking
              patternId: pattern.id,
              aircraftId: pattern.aircraftId,
              checkType: pattern.checkType,
              scheduledDate: isMultiDayOngoing ? patternDateStr : dateStr, // Original start date for reference
              displayDate: dateStr, // The date this block is being displayed on
              startTime: isMultiDayOngoing ? '00:00:00' : pattern.startTime, // Full day for ongoing
              duration: pattern.duration, // Always use full duration for progress calculation
              displayDuration: displayDuration, // Display duration for this day
              status: 'scheduled',
              isOngoing: isMultiDayOngoing, // Flag to indicate this is an ongoing multi-day block (only for C/D)
              spansOvernight: spansOvernight, // For A checks that go past midnight
              endTimeNextDay: endTimeNextDay, // End time on the next day (e.g., "07:00")
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

    // Auto-optimize maintenance positions (reposition daily checks before flights)
    // Group by aircraftId and collect dates
    const aircraftDates = new Map();
    for (const block of maintenanceBlocks) {
      if (block.checkType === 'daily') {
        if (!aircraftDates.has(block.aircraftId)) {
          aircraftDates.set(block.aircraftId, new Set());
        }
        aircraftDates.get(block.aircraftId).add(block.scheduledDate);
      }
    }

    // Optimize each aircraft's maintenance
    for (const [acId, dates] of aircraftDates) {
      try {
        await optimizeMaintenanceForDates(acId, [...dates]);
      } catch (optError) {
        console.error(`Error optimizing maintenance for aircraft ${acId}:`, optError.message);
      }
    }

    // Re-fetch maintenance after optimization to get updated times
    const updatedPatterns = await RecurringMaintenance.findAll({
      where: { status: 'active' },
      include: [{
        model: UserAircraft,
        as: 'aircraft',
        where: { worldMembershipId: worldMembershipId },
        include: [{ model: Aircraft, as: 'aircraft' }]
      }]
    });

    // Rebuild maintenance blocks with updated times
    const updatedBlocks = [];
    const updatedStart = new Date(startDate || new Date().toISOString().split('T')[0]);
    const updatedEnd = new Date(endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

    const curDate = new Date(updatedStart);
    while (curDate <= updatedEnd) {
      const dateStr = curDate.toISOString().split('T')[0];
      for (const pattern of updatedPatterns) {
        let patternDateStr = null;
        if (pattern.scheduledDate) {
          patternDateStr = pattern.scheduledDate instanceof Date
            ? pattern.scheduledDate.toISOString().split('T')[0]
            : String(pattern.scheduledDate).split('T')[0];
        }

        // For multi-day maintenance (C, D checks) or overnight maintenance (A checks),
        // check if current date falls within maintenance period
        let matchesByDateRange = false;
        if (patternDateStr && ['A', 'C', 'D'].includes(pattern.checkType)) {
          const patternStart = new Date(patternDateStr + 'T00:00:00Z');

          // For A checks, calculate if it spans overnight
          // For C/D checks, use days-based calculation
          let daysSpan;
          if (pattern.checkType === 'A') {
            // A check: calculate based on start time + duration crossing midnight
            const startTimeParts = (pattern.startTime || '00:00:00').split(':');
            const startMinutes = parseInt(startTimeParts[0]) * 60 + parseInt(startTimeParts[1]);
            const endMinutes = startMinutes + (pattern.duration || 540);
            daysSpan = Math.ceil(endMinutes / 1440); // How many calendar days it spans
          } else {
            // C/D checks: days-based
            daysSpan = Math.ceil((pattern.duration || 60) / 1440);
          }

          const patternEnd = new Date(patternStart);
          patternEnd.setUTCDate(patternEnd.getUTCDate() + daysSpan - 1); // -1 because start day counts

          const checkDate = new Date(dateStr + 'T00:00:00Z');
          matchesByDateRange = checkDate >= patternStart && checkDate <= patternEnd;
        }

        const matchesByDate = patternDateStr === dateStr;

        if (matchesByDate || matchesByDateRange) {
          // For multi-day maintenance on subsequent days, adjust the display
          const isMultiDayOngoing = matchesByDateRange && !matchesByDate;

          // For A checks: only create ONE block (on the scheduled date), not separate ongoing blocks
          if (pattern.checkType === 'A' && isMultiDayOngoing) {
            // Skip creating the "day 2" ongoing block for A checks
            continue;
          }

          // Calculate display duration for the current day
          let displayDuration = pattern.duration;
          if (isMultiDayOngoing) {
            // For C/D checks: full day on subsequent days
            displayDuration = 1440;
          }

          // For A checks, check if it spans overnight
          let spansOvernight = false;
          let endTimeNextDay = null;
          if (pattern.checkType === 'A') {
            const startTimeParts = (pattern.startTime || '00:00:00').split(':');
            const startMinutes = parseInt(startTimeParts[0]) * 60 + parseInt(startTimeParts[1]);
            const endMinutes = startMinutes + (pattern.duration || 540);
            if (endMinutes > 1440) {
              spansOvernight = true;
              const nextDayMinutes = endMinutes - 1440;
              const nextDayHours = Math.floor(nextDayMinutes / 60);
              const nextDayMins = nextDayMinutes % 60;
              endTimeNextDay = `${String(nextDayHours).padStart(2, '0')}:${String(nextDayMins).padStart(2, '0')}`;
            }
          }

          updatedBlocks.push({
            id: `${pattern.id}-${dateStr}`,
            patternId: pattern.id,
            aircraftId: pattern.aircraftId,
            checkType: pattern.checkType,
            scheduledDate: isMultiDayOngoing ? patternDateStr : dateStr, // Original start date for reference
            displayDate: dateStr, // The date this block is being displayed on
            startTime: isMultiDayOngoing ? '00:00:00' : pattern.startTime, // Full day for ongoing
            duration: pattern.duration, // Always use full duration for progress calculation
            displayDuration: displayDuration, // Display duration for this day
            status: 'scheduled',
            isOngoing: isMultiDayOngoing, // Flag to indicate this is an ongoing multi-day block (only for C/D)
            spansOvernight: spansOvernight, // For A checks that go past midnight
            endTimeNextDay: endTimeNextDay, // End time on the next day (e.g., "07:00")
            aircraft: pattern.aircraft
          });
        }
      }
      curDate.setUTCDate(curDate.getUTCDate() + 1);
    }

    updatedBlocks.sort((a, b) => {
      if (a.scheduledDate !== b.scheduledDate) return a.scheduledDate.localeCompare(b.scheduledDate);
      return a.startTime.localeCompare(b.startTime);
    });

    // Include debug info in response
    const debugInfo = {
      requestedRange: { startDate, endDate },
      patternsFound: updatedPatterns.length,
      patterns: updatedPatterns.map(p => ({
        aircraft: p.aircraft?.registration,
        checkType: p.checkType,
        scheduledDate: p.scheduledDate,
        dayOfWeek: p.dayOfWeek
      })),
      blocksGenerated: updatedBlocks.length,
      optimized: true
    };

    res.json({ maintenance: updatedBlocks, debug: debugInfo });
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

    // Validate check type and set duration
    if (!['daily', 'weekly', 'A', 'C', 'D'].includes(checkType)) {
      return res.status(400).json({ error: 'Invalid check type. Must be daily, weekly, A, C, or D' });
    }

    // Duration in minutes: daily=60 (1hr), weekly=135 (2.25hrs), A=540 (9hrs), C=30240 (21 days), D=108000 (75 days)
    const durationMap = { 'daily': 60, 'weekly': 135, 'A': 540, 'C': 30240, 'D': 108000 };
    const duration = durationMap[checkType];

    // Get day of week from scheduledDate
    const [year, month, day] = scheduledDate.split('-').map(Number);
    const baseDate = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = baseDate.getUTCDay(); // 0=Sunday, 6=Saturday

    // Determine which day-of-week patterns to create
    const daysToSchedule = [];

    if (repeat) {
      if (checkType === 'daily') {
        // Daily checks: create pattern for every day of the week (0-6)
        for (let i = 0; i < 7; i++) {
          daysToSchedule.push(i);
        }
      } else if (['C', 'D'].includes(checkType)) {
        // C and D checks: one-time only (they take weeks/months and repeat yearly, not weekly)
        daysToSchedule.push(dayOfWeek);
      } else {
        // weekly/A checks: create pattern for the selected day only (weekly repeat)
        daysToSchedule.push(dayOfWeek);
      }
    } else {
      // Non-repeating: create pattern for just this day
      daysToSchedule.push(dayOfWeek);
    }

    console.log(`Creating recurring ${checkType} check patterns for days: ${daysToSchedule}`);

    // Calculate maintenance window in minutes
    const [maintH, maintM] = startTime.split(':').map(Number);
    const maintStartMinutes = maintH * 60 + maintM;
    const maintEndMinutes = maintStartMinutes + duration;

    // Check for conflicting flights on the scheduled date for each day
    // We need to check the specific scheduledDate first
    const existingFlights = await ScheduledFlight.findAll({
      where: {
        aircraftId,
        scheduledDate: scheduledDate
      },
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
          include: [{ model: Aircraft, as: 'aircraft' }]
        }
      ]
    });

    // Check each existing flight for overlap with the maintenance window
    for (const existingFlight of existingFlights) {
      // Calculate existing flight's operation window
      const existingAcType = existingFlight.aircraft?.aircraft?.type || 'Narrowbody';
      const existingPax = existingFlight.aircraft?.aircraft?.passengerCapacity || 150;
      const existingDist = existingFlight.route?.distance || 0;

      // Calculate existing pre-flight duration
      let exCatering = 0;
      if (existingPax >= 50 && existingAcType !== 'Cargo') {
        if (existingPax < 100) exCatering = 5;
        else if (existingPax < 200) exCatering = 10;
        else exCatering = 15;
      }
      let exBoarding = 0;
      if (existingAcType !== 'Cargo') {
        if (existingPax < 50) exBoarding = 10;
        else if (existingPax < 100) exBoarding = 15;
        else if (existingPax < 200) exBoarding = 20;
        else if (existingPax < 300) exBoarding = 25;
        else exBoarding = 35;
      }
      let exFuelling = 0;
      if (existingDist < 500) exFuelling = 10;
      else if (existingDist < 1500) exFuelling = 15;
      else if (existingDist < 3000) exFuelling = 20;
      else exFuelling = 25;
      const exPreFlight = Math.max(exCatering + exBoarding, exFuelling);

      // Calculate existing post-flight duration
      let exDeboard = 0;
      if (existingAcType !== 'Cargo') {
        if (existingPax < 50) exDeboard = 5;
        else if (existingPax < 100) exDeboard = 8;
        else if (existingPax < 200) exDeboard = 12;
        else if (existingPax < 300) exDeboard = 15;
        else exDeboard = 20;
      }
      let exClean;
      if (existingPax < 50) exClean = 5;
      else if (existingPax < 100) exClean = 10;
      else if (existingPax < 200) exClean = 15;
      else if (existingPax < 300) exClean = 20;
      else exClean = 25;
      const exPostFlight = exDeboard + exClean;

      // Calculate flight operation window in minutes from midnight
      const [exDepH, exDepM] = existingFlight.departureTime.split(':').map(Number);
      const exDepMinutes = exDepH * 60 + exDepM;
      const flightOpStart = exDepMinutes - exPreFlight;

      const [exArrH, exArrM] = existingFlight.arrivalTime.split(':').map(Number);
      const exArrMinutes = exArrH * 60 + exArrM;
      // If flight spans overnight, add 24 hours to arrival
      let flightOpEnd = exArrMinutes + exPostFlight;
      if (existingFlight.arrivalDate !== existingFlight.scheduledDate) {
        flightOpEnd += 1440; // Add 24 hours for overnight flights
      }

      // Check for overlap
      const overlaps = maintStartMinutes < flightOpEnd && maintEndMinutes > flightOpStart;

      if (overlaps) {
        const depAirport = existingFlight.route?.departureAirport?.iataCode || existingFlight.route?.departureAirport?.icaoCode || '???';
        const arrAirport = existingFlight.route?.arrivalAirport?.iataCode || existingFlight.route?.arrivalAirport?.icaoCode || '???';
        const routeNum = existingFlight.route?.routeNumber || 'Unknown';
        const returnNum = existingFlight.route?.returnRouteNumber || '';

        // Format date as DD/MM/YYYY
        const exDateParts = existingFlight.scheduledDate.split('-');
        const formattedExDate = `${exDateParts[2]}/${exDateParts[1]}/${exDateParts[0]}`;

        const checkNames = { 'daily': 'Daily Check', 'weekly': 'Weekly Check', 'A': 'A Check' };
        const checkName = checkNames[checkType] || `${checkType} Check`;

        return res.status(409).json({
          error: 'Schedule conflict detected',
          conflict: {
            type: 'flight',
            routeNumber: routeNum,
            returnRouteNumber: returnNum,
            departure: depAirport,
            arrival: arrAirport,
            date: formattedExDate,
            departureTime: existingFlight.departureTime.substring(0, 5),
            arrivalTime: existingFlight.arrivalTime.substring(0, 5),
            message: `${checkName} conflicts with ${routeNum}/${returnNum} (${depAirport}→${arrAirport}) on ${formattedExDate} departing ${existingFlight.departureTime.substring(0, 5)}`
          }
        });
      }
    }

    // Create recurring maintenance patterns
    const createdPatterns = [];
    for (const day of daysToSchedule) {
      // Check for conflicts with other maintenance (same aircraft, overlapping time window)
      // For scheduled (one-time) maintenance, also check if the dates overlap
      const existingMaintenance = await RecurringMaintenance.findAll({
        where: {
          aircraftId,
          dayOfWeek: day,
          status: 'active'
        }
      });

      let maintConflict = null;
      for (const existing of existingMaintenance) {
        // For multi-day maintenance (C, D checks), check if date ranges overlap
        if (existing.scheduledDate) {
          const existingDateStr = existing.scheduledDate instanceof Date
            ? existing.scheduledDate.toISOString().split('T')[0]
            : String(existing.scheduledDate).split('T')[0];

          // Calculate when existing maintenance ends
          const existingStartDate = new Date(existingDateStr + 'T00:00:00Z');
          const existingDuration = existing.duration || 60;
          const existingDaysSpan = Math.ceil(existingDuration / 1440); // Days the maintenance spans
          const existingEndDate = new Date(existingStartDate);
          existingEndDate.setUTCDate(existingEndDate.getUTCDate() + existingDaysSpan);

          // Calculate when new maintenance would end
          const newStartDate = new Date(scheduledDate + 'T00:00:00Z');
          const newDaysSpan = Math.ceil(duration / 1440);
          const newEndDate = new Date(newStartDate);
          newEndDate.setUTCDate(newEndDate.getUTCDate() + newDaysSpan);

          // Check if date ranges overlap
          const datesOverlap = newStartDate < existingEndDate && newEndDate > existingStartDate;

          if (!datesOverlap) {
            // If dates don't overlap, this existing maintenance is not a conflict
            continue;
          }
        }

        // Check time overlap within the day
        const [exMaintH, exMaintM] = String(existing.startTime).split(':').map(Number);
        const exMaintStart = exMaintH * 60 + exMaintM;
        const exMaintEnd = exMaintStart + existing.duration;

        const overlaps = maintStartMinutes < exMaintEnd && maintEndMinutes > exMaintStart;
        if (overlaps) {
          maintConflict = existing;
          break;
        }
      }

      if (maintConflict) {
        console.log(`Conflict found for day ${day} at ${startTime} with existing maintenance on ${maintConflict.scheduledDate}, skipping`);
        continue;
      }

      // If this is a smaller check, check if there's a larger check on this day
      if (checkType === 'daily') {
        const weeklyCheckExists = await RecurringMaintenance.findOne({
          where: {
            aircraftId,
            dayOfWeek: day,
            checkType: 'weekly',
            status: 'active'
          }
        });

        if (weeklyCheckExists) {
          console.log(`Weekly check exists for day ${day}, skipping daily check`);
          continue;
        }
      }

      // Create recurring maintenance pattern
      console.log(`Creating maintenance pattern for day ${day} at ${startTime} on ${scheduledDate}`);
      const pattern = await RecurringMaintenance.create({
        aircraftId,
        checkType,
        dayOfWeek: day,
        scheduledDate,  // Include the specific date for display
        startTime,
        duration,
        status: 'active'
      });

      createdPatterns.push(pattern.id);
    }

    console.log(`Created ${createdPatterns.length} recurring maintenance patterns`);

    // If no patterns were created (all skipped due to conflicts), return an error
    if (createdPatterns.length === 0) {
      return res.status(409).json({
        error: 'No maintenance scheduled - conflicts with existing maintenance on this day/time'
      });
    }

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

    console.log(`[MAINT] Returning ${completePatternData.length} patterns:`, completePatternData.map(p => ({
      id: p.id,
      checkType: p.checkType,
      scheduledDate: p.scheduledDate,
      dayOfWeek: p.dayOfWeek,
      startTime: p.startTime
    })));

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

    // If ID is composite (uuid-YYYY-MM-DD format), extract the UUID
    // Use regex to safely detect a trailing date without corrupting valid UUIDs
    const dateSuffix = id.match(/-\d{4}-\d{2}-\d{2}$/);
    if (dateSuffix) {
      id = id.slice(0, id.length - dateSuffix[0].length);
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
 * DELETE /api/schedule/maintenance/aircraft/:aircraftId/type/:checkType
 * Delete all recurring maintenance patterns of a specific type for an aircraft
 */
router.delete('/maintenance/aircraft/:aircraftId/type/:checkType', async (req, res) => {
  try {
    const { aircraftId, checkType } = req.params;

    // Validate checkType
    if (!['weekly', 'A'].includes(checkType)) {
      return res.status(400).json({ error: 'Invalid check type. Must be weekly or A.' });
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

    // Verify the aircraft belongs to this user
    const aircraft = await UserAircraft.findOne({
      where: {
        id: aircraftId,
        worldMembershipId: membership.id
      }
    });

    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found or not owned by user' });
    }

    // Delete all recurring maintenance of this type for this aircraft
    const deletedCount = await RecurringMaintenance.destroy({
      where: {
        aircraftId: aircraftId,
        checkType: checkType
      }
    });

    const checkTypeName = checkType === 'A' ? 'daily checks' : 'weekly checks';
    res.json({
      message: `All ${checkTypeName} deleted successfully`,
      deletedCount: deletedCount
    });
  } catch (error) {
    console.error('Error deleting all maintenance of type:', error);
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

    // Get current world time for including scheduled flights that are actually airborne
    const worldTimeService = require('../services/worldTimeService');
    const worldTime = worldTimeService.getCurrentTime(activeWorldId);
    const currentDate = worldTime ? worldTime.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const currentTimeStr = worldTime ? worldTime.toTimeString().split(' ')[0] : new Date().toTimeString().split(' ')[0];

    // Fetch flights that are either:
    // 1. Already marked as 'in_progress', OR
    // 2. Scheduled flights that have departed (scheduled date = today AND departure time <= now)
    const activeFlights = await ScheduledFlight.findAll({
      where: {
        [Op.or]: [
          { status: 'in_progress' },
          {
            status: 'scheduled',
            scheduledDate: currentDate,
            departureTime: { [Op.lte]: currentTimeStr }
          }
        ]
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

    // Get current world time for including scheduled flights that are actually airborne
    const worldTimeService = require('../services/worldTimeService');
    const worldTime = worldTimeService.getCurrentTime(activeWorldId);
    const currentDate = worldTime ? worldTime.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const currentTimeStr = worldTime ? worldTime.toTimeString().split(' ')[0] : new Date().toTimeString().split(' ')[0];

    // Fetch all active flights in this world (including scheduled flights that have departed)
    const activeFlights = await ScheduledFlight.findAll({
      where: {
        [Op.or]: [
          { status: 'in_progress' },
          {
            status: 'scheduled',
            scheduledDate: currentDate,
            departureTime: { [Op.lte]: currentTimeStr }
          }
        ]
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
