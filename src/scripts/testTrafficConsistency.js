require('dotenv').config();
const airportGrowthService = require('../services/airportGrowthService');
const { Airport, World } = require('../models');

async function testTrafficConsistency() {
  try {
    console.log('=== Testing Traffic Level Consistency ===\n');

    // Get world year
    const world = await World.findOne({ where: { status: 'active' } });
    if (!world) {
      console.log('No active world found');
      process.exit(1);
    }

    const worldYear = world.currentTime.getFullYear();
    console.log(`World year: ${worldYear}\n`);

    // Get a mix of airports - some with detailed data, some without
    const testAirports = [
      'KATL', // Has historical data (Atlanta)
      'EGLL', // Has historical data (Heathrow)
      'OIAA', // No detailed data (Tehran)
      'YSSY', // Has historical data (Sydney)
      'KABE', // No detailed data (random US airport)
      'PKMJ', // No detailed data (Marshall Islands)
    ];

    console.log('Calculating metrics for test airports:\n');

    const results = [];

    for (const icao of testAirports) {
      const airport = await Airport.findOne({ where: { icaoCode: icao } });

      if (!airport) {
        console.log(`  ⚠ ${icao} not found\n`);
        continue;
      }

      const metrics = airportGrowthService.getAirportMetrics(airport, worldYear);

      const hasDetailedData = !!airportGrowthService.AIRPORT_2024_DATA[icao];
      const hasHistoricalData = !!airportGrowthService.HISTORICAL_PASSENGER_DATA[icao];

      results.push({
        icao,
        name: airport.name,
        type: airport.type,
        passengers: metrics.annualPassengers,
        traffic: metrics.trafficDemand,
        hasDetailedData,
        hasHistoricalData
      });

      console.log(`${icao} - ${airport.name}`);
      console.log(`  Type: ${airport.type}`);
      console.log(`  Passengers: ${metrics.annualPassengers}M`);
      console.log(`  Traffic: ${metrics.trafficDemand}/20`);
      console.log(`  Data: ${hasHistoricalData ? 'Historical' : hasDetailedData ? '2024 only' : 'Estimated'}\n`);
    }

    // Verify consistency: higher passengers = higher (or equal) traffic level
    console.log('=== Consistency Check ===\n');

    // Sort by passengers
    results.sort((a, b) => a.passengers - b.passengers);

    let previousPassengers = 0;
    let previousTraffic = 0;
    let inconsistencies = 0;

    for (const result of results) {
      if (result.passengers > previousPassengers && result.traffic < previousTraffic) {
        console.log(`❌ Inconsistency: ${result.icao} has ${result.passengers}M pax (traffic ${result.traffic}/20)`);
        console.log(`   but previous airport had ${previousPassengers}M pax (traffic ${previousTraffic}/20)\n`);
        inconsistencies++;
      }

      previousPassengers = result.passengers;
      previousTraffic = result.traffic;
    }

    if (inconsistencies === 0) {
      console.log('✓ All airports show consistent traffic levels based on passenger numbers');
      console.log('  (Higher passengers = equal or higher traffic level)\n');
    } else {
      console.log(`❌ Found ${inconsistencies} inconsistencies\n`);
    }

    // Show sorted list
    console.log('=== Airports sorted by passengers ===\n');
    for (const result of results) {
      console.log(`${result.passengers.toFixed(2)}M pax → ${result.traffic}/20 traffic | ${result.icao} (${result.type})`);
    }

    process.exit(inconsistencies > 0 ? 1 : 0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testTrafficConsistency();
