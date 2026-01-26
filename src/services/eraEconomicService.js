/**
 * Era Economic Service
 *
 * Handles financial scaling across different aviation eras (1950-2025)
 * Converts 2024 USD prices to era-appropriate values for display and gameplay balance
 */

class EraEconomicService {
  /**
   * Get the economic multiplier for a given year
   * All prices in database are 2024 USD; multiply by this to get era-appropriate display value
   *
   * @param {number} year - The year (e.g., 1955, 2020)
   * @returns {number} - Multiplier (0.10 to 1.00)
   */
  getEraMultiplier(year) {
    if (year < 1958) return 0.10;  // Propeller era
    if (year < 1970) return 0.15;  // Early jet era
    if (year < 1980) return 0.25;  // Widebody era
    if (year < 1990) return 0.40;  // Deregulation era
    if (year < 2000) return 0.65;  // Modern era
    if (year < 2010) return 0.85;  // Next-gen era
    return 1.00;                   // Contemporary era (2010+)
  }

  /**
   * Get era name for display
   * @param {number} year
   * @returns {string}
   */
  getEraName(year) {
    if (year < 1958) return 'Propeller Era';
    if (year < 1970) return 'Early Jet Era';
    if (year < 1980) return 'Widebody Era';
    if (year < 1990) return 'Deregulation Era';
    if (year < 2000) return 'Modern Era';
    if (year < 2010) return 'Next-Gen Era';
    return 'Contemporary Era';
  }

  /**
   * Convert a 2024 USD price to era-appropriate display value
   *
   * @param {number} price2024USD - Price in 2024 dollars
   * @param {number} year - Year to convert to
   * @returns {number} - Era-appropriate price
   *
   * @example
   * // DC-3 costs $8.5M in 2024 USD
   * convertToEraPrice(8500000, 1950) // Returns $850,000 (1950 dollars)
   * convertToEraPrice(8500000, 2024) // Returns $8,500,000 (2024 dollars)
   */
  convertToEraPrice(price2024USD, year) {
    return Math.round(price2024USD * this.getEraMultiplier(year));
  }

  /**
   * Get starting capital based on world year
   * All players start with the same capital, scaled by era
   *
   * @param {number} year - World start year
   * @returns {number} - Starting capital in era-appropriate dollars
   *
   * @example
   * getStartingCapital(1950)    // Returns $3,750,000 (Propeller Era)
   * getStartingCapital(1970)    // Returns $9,375,000 (Widebody Era)
   * getStartingCapital(2020)    // Returns $37,500,000 (Contemporary)
   */
  getStartingCapital(year) {
    // Base capital in 2024 USD - scaled down by 75% from original design
    const baseCapital2024 = 37500000; // $37.5M base (was $150M, then $75M)

    return Math.round(baseCapital2024 * this.getEraMultiplier(year));
  }

  /**
   * Get starting capital info for display
   * @param {number} year
   * @returns {object}
   */
  getStartingCapitalInfo(year) {
    const capital = this.getStartingCapital(year);
    const multiplier = this.getEraMultiplier(year);

    return {
      capital,
      displayCapital: this.formatCurrency(capital, year),
      eraName: this.getEraName(year),
      multiplier,
      affordableAircraft: this.getAffordableAircraftCount(capital, year)
    };
  }

  /**
   * Estimate how many entry-level aircraft can be afforded
   * @private
   */
  getAffordableAircraftCount(capital, year) {
    // Assume entry aircraft costs 30-50% of capital
    return Math.floor(capital / (capital * 0.4));
  }

  /**
   * Get fuel cost multiplier for a given year
   * Fuel prices have varied dramatically over time
   *
   * @param {number} year
   * @returns {number} - Multiplier for fuel costs
   */
  getFuelCostMultiplier(year) {
    if (year < 1958) return 0.08;  // Very cheap fuel ($0.15/gal)
    if (year < 1970) return 0.12;  // Cheap fuel
    if (year < 1980) return 0.35;  // Oil crisis ($0.85/gal)
    if (year < 1990) return 0.30;  // Moderate prices
    if (year < 2000) return 0.75;  // Rising prices
    if (year < 2010) return 0.95;  // High prices
    return 1.00;                   // Current prices ($2.80/gal)
  }

  /**
   * Calculate fuel cost per hour for an aircraft in a given year
   *
   * @param {number} fuelBurnPerHour - Liters per hour (from aircraft data)
   * @param {number} year - Year to calculate for
   * @returns {number} - Fuel cost per hour
   */
  calculateFuelCost(fuelBurnPerHour, year) {
    const baseFuelCostPerLiter = 0.75; // 2024 USD per liter (~$2.80/gal)
    const eraMultiplier = this.getFuelCostMultiplier(year);

    return Math.round(fuelBurnPerHour * baseFuelCostPerLiter * eraMultiplier);
  }

  /**
   * Get labor cost multiplier
   * Pilot and crew salaries have increased with inflation
   *
   * @param {number} year
   * @returns {number}
   */
  getLaborCostMultiplier(year) {
    // Labor costs follow general era multiplier
    return this.getEraMultiplier(year);
  }

