require('dotenv').config();
const sequelize = require('../config/database');
const { Route } = require('../models');

async function createRoutesTable() {
  try {
    console.log('Creating routes table...');

    // Sync only the Route model
    await Route.sync({ force: false });

    console.log('✓ Routes table created successfully');

    // Close connection
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('✗ Failed to create routes table:', error);
    process.exit(1);
  }
}

createRoutesTable();
