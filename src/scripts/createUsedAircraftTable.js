require('dotenv').config();
const sequelize = require('../config/database');

async function createUsedAircraftTable() {
  try {
    console.log('Creating used_aircraft_for_sale table...');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS used_aircraft_for_sale (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        world_id UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
        aircraft_id UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
        seller_name VARCHAR(255) NOT NULL,
        seller_type VARCHAR(20) DEFAULT 'airline' CHECK (seller_type IN ('airline', 'lessor', 'broker')),
        seller_country VARCHAR(255),
        seller_reason VARCHAR(255),
        condition VARCHAR(50) DEFAULT 'Good',
        condition_percentage INTEGER DEFAULT 70,
        age_years INTEGER DEFAULT 5,
        total_flight_hours DECIMAL(10, 2) DEFAULT 0,
        purchase_price DECIMAL(15, 2) NOT NULL,
        lease_price DECIMAL(15, 2),
        c_check_remaining_days INTEGER,
        d_check_remaining_days INTEGER,
        status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'sold', 'withdrawn')),
        listed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        sold_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Create indexes
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_used_aircraft_world_id ON used_aircraft_for_sale(world_id);
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_used_aircraft_aircraft_id ON used_aircraft_for_sale(aircraft_id);
    `);
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_used_aircraft_status ON used_aircraft_for_sale(status);
    `);

    console.log('✓ used_aircraft_for_sale table created successfully');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('✗ Failed to create table:', error.message);
    await sequelize.close();
    process.exit(1);
  }
}

createUsedAircraftTable();
