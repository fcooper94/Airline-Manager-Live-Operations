require('dotenv').config();
const { Aircraft } = require('../models');
const sequelize = require('../config/database');

(async () => {
  try {
    await sequelize.authenticate();
    const aircraft = await Aircraft.findAll({
      attributes: ['manufacturer', 'model', 'variant', 'firstIntroduced', 'availableFrom', 'availableUntil'],
      order: [['availableFrom', 'ASC'], ['manufacturer', 'ASC']]
    });

    console.log('Total aircraft in database:', aircraft.length);
    console.log('\nAircraft by availability:\n');

    aircraft.forEach(ac => {
      const name = `${ac.manufacturer} ${ac.model}${ac.variant ? '-' + ac.variant : ''}`;
      const intro = ac.firstIntroduced || '?';
      const from = ac.availableFrom || '?';
      const until = ac.availableUntil || 'present';
      console.log(`${name.padEnd(45)} | Intro: ${String(intro).padEnd(4)} | Available: ${from}-${until}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
