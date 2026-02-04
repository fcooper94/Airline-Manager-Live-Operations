const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Aircraft Model
 * Represents aircraft types available for purchase/operation
 */
const Aircraft = sequelize.define('Aircraft', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  manufacturer: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Aircraft manufacturer (e.g., Boeing, Airbus)'
  },
  model: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Aircraft model (e.g., 787-9, A350-900)'
  },
  variant: {
    type: DataTypes.STRING,
    comment: 'Specific variant if applicable'
  },
  icaoCode: {
    type: DataTypes.STRING(4),
    field: 'icao_code',
    comment: 'ICAO aircraft type designator (e.g., B77L, A359)'
  },
  type: {
    type: DataTypes.ENUM('Narrowbody', 'Widebody', 'Regional', 'Cargo'),
    allowNull: false,
    comment: 'Aircraft category'
  },
  rangeCategory: {
    type: DataTypes.ENUM('Short Haul', 'Medium Haul', 'Long Haul'),
    allowNull: false,
    field: 'range_category',
    comment: 'Operational range category'
  },
  rangeNm: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'range_nm',
    comment: 'Maximum range in nautical miles'
  },
  cruiseSpeed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'cruise_speed',
    comment: 'Typical cruise speed in knots'
  },
  passengerCapacity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'passenger_capacity',
    comment: 'Typical passenger capacity'
  },
  cargoCapacityKg: {
    type: DataTypes.INTEGER,
    field: 'cargo_capacity_kg',
    comment: 'Cargo capacity in kilograms'
  },
  fuelCapacityLiters: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'fuel_capacity_liters',
    comment: 'Fuel capacity in liters'
  },
  purchasePrice: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'purchase_price',
    comment: 'New purchase price in USD'
  },
  usedPrice: {
    type: DataTypes.DECIMAL(15, 2),
    field: 'used_price',
    comment: 'Used aircraft price in USD'
  },
  maintenanceCostPerHour: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'maintenance_cost_per_hour',
    comment: 'Hourly maintenance cost in USD'
  },
  fuelBurnPerHour: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'fuel_burn_per_hour',
    comment: 'Fuel consumption in liters per hour'
  },
  maintenanceCostPerMonth: {
    type: DataTypes.DECIMAL(12, 2),
    field: 'maintenance_cost_per_month',
    comment: 'Monthly maintenance cost in USD'
  },
  firstIntroduced: {
    type: DataTypes.INTEGER,
    field: 'first_introduced',
    comment: 'Year first introduced'
  },
  availableFrom: {
    type: DataTypes.INTEGER,
    field: 'available_from',
    comment: 'Year when aircraft becomes available for purchase in game'
  },
  availableUntil: {
    type: DataTypes.INTEGER,
    field: 'available_until',
    comment: 'Year when aircraft is no longer available (null = still available)'
  },
  requiredPilots: {
    type: DataTypes.INTEGER,
    defaultValue: 2,
    allowNull: false,
    field: 'required_pilots',
    comment: 'Number of pilots required to operate'
  },
  requiredCabinCrew: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
    field: 'required_cabin_crew',
    comment: 'Number of cabin crew required'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
    field: 'is_active',
    comment: 'Whether this aircraft is available for purchase'
  },
  description: {
    type: DataTypes.TEXT,
    comment: 'Additional description or notes'
  },
  // Passenger class availability
  hasEconomy: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
    field: 'has_economy',
    comment: 'Whether this aircraft has Economy class seating'
  },
  hasEconomyPlus: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    field: 'has_economy_plus',
    comment: 'Whether this aircraft has Economy Plus class seating'
  },
  hasBusiness: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    field: 'has_business',
    comment: 'Whether this aircraft has Business class seating'
  },
  hasFirst: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    field: 'has_first',
    comment: 'Whether this aircraft has First class seating'
  },
  // Cargo type availability
  hasCargoLight: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
    field: 'has_cargo_light',
    comment: 'Whether this aircraft can carry light cargo'
  },
  hasCargoStandard: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
    field: 'has_cargo_standard',
    comment: 'Whether this aircraft can carry standard cargo'
  },
  hasCargoHeavy: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    field: 'has_cargo_heavy',
    comment: 'Whether this aircraft can carry heavy cargo'
  }
}, {
  tableName: 'aircraft',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['manufacturer']
    },
    {
      fields: ['type']
    },
    {
      fields: ['is_active']
    }
  ]
});

/**
 * Get full aircraft name
 */
Aircraft.prototype.getFullName = function() {
  return this.variant
    ? `${this.manufacturer} ${this.model}-${this.variant}`
    : `${this.manufacturer} ${this.model}`;
};

module.exports = Aircraft;
