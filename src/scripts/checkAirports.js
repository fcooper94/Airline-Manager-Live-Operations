require('dotenv').config();
const { Airport } = require('../models');
const sequelize = require('../config/database');

/**
 * Check if specific airports exist in the database
 */

async function checkAirports() {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connected\n');

    const airportsToCheck = ['FAJS', 'FAOR', 'FACT', 'LFPG', 'EGLL', 'KJFK'];

    console.log('Checking for airports...\n');

    for (const icao of airportsToCheck) {
      const airport = await Airport.findOne({
        where: { icaoCode: icao }
      });

      if (airport) {
        console.log(`✓ ${icao}: ${airport.name} (${airport.city}, ${airport.country})`);
        console.log(`  Type: ${airport.type}, Active: ${airport.isActive}`);
        console.log(`  Operational: ${airport.operationalFrom || 'N/A'} - ${airport.operationalUntil || 'Present'}`);
        console.log(`  Demand: ${airport.trafficDemand || 'N/A'}, Infrastructure: ${airport.infrastructureLevel || 'N/A'}\n`);
      } else {
        console.log(`✗ ${icao}: NOT FOUND\n`);
      }
    }

    // Check total count
    const totalCount = await Airport.count({ where: { isActive: true } });
    console.log(`\nTotal active airports in database: ${totalCount}`);

    // Check if any airports have ICAO codes starting with FA
    const faAirports = await Airport.count({
      where: {
        icaoCode: {
          [require('sequelize').Op.like]: 'FA%'
        },
        isActive: true
      }
    });
    console.log(`Airports with ICAO starting with FA: ${faAirports}`);

    // Check if any airports have ICAO codes starting with LF
    const lfAirports = await Airport.count({
      where: {
        icaoCode: {
          [require('sequelize').Op.like]: 'LF%'
        },
        isActive: true
      }
    });
    console.log(`Airports with ICAO starting with LF: ${lfAirports}`);

    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkAirports();
