const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * World Model
 * Represents a game world instance with persistent time and configuration
 */
const World = sequelize.define('World', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT
  },
  // Time configuration
  startDate: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'In-game start date (e.g., 1995-01-01)',
    field: 'start_date'
  },
  currentTime: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Current in-game time',
    field: 'current_time'
  },
  timeAcceleration: {
    type: DataTypes.FLOAT,
    defaultValue: 60.0,
    comment: 'Time acceleration factor (60 = 1 real second = 1 game minute)',
    field: 'time_acceleration'
  },
  // Operating schedule
  operatingHoursStart: {
    type: DataTypes.TIME,
    comment: 'Real-time when world starts running each day (UTC)',
    field: 'operating_hours_start'
  },
  operatingHoursEnd: {
    type: DataTypes.TIME,
    comment: 'Real-time when world stops running each day (UTC)',
    field: 'operating_hours_end'
  },
  isPaused: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_paused'
  },
  // Last update tracking
  lastTickAt: {
    type: DataTypes.DATE,
    comment: 'Real-time of last world tick',
    field: 'last_tick_at'
  },
  // World configuration
  era: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2010,
    comment: 'Starting era year (e.g., 1995, 2010)'
  },
  maxPlayers: {
    type: DataTypes.INTEGER,
    defaultValue: 100,
    field: 'max_players'
  },
  status: {
    type: DataTypes.ENUM('setup', 'active', 'paused', 'completed'),
    defaultValue: 'setup'
  },
  joinCost: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
    field: 'join_cost',
    comment: 'Credits required to join this world'
  },
  weeklyCost: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'weekly_cost',
    comment: 'Credits deducted per game week'
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_date',
    comment: 'In-game date when this world ends (e.g., 2030-12-31)'
  },
  freeWeeks: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'free_weeks',
    comment: 'Number of free game weeks for new airlines before weekly credit deductions start'
  }
}, {
  tableName: 'worlds',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['status']
    },
    {
      fields: ['current_time']
    }
  ]
});

/**
 * Get the elapsed game time in milliseconds
 */
World.prototype.getElapsedGameTime = function() {
  return this.currentTime.getTime() - this.startDate.getTime();
};

/**
 * Check if world is currently operating (within operating hours)
 */
World.prototype.isOperating = function() {
  if (this.isPaused || this.status !== 'active') {
    return false;
  }

  // If no operating hours set, always operating
  if (!this.operatingHoursStart || !this.operatingHoursEnd) {
    return true;
  }

  const now = new Date();
  const currentTime = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();

  const [startH, startM, startS] = this.operatingHoursStart.split(':').map(Number);
  const [endH, endM, endS] = this.operatingHoursEnd.split(':').map(Number);

  const startSeconds = startH * 3600 + startM * 60 + (startS || 0);
  const endSeconds = endH * 3600 + endM * 60 + (endS || 0);

  return currentTime >= startSeconds && currentTime <= endSeconds;
};

module.exports = World;
