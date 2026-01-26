require('dotenv').config();
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

/**
 * Add trafficDemand and infrastructureLevel fields to airports table
 * and populate with initial values based on airport type
 */

async function addAirportDemandFields() {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connected\n');

    // Check if columns already exist
    const columns = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'airports'",
      { type: QueryTypes.SELECT }
    );

    const columnNames = columns.map(c => c.column_name);
    const hasTrafficDemand = columnNames.includes('traffic_demand');
    const hasInfrastructureLevel = columnNames.includes('infrastructure_level');

    if (hasTrafficDemand && hasInfrastructureLevel) {
      console.log('✓ Columns already exist, skipping creation\n');
    } else {
      // Add columns if they don't exist
      if (!hasTrafficDemand) {
        console.log('Adding traffic_demand column...');
        await sequelize.query(`
          ALTER TABLE airports
          ADD COLUMN traffic_demand INTEGER DEFAULT 5 NOT NULL
          CHECK (traffic_demand >= 1 AND traffic_demand <= 10)
        `);
        console.log('✓ Added traffic_demand column\n');
      }

      if (!hasInfrastructureLevel) {
        console.log('Adding infrastructure_level column...');
        await sequelize.query(`
          ALTER TABLE airports
          ADD COLUMN infrastructure_level INTEGER DEFAULT 5 NOT NULL
          CHECK (infrastructure_level >= 1 AND infrastructure_level <= 10)
        `);
        console.log('✓ Added infrastructure_level column\n');
      }
    }

    // Populate initial values based on airport type
    console.log('Setting initial values based on airport type...\n');

    await sequelize.query(`
      UPDATE airports
      SET traffic_demand = 10, infrastructure_level = 10
      WHERE type = 'International Hub'
    `);
    console.log('✓ Updated International Hub airports (Demand: 10, Infrastructure: 10)');

    await sequelize.query(`
      UPDATE airports
      SET traffic_demand = 7, infrastructure_level = 8
      WHERE type = 'Major'
    `);
    console.log('✓ Updated Major airports (Demand: 7, Infrastructure: 8)');

    await sequelize.query(`
      UPDATE airports
      SET traffic_demand = 5, infrastructure_level = 6
      WHERE type = 'Regional'
    `);
    console.log('✓ Updated Regional airports (Demand: 5, Infrastructure: 6)');

    await sequelize.query(`
      UPDATE airports
      SET traffic_demand = 3, infrastructure_level = 4
      WHERE type = 'Small Regional'
    `);
    console.log('✓ Updated Small Regional airports (Demand: 3, Infrastructure: 4)');

    // Get counts
    const counts = await sequelize.query(`
      SELECT type, COUNT(*) as count, AVG(traffic_demand) as avg_demand, AVG(infrastructure_level) as avg_infra
      FROM airports
      GROUP BY type
      ORDER BY avg_demand DESC
    `, { type: QueryTypes.SELECT });

    console.log('\n=== Airport Statistics ===');
    counts.forEach(row => {
      console.log(`${row.type}: ${row.count} airports (Avg Demand: ${parseFloat(row.avg_demand).toFixed(1)}, Avg Infrastructure: ${parseFloat(row.avg_infra).toFixed(1)})`);
    });

    console.log('\n✓ Airport demand fields added and populated successfully');
    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

addAirportDemandFields();
