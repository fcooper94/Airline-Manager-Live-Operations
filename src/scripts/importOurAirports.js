require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const sequelize = require('../config/database');
const Airport = require('../models/Airport');

const DATA_DIR = path.join(__dirname, '../../data');
const AIRPORTS_CSV = path.join(DATA_DIR, 'ourairports-airports.csv');
const COUNTRIES_CSV = path.join(DATA_DIR, 'ourairports-countries.csv');

// Airport type mapping from OurAirports to our system
const TYPE_MAPPING = {
  'large_airport': 'International Hub',
  'medium_airport': 'Major',
  'small_airport': 'Regional',
  'closed': 'Regional' // We'll mark these as disabled
};

// Default operational start year for airports without known dates
const DEFAULT_OPERATIONAL_FROM = 1950;

// Historically significant airports that should always be included from OurAirports
// NOTE: Many famous closed airports (Kai Tak, Berlin Tegel/Tempelhof, Meigs Field, etc.)
// are NOT in OurAirports database anymore. Use seedHistoricalAirports.js to add those.
const HISTORICAL_AIRPORTS_TO_INCLUDE = [
  'LTBA', // Istanbul Atatürk (1953-2019) - In OurAirports but no scheduled service
  'LBSF', // Sofia (Bulgaria) - Still active in database
  'UUEE', // Moscow Sheremetyevo - Historically significant
  'ZBAD', // Beijing Daxing (2019) - Modern mega-airport
  'WMKK', // Kuala Lumpur International (1998) - Replaced Subang
  'VTBS', // Bangkok Suvarnabhumi (2006) - Replaced Don Mueang
  'RKSI', // Seoul Incheon (2001) - Replaced Gimpo for international flights
  'RJBB', // Osaka Kansai (1994) - Built on artificial island
  'ZSHC', // Shanghai Hongqiao - Historic Chinese airport
  'YMML', // Melbourne Tullamarine (1970) - Replaced Essendon
  'YSSY', // Sydney Kingsford Smith (1920) - Australia's oldest major airport
  'VTBD', // Bangkok Don Mueang (1914) - Historic Thai airport
  'RKSS', // Seoul Gimpo (1939) - Historic Korean airport
  'LGAV', // Athens International (2001) - Replaced Ellinikon
  'ENGM', // Oslo Gardermoen (1998) - Replaced Fornebu
  'EDDB', // Berlin Brandenburg (2020) - Replaced Tegel
  'LTFM', // Istanbul Airport (2018) - Replaced Atatürk
];

/**
 * Download file from URL
 */
function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    const file = fs.createWriteStream(filepath);

    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✓ Downloaded to ${filepath}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

/**
 * Parse CSV file
 */
