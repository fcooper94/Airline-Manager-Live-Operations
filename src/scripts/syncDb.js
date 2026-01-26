require('dotenv').config();
const sequelize = require('../config/database');
const { User, Flight, World, WorldMembership, Aircraft, UserAircraft, Airport, Route } = require('../models');

async function syncDatabase() {
  try {
    console.log('Starting database synchronization...');

    // Sync all models
    await sequelize.sync({ alter: true });

    console.log('✓ Database synchronized successfully');
    console.log('\nTables created/updated:');
    console.log('  - users');
    console.log('  - worlds');
    console.log('  - world_memberships');
    console.log('  - flights');
    console.log('  - aircraft');
    console.log('  - user_aircraft');
    console.log('  - airports');
    console.log('  - routes');

    // Close connection
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('✗ Database synchronization failed:', error);
    process.exit(1);
  }
}

syncDatabase();
