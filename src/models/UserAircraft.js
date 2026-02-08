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
  // Listing / sell / lease-out fields
  listingPrice: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'listing_price',
    comment: 'Asking price when listed for sale, or monthly rate when listed for lease-out'
  },
  listedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'listed_at',
    comment: 'Game-time when aircraft was listed for sale or lease'
  },
  leaseOutMonthlyRate: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'lease_out_monthly_rate',
    comment: 'Monthly lease rate when leased out to NPC'
  },
  leaseOutStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'lease_out_start_date'
  },
  leaseOutEndDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'lease_out_end_date'
  },
  leaseOutTenantName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'lease_out_tenant_name',
    comment: 'Name of NPC airline leasing this aircraft'
  },
  // Player-to-player lease linking
  playerLessorAircraftId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'player_lessor_aircraft_id',
    comment: 'On lessee record: points to the owner/lessor UserAircraft'
  },
  playerLesseeAircraftId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'player_lessee_aircraft_id',
    comment: 'On lessor record: points to the lessee UserAircraft'
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
    type: DataTypes.ENUM('active', 'maintenance', 'storage', 'sold', 'listed_sale', 'listed_lease', 'leased_out'),
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
    comment: 'Daily check - valid for 1-2 days (30-90 mins duration)'
  },
  lastWeeklyCheckDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_weekly_check_date',
    comment: 'Weekly check - valid for 7-8 days (1.5-3 hrs duration)'
  },
  lastACheckDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_a_check_date',
    comment: 'A Check - every 800-1000 flight hours (6-12 hours duration)'
  },
  lastACheckHours: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'last_a_check_hours',
    comment: 'Flight hours at last A Check'
  },
  lastCCheckDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_c_check_date',
    comment: 'C Check - every 2 years (2-4 weeks duration)'
  },
  lastDCheckDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_d_check_date',
    comment: 'D Check - every 5-7 years (2-3 months duration)'
  },
  // Check intervals (randomized per aircraft for variety)
  aCheckIntervalHours: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'a_check_interval_hours',
    comment: 'A Check interval in flight hours (800-1000)'
  },
  cCheckIntervalDays: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'c_check_interval_days',
    comment: 'C Check interval in days (730, i.e. 2 years)'
  },
  dCheckIntervalDays: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'd_check_interval_days',
    comment: 'D Check interval in days (1825-2555, i.e. 5-7 years)'
  },
  // Auto-scheduling preferences
  autoScheduleDaily: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'auto_schedule_daily',
    comment: 'Automatically schedule daily checks'
  },
  autoScheduleWeekly: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'auto_schedule_weekly',
    comment: 'Automatically schedule weekly checks'
  },
  autoScheduleA: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'auto_schedule_a',
    comment: 'Automatically schedule A checks'
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
    aCheckIntervalHours: randomBetween(800, 1000),       // 800-1000 flight hours
    cCheckIntervalDays: 730,                              // 2 years
    dCheckIntervalDays: randomBetween(1825, 2555)        // 5-7 years
  };
};

/**
 * Check durations in minutes
 * Daily: 30-90 mins (avg 60)
 * Weekly: 1.5-3 hrs (avg 135 mins)
 * A: 6-12 hours (avg 540 mins)
 * C: 2-4 weeks (avg 21 days = 30240 mins)
 * D: 2-3 months (avg 75 days = 108000 mins)
 */
UserAircraft.CHECK_DURATIONS = {
  daily: 60,           // 1 hour (30-90 mins avg)
  weekly: 135,         // 2.25 hours (1.5-3 hrs avg)
  A: 540,              // 9 hours (6-12 hours avg)
  C: 30240,            // 21 days (2-4 weeks avg)
  D: 108000            // 75 days (2-3 months avg)
};

/**
 * Check validity periods
 * Daily: 1-2 days
 * Weekly: 7-8 days
 * A: Based on flight hours (800-1000)
 * C: 2 years
 * D: 5-7 years
 */
UserAircraft.CHECK_VALIDITY = {
  daily: { min: 1, max: 2 },           // days
  weekly: { min: 7, max: 8 },          // days
  A: { min: 800, max: 1000 },          // flight hours
  C: { days: 730 },                    // 2 years
  D: { min: 1825, max: 2555 }          // 5-7 years in days
};

module.exports = UserAircraft;
