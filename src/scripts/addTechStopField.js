require('dotenv').config();
const sequelize = require('../config/database');

/**
 * Migration script to add technical stop airport field to routes table
 */
async function migrate() {
  const queryInterface = sequelize.getQueryInterface();

  try {
    console.log('Starting migration: Adding tech stop airport field...');

    // Add tech_stop_airport_id column
    console.log('Adding tech_stop_airport_id column...');
    try {
      await queryInterface.addColumn('routes', 'tech_stop_airport_id', {
        type: sequelize.Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'airports',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Optional technical stop airport for refuelling'
      });
      console.log('✓ Added tech_stop_airport_id column');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⊘ tech_stop_airport_id column already exists, skipping');
      } else {
        throw error;
      }
    }

    console.log('\n✓ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
