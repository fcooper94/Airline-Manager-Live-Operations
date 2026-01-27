const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

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
    type: DataTypes.ENUM('A', 'B'),
    allowNull: false,
    field: 'check_type'
  },
  dayOfWeek: {
    type: DataTypes.INTEGER,
    allowNull: false,
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
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
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
