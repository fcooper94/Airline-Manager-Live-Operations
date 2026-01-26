require('dotenv').config();
const airportGrowthService = require('../services/airportGrowthService');
const { Airport, World } = require('../models');

async function testSorting() {
  try {
    console.log('=== Testing Airport Sorting ===\n');

    // Get world year
    const world = await World.findOne({ where: { status: 'active' } });
    if (!world) {
      console.log('No active world found');
      process.exit(1);
    }

    const worldYear = world.currentTime.getFullYear();
    console.log(`World year: ${worldYear}\n`);

    // Get some sample airports
    const airports = await Airport.findAll({
      where: {
        isActive: true,
        type: 'International Hub'
      },
      limit: 20
    });

    console.log(`Found ${airports.length} International Hub airports\n`);

    // Calculate metrics for each
    const airportsWithMetrics = airports.map(airport => {
      const metrics = airportGrowthService.getAirportMetrics(airport, worldYear);
      return {
        icaoCode: airport.icaoCode,
        name: airport.name,
        annualPassengers: metrics.annualPassengers,
        trafficDemand: metrics.trafficDemand
      };
    });

    // Sort by annual passengers (descending)
    airportsWithMetrics.sort((a, b) => {
      const paxA = Number(a.annualPassengers) || 0;
      const paxB = Number(b.annualPassengers) || 0;
      return paxB - paxA;
    });

    console.log('Airports sorted by annual passengers:\n');
    airportsWithMetrics.forEach((airport, index) => {
      console.log(`${(index + 1).toString().padStart(2)}. ${airport.icaoCode} - ${airport.name}`);
      console.log(`    ${airport.annualPassengers}M passengers (Traffic: ${airport.trafficDemand}/20)\n`);
    });

    // Verify sorting is correct
    let isSorted = true;
    for (let i = 1; i < airportsWithMetrics.length; i++) {
      if (airportsWithMetrics[i].annualPassengers > airportsWithMetrics[i-1].annualPassengers) {
        console.log(`❌ Sorting error: ${airportsWithMetrics[i].icaoCode} (${airportsWithMetrics[i].annualPassengers}M) > ${airportsWithMetrics[i-1].icaoCode} (${airportsWithMetrics[i-1].annualPassengers}M)`);
        isSorted = false;
      }
    }

    if (isSorted) {
      console.log('✓ Sorting is correct - descending order by annual passengers');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSorting();
