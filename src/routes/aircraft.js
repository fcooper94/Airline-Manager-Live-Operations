const express = require('express');
const router = express.Router();
const { Aircraft, World, WorldMembership, User } = require('../models');
const { Op } = require('sequelize');

/**
 * Get all active aircraft for marketplace
 */
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;

    // Get current world year to filter available aircraft
    let currentYear = null;
    if (req.session?.activeWorldId) {
      const world = await World.findByPk(req.session.activeWorldId);
      if (world && world.currentTime) {
        // Use the year from currentTime, not the static era field
        currentYear = new Date(world.currentTime).getFullYear();
        console.log(`Filtering aircraft for world "${world.name}" - Current year: ${currentYear} (from currentTime: ${world.currentTime})`);
      }
    }

    // Build where clause for aircraft availability
    const whereClause = { isActive: true };

    if (currentYear) {
      // Filter aircraft based on availability dates
      whereClause[Op.and] = [
        {
          [Op.or]: [
            { availableFrom: null },
            { availableFrom: { [Op.lte]: currentYear } }
          ]
        },
        {
          [Op.or]: [
            { availableUntil: null },
            { availableUntil: { [Op.gte]: currentYear } }
          ]
        }
      ];
    }

    if (category === 'used') {
      // Generate used aircraft from available variants
      const variants = await Aircraft.findAll({
        where: whereClause,
        order: [['manufacturer', 'ASC'], ['model', 'ASC']]
      });

      console.log(`Found ${variants.length} aircraft variants available for year ${currentYear || 'any'} (used category)`);

      // Generate used aircraft based on variants
      const usedAircraft = generateUsedAircraft(variants, currentYear);
      res.json(usedAircraft);
    } else {
      // Return new aircraft (active variants)
      const newAircraft = await Aircraft.findAll({
        where: whereClause,
        order: [['manufacturer', 'ASC'], ['model', 'ASC']]
      });

      console.log(`Found ${newAircraft.length} aircraft variants available for year ${currentYear || 'any'} (new category)`);

      res.json(newAircraft);
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching aircraft:', error);
    }
    res.status(500).json({ error: 'Failed to fetch aircraft' });
  }
});

/**
 * Generate used aircraft from available variants
 */
