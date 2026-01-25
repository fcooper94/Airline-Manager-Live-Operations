require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const DATA_DIR = path.join(__dirname, '../../data');
const AIRPORTS_CSV = path.join(DATA_DIR, 'ourairports-airports.csv');

const HISTORICAL_AIRPORTS_TO_CHECK = [
  'VHHX', // Kai Tak
  'EDDT', // Berlin Tegel
  'EDDI', // Berlin Tempelhof
  'LTBA', // Istanbul Atatürk
  'KCGX', // Meigs Field
  'LGAT', // Athens Ellinikon
  'ENFB', // Oslo Fornebu
  'LBSF', // Sofia Vrazhdebna
];

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✓ Downloaded\n`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

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

async function testHistoricalAirports() {
  try {
    console.log('=== Testing Historical Airport Availability ===\n');

    // Create data directory
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Download if needed
    if (!fs.existsSync(AIRPORTS_CSV)) {
      await downloadFile(
        'https://davidmegginson.github.io/ourairports-data/airports.csv',
        AIRPORTS_CSV
      );
    } else {
      console.log('Using cached airports.csv\n');
    }

    console.log('Parsing CSV...');
    const airports = await parseCSV(AIRPORTS_CSV);
    console.log(`✓ Parsed ${airports.length} airports\n`);

    console.log('Searching for historical airports:\n');

    let found = 0;
    let notFound = 0;

    for (const icao of HISTORICAL_AIRPORTS_TO_CHECK) {
      const airport = airports.find(a => a.ident === icao);

      if (airport) {
        console.log(`✓ FOUND: ${icao}`);
        console.log(`  Name: ${airport.name}`);
        console.log(`  Type: ${airport.type}`);
        console.log(`  IATA: ${airport.iata_code || 'N/A'}`);
        console.log(`  Scheduled Service: ${airport.scheduled_service}`);
        console.log(`  Municipality: ${airport.municipality}`);
        console.log(`  Country: ${airport.iso_country}`);
        console.log('');
        found++;
      } else {
        console.log(`✗ NOT FOUND: ${icao}`);
        console.log('  This airport does not exist in OurAirports database');
        console.log('');
        notFound++;
      }
    }

    console.log('=== Summary ===');
    console.log(`Found: ${found}/${HISTORICAL_AIRPORTS_TO_CHECK.length}`);
    console.log(`Not Found: ${notFound}/${HISTORICAL_AIRPORTS_TO_CHECK.length}`);

    if (notFound > 0) {
      console.log('\n⚠️  Some historical airports are not in OurAirports database.');
      console.log('These will need to be added manually via the admin panel.');
    }

    // Check for closed airports in general
    console.log('\n=== Checking for Closed Airports in Database ===');
    const closedAirports = airports.filter(a => a.type === 'closed');
    console.log(`Found ${closedAirports.length} closed airports in OurAirports`);

    if (closedAirports.length > 0) {
      console.log('\nSample closed airports:');
      closedAirports.slice(0, 10).forEach(a => {
        console.log(`  ${a.ident} - ${a.name} (${a.municipality}, ${a.iso_country})`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testHistoricalAirports();
