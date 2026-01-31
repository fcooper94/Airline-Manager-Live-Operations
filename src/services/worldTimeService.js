const World = require('../models/World');
const { WorldMembership, User, ScheduledFlight, Route, UserAircraft, Aircraft } = require('../models');
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
    this.creditCheckInterval = 30000; // Check credits every 30 seconds (real time)
    this.flightCheckInterval = 5000; // Check flights every 5 seconds (real time)
    this.isProcessingCredits = false; // Prevent overlapping credit queries
    this.isProcessingFlights = false; // Prevent overlapping flight queries
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
  }

  /**
   * Process credit deductions for all active memberships in a world
   */
  async processCredits(worldId, currentGameTime) {
    const worldState = this.worlds.get(worldId);
    if (!worldState) return;

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

      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

      for (const membership of memberships) {
        // Check if a week has passed since last credit deduction
        const lastDeduction = membership.lastCreditDeduction ? new Date(membership.lastCreditDeduction) : new Date(membership.joinedAt);
        const timeSinceLastDeduction = new Date(currentGameTime).getTime() - lastDeduction.getTime();

        if (timeSinceLastDeduction >= ONE_WEEK_MS) {
          // Calculate how many weeks have passed
          const weeksPassed = Math.floor(timeSinceLastDeduction / ONE_WEEK_MS);

          // Deduct credits (1 per week)
          if (membership.user) {
            membership.user.credits -= weeksPassed;
            await membership.user.save();

            // Update last deduction time
            const newDeductionTime = new Date(lastDeduction.getTime() + (weeksPassed * ONE_WEEK_MS));
            membership.lastCreditDeduction = newDeductionTime;
            await membership.save();

            if (process.env.NODE_ENV === 'development') {
              console.log(`Deducted ${weeksPassed} credits from user ${membership.user.id} for world ${worldState.world.name}. New balance: ${membership.user.credits}`);
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
            { model: require('../models/Airport'), as: 'arrivalAirport' }
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

        // Outbound: departure -> arrival (with wind effect)
        const outboundFlightMs = calculateFlightDurationMs(distanceNm, depLng, arrLng, depLat, arrLat, cruiseSpeed);

        // Return: arrival -> departure (opposite wind effect)
        const returnFlightMs = calculateFlightDurationMs(distanceNm, arrLng, depLng, arrLat, depLat, cruiseSpeed);

        // Get turnaround time (default 45 minutes)
        const turnaroundMinutes = flight.route.turnaroundTime || 45;
        const turnaroundMs = turnaroundMinutes * 60 * 1000;

        // Calculate total round-trip duration: outbound + turnaround + return
        const totalFlightMs = outboundFlightMs + turnaroundMs + returnFlightMs;

        // Calculate expected completion time (after return leg)
        const departureDateTime = new Date(`${flight.scheduledDate}T${flight.departureTime}`);
        const expectedCompletion = new Date(departureDateTime.getTime() + totalFlightMs);

        // Check if flight should have completed the full round-trip
        if (currentGameTime >= expectedCompletion) {
          await flight.update({ status: 'completed' });
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
