const User = require('./User');
const World = require('./World');
const WorldMembership = require('./WorldMembership');
const Flight = require('./Flight');
const Aircraft = require('./Aircraft');
const UserAircraft = require('./UserAircraft');
const Airport = require('./Airport');

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

module.exports = {
  User,
  World,
  WorldMembership,
  Flight,
  Aircraft,
  UserAircraft,
  Airport
};
