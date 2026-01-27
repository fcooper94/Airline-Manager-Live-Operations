require('dotenv').config();
const sequelize = require('../config/database');

async function addIataCodeColumn() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connection established');

    console.log('Adding iata_code column to world_memberships...');

    // Check if column exists first
    const [results] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name='world_memberships'
      AND column_name='iata_code'
    `);

    if (results.length > 0) {
      console.log('✓ Column iata_code already exists');
    } else {
      // Add the column
      await sequelize.query(`
        ALTER TABLE world_memberships
        ADD COLUMN iata_code VARCHAR(2);
      `);
      console.log('✓ Column iata_code added successfully');

      // Add comment
      await sequelize.query(`
        COMMENT ON COLUMN world_memberships.iata_code
        IS 'IATA airline code (2 letters) - used for flight number prefix';
      `);
      console.log('✓ Column comment added');
    }

    // Check if unique index exists
    const [indexResults] = await sequelize.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename='world_memberships'
      AND indexname LIKE '%iata_code%'
    `);

    if (indexResults.length > 0) {
      console.log('✓ Unique index on iata_code already exists');
    } else {
      // Add unique index
      await sequelize.query(`
        CREATE UNIQUE INDEX world_memberships_iata_code
        ON world_memberships (world_id, iata_code)
        WHERE iata_code IS NOT NULL;
      `);
      console.log('✓ Unique index added successfully');
    }

    console.log('\n✓ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
}

addIataCodeColumn();
