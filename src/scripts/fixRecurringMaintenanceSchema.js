/**
 * Fix the recurring_maintenance table schema
 * Changes check_type column from VARCHAR(1) to proper ENUM
 */

require('dotenv').config();
const sequelize = require('../config/database');

async function fixSchema() {
  try {
    // Test database connection first
    await sequelize.authenticate();
    console.log('Database connected.');

    console.log('Fixing recurring_maintenance table schema...');

    // Drop the existing table and enum type, then let Sequelize recreate it
    console.log('Dropping existing table and enum type...');

    await sequelize.query('DROP TABLE IF EXISTS recurring_maintenance CASCADE');
    await sequelize.query('DROP TYPE IF EXISTS "enum_recurring_maintenance_check_type" CASCADE');

    console.log('Creating fresh table with correct schema...');

    // Import and sync the model to recreate the table
    const RecurringMaintenance = require('../models/RecurringMaintenance');
    await RecurringMaintenance.sync({ force: true });

    console.log('');
    console.log('Schema fixed successfully!');
    console.log('check_type column is now an ENUM with values: daily, A, B');
    console.log('');
    console.log('You can now schedule maintenance checks from the scheduling page.');

    await sequelize.close();
    process.exit(0);

  } catch (error) {
    console.error('Error fixing schema:', error.message);
    if (error.original) {
      console.error('Database error:', error.original.message);
    }
    process.exit(1);
  }
}

fixSchema();
