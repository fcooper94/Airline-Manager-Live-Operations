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
  },
  // Maintenance check dates (timestamps to track exact time)
  lastDailyCheckDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_daily_check_date',
    comment: 'Daily check - valid for 2 calendar days until midnight UTC'
  },
  lastTransitCheckDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_transit_check_date',
    comment: 'Transit check - completed automatically between flights (20 mins)'
  },
  lastACheckDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_a_check_date',
    comment: 'A Check - valid for 35-50 days (3 hours duration)'
  },
  lastBCheckDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_b_check_date',
    comment: 'B Check - valid for 6-8 months (6 hours duration)'
  },
  lastCCheckDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_c_check_date',
    comment: 'C Check - valid for 20-24 months (14 days duration)'
  },
  lastDCheckDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_d_check_date',
    comment: 'D Check - valid for 6-10 years (60 days duration)'
  },
  // Check intervals (randomized per aircraft for variety)
  aCheckIntervalDays: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'a_check_interval_days',
    comment: 'A Check interval in days (35-50)'
  },
  bCheckIntervalDays: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'b_check_interval_days',
    comment: 'B Check interval in days (180-240, i.e. 6-8 months)'
  },
  cCheckIntervalDays: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'c_check_interval_days',
    comment: 'C Check interval in days (600-720, i.e. 20-24 months)'
  },
  dCheckIntervalDays: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'd_check_interval_days',
    comment: 'D Check interval in days (2190-3650, i.e. 6-10 years)'
  },
  // Auto-scheduling preferences
  autoScheduleDaily: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'auto_schedule_daily',
    comment: 'Automatically schedule daily checks'
  },
  autoScheduleA: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'auto_schedule_a',
    comment: 'Automatically schedule A checks'
  },
  autoScheduleB: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'auto_schedule_b',
    comment: 'Automatically schedule B checks'
  },
  autoScheduleC: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'auto_schedule_c',
    comment: 'Automatically schedule C checks'
  },
  autoScheduleD: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'auto_schedule_d',
    comment: 'Automatically schedule D checks'
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

/**
 * Generate random maintenance intervals for a new aircraft
 * Returns an object with randomized check intervals
 */
UserAircraft.generateMaintenanceIntervals = function() {
  const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  return {
    aCheckIntervalDays: randomBetween(35, 50),           // 35-50 days
    bCheckIntervalDays: randomBetween(180, 240),         // 6-8 months
    cCheckIntervalDays: randomBetween(600, 720),         // 20-24 months
    dCheckIntervalDays: randomBetween(2190, 3650)        // 6-10 years
  };
};

/**
 * Check durations in minutes
 */
UserAircraft.CHECK_DURATIONS = {
  daily: 60,           // 1 hour
  transit: 20,         // 20 minutes
  A: 180,              // 3 hours
  B: 360,              // 6 hours
  C: 20160,            // 14 days (14 * 24 * 60)
  D: 86400             // 60 days (60 * 24 * 60)
};

module.exports = UserAircraft;
