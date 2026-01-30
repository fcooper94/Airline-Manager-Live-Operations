const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AirportRouteDemand = sequelize.define('AirportRouteDemand', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  fromAirportId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'from_airport_id',
    references: {
      model: 'airports',
      key: 'id'
    },
    onDelete: 'CASCADE',
    comment: 'Origin airport for this route demand'
  },
  toAirportId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'to_airport_id',
    references: {
      model: 'airports',
      key: 'id'
    },
    onDelete: 'CASCADE',
    comment: 'Destination airport for this route demand'
  },
  baseDemand: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 50,
    field: 'base_demand',
    comment: 'Base demand level (0-100 scale, era-independent)',
    validate: {
      min: 0,
      max: 100
    }
  },
  demandCategory: {
    type: DataTypes.ENUM('very_high', 'high', 'medium', 'low', 'very_low'),
    allowNull: false,
    defaultValue: 'medium',
    field: 'demand_category',
    comment: 'Demand category for quick filtering'
  },
  routeType: {
    type: DataTypes.ENUM('business', 'leisure', 'mixed', 'cargo', 'regional'),
    allowNull: true,
    defaultValue: 'mixed',
    field: 'route_type',
    comment: 'Primary route characteristic'
  }
}, {
  tableName: 'airport_route_demands',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['from_airport_id', 'to_airport_id'],
      name: 'unique_airport_pair'
    },
    {
      fields: ['from_airport_id']
    },
    {
      fields: ['to_airport_id']
    },
    {
      fields: ['from_airport_id', 'base_demand'],
      name: 'idx_route_demands_from_demand'
    },
    {
      fields: ['demand_category']
    }
  ],
  validate: {
    differentAirports() {
      if (this.fromAirportId === this.toAirportId) {
        throw new Error('From and To airports must be different');
      }
    }
  }
});

/**
 * Get demand category label
 */
AirportRouteDemand.prototype.getCategoryLabel = function() {
  return this.demandCategory.replace('_', ' ').toUpperCase();
};

/**
 * Get adjusted demand for a specific year
 */
AirportRouteDemand.prototype.getAdjustedDemand = function(year) {
  let eraMultiplier = 1.0;

  if (year < 1960) {
    eraMultiplier = 0.40; // Early jet age
  } else if (year < 1980) {
    eraMultiplier = 0.65; // Widebody era
  } else if (year < 2000) {
    eraMultiplier = 0.85; // Deregulation boom
  }

  return Math.min(100, Math.round(this.baseDemand * eraMultiplier));
};

module.exports = AirportRouteDemand;
