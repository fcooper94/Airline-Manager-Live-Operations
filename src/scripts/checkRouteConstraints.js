require('dotenv').config();
const sequelize = require('../config/database');

async function checkRouteConstraints() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connection established');
    console.log('');

    console.log('Checking for constraints on routes table...');
    console.log('='.repeat(60));

    // Check all constraints on the routes table
    const [constraints] = await sequelize.query(`
      SELECT
        conname as constraint_name,
        contype as constraint_type,
        pg_get_constraintdef(c.oid) as constraint_definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'routes'::regclass
      ORDER BY conname;
    `);

    if (constraints.length === 0) {
      console.log('No constraints found on routes table');
    } else {
      console.log(`Found ${constraints.length} constraint(s):\n`);
      constraints.forEach(constraint => {
        const typeMap = {
          'p': 'PRIMARY KEY',
          'f': 'FOREIGN KEY',
          'u': 'UNIQUE',
          'c': 'CHECK'
        };
        console.log(`Name: ${constraint.constraint_name}`);
        console.log(`Type: ${typeMap[constraint.constraint_type] || constraint.constraint_type}`);
        console.log(`Definition: ${constraint.constraint_definition}`);
        console.log('-'.repeat(60));
      });
    }

    console.log('');
    console.log('Checking for indexes on routes table...');
    console.log('='.repeat(60));

    // Check all indexes
    const [indexes] = await sequelize.query(`
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'routes'
      ORDER BY indexname;
    `);

    if (indexes.length === 0) {
      console.log('No indexes found on routes table');
    } else {
      console.log(`Found ${indexes.length} index(es):\n`);
      indexes.forEach(index => {
        console.log(`Name: ${index.indexname}`);
        console.log(`Definition: ${index.indexdef}`);
        console.log('-'.repeat(60));
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('✗ Check failed:', error);
    process.exit(1);
  }
}

checkRouteConstraints();
