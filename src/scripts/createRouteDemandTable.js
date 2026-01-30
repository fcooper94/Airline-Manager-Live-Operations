require('dotenv').config();
const sequelize = require('../config/database');

/**
 * Manually create the airport_route_demands table
 * This avoids Sequelize sync issues with existing ENUM types
 */
async function createRouteDemandTable() {
  try {
    console.log('Creating airport_route_demands table...');

    await sequelize.query(`
      -- Create ENUM types if they don't exist
      DO $$ BEGIN
        CREATE TYPE demand_category_enum AS ENUM ('very_high', 'high', 'medium', 'low', 'very_low');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      DO $$ BEGIN
        CREATE TYPE route_type_enum AS ENUM ('business', 'leisure', 'mixed', 'cargo', 'regional');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      -- Create the table if it doesn't exist
      CREATE TABLE IF NOT EXISTS airport_route_demands (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        from_airport_id UUID NOT NULL REFERENCES airports(id) ON DELETE CASCADE,
        to_airport_id UUID NOT NULL REFERENCES airports(id) ON DELETE CASCADE,
        base_demand INTEGER NOT NULL DEFAULT 50 CHECK (base_demand >= 0 AND base_demand <= 100),
        demand_category demand_category_enum NOT NULL DEFAULT 'medium',
        route_type route_type_enum DEFAULT 'mixed',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_airport_pair UNIQUE(from_airport_id, to_airport_id),
        CONSTRAINT different_airports CHECK(from_airport_id != to_airport_id)
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_route_demands_from
        ON airport_route_demands(from_airport_id);

      CREATE INDEX IF NOT EXISTS idx_route_demands_to
        ON airport_route_demands(to_airport_id);

      CREATE INDEX IF NOT EXISTS idx_route_demands_from_demand
        ON airport_route_demands(from_airport_id, base_demand DESC);

      CREATE INDEX IF NOT EXISTS idx_route_demands_category
        ON airport_route_demands(demand_category);

      -- Create indexes for route slot optimization (if they don't exist)
      CREATE INDEX IF NOT EXISTS idx_routes_departure_active
        ON routes(departure_airport_id, is_active);

      CREATE INDEX IF NOT EXISTS idx_routes_arrival_active
        ON routes(arrival_airport_id, is_active);

      -- Add comments
      COMMENT ON TABLE airport_route_demands IS 'Stores pre-seeded passenger demand data between airport pairs';
      COMMENT ON COLUMN airport_route_demands.base_demand IS 'Base demand level (0-100 scale, era-independent)';
      COMMENT ON COLUMN airport_route_demands.demand_category IS 'Demand category for quick filtering';
      COMMENT ON COLUMN airport_route_demands.route_type IS 'Primary route characteristic';
    `);

    console.log('✓ Successfully created airport_route_demands table and indexes');

    // Test the table
    const result = await sequelize.query(`
      SELECT COUNT(*) as count FROM airport_route_demands;
    `);

    console.log(`✓ Table is ready (current rows: ${result[0][0].count})`);

  } catch (error) {
    console.error('Error creating table:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run the script
createRouteDemandTable()
  .then(() => {
    console.log('\n✓ Database setup completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n✗ Database setup failed:', error.message);
    process.exit(1);
  });
