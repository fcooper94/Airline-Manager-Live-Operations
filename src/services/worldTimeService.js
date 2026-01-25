const World = require('../models/World');
const { WorldMembership, User } = require('../models');

/**
 * World Time Service
 * Manages the continuous progression of game time with acceleration
 */
class WorldTimeService {
  constructor() {
    this.tickInterval = null;
    this.tickRate = 1000; // Update every 1 second (real time)
    this.activeWorld = null;
  }

  /**
   * Start the world time progression
   */
  async start(worldId = null) {
    try {
      // Load the active world
      if (worldId) {
        this.activeWorld = await World.findByPk(worldId);
      } else {
        this.activeWorld = await World.findOne({
          where: { status: 'active' }
        });
      }

      if (!this.activeWorld) {
        if (process.env.NODE_ENV === 'development') {
        console.log('⚠ No active world found. Create a world first.');
      }
        return false;
      }

      // Update last tick time
      this.activeWorld.lastTickAt = new Date();
      await this.activeWorld.save();

      if (process.env.NODE_ENV === 'development') {
        console.log(`✓ World Time Service started for: ${this.activeWorld.name}`);
        console.log(`  Current game time: ${this.activeWorld.currentTime.toISOString()}`);
        console.log(`  Time acceleration: ${this.activeWorld.timeAcceleration}x`);
      }

      // Start the tick loop
      this.tickInterval = setInterval(() => this.tick(), this.tickRate);

      return true;
    } catch (error) {
      console.error('✗ Failed to start World Time Service:', error.message);
      return false;
    }
  }

  /**
   * Stop the world time progression
   */
  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
      if (process.env.NODE_ENV === 'development') {
        console.log('✓ World Time Service stopped');
      }
    }
  }

  /**
   * Main tick function - advances game time
   */
  async tick() {
    if (!this.activeWorld) return;

    try {
      // Check if world should be operating
      if (!this.activeWorld.isOperating()) {
        return;
      }

      const now = new Date();
      const lastTick = this.activeWorld.lastTickAt || now;

      // Calculate real elapsed time in seconds
      const realElapsedSeconds = (now.getTime() - lastTick.getTime()) / 1000;

      // Calculate game time advancement (in seconds)
      const gameTimeAdvancement = realElapsedSeconds * this.activeWorld.timeAcceleration;

      // Update current game time
      const newGameTime = new Date(
        this.activeWorld.currentTime.getTime() + (gameTimeAdvancement * 1000)
      );

      // Update world
      this.activeWorld.currentTime = newGameTime;
      this.activeWorld.lastTickAt = now;

      // Save to database (every 10 seconds to reduce DB load)
      if (Math.floor(now.getTime() / 10000) !== Math.floor(lastTick.getTime() / 10000)) {
        await this.activeWorld.save();
      }

      // Emit tick event for other systems to react
      this.onTick(newGameTime, gameTimeAdvancement);

    } catch (error) {
      console.error('World tick error:', error.message);
    }
  }

  /**
   * Hook for other systems to react to time progression
   */
  onTick(gameTime, advancementSeconds) {
    // This will be used by flight scheduler, resource manager, etc.
    // For now, just emit via Socket.IO if available
    if (global.io) {
      global.io.emit('world:tick', {
        gameTime: gameTime.toISOString(),
        advancement: advancementSeconds
      });
    }

    // Check for credit deductions (asynchronously, don't block tick)
    this.processCredits(gameTime).catch(err => {
      console.error('Error processing credits:', err.message);
    });
  }

  /**
   * Process credit deductions for all active memberships
   */
  async processCredits(currentGameTime) {
    if (!this.activeWorld) return;

    try {
      // Get all active memberships for this world
      const memberships = await WorldMembership.findAll({
        where: {
          worldId: this.activeWorld.id,
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
              console.log(`Deducted ${weeksPassed} credits from user ${membership.user.id} for world ${this.activeWorld.name}. New balance: ${membership.user.credits}`);
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
   * Get current world time
   */
  async getCurrentTime() {
    if (!this.activeWorld) {
      await this.start();
    }
    return this.activeWorld ? this.activeWorld.currentTime : null;
  }

  /**
   * Get active world information
   */
  async getWorldInfo() {
    if (!this.activeWorld) {
      await this.start();
    }

    if (!this.activeWorld) {
      return null;
    }

    return {
      id: this.activeWorld.id,
      name: this.activeWorld.name,
      description: this.activeWorld.description,
      currentTime: this.activeWorld.currentTime,
      startDate: this.activeWorld.startDate,
      timeAcceleration: this.activeWorld.timeAcceleration,
      era: this.activeWorld.era,
      status: this.activeWorld.status,
      isPaused: this.activeWorld.isPaused,
      isOperating: this.activeWorld.isOperating(),
      elapsedDays: Math.floor(this.activeWorld.getElapsedGameTime() / (1000 * 60 * 60 * 24))
    };
  }

  /**
   * Get information for a specific world
   */
  async getWorldInfoForWorld(world) {
    if (!world) {
      return null;
    }

    // Calculate elapsed days based on the world's dates
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

  /**
   * Pause the world
   */
  async pauseWorld() {
    if (this.activeWorld) {
      this.activeWorld.isPaused = true;
      await this.activeWorld.save();
      if (process.env.NODE_ENV === 'development') {
        console.log('⏸ World paused');
      }
    }
  }

  /**
   * Resume the world
   */
  async resumeWorld() {
    if (this.activeWorld) {
      this.activeWorld.isPaused = false;
      this.activeWorld.lastTickAt = new Date();
      await this.activeWorld.save();
      if (process.env.NODE_ENV === 'development') {
        console.log('▶ World resumed');
      }
    }
  }

  /**
   * Set time acceleration
   */
  async setTimeAcceleration(factor) {
    if (this.activeWorld) {
      this.activeWorld.timeAcceleration = factor;
      await this.activeWorld.save();
      if (process.env.NODE_ENV === 'development') {
        console.log(`⏱ Time acceleration set to ${factor}x`);
      }
    }
  }
}

// Singleton instance
const worldTimeService = new WorldTimeService();

module.exports = worldTimeService;
