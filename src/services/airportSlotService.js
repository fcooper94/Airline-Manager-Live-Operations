const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { Airport, World } = require('../models');
const airportGrowthService = require('./airportGrowthService');

/**
 * Airport Slot Management Service
 * Enforces hard slot limits on route creation
 */
class AirportSlotService {

  /**
   * Get slot availability for an airport
   * Returns total, used, available, and percentage
   *
   * @param {string} airportId - Airport UUID
   * @param {string} worldId - World UUID
   * @returns {Promise<Object>} - Slot availability data
   */
  async getSlotAvailability(airportId, worldId) {
    // Get airport with metrics
    const airport = await Airport.findByPk(airportId);
    if (!airport) {
      throw new Error('Airport not found');
    }

    const world = await World.findByPk(worldId);
    if (!world) {
      throw new Error('World not found');
    }

    const currentYear = world.currentTime.getFullYear();

    // Calculate total slots from movements/infrastructure
    const metrics = airportGrowthService.getAirportMetricsExtended(airport, currentYear);
    const totalSlots = metrics.totalSlots;

    // Calculate used slots from active routes
    const usedSlots = await this.calculateSlotsUsed(airportId, worldId);

    // Calculate availability
    const availableSlots = Math.max(0, totalSlots - usedSlots);
    const percentage = totalSlots > 0 ? (availableSlots / totalSlots) * 100 : 0;

    return {
      totalSlots,
      usedSlots,
      availableSlots,
      percentage: Math.round(percentage * 10) / 10
    };
  }

  /**
   * Calculate slots used by active routes
   * Each route consumes 2 slots (departure + arrival)
   *
   * @param {string} airportId - Airport UUID
   * @param {string} worldId - World UUID
   * @returns {Promise<number>} - Number of slots used
   */
  async calculateSlotsUsed(airportId, worldId) {
    const result = await sequelize.query(`
      SELECT COUNT(*) * 2 as slots_used
      FROM routes r
      JOIN world_memberships wm ON r.world_membership_id = wm.id
      WHERE wm.world_id = :worldId
        AND (r.departure_airport_id = :airportId OR r.arrival_airport_id = :airportId)
        AND r.is_active = true
    `, {
      replacements: { airportId, worldId },
      type: QueryTypes.SELECT
    });

    return parseInt(result[0]?.slots_used || 0);
  }

  /**
   * Check if airport has available slots (HARD ENFORCEMENT)
   * Returns {allowed, slotsAvailable, message}
   *
   * @param {string} departureAirportId - Departure airport UUID
   * @param {string} arrivalAirportId - Arrival airport UUID
   * @param {string} worldId - World UUID
   * @returns {Promise<Object>} - Validation result
   */
  async canCreateRoute(departureAirportId, arrivalAirportId, worldId) {
    const depSlots = await this.getSlotAvailability(departureAirportId, worldId);
    const arrSlots = await this.getSlotAvailability(arrivalAirportId, worldId);

    // Need 1 slot at each airport (departure + arrival)
    if (depSlots.availableSlots < 1) {
      return {
        allowed: false,
        reason: 'departure',
        slotsAvailable: depSlots.availableSlots,
        message: `Departure airport has no available slots (${depSlots.percentage}% full)`,
        departureSlots: depSlots,
        arrivalSlots: arrSlots
      };
    }

    if (arrSlots.availableSlots < 1) {
      return {
        allowed: false,
        reason: 'arrival',
        slotsAvailable: arrSlots.availableSlots,
        message: `Arrival airport has no available slots (${arrSlots.percentage}% full)`,
        departureSlots: depSlots,
        arrivalSlots: arrSlots
      };
    }

    return {
      allowed: true,
      departureSlots: depSlots,
      arrivalSlots: arrSlots
    };
  }

  /**
   * Get slot availability for multiple airports at once (batch)
   *
   * @param {Array<string>} airportIds - Array of airport UUIDs
   * @param {string} worldId - World UUID
   * @returns {Promise<Object>} - Map of airportId to slot availability
   */
  async getBatchSlotAvailability(airportIds, worldId) {
    const results = {};

    for (const airportId of airportIds) {
      try {
        results[airportId] = await this.getSlotAvailability(airportId, worldId);
      } catch (error) {
        console.error(`Error getting slots for airport ${airportId}:`, error);
        results[airportId] = {
          totalSlots: 0,
          usedSlots: 0,
          availableSlots: 0,
          percentage: 0,
          error: error.message
        };
      }
    }

    return results;
  }

  /**
   * Get detailed slot usage breakdown for an airport
   * Shows which airlines are using slots
   *
   * @param {string} airportId - Airport UUID
   * @param {string} worldId - World UUID
   * @returns {Promise<Object>} - Detailed slot usage data
   */
  async getDetailedSlotUsage(airportId, worldId) {
    const slotInfo = await this.getSlotAvailability(airportId, worldId);

    // Get routes by airline at this airport
    const routesByAirline = await sequelize.query(`
      SELECT
        wm.id as membership_id,
        wm.airline_name,
        COUNT(*) as route_count,
        COUNT(*) * 2 as slots_used
      FROM routes r
      JOIN world_memberships wm ON r.world_membership_id = wm.id
      WHERE wm.world_id = :worldId
        AND (r.departure_airport_id = :airportId OR r.arrival_airport_id = :airportId)
        AND r.is_active = true
      GROUP BY wm.id, wm.airline_name
      ORDER BY slots_used DESC
    `, {
      replacements: { airportId, worldId },
      type: QueryTypes.SELECT
    });

    return {
      ...slotInfo,
      airlineUsage: routesByAirline
    };
  }
}

// Singleton instance
const airportSlotService = new AirportSlotService();

module.exports = airportSlotService;
