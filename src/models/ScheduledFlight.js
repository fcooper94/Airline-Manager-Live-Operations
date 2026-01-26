const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * ScheduledFlight Model
 * Represents an individual scheduled flight operation
 */
const ScheduledFlight = sequelize.define('ScheduledFlight', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  routeId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'route_id',
    references: {
      model: 'routes',
      key: 'id'
    }
  },
  aircraftId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'aircraft_id',
    references: {
      model: 'user_aircraft',
      key: 'id'
    }
  },
  scheduledDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'scheduled_date',
    comment: 'Date of the scheduled flight (YYYY-MM-DD)'
  },
  departureTime: {
    type: DataTypes.TIME,
    allowNull: false,
    field: 'departure_time',
    comment: 'Scheduled departure time'
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'in_progress', 'completed', 'cancelled'),
    defaultValue: 'scheduled',
    allowNull: false,
    comment: 'Current status of the flight'
  }
}, {
  tableName: 'scheduled_flights',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['route_id']
    },
    {
      fields: ['aircraft_id']
    },
    {
      fields: ['scheduled_date']
    },
    {
      unique: true,
      fields: ['aircraft_id', 'scheduled_date', 'departure_time']
    }
  ]
});

module.exports = ScheduledFlight;