function generateUsedAircraft(variants, currentYear = null) {
  const usedAircraft = [];

  // For each variant, generate 1-3 used examples with different conditions
  for (const variant of variants) {
    // Determine how many used examples to create for this variant (1-3)
    const count = Math.floor(Math.random() * 3) + 1;

    for (let i = 0; i < count; i++) {
      // Calculate maximum age based on when aircraft was introduced
      let maxAge = 25;
      if (currentYear && variant.availableFrom) {
        maxAge = Math.min(25, currentYear - variant.availableFrom);
      }

      // Generate random age (0-maxAge years)
      const age = Math.floor(Math.random() * (maxAge + 1));

      // Calculate condition based on age (with some randomness)
      let condition;
      let conditionPercentage;

      if (age <= 5) {
        // Newer aircraft tend to be in better condition
        const roll = Math.random();
        if (roll < 0.6) condition = 'Excellent';
        else if (roll < 0.9) condition = 'Very Good';
        else condition = 'Good';
        conditionPercentage = 85 + Math.floor(Math.random() * 15); // 85-100%
      } else if (age <= 10) {
        // Mid-age aircraft vary more
        const roll = Math.random();
        if (roll < 0.4) condition = 'Very Good';
        else if (roll < 0.7) condition = 'Good';
        else if (roll < 0.9) condition = 'Fair';
        else condition = 'Poor';
        conditionPercentage = 60 + Math.floor(Math.random() * 35); // 60-95%
      } else if (age <= 15) {
        // Older aircraft tend to be in fair/poor condition
        const roll = Math.random();
        if (roll < 0.3) condition = 'Good';
        else if (roll < 0.6) condition = 'Fair';
        else condition = 'Poor';
        conditionPercentage = 40 + Math.floor(Math.random() * 30); // 40-70%
      } else {
        // Very old aircraft tend to be in poor condition
        const roll = Math.random();
        if (roll < 0.5) condition = 'Fair';
        else condition = 'Poor';
        conditionPercentage = 20 + Math.floor(Math.random() * 30); // 20-50%
      }

      // Calculate depreciation based on age and condition
      let depreciationFactor;
      if (age <= 5) depreciationFactor = 0.70 - (age * 0.05); // 70% to 45%
      else if (age <= 10) depreciationFactor = 0.45 - ((age - 5) * 0.04); // 45% to 25%
      else if (age <= 15) depreciationFactor = 0.25 - ((age - 10) * 0.03); // 25% to 10%
      else depreciationFactor = 0.10 - Math.min((age - 15) * 0.01, 0.05); // 10% to 5%

      // Apply condition modifier to depreciation
      const conditionModifier = conditionPercentage / 100;
      depreciationFactor = Math.max(depreciationFactor * conditionModifier, 0.05); // Minimum 5%

      const usedPrice = variant.purchasePrice ?
        parseFloat(variant.purchasePrice) * depreciationFactor :
        parseFloat(variant.purchasePrice || 50000000) * depreciationFactor;

      // Generate lease price (typically 0.3-0.5% of used price per month)
      const leaseMultiplier = 0.003 + (Math.random() * 0.002);
      const leasePrice = usedPrice * leaseMultiplier;

      // Create used aircraft object
      const usedAc = {
        id: `used-${variant.id}-${i}`, // Unique ID for this used aircraft
        variantId: variant.id, // Reference to the original variant
        manufacturer: variant.manufacturer,
        model: variant.model,
        variant: variant.variant,
        type: variant.type,
        rangeCategory: variant.rangeCategory,
        rangeNm: variant.rangeNm,
        cruiseSpeed: variant.cruiseSpeed,
        passengerCapacity: variant.passengerCapacity,
        cargoCapacityKg: variant.cargoCapacityKg,
        fuelCapacityLiters: variant.fuelCapacityLiters,
        purchasePrice: parseFloat(usedPrice.toFixed(2)), // Depreciated price
        leasePrice: parseFloat(leasePrice.toFixed(2)),
        maintenanceCostPerHour: parseFloat(variant.maintenanceCostPerHour) * (1.2 - (conditionPercentage/200)), // Slightly higher for older aircraft
        maintenanceCostPerMonth: variant.maintenanceCostPerMonth ? parseFloat(variant.maintenanceCostPerMonth) * (1.2 - (conditionPercentage/200)) : null,
        fuelBurnPerHour: parseFloat(variant.fuelBurnPerHour) * (0.95 + (age * 0.01)), // Slightly higher fuel burn for older aircraft
        firstIntroduced: variant.firstIntroduced,
        availableFrom: variant.availableFrom,
        availableUntil: variant.availableUntil,
        requiredPilots: variant.requiredPilots,
        requiredCabinCrew: variant.requiredCabinCrew,
        isActive: variant.isActive,
        description: variant.description || `${variant.manufacturer} ${variant.model} in ${condition} condition`,

        // Used aircraft specific properties
        age: age,
        condition: condition,
        conditionPercentage: conditionPercentage,
        category: 'used'
      };

      usedAircraft.push(usedAc);
    }
  }

  return usedAircraft;
}

/**
 * Get single aircraft by ID
 */
router.get('/:aircraftId', async (req, res) => {
  try {
    const { aircraftId } = req.params;
    const aircraft = await Aircraft.findByPk(aircraftId);

    if (!aircraft) {
      return res.status(404).json({ error: 'Aircraft not found' });
    }

    res.json(aircraft);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching aircraft:', error);
    }
    res.status(500).json({ error: 'Failed to fetch aircraft' });
  }
});

module.exports = router;
