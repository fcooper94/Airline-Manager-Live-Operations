require('dotenv').config();
const airportGrowthService = require('../services/airportGrowthService');
const { Airport } = require('../models');

async function test1950() {
  try {
    console.log('=== Testing 1950 Traffic Calculations ===\n');

    const year = 1950;

    // Test specific airports
    const testAirports = [
      'KATL', // Atlanta - should have ~1M pax
      'OIAA', // Tehran - should have ~0.4M pax
      'EGLL', // London Heathrow
      'YSSY', // Sydney
      'KABE', // Random US airport
    ];

    const results = [];

    for (const icao of testAirports) {
      const airport = await Airport.findOne({ where: { icaoCode: icao } });

      if (!airport) {
        console.log(`  ⚠ ${icao} not found\n`);
        continue;
      }

      const metrics = airportGrowthService.getAirportMetrics(airport, year);

      const hasHistoricalData = !!airportGrowthService.HISTORICAL_PASSENGER_DATA[icao];
      const hasDetailedData = !!airportGrowthService.AIRPORT_2024_DATA[icao];

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

    // Sort by passengers and check for inconsistencies
    results.sort((a, b) => a.passengers - b.passengers);

    console.log('=== Sorted by passengers (ascending) ===\n');
    for (const result of results) {
      const paxFormatted = result.passengers >= 1
        ? `${result.passengers.toFixed(1)}M`
        : `${(result.passengers * 1000).toFixed(0)}K`;
      console.log(`${paxFormatted.padEnd(8)} → ${result.traffic.toString().padStart(2)}/20 traffic | ${result.icao}`);
    }

    console.log('\n=== Checking for original bug ===');
    console.log('Original issue: "400k is 15/20, but 3.4m is only 4/20"\n');

    // Find if any low-passenger airport has higher traffic than high-passenger airport
    let bugFound = false;
    for (let i = 0; i < results.length - 1; i++) {
      for (let j = i + 1; j < results.length; j++) {
        if (results[i].passengers < results[j].passengers && results[i].traffic > results[j].traffic) {
          console.log(`❌ Bug still exists!`);
          console.log(`   ${results[i].icao}: ${results[i].passengers}M pax → ${results[i].traffic}/20`);
          console.log(`   ${results[j].icao}: ${results[j].passengers}M pax → ${results[j].traffic}/20`);
          console.log(`   Lower passengers but HIGHER traffic!\n`);
          bugFound = true;
        }
      }
    }

    if (!bugFound) {
      console.log('✓ Bug fixed! All airports correctly sorted:');
      console.log('  Higher passengers = equal or higher traffic level\n');
    }

    process.exit(bugFound ? 1 : 0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test1950();
