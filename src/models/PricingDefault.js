const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * PricingDefault Model
 * Stores default pricing for global and aircraft type levels
 */
const PricingDefault = sequelize.define('PricingDefault', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  worldMembershipId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'world_membership_id',
    comment: 'The airline this pricing belongs to',
    references: {
      model: 'world_memberships',
      key: 'id'
    }
  },
  pricingType: {
    type: DataTypes.ENUM('global', 'aircraft_type'),
    allowNull: false,
    field: 'pricing_type',
    comment: 'Type of pricing: global defaults or aircraft type specific'
  },
  aircraftTypeKey: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'aircraft_type_key',
    comment: 'Aircraft type key (e.g., Boeing_737_800) - required for aircraft_type pricing'
  },
  // Passenger class pricing
  economyPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'economy_price',
    comment: 'Economy class ticket price'
  },
  economyPlusPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'economy_plus_price',
    comment: 'Economy Plus class ticket price'
  },
  businessPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'business_price',
    comment: 'Business class ticket price'
  },
  firstPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'first_price',
    comment: 'First class ticket price'
  },
  // Cargo rates (per ton)
  cargoLightRate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'cargo_light_rate',
    comment: 'Light cargo rate per ton'
  },
  cargoStandardRate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'cargo_standard_rate',
    comment: 'Standard cargo rate per ton'
  },
  cargoHeavyRate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'cargo_heavy_rate',
    comment: 'Heavy cargo rate per ton'
  }
}, {
  tableName: 'pricing_defaults',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['world_membership_id', 'pricing_type']
    },
    {
      unique: true,
      fields: ['world_membership_id', 'pricing_type', 'aircraft_type_key']
    }
  ]
});

module.exports = PricingDefault;
