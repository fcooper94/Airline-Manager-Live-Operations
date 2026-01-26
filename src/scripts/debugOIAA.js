require('dotenv').config();
const airportGrowthService = require('../services/airportGrowthService');
const { Airport } = require('../models');

async function debugOIAA() {
  try {
    console.log('=== Debugging OIAA (Tehran) Passenger Calculations ===\n');

    // Get OIAA from database
    const oiaa = await Airport.findOne({ where: { icaoCode: 'OIAA' } });

    if (!oiaa) {
      console.log('❌ OIAA not found in database!');
      process.exit(1);
    }

    console.log('Airport Details:');
    console.log(`  ICAO: ${oiaa.icaoCode}`);
    console.log(`  Name: ${oiaa.name}`);
    console.log(`  Type: ${oiaa.type}`);
    console.log(`  Country: ${oiaa.country}`);
    console.log(`  Base Traffic: ${oiaa.trafficDemand}`);
    console.log(`  Base Infrastructure: ${oiaa.infrastructureLevel}\n`);

    // Test for 1950
    const year = 1950;
    console.log(`=== Calculating for ${year} ===\n`);

    // Get metrics
    const metrics = airportGrowthService.getAirportMetrics(oiaa, year);

    console.log('Calculated Metrics:');
    console.log(`  Traffic Demand: ${metrics.trafficDemand}/20`);
    console.log(`  Infrastructure: ${metrics.infrastructureLevel}/20`);
    console.log(`  Annual Passengers: ${metrics.annualPassengers}M`);
    console.log(`  Runways: ${metrics.runways}`);
    console.log(`  Stands: ${metrics.stands}\n`);

    // Check which priority path is used
    console.log('=== Priority Path Analysis ===\n');

    const historicalData = airportGrowthService.HISTORICAL_PASSENGER_DATA['OIAA'];
    const airportData = airportGrowthService.AIRPORT_2024_DATA['OIAA'];

    if (historicalData) {
      console.log('✓ Priority 1: Has historical passenger data');
      console.log(`  Data points: ${JSON.stringify(historicalData)}`);
    } else {
      console.log('✗ Priority 1: No historical passenger data');
    }

    if (airportData && airportData.pax2024) {
      console.log(`✓ Priority 2: Has 2024 data (${airportData.pax2024}M passengers)`);
      console.log(`  Major milestone: ${airportData.majorMilestone || 'Not specified'}`);
    } else {
      console.log('✗ Priority 2: No 2024 data');
    }

    if (!historicalData && (!airportData || !airportData.pax2024)) {
      console.log('→ Using Priority 3: Estimation based on traffic level');
    }

    // Manually calculate what it should be for each priority
    console.log('\n=== Manual Calculation Check ===\n');

    // Priority 3 calculation (most likely for OIAA)
    const eraMultiplier = airportGrowthService.getEraTrafficMultiplier(year);
    console.log(`Era multiplier for ${year}: ${eraMultiplier}`);

    const trafficLevel = metrics.trafficDemand;
    let estimatedPax = (trafficLevel / 20) * 104 * eraMultiplier;
    console.log(`Before era damping: ${estimatedPax.toFixed(2)}M`);

    let eraDamping = 1.0;
    if (year < 1960) eraDamping = 0.05;
    else if (year < 1970) eraDamping = 0.15;
    else if (year < 1980) eraDamping = 0.35;
    else if (year < 1990) eraDamping = 0.60;
    else if (year < 2000) eraDamping = 0.85;

    console.log(`Era damping for ${year}: ${eraDamping}`);
    estimatedPax *= eraDamping;
    console.log(`After era damping: ${estimatedPax.toFixed(2)}M`);
    console.log(`Expected result: ${Math.round(estimatedPax * 10) / 10}M\n`);

    // Test a few other years for comparison
    console.log('=== Other Years for Comparison ===\n');

    const testYears = [1960, 1970, 1980, 1990, 2000, 2010, 2024];
    for (const testYear of testYears) {
      const yearMetrics = airportGrowthService.getAirportMetrics(oiaa, testYear);
      console.log(`${testYear}: ${yearMetrics.annualPassengers}M passengers`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

debugOIAA();
