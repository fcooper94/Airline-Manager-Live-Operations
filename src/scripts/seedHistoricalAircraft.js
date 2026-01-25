require('dotenv').config();
const sequelize = require('../config/database');
const { Aircraft } = require('../models');

/**
 * COMPREHENSIVE AIRCRAFT DATABASE (150+ AIRCRAFT) - 1950 to Present
 *
 * Coverage:
 * - Western Jets & Turboprops
 * - Russian/Soviet Aircraft (Tupolev, Ilyushin, Antonov, Yakovlev, Sukhoi)
 * - Regional Jets & Turboprops (12-100 seats)
 * - Cargo Aircraft
 * - All major variants
 *
 * All aircraft set to isActive: true - availableFrom/availableUntil control world availability
 * Prices adjusted for inflation using 2024 USD values
 */

const COMPREHENSIVE_AIRCRAFT = [

  // ========================================
  // 1950s ERA - PROPELLER & EARLY JETS
  // ========================================

  // Classic Propeller Aircraft
  {
    manufacturer: 'Douglas', model: 'DC-3', variant: null, type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 1500, cruiseSpeed: 180,
    passengerCapacity: 32, cargoCapacityKg: 2700, fuelCapacityLiters: 3180,
    purchasePrice: 8500000, usedPrice: 4000000, maintenanceCostPerHour: 800,
    maintenanceCostPerMonth: 64000, fuelBurnPerHour: 500,
    firstIntroduced: 1936, availableFrom: 1950, availableUntil: 1975,
    requiredPilots: 2, requiredCabinCrew: 2, isActive: true,
    description: 'Legendary propeller aircraft that revolutionized air travel'
  },

  {
    manufacturer: 'Lockheed', model: 'L-1049', variant: 'Super Constellation', type: 'Narrowbody',
    rangeCategory: 'Medium Haul', rangeNm: 2400, cruiseSpeed: 300,
    passengerCapacity: 95, cargoCapacityKg: 6800, fuelCapacityLiters: 22700,
    purchasePrice: 18000000, usedPrice: 9000000, maintenanceCostPerHour: 1200,
    maintenanceCostPerMonth: 96000, fuelBurnPerHour: 1800,
    firstIntroduced: 1951, availableFrom: 1951, availableUntil: 1968,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'Iconic triple-tail luxury propeller airliner'
  },

  {
    manufacturer: 'Vickers', model: 'Viscount', variant: '800', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1200, cruiseSpeed: 312,
    passengerCapacity: 65, cargoCapacityKg: 4000, fuelCapacityLiters: 7100,
    purchasePrice: 12000000, usedPrice: 5000000, maintenanceCostPerHour: 900,
    maintenanceCostPerMonth: 72000, fuelBurnPerHour: 900,
    firstIntroduced: 1950, availableFrom: 1950, availableUntil: 1970,
    requiredPilots: 2, requiredCabinCrew: 2, isActive: true,
    description: 'First turboprop airliner - smooth and quiet'
  },

  // First Generation Jets
  {
    manufacturer: 'de Havilland', model: 'Comet 4', variant: null, type: 'Narrowbody',
    rangeCategory: 'Long Haul', rangeNm: 3225, cruiseSpeed: 450,
    passengerCapacity: 81, cargoCapacityKg: 5000, fuelCapacityLiters: 28680,
    purchasePrice: 22000000, usedPrice: 10000000, maintenanceCostPerHour: 1400,
    maintenanceCostPerMonth: 112000, fuelBurnPerHour: 3200,
    firstIntroduced: 1958, availableFrom: 1958, availableUntil: 1981,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'First commercial jetliner - pioneered jet travel'
  },

  {
    manufacturer: 'Sud Aviation', model: 'Caravelle', variant: null, type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 1700, cruiseSpeed: 450,
    passengerCapacity: 80, cargoCapacityKg: 4500, fuelCapacityLiters: 14000,
    purchasePrice: 20000000, usedPrice: 9000000, maintenanceCostPerHour: 1300,
    maintenanceCostPerMonth: 104000, fuelBurnPerHour: 2800,
    firstIntroduced: 1955, availableFrom: 1955, availableUntil: 1972,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'French jet - rear-mounted engines, pioneering design'
  },

  // Soviet Era - 1950s
  {
    manufacturer: 'Tupolev', model: 'Tu-104', variant: null, type: 'Narrowbody',
    rangeCategory: 'Medium Haul', rangeNm: 2000, cruiseSpeed: 500,
    passengerCapacity: 100, cargoCapacityKg: 5000, fuelCapacityLiters: 25000,
    purchasePrice: 18000000, usedPrice: 8000000, maintenanceCostPerHour: 1400,
    maintenanceCostPerMonth: 112000, fuelBurnPerHour: 3500,
    firstIntroduced: 1955, availableFrom: 1955, availableUntil: 1979,
    requiredPilots: 3, requiredCabinCrew: 3, isActive: true,
    description: 'Soviet first jet airliner - world\'s second commercial jet'
  },

  {
    manufacturer: 'Ilyushin', model: 'Il-14', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 800, cruiseSpeed: 250,
    passengerCapacity: 32, cargoCapacityKg: 3500, fuelCapacityLiters: 4800,
    purchasePrice: 9000000, usedPrice: 4000000, maintenanceCostPerHour: 750,
    maintenanceCostPerMonth: 60000, fuelBurnPerHour: 700,
    firstIntroduced: 1954, availableFrom: 1954, availableUntil: 1970,
    requiredPilots: 2, requiredCabinCrew: 2, isActive: true,
    description: 'Soviet twin-engine prop - DC-3 successor in USSR'
  },

  {
    manufacturer: 'Antonov', model: 'An-24', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1000, cruiseSpeed: 280,
    passengerCapacity: 52, cargoCapacityKg: 5500, fuelCapacityLiters: 5500,
    purchasePrice: 10000000, usedPrice: 4500000, maintenanceCostPerHour: 800,
    maintenanceCostPerMonth: 64000, fuelBurnPerHour: 750,
    firstIntroduced: 1959, availableFrom: 1959, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 2, isActive: true,
    description: 'Rugged Soviet turboprop - extremely reliable, still flying'
  },

  {
    manufacturer: 'Antonov', model: 'An-2', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 525, cruiseSpeed: 120,
    passengerCapacity: 12, cargoCapacityKg: 1500, fuelCapacityLiters: 1200,
    purchasePrice: 3500000, usedPrice: 1500000, maintenanceCostPerHour: 450,
    maintenanceCostPerMonth: 36000, fuelBurnPerHour: 200,
    firstIntroduced: 1947, availableFrom: 1950, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Legendary Soviet biplane - most produced aircraft ever'
  },

  {
    manufacturer: 'Beechcraft', model: '18', variant: 'Twin Beech', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1200, cruiseSpeed: 220,
    passengerCapacity: 11, cargoCapacityKg: 1200, fuelCapacityLiters: 950,
    purchasePrice: 4000000, usedPrice: 1800000, maintenanceCostPerHour: 500,
    maintenanceCostPerMonth: 40000, fuelBurnPerHour: 250,
    firstIntroduced: 1937, availableFrom: 1950, availableUntil: 1970,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Classic twin prop - versatile commuter aircraft'
  },

  {
    manufacturer: 'de Havilland', model: 'Dove', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 800, cruiseSpeed: 165,
    passengerCapacity: 11, cargoCapacityKg: 900, fuelCapacityLiters: 750,
    purchasePrice: 3500000, usedPrice: 1600000, maintenanceCostPerHour: 480,
    maintenanceCostPerMonth: 38400, fuelBurnPerHour: 220,
    firstIntroduced: 1945, availableFrom: 1950, availableUntil: 1967,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'British commuter aircraft - elegant design'
  },

  {
    manufacturer: 'de Havilland', model: 'Heron', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 915, cruiseSpeed: 183,
    passengerCapacity: 17, cargoCapacityKg: 1400, fuelCapacityLiters: 1100,
    purchasePrice: 5000000, usedPrice: 2200000, maintenanceCostPerHour: 550,
    maintenanceCostPerMonth: 44000, fuelBurnPerHour: 280,
    firstIntroduced: 1950, availableFrom: 1950, availableUntil: 1968,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Four-engine commuter - stretched Dove'
  },

  {
    manufacturer: 'Grumman', model: 'G-21', variant: 'Goose', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 640, cruiseSpeed: 201,
    passengerCapacity: 12, cargoCapacityKg: 1000, fuelCapacityLiters: 850,
    purchasePrice: 4500000, usedPrice: 2000000, maintenanceCostPerHour: 520,
    maintenanceCostPerMonth: 41600, fuelBurnPerHour: 260,
    firstIntroduced: 1937, availableFrom: 1950, availableUntil: 1965,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Amphibious aircraft - island hopper classic'
  },

  // ========================================
  // 1960s ERA - JET AGE EXPANSION
  // ========================================

  {
    manufacturer: 'Boeing', model: '707', variant: '320B', type: 'Narrowbody',
    rangeCategory: 'Long Haul', rangeNm: 4300, cruiseSpeed: 525,
    passengerCapacity: 189, cargoCapacityKg: 15000, fuelCapacityLiters: 90770,
    purchasePrice: 45000000, usedPrice: 20000000, maintenanceCostPerHour: 2000,
    maintenanceCostPerMonth: 160000, fuelBurnPerHour: 5000,
    firstIntroduced: 1958, availableFrom: 1958, availableUntil: 1991,
    requiredPilots: 3, requiredCabinCrew: 5, isActive: true,
    description: 'Aircraft that started the jet age'
  },

  {
    manufacturer: 'Douglas', model: 'DC-8', variant: '63', type: 'Narrowbody',
    rangeCategory: 'Long Haul', rangeNm: 4500, cruiseSpeed: 520,
    passengerCapacity: 259, cargoCapacityKg: 18000, fuelCapacityLiters: 102200,
    purchasePrice: 48000000, usedPrice: 22000000, maintenanceCostPerHour: 2100,
    maintenanceCostPerMonth: 168000, fuelBurnPerHour: 5200,
    firstIntroduced: 1959, availableFrom: 1959, availableUntil: 1995,
    requiredPilots: 3, requiredCabinCrew: 6, isActive: true,
    description: 'Douglas rival to 707 - stretched Super 60 series'
  },

  {
    manufacturer: 'Boeing', model: '727', variant: '200', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 1900, cruiseSpeed: 467,
    passengerCapacity: 189, cargoCapacityKg: 12000, fuelCapacityLiters: 31160,
    purchasePrice: 35000000, usedPrice: 15000000, maintenanceCostPerHour: 1700,
    maintenanceCostPerMonth: 136000, fuelBurnPerHour: 3800,
    firstIntroduced: 1963, availableFrom: 1963, availableUntil: 2001,
    requiredPilots: 3, requiredCabinCrew: 4, isActive: true,
    description: 'Tri-jet workhorse - short runway capability'
  },

  {
    manufacturer: 'Boeing', model: '737', variant: '200', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 2370, cruiseSpeed: 440,
    passengerCapacity: 130, cargoCapacityKg: 8000, fuelCapacityLiters: 19870,
    purchasePrice: 28000000, usedPrice: 12000000, maintenanceCostPerHour: 1400,
    maintenanceCostPerMonth: 112000, fuelBurnPerHour: 2800,
    firstIntroduced: 1968, availableFrom: 1968, availableUntil: 2000,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'Original 737 - most successful aircraft family'
  },

  {
    manufacturer: 'Douglas', model: 'DC-9', variant: '30', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 1450, cruiseSpeed: 450,
    passengerCapacity: 115, cargoCapacityKg: 7500, fuelCapacityLiters: 15900,
    purchasePrice: 25000000, usedPrice: 10000000, maintenanceCostPerHour: 1300,
    maintenanceCostPerMonth: 104000, fuelBurnPerHour: 2600,
    firstIntroduced: 1965, availableFrom: 1965, availableUntil: 1990,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'Popular short-haul jet - competed with 737'
  },

  {
    manufacturer: 'BAC', model: 'One-Eleven', variant: '500', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 1480, cruiseSpeed: 461,
    passengerCapacity: 119, cargoCapacityKg: 7000, fuelCapacityLiters: 17800,
    purchasePrice: 24000000, usedPrice: 9000000, maintenanceCostPerHour: 1250,
    maintenanceCostPerMonth: 100000, fuelBurnPerHour: 2550,
    firstIntroduced: 1963, availableFrom: 1963, availableUntil: 1989,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'British short-haul jet - rear-mounted engines'
  },

  {
    manufacturer: 'Fokker', model: 'F28', variant: 'Fellowship', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1100, cruiseSpeed: 435,
    passengerCapacity: 85, cargoCapacityKg: 5000, fuelCapacityLiters: 7800,
    purchasePrice: 18000000, usedPrice: 7500000, maintenanceCostPerHour: 1100,
    maintenanceCostPerMonth: 88000, fuelBurnPerHour: 1900,
    firstIntroduced: 1969, availableFrom: 1969, availableUntil: 1987,
    requiredPilots: 2, requiredCabinCrew: 2, isActive: true,
    description: 'Dutch regional jet - efficient short-haul operations'
  },

  // Soviet/Russian - 1960s
  {
    manufacturer: 'Tupolev', model: 'Tu-134', variant: null, type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 1900, cruiseSpeed: 490,
    passengerCapacity: 80, cargoCapacityKg: 5000, fuelCapacityLiters: 14000,
    purchasePrice: 22000000, usedPrice: 9000000, maintenanceCostPerHour: 1300,
    maintenanceCostPerMonth: 104000, fuelBurnPerHour: 2900,
    firstIntroduced: 1967, availableFrom: 1967, availableUntil: 2019,
    requiredPilots: 3, requiredCabinCrew: 3, isActive: true,
    description: 'Soviet short-haul jet - DC-9 competitor'
  },

  {
    manufacturer: 'Tupolev', model: 'Tu-154', variant: 'M', type: 'Narrowbody',
    rangeCategory: 'Medium Haul', rangeNm: 3900, cruiseSpeed: 500,
    passengerCapacity: 180, cargoCapacityKg: 12000, fuelCapacityLiters: 36000,
    purchasePrice: 35000000, usedPrice: 15000000, maintenanceCostPerHour: 1900,
    maintenanceCostPerMonth: 152000, fuelBurnPerHour: 4200,
    firstIntroduced: 1968, availableFrom: 1968, availableUntil: 2013,
    requiredPilots: 3, requiredCabinCrew: 4, isActive: true,
    description: 'Soviet tri-jet workhorse - extremely popular in Eastern Bloc'
  },

  {
    manufacturer: 'Ilyushin', model: 'Il-62', variant: null, type: 'Narrowbody',
    rangeCategory: 'Long Haul', rangeNm: 6800, cruiseSpeed: 500,
    passengerCapacity: 186, cargoCapacityKg: 15000, fuelCapacityLiters: 84000,
    purchasePrice: 42000000, usedPrice: 18000000, maintenanceCostPerHour: 2200,
    maintenanceCostPerMonth: 176000, fuelBurnPerHour: 5800,
    firstIntroduced: 1967, availableFrom: 1967, availableUntil: 1995,
    requiredPilots: 3, requiredCabinCrew: 5, isActive: true,
    description: 'Soviet long-haul jet - rear-mounted engines, elegant design'
  },

  {
    manufacturer: 'Yakovlev', model: 'Yak-40', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 900, cruiseSpeed: 342,
    passengerCapacity: 32, cargoCapacityKg: 2500, fuelCapacityLiters: 4200,
    purchasePrice: 12000000, usedPrice: 5000000, maintenanceCostPerHour: 900,
    maintenanceCostPerMonth: 72000, fuelBurnPerHour: 1200,
    firstIntroduced: 1966, availableFrom: 1966, availableUntil: 1981,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Soviet regional tri-jet - first regional jet with no reverse thrust needed'
  },

  // Small Props & Turboprops - 1960s
  {
    manufacturer: 'Britten-Norman', model: 'BN-2', variant: 'Islander', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 870, cruiseSpeed: 170,
    passengerCapacity: 9, cargoCapacityKg: 900, fuelCapacityLiters: 540,
    purchasePrice: 2800000, usedPrice: 1200000, maintenanceCostPerHour: 400,
    maintenanceCostPerMonth: 32000, fuelBurnPerHour: 150,
    firstIntroduced: 1965, availableFrom: 1965, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Island hopper - simplest twin-engine aircraft'
  },

  {
    manufacturer: 'Handley Page', model: 'HPR.7', variant: 'Herald', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1050, cruiseSpeed: 275,
    passengerCapacity: 50, cargoCapacityKg: 5000, fuelCapacityLiters: 5400,
    purchasePrice: 11000000, usedPrice: 4800000, maintenanceCostPerHour: 750,
    maintenanceCostPerMonth: 60000, fuelBurnPerHour: 600,
    firstIntroduced: 1959, availableFrom: 1959, availableUntil: 1970,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'British turboprop - competed with Fokker F27'
  },

  {
    manufacturer: 'NAMC', model: 'YS-11', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 680, cruiseSpeed: 290,
    passengerCapacity: 60, cargoCapacityKg: 6000, fuelCapacityLiters: 7500,
    purchasePrice: 12000000, usedPrice: 5200000, maintenanceCostPerHour: 800,
    maintenanceCostPerMonth: 64000, fuelBurnPerHour: 750,
    firstIntroduced: 1962, availableFrom: 1962, availableUntil: 1974,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Japanese turboprop - only Japanese transport aircraft'
  },

  {
    manufacturer: 'Fairchild', model: 'F-27', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1100, cruiseSpeed: 280,
    passengerCapacity: 44, cargoCapacityKg: 5000, fuelCapacityLiters: 5730,
    purchasePrice: 13000000, usedPrice: 5600000, maintenanceCostPerHour: 780,
    maintenanceCostPerMonth: 62400, fuelBurnPerHour: 620,
    firstIntroduced: 1958, availableFrom: 1958, availableUntil: 1986,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'US-built Fokker F27 - license production'
  },

  {
    manufacturer: 'Beechcraft', model: '99', variant: 'Airliner', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 730, cruiseSpeed: 230,
    passengerCapacity: 15, cargoCapacityKg: 1400, fuelCapacityLiters: 1200,
    purchasePrice: 4500000, usedPrice: 2000000, maintenanceCostPerHour: 520,
    maintenanceCostPerMonth: 41600, fuelBurnPerHour: 280,
    firstIntroduced: 1966, availableFrom: 1966, availableUntil: 1986,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Commuter turboprop - very popular in USA'
  },

  {
    manufacturer: 'Let', model: 'L-410', variant: 'Turbolet', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 870, cruiseSpeed: 229,
    passengerCapacity: 19, cargoCapacityKg: 1800, fuelCapacityLiters: 1260,
    purchasePrice: 5500000, usedPrice: 2400000, maintenanceCostPerHour: 580,
    maintenanceCostPerMonth: 46400, fuelBurnPerHour: 300,
    firstIntroduced: 1969, availableFrom: 1969, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Czech commuter - rugged and reliable'
  },

  {
    manufacturer: 'Nord', model: '262', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 680, cruiseSpeed: 240,
    passengerCapacity: 29, cargoCapacityKg: 2600, fuelCapacityLiters: 2200,
    purchasePrice: 7500000, usedPrice: 3200000, maintenanceCostPerHour: 600,
    maintenanceCostPerMonth: 48000, fuelBurnPerHour: 380,
    firstIntroduced: 1964, availableFrom: 1964, availableUntil: 1976,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'French commuter - pressurized twin'
  },

  {
    manufacturer: 'GAF', model: 'N22', variant: 'Nomad', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 840, cruiseSpeed: 193,
    passengerCapacity: 16, cargoCapacityKg: 1850, fuelCapacityLiters: 1080,
    purchasePrice: 4200000, usedPrice: 1900000, maintenanceCostPerHour: 520,
    maintenanceCostPerMonth: 41600, fuelBurnPerHour: 220,
    firstIntroduced: 1971, availableFrom: 1971, availableUntil: 1984,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Australian utility - STOL capability'
  },

  {
    manufacturer: 'Partenavia', model: 'P.68', variant: 'Observer', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 940, cruiseSpeed: 174,
    passengerCapacity: 6, cargoCapacityKg: 550, fuelCapacityLiters: 380,
    purchasePrice: 1200000, usedPrice: 550000, maintenanceCostPerHour: 250,
    maintenanceCostPerMonth: 20000, fuelBurnPerHour: 90,
    firstIntroduced: 1970, availableFrom: 1970, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Italian light twin - observation/commuter'
  },

  {
    manufacturer: 'Reims-Cessna', model: 'F406', variant: 'Caravan II', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 815, cruiseSpeed: 230,
    passengerCapacity: 14, cargoCapacityKg: 1600, fuelCapacityLiters: 1350,
    purchasePrice: 4500000, usedPrice: 2000000, maintenanceCostPerHour: 540,
    maintenanceCostPerMonth: 43200, fuelBurnPerHour: 230,
    firstIntroduced: 1985, availableFrom: 1985, availableUntil: 1994,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'French-built twin - light commuter'
  },

  // ========================================
  // 1970s ERA - WIDEBODY REVOLUTION
  // ========================================

  {
    manufacturer: 'Boeing', model: '747', variant: '100', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 5300, cruiseSpeed: 490,
    passengerCapacity: 366, cargoCapacityKg: 40000, fuelCapacityLiters: 183380,
    purchasePrice: 180000000, usedPrice: 80000000, maintenanceCostPerHour: 3500,
    maintenanceCostPerMonth: 315000, fuelBurnPerHour: 11500,
    firstIntroduced: 1970, availableFrom: 1970, availableUntil: 1993,
    requiredPilots: 3, requiredCabinCrew: 8, isActive: true,
    description: 'Queen of the Skies - revolutionary jumbo jet'
  },

  {
    manufacturer: 'McDonnell Douglas', model: 'DC-10', variant: '30', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 5200, cruiseSpeed: 490,
    passengerCapacity: 380, cargoCapacityKg: 35000, fuelCapacityLiters: 138710,
    purchasePrice: 150000000, usedPrice: 65000000, maintenanceCostPerHour: 3200,
    maintenanceCostPerMonth: 288000, fuelBurnPerHour: 9800,
    firstIntroduced: 1971, availableFrom: 1971, availableUntil: 2000,
    requiredPilots: 3, requiredCabinCrew: 7, isActive: true,
    description: 'Tri-jet widebody - competed with 747'
  },

  {
    manufacturer: 'Lockheed', model: 'L-1011', variant: 'TriStar', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 4850, cruiseSpeed: 495,
    passengerCapacity: 400, cargoCapacityKg: 36000, fuelCapacityLiters: 155770,
    purchasePrice: 160000000, usedPrice: 70000000, maintenanceCostPerHour: 3300,
    maintenanceCostPerMonth: 297000, fuelBurnPerHour: 10200,
    firstIntroduced: 1972, availableFrom: 1972, availableUntil: 1984,
    requiredPilots: 3, requiredCabinCrew: 7, isActive: true,
    description: 'Advanced tri-jet with sophisticated systems'
  },

  {
    manufacturer: 'Airbus', model: 'A300', variant: 'B4', type: 'Widebody',
    rangeCategory: 'Medium Haul', rangeNm: 3900, cruiseSpeed: 470,
    passengerCapacity: 266, cargoCapacityKg: 28000, fuelCapacityLiters: 62900,
    purchasePrice: 85000000, usedPrice: 35000000, maintenanceCostPerHour: 2400,
    maintenanceCostPerMonth: 192000, fuelBurnPerHour: 5800,
    firstIntroduced: 1974, availableFrom: 1974, availableUntil: 2007,
    requiredPilots: 3, requiredCabinCrew: 5, isActive: true,
    description: 'First Airbus - twin-engine widebody pioneer'
  },

  {
    manufacturer: 'Aerospatiale-BAC', model: 'Concorde', variant: null, type: 'Narrowbody',
    rangeCategory: 'Long Haul', rangeNm: 3900, cruiseSpeed: 1350,
    passengerCapacity: 100, cargoCapacityKg: 2500, fuelCapacityLiters: 119500,
    purchasePrice: 280000000, usedPrice: 150000000, maintenanceCostPerHour: 8000,
    maintenanceCostPerMonth: 640000, fuelBurnPerHour: 25600,
    firstIntroduced: 1976, availableFrom: 1976, availableUntil: 2003,
    requiredPilots: 3, requiredCabinCrew: 4, isActive: true,
    description: 'Supersonic legend - flew at Mach 2.04'
  },

  {
    manufacturer: 'Boeing', model: '737', variant: '300', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 2800, cruiseSpeed: 450,
    passengerCapacity: 149, cargoCapacityKg: 10000, fuelCapacityLiters: 23800,
    purchasePrice: 38000000, usedPrice: 16000000, maintenanceCostPerHour: 1500,
    maintenanceCostPerMonth: 120000, fuelBurnPerHour: 2900,
    firstIntroduced: 1984, availableFrom: 1984, availableUntil: 2008,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: '737 Classic - stretched and improved'
  },

  // Soviet - 1970s
  {
    manufacturer: 'Ilyushin', model: 'Il-86', variant: null, type: 'Widebody',
    rangeCategory: 'Medium Haul', rangeNm: 2400, cruiseSpeed: 475,
    passengerCapacity: 350, cargoCapacityKg: 30000, fuelCapacityLiters: 103000,
    purchasePrice: 95000000, usedPrice: 40000000, maintenanceCostPerHour: 2800,
    maintenanceCostPerMonth: 224000, fuelBurnPerHour: 9500,
    firstIntroduced: 1976, availableFrom: 1976, availableUntil: 2011,
    requiredPilots: 3, requiredCabinCrew: 7, isActive: true,
    description: 'Soviet widebody - unique lower deck boarding'
  },

  {
    manufacturer: 'Yakovlev', model: 'Yak-42', variant: null, type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 1300, cruiseSpeed: 460,
    passengerCapacity: 120, cargoCapacityKg: 8000, fuelCapacityLiters: 15000,
    purchasePrice: 26000000, usedPrice: 11000000, maintenanceCostPerHour: 1400,
    maintenanceCostPerMonth: 112000, fuelBurnPerHour: 2700,
    firstIntroduced: 1975, availableFrom: 1975, availableUntil: 2003,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'Soviet tri-jet - Tu-134 replacement'
  },

  // Turboprops - 1970s
  {
    manufacturer: 'Fokker', model: 'F27', variant: 'Friendship', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1100, cruiseSpeed: 280,
    passengerCapacity: 52, cargoCapacityKg: 6000, fuelCapacityLiters: 5730,
    purchasePrice: 14000000, usedPrice: 6000000, maintenanceCostPerHour: 850,
    maintenanceCostPerMonth: 68000, fuelBurnPerHour: 650,
    firstIntroduced: 1958, availableFrom: 1958, availableUntil: 1987,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Popular turboprop - extremely successful regional aircraft'
  },

  {
    manufacturer: 'de Havilland Canada', model: 'DHC-6', variant: 'Twin Otter', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 770, cruiseSpeed: 182,
    passengerCapacity: 19, cargoCapacityKg: 1800, fuelCapacityLiters: 1135,
    purchasePrice: 6500000, usedPrice: 3000000, maintenanceCostPerHour: 600,
    maintenanceCostPerMonth: 48000, fuelBurnPerHour: 350,
    firstIntroduced: 1965, availableFrom: 1965, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'STOL utility turboprop - legendary reliability'
  },

  {
    manufacturer: 'de Havilland Canada', model: 'DHC-7', variant: 'Dash 7', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 800, cruiseSpeed: 215,
    passengerCapacity: 54, cargoCapacityKg: 5000, fuelCapacityLiters: 5700,
    purchasePrice: 16000000, usedPrice: 7000000, maintenanceCostPerHour: 950,
    maintenanceCostPerMonth: 76000, fuelBurnPerHour: 900,
    firstIntroduced: 1975, availableFrom: 1975, availableUntil: 1988,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Quiet STOL turboprop - city airport specialist'
  },

  // More Small Props - 1970s
  {
    manufacturer: 'Britten-Norman', model: 'BN-2A', variant: 'Trislander', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1000, cruiseSpeed: 180,
    passengerCapacity: 18, cargoCapacityKg: 1800, fuelCapacityLiters: 900,
    purchasePrice: 4200000, usedPrice: 1800000, maintenanceCostPerHour: 480,
    maintenanceCostPerMonth: 38400, fuelBurnPerHour: 220,
    firstIntroduced: 1970, availableFrom: 1970, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Three-engine Islander - unique configuration'
  },

  {
    manufacturer: 'Shorts', model: 'SC.7', variant: 'Skyvan', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 600, cruiseSpeed: 203,
    passengerCapacity: 19, cargoCapacityKg: 2100, fuelCapacityLiters: 1360,
    purchasePrice: 5000000, usedPrice: 2200000, maintenanceCostPerHour: 540,
    maintenanceCostPerMonth: 43200, fuelBurnPerHour: 280,
    firstIntroduced: 1963, availableFrom: 1963, availableUntil: 1986,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Box-shaped utility aircraft - rugged design'
  },

  {
    manufacturer: 'CASA', model: 'C-212', variant: 'Aviocar', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 930, cruiseSpeed: 215,
    passengerCapacity: 26, cargoCapacityKg: 2700, fuelCapacityLiters: 2100,
    purchasePrice: 7000000, usedPrice: 3100000, maintenanceCostPerHour: 620,
    maintenanceCostPerMonth: 49600, fuelBurnPerHour: 350,
    firstIntroduced: 1971, availableFrom: 1971, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Spanish utility turboprop - robust construction'
  },

  {
    manufacturer: 'Embraer', model: 'EMB 110', variant: 'Bandeirante', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1100, cruiseSpeed: 240,
    passengerCapacity: 21, cargoCapacityKg: 1800, fuelCapacityLiters: 1420,
    purchasePrice: 5500000, usedPrice: 2400000, maintenanceCostPerHour: 560,
    maintenanceCostPerMonth: 44800, fuelBurnPerHour: 290,
    firstIntroduced: 1972, availableFrom: 1972, availableUntil: 1990,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Brazilian commuter - very successful'
  },

  {
    manufacturer: 'Piper', model: 'PA-31', variant: 'Navajo Chieftain', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 830, cruiseSpeed: 210,
    passengerCapacity: 9, cargoCapacityKg: 850, fuelCapacityLiters: 640,
    purchasePrice: 2500000, usedPrice: 1100000, maintenanceCostPerHour: 380,
    maintenanceCostPerMonth: 30400, fuelBurnPerHour: 180,
    firstIntroduced: 1972, availableFrom: 1972, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Twin piston commuter - affordable operations'
  },

  {
    manufacturer: 'Pilatus', model: 'PC-6', variant: 'Porter', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 460, cruiseSpeed: 150,
    passengerCapacity: 10, cargoCapacityKg: 1200, fuelCapacityLiters: 450,
    purchasePrice: 3000000, usedPrice: 1300000, maintenanceCostPerHour: 420,
    maintenanceCostPerMonth: 33600, fuelBurnPerHour: 140,
    firstIntroduced: 1959, availableFrom: 1959, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Swiss STOL utility aircraft - mountain specialist'
  },

  {
    manufacturer: 'Cessna', model: '208', variant: 'Caravan', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 960, cruiseSpeed: 185,
    passengerCapacity: 14, cargoCapacityKg: 1600, fuelCapacityLiters: 1340,
    purchasePrice: 3500000, usedPrice: 1600000, maintenanceCostPerHour: 450,
    maintenanceCostPerMonth: 36000, fuelBurnPerHour: 180,
    firstIntroduced: 1982, availableFrom: 1982, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Utility turboprop - workhorse of bush aviation'
  },

  {
    manufacturer: 'Harbin', model: 'Y-12', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 560, cruiseSpeed: 127,
    passengerCapacity: 17, cargoCapacityKg: 1700, fuelCapacityLiters: 980,
    purchasePrice: 3500000, usedPrice: 1600000, maintenanceCostPerHour: 440,
    maintenanceCostPerMonth: 35200, fuelBurnPerHour: 180,
    firstIntroduced: 1985, availableFrom: 1985, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Chinese utility twin - simple and rugged'
  },

  {
    manufacturer: 'de Havilland Canada', model: 'DHC-2', variant: 'Turbo Beaver', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 455, cruiseSpeed: 135,
    passengerCapacity: 8, cargoCapacityKg: 900, fuelCapacityLiters: 380,
    purchasePrice: 1800000, usedPrice: 900000, maintenanceCostPerHour: 320,
    maintenanceCostPerMonth: 25600, fuelBurnPerHour: 110,
    firstIntroduced: 1963, availableFrom: 1970, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Turboprop conversion of classic Beaver - STOL legend'
  },

  {
    manufacturer: 'de Havilland Canada', model: 'DHC-3', variant: 'Otter', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 600, cruiseSpeed: 138,
    passengerCapacity: 10, cargoCapacityKg: 1100, fuelCapacityLiters: 550,
    purchasePrice: 2200000, usedPrice: 1000000, maintenanceCostPerHour: 350,
    maintenanceCostPerMonth: 28000, fuelBurnPerHour: 130,
    firstIntroduced: 1951, availableFrom: 1970, availableUntil: 1967,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Larger Beaver - bush flying workhorse'
  },

  // ========================================
  // 1980s ERA - MODERN EFFICIENCY
  // ========================================

  {
    manufacturer: 'Boeing', model: '757', variant: '200', type: 'Narrowbody',
    rangeCategory: 'Long Haul', rangeNm: 3900, cruiseSpeed: 470,
    passengerCapacity: 200, cargoCapacityKg: 15000, fuelCapacityLiters: 42680,
    purchasePrice: 80000000, usedPrice: 35000000, maintenanceCostPerHour: 1900,
    maintenanceCostPerMonth: 152000, fuelBurnPerHour: 3200,
    firstIntroduced: 1983, availableFrom: 1983, availableUntil: 2005,
    requiredPilots: 2, requiredCabinCrew: 4, isActive: true,
    description: 'Powerful narrowbody - long range capability'
  },

  {
    manufacturer: 'Boeing', model: '767', variant: '300ER', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 6385, cruiseSpeed: 470,
    passengerCapacity: 269, cargoCapacityKg: 32000, fuelCapacityLiters: 91380,
    purchasePrice: 140000000, usedPrice: 60000000, maintenanceCostPerHour: 2600,
    maintenanceCostPerMonth: 234000, fuelBurnPerHour: 5500,
    firstIntroduced: 1982, availableFrom: 1982, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 5, isActive: true,
    description: 'Twin widebody - pioneered ETOPS'
  },

  {
    manufacturer: 'Airbus', model: 'A310', variant: '300', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 5150, cruiseSpeed: 470,
    passengerCapacity: 220, cargoCapacityKg: 25000, fuelCapacityLiters: 68250,
    purchasePrice: 95000000, usedPrice: 40000000, maintenanceCostPerHour: 2300,
    maintenanceCostPerMonth: 184000, fuelBurnPerHour: 5000,
    firstIntroduced: 1983, availableFrom: 1983, availableUntil: 2007,
    requiredPilots: 2, requiredCabinCrew: 4, isActive: true,
    description: 'Shortened A300 - advanced glass cockpit'
  },

  {
    manufacturer: 'Airbus', model: 'A320', variant: '200', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 3300, cruiseSpeed: 470,
    passengerCapacity: 180, cargoCapacityKg: 18000, fuelCapacityLiters: 24210,
    purchasePrice: 95000000, usedPrice: 40000000, maintenanceCostPerHour: 1600,
    maintenanceCostPerMonth: 128000, fuelBurnPerHour: 2500,
    firstIntroduced: 1988, availableFrom: 1988, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 4, isActive: true,
    description: 'Revolutionary fly-by-wire narrowbody'
  },

  {
    manufacturer: 'McDonnell Douglas', model: 'MD-80', variant: '83', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 2900, cruiseSpeed: 460,
    passengerCapacity: 155, cargoCapacityKg: 10000, fuelCapacityLiters: 24760,
    purchasePrice: 42000000, usedPrice: 18000000, maintenanceCostPerHour: 1500,
    maintenanceCostPerMonth: 120000, fuelBurnPerHour: 3000,
    firstIntroduced: 1980, availableFrom: 1980, availableUntil: 1999,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'Stretched DC-9 - very popular in 1980s'
  },

  {
    manufacturer: 'Boeing', model: '747', variant: '400', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 7260, cruiseSpeed: 493,
    passengerCapacity: 416, cargoCapacityKg: 45000, fuelCapacityLiters: 216840,
    purchasePrice: 260000000, usedPrice: 120000000, maintenanceCostPerHour: 4000,
    maintenanceCostPerMonth: 360000, fuelBurnPerHour: 12000,
    firstIntroduced: 1989, availableFrom: 1989, availableUntil: 2018,
    requiredPilots: 2, requiredCabinCrew: 9, isActive: true,
    description: 'Improved 747 - glass cockpit, winglets'
  },

  {
    manufacturer: 'BAe', model: '146', variant: '300', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1480, cruiseSpeed: 436,
    passengerCapacity: 112, cargoCapacityKg: 8000, fuelCapacityLiters: 11070,
    purchasePrice: 28000000, usedPrice: 12000000, maintenanceCostPerHour: 1350,
    maintenanceCostPerMonth: 108000, fuelBurnPerHour: 2200,
    firstIntroduced: 1988, availableFrom: 1988, availableUntil: 2002,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'British quad-jet - very quiet, city airport specialist'
  },

  {
    manufacturer: 'Fokker', model: '100', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1400, cruiseSpeed: 442,
    passengerCapacity: 109, cargoCapacityKg: 7500, fuelCapacityLiters: 13365,
    purchasePrice: 26000000, usedPrice: 11000000, maintenanceCostPerHour: 1300,
    maintenanceCostPerMonth: 104000, fuelBurnPerHour: 2100,
    firstIntroduced: 1988, availableFrom: 1988, availableUntil: 1997,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'Stretched F28 - last Fokker jet'
  },

  {
    manufacturer: 'Fokker', model: '70', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1500, cruiseSpeed: 442,
    passengerCapacity: 80, cargoCapacityKg: 6000, fuelCapacityLiters: 10260,
    purchasePrice: 22000000, usedPrice: 9500000, maintenanceCostPerHour: 1200,
    maintenanceCostPerMonth: 96000, fuelBurnPerHour: 1900,
    firstIntroduced: 1994, availableFrom: 1994, availableUntil: 1997,
    requiredPilots: 2, requiredCabinCrew: 2, isActive: true,
    description: 'Shortened F100 - efficient regional jet'
  },

  // Turboprops - 1980s
  {
    manufacturer: 'ATR', model: 'ATR 42', variant: '500', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 800, cruiseSpeed: 300,
    passengerCapacity: 50, cargoCapacityKg: 5000, fuelCapacityLiters: 4500,
    purchasePrice: 18000000, usedPrice: 8000000, maintenanceCostPerHour: 750,
    maintenanceCostPerMonth: 60000, fuelBurnPerHour: 550,
    firstIntroduced: 1984, availableFrom: 1984, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'French-Italian turboprop - fuel efficient'
  },

  {
    manufacturer: 'ATR', model: 'ATR 72', variant: '600', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 900, cruiseSpeed: 320,
    passengerCapacity: 78, cargoCapacityKg: 7500, fuelCapacityLiters: 5000,
    purchasePrice: 27000000, usedPrice: 12000000, maintenanceCostPerHour: 850,
    maintenanceCostPerMonth: 68000, fuelBurnPerHour: 650,
    firstIntroduced: 1989, availableFrom: 1989, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Stretched ATR 42 - world\'s best-selling turboprop'
  },

  {
    manufacturer: 'de Havilland Canada', model: 'DHC-8', variant: 'Dash 8-100', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1000, cruiseSpeed: 310,
    passengerCapacity: 39, cargoCapacityKg: 3500, fuelCapacityLiters: 3400,
    purchasePrice: 15000000, usedPrice: 6500000, maintenanceCostPerHour: 700,
    maintenanceCostPerMonth: 56000, fuelBurnPerHour: 500,
    firstIntroduced: 1984, availableFrom: 1984, availableUntil: 2005,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Quiet turboprop - Active Noise and Vibration Suppression'
  },

  {
    manufacturer: 'de Havilland Canada', model: 'DHC-8', variant: 'Dash 8-300', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 950, cruiseSpeed: 328,
    passengerCapacity: 56, cargoCapacityKg: 5000, fuelCapacityLiters: 4500,
    purchasePrice: 19000000, usedPrice: 8500000, maintenanceCostPerHour: 800,
    maintenanceCostPerMonth: 64000, fuelBurnPerHour: 600,
    firstIntroduced: 1989, availableFrom: 1989, availableUntil: 2009,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Stretched Dash 8 - quiet and efficient'
  },

  {
    manufacturer: 'Saab', model: '340', variant: 'B', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 930, cruiseSpeed: 285,
    passengerCapacity: 36, cargoCapacityKg: 3500, fuelCapacityLiters: 3200,
    purchasePrice: 13000000, usedPrice: 5500000, maintenanceCostPerHour: 650,
    maintenanceCostPerMonth: 52000, fuelBurnPerHour: 450,
    firstIntroduced: 1983, availableFrom: 1983, availableUntil: 1999,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Swedish regional turboprop - reliable and efficient'
  },

  {
    manufacturer: 'Saab', model: '2000', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1300, cruiseSpeed: 370,
    passengerCapacity: 58, cargoCapacityKg: 5000, fuelCapacityLiters: 5600,
    purchasePrice: 21000000, usedPrice: 9000000, maintenanceCostPerHour: 900,
    maintenanceCostPerMonth: 72000, fuelBurnPerHour: 700,
    firstIntroduced: 1992, availableFrom: 1992, availableUntil: 1999,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Fast turboprop - fastest commercial turboprop'
  },

  {
    manufacturer: 'British Aerospace', model: 'ATP', variant: 'Advanced Turboprop', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 930, cruiseSpeed: 270,
    passengerCapacity: 72, cargoCapacityKg: 6500, fuelCapacityLiters: 6000,
    purchasePrice: 20000000, usedPrice: 8500000, maintenanceCostPerHour: 850,
    maintenanceCostPerMonth: 68000, fuelBurnPerHour: 750,
    firstIntroduced: 1988, availableFrom: 1988, availableUntil: 1996,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Advanced turboprop - quiet and spacious cabin'
  },

  {
    manufacturer: 'Fokker', model: '50', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1180, cruiseSpeed: 282,
    passengerCapacity: 58, cargoCapacityKg: 5500, fuelCapacityLiters: 5170,
    purchasePrice: 17000000, usedPrice: 7500000, maintenanceCostPerHour: 800,
    maintenanceCostPerMonth: 64000, fuelBurnPerHour: 650,
    firstIntroduced: 1987, availableFrom: 1987, availableUntil: 1997,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Modern F27 - glass cockpit upgrade'
  },

  // Small Props - 1980s
  {
    manufacturer: 'Dornier', model: '228', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 730, cruiseSpeed: 225,
    passengerCapacity: 19, cargoCapacityKg: 2000, fuelCapacityLiters: 1100,
    purchasePrice: 5800000, usedPrice: 2500000, maintenanceCostPerHour: 590,
    maintenanceCostPerMonth: 47200, fuelBurnPerHour: 280,
    firstIntroduced: 1981, availableFrom: 1981, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'German commuter - STOL capability, still in production'
  },

  {
    manufacturer: 'Shorts', model: '360', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 645, cruiseSpeed: 243,
    passengerCapacity: 36, cargoCapacityKg: 3600, fuelCapacityLiters: 2350,
    purchasePrice: 9500000, usedPrice: 4000000, maintenanceCostPerHour: 620,
    maintenanceCostPerMonth: 49600, fuelBurnPerHour: 420,
    firstIntroduced: 1981, availableFrom: 1981, availableUntil: 1991,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Stretched Shorts 330 - boxy but reliable'
  },

  {
    manufacturer: 'Beechcraft', model: '1900', variant: 'Airliner', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1200, cruiseSpeed: 280,
    passengerCapacity: 19, cargoCapacityKg: 2200, fuelCapacityLiters: 2120,
    purchasePrice: 6200000, usedPrice: 2700000, maintenanceCostPerHour: 600,
    maintenanceCostPerMonth: 48000, fuelBurnPerHour: 340,
    firstIntroduced: 1982, availableFrom: 1982, availableUntil: 2002,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Popular commuter - pressurized, comfortable'
  },

  {
    manufacturer: 'British Aerospace', model: 'Jetstream', variant: '31', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 750, cruiseSpeed: 270,
    passengerCapacity: 19, cargoCapacityKg: 1900, fuelCapacityLiters: 1800,
    purchasePrice: 5700000, usedPrice: 2400000, maintenanceCostPerHour: 580,
    maintenanceCostPerMonth: 46400, fuelBurnPerHour: 310,
    firstIntroduced: 1982, availableFrom: 1982, availableUntil: 1993,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'British commuter - pressurized turboprop'
  },

  {
    manufacturer: 'British Aerospace', model: 'Jetstream', variant: '32', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 750, cruiseSpeed: 270,
    passengerCapacity: 19, cargoCapacityKg: 1900, fuelCapacityLiters: 1800,
    purchasePrice: 6000000, usedPrice: 2600000, maintenanceCostPerHour: 590,
    maintenanceCostPerMonth: 47200, fuelBurnPerHour: 310,
    firstIntroduced: 1988, availableFrom: 1988, availableUntil: 1993,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Improved Jetstream - better avionics'
  },

  {
    manufacturer: 'Embraer', model: 'EMB 120', variant: 'Brasilia', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1000, cruiseSpeed: 290,
    passengerCapacity: 30, cargoCapacityKg: 3200, fuelCapacityLiters: 3050,
    purchasePrice: 8500000, usedPrice: 3700000, maintenanceCostPerHour: 610,
    maintenanceCostPerMonth: 48800, fuelBurnPerHour: 430,
    firstIntroduced: 1983, availableFrom: 1983, availableUntil: 2001,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Brazilian turboprop - very successful commuter'
  },

  {
    manufacturer: 'Fairchild', model: 'Metro', variant: 'III', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 600, cruiseSpeed: 280,
    passengerCapacity: 19, cargoCapacityKg: 2000, fuelCapacityLiters: 1750,
    purchasePrice: 5300000, usedPrice: 2300000, maintenanceCostPerHour: 570,
    maintenanceCostPerMonth: 45600, fuelBurnPerHour: 320,
    firstIntroduced: 1981, availableFrom: 1981, availableUntil: 1998,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Fairchild commuter - fast and efficient'
  },

  {
    manufacturer: 'Swearingen', model: 'SA-227', variant: 'Metro', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 575, cruiseSpeed: 285,
    passengerCapacity: 19, cargoCapacityKg: 1950, fuelCapacityLiters: 1700,
    purchasePrice: 5100000, usedPrice: 2200000, maintenanceCostPerHour: 560,
    maintenanceCostPerMonth: 44800, fuelBurnPerHour: 310,
    firstIntroduced: 1980, availableFrom: 1980, availableUntil: 1991,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Original Metro - corporate shuttle'
  },

  {
    manufacturer: 'Piper', model: 'PA-42', variant: 'Cheyenne III', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1350, cruiseSpeed: 290,
    passengerCapacity: 11, cargoCapacityKg: 1300, fuelCapacityLiters: 1750,
    purchasePrice: 4500000, usedPrice: 2000000, maintenanceCostPerHour: 540,
    maintenanceCostPerMonth: 43200, fuelBurnPerHour: 290,
    firstIntroduced: 1980, availableFrom: 1980, availableUntil: 1993,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Corporate turboprop - used as commuter'
  },

  {
    manufacturer: 'Cessna', model: '441', variant: 'Conquest II', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1550, cruiseSpeed: 285,
    passengerCapacity: 11, cargoCapacityKg: 1400, fuelCapacityLiters: 1900,
    purchasePrice: 4800000, usedPrice: 2100000, maintenanceCostPerHour: 550,
    maintenanceCostPerMonth: 44000, fuelBurnPerHour: 310,
    firstIntroduced: 1977, availableFrom: 1980, availableUntil: 1986,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Cessna turboprop - commuter use'
  },

  // Soviet - 1980s
  {
    manufacturer: 'Ilyushin', model: 'Il-96', variant: '300', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 6000, cruiseSpeed: 480,
    passengerCapacity: 300, cargoCapacityKg: 35000, fuelCapacityLiters: 107000,
    purchasePrice: 140000000, usedPrice: 60000000, maintenanceCostPerHour: 2900,
    maintenanceCostPerMonth: 232000, fuelBurnPerHour: 7800,
    firstIntroduced: 1988, availableFrom: 1988, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 6, isActive: true,
    description: 'Russian widebody - fly-by-wire, glass cockpit'
  },

  // ========================================
  // 1990s ERA - ETOPS & REGIONAL JETS
  // ========================================

  {
    manufacturer: 'Boeing', model: '777', variant: '200ER', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 7065, cruiseSpeed: 490,
    passengerCapacity: 317, cargoCapacityKg: 38000, fuelCapacityLiters: 171170,
    purchasePrice: 250000000, usedPrice: 110000000, maintenanceCostPerHour: 3200,
    maintenanceCostPerMonth: 288000, fuelBurnPerHour: 7500,
    firstIntroduced: 1995, availableFrom: 1995, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 6, isActive: true,
    description: 'First fly-by-wire Boeing - largest twin jet'
  },

  {
    manufacturer: 'Boeing', model: '777', variant: '300ER', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 7370, cruiseSpeed: 490,
    passengerCapacity: 396, cargoCapacityKg: 42000, fuelCapacityLiters: 181280,
    purchasePrice: 320000000, usedPrice: 160000000, maintenanceCostPerHour: 3400,
    maintenanceCostPerMonth: 306000, fuelBurnPerHour: 7900,
    firstIntroduced: 2004, availableFrom: 2004, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 8, isActive: true,
    description: 'Stretched 777 - ultra long range'
  },

  {
    manufacturer: 'Airbus', model: 'A330', variant: '300', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 6350, cruiseSpeed: 470,
    passengerCapacity: 335, cargoCapacityKg: 42000, fuelCapacityLiters: 139090,
    purchasePrice: 220000000, usedPrice: 95000000, maintenanceCostPerHour: 2900,
    maintenanceCostPerMonth: 261000, fuelBurnPerHour: 6400,
    firstIntroduced: 1993, availableFrom: 1993, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 6, isActive: true,
    description: 'Twin widebody - shares commonality with A340'
  },

  {
    manufacturer: 'Airbus', model: 'A340', variant: '300', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 7400, cruiseSpeed: 470,
    passengerCapacity: 295, cargoCapacityKg: 38000, fuelCapacityLiters: 147850,
    purchasePrice: 240000000, usedPrice: 100000000, maintenanceCostPerHour: 3100,
    maintenanceCostPerMonth: 279000, fuelBurnPerHour: 8800,
    firstIntroduced: 1993, availableFrom: 1993, availableUntil: 2011,
    requiredPilots: 2, requiredCabinCrew: 6, isActive: true,
    description: 'Four-engine long hauler - ultra long range'
  },

  {
    manufacturer: 'McDonnell Douglas', model: 'MD-11', variant: null, type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 7240, cruiseSpeed: 490,
    passengerCapacity: 323, cargoCapacityKg: 42000, fuelCapacityLiters: 146210,
    purchasePrice: 200000000, usedPrice: 85000000, maintenanceCostPerHour: 3000,
    maintenanceCostPerMonth: 270000, fuelBurnPerHour: 8600,
    firstIntroduced: 1990, availableFrom: 1990, availableUntil: 2000,
    requiredPilots: 2, requiredCabinCrew: 6, isActive: true,
    description: 'Stretched DC-10 - last McDonnell Douglas jet'
  },

  {
    manufacturer: 'Boeing', model: '737', variant: '800', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 3115, cruiseSpeed: 475,
    passengerCapacity: 189, cargoCapacityKg: 12000, fuelCapacityLiters: 26020,
    purchasePrice: 90000000, usedPrice: 40000000, maintenanceCostPerHour: 1700,
    maintenanceCostPerMonth: 136000, fuelBurnPerHour: 2600,
    firstIntroduced: 1998, availableFrom: 1998, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 4, isActive: true,
    description: '737 Next Generation - modern avionics'
  },

  {
    manufacturer: 'Boeing', model: '737', variant: '900ER', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 3200, cruiseSpeed: 475,
    passengerCapacity: 220, cargoCapacityKg: 13000, fuelCapacityLiters: 29660,
    purchasePrice: 100000000, usedPrice: 48000000, maintenanceCostPerHour: 1800,
    maintenanceCostPerMonth: 144000, fuelBurnPerHour: 2750,
    firstIntroduced: 2006, availableFrom: 2006, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 4, isActive: true,
    description: 'Longest 737 - extended range'
  },

  {
    manufacturer: 'Airbus', model: 'A319', variant: null, type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 3750, cruiseSpeed: 470,
    passengerCapacity: 156, cargoCapacityKg: 15000, fuelCapacityLiters: 24210,
    purchasePrice: 85000000, usedPrice: 38000000, maintenanceCostPerHour: 1500,
    maintenanceCostPerMonth: 120000, fuelBurnPerHour: 2400,
    firstIntroduced: 1996, availableFrom: 1996, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'Shortened A320 - long range for size'
  },

  {
    manufacturer: 'Airbus', model: 'A321', variant: null, type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 3200, cruiseSpeed: 470,
    passengerCapacity: 220, cargoCapacityKg: 19000, fuelCapacityLiters: 30190,
    purchasePrice: 110000000, usedPrice: 52000000, maintenanceCostPerHour: 1750,
    maintenanceCostPerMonth: 140000, fuelBurnPerHour: 2650,
    firstIntroduced: 1994, availableFrom: 1994, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 4, isActive: true,
    description: 'Stretched A320 - most successful A320 variant'
  },

  // Small Props & Turboprops - 1990s
  {
    manufacturer: 'British Aerospace', model: 'Jetstream', variant: '41', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 835, cruiseSpeed: 300,
    passengerCapacity: 29, cargoCapacityKg: 2800, fuelCapacityLiters: 2660,
    purchasePrice: 8200000, usedPrice: 3500000, maintenanceCostPerHour: 610,
    maintenanceCostPerMonth: 48800, fuelBurnPerHour: 420,
    firstIntroduced: 1991, availableFrom: 1991, availableUntil: 1997,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Final Jetstream - stretched and improved'
  },

  {
    manufacturer: 'Fairchild', model: '328', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 675, cruiseSpeed: 335,
    passengerCapacity: 33, cargoCapacityKg: 3300, fuelCapacityLiters: 2800,
    purchasePrice: 9500000, usedPrice: 4000000, maintenanceCostPerHour: 630,
    maintenanceCostPerMonth: 50400, fuelBurnPerHour: 480,
    firstIntroduced: 1991, availableFrom: 1991, availableUntil: 2000,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'German-American turboprop - modern design'
  },

  {
    manufacturer: 'Dornier', model: '328', variant: 'Turboprop', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 755, cruiseSpeed: 335,
    passengerCapacity: 33, cargoCapacityKg: 3400, fuelCapacityLiters: 2900,
    purchasePrice: 9800000, usedPrice: 4200000, maintenanceCostPerHour: 640,
    maintenanceCostPerMonth: 51200, fuelBurnPerHour: 490,
    firstIntroduced: 1993, availableFrom: 1993, availableUntil: 2000,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Dornier commuter - advanced for era'
  },

  {
    manufacturer: 'Raytheon', model: 'Beech 1900D', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1200, cruiseSpeed: 285,
    passengerCapacity: 19, cargoCapacityKg: 2300, fuelCapacityLiters: 2200,
    purchasePrice: 6500000, usedPrice: 2800000, maintenanceCostPerHour: 610,
    maintenanceCostPerMonth: 48800, fuelBurnPerHour: 350,
    firstIntroduced: 1990, availableFrom: 1990, availableUntil: 2002,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Improved 1900 - stand-up cabin'
  },

  {
    manufacturer: 'Cessna', model: '208B', variant: 'Grand Caravan', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1070, cruiseSpeed: 185,
    passengerCapacity: 14, cargoCapacityKg: 1800, fuelCapacityLiters: 1513,
    purchasePrice: 3800000, usedPrice: 1700000, maintenanceCostPerHour: 460,
    maintenanceCostPerMonth: 36800, fuelBurnPerHour: 195,
    firstIntroduced: 1990, availableFrom: 1990, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Stretched Caravan - utility workhorse'
  },

  {
    manufacturer: 'Viking Air', model: 'DHC-6', variant: 'Twin Otter Series 400', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 750, cruiseSpeed: 180,
    passengerCapacity: 19, cargoCapacityKg: 2100, fuelCapacityLiters: 1420,
    purchasePrice: 5500000, usedPrice: 2400000, maintenanceCostPerHour: 570,
    maintenanceCostPerMonth: 45600, fuelBurnPerHour: 250,
    firstIntroduced: 2010, availableFrom: 2010, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Reborn Twin Otter - modern production'
  },

  {
    manufacturer: 'Pilatus', model: 'PC-12', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1560, cruiseSpeed: 285,
    passengerCapacity: 11, cargoCapacityKg: 1200, fuelCapacityLiters: 1800,
    purchasePrice: 4800000, usedPrice: 2100000, maintenanceCostPerHour: 550,
    maintenanceCostPerMonth: 44000, fuelBurnPerHour: 290,
    firstIntroduced: 1991, availableFrom: 1991, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Swiss single turboprop - very versatile'
  },

  {
    manufacturer: 'Quest', model: 'Kodiak', variant: '100', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1015, cruiseSpeed: 183,
    passengerCapacity: 10, cargoCapacityKg: 1400, fuelCapacityLiters: 1430,
    purchasePrice: 3500000, usedPrice: 1600000, maintenanceCostPerHour: 450,
    maintenanceCostPerMonth: 36000, fuelBurnPerHour: 200,
    firstIntroduced: 2007, availableFrom: 2007, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'STOL utility - mission work'
  },

  {
    manufacturer: 'Pacific Aerospace', model: 'PAC 750XL', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 680, cruiseSpeed: 150,
    passengerCapacity: 9, cargoCapacityKg: 1700, fuelCapacityLiters: 900,
    purchasePrice: 2500000, usedPrice: 1100000, maintenanceCostPerHour: 380,
    maintenanceCostPerMonth: 30400, fuelBurnPerHour: 160,
    firstIntroduced: 2001, availableFrom: 2001, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'New Zealand utility - extreme STOL'
  },

  {
    manufacturer: 'GippsAero', model: 'GA8', variant: 'Airvan', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 800, cruiseSpeed: 125,
    passengerCapacity: 8, cargoCapacityKg: 900, fuelCapacityLiters: 460,
    purchasePrice: 1800000, usedPrice: 800000, maintenanceCostPerHour: 320,
    maintenanceCostPerMonth: 25600, fuelBurnPerHour: 95,
    firstIntroduced: 2000, availableFrom: 2000, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Australian light utility - bush operations'
  },

  // Regional Jets - 1990s
  {
    manufacturer: 'Bombardier', model: 'CRJ-200', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1700, cruiseSpeed: 450,
    passengerCapacity: 50, cargoCapacityKg: 3000, fuelCapacityLiters: 5270,
    purchasePrice: 23000000, usedPrice: 10000000, maintenanceCostPerHour: 900,
    maintenanceCostPerMonth: 72000, fuelBurnPerHour: 1000,
    firstIntroduced: 1992, availableFrom: 1992, availableUntil: 2006,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Popular regional jet - launched RJ revolution'
  },

  {
    manufacturer: 'Bombardier', model: 'CRJ-700', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1600, cruiseSpeed: 450,
    passengerCapacity: 78, cargoCapacityKg: 4500, fuelCapacityLiters: 10600,
    purchasePrice: 35000000, usedPrice: 15000000, maintenanceCostPerHour: 1000,
    maintenanceCostPerMonth: 80000, fuelBurnPerHour: 1400,
    firstIntroduced: 2001, availableFrom: 2001, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 2, isActive: true,
    description: 'Stretched CRJ - popular regional jet'
  },

  {
    manufacturer: 'Bombardier', model: 'CRJ-900', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1550, cruiseSpeed: 450,
    passengerCapacity: 90, cargoCapacityKg: 5000, fuelCapacityLiters: 12500,
    purchasePrice: 42000000, usedPrice: 19000000, maintenanceCostPerHour: 1100,
    maintenanceCostPerMonth: 88000, fuelBurnPerHour: 1550,
    firstIntroduced: 2003, availableFrom: 2003, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 2, isActive: true,
    description: 'Largest CRJ - efficient regional operations'
  },

  {
    manufacturer: 'Embraer', model: 'ERJ 145', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1550, cruiseSpeed: 450,
    passengerCapacity: 50, cargoCapacityKg: 3000, fuelCapacityLiters: 5260,
    purchasePrice: 20000000, usedPrice: 8000000, maintenanceCostPerHour: 800,
    maintenanceCostPerMonth: 64000, fuelBurnPerHour: 900,
    firstIntroduced: 1996, availableFrom: 1996, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 2, isActive: true,
    description: 'Brazilian regional jet - very successful'
  },

  {
    manufacturer: 'Embraer', model: 'E-170', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 2200, cruiseSpeed: 460,
    passengerCapacity: 80, cargoCapacityKg: 6000, fuelCapacityLiters: 9400,
    purchasePrice: 38000000, usedPrice: 17000000, maintenanceCostPerHour: 1050,
    maintenanceCostPerMonth: 84000, fuelBurnPerHour: 1500,
    firstIntroduced: 2004, availableFrom: 2004, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 2, isActive: true,
    description: 'E-Jet family - comfortable regional jet'
  },

  {
    manufacturer: 'Embraer', model: 'E-175', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 2200, cruiseSpeed: 460,
    passengerCapacity: 88, cargoCapacityKg: 6500, fuelCapacityLiters: 10100,
    purchasePrice: 43000000, usedPrice: 20000000, maintenanceCostPerHour: 1100,
    maintenanceCostPerMonth: 88000, fuelBurnPerHour: 1600,
    firstIntroduced: 2005, availableFrom: 2005, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 2, isActive: true,
    description: 'Stretched E-170 - best-selling E-Jet'
  },

  {
    manufacturer: 'Embraer', model: 'E-190', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 2400, cruiseSpeed: 460,
    passengerCapacity: 114, cargoCapacityKg: 10000, fuelCapacityLiters: 12970,
    purchasePrice: 50000000, usedPrice: 24000000, maintenanceCostPerHour: 1150,
    maintenanceCostPerMonth: 92000, fuelBurnPerHour: 1750,
    firstIntroduced: 2005, availableFrom: 2005, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'Larger E-Jet - bridges regional and narrowbody'
  },

  // Turboprops - 1990s
  {
    manufacturer: 'de Havilland Canada', model: 'DHC-8', variant: 'Dash 8-400', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1200, cruiseSpeed: 360,
    passengerCapacity: 78, cargoCapacityKg: 7500, fuelCapacityLiters: 6526,
    purchasePrice: 31000000, usedPrice: 14000000, maintenanceCostPerHour: 950,
    maintenanceCostPerMonth: 76000, fuelBurnPerHour: 750,
    firstIntroduced: 1999, availableFrom: 1999, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Q400 - fastest turboprop, jet-like speeds'
  },

  // Russian/Soviet - 1990s
  {
    manufacturer: 'Antonov', model: 'An-148', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 2100, cruiseSpeed: 460,
    passengerCapacity: 85, cargoCapacityKg: 7500, fuelCapacityLiters: 11800,
    purchasePrice: 32000000, usedPrice: 14000000, maintenanceCostPerHour: 1050,
    maintenanceCostPerMonth: 84000, fuelBurnPerHour: 1600,
    firstIntroduced: 2009, availableFrom: 2009, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 2, isActive: true,
    description: 'Ukrainian regional jet - modern Russian design'
  },

  {
    manufacturer: 'Tupolev', model: 'Tu-204', variant: null, type: 'Narrowbody',
    rangeCategory: 'Medium Haul', rangeNm: 3900, cruiseSpeed: 480,
    passengerCapacity: 210, cargoCapacityKg: 17000, fuelCapacityLiters: 36000,
    purchasePrice: 70000000, usedPrice: 30000000, maintenanceCostPerHour: 1900,
    maintenanceCostPerMonth: 152000, fuelBurnPerHour: 3800,
    firstIntroduced: 1989, availableFrom: 1989, availableUntil: 2011,
    requiredPilots: 2, requiredCabinCrew: 4, isActive: true,
    description: 'Russian narrowbody - fly-by-wire, glass cockpit'
  },

  // ========================================
  // 2000s ERA - NEXT GENERATION
  // ========================================

  {
    manufacturer: 'Airbus', model: 'A380', variant: '800', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 8000, cruiseSpeed: 488,
    passengerCapacity: 525, cargoCapacityKg: 66000, fuelCapacityLiters: 323546,
    purchasePrice: 450000000, usedPrice: 250000000, maintenanceCostPerHour: 5000,
    maintenanceCostPerMonth: 450000, fuelBurnPerHour: 14500,
    firstIntroduced: 2007, availableFrom: 2007, availableUntil: 2021,
    requiredPilots: 2, requiredCabinCrew: 12, isActive: true,
    description: 'Largest passenger aircraft - superjumbo'
  },

  {
    manufacturer: 'Boeing', model: '787', variant: '8', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 7355, cruiseSpeed: 488,
    passengerCapacity: 242, cargoCapacityKg: 38000, fuelCapacityLiters: 126206,
    purchasePrice: 248000000, usedPrice: 140000000, maintenanceCostPerHour: 2700,
    maintenanceCostPerMonth: 243000, fuelBurnPerHour: 5200,
    firstIntroduced: 2011, availableFrom: 2011, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 5, isActive: true,
    description: 'Dreamliner - composite construction'
  },

  {
    manufacturer: 'Boeing', model: '787', variant: '9', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 7635, cruiseSpeed: 488,
    passengerCapacity: 296, cargoCapacityKg: 45000, fuelCapacityLiters: 126372,
    purchasePrice: 280000000, usedPrice: 180000000, maintenanceCostPerHour: 2800,
    maintenanceCostPerMonth: 252000, fuelBurnPerHour: 5400,
    firstIntroduced: 2014, availableFrom: 2014, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 6, isActive: true,
    description: 'Stretched Dreamliner - most popular variant'
  },

  {
    manufacturer: 'Boeing', model: '787', variant: '10', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 6430, cruiseSpeed: 488,
    passengerCapacity: 330, cargoCapacityKg: 48000, fuelCapacityLiters: 126372,
    purchasePrice: 325000000, usedPrice: 220000000, maintenanceCostPerHour: 2950,
    maintenanceCostPerMonth: 265500, fuelBurnPerHour: 5600,
    firstIntroduced: 2018, availableFrom: 2018, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 7, isActive: true,
    description: 'Longest Dreamliner - maximum capacity'
  },

  {
    manufacturer: 'Airbus', model: 'A350', variant: '900', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 8100, cruiseSpeed: 487,
    passengerCapacity: 325, cargoCapacityKg: 50000, fuelCapacityLiters: 141480,
    purchasePrice: 317400000, usedPrice: 200000000, maintenanceCostPerHour: 3200,
    maintenanceCostPerMonth: 288000, fuelBurnPerHour: 5800,
    firstIntroduced: 2013, availableFrom: 2013, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 7, isActive: true,
    description: 'Carbon fiber widebody - 787 competitor'
  },

  {
    manufacturer: 'Boeing', model: '747', variant: '8', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 8000, cruiseSpeed: 493,
    passengerCapacity: 467, cargoCapacityKg: 55000, fuelCapacityLiters: 238610,
    purchasePrice: 420000000, usedPrice: 280000000, maintenanceCostPerHour: 4500,
    maintenanceCostPerMonth: 405000, fuelBurnPerHour: 11000,
    firstIntroduced: 2012, availableFrom: 2012, availableUntil: 2023,
    requiredPilots: 2, requiredCabinCrew: 10, isActive: true,
    description: 'Final 747 - stretched and modernized'
  },

  {
    manufacturer: 'Embraer', model: 'E195-E2', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 2600, cruiseSpeed: 460,
    passengerCapacity: 146, cargoCapacityKg: 12000, fuelCapacityLiters: 13500,
    purchasePrice: 65000000, usedPrice: 45000000, maintenanceCostPerHour: 1200,
    maintenanceCostPerMonth: 96000, fuelBurnPerHour: 1800,
    firstIntroduced: 2019, availableFrom: 2019, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'Next-gen E-Jet - efficient regional'
  },

  // Russian - 2000s
  {
    manufacturer: 'Sukhoi', model: 'SSJ-100', variant: 'Superjet 100', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1900, cruiseSpeed: 460,
    passengerCapacity: 98, cargoCapacityKg: 7500, fuelCapacityLiters: 15700,
    purchasePrice: 35000000, usedPrice: 16000000, maintenanceCostPerHour: 1100,
    maintenanceCostPerMonth: 88000, fuelBurnPerHour: 1650,
    firstIntroduced: 2011, availableFrom: 2011, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 2, isActive: true,
    description: 'Russian regional jet - modern Russian design'
  },

  // Small Props & Turboprops - 2000s/2010s
  {
    manufacturer: 'ATR', model: '42', variant: '600', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 800, cruiseSpeed: 300,
    passengerCapacity: 48, cargoCapacityKg: 5000, fuelCapacityLiters: 4500,
    purchasePrice: 18500000, usedPrice: 8000000, maintenanceCostPerHour: 780,
    maintenanceCostPerMonth: 62400, fuelBurnPerHour: 550,
    firstIntroduced: 2010, availableFrom: 2010, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Modern ATR-42 - glass cockpit upgrade'
  },

  {
    manufacturer: 'ATR', model: '72', variant: '600', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 900, cruiseSpeed: 300,
    passengerCapacity: 78, cargoCapacityKg: 7500, fuelCapacityLiters: 5000,
    purchasePrice: 27500000, usedPrice: 12500000, maintenanceCostPerHour: 880,
    maintenanceCostPerMonth: 70400, fuelBurnPerHour: 670,
    firstIntroduced: 2011, availableFrom: 2011, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 1, isActive: true,
    description: 'Best-selling turboprop - very efficient'
  },

  {
    manufacturer: 'Bombardier', model: 'Q400', variant: 'NextGen', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1200, cruiseSpeed: 360,
    passengerCapacity: 86, cargoCapacityKg: 8200, fuelCapacityLiters: 6800,
    purchasePrice: 33000000, usedPrice: 15000000, maintenanceCostPerHour: 970,
    maintenanceCostPerMonth: 77600, fuelBurnPerHour: 780,
    firstIntroduced: 2009, availableFrom: 2009, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 2, isActive: true,
    description: 'Modern Q400 - fastest turboprop'
  },

  {
    manufacturer: 'Viking Air', model: 'DHC-6', variant: 'Twin Otter Guardian', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 870, cruiseSpeed: 180,
    passengerCapacity: 19, cargoCapacityKg: 2300, fuelCapacityLiters: 1520,
    purchasePrice: 6200000, usedPrice: 2700000, maintenanceCostPerHour: 590,
    maintenanceCostPerMonth: 47200, fuelBurnPerHour: 270,
    firstIntroduced: 2015, availableFrom: 2015, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Modern Twin Otter - maritime patrol variant'
  },

  {
    manufacturer: 'Daher', model: 'TBM 940', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1730, cruiseSpeed: 330,
    passengerCapacity: 6, cargoCapacityKg: 600, fuelCapacityLiters: 1125,
    purchasePrice: 4200000, usedPrice: 2500000, maintenanceCostPerHour: 500,
    maintenanceCostPerMonth: 40000, fuelBurnPerHour: 280,
    firstIntroduced: 2019, availableFrom: 2019, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Fast single turboprop - VIP commuter'
  },

  {
    manufacturer: 'Pilatus', model: 'PC-24', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 2000, cruiseSpeed: 440,
    passengerCapacity: 11, cargoCapacityKg: 1400, fuelCapacityLiters: 3030,
    purchasePrice: 10900000, usedPrice: 7500000, maintenanceCostPerHour: 700,
    maintenanceCostPerMonth: 56000, fuelBurnPerHour: 600,
    firstIntroduced: 2018, availableFrom: 2018, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Super Versatile Jet - STOL jet'
  },

  {
    manufacturer: 'Tecnam', model: 'P2012', variant: 'Traveller', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 593, cruiseSpeed: 190,
    passengerCapacity: 11, cargoCapacityKg: 1200, fuelCapacityLiters: 800,
    purchasePrice: 3200000, usedPrice: 1500000, maintenanceCostPerHour: 430,
    maintenanceCostPerMonth: 34400, fuelBurnPerHour: 140,
    firstIntroduced: 2016, availableFrom: 2016, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Italian commuter - modern light twin'
  },

  {
    manufacturer: 'Cessna', model: '408', variant: 'SkyCourier', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 900, cruiseSpeed: 200,
    passengerCapacity: 19, cargoCapacityKg: 2700, fuelCapacityLiters: 2650,
    purchasePrice: 6100000, usedPrice: 4000000, maintenanceCostPerHour: 580,
    maintenanceCostPerMonth: 46400, fuelBurnPerHour: 350,
    firstIntroduced: 2020, availableFrom: 2020, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'FedEx feeder - cargo/passenger twin'
  },

  {
    manufacturer: 'de Havilland Canada', model: 'DHC-515', variant: 'Firefighter', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1350, cruiseSpeed: 180,
    passengerCapacity: 20, cargoCapacityKg: 3600, fuelCapacityLiters: 5600,
    purchasePrice: 37000000, usedPrice: 20000000, maintenanceCostPerHour: 1050,
    maintenanceCostPerMonth: 84000, fuelBurnPerHour: 900,
    firstIntroduced: 2016, availableFrom: 2016, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Amphibious firefighter - can carry passengers'
  },

  {
    manufacturer: 'Diamond', model: 'DA62', variant: null, type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1285, cruiseSpeed: 192,
    passengerCapacity: 7, cargoCapacityKg: 650, fuelCapacityLiters: 336,
    purchasePrice: 1500000, usedPrice: 900000, maintenanceCostPerHour: 280,
    maintenanceCostPerMonth: 22400, fuelBurnPerHour: 65,
    firstIntroduced: 2015, availableFrom: 2015, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Diesel twin - ultra-efficient'
  },

  {
    manufacturer: 'Textron', model: 'Cessna 182', variant: 'Skylane', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 920, cruiseSpeed: 145,
    passengerCapacity: 4, cargoCapacityKg: 450, fuelCapacityLiters: 334,
    purchasePrice: 550000, usedPrice: 250000, maintenanceCostPerHour: 180,
    maintenanceCostPerMonth: 14400, fuelBurnPerHour: 50,
    firstIntroduced: 1956, availableFrom: 1980, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Classic high-wing single - still in production'
  },

  {
    manufacturer: 'Piper', model: 'PA-46', variant: 'M600', type: 'Regional',
    rangeCategory: 'Short Haul', rangeNm: 1484, cruiseSpeed: 274,
    passengerCapacity: 6, cargoCapacityKg: 550, fuelCapacityLiters: 540,
    purchasePrice: 3200000, usedPrice: 2000000, maintenanceCostPerHour: 410,
    maintenanceCostPerMonth: 32800, fuelBurnPerHour: 180,
    firstIntroduced: 2016, availableFrom: 2016, availableUntil: null,
    requiredPilots: 1, requiredCabinCrew: 0, isActive: true,
    description: 'Single turboprop - pressurized cabin'
  },

  // ========================================
  // 2010s-PRESENT - LATEST GENERATION
  // ========================================

  {
    manufacturer: 'Boeing', model: '737', variant: 'MAX 7', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 3850, cruiseSpeed: 475,
    passengerCapacity: 172, cargoCapacityKg: 18000, fuelCapacityLiters: 30000,
    purchasePrice: 105000000, usedPrice: 72000000, maintenanceCostPerHour: 1750,
    maintenanceCostPerMonth: 140000, fuelBurnPerHour: 2450,
    firstIntroduced: 2024, availableFrom: 2024, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'Shortest MAX - long range'
  },

  {
    manufacturer: 'Boeing', model: '737', variant: 'MAX 8', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 3550, cruiseSpeed: 475,
    passengerCapacity: 178, cargoCapacityKg: 20000, fuelCapacityLiters: 36000,
    purchasePrice: 125000000, usedPrice: 85000000, maintenanceCostPerHour: 1800,
    maintenanceCostPerMonth: 144000, fuelBurnPerHour: 2500,
    firstIntroduced: 2017, availableFrom: 2017, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 4, isActive: true,
    description: 'Latest 737 - LEAP engines'
  },

  {
    manufacturer: 'Boeing', model: '737', variant: 'MAX 9', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 3550, cruiseSpeed: 475,
    passengerCapacity: 220, cargoCapacityKg: 22000, fuelCapacityLiters: 36000,
    purchasePrice: 135000000, usedPrice: 95000000, maintenanceCostPerHour: 1850,
    maintenanceCostPerMonth: 148000, fuelBurnPerHour: 2600,
    firstIntroduced: 2018, availableFrom: 2018, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 4, isActive: true,
    description: 'Stretched MAX - high capacity'
  },

  {
    manufacturer: 'Boeing', model: '737', variant: 'MAX 10', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 3300, cruiseSpeed: 475,
    passengerCapacity: 230, cargoCapacityKg: 23000, fuelCapacityLiters: 36000,
    purchasePrice: 145000000, usedPrice: 105000000, maintenanceCostPerHour: 1900,
    maintenanceCostPerMonth: 152000, fuelBurnPerHour: 2700,
    firstIntroduced: 2024, availableFrom: 2024, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 5, isActive: true,
    description: 'Largest MAX - maximum capacity'
  },

  {
    manufacturer: 'Airbus', model: 'A320', variant: 'neo', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 3300, cruiseSpeed: 470,
    passengerCapacity: 180, cargoCapacityKg: 18000, fuelCapacityLiters: 34000,
    purchasePrice: 110000000, usedPrice: 75000000, maintenanceCostPerHour: 1600,
    maintenanceCostPerMonth: 128000, fuelBurnPerHour: 2400,
    firstIntroduced: 2015, availableFrom: 2015, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 4, isActive: true,
    description: 'New Engine Option - 15% fuel savings'
  },

  {
    manufacturer: 'Airbus', model: 'A321', variant: 'neo', type: 'Narrowbody',
    rangeCategory: 'Medium Haul', rangeNm: 4000, cruiseSpeed: 470,
    passengerCapacity: 220, cargoCapacityKg: 19000, fuelCapacityLiters: 32840,
    purchasePrice: 129000000, usedPrice: 92000000, maintenanceCostPerHour: 1750,
    maintenanceCostPerMonth: 140000, fuelBurnPerHour: 2550,
    firstIntroduced: 2016, availableFrom: 2016, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 4, isActive: true,
    description: 'Best-selling single-aisle - efficient'
  },

  {
    manufacturer: 'Airbus', model: 'A321', variant: 'LR', type: 'Narrowbody',
    rangeCategory: 'Long Haul', rangeNm: 4000, cruiseSpeed: 470,
    passengerCapacity: 206, cargoCapacityKg: 17000, fuelCapacityLiters: 32840,
    purchasePrice: 142000000, usedPrice: 105000000, maintenanceCostPerHour: 1800,
    maintenanceCostPerMonth: 144000, fuelBurnPerHour: 2650,
    firstIntroduced: 2018, availableFrom: 2018, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 4, isActive: true,
    description: 'Long Range - transatlantic capability'
  },

  {
    manufacturer: 'Airbus', model: 'A321', variant: 'XLR', type: 'Narrowbody',
    rangeCategory: 'Long Haul', rangeNm: 4700, cruiseSpeed: 470,
    passengerCapacity: 220, cargoCapacityKg: 18000, fuelCapacityLiters: 39465,
    purchasePrice: 150000000, usedPrice: 115000000, maintenanceCostPerHour: 1850,
    maintenanceCostPerMonth: 148000, fuelBurnPerHour: 2750,
    firstIntroduced: 2024, availableFrom: 2024, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 4, isActive: true,
    description: 'Extra Long Range - longest narrowbody range'
  },

  {
    manufacturer: 'Airbus', model: 'A220', variant: '100', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 3400, cruiseSpeed: 463,
    passengerCapacity: 135, cargoCapacityKg: 8000, fuelCapacityLiters: 21805,
    purchasePrice: 81000000, usedPrice: 52000000, maintenanceCostPerHour: 1300,
    maintenanceCostPerMonth: 104000, fuelBurnPerHour: 1950,
    firstIntroduced: 2016, availableFrom: 2016, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'Ex-Bombardier C Series - very efficient'
  },

  {
    manufacturer: 'Airbus', model: 'A220', variant: '300', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 3350, cruiseSpeed: 463,
    passengerCapacity: 160, cargoCapacityKg: 10000, fuelCapacityLiters: 21805,
    purchasePrice: 91500000, usedPrice: 60000000, maintenanceCostPerHour: 1400,
    maintenanceCostPerMonth: 112000, fuelBurnPerHour: 2100,
    firstIntroduced: 2016, availableFrom: 2016, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 3, isActive: true,
    description: 'Stretched A220 - clean-sheet design'
  },

  {
    manufacturer: 'Boeing', model: '777', variant: '8X', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 8730, cruiseSpeed: 490,
    passengerCapacity: 384, cargoCapacityKg: 47000, fuelCapacityLiters: 197977,
    purchasePrice: 410000000, usedPrice: 330000000, maintenanceCostPerHour: 3600,
    maintenanceCostPerMonth: 324000, fuelBurnPerHour: 7900,
    firstIntroduced: 2025, availableFrom: 2025, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 8, isActive: true,
    description: 'Ultra-long range 777X - folding wingtips'
  },

  {
    manufacturer: 'Boeing', model: '777', variant: '9X', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 7285, cruiseSpeed: 490,
    passengerCapacity: 426, cargoCapacityKg: 50000, fuelCapacityLiters: 197977,
    purchasePrice: 442000000, usedPrice: 350000000, maintenanceCostPerHour: 3800,
    maintenanceCostPerMonth: 342000, fuelBurnPerHour: 8200,
    firstIntroduced: 2025, availableFrom: 2025, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 9, isActive: true,
    description: 'Latest 777 - ultra-efficient'
  },

  {
    manufacturer: 'Airbus', model: 'A350', variant: '1000', type: 'Widebody',
    rangeCategory: 'Long Haul', rangeNm: 8700, cruiseSpeed: 487,
    passengerCapacity: 369, cargoCapacityKg: 55000, fuelCapacityLiters: 156000,
    purchasePrice: 366500000, usedPrice: 280000000, maintenanceCostPerHour: 3500,
    maintenanceCostPerMonth: 315000, fuelBurnPerHour: 6200,
    firstIntroduced: 2018, availableFrom: 2018, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 8, isActive: true,
    description: 'Stretched A350 - longest range commercial jet'
  },

  // Russian - Modern
  {
    manufacturer: 'Irkut', model: 'MC-21', variant: '300', type: 'Narrowbody',
    rangeCategory: 'Short Haul', rangeNm: 3700, cruiseSpeed: 470,
    passengerCapacity: 211, cargoCapacityKg: 18000, fuelCapacityLiters: 29500,
    purchasePrice: 85000000, usedPrice: 55000000, maintenanceCostPerHour: 1650,
    maintenanceCostPerMonth: 132000, fuelBurnPerHour: 2550,
    firstIntroduced: 2021, availableFrom: 2021, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 4, isActive: true,
    description: 'Modern Russian narrowbody - composite wings'
  },

  // ========================================
  // CARGO AIRCRAFT
  // ========================================

  {
    manufacturer: 'Boeing', model: '777', variant: 'F', type: 'Cargo',
    rangeCategory: 'Long Haul', rangeNm: 5625, cruiseSpeed: 489,
    passengerCapacity: 0, cargoCapacityKg: 102000, fuelCapacityLiters: 117340,
    purchasePrice: 350000000, usedPrice: 280000000, maintenanceCostPerHour: 3500,
    maintenanceCostPerMonth: 315000, fuelBurnPerHour: 6200,
    firstIntroduced: 2009, availableFrom: 2009, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Heavy cargo aircraft'
  },

  {
    manufacturer: 'Boeing', model: '747', variant: '8F', type: 'Cargo',
    rangeCategory: 'Long Haul', rangeNm: 4390, cruiseSpeed: 493,
    passengerCapacity: 0, cargoCapacityKg: 134000, fuelCapacityLiters: 238610,
    purchasePrice: 420000000, usedPrice: 320000000, maintenanceCostPerHour: 4800,
    maintenanceCostPerMonth: 432000, fuelBurnPerHour: 11500,
    firstIntroduced: 2011, availableFrom: 2011, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Largest 747 freighter'
  },

  {
    manufacturer: 'Airbus', model: 'A330', variant: '200F', type: 'Cargo',
    rangeCategory: 'Long Haul', rangeNm: 4000, cruiseSpeed: 470,
    passengerCapacity: 0, cargoCapacityKg: 70000, fuelCapacityLiters: 139090,
    purchasePrice: 240000000, usedPrice: 180000000, maintenanceCostPerHour: 3000,
    maintenanceCostPerMonth: 270000, fuelBurnPerHour: 6800,
    firstIntroduced: 2010, availableFrom: 2010, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Medium-capacity freighter'
  },

  {
    manufacturer: 'Boeing', model: '767', variant: '300F', type: 'Cargo',
    rangeCategory: 'Long Haul', rangeNm: 3255, cruiseSpeed: 470,
    passengerCapacity: 0, cargoCapacityKg: 54400, fuelCapacityLiters: 91380,
    purchasePrice: 200000000, usedPrice: 140000000, maintenanceCostPerHour: 2700,
    maintenanceCostPerMonth: 243000, fuelBurnPerHour: 5800,
    firstIntroduced: 1995, availableFrom: 1995, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Workhorse cargo aircraft'
  },

  {
    manufacturer: 'McDonnell Douglas', model: 'MD-11', variant: 'F', type: 'Cargo',
    rangeCategory: 'Long Haul', rangeNm: 4030, cruiseSpeed: 490,
    passengerCapacity: 0, cargoCapacityKg: 88680, fuelCapacityLiters: 146210,
    purchasePrice: 210000000, usedPrice: 150000000, maintenanceCostPerHour: 3100,
    maintenanceCostPerMonth: 279000, fuelBurnPerHour: 8800,
    firstIntroduced: 1991, availableFrom: 1991, availableUntil: null,
    requiredPilots: 2, requiredCabinCrew: 0, isActive: true,
    description: 'Popular cargo tri-jet - still flying'
  }

];

