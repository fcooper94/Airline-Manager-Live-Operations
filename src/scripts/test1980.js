require('dotenv').config();
const airportGrowthService = require('../services/airportGrowthService');
const { Airport } = require('../models');

async function test1980() {
  try {
    console.log('=== Testing 1980 Traffic Calculations ===\n');

    const year = 1980;

    const testAirports = ['KATL', 'OIAA', 'EGLL', 'YSSY', 'KABE', 'PKMJ'];

    const results = [];

    for (const icao of testAirports) {
      const airport = await Airport.findOne({ where: { icaoCode: icao } });
      if (!airport) continue;

      const metrics = airportGrowthService.getAirportMetrics(airport, year);
      const hasHistoricalData = !!airportGrowthService.HISTORICAL_PASSENGER_DATA[icao];

      results.push({
        icao,
        passengers: metrics.annualPassengers,
        traffic: metrics.trafficDemand,
        hasHistoricalData
      });

      console.log(`${icao}: ${metrics.annualPassengers}M pax → ${metrics.trafficDemand}/20 traffic (${hasHistoricalData ? 'Historical' : 'Estimated'})`);
    }

    results.sort((a, b) => b.passengers - a.passengers);

    console.log('\n=== Sorted by passengers (descending) ===\n');
    for (const result of results) {
      console.log(`${result.passengers.toFixed(1)}M pax → ${result.traffic}/20 | ${result.icao}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

test1980();
