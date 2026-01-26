require('dotenv').config();
const airportGrowthService = require('../services/airportGrowthService');

/**
 * Test script to demonstrate airport growth dynamics
 * Shows how traffic and infrastructure diverge realistically over time
 */

function testAirportGrowth() {
  console.log('=== Airport Growth Timeline Demo ===\n');

  // Test major airports across different eras and regions
  const airports = [
    // Airports WITH detailed data
    { icaoCode: 'EGLL', name: 'London Heathrow', type: 'International Hub' },
    { icaoCode: 'OMDB', name: 'Dubai International', type: 'International Hub' },
    { icaoCode: 'KIAH', name: 'Houston IAH', type: 'International Hub' },

    // Airports WITHOUT detailed data (using enhanced fallback)
    { icaoCode: 'KJAX', name: 'Jacksonville (Fallback)', type: 'Major' },
    { icaoCode: 'LFQQ', name: 'Lille (Fallback)', type: 'Regional' },
    { icaoCode: 'VGHS', name: 'South Asia (Fallback)', type: 'Regional' }
  ];

  const testYears = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020, 2024];

  airports.forEach(airport => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${airport.name} (${airport.icaoCode})`);
    console.log('='.repeat(60));

    // Get timeline data
    const timeline = airportGrowthService.getAirportTimeline(airport.icaoCode);
    if (timeline) {
      console.log(`Opened: ${timeline.opened}`);
      console.log(`Major Hub From: ${timeline.majorFrom}`);
      console.log(`2024 Passengers: ${timeline.pax2024}M\n`);
    }

    console.log('Year | Traffic | Infrastructure | Divergence | Recent Event');
    console.log('-'.repeat(80));

    testYears.forEach(year => {
      const metrics = airportGrowthService.getAirportMetrics(airport, year);
      const divergence = metrics.trafficDemand - metrics.infrastructureLevel;
      const divergenceStr = divergence > 0 ? `+${divergence}` : `${divergence}`;

      // Get recent milestone
      const recentMilestone = airportGrowthService.getRecentMilestone(airport.icaoCode, year);
      const milestoneStr = recentMilestone && recentMilestone.year >= year - 2
        ? `${recentMilestone.year}: ${recentMilestone.reason.substring(0, 30)}`
        : '';

      // Format the output with proper padding
      const trafficStr = `${metrics.trafficDemand}/20`.padEnd(7);
      const infraStr = `${metrics.infrastructureLevel}/20`.padEnd(14);

      console.log(
        `${year} | ${trafficStr} | ${infraStr} | ${divergenceStr.padStart(4)}       | ${milestoneStr}`
      );
    });

    // Show upcoming milestones for 2010
    console.log('\n--- Upcoming Milestones (from 2010) ---');
    const upcoming = airportGrowthService.getUpcomingMilestones(airport.icaoCode, 2010);
    upcoming.forEach(m => {
      console.log(`  ${m.year} (in ${m.yearsUntil} years): Level ${m.level} - ${m.reason}`);
    });
  });

  console.log('\n\n=== Analysis ===');
  console.log('Notice how:');
  console.log('1. Traffic grows smoothly over time');
  console.log('2. Infrastructure jumps at specific milestone dates');
  console.log('3. Divergence shows when traffic outpaces facilities (positive values)');
  console.log('4. After major upgrades, infrastructure can exceed traffic demand');
  console.log('5. Each airport has unique growth patterns based on real history\n');
}

testAirportGrowth();
