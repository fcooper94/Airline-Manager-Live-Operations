require('dotenv').config();
const sequelize = require('../config/database');

async function removeRouteNumberConstraints() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connection established');

    console.log('Removing unique constraints on route numbers...');

    // Drop the unique constraint on (world_membership_id, route_number)
    try {
      await sequelize.query(`
        ALTER TABLE routes
        DROP CONSTRAINT IF EXISTS routes_world_membership_id_route_number;
      `);
      console.log('✓ Dropped constraint on route_number');
    } catch (error) {
      console.log('⚠ Constraint routes_world_membership_id_route_number may not exist');
    }

    // Drop the unique constraint on (world_membership_id, return_route_number)
    try {
      await sequelize.query(`
        ALTER TABLE routes
        DROP CONSTRAINT IF EXISTS routes_world_membership_id_return_route_number;
      `);
      console.log('✓ Dropped constraint on return_route_number');
    } catch (error) {
      console.log('⚠ Constraint routes_world_membership_id_return_route_number may not exist');
    }

    // Create non-unique indexes for performance
    console.log('Creating non-unique indexes for query performance...');

    try {
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS routes_world_membership_id_route_number_idx
        ON routes (world_membership_id, route_number);
      `);
      console.log('✓ Created index on (world_membership_id, route_number)');
    } catch (error) {
      console.log('⚠ Index may already exist');
    }

    try {
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS routes_world_membership_id_return_route_number_idx
        ON routes (world_membership_id, return_route_number);
      `);
      console.log('✓ Created index on (world_membership_id, return_route_number)');
    } catch (error) {
      console.log('⚠ Index may already exist');
    }

    console.log('\n✓ Migration completed successfully!');
    console.log('Route numbers can now be reused on different operating days.');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
}

removeRouteNumberConstraints();