async function seedHistoricalAircraft() {
  try {
    console.log('=== COMPREHENSIVE AIRCRAFT DATABASE IMPORT ===\n');
    console.log(`Total Aircraft: ${COMPREHENSIVE_AIRCRAFT.length}\n`);

    await sequelize.authenticate();
    console.log('✓ Database connected\n');

    let added = 0;
    let updated = 0;

    for (const aircraftData of COMPREHENSIVE_AIRCRAFT) {
      const fullName = aircraftData.variant
        ? `${aircraftData.manufacturer} ${aircraftData.model}-${aircraftData.variant}`
        : `${aircraftData.manufacturer} ${aircraftData.model}`;

      const existing = await Aircraft.findOne({
        where: {
          manufacturer: aircraftData.manufacturer,
          model: aircraftData.model,
          variant: aircraftData.variant
        }
      });

      if (existing) {
        await existing.update(aircraftData);
        console.log(`↻ Updated: ${fullName} (${aircraftData.firstIntroduced})`);
        updated++;
      } else {
        await Aircraft.create(aircraftData);
        console.log(`✓ Added: ${fullName} (${aircraftData.firstIntroduced})`);
        added++;
      }
    }

    // Statistics
    const stats = {
      byType: {
        Narrowbody: COMPREHENSIVE_AIRCRAFT.filter(a => a.type === 'Narrowbody').length,
        Widebody: COMPREHENSIVE_AIRCRAFT.filter(a => a.type === 'Widebody').length,
        Regional: COMPREHENSIVE_AIRCRAFT.filter(a => a.type === 'Regional').length,
        Cargo: COMPREHENSIVE_AIRCRAFT.filter(a => a.type === 'Cargo').length
      },
      byManufacturer: {},
      retired: COMPREHENSIVE_AIRCRAFT.filter(a => a.availableUntil !== null).length,
      turboprops: COMPREHENSIVE_AIRCRAFT.filter(a =>
        a.description.toLowerCase().includes('turboprop') ||
        a.manufacturer.includes('ATR') ||
        a.model.includes('DHC')
      ).length,
      russian: COMPREHENSIVE_AIRCRAFT.filter(a =>
        ['Tupolev', 'Ilyushin', 'Antonov', 'Yakovlev', 'Sukhoi', 'Irkut'].includes(a.manufacturer)
      ).length
    };

    console.log('\n' + '='.repeat(70));
    console.log('IMPORT SUMMARY');
    console.log('='.repeat(70));
    console.log(`\nAdded: ${added}`);
    console.log(`Updated: ${updated}`);
    console.log(`Total: ${COMPREHENSIVE_AIRCRAFT.length}`);

    console.log('\n** By Type **');
    Object.entries(stats.byType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    console.log(`\n** Special Categories **`);
    console.log(`  Turboprops: ${stats.turboprops}`);
    console.log(`  Russian/Soviet: ${stats.russian}`);
    console.log(`  Retired Aircraft: ${stats.retired}`);
    console.log(`  Currently Available: ${COMPREHENSIVE_AIRCRAFT.length - stats.retired}`);

    console.log('\n✓ Comprehensive aircraft database seeded successfully!');
    console.log('\nAll aircraft enabled (isActive: true)');
    console.log('availableFrom/availableUntil control world availability\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Seeding failed:', error);
    process.exit(1);
  }
}

seedHistoricalAircraft();
