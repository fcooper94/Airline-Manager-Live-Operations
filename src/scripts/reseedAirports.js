require('dotenv').config();
const sequelize = require('../config/database');
const Airport = require('../models/Airport');

async function reseedAirports() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connection established\n');

    // Truncate airports table
    console.log('Truncating airports table...');
    await Airport.destroy({ where: {}, truncate: true, cascade: true });
    console.log('✓ Airports table truncated\n');

    // Now run the seed script
    console.log('Reseeding airports...');
    const { execSync } = require('child_process');
    execSync('npm run db:seed-airports', { stdio: 'inherit' });

    console.log('\n✓ Airports reseeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Error reseeding airports:', error.message);
    process.exit(1);
  }
}

reseedAirports();
