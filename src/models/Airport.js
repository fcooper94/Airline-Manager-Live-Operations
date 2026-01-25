const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Airport = sequelize.define('Airport', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  icaoCode: {
    type: DataTypes.STRING(4),
    allowNull: false,
    field: 'icao_code',
    comment: 'ICAO airport code (e.g., KJFK)'
  },
  iataCode: {
    type: DataTypes.STRING(3),
    allowNull: true,
    field: 'iata_code',
    comment: 'IATA airport code (e.g., JFK)'
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Airport name'
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'City name'
  },
  country: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Country name'
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: false,
    comment: 'Latitude coordinate'
  },
  longitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: false,
    comment: 'Longitude coordinate'
  },
  elevation: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Elevation in feet'
  },
  type: {
    type: DataTypes.ENUM('International Hub', 'Major', 'Regional', 'Small Regional'),
    allowNull: false,
    defaultValue: 'Regional',
    comment: 'Airport size/classification'
  },
  timezone: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Timezone (e.g., America/New_York)'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
    field: 'is_active',
    comment: 'Whether this airport is available for selection'
  },
  operationalFrom: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'operational_from',
    comment: 'Year the airport opened for operations (e.g., 1930)'
  },
  operationalUntil: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'operational_until',
    comment: 'Year the airport closed (null if still operational)'
  }
}, {
  tableName: 'airports',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['icao_code']
    },
    {
      fields: ['iata_code']
    },
    {
      fields: ['country']
    },
    {
      fields: ['type']
    },
    {
      fields: ['operational_from']
    },
    {
      fields: ['operational_until']
    }
  ]
});

/**
 * Get airport display name
 */
Airport.prototype.getDisplayName = function() {
  return `${this.name} (${this.icaoCode})`;
};

/**
 * Get airport location string
 */
Airport.prototype.getLocation = function() {
  return `${this.city}, ${this.country}`;
};

module.exports = Airport;
