/**
 * Complete airport import process
 * Runs all three steps in sequence:
 * 1. Import from OurAirports
 * 2. Add historical closed airports
 * 3. Update operational dates
 */

const { execSync } = require('child_process');
const readline = require('readline');

async function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function importAllAirports() {
  console.log('='.repeat(70));
  console.log('COMPLETE AIRPORT DATABASE IMPORT');
  console.log('='.repeat(70));
  console.log('\nThis will perform a complete airport import in 3 steps:');
  console.log('  1. Import ~1,500-2,000 modern airports from OurAirports');
  console.log('  2. Add 26 famous historical closed airports');
  console.log('  3. Update operational dates for 100+ airports');
  console.log('\n⚠️  WARNING: This will REPLACE all existing airports!\n');

  const confirmed = await askConfirmation('Continue with complete import? (yes/no): ');

  if (!confirmed) {
    console.log('\nImport cancelled.');
    process.exit(0);
  }

  try {
    console.log('\n' + '='.repeat(70));
    console.log('STEP 1/3: Importing from OurAirports');
    console.log('='.repeat(70) + '\n');

    execSync('node src/scripts/importOurAirports.js', {
      stdio: 'inherit',
      input: 'yes\n' // Auto-confirm the import
    });

    console.log('\n' + '='.repeat(70));
    console.log('STEP 2/3: Adding Historical Airports');
    console.log('='.repeat(70) + '\n');

    execSync('node src/scripts/seedHistoricalAirports.js', {
      stdio: 'inherit'
    });

    console.log('\n' + '='.repeat(70));
    console.log('STEP 3/3: Updating Operational Dates');
    console.log('='.repeat(70) + '\n');

    execSync('node src/scripts/updateAirportDates.js', {
      stdio: 'inherit'
    });

    console.log('\n' + '='.repeat(70));
    console.log('✓ COMPLETE IMPORT FINISHED SUCCESSFULLY');
    console.log('='.repeat(70));
    console.log('\nYour airport database is now ready!');
    console.log('\nSummary:');
    console.log('  • ~1,500-2,000 modern commercial airports');
    console.log('  • 26 famous historical closed airports');
    console.log('  • 100+ airports with accurate operational dates');
    console.log('  • All airports enabled by default - dates control world availability');
    console.log('\nNext steps:');
    console.log('  1. Review airports in Admin Panel → Airports');
    console.log('  2. Test world filtering with different eras');
    console.log('  3. Add any custom airports you need');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Import failed:', error.message);
    process.exit(1);
  }
}

importAllAirports();
