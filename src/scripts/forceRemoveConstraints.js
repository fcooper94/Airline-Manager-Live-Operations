require('dotenv').config();
const sequelize = require('../config/database');

async function forceRemoveConstraints() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connection established');
    console.log('');

    console.log('STEP 1: Finding all constraints on routes table...');
    console.log('='.repeat(60));

    // Find all constraints related to route_number or return_route_number
    const [constraints] = await sequelize.query(`
      SELECT
        conname as constraint_name,
        contype as constraint_type
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'routes'::regclass
      AND (
        conname LIKE '%route_number%'
        OR conname LIKE '%return_route_number%'
      );
    `);

    if (constraints.length === 0) {
      console.log('✓ No route number constraints found');
    } else {
      console.log(`Found ${constraints.length} constraint(s) to remove:\n`);

      for (const constraint of constraints) {
        console.log(`Dropping constraint: ${constraint.constraint_name}`);
        try {
          await sequelize.query(`
            ALTER TABLE routes DROP CONSTRAINT IF EXISTS ${constraint.constraint_name};
          `);
          console.log(`✓ Successfully dropped: ${constraint.constraint_name}`);
        } catch (error) {
          console.log(`✗ Failed to drop ${constraint.constraint_name}:`, error.message);
        }
      }
    }

    console.log('');
    console.log('STEP 2: Finding all unique indexes on routes table...');
    console.log('='.repeat(60));

    // Find all unique indexes related to route_number or return_route_number
    const [indexes] = await sequelize.query(`
      SELECT
        i.indexname,
        i.indexdef
      FROM pg_indexes i
      WHERE i.tablename = 'routes'
      AND i.indexdef LIKE '%UNIQUE%'
      AND (
        i.indexname LIKE '%route_number%'
        OR i.indexname LIKE '%return_route_number%'
      );
    `);

    if (indexes.length === 0) {
      console.log('✓ No unique route number indexes found');
    } else {
      console.log(`Found ${indexes.length} unique index(es) to remove:\n`);

      for (const index of indexes) {
        console.log(`Dropping index: ${index.indexname}`);
        try {
          await sequelize.query(`DROP INDEX IF EXISTS ${index.indexname};`);
          console.log(`✓ Successfully dropped: ${index.indexname}`);
        } catch (error) {
          console.log(`✗ Failed to drop ${index.indexname}:`, error.message);
        }
      }
    }

    console.log('');
    console.log('STEP 3: Creating non-unique indexes for performance...');
    console.log('='.repeat(60));

    // Create non-unique indexes
    try {
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS routes_world_membership_id_route_number_idx
        ON routes (world_membership_id, route_number)
        WHERE route_number IS NOT NULL;
      `);
      console.log('✓ Created index: routes_world_membership_id_route_number_idx');
    } catch (error) {
      console.log('⚠ Index may already exist:', error.message);
    }

    try {
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS routes_world_membership_id_return_route_number_idx
        ON routes (world_membership_id, return_route_number)
        WHERE return_route_number IS NOT NULL;
      `);
      console.log('✓ Created index: routes_world_membership_id_return_route_number_idx');
    } catch (error) {
      console.log('⚠ Index may already exist:', error.message);
    }

    console.log('');
    console.log('STEP 4: Verifying changes...');
    console.log('='.repeat(60));

    // Verify no unique constraints remain
    const [remainingConstraints] = await sequelize.query(`
      SELECT conname
      FROM pg_constraint c
      WHERE conrelid = 'routes'::regclass
      AND contype = 'u'
      AND (
        conname LIKE '%route_number%'
        OR conname LIKE '%return_route_number%'
      );
    `);

    const [remainingUniqueIndexes] = await sequelize.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'routes'
      AND indexdef LIKE '%UNIQUE%'
      AND (
        indexname LIKE '%route_number%'
        OR indexname LIKE '%return_route_number%'
      );
    `);

    if (remainingConstraints.length === 0 && remainingUniqueIndexes.length === 0) {
      console.log('✓ SUCCESS! All unique constraints and indexes removed');
      console.log('✓ Route numbers can now be reused on different operating days');
    } else {
      console.log('⚠ WARNING: Some constraints or indexes may still exist:');
      if (remainingConstraints.length > 0) {
        console.log('  Remaining constraints:', remainingConstraints.map(c => c.conname).join(', '));
      }
      if (remainingUniqueIndexes.length > 0) {
        console.log('  Remaining unique indexes:', remainingUniqueIndexes.map(i => i.indexname).join(', '));
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('Migration completed!');
    console.log('='.repeat(60));
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
}

forceRemoveConstraints();
