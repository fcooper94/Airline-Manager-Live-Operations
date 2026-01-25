require('dotenv').config();
const sequelize = require('../config/database');
const Airport = require('../models/Airport');
const axios = require('axios');

/**
 * Known historical airports with accurate dates
 * These are major airports that have closed or been replaced
 */
const KNOWN_HISTORICAL_AIRPORTS = {
  // Hong Kong
  'VHHX': { name: 'Kai Tak', operationalFrom: 1925, operationalUntil: 1998 },

  // Germany
  'EDDT': { name: 'Berlin Tegel', operationalFrom: 1948, operationalUntil: 2020 },
  'EDDI': { name: 'Berlin Tempelhof', operationalFrom: 1923, operationalUntil: 2008 },

  // Turkey
  'LTBA': { name: 'Istanbul Atatürk', operationalFrom: 1953, operationalUntil: 2019 },

  // USA
  'KCGX': { name: 'Meigs Field', operationalFrom: 1948, operationalUntil: 2003 },

  // Greece
  'LGAT': { name: 'Athens Ellinikon', operationalFrom: 1938, operationalUntil: 2001 },

  // Norway
  'ENFB': { name: 'Oslo Fornebu', operationalFrom: 1939, operationalUntil: 1998 },

  // Canada
  'CYTZ': { name: 'Toronto Island', operationalFrom: 1939, operationalUntil: null }, // Still open

  // Bulgaria
  'LBSF': { name: 'Sofia Vrazhdebna', operationalFrom: 1937, operationalUntil: 2006 },

  // Note: The following are still operational or recently opened, so operationalUntil is null
  'WMKK': { name: 'Kuala Lumpur International', operationalFrom: 1998, operationalUntil: null },
  'VTBS': { name: 'Bangkok Suvarnabhumi', operationalFrom: 2006, operationalUntil: null },
  'RKSI': { name: 'Seoul Incheon', operationalFrom: 2001, operationalUntil: null },
  'RJBB': { name: 'Osaka Kansai', operationalFrom: 1994, operationalUntil: null },
  'ZBAD': { name: 'Beijing Daxing', operationalFrom: 2019, operationalUntil: null },
  'YMML': { name: 'Melbourne Tullamarine', operationalFrom: 1970, operationalUntil: null },
  'YSSY': { name: 'Sydney Kingsford Smith', operationalFrom: 1920, operationalUntil: null },
  'ZSHC': { name: 'Shanghai Hongqiao', operationalFrom: 1921, operationalUntil: null },
  'UUEE': { name: 'Moscow Sheremetyevo', operationalFrom: 1959, operationalUntil: null },
};

/**
 * Approximate opening dates for major airports based on historical research
 * Format: ICAO code -> opening year
 */
const MAJOR_AIRPORT_DATES = {
  // USA
  'KJFK': 1948, // JFK opened 1948
  'KLAX': 1930,
  'KORD': 1944,
  'KATL': 1926,
  'KDFW': 1974,
  'KSFO': 1927,
  'KDEN': 1995, // New Denver airport
  'KMIA': 1928,
  'KSEA': 1944,
  'KBOS': 1923,
  'KLAS': 1942,
  'KPHX': 1929,
  'KIAH': 1969,
  'KEWR': 1928,
  'KMCO': 1981,

  // Europe
  'EGLL': 1946, // London Heathrow
  'EGKK': 1958, // London Gatwick
  'EGSS': 1943, // London Stansted
  'LFPG': 1974, // Paris CDG
  'LFPO': 1932, // Paris Orly
  'EDDF': 1936, // Frankfurt
  'EHAM': 1916, // Amsterdam
  'LEMD': 1928, // Madrid
  'LEBL': 1918, // Barcelona
  'LIRF': 1961, // Rome Fiumicino
  'LOWW': 1938, // Vienna
  'LSZH': 1948, // Zurich
  'EDDB': 2020, // Berlin Brandenburg (replaced Tegel/Schönefeld)
  'EDDM': 1992, // Munich
  'LFML': 1922, // Marseille
  'EDDL': 1927, // Düsseldorf
  'EDDH': 1911, // Hamburg
  'LROP': 1970, // Bucharest Henri Coandă
  'LGAV': 2001, // Athens International (replaced Ellinikon)
  'ENGM': 1998, // Oslo Gardermoen (replaced Fornebu)
  'ESSA': 1960, // Stockholm Arlanda
  'EKCH': 1925, // Copenhagen

  // Asia-Pacific
  'RJTT': 1931, // Tokyo Haneda
  'RJAA': 1978, // Tokyo Narita
  'RJBB': 1994, // Osaka Kansai
  'RJGG': 2005, // Nagoya Chubu Centrair
  'VHHH': 1998, // Hong Kong International (replaced Kai Tak)
  'WSSS': 1981, // Singapore Changi
  'ZSPD': 1999, // Shanghai Pudong
  'ZSHC': 1921, // Shanghai Hongqiao
  'ZBAA': 1958, // Beijing Capital
  'ZBAD': 2019, // Beijing Daxing
  'RKSI': 2001, // Seoul Incheon (replaced Gimpo for international)
  'RKSS': 1939, // Seoul Gimpo
  'VABB': 1942, // Mumbai
  'VIDP': 1962, // Delhi
  'VOBL': 2008, // Bengaluru International
  'VTBS': 2006, // Bangkok Suvarnabhumi (replaced Don Mueang)
  'VTBD': 1914, // Bangkok Don Mueang
  'WMKK': 1998, // Kuala Lumpur International
  'YSSY': 1920, // Sydney
  'YMML': 1970, // Melbourne
  'YBBN': 1988, // Brisbane
  'NZAA': 1966, // Auckland
  'RPLL': 1948, // Manila Ninoy Aquino

  // Middle East
  'OMDB': 1960, // Dubai
  'OMAA': 1982, // Abu Dhabi
  'OTHH': 1973, // Doha
  'OERK': 1983, // Riyadh
  'OEJN': 1981, // Jeddah
  'LTFM': 2018, // Istanbul Airport (replaced Atatürk)
  'LLBG': 1936, // Tel Aviv Ben Gurion
  'OBBI': 1979, // Bahrain
  'OKBK': 1979, // Kuwait

  // South America
  'SBGR': 1985, // São Paulo Guarulhos
  'SBGL': 1952, // Rio de Janeiro Galeão
  'SBBR': 1957, // Brasília
  'SAEZ': 1949, // Buenos Aires Ezeiza
  'SCEL': 1967, // Santiago
  'SKBO': 1959, // Bogotá
  'SPJC': 1960, // Lima
  'SCEL': 1967, // Santiago
  'SEQM': 1960, // Quito

  // Africa
  'FAOR': 1952, // Johannesburg
  'FACT': 1954, // Cape Town
  'HECA': 1963, // Cairo
  'GMMN': 1953, // Casablanca
  'DNMM': 1979, // Lagos
  'HKJK': 1978, // Nairobi
  'HAAB': 1961, // Addis Ababa

  // Canada
  'CYYZ': 1939, // Toronto Pearson
  'CYVR': 1931, // Vancouver
  'CYUL': 1941, // Montreal Trudeau
  'CYYC': 1938, // Calgary

  // Mexico & Central America
  'MMMX': 1952, // Mexico City
  'MMUN': 1966, // Cancún
  'MGGT': 1940, // Guatemala City
  'MROC': 1971, // San José Costa Rica
  'MPTO': 1947, // Panama City Tocumen

  // Russia
  'UUEE': 1959, // Moscow Sheremetyevo
  'UUDD': 1964, // Moscow Domodedovo
  'ULLI': 1932, // St Petersburg Pulkovo
};

