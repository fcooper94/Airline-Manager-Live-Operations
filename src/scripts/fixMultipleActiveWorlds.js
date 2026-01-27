require('dotenv').config();
const sequelize = require('../config/database');

async function fixMultipleActiveWorlds() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connection established\n');

    console.log('Finding all active worlds...');
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
      ORDER BY last_tick_at DESC NULLS LAST;
    `);

    if (worlds.length === 0) {
      console.log('No active worlds found');
      process.exit(0);
    }

    if (worlds.length === 1) {
      console.log(`✓ Only one active world found: ${worlds[0].name}`);
      console.log('No action needed.');
      process.exit(0);
    }

    console.log(`Found ${worlds.length} active worlds:\n`);
    worlds.forEach((world, index) => {
      console.log(`${index + 1}. ${world.name}`);
      console.log(`   ID: ${world.id}`);
      console.log(`   Last Tick: ${world.last_tick_at}`);
      console.log(`   Updated: ${world.updated_at}`);
      console.log('');
    });

    // Keep the most recently updated world active
    const activeWorld = worlds[0];
    const worldsToDeactivate = worlds.slice(1);

    console.log(`\nKeeping "${activeWorld.name}" as the active world`);
    console.log(`Deactivating ${worldsToDeactivate.length} other world(s)...\n`);

    for (const world of worldsToDeactivate) {
      await sequelize.query(`
        UPDATE worlds
        SET status = 'inactive'
        WHERE id = :worldId;
      `, {
        replacements: { worldId: world.id }
      });
      console.log(`✓ Deactivated: ${world.name}`);
    }

    console.log('\n✓ Multiple active worlds issue fixed!');
    console.log(`\nActive world: ${activeWorld.name}`);
    console.log('Please restart your server for changes to take effect.');

    process.exit(0);
  } catch (error) {
    console.error('✗ Fix failed:', error);
    process.exit(1);
  }
}

fixMultipleActiveWorlds();
