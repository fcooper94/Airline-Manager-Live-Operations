require('dotenv').config();
const sequelize = require('../config/database');

async function checkWorldTime() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connection established\n');

    console.log('Checking world time data...');
    console.log('='.repeat(60));

    const [worlds] = await sequelize.query(`
      SELECT
        id,
        name,
        current_time,
        last_tick_at,
        time_acceleration,
        is_paused,
        status,
        updated_at
      FROM worlds
      WHERE status = 'active'
      ORDER BY updated_at DESC;
    `);

    if (worlds.length === 0) {
      console.log('No active worlds found');
    } else {
      worlds.forEach(world => {
        console.log(`\nWorld: ${world.name}`);
        console.log(`ID: ${world.id}`);
        console.log(`Current Time: ${world.current_time}`);
        console.log(`Last Tick At: ${world.last_tick_at}`);
        console.log(`Time Acceleration: ${world.time_acceleration}x`);
        console.log(`Status: ${world.status}`);
        console.log(`Is Paused: ${world.is_paused}`);
        console.log(`Last Updated: ${world.updated_at}`);
        console.log('-'.repeat(60));
      });
    }

    console.log('\nChecking for multiple active worlds...');
    const [count] = await sequelize.query(`
      SELECT COUNT(*) as count FROM worlds WHERE status = 'active';
    `);
    console.log(`Active worlds count: ${count[0].count}`);

    if (count[0].count > 1) {
      console.log('⚠ WARNING: Multiple active worlds detected! This may cause issues.');
    }

    process.exit(0);
  } catch (error) {
    console.error('✗ Check failed:', error);
    process.exit(1);
  }
}

checkWorldTime();
