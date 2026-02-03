const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * ScheduledMaintenance - One-time scheduled maintenance checks
 * NOT recurring patterns - each record is a specific scheduled maintenance event
 * Checks are scheduled close to expiry to keep aircraft legal
 */
const RecurringMaintenance = sequelize.define('RecurringMaintenance', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  aircraftId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'aircraft_id'
  },
  checkType: {
    type: DataTypes.ENUM('daily', 'A', 'B', 'C', 'D'),
    allowNull: false,
    field: 'check_type',
    comment: 'daily=Daily Check (1hr), A=A Check (3hrs), B=B Check (6hrs), C=C Check (14 days), D=D Check (60 days)'
  },
  // Specific date when this maintenance is scheduled (YYYY-MM-DD)
  scheduledDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'scheduled_date',
    comment: 'The specific date this maintenance is scheduled for'
  },
  // Keep dayOfWeek for backwards compatibility, but nullable for one-time scheduling
  dayOfWeek: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      min: 0,
      max: 6
    },
    field: 'day_of_week'
  },
  startTime: {
    type: DataTypes.TIME,
    allowNull: false,
    field: 'start_time'
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Duration in minutes'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'completed'),
    defaultValue: 'active',
    allowNull: false
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'recurring_maintenance',
  timestamps: true,
  underscored: true
});

module.exports = RecurringMaintenance;
