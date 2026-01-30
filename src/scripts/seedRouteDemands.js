require('dotenv').config();
const sequelize = require('../config/database');
const { Airport, AirportRouteDemand } = require('../models');

/**
 * Seed comprehensive route demand database
 * Covers all viable airport pairs globally
 */

/**
 * Calculate great circle distance between two points
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} - Distance in nautical miles
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get distance multiplier based on sweet spot curve
 * Different route lengths have different demand characteristics
 */
function getDistanceMultiplier(distance, fromCountry, toCountry) {
  const isDomestic = fromCountry === toCountry;

  if (isDomestic) {
    // Domestic routes: Sweet spot 300-1500nm, peak at 600nm
    if (distance < 100) return 0.1; // Too short for commercial aviation
    if (distance < 300) return 0.5 + (distance - 100) / 400; // Ramp up
    if (distance < 600) return 1.0 + (distance - 300) / 600; // Rise to peak
    if (distance < 1500) return 1.5 - (distance - 600) / 1800; // Gradual decline
    if (distance < 3000) return 0.8 - (distance - 1500) / 6000; // Slow decline
    return 0.3; // Long domestic routes are rare
  } else {
    // International routes: Sweet spot 400-4000nm, peak at 2000nm
    if (distance < 200) return 0.2; // Very short international rare
    if (distance < 400) return 0.4 + (distance - 200) / 400; // Ramp up
    if (distance < 2000) return 1.0 + (distance - 400) / 3200; // Rise to peak
    if (distance < 4000) return 1.5 - (distance - 2000) / 4000; // Gradual decline
    if (distance < 8000) return 0.8 - (distance - 4000) / 10000; // Slow decline
    return 0.4; // Ultra-long haul exists but lower demand
  }
}

/**
 * Get country pair multiplier for historical/cultural links
 */
function getCountryPairMultiplier(fromCountry, toCountry) {
  if (fromCountry === toCountry) {
    return 1.5; // Domestic routes have higher demand
  }

  // Simplified regional groupings for neighbor/cultural tie bonuses
  const regions = {
    northAmerica: ['United States', 'Canada', 'Mexico'],
    westernEurope: ['United Kingdom', 'France', 'Germany', 'Spain', 'Italy', 'Netherlands', 'Belgium', 'Switzerland', 'Austria'],
    eastAsia: ['China', 'Japan', 'South Korea', 'Taiwan'],
    southeastAsia: ['Thailand', 'Singapore', 'Malaysia', 'Indonesia', 'Vietnam', 'Philippines'],
    middleEast: ['United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Oman'],
    oceania: ['Australia', 'New Zealand']
  };

  // Check if countries are in the same region (neighbors/cultural ties)
  for (const region of Object.values(regions)) {
    if (region.includes(fromCountry) && region.includes(toCountry)) {
      return 1.3; // Regional partners
    }
  }

  // Historical colonial/cultural links (simplified)
  const culturalLinks = [
    ['United Kingdom', 'India'],
    ['United Kingdom', 'Australia'],
    ['United Kingdom', 'United States'],
    ['Spain', 'Mexico'],
    ['Spain', 'Argentina'],
    ['Portugal', 'Brazil'],
    ['France', 'Morocco'],
    ['United States', 'Japan']
  ];

  for (const [country1, country2] of culturalLinks) {
    if ((fromCountry === country1 && toCountry === country2) ||
        (fromCountry === country2 && toCountry === country1)) {
      return 1.2;
    }
  }

  return 1.0; // Default
}

/**
 * Determine route type based on airports and distance
 */
function determineRouteType(fromAirport, toAirport, distance) {
  // Business routes: Major hubs with short/medium distance
  if ((fromAirport.type === 'International Hub' || fromAirport.type === 'Major') &&
      (toAirport.type === 'International Hub' || toAirport.type === 'Major') &&
      distance < 3000) {
    return 'business';
  }

  // Leisure routes: To tourist destinations or seasonal patterns
  const touristCountries = ['Spain', 'Thailand', 'Greece', 'Turkey', 'Mexico'];
  if (touristCountries.includes(toAirport.country)) {
    return 'leisure';
  }

  // Regional routes: Domestic or short international
  if (fromAirport.country === toAirport.country && distance < 1500) {
    return 'regional';
  }

  // Cargo routes: Very long haul or to major cargo hubs
  const cargoHubs = ['PANC', 'KLAX', 'VHHH', 'RJAA', 'OMDB', 'EDDF'];
  if (distance > 5000 || cargoHubs.includes(fromAirport.icaoCode) || cargoHubs.includes(toAirport.icaoCode)) {
    return 'cargo';
  }

  return 'mixed';
}

/**
 * Calculate demand score for a route
 */
