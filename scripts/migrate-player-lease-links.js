/**
 * Migration: Add player lease linking columns to user_aircraft
 *
 * Run with: node scripts/migrate-player-lease-links.js
 */
require('dotenv').config();
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: DATABASE_URL not found in .env');
  process.exit(1);
}

async function migrate() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    console.log('\n--- Adding player lease link columns to user_aircraft ---');
    const columns = [
      { name: 'player_lessor_aircraft_id', type: 'UUID', comment: 'On lessee record: points to owner/lessor UserAircraft' },
      { name: 'player_lessee_aircraft_id', type: 'UUID', comment: 'On lessor record: points to lessee UserAircraft' }
    ];

    for (const col of columns) {
      try {
        await client.query(`ALTER TABLE user_aircraft ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        console.log(`  + Added column: ${col.name}`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`  ~ Column already exists: ${col.name}`);
        } else {
          throw err;
        }
      }
    }

    console.log('\n--- Migration complete! ---');
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

migrate();
