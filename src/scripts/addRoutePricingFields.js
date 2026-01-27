require('dotenv').config();
const sequelize = require('../config/database');

async function addRoutePricingFields() {
  try {
    console.log('Adding class-based pricing and cargo rate fields to routes table...');

    // Add class-based ticket pricing columns
    await sequelize.query(`
      ALTER TABLE routes
      ADD COLUMN IF NOT EXISTS economy_price DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS business_price DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS first_price DECIMAL(10,2) DEFAULT 0
    `);
    console.log('✓ Added class-based ticket pricing columns');

    // Add cargo rate columns (price per ton)
    await sequelize.query(`
      ALTER TABLE routes
      ADD COLUMN IF NOT EXISTS cargo_light_rate DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cargo_standard_rate DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cargo_heavy_rate DECIMAL(10,2) DEFAULT 0
    `);
    console.log('✓ Added cargo rate columns');

    // Add transport type column
    await sequelize.query(`
      ALTER TABLE routes
      ADD COLUMN IF NOT EXISTS transport_type VARCHAR(20) DEFAULT 'both'
        CHECK (transport_type IN ('both', 'passengers_only', 'cargo_only'))
    `);
    console.log('✓ Added transport type column');

    // Update existing routes to use the old ticket_price as economy_price
    await sequelize.query(`
      UPDATE routes
      SET
        economy_price = COALESCE(ticket_price, 0),
        business_price = COALESCE(ticket_price * 2.6, 0),
        first_price = COALESCE(ticket_price * 4.6, 0)
      WHERE economy_price = 0
    `);
    console.log('✓ Migrated existing ticket prices to class-based pricing');

    // Set default cargo rates based on distance
    await sequelize.query(`
      UPDATE routes
      SET
        cargo_light_rate = GREATEST(distance * 1.2, 1000),
        cargo_standard_rate = GREATEST(distance * 1.4, 1200),
        cargo_heavy_rate = GREATEST(distance * 1.6, 1400)
      WHERE cargo_light_rate = 0
    `);
    console.log('✓ Set default cargo rates');

    console.log('\n✓ Route pricing fields added successfully');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('✗ Failed to add route pricing fields:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

addRoutePricingFields();
