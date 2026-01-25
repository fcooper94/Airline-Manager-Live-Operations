require('dotenv').config();
const sequelize = require('../config/database');
const { UserAircraft } = require('../models');

async function syncUserAircraftTable() {
  try {
    console.log('Creating UserAircraft table...');

    // Only sync the UserAircraft model
    await UserAircraft.sync({ alter: true });

    console.log('✓ UserAircraft table created/updated successfully');

    // Close connection
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('✗ Failed to create UserAircraft table:', error);
    process.exit(1);
  }
}

syncUserAircraftTable();