function calculateDemandScore(fromAirport, toAirport, distance) {
  // Base score from airport traffic (geometric mean)
  const baseScore = Math.sqrt(
    fromAirport.trafficDemand * toAirport.trafficDemand
  ) * 5; // Scale to ~100

  // Distance multiplier (sweet spot curve)
  const distanceMultiplier = getDistanceMultiplier(
    distance,
    fromAirport.country,
    toAirport.country
  );

  // Country pair multiplier
  const countryMultiplier = getCountryPairMultiplier(
    fromAirport.country,
    toAirport.country
  );

  // Airport type bonus (hubs generate more demand)
  let typeMultiplier = 1.0;
  if (fromAirport.type === 'International Hub' && toAirport.type === 'International Hub') {
    typeMultiplier = 1.3;
  } else if (fromAirport.type === 'International Hub' || toAirport.type === 'International Hub') {
    typeMultiplier = 1.15;
  }

  // Final demand calculation
  const demand = baseScore * distanceMultiplier * countryMultiplier * typeMultiplier;

  return Math.max(0, Math.min(100, Math.round(demand)));
}

/**
 * Get demand category from demand score
 */
function getDemandCategory(demand) {
  if (demand >= 80) return 'very_high';
  if (demand >= 60) return 'high';
  if (demand >= 40) return 'medium';
  if (demand >= 20) return 'low';
  return 'very_low';
}

/**
 * Main seeding function
 */
async function seedRouteDemands() {
  try {
    console.log('Starting route demand seeding...');
    console.log('This may take several minutes for large datasets.\n');

    // Get all active airports, prioritize by traffic demand
    const airports = await Airport.findAll({
      where: { isActive: true },
      order: [['trafficDemand', 'DESC']],
      attributes: ['id', 'icaoCode', 'iataCode', 'name', 'city', 'country', 'type', 'latitude', 'longitude', 'trafficDemand']
    });

    console.log(`Found ${airports.length} active airports`);

    // Check existing progress
    const existingCount = await AirportRouteDemand.count();
    console.log(`Existing route demands in database: ${existingCount}`);

    if (existingCount > 0) {
      console.log('✓ Resuming from previous run (will skip existing pairs)\n');
    } else {
      console.log('Starting fresh seed\n');
    }

    let routesSeeded = 0;
    let demandRecords = [];
    const batchSize = 1000;

    console.log('Calculating route demands...\n');

    // Generate demand for all viable pairs
    for (let i = 0; i < airports.length; i++) {
      const fromAirport = airports[i];

      // Progress indicator
      if (i % 10 === 0) {
        console.log(`Processing airport ${i + 1}/${airports.length}: ${fromAirport.icaoCode} (${routesSeeded} routes generated)`);
      }

      for (let j = 0; j < airports.length; j++) {
        if (i === j) continue; // Skip same airport

        const toAirport = airports[j];

        // Calculate distance
        const distance = calculateDistance(
          fromAirport.latitude,
          fromAirport.longitude,
          toAirport.latitude,
          toAirport.longitude
        );

        // Filter: Skip if distance < 100nm or > 10,000nm (not commercially viable)
        if (distance < 100 || distance > 10000) continue;

        // Calculate demand score
        const demand = calculateDemandScore(
          fromAirport,
          toAirport,
          distance
        );

        // Filter: Only seed routes with demand >= 10 to keep database size reasonable
        if (demand < 10) continue;

        // Determine category
        const category = getDemandCategory(demand);

        // Determine route type
        const routeType = determineRouteType(
          fromAirport,
          toAirport,
          distance
        );

        demandRecords.push({
          fromAirportId: fromAirport.id,
          toAirportId: toAirport.id,
          baseDemand: demand,
          demandCategory: category,
          routeType: routeType
        });

        routesSeeded++;

        // Batch insert every 1000 records for performance
        if (demandRecords.length >= batchSize) {
          await AirportRouteDemand.bulkCreate(demandRecords, {
            ignoreDuplicates: true // Skip existing pairs
          });
          demandRecords = [];
        }
      }
    }

    // Insert remaining records
    if (demandRecords.length > 0) {
      await AirportRouteDemand.bulkCreate(demandRecords, {
        ignoreDuplicates: true // Skip existing pairs
      });
    }

    // Get final count
    const finalCount = await AirportRouteDemand.count();
    const newRecords = finalCount - existingCount;

    console.log(`\n✓ Processing complete!`);
    console.log(`  Total route pairs generated: ${routesSeeded}`);
    console.log(`  New records inserted: ${newRecords}`);
    console.log(`  Records skipped (already exist): ${routesSeeded - newRecords}`);
    console.log(`  Total records in database: ${finalCount}`);

    // Show statistics
    const stats = await sequelize.query(`
      SELECT
        demand_category,
        COUNT(*) as count
      FROM airport_route_demands
      GROUP BY demand_category
      ORDER BY
        CASE demand_category
          WHEN 'very_high' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          WHEN 'very_low' THEN 5
        END
    `, { type: sequelize.QueryTypes.SELECT });

    console.log('\nDemand Distribution:');
    stats.forEach(s => {
      console.log(`  ${s.demand_category.padEnd(15)}: ${s.count.toLocaleString('en-US')} routes`);
    });

  } catch (error) {
    console.error('Error seeding route demands:', error);
    throw error;
  }
}

// Run the seeding
seedRouteDemands()
  .then(() => {
    console.log('\nRoute demand seeding completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\nRoute demand seeding failed:', error);
    process.exit(1);
  });
