/**
 * Backfill: Link existing player-to-player leases
 *
 * Finds leased_out aircraft (lessor) without playerLesseeAircraftId
 * and matches them with lessee records to set both linking IDs.
 *
 * Run with: node scripts/backfill-player-lease-links.js
 */
require('dotenv').config();
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: DATABASE_URL not found in .env');
  process.exit(1);
}

async function backfill() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Find all leased_out aircraft without a player lessee link
    const { rows: lessors } = await client.query(`
      SELECT id, aircraft_id, world_membership_id, lease_out_start_date, registration
      FROM user_aircraft
      WHERE status = 'leased_out'
        AND player_lessee_aircraft_id IS NULL
    `);

    console.log(`\nFound ${lessors.length} leased_out aircraft without player lessee link`);

    let linked = 0;
    for (const lessor of lessors) {
      // Find matching lessee: same aircraft_id, acquisition_type = 'lease',
      // different owner, no lessor link yet
      const { rows: lessees } = await client.query(`
        SELECT id, registration, world_membership_id
        FROM user_aircraft
        WHERE aircraft_id = $1
          AND acquisition_type = 'lease'
          AND world_membership_id != $2
          AND player_lessor_aircraft_id IS NULL
          AND status NOT IN ('sold')
        ORDER BY acquired_at DESC
        LIMIT 1
      `, [lessor.aircraft_id, lessor.world_membership_id]);

      if (lessees.length > 0) {
        const lessee = lessees[0];
        // Set both linking IDs in a transaction
        await client.query('BEGIN');
        await client.query(
          'UPDATE user_aircraft SET player_lessee_aircraft_id = $1 WHERE id = $2',
          [lessee.id, lessor.id]
        );
        await client.query(
          'UPDATE user_aircraft SET player_lessor_aircraft_id = $1 WHERE id = $2',
          [lessor.id, lessee.id]
        );
        await client.query('COMMIT');
        linked++;
        console.log(`  + Linked: ${lessor.registration} (lessor) <-> ${lessee.registration} (lessee)`);
      } else {
        console.log(`  ~ No matching lessee found for ${lessor.registration} (may be NPC lease)`);
      }
    }

    console.log(`\n--- Backfill complete: ${linked} leases linked ---`);
  } catch (err) {
    console.error('\nBackfill failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

backfill();
