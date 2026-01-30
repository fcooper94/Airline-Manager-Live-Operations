const { AirportRouteDemand, Airport } = require('../models');

/**
 * Route Demand Service
 * Manages comprehensive seeded demand database
 */
class RouteDemandService {

  /**
   * Get route demand between two airports
   * Returns demand (0-100), category, route type
   *
   * @param {string} fromAirportId - Origin airport UUID
   * @param {string} toAirportId - Destination airport UUID
   * @param {number} year - Current year for era multiplier
   * @returns {Promise<Object>} - Demand data
   */
  async getRouteDemand(fromAirportId, toAirportId, year) {
    // Look up seeded demand
    const demand = await AirportRouteDemand.findOne({
      where: {
        fromAirportId,
        toAirportId
      }
    });

    if (!demand) {
      return {
        demand: 0,
        demandCategory: 'very_low',
        routeType: 'unknown',
        confidence: 'no_data',
        baseDemand: 0
      };
    }

    // Apply era multiplier to base demand
    const eraMultiplier = this.getEraDemandMultiplier(year);
    const adjustedDemand = Math.round(demand.baseDemand * eraMultiplier);

    return {
      demand: Math.min(100, adjustedDemand),
      demandCategory: demand.demandCategory,
      routeType: demand.routeType,
      confidence: 'seeded',
      baseDemand: demand.baseDemand
    };
  }

  /**
   * Get top destinations from an airport
   * Used for displaying popular routes
   *
   * @param {string} fromAirportId - Origin airport UUID
   * @param {number} year - Current year for era multiplier
   * @param {number} limit - Number of destinations to return (default 10)
   * @returns {Promise<Array>} - Array of destination objects with demand
   */
  async getTopDestinations(fromAirportId, year, limit = 10) {
    const demands = await AirportRouteDemand.findAll({
      where: { fromAirportId },
      include: [{
        model: Airport,
        as: 'toAirport',
        attributes: ['id', 'icaoCode', 'iataCode', 'name', 'city', 'country', 'type']
      }],
      order: [['baseDemand', 'DESC']],
      limit
    });

    const eraMultiplier = this.getEraDemandMultiplier(year);

    return demands.map(d => ({
      airport: d.toAirport,
      demand: Math.min(100, Math.round(d.baseDemand * eraMultiplier)),
      demandCategory: d.demandCategory,
      routeType: d.routeType,
      baseDemand: d.baseDemand
    }));
  }

  /**
   * Get demand for multiple routes at once (batch)
   *
   * @param {Array<{from: string, to: string}>} routes - Array of route pairs
   * @param {number} year - Current year for era multiplier
   * @returns {Promise<Array>} - Array of demand objects
   */
  async getBatchRouteDemand(routes, year) {
    const results = [];

    for (const route of routes) {
      const demand = await this.getRouteDemand(route.from, route.to, year);
      results.push({
        fromAirportId: route.from,
        toAirportId: route.to,
        ...demand
      });
    }

    return results;
  }

  /**
   * Search for high-demand routes from an airport
   * Filters by minimum demand category
   *
   * @param {string} fromAirportId - Origin airport UUID
   * @param {string} minCategory - Minimum demand category ('very_low', 'low', 'medium', 'high', 'very_high')
   * @param {number} year - Current year for era multiplier
   * @param {number} limit - Number of routes to return
   * @returns {Promise<Array>} - Array of high-demand routes
   */
  async getHighDemandRoutes(fromAirportId, minCategory, year, limit = 20) {
    const categoryOrder = ['very_low', 'low', 'medium', 'high', 'very_high'];
    const minIndex = categoryOrder.indexOf(minCategory);

    if (minIndex === -1) {
      throw new Error('Invalid demand category');
    }

    const validCategories = categoryOrder.slice(minIndex);

    const demands = await AirportRouteDemand.findAll({
      where: {
        fromAirportId,
        demandCategory: validCategories
      },
      include: [{
        model: Airport,
        as: 'toAirport',
        attributes: ['id', 'icaoCode', 'iataCode', 'name', 'city', 'country', 'type']
      }],
      order: [['baseDemand', 'DESC']],
      limit
    });

    const eraMultiplier = this.getEraDemandMultiplier(year);

    return demands.map(d => ({
      airport: d.toAirport,
      demand: Math.min(100, Math.round(d.baseDemand * eraMultiplier)),
      demandCategory: d.demandCategory,
      routeType: d.routeType,
      baseDemand: d.baseDemand
    }));
  }

  /**
   * Get demand statistics for an airport
   * Shows distribution of demand across categories
   *
   * @param {string} fromAirportId - Origin airport UUID
   * @returns {Promise<Object>} - Demand statistics
   */
  async getAirportDemandStats(fromAirportId) {
    const allDemands = await AirportRouteDemand.findAll({
      where: { fromAirportId },
      attributes: ['demandCategory', 'baseDemand', 'routeType']
    });

    const stats = {
      totalRoutes: allDemands.length,
      categoryBreakdown: {
        very_high: 0,
        high: 0,
        medium: 0,
        low: 0,
        very_low: 0
      },
      routeTypeBreakdown: {
        business: 0,
        leisure: 0,
        mixed: 0,
        cargo: 0,
        regional: 0
      },
      averageDemand: 0
    };

    let totalDemand = 0;

    allDemands.forEach(d => {
      stats.categoryBreakdown[d.demandCategory]++;
      if (d.routeType) {
        stats.routeTypeBreakdown[d.routeType]++;
      }
      totalDemand += d.baseDemand;
    });

    stats.averageDemand = allDemands.length > 0
      ? Math.round(totalDemand / allDemands.length)
      : 0;

    return stats;
  }

  /**
   * Era-based demand multiplier
   * Globalization increases demand over time
   *
   * @param {number} year - Year to calculate multiplier for
   * @returns {number} - Era multiplier (0.40-1.00)
   */
  getEraDemandMultiplier(year) {
    if (year < 1960) return 0.40; // Early jet age
    if (year < 1980) return 0.65; // Widebody era
    if (year < 2000) return 0.85; // Deregulation boom
    return 1.00; // Modern era
  }

  /**
   * Get demand category label (formatted)
   *
   * @param {string} category - Category enum value
   * @returns {string} - Formatted label
   */
  getDemandCategoryLabel(category) {
    return category.replace('_', ' ').toUpperCase();
  }

  /**
   * Get demand category color for UI
   *
   * @param {string} category - Category enum value
   * @returns {string} - CSS color variable name
   */
  getDemandCategoryColor(category) {
    const colors = {
      very_high: 'var(--success-color)',
      high: 'var(--info-color)',
      medium: 'var(--warning-color)',
      low: 'var(--text-muted)',
      very_low: 'var(--text-secondary)'
    };

    return colors[category] || 'var(--text-secondary)';
  }
}

// Singleton instance
const routeDemandService = new RouteDemandService();

module.exports = routeDemandService;
