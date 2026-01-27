require('dotenv').config();
const sequelize = require('../config/database');

/**
 * Migration script to add passenger class availability fields to aircraft table
 */
async function migrate() {
  const queryInterface = sequelize.getQueryInterface();

  try {
    console.log('Starting migration: Adding passenger class availability fields...');

    // Add has_economy column
    console.log('Adding has_economy column...');
    try {
      await queryInterface.addColumn('aircraft', 'has_economy', {
        type: sequelize.Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false,
        comment: 'Whether this aircraft has Economy class seating'
      });
      console.log('✓ Added has_economy column');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⊘ has_economy column already exists, skipping');
      } else {
        throw error;
      }
    }

    // Add has_economy_plus column
    console.log('Adding has_economy_plus column...');
    try {
      await queryInterface.addColumn('aircraft', 'has_economy_plus', {
        type: sequelize.Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: 'Whether this aircraft has Economy Plus class seating'
      });
      console.log('✓ Added has_economy_plus column');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⊘ has_economy_plus column already exists, skipping');
      } else {
        throw error;
      }
    }

    // Add has_business column
    console.log('Adding has_business column...');
    try {
      await queryInterface.addColumn('aircraft', 'has_business', {
        type: sequelize.Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: 'Whether this aircraft has Business class seating'
      });
      console.log('✓ Added has_business column');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⊘ has_business column already exists, skipping');
      } else {
        throw error;
      }
    }

    // Add has_first column
    console.log('Adding has_first column...');
    try {
      await queryInterface.addColumn('aircraft', 'has_first', {
        type: sequelize.Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: 'Whether this aircraft has First class seating'
      });
      console.log('✓ Added has_first column');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⊘ has_first column already exists, skipping');
      } else {
        throw error;
      }
    }

    // Update existing aircraft with default class configurations
    console.log('\nUpdating existing aircraft with class configurations...');

    // Widebody aircraft: All classes
    await queryInterface.sequelize.query(`
      UPDATE aircraft
      SET has_economy = true,
          has_economy_plus = true,
          has_business = true,
          has_first = true
      WHERE type = 'Widebody'
    `);
    console.log('✓ Updated Widebody aircraft (all classes available)');

    // Narrowbody aircraft: Economy, Economy Plus, Business
    await queryInterface.sequelize.query(`
      UPDATE aircraft
      SET has_economy = true,
          has_economy_plus = true,
          has_business = true,
          has_first = false
      WHERE type = 'Narrowbody'
    `);
    console.log('✓ Updated Narrowbody aircraft (Economy, Economy Plus, Business)');

    // Regional aircraft: Economy only (some may have business for regional jets)
    await queryInterface.sequelize.query(`
      UPDATE aircraft
      SET has_economy = true,
          has_economy_plus = false,
          has_business = false,
          has_first = false
      WHERE type = 'Regional'
    `);
    console.log('✓ Updated Regional aircraft (Economy only by default)');

    // Regional jets with more than 70 seats: Add Business class
    await queryInterface.sequelize.query(`
      UPDATE aircraft
      SET has_business = true
      WHERE type = 'Regional'
        AND passenger_capacity > 70
    `);
    console.log('✓ Updated larger Regional jets (added Business class)');

    // Cargo aircraft: No passenger classes
    await queryInterface.sequelize.query(`
      UPDATE aircraft
      SET has_economy = false,
          has_economy_plus = false,
          has_business = false,
          has_first = false
      WHERE type = 'Cargo'
    `);
    console.log('✓ Updated Cargo aircraft (no passenger classes)');

    console.log('\n✓ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
