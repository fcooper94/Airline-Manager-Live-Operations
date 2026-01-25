require('dotenv').config();
const sequelize = require('../config/database');
const { Aircraft } = require('../models');

async function seedAircraft() {
  try {
    console.log('Seeding aircraft data...');

    // Sample aircraft data
    const aircraftData = [
      {
        manufacturer: 'Boeing',
        model: '737',
        variant: 'MAX 8',
        type: 'Narrowbody',
        rangeCategory: 'Short Haul',
        rangeNm: 3550,
        cruiseSpeed: 475,
        passengerCapacity: 178,
        cargoCapacityKg: 20000,
        fuelCapacityLiters: 36000,
        purchasePrice: 125000000,
        usedPrice: 85000000,
        maintenanceCostPerHour: 1800,
        maintenanceCostPerMonth: 144000, // ~80 hours/month
        fuelBurnPerHour: 2500,
        firstIntroduced: 2017,
        availableFrom: 2017,
        availableUntil: null,
        requiredPilots: 2,
        requiredCabinCrew: 4,
        isActive: true,
        description: 'Most popular narrowbody aircraft with improved fuel efficiency'
      },
      {
        manufacturer: 'Airbus',
        model: 'A320',
        variant: 'neo',
        type: 'Narrowbody',
        rangeCategory: 'Short Haul',
        rangeNm: 3300,
        cruiseSpeed: 470,
        passengerCapacity: 180,
        cargoCapacityKg: 18000,
        fuelCapacityLiters: 34000,
        purchasePrice: 110000000,
        usedPrice: 75000000,
        maintenanceCostPerHour: 1600,
        maintenanceCostPerMonth: 128000, // ~80 hours/month
        fuelBurnPerHour: 2400,
        firstIntroduced: 2015,
        availableFrom: 2015,
        availableUntil: null,
        requiredPilots: 2,
        requiredCabinCrew: 4,
        isActive: true,
        description: 'Efficient single-aisle aircraft with new engine option'
      },
      {
        manufacturer: 'Boeing',
        model: '787',
        variant: 'Dreamliner',
        type: 'Widebody',
        rangeCategory: 'Long Haul',
        rangeNm: 7355,
        cruiseSpeed: 488,
        passengerCapacity: 296,
        cargoCapacityKg: 45000,
        fuelCapacityLiters: 126206,
        purchasePrice: 248300000,
        usedPrice: 180000000,
        maintenanceCostPerHour: 2800,
        maintenanceCostPerMonth: 252000, // ~90 hours/month
        fuelBurnPerHour: 5400,
        firstIntroduced: 2011,
        availableFrom: 2011,
        availableUntil: null,
        requiredPilots: 2,
        requiredCabinCrew: 6,
        isActive: true,
        description: 'Composite material widebody aircraft with improved fuel efficiency'
      },
      {
        manufacturer: 'Airbus',
        model: 'A350',
        variant: 'XWB',
        type: 'Widebody',
        rangeCategory: 'Long Haul',
        rangeNm: 8100,
        cruiseSpeed: 487,
        passengerCapacity: 325,
        cargoCapacityKg: 50000,
        fuelCapacityLiters: 141480,
        purchasePrice: 317400000,
        usedPrice: 250000000,
        maintenanceCostPerHour: 3200,
        maintenanceCostPerMonth: 288000, // ~90 hours/month
        fuelBurnPerHour: 5800,
        firstIntroduced: 2013,
        availableFrom: 2013,
        availableUntil: null,
        requiredPilots: 2,
        requiredCabinCrew: 7,
        isActive: true,
        description: 'Advanced widebody aircraft with carbon fiber construction'
      },
      {
        manufacturer: 'Embraer',
        model: 'E195-E2',
        type: 'Regional',
        rangeCategory: 'Short Haul',
        rangeNm: 2850,
        cruiseSpeed: 460,
        passengerCapacity: 146,
        cargoCapacityKg: 12000,
        fuelCapacityLiters: 17000,
        purchasePrice: 65000000,
        usedPrice: 45000000,
        maintenanceCostPerHour: 1200,
        maintenanceCostPerMonth: 96000, // ~80 hours/month
        fuelBurnPerHour: 1800,
        firstIntroduced: 2019,
        availableFrom: 2019,
        availableUntil: null,
        requiredPilots: 2,
        requiredCabinCrew: 3,
        isActive: true,
        description: 'Next-generation regional jet with improved efficiency'
      },
      {
        manufacturer: 'Boeing',
        model: '777',
        variant: 'Freighter',
        type: 'Cargo',
        rangeCategory: 'Long Haul',
        rangeNm: 5625,
        cruiseSpeed: 489,
        passengerCapacity: 0,
        cargoCapacityKg: 102000,
        fuelCapacityLiters: 117340,
        purchasePrice: 350000000,
        usedPrice: 280000000,
        maintenanceCostPerHour: 3500,
        maintenanceCostPerMonth: 315000, // ~90 hours/month
        fuelBurnPerHour: 6200,
        firstIntroduced: 2009,
        availableFrom: 2009,
        availableUntil: null,
        requiredPilots: 2,
        requiredCabinCrew: 0, // Cargo aircraft
        isActive: true,
        description: 'Heavy cargo aircraft with massive payload capacity'
      }
    ];

    // Check if aircraft already exist
    const existingAircraft = await Aircraft.count();
    
    if (existingAircraft > 0) {
      console.log(`Found ${existingAircraft} existing aircraft. Skipping seed.`);
      return;
    }

    // Insert aircraft data
    for (const aircraft of aircraftData) {
      await Aircraft.create(aircraft);
      console.log(`✓ Created: ${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? '-' + aircraft.variant : ''}`);
    }

    console.log('\n✓ Aircraft seeding completed successfully!');
    
    // Close connection
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('✗ Aircraft seeding failed:', error);
    process.exit(1);
  }
}

seedAircraft();