const World = require('../models/World');
const { WorldMembership, User, ScheduledFlight, Route, UserAircraft, Aircraft, RecurringMaintenance } = require('../models');
const { Op } = require('sequelize');
const { calculateFlightDurationMs } = require('../utils/flightCalculations');

/**
 * World Time Service
 * Manages the continuous progression of game time with acceleration for multiple worlds
 */
class WorldTimeService {
  constructor() {
    this.tickRate = 1000; // Update every 1 second (real time)
    this.worlds = new Map(); // Map of worldId -> { world, tickInterval, inMemoryTime, lastTickAt }
    // Throttle heavy DB queries to reduce load on remote databases
    this.lastCreditCheck = 0; // Timestamp of last credit check
    this.lastFlightCheck = 0; // Timestamp of last flight check
    this.lastMaintenanceCheck = 0; // Timestamp of last maintenance check
    this.lastMaintenanceRefresh = {}; // Map of worldId -> last game week refreshed
    this.creditCheckInterval = 30000; // Check credits every 30 seconds (real time)
    this.flightCheckInterval = 5000; // Check flights every 5 seconds (real time)
    this.maintenanceCheckInterval = 10000; // Check maintenance every 10 seconds (real time)
    this.isProcessingCredits = false; // Prevent overlapping credit queries
    this.isProcessingFlights = false; // Prevent overlapping flight queries
    this.isProcessingMaintenance = false; // Prevent overlapping maintenance queries
    this.isRefreshingMaintenance = false; // Prevent overlapping maintenance refresh
  }

  /**
   * Start time progression for all active worlds
   */
  async startAll() {
    try {
      const activeWorlds = await World.findAll({
        where: { status: 'active' }
      });

      if (activeWorlds.length === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log('⚠ No active worlds found. Create a world first.');
        }
        return false;
      }

      for (const world of activeWorlds) {
        await this.startWorld(world.id);
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`✓ World Time Service started for ${activeWorlds.length} world(s)`);
      }