function parseCSV(filepath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filepath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

/**
 * Get timezone from coordinates (simplified - uses rough mapping)
 */
function getTimezone(lat, lon, country) {
  // Simplified timezone mapping - you can enhance this
  const timezones = {
    'US': 'America/New_York',
    'CA': 'America/Toronto',
    'GB': 'Europe/London',
    'FR': 'Europe/Paris',
    'DE': 'Europe/Berlin',
    'ES': 'Europe/Madrid',
    'IT': 'Europe/Rome',
    'JP': 'Asia/Tokyo',
    'CN': 'Asia/Shanghai',
    'AU': 'Australia/Sydney',
    'BR': 'America/Sao_Paulo',
    'IN': 'Asia/Kolkata',
    'RU': 'Europe/Moscow',
    'ZA': 'Africa/Johannesburg',
    'MX': 'America/Mexico_City',
    'AR': 'America/Argentina/Buenos_Aires',
    'NZ': 'Pacific/Auckland',
    'SG': 'Asia/Singapore',
    'HK': 'Asia/Hong_Kong',
    'AE': 'Asia/Dubai',
    'SA': 'Asia/Riyadh',
    'EG': 'Africa/Cairo',
    'NG': 'Africa/Lagos',
    'KE': 'Africa/Nairobi'
  };

  return timezones[country] || 'UTC';
}

/**
 * Filter and rank airports by country
 */
function filterTopAirports(airports, maxPerCountry = 10) {
  const byCountry = {};

  // Group by country
  airports.forEach(airport => {
    const country = airport.iso_country;
    if (!byCountry[country]) {
      byCountry[country] = [];
    }
    byCountry[country].push(airport);
  });

  const filtered = [];

  // For each country, select top airports
  Object.keys(byCountry).forEach(country => {
    const countryAirports = byCountry[country];

    // Priority scoring
    countryAirports.forEach(airport => {
      let score = 0;

      // Type priority
      if (airport.type === 'large_airport') score += 100;
      else if (airport.type === 'medium_airport') score += 50;
      else if (airport.type === 'small_airport') score += 10;

      // Has IATA code (commercial airport)
      if (airport.iata_code) score += 30;

      // Has scheduled service
      if (airport.scheduled_service === 'yes') score += 20;

      // International airport keyword in name
      if (airport.name.toLowerCase().includes('international')) score += 15;

      airport.priority_score = score;
    });

    // Sort by priority score
    countryAirports.sort((a, b) => b.priority_score - a.priority_score);

    // Take top N airports per country
    const topAirports = countryAirports.slice(0, maxPerCountry);
    filtered.push(...topAirports);
  });

  console.log(`\nFiltered to ${filtered.length} airports across ${Object.keys(byCountry).length} countries`);
  return filtered;
}

/**
 * Convert OurAirports data to our format
 */
function convertAirport(airport, countries) {
  const countryData = countries.find(c => c.code === airport.iso_country);
  const countryName = countryData ? countryData.name : airport.iso_country;

  // Determine if airport is closed
  const isClosed = airport.type === 'closed';

  return {
    icaoCode: airport.ident && airport.ident.length === 4 ? airport.ident : null,
    iataCode: airport.iata_code || null,
    name: airport.name,
    city: airport.municipality || 'Unknown',
    country: countryName,
    latitude: parseFloat(airport.latitude_deg) || 0,
    longitude: parseFloat(airport.longitude_deg) || 0,
    elevation: airport.elevation_ft ? parseInt(airport.elevation_ft) : null,
    type: TYPE_MAPPING[airport.type] || 'Regional',
    timezone: getTimezone(airport.latitude_deg, airport.longitude_deg, airport.iso_country),
    isActive: true, // All airports enabled by default - operational dates determine world availability
    operationalFrom: DEFAULT_OPERATIONAL_FROM, // Default - can be updated later
    operationalUntil: isClosed ? 2020 : null, // Approximate closure date
    priority_score: airport.priority_score
  };
}

/**
 * Main import function
 */
async function importAirports() {
  try {
    console.log('=== OurAirports Data Import ===\n');

    // Create data directory
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Download files if they don't exist
    if (!fs.existsSync(AIRPORTS_CSV)) {
      await downloadFile(
        'https://davidmegginson.github.io/ourairports-data/airports.csv',
        AIRPORTS_CSV
      );
    } else {
      console.log('Using cached airports.csv');
    }

    if (!fs.existsSync(COUNTRIES_CSV)) {
      await downloadFile(
        'https://davidmegginson.github.io/ourairports-data/countries.csv',
        COUNTRIES_CSV
      );
    } else {
      console.log('Using cached countries.csv');
    }

    console.log('\nParsing CSV files...');
    const allAirports = await parseCSV(AIRPORTS_CSV);
    const countries = await parseCSV(COUNTRIES_CSV);
    console.log(`✓ Parsed ${allAirports.length} total airports`);
    console.log(`✓ Parsed ${countries.length} countries`);

    // Filter for relevant airports only
    console.log('\nFiltering airports...');
    const relevantTypes = ['large_airport', 'medium_airport', 'small_airport', 'closed'];
    let filteredAirports = allAirports.filter(airport => {
      // Include if it's a historically significant airport (bypass all other filters)
      if (HISTORICAL_AIRPORTS_TO_INCLUDE.includes(airport.ident)) {
        return true;
      }

      // Otherwise, must be relevant type with IATA code and scheduled service
      return relevantTypes.includes(airport.type) &&
        airport.iata_code && // Must have IATA code (commercial)
        airport.scheduled_service === 'yes'; // Must have scheduled service
    });

    console.log(`✓ Filtered to ${filteredAirports.length} commercial airports with scheduled service`);

    // Count historical airports included
    const historicalIncluded = filteredAirports.filter(a =>
      HISTORICAL_AIRPORTS_TO_INCLUDE.includes(a.ident)
    ).length;
    console.log(`✓ Including ${historicalIncluded} historically significant airports`);

    // Separate historical and active airports
    const historicalAirports = filteredAirports.filter(a =>
      HISTORICAL_AIRPORTS_TO_INCLUDE.includes(a.ident)
    );
    const activeAirports = filteredAirports.filter(a =>
      !HISTORICAL_AIRPORTS_TO_INCLUDE.includes(a.ident)
    );

    console.log(`\nHistorical airports: ${historicalAirports.length}`);
    console.log(`Active airports for filtering: ${activeAirports.length}`);

    // Get top airports per country from active airports
    const topAirports = filterTopAirports(activeAirports, 20);

    // Combine top airports with all historical airports
    const combinedAirports = [...historicalAirports, ...topAirports];
    console.log(`\nTotal after combining: ${combinedAirports.length} airports`);

    // Convert to our format
    console.log('\nConverting to database format...');
    const airportsToImport = combinedAirports
      .map(airport => convertAirport(airport, countries))
      .filter(airport => airport.icaoCode && airport.icaoCode.length === 4); // Must have valid ICAO code

    console.log(`✓ ${airportsToImport.length} airports ready for import`);

    // Connect to database
    console.log('\nConnecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connected');

    // Ask user if they want to replace existing data
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      readline.question('\nThis will REPLACE all existing airports. Continue? (yes/no): ', resolve);
    });
    readline.close();

    if (answer.toLowerCase() !== 'yes') {
      console.log('Import cancelled.');
      process.exit(0);
    }

    // Truncate existing airports
    console.log('\nTruncating airports table...');
    await Airport.destroy({ where: {}, truncate: true, cascade: true });
    console.log('✓ Existing airports removed');

    // Import new airports
    console.log('\nImporting airports...');
    let imported = 0;
    const batchSize = 100;

    for (let i = 0; i < airportsToImport.length; i += batchSize) {
      const batch = airportsToImport.slice(i, i + batchSize);
      await Airport.bulkCreate(batch, { validate: true });
      imported += batch.length;
      process.stdout.write(`\rImported ${imported}/${airportsToImport.length} airports...`);
    }
    console.log('\n✓ Import complete!');

    // Statistics
    const stats = {
      total: await Airport.count(),
      byType: {},
      byContinent: {},
      closed: await Airport.count({ where: { operationalUntil: { [require('sequelize').Op.ne]: null } } })
    };

    const types = ['International Hub', 'Major', 'Regional', 'Small Regional'];
    for (const type of types) {
      stats.byType[type] = await Airport.count({ where: { type } });
    }

    console.log('\n=== Import Statistics ===');
    console.log(`Total Airports: ${stats.total}`);
    console.log('\nBy Type:');
    Object.keys(stats.byType).forEach(type => {
      console.log(`  ${type}: ${stats.byType[type]}`);
    });
    console.log(`\nClosed Airports: ${stats.closed}`);

    // Show sample airports by region
    console.log('\n=== Sample Airports by Region ===');
    const samples = await Airport.findAll({
      limit: 20,
      order: [['country', 'ASC'], ['name', 'ASC']]
    });

    let currentCountry = '';
    samples.forEach(airport => {
      if (airport.country !== currentCountry) {
        console.log(`\n${airport.country}:`);
        currentCountry = airport.country;
      }
      console.log(`  ${airport.icaoCode} - ${airport.name} (${airport.type})`);
    });

    console.log('\n✓ Import completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Review the imported airports in the admin panel');
    console.log('2. Run "npm run update-airport-dates" to research and add historical operational dates');
    console.log('3. Manually adjust any airports that need corrections');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Import failed:', error);
    process.exit(1);
  }
}

// Run import
importAirports();
