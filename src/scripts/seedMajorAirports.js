require('dotenv').config();
const sequelize = require('../config/database');
const { Airport } = require('../models');
const airportGrowthService = require('../services/airportGrowthService');

/**
 * Seed the ~160 major airports that have detailed growth data
 * This ensures all airports with historical milestones are available in the database
 */

// Airport details for the major airports in our growth service
const AIRPORT_DETAILS = {
  // Top 10
  'KATL': { name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta', country: 'United States', lat: 33.6407, lon: -84.4277, iata: 'ATL' },
  'OMDB': { name: 'Dubai International Airport', city: 'Dubai', country: 'United Arab Emirates', lat: 25.2532, lon: 55.3657, iata: 'DXB' },
  'KDFW': { name: 'Dallas/Fort Worth International Airport', city: 'Dallas', country: 'United States', lat: 32.8998, lon: -97.0403, iata: 'DFW' },
  'EGLL': { name: 'London Heathrow Airport', city: 'London', country: 'United Kingdom', lat: 51.4700, lon: -0.4543, iata: 'LHR' },
  'RJTT': { name: 'Tokyo Haneda Airport', city: 'Tokyo', country: 'Japan', lat: 35.5494, lon: 139.7798, iata: 'HND' },
  'KDEN': { name: 'Denver International Airport', city: 'Denver', country: 'United States', lat: 39.8561, lon: -104.6737, iata: 'DEN' },
  'LTFM': { name: 'Istanbul Airport', city: 'Istanbul', country: 'Turkey', lat: 41.2619, lon: 28.7419, iata: 'IST' },
  'KLAX': { name: 'Los Angeles International Airport', city: 'Los Angeles', country: 'United States', lat: 33.9416, lon: -118.4085, iata: 'LAX' },
  'KORD': { name: "Chicago O'Hare International Airport", city: 'Chicago', country: 'United States', lat: 41.9742, lon: -87.9073, iata: 'ORD' },
  'LFPG': { name: 'Paris Charles de Gaulle Airport', city: 'Paris', country: 'France', lat: 49.0097, lon: 2.5479, iata: 'CDG' },

  // Level 9
  'ZGGG': { name: 'Guangzhou Baiyun International Airport', city: 'Guangzhou', country: 'China', lat: 23.3924, lon: 113.2988, iata: 'CAN' },
  'VIDP': { name: 'Indira Gandhi International Airport', city: 'New Delhi', country: 'India', lat: 28.5562, lon: 77.1000, iata: 'DEL' },
  'WSSS': { name: 'Singapore Changi Airport', city: 'Singapore', country: 'Singapore', lat: 1.3644, lon: 103.9915, iata: 'SIN' },
  'RKSI': { name: 'Incheon International Airport', city: 'Seoul', country: 'South Korea', lat: 37.4602, lon: 126.4407, iata: 'ICN' },

  // Level 8
  'KJFK': { name: 'John F. Kennedy International Airport', city: 'New York', country: 'United States', lat: 40.6413, lon: -73.7781, iata: 'JFK' },
  'EHAM': { name: 'Amsterdam Airport Schiphol', city: 'Amsterdam', country: 'Netherlands', lat: 52.3105, lon: 4.7683, iata: 'AMS' },
  'KLAS': { name: 'Harry Reid International Airport', city: 'Las Vegas', country: 'United States', lat: 36.0840, lon: -115.1537, iata: 'LAS' },
  'YSSY': { name: 'Sydney Kingsford Smith Airport', city: 'Sydney', country: 'Australia', lat: -33.9399, lon: 151.1753, iata: 'SYD' },
  'EDDF': { name: 'Frankfurt Airport', city: 'Frankfurt', country: 'Germany', lat: 50.0379, lon: 8.5622, iata: 'FRA' },
  'KSEA': { name: 'Seattle-Tacoma International Airport', city: 'Seattle', country: 'United States', lat: 47.4502, lon: -122.3088, iata: 'SEA' },
  'ZSPD': { name: 'Shanghai Pudong International Airport', city: 'Shanghai', country: 'China', lat: 31.1443, lon: 121.8083, iata: 'PVG' },
  'KMCO': { name: 'Orlando International Airport', city: 'Orlando', country: 'United States', lat: 28.4312, lon: -81.3081, iata: 'MCO' },

  // Level 7
  'KCLT': { name: 'Charlotte Douglas International Airport', city: 'Charlotte', country: 'United States', lat: 35.2144, lon: -80.9473, iata: 'CLT' },
  'KPHX': { name: 'Phoenix Sky Harbor International Airport', city: 'Phoenix', country: 'United States', lat: 33.4352, lon: -112.0101, iata: 'PHX' },
  'LFPO': { name: 'Paris Orly Airport', city: 'Paris', country: 'France', lat: 48.7252, lon: 2.3597, iata: 'ORY' },
  'KMIA': { name: 'Miami International Airport', city: 'Miami', country: 'United States', lat: 25.7959, lon: -80.2870, iata: 'MIA' },
  'LEMD': { name: 'Adolfo Suárez Madrid–Barajas Airport', city: 'Madrid', country: 'Spain', lat: 40.4719, lon: -3.5626, iata: 'MAD' },
  'LIRF': { name: 'Leonardo da Vinci–Fiumicino Airport', city: 'Rome', country: 'Italy', lat: 41.8003, lon: 12.2389, iata: 'FCO' },
  'LEBL': { name: 'Barcelona–El Prat Airport', city: 'Barcelona', country: 'Spain', lat: 41.2974, lon: 2.0833, iata: 'BCN' },
  'EGKK': { name: 'London Gatwick Airport', city: 'London', country: 'United Kingdom', lat: 51.1537, lon: -0.1821, iata: 'LGW' },
  'EGSS': { name: 'London Stansted Airport', city: 'London', country: 'United Kingdom', lat: 51.8850, lon: 0.2350, iata: 'STN' },

  // Level 6
  'KBOS': { name: 'Boston Logan International Airport', city: 'Boston', country: 'United States', lat: 42.3656, lon: -71.0096, iata: 'BOS' },
  'KIAD': { name: 'Washington Dulles International Airport', city: 'Washington', country: 'United States', lat: 38.9531, lon: -77.4565, iata: 'IAD' },
  'KSFO': { name: 'San Francisco International Airport', city: 'San Francisco', country: 'United States', lat: 37.6213, lon: -122.3790, iata: 'SFO' },
  'FAOR': { name: 'O.R. Tambo International Airport', city: 'Johannesburg', country: 'South Africa', lat: -26.1367, lon: 28.2411, iata: 'JNB' },
  'VABB': { name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai', country: 'India', lat: 19.0896, lon: 72.8656, iata: 'BOM' },
  'LOWW': { name: 'Vienna International Airport', city: 'Vienna', country: 'Austria', lat: 48.1103, lon: 16.5697, iata: 'VIE' },
  'ESSA': { name: 'Stockholm Arlanda Airport', city: 'Stockholm', country: 'Sweden', lat: 59.6498, lon: 17.9239, iata: 'ARN' },
  'OTHH': { name: 'Hamad International Airport', city: 'Doha', country: 'Qatar', lat: 25.2731, lon: 51.6081, iata: 'DOH' },

  // Level 5
  'FACT': { name: 'Cape Town International Airport', city: 'Cape Town', country: 'South Africa', lat: -33.9715, lon: 18.6021, iata: 'CPT' },
  'EDDT': { name: 'Berlin Brandenburg Airport', city: 'Berlin', country: 'Germany', lat: 52.3667, lon: 13.5033, iata: 'BER' },
  'ENGM': { name: 'Oslo Airport, Gardermoen', city: 'Oslo', country: 'Norway', lat: 60.1976, lon: 11.1004, iata: 'OSL' },
  'EBBR': { name: 'Brussels Airport', city: 'Brussels', country: 'Belgium', lat: 50.9010, lon: 4.4856, iata: 'BRU' },
  'EKCH': { name: 'Copenhagen Airport', city: 'Copenhagen', country: 'Denmark', lat: 55.6180, lon: 12.6506, iata: 'CPH' },
  'EIDW': { name: 'Dublin Airport', city: 'Dublin', country: 'Ireland', lat: 53.4213, lon: -6.2701, iata: 'DUB' },
  'EPWA': { name: 'Warsaw Chopin Airport', city: 'Warsaw', country: 'Poland', lat: 52.1657, lon: 20.9671, iata: 'WAW' },

  // Level 4
  'FAJS': { name: 'Lanseria International Airport', city: 'Johannesburg', country: 'South Africa', lat: -25.9385, lon: 27.9261, iata: 'HLA' },
  'LSZH': { name: 'Zurich Airport', city: 'Zurich', country: 'Switzerland', lat: 47.4647, lon: 8.5492, iata: 'ZRH' },

  // USA - Major Hubs
  'KIAH': { name: 'George Bush Intercontinental Airport', city: 'Houston', country: 'United States', lat: 29.9902, lon: -95.3368, iata: 'IAH' },
  'KEWR': { name: 'Newark Liberty International Airport', city: 'Newark', country: 'United States', lat: 40.6895, lon: -74.1745, iata: 'EWR' },
  'KSAN': { name: 'San Diego International Airport', city: 'San Diego', country: 'United States', lat: 32.7336, lon: -117.1897, iata: 'SAN' },
  'KMDW': { name: 'Chicago Midway International Airport', city: 'Chicago', country: 'United States', lat: 41.7868, lon: -87.7522, iata: 'MDW' },
  'KDTW': { name: 'Detroit Metropolitan Wayne County Airport', city: 'Detroit', country: 'United States', lat: 42.2162, lon: -83.3554, iata: 'DTW' },
  'KMSP': { name: 'Minneapolis–St. Paul International Airport', city: 'Minneapolis', country: 'United States', lat: 44.8848, lon: -93.2223, iata: 'MSP' },
  'KBWI': { name: 'Baltimore/Washington International Airport', city: 'Baltimore', country: 'United States', lat: 39.1774, lon: -76.6684, iata: 'BWI' },
  'KPDX': { name: 'Portland International Airport', city: 'Portland', country: 'United States', lat: 45.5898, lon: -122.5951, iata: 'PDX' },
  'KSLC': { name: 'Salt Lake City International Airport', city: 'Salt Lake City', country: 'United States', lat: 40.7899, lon: -111.9791, iata: 'SLC' },
  'KTPA': { name: 'Tampa International Airport', city: 'Tampa', country: 'United States', lat: 27.9755, lon: -82.5332, iata: 'TPA' },

  // Canada
  'CYYZ': { name: 'Toronto Pearson International Airport', city: 'Toronto', country: 'Canada', lat: 43.6777, lon: -79.6248, iata: 'YYZ' },
  'CYVR': { name: 'Vancouver International Airport', city: 'Vancouver', country: 'Canada', lat: 49.1939, lon: -123.1844, iata: 'YVR' },
  'CYUL': { name: 'Montréal–Pierre Elliott Trudeau International Airport', city: 'Montreal', country: 'Canada', lat: 45.4657, lon: -73.7408, iata: 'YUL' },

  // UK & Ireland
  'EGCC': { name: 'Manchester Airport', city: 'Manchester', country: 'United Kingdom', lat: 53.3587, lon: -2.2730, iata: 'MAN' },
  'EGPH': { name: 'Edinburgh Airport', city: 'Edinburgh', country: 'United Kingdom', lat: 55.9500, lon: -3.3725, iata: 'EDI' },

  // Germany
  'EDDM': { name: 'Munich Airport', city: 'Munich', country: 'Germany', lat: 48.3537, lon: 11.7750, iata: 'MUC' },
  'EDDB': { name: 'Berlin Schönefeld Airport', city: 'Berlin', country: 'Germany', lat: 52.3800, lon: 13.5225, iata: 'SXF' },
  'EDDL': { name: 'Düsseldorf Airport', city: 'Düsseldorf', country: 'Germany', lat: 51.2895, lon: 6.7668, iata: 'DUS' },

  // France
  'LFPB': { name: 'Paris Le Bourget Airport', city: 'Paris', country: 'France', lat: 48.9694, lon: 2.4414, iata: 'LBG' },
  'LFML': { name: 'Marseille Provence Airport', city: 'Marseille', country: 'France', lat: 43.4393, lon: 5.2214, iata: 'MRS' },
  'LFLL': { name: 'Lyon–Saint-Exupéry Airport', city: 'Lyon', country: 'France', lat: 45.7256, lon: 5.0811, iata: 'LYS' },

  // Spain & Portugal
  'LPPT': { name: 'Lisbon Portela Airport', city: 'Lisbon', country: 'Portugal', lat: 38.7813, lon: -9.1359, iata: 'LIS' },
  'LEAL': { name: 'Alicante–Elche Airport', city: 'Alicante', country: 'Spain', lat: 38.2822, lon: -0.5581, iata: 'ALC' },
  'LEMG': { name: 'Málaga Airport', city: 'Málaga', country: 'Spain', lat: 36.6749, lon: -4.4991, iata: 'AGP' },

  // Italy
  'LIMC': { name: 'Milan Malpensa Airport', city: 'Milan', country: 'Italy', lat: 45.6306, lon: 8.7231, iata: 'MXP' },
  'LIPE': { name: 'Bologna Guglielmo Marconi Airport', city: 'Bologna', country: 'Italy', lat: 44.5354, lon: 11.2887, iata: 'BLQ' },
  'LIPZ': { name: 'Venice Marco Polo Airport', city: 'Venice', country: 'Italy', lat: 45.5053, lon: 12.3519, iata: 'VCE' },

  // Netherlands & Belgium
  'EHRD': { name: 'Rotterdam The Hague Airport', city: 'Rotterdam', country: 'Netherlands', lat: 51.9569, lon: 4.4375, iata: 'RTM' },

  // Switzerland
  'LSGG': { name: 'Geneva Airport', city: 'Geneva', country: 'Switzerland', lat: 46.2381, lon: 6.1090, iata: 'GVA' },

  // Scandinavia
  'EKBI': { name: 'Billund Airport', city: 'Billund', country: 'Denmark', lat: 55.7403, lon: 9.1518, iata: 'BLL' },
  'ESGG': { name: 'Gothenburg Landvetter Airport', city: 'Gothenburg', country: 'Sweden', lat: 57.6628, lon: 12.2798, iata: 'GOT' },

  // Eastern Europe
  'LKPR': { name: 'Václav Havel Airport Prague', city: 'Prague', country: 'Czech Republic', lat: 50.1008, lon: 14.2632, iata: 'PRG' },
  'LHBP': { name: 'Budapest Ferenc Liszt International Airport', city: 'Budapest', country: 'Hungary', lat: 47.4298, lon: 19.2611, iata: 'BUD' },
  'LROP': { name: 'Henri Coandă International Airport', city: 'Bucharest', country: 'Romania', lat: 44.5722, lon: 26.1022, iata: 'OTP' },

  // Turkey
  'LTBA': { name: 'Istanbul Atatürk Airport', city: 'Istanbul', country: 'Turkey', lat: 40.9769, lon: 28.8146, iata: 'ISL' },

  // Russia
  'UUEE': { name: 'Sheremetyevo International Airport', city: 'Moscow', country: 'Russia', lat: 55.9726, lon: 37.4146, iata: 'SVO' },
  'UUDD': { name: 'Domodedovo International Airport', city: 'Moscow', country: 'Russia', lat: 55.4088, lon: 37.9063, iata: 'DME' },

  // Middle East
  'OJAI': { name: 'Queen Alia International Airport', city: 'Amman', country: 'Jordan', lat: 31.7226, lon: 35.9932, iata: 'AMM' },
  'OMAA': { name: 'Abu Dhabi International Airport', city: 'Abu Dhabi', country: 'United Arab Emirates', lat: 24.4330, lon: 54.6511, iata: 'AUH' },
  'OERK': { name: 'King Khalid International Airport', city: 'Riyadh', country: 'Saudi Arabia', lat: 24.9576, lon: 46.6988, iata: 'RUH' },

  // Asia - China
  'ZBAA': { name: 'Beijing Capital International Airport', city: 'Beijing', country: 'China', lat: 40.0801, lon: 116.5846, iata: 'PEK' },
  'ZGSZ': { name: 'Shenzhen Bao\'an International Airport', city: 'Shenzhen', country: 'China', lat: 22.6393, lon: 113.8106, iata: 'SZX' },
  'ZUUU': { name: 'Chengdu Shuangliu International Airport', city: 'Chengdu', country: 'China', lat: 30.5785, lon: 103.9468, iata: 'CTU' },
  'ZUCK': { name: 'Chongqing Jiangbei International Airport', city: 'Chongqing', country: 'China', lat: 29.7192, lon: 106.6417, iata: 'CKG' },

  // Asia - Japan
  'RJAA': { name: 'Narita International Airport', city: 'Tokyo', country: 'Japan', lat: 35.7647, lon: 140.3864, iata: 'NRT' },
  'RJBB': { name: 'Kansai International Airport', city: 'Osaka', country: 'Japan', lat: 34.4347, lon: 135.2440, iata: 'KIX' },

  // Asia - SE Asia
  'VTBS': { name: 'Suvarnabhumi Airport', city: 'Bangkok', country: 'Thailand', lat: 13.6900, lon: 100.7501, iata: 'BKK' },
  'WMKK': { name: 'Kuala Lumpur International Airport', city: 'Kuala Lumpur', country: 'Malaysia', lat: 2.7456, lon: 101.7099, iata: 'KUL' },
  'VHHH': { name: 'Hong Kong International Airport', city: 'Hong Kong', country: 'Hong Kong', lat: 22.3080, lon: 113.9185, iata: 'HKG' },
  'RCTP': { name: 'Taiwan Taoyuan International Airport', city: 'Taipei', country: 'Taiwan', lat: 25.0797, lon: 121.2342, iata: 'TPE' },

  // Asia - South Asia
  'VCBI': { name: 'Bandaranaike International Airport', city: 'Colombo', country: 'Sri Lanka', lat: 7.1808, lon: 79.8841, iata: 'CMB' },

  // Oceania
  'YMML': { name: 'Melbourne Airport', city: 'Melbourne', country: 'Australia', lat: -37.6733, lon: 144.8433, iata: 'MEL' },
  'YBBN': { name: 'Brisbane Airport', city: 'Brisbane', country: 'Australia', lat: -27.3942, lon: 153.1218, iata: 'BNE' },
  'NZAA': { name: 'Auckland Airport', city: 'Auckland', country: 'New Zealand', lat: -37.0082, lon: 174.7850, iata: 'AKL' },

  // Latin America
  'SBGR': { name: 'São Paulo/Guarulhos International Airport', city: 'São Paulo', country: 'Brazil', lat: -23.4356, lon: -46.4731, iata: 'GRU' },
  'SCEL': { name: 'Arturo Merino Benítez International Airport', city: 'Santiago', country: 'Chile', lat: -33.3930, lon: -70.7858, iata: 'SCL' },
  'SBBR': { name: 'Brasília International Airport', city: 'Brasília', country: 'Brazil', lat: -15.8711, lon: -47.9186, iata: 'BSB' },
  'SKBO': { name: 'El Dorado International Airport', city: 'Bogotá', country: 'Colombia', lat: 4.7016, lon: -74.1469, iata: 'BOG' },
  'SAEZ': { name: 'Ministro Pistarini International Airport', city: 'Buenos Aires', country: 'Argentina', lat: -34.8222, lon: -58.5358, iata: 'EZE' },
  'MMMX': { name: 'Mexico City International Airport', city: 'Mexico City', country: 'Mexico', lat: 19.4363, lon: -99.0721, iata: 'MEX' },
  'MUHA': { name: 'José Martí International Airport', city: 'Havana', country: 'Cuba', lat: 22.9892, lon: -82.4091, iata: 'HAV' },

  // Caribbean
  'TNCM': { name: 'Princess Juliana International Airport', city: 'St. Maarten', country: 'Sint Maarten', lat: 18.0410, lon: -63.1089, iata: 'SXM' },

  // Africa
  'HECA': { name: 'Cairo International Airport', city: 'Cairo', country: 'Egypt', lat: 30.1219, lon: 31.4056, iata: 'CAI' },
  'DNMM': { name: 'Murtala Muhammed International Airport', city: 'Lagos', country: 'Nigeria', lat: 6.5774, lon: 3.3212, iata: 'LOS' },
  'GMME': { name: 'Rabat–Salé Airport', city: 'Rabat', country: 'Morocco', lat: 34.0515, lon: -6.7515, iata: 'RBA' },
  'HKJK': { name: 'Jomo Kenyatta International Airport', city: 'Nairobi', country: 'Kenya', lat: -1.3192, lon: 36.9278, iata: 'NBO' },
  'FALE': { name: 'Luanda Quatro de Fevereiro Airport', city: 'Luanda', country: 'Angola', lat: -8.8584, lon: 13.2312, iata: 'LAD' }
};

async function seedMajorAirports() {
  try {
    console.log('=== Seeding Major Airports with Historical Data ===\n');

    await sequelize.sync();

    const airports = Object.entries(airportGrowthService.AIRPORT_2024_DATA).map(([icaoCode, data]) => {
      const details = AIRPORT_DETAILS[icaoCode];

      if (!details) {
        console.warn(`Warning: No details found for ${icaoCode}, skipping...`);
        return null;
      }

      // Determine type based on 2024 passenger count
      let type;
      if (data.pax2024 >= 50) type = 'International Hub';
      else if (data.pax2024 >= 20) type = 'Major';
      else if (data.pax2024 >= 10) type = 'Regional';
      else type = 'Small Regional';

      return {
        icaoCode,
        iataCode: details.iata,
        name: details.name,
        city: details.city,
        country: details.country,
        latitude: details.lat,
        longitude: details.lon,
        elevation: null,
        type,
        timezone: null,
        isActive: true,
        operationalFrom: data.opened,
        operationalUntil: null,
        trafficDemand: 10, // Will be calculated dynamically by growth service
        infrastructureLevel: 10 // Will be calculated dynamically by growth service
      };
    }).filter(Boolean);

    console.log(`Preparing to import ${airports.length} major airports...\n`);

    // Delete existing airports
    await Airport.destroy({ where: {} });
    console.log('✓ Cleared existing airports\n');

    // Bulk create
    await Airport.bulkCreate(airports, {
      validate: true,
      ignoreDuplicates: false
    });

    console.log(`✓ Imported ${airports.length} major airports with historical data\n`);

    // Show summary
    const typeCounts = airports.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});

    console.log('=== Summary ===');
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`${type}: ${count} airports`);
    });

    console.log('\n✓ Major airports seeding complete!');
    console.log('\nThese airports all have detailed historical growth data from 1950-2024.');
    console.log('Traffic and infrastructure levels will be calculated dynamically based on world year.\n');

    process.exit(0);
  } catch (error) {
    console.error('✗ Error seeding airports:', error.message);
    console.error(error);
    process.exit(1);
  }
}

seedMajorAirports();