/**
 * Update operational dates in database
 */
async function updateAirportDates() {
  try {
    console.log('=== Airport Operational Dates Update ===\n');

    // Connect to database
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connected\n');

    let updated = 0;

    // Update known historical airports
    console.log('Updating known historical airports...');
    for (const [icao, data] of Object.entries(KNOWN_HISTORICAL_AIRPORTS)) {
      const airport = await Airport.findOne({ where: { icaoCode: icao } });
      if (airport) {
        await airport.update({
          operationalFrom: data.operationalFrom,
          operationalUntil: data.operationalUntil
        });
        console.log(`✓ Updated ${icao} - ${data.name} (${data.operationalFrom}-${data.operationalUntil || 'Present'})`);
        updated++;
      }
    }

    // Update major airport opening dates
    console.log('\nUpdating major airport opening dates...');
    for (const [icao, openingYear] of Object.entries(MAJOR_AIRPORT_DATES)) {
      const airport = await Airport.findOne({ where: { icaoCode: icao } });
      if (airport) {
        await airport.update({
          operationalFrom: openingYear,
          operationalUntil: null // These are all currently operational
        });
        console.log(`✓ Updated ${icao} - ${airport.name} (opened ${openingYear})`);
        updated++;
      }
    }

    // Set reasonable defaults for remaining airports
    console.log('\nSetting defaults for remaining airports...');
    const airportsWithoutDates = await Airport.findAll({
      where: {
        operationalFrom: null
      }
    });

    for (const airport of airportsWithoutDates) {
      // Airports likely opened between 1950-1990 unless they're newer
      const defaultYear = 1970; // Conservative middle ground
      await airport.update({
        operationalFrom: defaultYear,
        operationalUntil: null
      });
      updated++;
    }
    console.log(`✓ Set default dates for ${airportsWithoutDates.length} airports`);

    // Generate a report
    console.log('\n=== Update Summary ===');
    console.log(`Total airports updated: ${updated}`);

    const stats = {
      total: await Airport.count(),
      historical: await Airport.count({
        where: { operationalUntil: { [require('sequelize').Op.ne]: null } }
      }),
      pre1950: await Airport.count({
        where: { operationalFrom: { [require('sequelize').Op.lt]: 1950 } }
      }),
      modern: await Airport.count({
        where: { operationalFrom: { [require('sequelize').Op.gte]: 2000 } }
      })
    };

    console.log(`\nTotal Airports: ${stats.total}`);
    console.log(`Historical (Closed): ${stats.historical}`);
    console.log(`Pre-1950: ${stats.pre1950}`);
    console.log(`Modern (2000+): ${stats.modern}`);

    // List historical airports
    console.log('\n=== Historical Airports (Closed) ===');
    const historicalAirports = await Airport.findAll({
      where: { operationalUntil: { [require('sequelize').Op.ne]: null } },
      order: [['operationalUntil', 'ASC']]
    });

    if (historicalAirports.length > 0) {
      historicalAirports.forEach(airport => {
        console.log(`  ${airport.icaoCode} - ${airport.name}: ${airport.operationalFrom}-${airport.operationalUntil}`);
      });
    } else {
      console.log('  No closed airports in database');
    }

    console.log('\n✓ Update complete!');
    console.log('\nNote: Dates are based on historical research and may need manual verification.');
    console.log('You can update individual airports through the admin panel.');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Update failed:', error);
    process.exit(1);
  }
}

// Run update
updateAirportDates();
