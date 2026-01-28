const { Airport, World, WorldMembership } = require('../models');
const airportGrowthService = require('./airportGrowthService');
const historicalCountryService = require('./historicalCountryService');
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

/**
 * Service to cache airport data for performance
 * Caches are stored per world ID to include era-specific data
 */
class AirportCacheService {
  constructor() {
    // Cache structure: { worldId_searchKey: { data: [], timestamp: Date } }
    this.cache = new Map();
    // Cache TTL: 1 hour (in milliseconds)
    this.cacheTTL = 60 * 60 * 1000;
  }

  /**
   * Generate cache key based on query parameters
   */
  getCacheKey(worldId, type, country, search) {
    const parts = [worldId || 'default'];
    if (type) parts.push(`type:${type}`);
    if (country) parts.push(`country:${country}`);
    if (search) parts.push(`search:${search}`);
    return parts.join('_');
  }

  /**
   * Check if cache entry is still valid
   */
  isCacheValid(cacheEntry) {
    if (!cacheEntry) return false;
    const age = Date.now() - cacheEntry.timestamp;
    return age < this.cacheTTL;
  }

  /**
   * Get airports from cache if available and valid
   */
  get(worldId, type, country, search) {
    const key = this.getCacheKey(worldId, type, country, search);
    const cacheEntry = this.cache.get(key);

    if (this.isCacheValid(cacheEntry)) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`✓ Cache HIT for key: ${key} (age: ${Math.round((Date.now() - cacheEntry.timestamp) / 1000)}s)`);
      }
      return cacheEntry.data;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`✗ Cache MISS for key: ${key}`);
    }
    return null;
  }

  /**
   * Store airports in cache
   */
  set(worldId, type, country, search, data) {
    const key = this.getCacheKey(worldId, type, country, search);
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`✓ Cache SET for key: ${key} (${data.length} airports)`);
    }
  }

  /**
   * Clear all cached airport data
   */
  clearAll() {
    const size = this.cache.size;
    this.cache.clear();
    if (process.env.NODE_ENV === 'development') {
      console.log(`✓ Cache CLEARED (removed ${size} entries)`);
    }
    return size;
  }

  /**
   * Clear cache for a specific world
   */
  clearWorld(worldId) {
    let cleared = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${worldId}_`) || key.startsWith('default_')) {
        this.cache.delete(key);
        cleared++;
      }
    }
    if (process.env.NODE_ENV === 'development') {
      console.log(`✓ Cache CLEARED for world ${worldId} (removed ${cleared} entries)`);
    }
    return cleared;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const entries = Array.from(this.cache.entries()).map(([key, value]) => ({
      key,
      airports: value.data.length,
      age: Math.round((Date.now() - value.timestamp) / 1000),
      valid: this.isCacheValid(value)
    }));

    return {
      totalEntries: this.cache.size,
      validEntries: entries.filter(e => e.valid).length,
      entries
    };
  }

  /**
   * Fetch and cache airports for a specific world
   * This is the main method that queries the database
   */
  async fetchAndCacheAirports(worldId, type, country, search) {
    const { Op } = require('sequelize');

    // Build where clause
    const whereClause = { isActive: true };

    if (type) {
      whereClause.type = type;
    }

    if (country) {
      whereClause.country = country;
    }

    // Build SQL query dynamically
    let whereClauses = ['a.is_active = true'];
    let replacements = {};

    if (type) {
      whereClauses.push('a.type = :type');
      replacements.type = type;
    }

    if (country) {
      whereClauses.push('a.country = :country');
      replacements.country = country;
    }

    if (search) {
      whereClauses.push(`(
        a.name ILIKE :search OR
        a.city ILIKE :search OR
        a.icao_code ILIKE :search OR
        a.iata_code ILIKE :search
      )`);
      replacements.search = `%${search}%`;
    }

    // Add world year filtering if applicable
    if (worldId) {
      const world = await World.findByPk(worldId);
      if (world && world.currentTime) {
        const worldYear = world.currentTime.getFullYear();
        whereClauses.push(`(
          (a.operational_from IS NULL OR a.operational_from <= :worldYear) AND
          (a.operational_until IS NULL OR a.operational_until >= :worldYear)
        )`);
        replacements.worldYear = worldYear;
      }
    }

    const whereSQL = whereClauses.join(' AND ');
    const limit = search ? 200 : 5000;

    // Query database
    const airportsWithData = await sequelize.query(`
      SELECT
        a.id,
        a.icao_code as "icaoCode",
        a.iata_code as "iataCode",
        a.name,
        a.city,
        a.country,
        a.latitude,
        a.longitude,
        a.elevation,
        a.type,
        a.timezone,
        a.is_active as "isActive",
        a.operational_from as "operationalFrom",
        a.operational_until as "operationalUntil",
        a.traffic_demand as "trafficDemand",
        a.infrastructure_level as "infrastructureLevel",
        a.created_at as "createdAt",
        a.updated_at as "updatedAt",
        COALESCE(COUNT(wm.id), 0)::int as "airlinesBasedHere"
      FROM airports a
      LEFT JOIN world_memberships wm ON wm.base_airport_id = a.id
      WHERE ${whereSQL}
      GROUP BY a.id
      ORDER BY
        CASE a.type
          WHEN 'International Hub' THEN 1
          WHEN 'Major' THEN 2
          WHEN 'Regional' THEN 3
          WHEN 'Small Regional' THEN 4
          ELSE 5
        END,
        a.name ASC
      LIMIT ${limit}
    `, {
      replacements,
      type: QueryTypes.SELECT
    });

    // Calculate dynamic traffic and infrastructure based on world year
    let worldYear = 2024;
    if (worldId) {
      const world = await World.findByPk(worldId);
      if (world && world.currentTime) {
        worldYear = world.currentTime.getFullYear();
      }
    }

    // Apply dynamic metrics and historical country names to each airport
    const airportsWithDynamicData = airportsWithData.map(airport => {
      const metrics = airportGrowthService.getAirportMetrics(airport, worldYear);
      const historicalCountry = historicalCountryService.getHistoricalCountryName(airport.country, worldYear);

      return {
        ...airport,
        country: historicalCountry,
        trafficDemand: metrics.trafficDemand,
        infrastructureLevel: metrics.infrastructureLevel,
        annualPassengers: metrics.annualPassengers,
        runways: metrics.runways,
        stands: metrics.stands
      };
    });

    // Sort by annual passengers (descending) for browse all, or keep search order for searches
    if (!search) {
      airportsWithDynamicData.sort((a, b) => {
        const paxA = Number(a.annualPassengers) || 0;
        const paxB = Number(b.annualPassengers) || 0;
        return paxB - paxA;
      });
    }

    // Cache the result
    this.set(worldId, type, country, search, airportsWithDynamicData);

    return airportsWithDynamicData;
  }
}

// Export singleton instance
module.exports = new AirportCacheService();
