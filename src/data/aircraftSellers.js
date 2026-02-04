/**
 * Aircraft Sellers and Lessors
 * Fake firms for the aircraft marketplace
 */

// Major aircraft leasing companies (for wet/dry leases)
const leasingCompanies = [
  { name: 'AerCap Holdings', shortName: 'AerCap', country: 'Ireland', tier: 1 },
  { name: 'SMBC Aviation Capital', shortName: 'SMBC', country: 'Ireland', tier: 1 },
  { name: 'Avolon Holdings', shortName: 'Avolon', country: 'Ireland', tier: 1 },
  { name: 'Air Lease Corporation', shortName: 'ALC', country: 'USA', tier: 1 },
  { name: 'BBAM Aircraft Leasing', shortName: 'BBAM', country: 'USA', tier: 1 },
  { name: 'BOC Aviation', shortName: 'BOC', country: 'Singapore', tier: 1 },
  { name: 'GECAS Aviation', shortName: 'GECAS', country: 'USA', tier: 1 },
  { name: 'Nordic Aviation Capital', shortName: 'NAC', country: 'Denmark', tier: 2 },
  { name: 'ICBC Leasing', shortName: 'ICBC', country: 'China', tier: 1 },
  { name: 'CDB Aviation', shortName: 'CDB', country: 'Ireland', tier: 2 },
  { name: 'Macquarie AirFinance', shortName: 'Macquarie', country: 'Ireland', tier: 2 },
  { name: 'Jackson Square Aviation', shortName: 'JSA', country: 'USA', tier: 2 },
  { name: 'Aircastle Limited', shortName: 'Aircastle', country: 'USA', tier: 2 },
  { name: 'Aviation Capital Group', shortName: 'ACG', country: 'USA', tier: 2 },
  { name: 'CALC Holdings', shortName: 'CALC', country: 'Hong Kong', tier: 2 },
  { name: 'Orix Aviation', shortName: 'Orix', country: 'Ireland', tier: 2 },
  { name: 'Castlelake Aviation', shortName: 'Castlelake', country: 'Ireland', tier: 3 },
  { name: 'Goshawk Aviation', shortName: 'Goshawk', country: 'Ireland', tier: 2 },
  { name: 'Skyworks Leasing', shortName: 'Skyworks', country: 'USA', tier: 3 },
  { name: 'Willis Lease Finance', shortName: 'Willis', country: 'USA', tier: 3 },
  { name: 'Aergo Capital', shortName: 'Aergo', country: 'Ireland', tier: 3 },
  { name: 'Stratos Aviation', shortName: 'Stratos', country: 'USA', tier: 3 },
  { name: 'Zephyr Aviation Capital', shortName: 'Zephyr', country: 'USA', tier: 3 },
  { name: 'Atlas Air Finance', shortName: 'Atlas', country: 'USA', tier: 3 },
  { name: 'TrueNoord Regional', shortName: 'TrueNoord', country: 'Netherlands', tier: 3 },
];

// Airlines selling used aircraft (for used market purchases)
const sellingAirlines = [
  { name: 'Delta Air Lines', shortName: 'Delta', country: 'USA', reason: 'Fleet Renewal' },
  { name: 'United Airlines', shortName: 'United', country: 'USA', reason: 'Fleet Modernization' },
  { name: 'American Airlines', shortName: 'American', country: 'USA', reason: 'Capacity Adjustment' },
  { name: 'Lufthansa Group', shortName: 'Lufthansa', country: 'Germany', reason: 'Fleet Optimization' },
  { name: 'British Airways', shortName: 'BA', country: 'UK', reason: 'Fleet Renewal' },
  { name: 'Air France-KLM', shortName: 'AF-KLM', country: 'France', reason: 'Restructuring' },
  { name: 'Emirates Airline', shortName: 'Emirates', country: 'UAE', reason: 'Fleet Upgrade' },
  { name: 'Singapore Airlines', shortName: 'SIA', country: 'Singapore', reason: 'Fleet Renewal' },
  { name: 'Cathay Pacific', shortName: 'Cathay', country: 'Hong Kong', reason: 'Capacity Reduction' },
  { name: 'Qantas Airways', shortName: 'Qantas', country: 'Australia', reason: 'Fleet Renewal' },
  { name: 'Japan Airlines', shortName: 'JAL', country: 'Japan', reason: 'Fleet Modernization' },
  { name: 'ANA Holdings', shortName: 'ANA', country: 'Japan', reason: 'Fleet Optimization' },
  { name: 'Korean Air', shortName: 'Korean', country: 'South Korea', reason: 'Fleet Renewal' },
  { name: 'Thai Airways', shortName: 'Thai', country: 'Thailand', reason: 'Restructuring' },
  { name: 'Turkish Airlines', shortName: 'Turkish', country: 'Turkey', reason: 'Fleet Upgrade' },
  { name: 'Iberia Airlines', shortName: 'Iberia', country: 'Spain', reason: 'Fleet Renewal' },
  { name: 'Swiss International', shortName: 'Swiss', country: 'Switzerland', reason: 'Fleet Optimization' },
  { name: 'SAS Scandinavian', shortName: 'SAS', country: 'Sweden', reason: 'Restructuring' },
  { name: 'Alaska Airlines', shortName: 'Alaska', country: 'USA', reason: 'Fleet Consolidation' },
  { name: 'JetBlue Airways', shortName: 'JetBlue', country: 'USA', reason: 'Fleet Adjustment' },
];

