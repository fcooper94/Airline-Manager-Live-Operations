const World = require('../models/World');
const { WorldMembership, User } = require('../models');

/**
 * World Time Service
 * Manages the continuous progression of game time with acceleration for multiple worlds
 */
class WorldTimeService {
  constructor() {
    this.tickRate = 1000; // Update every 1 second (real time)
    this.worlds = new Map(); // Map of worldId -> { world, tickInterval, inMemoryTime, lastTickAt }
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

      // Update last tick time in database
      const now = new Date();
      await world.sequelize.query(
        'UPDATE worlds SET last_tick_at = :lastTickAt WHERE id = :worldId',
        {
          replacements: {
            lastTickAt: now,
            worldId: world.id
          }
        }
      );

      // Store world state in memory
      const worldState = {
        world: world,
        inMemoryTime: new Date(world.currentTime),
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
  stopAll() {
    for (const [worldId, worldState] of this.worlds.entries()) {
      if (worldState.tickInterval) {
        clearInterval(worldState.tickInterval);
      }
    }
    this.worlds.clear();
    if (process.env.NODE_ENV === 'development') {
      console.log('✓ World Time Service stopped all worlds');
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
          'UPDATE worlds SET current_time = :currentTime, last_tick_at = :lastTickAt, updated_at = :updatedAt WHERE id = :worldId',
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
      global.io.emit('world:tick', {
        worldId: worldId,
        gameTime: gameTime.toISOString(),
        advancement: advancementSeconds
      });
    }

    // Check for credit deductions (asynchronously, don't block tick)
    this.processCredits(worldId, gameTime).catch(err => {
      console.error('Error processing credits:', err.message);
    });
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
   * Get current time for a specific world
   */
  getCurrentTime(worldId) {
    const worldState = this.worlds.get(worldId);
    if (worldState) {
      return worldState.inMemoryTime;
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
        'UPDATE worlds SET is_paused = true WHERE id = :worldId',
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
        'UPDATE worlds SET is_paused = false, last_tick_at = :lastTickAt WHERE id = :worldId',
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
        'UPDATE worlds SET time_acceleration = :factor WHERE id = :worldId',
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
