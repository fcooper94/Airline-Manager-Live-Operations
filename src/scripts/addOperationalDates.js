require('dotenv').config();
const sequelize = require('../config/database');

async function addOperationalDateColumns() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connection established\n');

    // Check if columns exist and add them if they don't
    const [results] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'airports'
      AND column_name IN ('operational_from', 'operational_until')
    `);

    const existingColumns = results.map(r => r.column_name);

    if (!existingColumns.includes('operational_from')) {
      console.log('Adding operational_from column...');
      await sequelize.query(`
        ALTER TABLE airports
        ADD COLUMN operational_from INTEGER;
      `);
      await sequelize.query(`
        COMMENT ON COLUMN airports.operational_from IS 'Year the airport opened for operations (e.g., 1930)';
      `);
      console.log('✓ Added operational_from column');
    } else {
      console.log('✓ operational_from column already exists');
    }

    if (!existingColumns.includes('operational_until')) {
      console.log('Adding operational_until column...');
      await sequelize.query(`
        ALTER TABLE airports
        ADD COLUMN operational_until INTEGER;
      `);
      await sequelize.query(`
        COMMENT ON COLUMN airports.operational_until IS 'Year the airport closed (null if still operational)';
      `);
      console.log('✓ Added operational_until column');
    } else {
      console.log('✓ operational_until column already exists');
    }

    // Add indexes if they don't exist
    console.log('\nAdding indexes...');

    try {
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS airports_operational_from
        ON airports(operational_from);
      `);
      console.log('✓ Index on operational_from created/verified');
    } catch (e) {
      console.log('Index on operational_from already exists');
    }

    try {
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS airports_operational_until
        ON airports(operational_until);
      `);
      console.log('✓ Index on operational_until created/verified');
    } catch (e) {
      console.log('Index on operational_until already exists');
    }

    // Ensure unique index on icao_code exists
    try {
      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS airports_icao_code_unique
        ON airports(icao_code);
      `);
      console.log('✓ Unique index on icao_code created/verified');
    } catch (e) {
      console.log('Unique index on icao_code already exists');
    }

    console.log('\n✓ Database schema updated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Error updating schema:', error.message);
    process.exit(1);
  }
}

addOperationalDateColumns();
