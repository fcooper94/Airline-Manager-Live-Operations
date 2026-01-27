require('dotenv').config();
const sequelize = require('../config/database');
const { QueryInterface } = require('sequelize');

/**
 * Migration script to add pricing management fields
 * - Adds economyPlusPrice to routes table
 * - Creates pricing_defaults table
 */
async function migrate() {
  const queryInterface = sequelize.getQueryInterface();

  try {
    console.log('Starting migration: Adding pricing fields...');

    // Add economyPlusPrice to routes table
    console.log('Adding economy_plus_price column to routes table...');
    try {
      await queryInterface.addColumn('routes', 'economy_plus_price', {
        type: sequelize.Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
        allowNull: true,
        comment: 'Economy Plus class ticket price'
      });
      console.log('✓ Added economy_plus_price column to routes');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⊘ economy_plus_price column already exists, skipping');
      } else {
        throw error;
      }
    }

    // Create pricing_defaults table
    console.log('Creating pricing_defaults table...');
    try {
      await queryInterface.createTable('pricing_defaults', {
        id: {
          type: sequelize.Sequelize.UUID,
          defaultValue: sequelize.Sequelize.UUIDV4,
          primaryKey: true
        },
        world_membership_id: {
          type: sequelize.Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'world_memberships',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        pricing_type: {
          type: sequelize.Sequelize.ENUM('global', 'aircraft_type'),
          allowNull: false,
          comment: 'Type of pricing: global defaults or aircraft type specific'
        },
        aircraft_type_key: {
          type: sequelize.Sequelize.STRING,
          allowNull: true,
          comment: 'Aircraft type key (e.g., Boeing_737_800) - required for aircraft_type pricing'
        },
        economy_price: {
          type: sequelize.Sequelize.DECIMAL(10, 2),
          allowNull: true,
          comment: 'Economy class ticket price'
        },
        economy_plus_price: {
          type: sequelize.Sequelize.DECIMAL(10, 2),
          allowNull: true,
          comment: 'Economy Plus class ticket price'
        },
        business_price: {
          type: sequelize.Sequelize.DECIMAL(10, 2),
          allowNull: true,
          comment: 'Business class ticket price'
        },
        first_price: {
          type: sequelize.Sequelize.DECIMAL(10, 2),
          allowNull: true,
          comment: 'First class ticket price'
        },
        cargo_light_rate: {
          type: sequelize.Sequelize.DECIMAL(10, 2),
          allowNull: true,
          comment: 'Light cargo rate per ton'
        },
        cargo_standard_rate: {
          type: sequelize.Sequelize.DECIMAL(10, 2),
          allowNull: true,
          comment: 'Standard cargo rate per ton'
        },
        cargo_heavy_rate: {
          type: sequelize.Sequelize.DECIMAL(10, 2),
          allowNull: true,
          comment: 'Heavy cargo rate per ton'
        },
        created_at: {
          type: sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });

      // Add indexes
      await queryInterface.addIndex('pricing_defaults', ['world_membership_id', 'pricing_type'], {
        name: 'pricing_defaults_membership_type_idx'
      });

      await queryInterface.addIndex('pricing_defaults', ['world_membership_id', 'pricing_type', 'aircraft_type_key'], {
        name: 'pricing_defaults_unique_idx',
        unique: true
      });

      console.log('✓ Created pricing_defaults table with indexes');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('⊘ pricing_defaults table already exists, skipping');
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