// Aircraft brokers/dealers (for used aircraft)
const aircraftBrokers = [
  { name: 'Jetcraft Commercial', shortName: 'Jetcraft', country: 'USA', specialty: 'All Types' },
  { name: 'ACC Aviation', shortName: 'ACC', country: 'UK', specialty: 'Commercial' },
  { name: 'Acumen Aviation', shortName: 'Acumen', country: 'Ireland', specialty: 'Advisory' },
  { name: 'IBA Group', shortName: 'IBA', country: 'UK', specialty: 'Analytics' },
  { name: 'DVB Aviation', shortName: 'DVB', country: 'Germany', specialty: 'Finance' },
  { name: 'Seraph Aviation', shortName: 'Seraph', country: 'Ireland', specialty: 'Trading' },
  { name: 'Altavair AirFinance', shortName: 'Altavair', country: 'USA', specialty: 'Widebody' },
  { name: 'Stellwagen Group', shortName: 'Stellwagen', country: 'USA', specialty: 'Trading' },
];

// Manufacturers (for new aircraft)
const manufacturers = {
  'Boeing': { name: 'Boeing Commercial Airplanes', shortName: 'Boeing', country: 'USA', facility: 'Seattle/Charleston' },
  'Airbus': { name: 'Airbus Commercial Aircraft', shortName: 'Airbus', country: 'France', facility: 'Toulouse/Hamburg' },
  'Embraer': { name: 'Embraer Commercial Aviation', shortName: 'Embraer', country: 'Brazil', facility: 'São José dos Campos' },
  'Bombardier': { name: 'Bombardier Aviation', shortName: 'Bombardier', country: 'Canada', facility: 'Montreal' },
  'ATR': { name: 'ATR Aircraft', shortName: 'ATR', country: 'France', facility: 'Toulouse' },
  'De Havilland': { name: 'De Havilland Canada', shortName: 'DHC', country: 'Canada', facility: 'Toronto' },
  'COMAC': { name: 'COMAC', shortName: 'COMAC', country: 'China', facility: 'Shanghai' },
  'Mitsubishi': { name: 'Mitsubishi Aircraft', shortName: 'Mitsubishi', country: 'Japan', facility: 'Nagoya' },
};

/**
 * Get a random lessor for leasing an aircraft
 * @param {string} aircraftType - Type of aircraft (Narrowbody, Widebody, Regional, Cargo)
 * @returns {object} Lessor info
 */
function getRandomLessor(aircraftType) {
  // Weight towards tier 1 for widebody, more variety for regional
  let pool;
  if (aircraftType === 'Widebody' || aircraftType === 'Cargo') {
    // Tier 1 lessors more common for expensive aircraft
    pool = leasingCompanies.filter(l => l.tier <= 2);
  } else if (aircraftType === 'Regional') {
    // Include more regional specialists
    pool = leasingCompanies;
  } else {
    pool = leasingCompanies;
  }

  const lessor = pool[Math.floor(Math.random() * pool.length)];
  return {
    type: 'lessor',
    name: lessor.name,
    shortName: lessor.shortName,
    country: lessor.country
  };
}

/**
 * Get a seller for used aircraft
 * @param {number} age - Aircraft age in years
 * @param {string} condition - Aircraft condition
 * @returns {object} Seller info
 */
function getUsedAircraftSeller(age, condition) {
  // Determine seller type based on age and condition
  const roll = Math.random();

  if (roll < 0.5) {
    // 50% from leasing companies (returning off-lease aircraft)
    const lessor = leasingCompanies[Math.floor(Math.random() * leasingCompanies.length)];
    return {
      type: 'lessor',
      name: lessor.name,
      shortName: lessor.shortName,
      country: lessor.country,
      reason: 'Off-Lease'
    };
  } else if (roll < 0.85) {
    // 35% from airlines
    const airline = sellingAirlines[Math.floor(Math.random() * sellingAirlines.length)];
    return {
      type: 'airline',
      name: airline.name,
      shortName: airline.shortName,
      country: airline.country,
      reason: airline.reason
    };
  } else {
    // 15% from brokers
    const broker = aircraftBrokers[Math.floor(Math.random() * aircraftBrokers.length)];
    return {
      type: 'broker',
      name: broker.name,
      shortName: broker.shortName,
      country: broker.country,
      reason: 'Remarketing'
    };
  }
}

/**
 * Get manufacturer info for new aircraft
 * @param {string} manufacturerName - Manufacturer name
 * @returns {object} Manufacturer info
 */
function getManufacturer(manufacturerName) {
  const mfr = manufacturers[manufacturerName];
  if (mfr) {
    return {
      type: 'manufacturer',
      name: mfr.name,
      shortName: mfr.shortName,
      country: mfr.country,
      facility: mfr.facility
    };
  }
  // Fallback
  return {
    type: 'manufacturer',
    name: manufacturerName,
    shortName: manufacturerName,
    country: 'Unknown',
    facility: 'Factory Direct'
  };
}

module.exports = {
  leasingCompanies,
  sellingAirlines,
  aircraftBrokers,
  manufacturers,
  getRandomLessor,
  getUsedAircraftSeller,
  getManufacturer
};
