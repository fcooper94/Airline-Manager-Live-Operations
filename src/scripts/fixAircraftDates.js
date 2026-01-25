require('dotenv').config();
const { Aircraft } = require('../models');
const sequelize = require('../config/database');

/**
 * Fix aircraft with incorrect or missing dates
 * Based on historical production and service records
 */

const DATE_CORRECTIONS = [
  // Fix missing availableFrom dates
  {
    manufacturer: 'Airbus',
    model: 'A350',
    variant: 'XWB',
    updates: {
      availableFrom: 2013,
      description: 'Advanced widebody - A350 family'
    }
  },
  {
    manufacturer: 'Boeing',
    model: '787',
    variant: 'Dreamliner',
    updates: {
      availableFrom: 2011,
      description: 'Composite construction widebody - 787 family'
    }
  },

  // Fix DHC-3 Otter backwards dates
  {
    manufacturer: 'de Havilland Canada',
    model: 'DHC-3',
    variant: 'Otter',
    updates: {
      firstIntroduced: 1951,
      availableFrom: 1951,
      availableUntil: 1967
    }
  },

  // Additional historical corrections for major aircraft

  // Boeing 707 - Last passenger service 1991, some cargo to 2010
  {
    manufacturer: 'Boeing',
    model: '707',
    variant: '320B',
    updates: {
      availableUntil: 1991 // Last major passenger service
    }
  },

  // Boeing 727 - Production ended 1984, last passenger service ~2001
  {
    manufacturer: 'Boeing',
    model: '727',
    variant: '200',
    updates: {
      availableUntil: 1984 // Production ended
    }
  },

  // Boeing 737-200 - Production ended 1988
  {
    manufacturer: 'Boeing',
    model: '737',
    variant: '200',
    updates: {
      availableUntil: 1988 // Production ended
    }
  },

  // Boeing 747-100 - Production ended 1986, retired early 1990s
  {
    manufacturer: 'Boeing',
    model: '747',
    variant: '100',
    updates: {
      availableUntil: 1986 // Production ended
    }
  },

  // DC-10 - Production ended 1989
  {
    manufacturer: 'McDonnell Douglas',
    model: 'DC-10',
    variant: '30',
    updates: {
      availableUntil: 1989 // Production ended
    }
  },

  // L-1011 TriStar - Production ended 1984
  {
    manufacturer: 'Lockheed',
    model: 'L-1011',
    variant: 'TriStar',
    updates: {
      availableUntil: 1984 // Already correct
    }
  },

  // A300 - Production ended 2007
  {
    manufacturer: 'Airbus',
    model: 'A300',
    variant: 'B4',
    updates: {
      availableUntil: 2007 // Already correct
    }
  },

  // Concorde - Retired 2003
  {
    manufacturer: 'Aerospatiale-BAC',
    model: 'Concorde',
    variant: null,
    updates: {
      availableUntil: 2003 // Already correct
    }
  },

  // 757 - Production ended 2004
  {
    manufacturer: 'Boeing',
    model: '757',
    variant: '200',
    updates: {
      availableUntil: 2004 // Production ended
    }
  },

  // 767-300ER - Still in production as freighter
  {
    manufacturer: 'Boeing',
    model: '767',
    variant: '300ER',
    updates: {
      availableUntil: null // Still in production as 767F
    }
  },

  // A310 - Production ended 2007
  {
    manufacturer: 'Airbus',
    model: 'A310',
    variant: '300',
    updates: {
      availableUntil: 2007 // Already correct
    }
  },

  // MD-80 - Production ended 1999
  {
    manufacturer: 'McDonnell Douglas',
    model: 'MD-80',
    variant: '83',
    updates: {
      availableUntil: 1999 // Already correct
    }
  },

  // MD-11 passenger - Production ended 2000
  {
    manufacturer: 'McDonnell Douglas',
    model: 'MD-11',
    variant: null,
    updates: {
      availableUntil: 2000 // Already correct
    }
  },

  // 737-300 - Production ended 1999
  {
    manufacturer: 'Boeing',
    model: '737',
    variant: '300',
    updates: {
      availableUntil: 1999 // Production ended
    }
  },

  // A340 - Production ended 2011
  {
    manufacturer: 'Airbus',
    model: 'A340',
    variant: '300',
    updates: {
      availableUntil: 2011 // Already correct
    }
  },

  // 747-400 - Production ended 2009 for passenger, last delivery 2018 for freighter
  {
    manufacturer: 'Boeing',
    model: '747',
    variant: '400',
    updates: {
      availableUntil: 2009 // Passenger production ended
    }
  },

  // A380 - Production ended 2021
  {
    manufacturer: 'Airbus',
    model: 'A380',
    variant: '800',
    updates: {
      availableUntil: 2021 // Already correct
    }
  },

  // 747-8 - Production ended 2023
  {
    manufacturer: 'Boeing',
    model: '747',
    variant: '8',
    updates: {
      availableUntil: 2023 // Already correct
    }
  }
];

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connected\n');

    let updatedCount = 0;
    let notFoundCount = 0;

    for (const correction of DATE_CORRECTIONS) {
      const whereClause = {
        manufacturer: correction.manufacturer,
        model: correction.model
      };

      if (correction.variant !== undefined) {
        whereClause.variant = correction.variant;
      }

      const aircraft = await Aircraft.findOne({ where: whereClause });

      if (aircraft) {
        const oldData = {
          firstIntroduced: aircraft.firstIntroduced,
          availableFrom: aircraft.availableFrom,
          availableUntil: aircraft.availableUntil,
          description: aircraft.description
        };

        await aircraft.update(correction.updates);
        updatedCount++;

        console.log(`✓ Updated ${correction.manufacturer} ${correction.model}${correction.variant ? '-' + correction.variant : ''}`);
        if (correction.updates.availableFrom !== undefined && oldData.availableFrom !== correction.updates.availableFrom) {
          console.log(`  availableFrom: ${oldData.availableFrom} → ${correction.updates.availableFrom}`);
        }
        if (correction.updates.availableUntil !== undefined && oldData.availableUntil !== correction.updates.availableUntil) {
          console.log(`  availableUntil: ${oldData.availableUntil} → ${correction.updates.availableUntil || 'present'}`);
        }
        if (correction.updates.firstIntroduced !== undefined && oldData.firstIntroduced !== correction.updates.firstIntroduced) {
          console.log(`  firstIntroduced: ${oldData.firstIntroduced} → ${correction.updates.firstIntroduced}`);
        }
      } else {
        notFoundCount++;
        console.log(`✗ NOT FOUND: ${correction.manufacturer} ${correction.model}${correction.variant ? '-' + correction.variant : ''}`);
      }
    }

    console.log(`\n✓ Updated ${updatedCount} aircraft`);
    if (notFoundCount > 0) {
      console.log(`⚠ ${notFoundCount} aircraft not found in database`);
    }

    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
})();