      return true;
    } catch (error) {
      console.error('✗ Failed to start World Time Service:', error.message);
      return false;
    }
  }

  /**
   * Start time progression for a specific world
   */
  async startWorld(worldId) {
    try {
      // Don't start if already running
      if (this.worlds.has(worldId)) {
        return true;
      }

      const world = await World.findByPk(worldId);
      if (!world || world.status !== 'active') {
        return false;
      }

      const now = new Date();

      // Calculate catch-up time: time that passed while server was off
      let catchUpTime = new Date(world.currentTime);
      if (world.lastTickAt) {
        const realTimeSinceLastTick = (now.getTime() - world.lastTickAt.getTime()) / 1000; // seconds
        const gameTimeToAdd = realTimeSinceLastTick * world.timeAcceleration; // seconds
        catchUpTime = new Date(world.currentTime.getTime() + (gameTimeToAdd * 1000));

        if (process.env.NODE_ENV === 'development') {
          const minutesOffline = Math.round(realTimeSinceLastTick / 60);
          const gameHoursAdded = Math.round(gameTimeToAdd / 3600);
          console.log(`  Catching up ${minutesOffline} min offline → +${gameHoursAdded} game hours`);
        }
      }

      // Update database with caught-up time
      await world.sequelize.query(
        'UPDATE worlds SET "current_time" = :currentTime, "last_tick_at" = :lastTickAt WHERE id = :worldId',
        {
          replacements: {
            currentTime: catchUpTime,
            lastTickAt: now,
            worldId: world.id
          }
        }
      );

      // Update the world object's currentTime to match
      world.currentTime = catchUpTime;

      // Store world state in memory with caught-up time
      const worldState = {
        world: world,
        inMemoryTime: catchUpTime,
        lastTickAt: now,
        tickInterval: null
      };

      this.worlds.set(worldId, worldState);

      // Start the tick loop for this world
      worldState.tickInterval = setInterval(() => this.tick(worldId), this.tickRate);

      if (process.env.NODE_ENV === 'development') {
        console.log(`✓ Started world: ${world.name} (${world.timeAcceleration}x)`);
      }

      return true;
    } catch (error) {
      console.error(`✗ Failed to start world ${worldId}:`, error.message);
      return false;
    }
  }

  /**
   * Stop time progression for a specific world
   */
  stopWorld(worldId) {
    const worldState = this.worlds.get(worldId);
    if (worldState && worldState.tickInterval) {
      clearInterval(worldState.tickInterval);
      this.worlds.delete(worldId);
      if (process.env.NODE_ENV === 'development') {
        console.log(`✓ Stopped world: ${worldState.world.name}`);
      }
    }
  }

  /**
   * Stop all worlds
   */
  async stopAll() {
    // Save final state for all worlds before stopping
    const savePromises = [];
    for (const [worldId, worldState] of this.worlds.entries()) {
      if (worldState.tickInterval) {
        clearInterval(worldState.tickInterval);
      }

      // Save final time to database
      const now = new Date();
      savePromises.push(
        worldState.world.sequelize.query(
          'UPDATE worlds SET "current_time" = :currentTime, "last_tick_at" = :lastTickAt WHERE id = :worldId',
          {
            replacements: {
              currentTime: worldState.inMemoryTime,
              lastTickAt: now,
              worldId: worldId
            }
          }
        )
      );
    }

    // Wait for all saves to complete
    await Promise.all(savePromises);

    this.worlds.clear();
    if (process.env.NODE_ENV === 'development') {
      console.log('✓ World Time Service stopped all worlds and saved final state');
    }
  }

  /**
   * Main tick function - advances game time for a specific world
   */
  async tick(worldId) {
    const worldState = this.worlds.get(worldId);
    if (!worldState) return;

    const { world, inMemoryTime, lastTickAt } = worldState;

    try {
      // Check if world should be operating
      if (world.isPaused) {
        return;
      }

      const now = new Date();
      const realElapsedSeconds = (now.getTime() - lastTickAt.getTime()) / 1000;

      // Calculate game time advancement (in seconds)
      const gameTimeAdvancement = realElapsedSeconds * world.timeAcceleration;

      // Update in-memory time
      const newGameTime = new Date(inMemoryTime.getTime() + (gameTimeAdvancement * 1000));
      worldState.inMemoryTime = newGameTime;
      worldState.lastTickAt = now;

      // Save to database every 10 seconds to reduce DB load
      const shouldSave = Math.floor(now.getTime() / 10000) !== Math.floor(lastTickAt.getTime() / 10000);

      if (shouldSave) {
        await world.sequelize.query(
          'UPDATE worlds SET "current_time" = :currentTime, "last_tick_at" = :lastTickAt, "updated_at" = :updatedAt WHERE id = :worldId',
          {
            replacements: {
              currentTime: newGameTime,
              lastTickAt: now,
              updatedAt: now,
              worldId: world.id
            }
          }
        );
      }

      // Emit tick event for other systems to react
      this.onTick(worldId, newGameTime, gameTimeAdvancement);

    } catch (error) {
      console.error(`World tick error (${world.name}):`, error.message);
    }
  }

  /**
   * Hook for other systems to react to time progression
   */
  onTick(worldId, gameTime, advancementSeconds) {
    // Emit via Socket.IO if available
    if (global.io) {
      const worldState = this.worlds.get(worldId);
      global.io.emit('world:tick', {
        worldId: worldId,
        gameTime: gameTime.toISOString(),
        advancement: advancementSeconds,
        timeAcceleration: worldState ? worldState.world.timeAcceleration : 60
      });
    }

    const now = Date.now();

    // Check for credit deductions (throttled to reduce DB load)
    if (!this.isProcessingCredits && now - this.lastCreditCheck >= this.creditCheckInterval) {
      this.lastCreditCheck = now;
      this.isProcessingCredits = true;
      this.processCredits(worldId, gameTime)
        .catch(err => console.error('Error processing credits:', err.message))
        .finally(() => { this.isProcessingCredits = false; });
    }

    // Process flight statuses (throttled to reduce DB load)
    if (!this.isProcessingFlights && now - this.lastFlightCheck >= this.flightCheckInterval) {
      this.lastFlightCheck = now;
      this.isProcessingFlights = true;
      this.processFlights(worldId, gameTime)
        .catch(err => console.error('Error processing flights:', err.message))
        .finally(() => { this.isProcessingFlights = false; });
    }

    // Process maintenance checks (throttled to reduce DB load)
    if (!this.isProcessingMaintenance && now - this.lastMaintenanceCheck >= this.maintenanceCheckInterval) {
      this.lastMaintenanceCheck = now;
      this.isProcessingMaintenance = true;
      this.processMaintenance(worldId, gameTime)
        .catch(err => console.error('Error processing maintenance:', err.message))
        .finally(() => { this.isProcessingMaintenance = false; });
    }

    // Refresh auto-scheduled maintenance once per game week
    // This ensures daily/weekly checks are continuously scheduled ahead
    const gameWeek = Math.floor(gameTime.getTime() / (7 * 24 * 60 * 60 * 1000));
    const lastRefreshWeek = this.lastMaintenanceRefresh[worldId] || 0;
    if (!this.isRefreshingMaintenance && gameWeek > lastRefreshWeek) {
      this.lastMaintenanceRefresh[worldId] = gameWeek;
      this.isRefreshingMaintenance = true;
      this.refreshMaintenanceSchedules(worldId)
        .catch(err => console.error('Error refreshing maintenance schedules:', err.message))
        .finally(() => { this.isRefreshingMaintenance = false; });
    }
  }

  /**
   * Process credit deductions for all active memberships in a world
   * Credits are deducted every Monday at 00:01 game time (1 credit per week)
   */
  async processCredits(worldId, currentGameTime) {
    const worldState = this.worlds.get(worldId);
    if (!worldState) return;

    const gameTime = new Date(currentGameTime);
    const dayOfWeek = gameTime.getDay(); // 0 = Sunday, 1 = Monday
    const hour = gameTime.getHours();
    const minute = gameTime.getMinutes();

    // Only process on Monday between 00:01 and 00:10 game time
    // (10 minute window to ensure we catch it with the tick interval)
    if (dayOfWeek !== 1 || hour !== 0 || minute < 1 || minute > 10) {
      return;
    }

    try {
      // Get all active memberships for this world
      const memberships = await WorldMembership.findAll({
        where: {
          worldId: worldId,
          isActive: true
        },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'credits']
        }]
      });

      // Get the Monday at 00:01 timestamp for this week (for comparison)
      const thisMondayMorning = new Date(gameTime);
      thisMondayMorning.setHours(0, 1, 0, 0);

      for (const membership of memberships) {
        // Check if we already processed this Monday
        const lastDeduction = membership.lastCreditDeduction ? new Date(membership.lastCreditDeduction) : null;

        // Skip if we already deducted this Monday (compare dates, not exact times)
        if (lastDeduction) {
          const lastDeductionDate = lastDeduction.toISOString().split('T')[0];
          const todayDate = thisMondayMorning.toISOString().split('T')[0];
          if (lastDeductionDate === todayDate) {
            continue; // Already processed this Monday
          }
        }

        // Deduct 1 credit for this week
        if (membership.user) {
          membership.user.credits -= 1;
          await membership.user.save();

          // Update last deduction time to this Monday
          membership.lastCreditDeduction = thisMondayMorning;
          await membership.save();

          if (process.env.NODE_ENV === 'development') {
            console.log(`[Monday 00:01] Deducted 1 credit from user ${membership.user.id} for world ${worldState.world.name}. New balance: ${membership.user.credits}`);
          }

          // Check if user has fallen below -4 (enter administration)
          if (membership.user.credits < -4) {
            if (process.env.NODE_ENV === 'development') {
              console.log(`User ${membership.user.id} has entered administration (credits: ${membership.user.credits})`);
            }
            // TODO: Implement administration logic (sell assets, etc.)
          }
        }
      }
    } catch (error) {
      console.error('Error processing credits:', error);
    }
  }

  /**
   * Process flight status updates for a world
   * - Scheduled flights that should have departed -> in_progress
   * - In-progress flights that should have arrived -> completed
   */
  async processFlights(worldId, currentGameTime) {
    const worldState = this.worlds.get(worldId);
    if (!worldState) return;

    try {
      // Get all memberships for this world to find their routes
      const memberships = await WorldMembership.findAll({
        where: { worldId: worldId, isActive: true },
        attributes: ['id']
      });

      const membershipIds = memberships.map(m => m.id);
      if (membershipIds.length === 0) return;

      // Get current game date and time
      const gameDate = currentGameTime.toISOString().split('T')[0]; // YYYY-MM-DD
      const gameTimeStr = currentGameTime.toTimeString().split(' ')[0]; // HH:MM:SS

      // 1a. Find scheduled flights from TODAY that should now be in_progress
      const flightsToStart = await ScheduledFlight.findAll({
        where: {
          status: 'scheduled',
          scheduledDate: gameDate,
          departureTime: { [Op.lte]: gameTimeStr }
        },
        include: [{
          model: Route,
          as: 'route',
          where: { worldMembershipId: { [Op.in]: membershipIds } }
        }]
      });

      for (const flight of flightsToStart) {
        await flight.update({ status: 'in_progress' });
        if (process.env.NODE_ENV === 'development') {
          console.log(`✈ Flight ${flight.route.routeNumber} started (${flight.route.departureAirportId} -> ${flight.route.arrivalAirportId})`);
        }
      }

      // 1b. Find scheduled flights from PAST dates - mark as completed (missed flights)
      const missedFlights = await ScheduledFlight.findAll({
        where: {
          status: 'scheduled',
          scheduledDate: { [Op.lt]: gameDate }
        },
        include: [{
          model: Route,
          as: 'route',
          where: { worldMembershipId: { [Op.in]: membershipIds } }
        }]
      });

      for (const flight of missedFlights) {
        await flight.update({ status: 'completed' });
        if (process.env.NODE_ENV === 'development') {
          console.log(`⚠ Missed flight ${flight.route.routeNumber} from ${flight.scheduledDate} marked as completed`);
        }
      }

      // 2. Find in_progress flights that should now be completed
      // Calculate arrival time based on departure + flight duration
      const inProgressFlights = await ScheduledFlight.findAll({
        where: { status: 'in_progress' },
        include: [{
          model: Route,
          as: 'route',
          where: { worldMembershipId: { [Op.in]: membershipIds } },
          include: [
            { model: require('../models/Airport'), as: 'departureAirport' },
            { model: require('../models/Airport'), as: 'arrivalAirport' },
            { model: require('../models/Airport'), as: 'techStopAirport' }
          ]
        }, {
          model: UserAircraft,
          as: 'aircraft',
          include: [{ model: Aircraft, as: 'aircraft' }]
        }]
      });

      for (const flight of inProgressFlights) {
        // Get airport coordinates for wind calculation
        const depLat = parseFloat(flight.route.departureAirport?.latitude) || 0;
        const depLng = parseFloat(flight.route.departureAirport?.longitude) || 0;
        const arrLat = parseFloat(flight.route.arrivalAirport?.latitude) || 0;
        const arrLng = parseFloat(flight.route.arrivalAirport?.longitude) || 0;

        // Calculate flight duration with wind adjustment
        const distanceNm = parseFloat(flight.route.distance) || 500;
        const cruiseSpeed = flight.aircraft?.aircraft?.cruiseSpeed || 450; // knots

        // Get turnaround time (default 45 minutes)
        const turnaroundMinutes = flight.route.turnaroundTime || 45;
        const turnaroundMs = turnaroundMinutes * 60 * 1000;

        let totalFlightMs;

        // Check if route has a tech stop
        if (flight.route.techStopAirport) {
          const techLat = parseFloat(flight.route.techStopAirport.latitude) || 0;
          const techLng = parseFloat(flight.route.techStopAirport.longitude) || 0;

          // Calculate leg distances (approximate split)
          const leg1Distance = flight.route.legOneDistance || Math.round(distanceNm * 0.4);
          const leg2Distance = flight.route.legTwoDistance || Math.round(distanceNm * 0.6);

          const techStopMs = 30 * 60 * 1000; // 30 min tech stop

          // Leg 1: DEP → TECH
          const leg1Ms = calculateFlightDurationMs(leg1Distance, depLng, techLng, depLat, techLat, cruiseSpeed);
          // Leg 2: TECH → ARR
          const leg2Ms = calculateFlightDurationMs(leg2Distance, techLng, arrLng, techLat, arrLat, cruiseSpeed);
          // Leg 3: ARR → TECH (return)
          const leg3Ms = calculateFlightDurationMs(leg2Distance, arrLng, techLng, arrLat, techLat, cruiseSpeed);
          // Leg 4: TECH → DEP (return)
          const leg4Ms = calculateFlightDurationMs(leg1Distance, techLng, depLng, techLat, depLat, cruiseSpeed);

          // Total: leg1 + techStop + leg2 + turnaround + leg3 + techStop + leg4
          totalFlightMs = leg1Ms + techStopMs + leg2Ms + turnaroundMs + leg3Ms + techStopMs + leg4Ms;
        } else {
          // Standard direct route
          // Outbound: departure -> arrival (with wind effect)
          const outboundFlightMs = calculateFlightDurationMs(distanceNm, depLng, arrLng, depLat, arrLat, cruiseSpeed);

          // Return: arrival -> departure (opposite wind effect)
          const returnFlightMs = calculateFlightDurationMs(distanceNm, arrLng, depLng, arrLat, depLat, cruiseSpeed);

          // Calculate total round-trip duration: outbound + turnaround + return
          totalFlightMs = outboundFlightMs + turnaroundMs + returnFlightMs;
        }

        // Calculate expected completion time (after return leg)
        const departureDateTime = new Date(`${flight.scheduledDate}T${flight.departureTime}`);
        const expectedCompletion = new Date(departureDateTime.getTime() + totalFlightMs);

        // Check if flight should have completed the full round-trip
        if (currentGameTime >= expectedCompletion) {
          await flight.update({ status: 'completed' });

          // Record transit check completion (automatic between flights)
          if (flight.aircraft) {
            await flight.aircraft.update({ lastTransitCheckDate: currentGameTime });
            if (process.env.NODE_ENV === 'development') {
              console.log(`🔧 Transit check recorded for ${flight.aircraft.registration}`);
            }
          }

          if (process.env.NODE_ENV === 'development') {
            console.log(`✓ Flight ${flight.route.routeNumber} completed (full round-trip)`);
          }

          // TODO: Process revenue, update route statistics, etc.
        }
      }
    } catch (error) {
      console.error('Error processing flights:', error);
    }
  }

  /**
   * Process maintenance check completions for a world
   * When a scheduled maintenance slot completes, record the check date on the aircraft
   */
  async processMaintenance(worldId, currentGameTime) {
    const worldState = this.worlds.get(worldId);
    if (!worldState) return;

    try {
      // Get all memberships for this world
      const memberships = await WorldMembership.findAll({
        where: { worldId: worldId, isActive: true },
        attributes: ['id']
      });

      const membershipIds = memberships.map(m => m.id);
      if (membershipIds.length === 0) return;

      // Get current game day of week (0 = Sunday, 6 = Saturday)
      const gameDayOfWeek = currentGameTime.getDay();
      const gameTimeStr = currentGameTime.toTimeString().split(' ')[0]; // HH:MM:SS
      const gameDate = currentGameTime.toISOString().split('T')[0]; // YYYY-MM-DD

      // Find all active recurring maintenance for today
      // Match by dayOfWeek (recurring patterns) OR by scheduledDate (one-time scheduled checks)
      const maintenancePatterns = await RecurringMaintenance.findAll({
        where: {
          status: 'active',
          [Op.or]: [
            { dayOfWeek: gameDayOfWeek },
            { scheduledDate: gameDate }
          ]
        },
        include: [{
          model: UserAircraft,
          as: 'aircraft',
          where: { worldMembershipId: { [Op.in]: membershipIds } }
        }]
      });

      if (process.env.NODE_ENV === 'development' && maintenancePatterns.length > 0) {
        console.log(`🔧 Processing ${maintenancePatterns.length} maintenance patterns for day ${gameDayOfWeek}, time ${gameTimeStr}`);
      }

      for (const pattern of maintenancePatterns) {
        // Calculate when maintenance ends (startTime + duration)
        // startTime can be a string "15:00:00" or a Date object depending on DB driver
        let startTimeStr = pattern.startTime;
        if (pattern.startTime instanceof Date) {
          startTimeStr = pattern.startTime.toTimeString().split(' ')[0];
        }
        const startTimeParts = String(startTimeStr).split(':');
        const startHour = parseInt(startTimeParts[0], 10);
        const startMinute = parseInt(startTimeParts[1], 10);

        // Calculate end time in minutes from midnight
        const startMinutes = startHour * 60 + startMinute;
        const endMinutes = startMinutes + pattern.duration;

        // For multi-day maintenance (C, D checks), calculate actual completion date/time
        const daysSpanned = Math.floor(endMinutes / 1440); // 1440 minutes per day
        const endMinuteOfDay = endMinutes % 1440;
        const endHour = Math.floor(endMinuteOfDay / 60);
        const endMinute = endMinuteOfDay % 60;
        const endTimeStr = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`;

        // Calculate the scheduled date (from scheduledDate or calculate from dayOfWeek)
        let maintenanceStartDate;
        if (pattern.scheduledDate) {
          maintenanceStartDate = new Date(pattern.scheduledDate + 'T00:00:00Z');
        } else {
          // For recurring patterns, use current game date
          maintenanceStartDate = new Date(gameDate + 'T00:00:00Z');
        }

        // Calculate actual completion date
        const completionDate = new Date(maintenanceStartDate);
        completionDate.setUTCDate(completionDate.getUTCDate() + daysSpanned);
        const completionDateStr = completionDate.toISOString().split('T')[0];

        // Check if current game date/time is past the maintenance end date/time
        const isPastCompletionDate = gameDate > completionDateStr ||
          (gameDate === completionDateStr && gameTimeStr >= endTimeStr);

        if (isPastCompletionDate) {
          const aircraft = pattern.aircraft;
          const checkType = pattern.checkType;

          // Check if we've already recorded this check today
          const checkFieldMap = {
            'daily': 'lastDailyCheckDate',
            'weekly': 'lastWeeklyCheckDate',
            'A': 'lastACheckDate',
            'C': 'lastCCheckDate',
            'D': 'lastDCheckDate'
          };
          const lastCheckField = checkFieldMap[checkType];
          if (!lastCheckField) continue; // Unknown check type
          const lastCheckDate = aircraft[lastCheckField];
          // Convert Date to ISO string for comparison
          let lastCheckDateStr = null;
          if (lastCheckDate) {
            if (lastCheckDate instanceof Date) {
              lastCheckDateStr = lastCheckDate.toISOString().split('T')[0];
            } else {
              // If it's already a string (shouldn't happen with TIMESTAMP), parse it
              lastCheckDateStr = new Date(lastCheckDate).toISOString().split('T')[0];
            }
          }

          if (!lastCheckDateStr || lastCheckDateStr !== gameDate) {
            // Update the last check date with full datetime
            const updateData = {};
            updateData[lastCheckField] = currentGameTime; // Store full datetime

            // Cascading check validation:
            // D check → validates C, A, weekly, daily
            // C check → validates A, weekly, daily
            // A check → validates weekly, daily
            // weekly check → validates daily
            if (checkType === 'D') {
              updateData.lastCCheckDate = currentGameTime;
              updateData.lastACheckDate = currentGameTime;
              updateData.lastACheckHours = aircraft.totalFlightHours || 0;
              updateData.lastWeeklyCheckDate = currentGameTime;
              updateData.lastDailyCheckDate = currentGameTime;
            } else if (checkType === 'C') {
              updateData.lastACheckDate = currentGameTime;
              updateData.lastACheckHours = aircraft.totalFlightHours || 0;
              updateData.lastWeeklyCheckDate = currentGameTime;
              updateData.lastDailyCheckDate = currentGameTime;
            } else if (checkType === 'A') {
              updateData.lastWeeklyCheckDate = currentGameTime;
              updateData.lastDailyCheckDate = currentGameTime;
            } else if (checkType === 'weekly') {
              updateData.lastDailyCheckDate = currentGameTime;
            }
            if (['A', 'C', 'D', 'weekly'].includes(checkType) && process.env.NODE_ENV === 'development') {
              console.log(`🔧 ${checkType} Check also validates lower checks for ${aircraft.registration}`);
            }

            await aircraft.update(updateData);

            // Mark one-time scheduled maintenance (C, D checks with scheduledDate) as completed
            // so they don't cause conflicts with future maintenance scheduling
            if (['C', 'D'].includes(checkType) && pattern.scheduledDate) {
              await pattern.update({ status: 'completed' });
              if (process.env.NODE_ENV === 'development') {
                console.log(`🔧 ${checkType} Check marked as completed for ${aircraft.registration}`);
              }
            }

            if (process.env.NODE_ENV === 'development') {
              console.log(`🔧 ${checkType} Check recorded for ${aircraft.registration} at ${endTimeStr} (date: ${gameDate})`);
            }
          }
        }
      }
      // Auto-schedule C and D checks the day before they expire
      await this.processAutomaticHeavyMaintenance(membershipIds, currentGameTime);

    } catch (error) {
      console.error('Error processing maintenance:', error);
    }
  }

  /**
   * Process automatic C and D check scheduling
   * Takes aircraft out of service the day before check expires
   */
  async processAutomaticHeavyMaintenance(membershipIds, currentGameTime) {
    try {
      // Get all active aircraft for these memberships
      const aircraft = await UserAircraft.findAll({
        where: {
          worldMembershipId: { [Op.in]: membershipIds },
          status: 'active' // Only check active aircraft
        }
      });

      const gameDate = currentGameTime.toISOString().split('T')[0];

      for (const ac of aircraft) {
        // Check C check expiry
        if (ac.lastCCheckDate && ac.cCheckIntervalDays) {
          const cCheckExpiry = new Date(ac.lastCCheckDate);
          cCheckExpiry.setUTCDate(cCheckExpiry.getUTCDate() + ac.cCheckIntervalDays);

          // Calculate days until expiry
          const daysUntilCExpiry = Math.floor((cCheckExpiry - currentGameTime) / (1000 * 60 * 60 * 24));

          // If check expires tomorrow or sooner, take aircraft out of service
          if (daysUntilCExpiry <= 1 && daysUntilCExpiry >= 0) {
            await ac.update({ status: 'maintenance' });
            if (process.env.NODE_ENV === 'development') {
              console.log(`🔧 ${ac.registration} entering C Check maintenance (14 days) - expires in ${daysUntilCExpiry} day(s)`);
            }
          }
        }

        // Check D check expiry
        if (ac.lastDCheckDate && ac.dCheckIntervalDays) {
          const dCheckExpiry = new Date(ac.lastDCheckDate);
          dCheckExpiry.setUTCDate(dCheckExpiry.getUTCDate() + ac.dCheckIntervalDays);

          // Calculate days until expiry
          const daysUntilDExpiry = Math.floor((dCheckExpiry - currentGameTime) / (1000 * 60 * 60 * 24));

          // If check expires tomorrow or sooner, take aircraft out of service
          if (daysUntilDExpiry <= 1 && daysUntilDExpiry >= 0) {
            await ac.update({ status: 'maintenance' });
            if (process.env.NODE_ENV === 'development') {
              console.log(`🔧 ${ac.registration} entering D Check maintenance (60 days) - expires in ${daysUntilDExpiry} day(s)`);
            }
          }
        }

        // Check if aircraft in maintenance should be returned to service
        // C check: 14 days, D check: 60 days
        if (ac.status === 'maintenance') {
          let shouldReturn = false;
          let checkCompleted = null;

          // Check if C check maintenance is complete
          if (ac.lastCCheckDate) {
            const cCheckStart = new Date(ac.lastCCheckDate);
            const cCheckEnd = new Date(cCheckStart);
            cCheckEnd.setUTCDate(cCheckEnd.getUTCDate() + 14); // 14 days duration

            if (currentGameTime >= cCheckEnd) {
              // C check duration completed - update the check date to now
              await ac.update({ lastCCheckDate: currentGameTime });
              shouldReturn = true;
              checkCompleted = 'C';
            }
          }

          // Check if D check maintenance is complete
          if (ac.lastDCheckDate) {
            const dCheckStart = new Date(ac.lastDCheckDate);
            const dCheckEnd = new Date(dCheckStart);
            dCheckEnd.setUTCDate(dCheckEnd.getUTCDate() + 60); // 60 days duration

            if (currentGameTime >= dCheckEnd) {
              // D check duration completed - update the check date to now
              await ac.update({ lastDCheckDate: currentGameTime });
              shouldReturn = true;
              checkCompleted = 'D';
            }
          }

          // Return aircraft to service if maintenance completed
          if (shouldReturn) {
            await ac.update({ status: 'active' });
            if (process.env.NODE_ENV === 'development') {
              console.log(`✓ ${ac.registration} returned to service after ${checkCompleted} Check maintenance`);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error processing automatic heavy maintenance:', error);
    }
  }

  /**
   * Refresh auto-scheduled maintenance for all aircraft in a world
   * This runs once per game week to ensure daily/weekly checks stay scheduled ahead
   */
  async refreshMaintenanceSchedules(worldId) {
    try {
      // Import refreshAutoScheduledMaintenance from fleet routes
      const { refreshAutoScheduledMaintenance } = require('../routes/fleet');

      // Get all memberships for this world
      const memberships = await WorldMembership.findAll({
        where: { worldId, isActive: true },
        attributes: ['id']
      });

      const membershipIds = memberships.map(m => m.id);
      if (membershipIds.length === 0) return;

      // Get all aircraft with auto-scheduling enabled
      const aircraftToRefresh = await UserAircraft.findAll({
        where: {
          worldMembershipId: { [Op.in]: membershipIds },
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

      if (aircraftToRefresh.length === 0) return;

      // Get game time once from memory to avoid repeated DB calls
      const gameTime = this.getCurrentTime(worldId);

      if (process.env.NODE_ENV === 'development') {
        console.log(`📅 Refreshing maintenance schedules for ${aircraftToRefresh.length} aircraft in world ${worldId} (gameTime: ${gameTime?.toISOString()})`);
      }

      // Refresh maintenance for each aircraft (with delay to avoid DB overload)
      // Process in smaller batches with longer delays to prevent connection exhaustion
      for (let i = 0; i < aircraftToRefresh.length; i++) {
        const aircraft = aircraftToRefresh[i];
        let retries = 3;
        while (retries > 0) {
          try {
            // Pass game time to avoid DB calls
            await refreshAutoScheduledMaintenance(aircraft.id, worldId, gameTime);
            if (process.env.NODE_ENV === 'development') {
              console.log(`📅 Refreshed maintenance for ${aircraft.registration} (${i + 1}/${aircraftToRefresh.length})`);
            }
            break; // Success, exit retry loop
          } catch (err) {
            retries--;
            const isConnectionError = err.message && (
              err.message.includes('Connection terminated') ||
              err.message.includes('ECONNRESET') ||
              err.message.includes('timeout') ||
              err.message.includes('ETIMEDOUT')
            );
            if (isConnectionError && retries > 0) {
              console.log(`[MAINT REFRESH] Connection error for ${aircraft.registration}, retrying in 3s... (${retries} left)`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
              console.error(`Error refreshing maintenance for ${aircraft.registration}:`, err.message);
              break;
            }
          }
        }
        // 1.5 second delay between aircraft to let connection pool recover
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`📅 Maintenance schedule refresh complete for world ${worldId}`);
      }
    } catch (error) {
      console.error('Error refreshing maintenance schedules:', error);
    }
  }

  /**
   * Get current time for a specific world
   */
  getCurrentTime(worldId) {
    const worldState = this.worlds.get(worldId);
    if (worldState) {
      // Return a new Date object to prevent external modifications
      return new Date(worldState.inMemoryTime.getTime());
    }
    return null;
  }

  /**
   * Get world information for a specific world
   */
  async getWorldInfo(worldId) {
    const worldState = this.worlds.get(worldId);

    if (!worldState) {
      // World not loaded in memory, load from database
      const world = await World.findByPk(worldId);
      if (!world) return null;

      const elapsedMs = world.currentTime.getTime() - world.startDate.getTime();
      const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));

      return {
        id: world.id,
        name: world.name,
        description: world.description,
        currentTime: world.currentTime,
        startDate: world.startDate,
        timeAcceleration: world.timeAcceleration,
        era: world.era,
        status: world.status,
        isPaused: world.isPaused,
        isOperating: world.isOperating ? world.isOperating() : false,
        elapsedDays: elapsedDays
      };
    }

    // Use in-memory time for running worlds
    const { world, inMemoryTime } = worldState;
    const elapsedMs = inMemoryTime.getTime() - world.startDate.getTime();
    const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));

    return {
      id: world.id,
      name: world.name,
      description: world.description,
      currentTime: inMemoryTime,
      startDate: world.startDate,
      timeAcceleration: world.timeAcceleration,
      era: world.era,
      status: world.status,
      isPaused: world.isPaused,
      isOperating: !world.isPaused && world.status === 'active',
      elapsedDays: elapsedDays
    };
  }

  /**
   * Pause a world
   */
  async pauseWorld(worldId) {
    const worldState = this.worlds.get(worldId);
    if (worldState) {
      worldState.world.isPaused = true;
      await worldState.world.sequelize.query(
        'UPDATE worlds SET "is_paused" = true WHERE id = :worldId',
        { replacements: { worldId } }
      );
      if (process.env.NODE_ENV === 'development') {
        console.log(`⏸ World paused: ${worldState.world.name}`);
      }
    }
  }

  /**
   * Resume a world
   */
  async resumeWorld(worldId) {
    const worldState = this.worlds.get(worldId);
    if (worldState) {
      worldState.world.isPaused = false;
      worldState.lastTickAt = new Date();
      await worldState.world.sequelize.query(
        'UPDATE worlds SET "is_paused" = false, "last_tick_at" = :lastTickAt WHERE id = :worldId',
        { replacements: { worldId, lastTickAt: worldState.lastTickAt } }
      );
      if (process.env.NODE_ENV === 'development') {
        console.log(`▶ World resumed: ${worldState.world.name}`);
      }
    }
  }

  /**
   * Set time acceleration for a world
   */
  async setTimeAcceleration(worldId, factor) {
    const worldState = this.worlds.get(worldId);
    if (worldState) {
      worldState.world.timeAcceleration = factor;
      await worldState.world.sequelize.query(
        'UPDATE worlds SET "time_acceleration" = :factor WHERE id = :worldId',
        { replacements: { worldId, factor } }
      );
      if (process.env.NODE_ENV === 'development') {
        console.log(`⏱ Time acceleration set to ${factor}x for ${worldState.world.name}`);
      }
    }
  }
}

// Singleton instance
const worldTimeService = new WorldTimeService();

module.exports = worldTimeService;
