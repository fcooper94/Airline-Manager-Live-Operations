const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Route Model
 * Represents a recurring route between two airports operated by an airline
 */
const Route = sequelize.define('Route', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  worldMembershipId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'world_membership_id',
    comment: 'The airline operating this route',
    references: {
      model: 'world_memberships',
      key: 'id'
    }
  },
  routeNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'route_number',
    comment: 'Outbound flight number (e.g., BA123)'
  },
  returnRouteNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'return_route_number',
    comment: 'Return flight number (e.g., BA124)'
  },
  turnaroundTime: {
    type: DataTypes.INTEGER,
    defaultValue: 45,
    field: 'turnaround_time',
    comment: 'Turnaround time in minutes at destination'
  },
  departureAirportId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'departure_airport_id',
    references: {
      model: 'airports',
      key: 'id'
    }
  },
  arrivalAirportId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'arrival_airport_id',
    references: {
      model: 'airports',
      key: 'id'
    }
  },
  assignedAircraftId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assigned_aircraft_id',
    comment: 'Aircraft assigned to this route',
    references: {
      model: 'user_aircraft',
      key: 'id'
    }
  },
  distance: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Distance in nautical miles'
  },
  scheduledDepartureTime: {
    type: DataTypes.TIME,
    allowNull: false,
    field: 'scheduled_departure_time',
    comment: 'Daily departure time'
  },
  frequency: {
    type: DataTypes.ENUM('daily', 'weekly', 'biweekly', 'monthly'),
    defaultValue: 'daily',
    allowNull: false,
    comment: 'How often this route operates'
  },
  daysOfWeek: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    defaultValue: [0, 1, 2, 3, 4, 5, 6],
    field: 'days_of_week',
    comment: 'Days of week route operates (0=Sunday, 6=Saturday)'
  },
  ticketPrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'ticket_price',
    comment: 'Price per ticket'
  },
  demand: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Passenger demand for this route (calculated)'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active',
    comment: 'Whether the route is currently active'
  },
  // Performance metrics
  totalFlights: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_flights',
    comment: 'Total number of flights operated on this route'
  },
  totalRevenue: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    field: 'total_revenue',
    comment: 'Total revenue generated'
  },
  totalCosts: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    field: 'total_costs',
    comment: 'Total operating costs'
  },
  totalPassengers: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_passengers',
    comment: 'Total passengers carried'
  },
  averageLoadFactor: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
    field: 'average_load_factor',
    comment: 'Average load factor percentage'
  }
}, {
  tableName: 'routes',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['world_membership_id']
    },
    {
      unique: true,
      fields: ['world_membership_id', 'route_number']
    },
    {
      unique: true,
      fields: ['world_membership_id', 'return_route_number']
    }
  ]
});

module.exports = Route;
