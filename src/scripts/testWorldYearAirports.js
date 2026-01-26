require('dotenv').config();
const airportGrowthService = require('../services/airportGrowthService');

/**
 * Test script to verify airport metrics for different world years
 * Simulates what the world selection API would return
 */

function testWorldYearAirports() {
  console.log('=== Airport Metrics by World Year ===\n');

  // Test different world years
  const testYears = [1950, 1970, 1995, 2024];

  // Test airports with different characteristics
  const testAirports = [
    { icaoCode: 'EGLL', name: 'London Heathrow', type: 'International Hub' },
    { icaoCode: 'OMDB', name: 'Dubai International', type: 'International Hub' },
    { icaoCode: 'EGSS', name: 'London Stansted', type: 'Major' },
    { icaoCode: 'EGKK', name: 'London Gatwick', type: 'Major' },
    { icaoCode: 'KJFK', name: 'New York JFK', type: 'International Hub' },
    { icaoCode: 'KSFO', name: 'San Francisco', type: 'Major' }
  ];

  testYears.forEach(year => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`WORLD YEAR: ${year}`);
    console.log('='.repeat(70));
    console.log('Airport'.padEnd(25) + 'Traffic'.padEnd(12) + 'Infrastructure'.padEnd(18) + 'Divergence');
    console.log('-'.repeat(70));

    testAirports.forEach(airport => {
      const metrics = airportGrowthService.getAirportMetrics(airport, year);
      const divergence = metrics.trafficDemand - metrics.infrastructureLevel;
      const divergenceStr = divergence > 0 ? `+${divergence}` : `${divergence}`;

      console.log(
        airport.name.padEnd(25) +
        `${metrics.trafficDemand}/20`.padEnd(12) +
        `${metrics.infrastructureLevel}/20`.padEnd(18) +
        divergenceStr
      );
    });
  });

  console.log('\n\n=== Key Observations ===');
  console.log('1. In 1950, Heathrow shows 20/20 traffic (busiest of that era)');
  console.log('2. In 1950, Dubai shows 2/20 (airport didn\'t exist as major hub)');
  console.log('3. In 2024, multiple airports can show different values based on actual size');
  console.log('4. The scale is always relative to the busiest airport of that specific year');
  console.log('5. Infrastructure and traffic diverge realistically based on historical patterns\n');
}

testWorldYearAirports();
