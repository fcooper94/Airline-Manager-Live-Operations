require('dotenv').config();
const sequelize = require('../config/database');

async function updateRoutesTable() {
  try {
    console.log('Updating routes table...');

    // Add return_route_number column
    await sequelize.query(`
      ALTER TABLE routes
      ADD COLUMN IF NOT EXISTS return_route_number VARCHAR(255)
    `);
    console.log('✓ Added return_route_number column');

    // Add turnaround_time column
    await sequelize.query(`
      ALTER TABLE routes
      ADD COLUMN IF NOT EXISTS turnaround_time INTEGER DEFAULT 45
    `);
    console.log('✓ Added turnaround_time column');

    // Add unique constraint for return_route_number
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS routes_return_route_number_unique
      ON routes(world_membership_id, return_route_number)
    `);
    console.log('✓ Added unique constraint for return_route_number');

    // Update existing routes to set return_route_number if not set
    await sequelize.query(`
      UPDATE routes
      SET return_route_number = route_number || '-R'
      WHERE return_route_number IS NULL
    `);
    console.log('✓ Updated existing routes with default return route numbers');

    // Make return_route_number NOT NULL
    await sequelize.query(`
      ALTER TABLE routes
      ALTER COLUMN return_route_number SET NOT NULL
    `);
    console.log('✓ Set return_route_number to NOT NULL');

    console.log('\n✓ Routes table updated successfully');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('✗ Failed to update routes table:', error);
    process.exit(1);
  }
}

updateRoutesTable();
