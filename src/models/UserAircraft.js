const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * UserAircraft Model
 * Represents aircraft owned or leased by users in their world
 */
const UserAircraft = sequelize.define('UserAircraft', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  worldMembershipId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'world_membership_id',
    references: {
      model: 'world_memberships',
      key: 'id'
    }
  },
  aircraftId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'aircraft_id',
    references: {
      model: 'aircraft',
      key: 'id'
    }
  },
  // Purchase or lease
  acquisitionType: {
    type: DataTypes.ENUM('purchase', 'lease'),
    allowNull: false,
    defaultValue: 'purchase',
    field: 'acquisition_type'
  },
  // Aircraft condition at acquisition (for used)
  condition: {
    type: DataTypes.STRING,
    defaultValue: 'New'
  },
  conditionPercentage: {
    type: DataTypes.INTEGER,
    defaultValue: 100,
    field: 'condition_percentage'
  },
  // Age at acquisition
  ageYears: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'age_years'
  },
  // Financial details
  purchasePrice: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'purchase_price'
  },
  leaseMonthlyPayment: {
    type: DataTypes.DECIMAL(15, 2),
    field: 'lease_monthly_payment'
  },
  leaseDurationMonths: {
    type: DataTypes.INTEGER,
    field: 'lease_duration_months'
  },
  leaseStartDate: {
    type: DataTypes.DATE,
    field: 'lease_start_date'
  },
  leaseEndDate: {
    type: DataTypes.DATE,
    field: 'lease_end_date'
  },
  // Operating costs (stored at acquisition time)
  maintenanceCostPerHour: {
    type: DataTypes.DECIMAL(10, 2),
    field: 'maintenance_cost_per_hour'
  },
  fuelBurnPerHour: {
    type: DataTypes.DECIMAL(10, 2),
    field: 'fuel_burn_per_hour'
  },
  // Aircraft name/registration
  registration: {
    type: DataTypes.STRING,
    unique: true
  },
  customName: {
    type: DataTypes.STRING,
    field: 'custom_name'
  },
  // Status
  status: {
    type: DataTypes.ENUM('active', 'maintenance', 'storage', 'sold'),
    defaultValue: 'active'
  },
  // Location
  currentAirport: {
    type: DataTypes.STRING,
    field: 'current_airport'
  },
  // Total flight hours (tracked over time)
  totalFlightHours: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
    field: 'total_flight_hours'
  },
  // Acquisition date
  acquiredAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'acquired_at'
  }
}, {
  tableName: 'user_aircraft',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['world_membership_id']
    },
    {
      fields: ['aircraft_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['registration'],
      unique: true
    }
  ]
});

/**
 * Generate a random registration number
 */
UserAircraft.generateRegistration = function() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '0123456789';

  // Format: N12345 (US style)
  let registration = 'N';
  for (let i = 0; i < 5; i++) {
    registration += digits.charAt(Math.floor(Math.random() * digits.length));
  }

  return registration;
};

module.exports = UserAircraft;
