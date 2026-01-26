require('dotenv').config();
const sequelize = require('../config/database');

async function createScheduledFlightsTable() {
  try {
    console.log('Creating scheduled_flights table...');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS scheduled_flights (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
        aircraft_id UUID NOT NULL REFERENCES user_aircraft(id) ON DELETE CASCADE,
        scheduled_date DATE NOT NULL,
        departure_time TIME NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT unique_aircraft_schedule UNIQUE (aircraft_id, scheduled_date, departure_time),
        CONSTRAINT valid_status CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled'))
      );
    `);

    console.log('✓ scheduled_flights table created successfully');

    // Create indexes
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_flights_route_id ON scheduled_flights(route_id);
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_flights_aircraft_id ON scheduled_flights(aircraft_id);
    `);

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_flights_scheduled_date ON scheduled_flights(scheduled_date);
    `);

    console.log('✓ Indexes created successfully');

    await sequelize.close();
    console.log('\n✓ Migration completed successfully');
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
}

createScheduledFlightsTable();
