require('dotenv').config();
const sequelize = require('../config/database');

/**
 * Migration script to add cargo type availability fields to aircraft table
 */
async function migrate() {
  const queryInterface = sequelize.getQueryInterface();

  try {
    console.log('Starting migration: Adding cargo type availability fields...');

    // Add has_cargo_light column
    console.log('Adding has_cargo_light column...');
    try {
      await queryInterface.addColumn('aircraft', 'has_cargo_light', {
        type: sequelize.Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false,
        comment: 'Whether this aircraft can carry light cargo'
      });
      console.log('✓ Added has_cargo_light column');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⊘ has_cargo_light column already exists, skipping');
      } else {
        throw error;
      }
    }

    // Add has_cargo_standard column
    console.log('Adding has_cargo_standard column...');
    try {
      await queryInterface.addColumn('aircraft', 'has_cargo_standard', {
        type: sequelize.Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false,
        comment: 'Whether this aircraft can carry standard cargo'
      });
      console.log('✓ Added has_cargo_standard column');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⊘ has_cargo_standard column already exists, skipping');
      } else {
        throw error;
      }
    }

    // Add has_cargo_heavy column
    console.log('Adding has_cargo_heavy column...');
    try {
      await queryInterface.addColumn('aircraft', 'has_cargo_heavy', {
        type: sequelize.Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: 'Whether this aircraft can carry heavy cargo'
      });
      console.log('✓ Added has_cargo_heavy column');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⊘ has_cargo_heavy column already exists, skipping');
      } else {
        throw error;
      }
    }

    // Update existing aircraft with default cargo configurations
    console.log('\nUpdating existing aircraft with cargo configurations...');

    // Cargo aircraft: All cargo types
    await queryInterface.sequelize.query(`
      UPDATE aircraft
      SET has_cargo_light = true,
          has_cargo_standard = true,
          has_cargo_heavy = true
      WHERE type = 'Cargo'
    `);
    console.log('✓ Updated Cargo aircraft (all cargo types available)');

    // Widebody aircraft: All cargo types
    await queryInterface.sequelize.query(`
      UPDATE aircraft
      SET has_cargo_light = true,
          has_cargo_standard = true,
          has_cargo_heavy = true
      WHERE type = 'Widebody'
    `);
    console.log('✓ Updated Widebody aircraft (all cargo types available)');

    // Narrowbody aircraft: Light and Standard cargo only
    await queryInterface.sequelize.query(`
      UPDATE aircraft
      SET has_cargo_light = true,
          has_cargo_standard = true,
          has_cargo_heavy = false
      WHERE type = 'Narrowbody'
    `);
    console.log('✓ Updated Narrowbody aircraft (Light and Standard cargo)');

    // Regional aircraft: Light cargo only
    await queryInterface.sequelize.query(`
      UPDATE aircraft
      SET has_cargo_light = true,
          has_cargo_standard = false,
          has_cargo_heavy = false
      WHERE type = 'Regional'
    `);
    console.log('✓ Updated Regional aircraft (Light cargo only)');

    // Larger regional jets (70+ seats): Add Standard cargo
    await queryInterface.sequelize.query(`
      UPDATE aircraft
      SET has_cargo_standard = true
      WHERE type = 'Regional'
        AND passenger_capacity > 70
    `);
    console.log('✓ Updated larger Regional jets (added Standard cargo)');

    console.log('\n✓ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
