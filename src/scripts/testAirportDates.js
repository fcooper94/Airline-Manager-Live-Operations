require('dotenv').config();
const sequelize = require('../config/database');
const { Airport, World } = require('../models');

async function testAirportDates() {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connected\n');

    // Get some examples of airports with operational dates
    console.log('=== Airports with Operational Dates ===\n');

    const historicalAirports = await Airport.findAll({
      where: { operationalUntil: { [require('sequelize').Op.ne]: null } },
      order: [['operationalUntil', 'ASC']],
      limit: 10
    });

    console.log('Historical (Closed) Airports:');
    historicalAirports.forEach(airport => {
      console.log(`  ${airport.name} (${airport.icaoCode}): ${airport.operationalFrom} - ${airport.operationalUntil}`);
    });

    console.log('\n=== Testing World-Based Filtering ===\n');

    // Get a world to test with
    const testWorld = await World.findOne();
    if (testWorld) {
      const worldYear = testWorld.currentTime.getFullYear();
      console.log(`Test World: ${testWorld.name} (Year: ${worldYear})\n`);

      // Test filtering
      const { Op } = require('sequelize');
      const operationalInWorld = await Airport.findAll({
        where: {
          [Op.and]: [
            {
              [Op.or]: [
                { operationalFrom: null },
                { operationalFrom: { [Op.lte]: worldYear } }
              ]
            },
            {
              [Op.or]: [
                { operationalUntil: null },
                { operationalUntil: { [Op.gte]: worldYear } }
              ]
            }
          ]
        },
        limit: 5
      });

      console.log(`Airports operational in ${worldYear}:`);
      operationalInWorld.forEach(airport => {
        const from = airport.operationalFrom || 'Unknown';
        const until = airport.operationalUntil || 'Present';
        console.log(`  ${airport.name} (${airport.icaoCode}): ${from} - ${until}`);
      });

      // Check for airports that would be filtered out
      const notOperational = await Airport.findAll({
        where: {
          [Op.or]: [
            { operationalFrom: { [Op.gt]: worldYear } },
            { operationalUntil: { [Op.lt]: worldYear } }
          ]
        },
        limit: 5
      });

      console.log(`\nAirports NOT operational in ${worldYear}:`);
      if (notOperational.length === 0) {
        console.log('  (None - all airports operational in this time period)');
      } else {
        notOperational.forEach(airport => {
          console.log(`  ${airport.name} (${airport.icaoCode}): ${airport.operationalFrom} - ${airport.operationalUntil || 'Present'}`);
        });
      }
    }

    // Summary
    console.log('\n=== Airport Database Summary ===\n');
    const totalAirports = await Airport.count();
    const activeAirports = await Airport.count({ where: { operationalUntil: null } });
    const closedAirports = await Airport.count({ where: { operationalUntil: { [require('sequelize').Op.ne]: null } } });

    console.log(`Total Airports: ${totalAirports}`);
    console.log(`Currently Active: ${activeAirports}`);
    console.log(`Historical (Closed): ${closedAirports}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testAirportDates();
