require('dotenv').config();
const airportGrowthService = require('../services/airportGrowthService');
const { Airport } = require('../models');

async function debugKATL() {
  try {
    console.log('=== Debugging KATL (Atlanta) Passenger Calculations ===\n');

    // Get KATL from database
    const katl = await Airport.findOne({ where: { icaoCode: 'KATL' } });

    if (!katl) {
      console.log('❌ KATL not found in database!');
      process.exit(1);
    }

    console.log('Airport Details:');
    console.log(`  ICAO: ${katl.icaoCode}`);
    console.log(`  Name: ${katl.name}`);
    console.log(`  Type: ${katl.type}`);
    console.log(`  Country: ${katl.country}\n`);

    // Test key years
    console.log('=== Passenger Data Over Time ===\n');

    const testYears = [1950, 1955, 1960, 1970, 1980, 1990, 2000, 2010, 2019, 2024];

    console.log('Expected (from historical data):');
    console.log('  1955: 2.1M');
    console.log('  1970: 16.5M');
    console.log('  1980: 46.9M');
    console.log('  2019: 110.5M');
    console.log('  2024: 104M\n');

    console.log('Calculated:');
    for (const year of testYears) {
      const metrics = airportGrowthService.getAirportMetrics(katl, year);
      console.log(`  ${year}: ${metrics.annualPassengers}M passengers`);
    }

    // Check priority path
    console.log('\n=== Priority Path ===');
    const historicalData = airportGrowthService.HISTORICAL_PASSENGER_DATA['KATL'];
    if (historicalData) {
      console.log('✓ Using Priority 1: Historical passenger data');
      console.log(`  Data points: ${Object.keys(historicalData).join(', ')}\n`);
    }

    // Compare KATL vs OIAA for 1950
    console.log('=== 1950 Comparison ===\n');
    const oiaa = await Airport.findOne({ where: { icaoCode: 'OIAA' } });
    if (oiaa) {
      const katlMetrics = airportGrowthService.getAirportMetrics(katl, 1950);
      const oiaaMetrics = airportGrowthService.getAirportMetrics(oiaa, 1950);

      console.log(`KATL (Atlanta): ${katlMetrics.annualPassengers}M passengers`);
      console.log(`OIAA (Tehran): ${oiaaMetrics.annualPassengers}M passengers`);

      if (katlMetrics.annualPassengers > oiaaMetrics.annualPassengers) {
        console.log('\n✓ KATL is correctly busier than OIAA in 1950');
      } else {
        console.log('\n❌ OIAA is showing busier than KATL - something is wrong');
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

debugKATL();
