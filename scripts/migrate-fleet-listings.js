/**
 * Migration: Add aircraft listing/lease-out columns and notifications table
 *
 * Run with: node scripts/migrate-fleet-listings.js
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

    // 1. Add new ENUM values to user_aircraft status
    console.log('\n--- Adding ENUM values to user_aircraft status ---');
    const enumValues = ['listed_sale', 'listed_lease', 'leased_out'];
    for (const val of enumValues) {
      try {
        await client.query(`ALTER TYPE "enum_user_aircraft_status" ADD VALUE IF NOT EXISTS '${val}'`);
        console.log(`  + Added enum value: ${val}`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log(`  ~ Enum value already exists: ${val}`);
        } else {
          throw err;
        }
      }
    }

    // 2. Add new columns to user_aircraft
    console.log('\n--- Adding columns to user_aircraft ---');
    const columns = [
      { name: 'listing_price', type: 'DECIMAL(15,2)', comment: 'Asking price (sale) or monthly rate (lease-out)' },
      { name: 'listed_at', type: 'TIMESTAMP WITH TIME ZONE', comment: 'Game-time when listed' },
      { name: 'lease_out_monthly_rate', type: 'DECIMAL(15,2)', comment: 'Monthly rate when leased out to NPC' },
      { name: 'lease_out_start_date', type: 'TIMESTAMP WITH TIME ZONE', comment: 'Lease-out start date' },
      { name: 'lease_out_end_date', type: 'TIMESTAMP WITH TIME ZONE', comment: 'Lease-out end date' },
      { name: 'lease_out_tenant_name', type: 'VARCHAR(255)', comment: 'NPC airline name' }
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

    // 3. Create notifications table
    console.log('\n--- Creating notifications table ---');
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        world_membership_id UUID NOT NULL REFERENCES world_memberships(id) ON DELETE CASCADE,
        type VARCHAR(255) NOT NULL,
        icon VARCHAR(255) DEFAULT 'plane',
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        link VARCHAR(255),
        priority INTEGER DEFAULT 3,
        is_read BOOLEAN DEFAULT false,
        game_time TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    console.log('  + Created notifications table');

    // Add indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_membership ON notifications(world_membership_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)`);
    console.log('  + Created indexes on notifications');

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
