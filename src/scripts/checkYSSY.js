require('dotenv').config();
const { Airport } = require('../models');

async function checkYSSY() {
  try {
    const yssy = await Airport.findOne({ where: { icaoCode: 'YSSY' } });

    if (!yssy) {
      console.log('❌ YSSY not found in database!');
      console.log('\nThis means the airport import hasn\'t run, or YSSY wasn\'t included.');
      console.log('Run: npm run db:import-all');
    } else {
      console.log('✓ YSSY found in database:');
      console.log(`  ICAO: ${yssy.icaoCode}`);
      console.log(`  Name: ${yssy.name}`);
      console.log(`  City: ${yssy.city}`);
      console.log(`  Country: ${yssy.country}`);
      console.log(`  Type: ${yssy.type}`);
      console.log(`  Operational From: ${yssy.operationalFrom}`);
      console.log(`  Operational Until: ${yssy.operationalUntil || 'Still Open'}`);
      console.log(`  Is Active: ${yssy.isActive}`);

      if (yssy.operationalFrom && yssy.operationalFrom <= 1950) {
        console.log('\n✓ YSSY SHOULD appear in 1950 worlds');
      } else {
        console.log(`\n❌ YSSY will NOT appear in 1950 worlds (opens in ${yssy.operationalFrom})`);
        console.log('Run: npm run db:import-all to fix the dates');
      }
    }

    // Check how many airports are operational in 1950
    console.log('\n=== Airports operational in 1950 ===');
    const count1950 = await Airport.count({
      where: {
        operationalFrom: { [require('sequelize').Op.lte]: 1950 },
        isActive: true
      }
    });
    console.log(`Total airports: ${count1950}`);

    // Check Australian airports
    console.log('\n=== Australian airports ===');
    const auAirports = await Airport.findAll({
      where: { country: 'Australia' },
      attributes: ['icaoCode', 'name', 'city', 'operationalFrom'],
      order: [['operationalFrom', 'ASC']]
    });

    if (auAirports.length === 0) {
      console.log('No Australian airports found!');
    } else {
      console.log(`Found ${auAirports.length} Australian airports:`);
      auAirports.forEach(a => {
        const in1950 = a.operationalFrom && a.operationalFrom <= 1950 ? '✓' : '✗';
        console.log(`  ${in1950} ${a.icaoCode} - ${a.name}, ${a.city} (opened ${a.operationalFrom || 'unknown'})`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkYSSY();