  /**
   * Calculate annual pilot salary
   * @param {number} year
   * @returns {number}
   */
  getPilotSalary(year) {
    const baseSalary2024 = 150000; // $150k/year in 2024
    return Math.round(baseSalary2024 * this.getLaborCostMultiplier(year));
  }

  /**
   * Calculate annual crew member salary
   * @param {number} year
   * @returns {number}
   */
  getCrewSalary(year) {
    const baseSalary2024 = 65000; // $65k/year in 2024
    return Math.round(baseSalary2024 * this.getLaborCostMultiplier(year));
  }

  /**
   * Get ticket price per nautical mile
   *
   * @param {number} routeDistance - Distance in nautical miles
   * @param {number} year - Year
   * @param {string} cabinClass - 'economy', 'business', 'first'
   * @returns {number} - Price per nautical mile
   */
  getTicketPricePerMile(routeDistance, year, cabinClass = 'economy') {
    // Base 2024 prices per mile
    const basePrices = {
      economy: 0.18,
      business: 0.45,
      first: 0.90
    };

    const basePrice = basePrices[cabinClass] || basePrices.economy;

    // Distance discount: longer routes = cheaper per mile
    // Max 50% discount at 10,000nm
    const distanceDiscount = Math.min(0.5, routeDistance / 20000);
    const distanceMultiplier = 1 - distanceDiscount;

    return basePrice * distanceMultiplier * this.getEraMultiplier(year);
  }

  /**
   * Calculate ticket price for a route
   *
   * @param {number} routeDistance - Distance in nautical miles
   * @param {number} year - Year
   * @param {string} cabinClass - Cabin class
   * @returns {number} - Total ticket price
   */
  calculateTicketPrice(routeDistance, year, cabinClass = 'economy') {
    const pricePerMile = this.getTicketPricePerMile(routeDistance, year, cabinClass);
    return Math.round(pricePerMile * routeDistance);
  }

  /**
   * Get passenger demand multiplier
   * More people fly in later eras
   *
   * @param {number} year
   * @returns {number} - Demand multiplier (1.0 = 2024 levels)
   */
  getPassengerDemandMultiplier(year) {
    if (year < 1958) return 0.05;  // Very few passengers (50M/year globally)
    if (year < 1970) return 0.15;  // Growing (150M/year)
    if (year < 1980) return 0.30;  // Expanding (300M/year)
    if (year < 1990) return 0.50;  // Deregulation boost (500M/year)
    if (year < 2000) return 0.70;  // Globalization (1.5B/year)
    if (year < 2010) return 0.85;  // Pre-crisis levels (2B/year)
    return 1.00;                   // Current levels (4.5B/year)
  }

  /**
   * Get expected load factor for era
   * @param {number} year
   * @returns {number} - Load factor percentage (0-100)
   */
  getExpectedLoadFactor(year) {
    if (year < 1958) return 65;
    if (year < 1970) return 68;
    if (year < 1980) return 70;
    if (year < 1990) return 72;
    if (year < 2000) return 75;
    if (year < 2010) return 78;
    if (year < 2020) return 82;
    return 84;
  }

  /**
   * Format currency for display
   *
   * @param {number} amount - Amount to format
   * @param {number} year - Year (for determining currency symbol)
   * @param {boolean} showEquivalent - Show 2024 equivalent in tooltip
   * @returns {string} - Formatted currency string
   */
  formatCurrency(amount, year, showEquivalent = false) {
    // TODO: Could add support for different currencies based on airline region
    // For now, always use USD

    const formatted = `$${Math.round(amount).toLocaleString()}`;

    if (showEquivalent && year < 2024) {
      const equivalent2024 = amount / this.getEraMultiplier(year);
      return `${formatted} (2024: $${Math.round(equivalent2024).toLocaleString()})`;
    }

    return formatted;
  }

  /**
   * Get all economic parameters for a given year
   * Useful for debugging and display
   *
   * @param {number} year
   * @returns {object}
   */
  getEconomicSnapshot(year) {
    return {
      year,
      eraName: this.getEraName(year),
      eraMultiplier: this.getEraMultiplier(year),
      fuelMultiplier: this.getFuelCostMultiplier(year),
      laborMultiplier: this.getLaborCostMultiplier(year),
      demandMultiplier: this.getPassengerDemandMultiplier(year),
      expectedLoadFactor: this.getExpectedLoadFactor(year),
      pilotSalaryAnnual: this.getPilotSalary(year),
      crewSalaryAnnual: this.getCrewSalary(year),
      startingCapital: this.getStartingCapital(year),
      exampleTicketPrices: {
        shortHaul: this.calculateTicketPrice(500, year, 'economy'),
        mediumHaul: this.calculateTicketPrice(2000, year, 'economy'),
        longHaul: this.calculateTicketPrice(5000, year, 'economy')
      }
    };
  }
}

// Singleton instance
const eraEconomicService = new EraEconomicService();

module.exports = eraEconomicService;
