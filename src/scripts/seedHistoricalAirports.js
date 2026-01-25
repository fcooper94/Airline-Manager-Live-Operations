require('dotenv').config();
const sequelize = require('../config/database');
const Airport = require('../models/Airport');

/**
 * Historical airports that are no longer in OurAirports database
 * but should be included for historical world gameplay
 *
 * All airports are set to isActive: true because they CAN be used in worlds
 * The operationalFrom/operationalUntil dates determine WHICH worlds they appear in
 */
const HISTORICAL_AIRPORTS = [
  // === ASIA-PACIFIC ===
  {
    icaoCode: 'VHHX',
    iataCode: 'HKG',
    name: 'Kai Tak Airport',
    city: 'Kowloon',
    country: 'Hong Kong',
    latitude: 22.3364,
    longitude: 114.1914,
    elevation: 28,
    type: 'International Hub',
    timezone: 'Asia/Hong_Kong',
    operationalFrom: 1925,
    operationalUntil: 1998,
    isActive: true
  },
  {
    icaoCode: 'WSSL',
    iataCode: 'SZB',
    name: 'Sultan Abdul Aziz Shah Airport (Subang)',
    city: 'Kuala Lumpur',
    country: 'Malaysia',
    latitude: 3.1284,
    longitude: 101.5493,
    elevation: 90,
    type: 'International Hub',
    timezone: 'Asia/Kuala_Lumpur',
    operationalFrom: 1965,
    operationalUntil: 1998,
    isActive: true
  },
  {
    icaoCode: 'RJNA',
    iataCode: 'NGO',
    name: 'Nagoya Airfield (Komaki)',
    city: 'Nagoya',
    country: 'Japan',
    latitude: 35.2550,
    longitude: 136.9239,
    elevation: 52,
    type: 'Major',
    timezone: 'Asia/Tokyo',
    operationalFrom: 1944,
    operationalUntil: 2005,
    isActive: true
  },
  {
    icaoCode: 'RPMN',
    iataCode: 'MNL',
    name: 'Manila Ninoy Aquino International Airport (Old Terminal)',
    city: 'Manila',
    country: 'Philippines',
    latitude: 14.5086,
    longitude: 121.0194,
    elevation: 75,
    type: 'International Hub',
    timezone: 'Asia/Manila',
    operationalFrom: 1948,
    operationalUntil: 2014,
    isActive: true
  },

  // === EUROPE ===
  {
    icaoCode: 'EDDT',
    iataCode: 'TXL',
    name: 'Berlin Tegel "Otto Lilienthal" Airport',
    city: 'Berlin',
    country: 'Germany',
    latitude: 52.5597,
    longitude: 13.2877,
    elevation: 122,
    type: 'International Hub',
    timezone: 'Europe/Berlin',
    operationalFrom: 1948,
    operationalUntil: 2020,
    isActive: true
  },
  {
    icaoCode: 'EDDI',
    iataCode: 'THF',
    name: 'Berlin Tempelhof Airport',
    city: 'Berlin',
    country: 'Germany',
    latitude: 52.4729,
    longitude: 13.4039,
    elevation: 167,
    type: 'International Hub',
    timezone: 'Europe/Berlin',
    operationalFrom: 1923,
    operationalUntil: 2008,
    isActive: true
  },
  {
    icaoCode: 'EDDM',
    iataCode: 'MUC',
    name: 'Munich-Riem Airport',
    city: 'Munich',
    country: 'Germany',
    latitude: 48.1397,
    longitude: 11.7033,
    elevation: 1739,
    type: 'International Hub',
    timezone: 'Europe/Berlin',
    operationalFrom: 1939,
    operationalUntil: 1992,
    isActive: true
  },
  {
    icaoCode: 'LGAT',
    iataCode: 'HEW',
    name: 'Ellinikon International Airport',
    city: 'Athens',
    country: 'Greece',
    latitude: 37.8937,
    longitude: 23.7269,
    elevation: 69,
    type: 'International Hub',
    timezone: 'Europe/Athens',
    operationalFrom: 1938,
    operationalUntil: 2001,
    isActive: true
  },
  {
    icaoCode: 'ENFB',
    iataCode: 'FBU',
    name: 'Oslo Airport, Fornebu',
    city: 'Oslo',
    country: 'Norway',
    latitude: 59.8958,
    longitude: 10.6172,
    elevation: 43,
    type: 'International Hub',
    timezone: 'Europe/Oslo',
    operationalFrom: 1939,
    operationalUntil: 1998,
    isActive: true
  },
  {
    icaoCode: 'EGLC',
    iataCode: 'LCY',
    name: 'London City Airport (Silvertown)',
    city: 'London',
    country: 'United Kingdom',
    latitude: 51.5053,
    longitude: 0.0550,
    elevation: 19,
    type: 'Regional',
    timezone: 'Europe/London',
    operationalFrom: 1987,
    operationalUntil: null,
    isActive: true
  },
  {
    icaoCode: 'LFPB',
    iataCode: 'LBG',
    name: 'Paris Le Bourget Airport',
    city: 'Paris',
    country: 'France',
    latitude: 48.9694,
    longitude: 2.4414,
    elevation: 218,
    type: 'Major',
    timezone: 'Europe/Paris',
    operationalFrom: 1919,
    operationalUntil: 1977,
    isActive: true
  },

  // === NORTH AMERICA ===
  {
    icaoCode: 'KDEN',
    iataCode: 'DEN',
    name: 'Stapleton International Airport',
    city: 'Denver',
    country: 'United States',
    latitude: 39.7797,
    longitude: -104.8822,
    elevation: 5333,
    type: 'International Hub',
    timezone: 'America/Denver',
    operationalFrom: 1929,
    operationalUntil: 1995,
    isActive: true
  },
  {
    icaoCode: 'KCGX',
    iataCode: 'CGX',
    name: 'Meigs Field',
    city: 'Chicago',
    country: 'United States',
    latitude: 41.8586,
    longitude: -87.6076,
    elevation: 593,
    type: 'Regional',
    timezone: 'America/Chicago',
    operationalFrom: 1948,
    operationalUntil: 2003,
    isActive: true
  },
  {
    icaoCode: 'KIDL',
    iataCode: 'IDL',
    name: 'Idlewild Airport (now JFK)',
    city: 'New York',
    country: 'United States',
    latitude: 40.6413,
    longitude: -73.7781,
    elevation: 13,
    type: 'International Hub',
    timezone: 'America/New_York',
    operationalFrom: 1948,
    operationalUntil: 1963,
    isActive: true
  },
  {
    icaoCode: 'CYTZ',
    iataCode: 'YTZ',
    name: 'Billy Bishop Toronto City Airport',
    city: 'Toronto',
    country: 'Canada',
    latitude: 43.6275,
    longitude: -79.3963,
    elevation: 252,
    type: 'Regional',
    timezone: 'America/Toronto',
    operationalFrom: 1939,
    operationalUntil: null,
    isActive: true
  },
  {
    icaoCode: 'MMTO',
    iataCode: 'TLC',
    name: 'Toluca International Airport',
    city: 'Toluca',
    country: 'Mexico',
    latitude: 19.3371,
    longitude: -99.5660,
    elevation: 8466,
    type: 'Major',
    timezone: 'America/Mexico_City',
    operationalFrom: 1950,
    operationalUntil: null,
    isActive: true
  },

  // === AUSTRALIA / OCEANIA ===
  {
    icaoCode: 'YMEN',
    iataCode: 'MEB',
    name: 'Essendon Airport',
    city: 'Melbourne',
    country: 'Australia',
    latitude: -37.7281,
    longitude: 144.9019,
    elevation: 282,
    type: 'Major',
    timezone: 'Australia/Melbourne',
    operationalFrom: 1921,
    operationalUntil: 1970,
    isActive: true
  },
  {
    icaoCode: 'NZWN',
    iataCode: 'WLG',
    name: 'Wellington International Airport (Rongotai)',
    city: 'Wellington',
    country: 'New Zealand',
    latitude: -41.3272,
    longitude: 174.8050,
    elevation: 41,
    type: 'Major',
    timezone: 'Pacific/Auckland',
    operationalFrom: 1959,
    operationalUntil: null,
    isActive: true
  },

  // === MIDDLE EAST ===
  {
    icaoCode: 'OMDB',
    iataCode: 'DXB',
    name: 'Dubai International Airport (Old Terminal)',
    city: 'Dubai',
    country: 'United Arab Emirates',
    latitude: 25.2528,
    longitude: 55.3644,
    elevation: 62,
    type: 'International Hub',
    timezone: 'Asia/Dubai',
    operationalFrom: 1960,
    operationalUntil: 2010,
    isActive: true
  },
  {
    icaoCode: 'LLBG',
    iataCode: 'TLV',
    name: 'Ben Gurion Airport (Lod)',
    city: 'Tel Aviv',
    country: 'Israel',
    latitude: 32.0114,
    longitude: 34.8867,
    elevation: 135,
    type: 'International Hub',
    timezone: 'Asia/Jerusalem',
    operationalFrom: 1936,
    operationalUntil: null,
    isActive: true
  },

  // === AFRICA ===
  {
    icaoCode: 'FAJS',
    iataCode: 'JNB',
    name: 'Jan Smuts Airport (now O.R. Tambo)',
    city: 'Johannesburg',
    country: 'South Africa',
    latitude: -26.1392,
    longitude: 28.2460,
    elevation: 5558,
    type: 'International Hub',
    timezone: 'Africa/Johannesburg',
    operationalFrom: 1952,
    operationalUntil: 1994,
    isActive: true
  },

  // === SOUTH AMERICA ===
  {
    icaoCode: 'SAZS',
    iataCode: 'EZE',
    name: 'Ministro Pistarini International Airport (Ezeiza)',
    city: 'Buenos Aires',
    country: 'Argentina',
    latitude: -34.8222,
    longitude: -58.5358,
    elevation: 67,
    type: 'International Hub',
    timezone: 'America/Argentina/Buenos_Aires',
    operationalFrom: 1949,
    operationalUntil: null,
    isActive: true
  }
];

async function seedHistoricalAirports() {
  try {
    console.log('=== Historical Airports Seeding ===\n');

    await sequelize.authenticate();
    console.log('✓ Database connected\n');

    console.log('Adding historical airports...\n');

    let added = 0;
    let skipped = 0;
    let updated = 0;

    for (const airportData of HISTORICAL_AIRPORTS) {
      // Check if airport already exists
      const existing = await Airport.findOne({
        where: { icaoCode: airportData.icaoCode }
      });

      if (existing) {
        // Update if it exists (in case we're re-running after OurAirports import)
        await existing.update(airportData);
        console.log(`↻ Updated: ${airportData.icaoCode} - ${airportData.name}`);
        updated++;
      } else {
        // Create new
        await Airport.create(airportData);
        console.log(`✓ Added: ${airportData.icaoCode} - ${airportData.name} (${airportData.operationalFrom}-${airportData.operationalUntil})`);
        added++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Added: ${added}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`\n✓ Historical airports seeded successfully!`);

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Seeding failed:', error);
    process.exit(1);
  }
}

seedHistoricalAirports();
