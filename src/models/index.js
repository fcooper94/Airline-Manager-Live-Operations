const User = require('./User');
const World = require('./World');
const WorldMembership = require('./WorldMembership');
const Flight = require('./Flight');
const Aircraft = require('./Aircraft');
const UserAircraft = require('./UserAircraft');
const Airport = require('./Airport');
const Route = require('./Route');
const ScheduledFlight = require('./ScheduledFlight');
const PricingDefault = require('./PricingDefault');

// Define associations
User.belongsToMany(World, {
  through: WorldMembership,
  foreignKey: 'user_id',
  as: 'worlds'
});

World.belongsToMany(User, {
  through: WorldMembership,
  foreignKey: 'world_id',
  as: 'members'
});

// Direct access to memberships
User.hasMany(WorldMembership, { foreignKey: 'user_id', as: 'memberships' });
World.hasMany(WorldMembership, { foreignKey: 'world_id', as: 'memberships' });
WorldMembership.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
WorldMembership.belongsTo(World, { foreignKey: 'world_id', as: 'world' });

// Fleet associations
WorldMembership.hasMany(UserAircraft, { foreignKey: 'world_membership_id', as: 'fleet' });
UserAircraft.belongsTo(WorldMembership, { foreignKey: 'world_membership_id', as: 'membership' });
UserAircraft.belongsTo(Aircraft, { foreignKey: 'aircraft_id', as: 'aircraft' });
Aircraft.hasMany(UserAircraft, { foreignKey: 'aircraft_id', as: 'userAircraft' });

// Airport associations
WorldMembership.belongsTo(Airport, { foreignKey: 'base_airport_id', as: 'baseAirport' });
Airport.hasMany(WorldMembership, { foreignKey: 'base_airport_id', as: 'airlines' });

// Route associations
WorldMembership.hasMany(Route, { foreignKey: 'world_membership_id', as: 'routes' });
Route.belongsTo(WorldMembership, { foreignKey: 'world_membership_id', as: 'membership' });
Route.belongsTo(Airport, { foreignKey: 'departure_airport_id', as: 'departureAirport' });
Route.belongsTo(Airport, { foreignKey: 'arrival_airport_id', as: 'arrivalAirport' });
Route.belongsTo(Airport, { foreignKey: 'tech_stop_airport_id', as: 'techStopAirport' });
Route.belongsTo(UserAircraft, { foreignKey: 'assigned_aircraft_id', as: 'assignedAircraft' });
Airport.hasMany(Route, { foreignKey: 'departure_airport_id', as: 'departingRoutes' });
Airport.hasMany(Route, { foreignKey: 'arrival_airport_id', as: 'arrivingRoutes' });
Airport.hasMany(Route, { foreignKey: 'tech_stop_airport_id', as: 'techStopRoutes' });

// ScheduledFlight associations
Route.hasMany(ScheduledFlight, { foreignKey: 'route_id', as: 'scheduledFlights' });
ScheduledFlight.belongsTo(Route, { foreignKey: 'route_id', as: 'route' });
UserAircraft.hasMany(ScheduledFlight, { foreignKey: 'aircraft_id', as: 'scheduledFlights' });
ScheduledFlight.belongsTo(UserAircraft, { foreignKey: 'aircraft_id', as: 'aircraft' });

// PricingDefault associations
WorldMembership.hasMany(PricingDefault, { foreignKey: 'world_membership_id', as: 'pricingDefaults' });
PricingDefault.belongsTo(WorldMembership, { foreignKey: 'world_membership_id', as: 'membership' });

module.exports = {
  User,
  World,
  WorldMembership,
  Flight,
  Aircraft,
  UserAircraft,
  Airport,
  Route,
  ScheduledFlight,
  PricingDefault
};
