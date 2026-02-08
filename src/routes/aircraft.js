const express = require('express');
const router = express.Router();
const { Aircraft, World, WorldMembership, User, UsedAircraftForSale, UserAircraft } = require('../models');
const { Op } = require('sequelize');
const { getRandomLessor, getUsedAircraftSeller, getManufacturer } = require('../data/aircraftSellers');

/**
 * Format days remaining into human-readable string
 */
function formatDaysRemaining(days) {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    if (months > 0) {
      return `${years}y ${months}m`;
    }
    return `${years} year${years > 1 ? 's' : ''}`;
  } else if (days >= 30) {
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? 's' : ''}`;
  } else {
    return `${days} days`;
  }
}

/**
 * Get all active aircraft for marketplace
 */
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;

    // Get current world year and game time to filter available aircraft
    let currentYear = null;
    let gameTime = null;
    if (req.session?.activeWorldId) {
      const world = await World.findByPk(req.session.activeWorldId);
      if (world && world.currentTime) {
        gameTime = new Date(world.currentTime);
        currentYear = gameTime.getFullYear();
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

      // Also fetch persistent used aircraft listings for this world
      if (req.session?.activeWorldId) {
        const persistentListings = await UsedAircraftForSale.findAll({
          where: {
            worldId: req.session.activeWorldId,
            status: 'available'
          },
          include: [{
            model: Aircraft,
            as: 'aircraft'
          }]
        });

        console.log(`Found ${persistentListings.length} persistent used aircraft listings`);

        // Convert persistent listings to same format as generated used aircraft
        for (const listing of persistentListings) {
          const variant = listing.aircraft;
          if (!variant) continue;

          const usedAc = {
            id: `persistent-${listing.id}`,
            persistentId: listing.id,
            variantId: variant.id,
            manufacturer: variant.manufacturer,
            model: variant.model,
            variant: variant.variant,
            icaoCode: variant.icaoCode,
            type: variant.type,
            rangeCategory: variant.rangeCategory,
            rangeNm: variant.rangeNm,
            cruiseSpeed: variant.cruiseSpeed,
            passengerCapacity: variant.passengerCapacity,
            cargoCapacityKg: variant.cargoCapacityKg,
            fuelCapacityLiters: variant.fuelCapacityLiters,
            purchasePrice: parseFloat(listing.purchasePrice),
            leasePrice: listing.leasePrice ? parseFloat(listing.leasePrice) : null,
            maintenanceCostPerHour: parseFloat(variant.maintenanceCostPerHour),
            maintenanceCostPerMonth: variant.maintenanceCostPerMonth ? parseFloat(variant.maintenanceCostPerMonth) : null,
            fuelBurnPerHour: parseFloat(variant.fuelBurnPerHour),
            firstIntroduced: variant.firstIntroduced,
            availableFrom: variant.availableFrom,
            availableUntil: variant.availableUntil,
            requiredPilots: variant.requiredPilots,
            requiredCabinCrew: variant.requiredCabinCrew,
            isActive: variant.isActive,
            description: `${variant.manufacturer} ${variant.model} - ${listing.condition} condition`,

            // Used aircraft specific properties
            age: listing.ageYears,
            condition: listing.condition,
            conditionPercentage: listing.conditionPercentage,
            category: 'used',
            isPersistent: true,

            // Check validity
            cCheckRemainingDays: listing.cCheckRemainingDays,
            dCheckRemainingDays: listing.dCheckRemainingDays,
            cCheckRemaining: listing.cCheckRemainingDays ? formatDaysRemaining(listing.cCheckRemainingDays) : 'Unknown',
            dCheckRemaining: listing.dCheckRemainingDays ? formatDaysRemaining(listing.dCheckRemainingDays) : 'Unknown',

            // Seller info
            seller: {
              type: listing.sellerType,
              name: listing.sellerName,
              shortName: listing.sellerName,
              country: listing.sellerCountry,
              reason: listing.sellerReason
            },
            lessor: getRandomLessor(variant.type)
          };

          usedAircraft.push(usedAc);
        }

        // Fetch player-listed aircraft (for sale or for lease) in this world
        const currentUserId = req.session?.passport?.user?.id || null;

        const playerListings = await UserAircraft.findAll({
          where: {
            status: { [Op.in]: ['listed_sale', 'listed_lease'] }
          },
          include: [
            { model: Aircraft, as: 'aircraft' },
            {
              model: WorldMembership, as: 'membership',
              where: { worldId: req.session.activeWorldId },
              include: [{ model: User, as: 'user' }]
            }
          ]
        });

        console.log(`Found ${playerListings.length} player-listed aircraft`);

        for (const pListing of playerListings) {
          const variant = pListing.aircraft;
          const ownerMembership = pListing.membership;
          if (!variant || !ownerMembership) continue;

          // Don't show the current user's own listings to themselves
          if (currentUserId && ownerMembership.userId === currentUserId) continue;

          const airlineName = ownerMembership.airlineName || 'Private Airline';
          const listingPrice = parseFloat(pListing.listingPrice) || 0;
          const condPct = pListing.conditionPercentage || 100;
          const age = pListing.ageYears || 0;

          // Estimate check remaining days from last check dates (use game time, not real time)
          const now = gameTime || new Date();
          let cRemaining = null, dRemaining = null;
          if (pListing.lastCCheckDate && pListing.cCheckIntervalDays) {
            const cExpiry = new Date(new Date(pListing.lastCCheckDate).getTime() + pListing.cCheckIntervalDays * 86400000);
            cRemaining = Math.max(0, Math.round((cExpiry - now) / 86400000));
          }
          if (pListing.lastDCheckDate && pListing.dCheckIntervalDays) {
            const dExpiry = new Date(new Date(pListing.lastDCheckDate).getTime() + pListing.dCheckIntervalDays * 86400000);
            dRemaining = Math.max(0, Math.round((dExpiry - now) / 86400000));
          }

          const playerAc = {
            id: `player-${pListing.id}`,
            playerListingId: pListing.id,
            variantId: variant.id,
            manufacturer: variant.manufacturer,
            model: variant.model,
            variant: variant.variant,
            icaoCode: variant.icaoCode,
            type: variant.type,
            rangeCategory: variant.rangeCategory,
            rangeNm: variant.rangeNm,
            cruiseSpeed: variant.cruiseSpeed,
            passengerCapacity: variant.passengerCapacity,
            cargoCapacityKg: variant.cargoCapacityKg,
            fuelCapacityLiters: variant.fuelCapacityLiters,
            maintenanceCostPerHour: parseFloat(pListing.maintenanceCostPerHour || variant.maintenanceCostPerHour),
            maintenanceCostPerMonth: variant.maintenanceCostPerMonth ? parseFloat(variant.maintenanceCostPerMonth) : null,
            fuelBurnPerHour: parseFloat(pListing.fuelBurnPerHour || variant.fuelBurnPerHour),
            firstIntroduced: variant.firstIntroduced,
            availableFrom: variant.availableFrom,
            availableUntil: variant.availableUntil,
            requiredPilots: variant.requiredPilots,
            requiredCabinCrew: variant.requiredCabinCrew,
            isActive: variant.isActive,
            description: `${variant.manufacturer} ${variant.model} - Listed by ${airlineName}`,

            age,
            condition: pListing.condition || 'Good',
            conditionPercentage: condPct,
            category: 'used',
            isPlayerListing: true,
            playerListingType: pListing.status === 'listed_sale' ? 'sale' : 'lease',

            // Pricing: sale listings have purchase price, lease listings have lease price
            purchasePrice: pListing.status === 'listed_sale' ? listingPrice : null,
            leasePrice: pListing.status === 'listed_lease' ? listingPrice : null,

            cCheckRemainingDays: cRemaining,
            dCheckRemainingDays: dRemaining,
            cCheckRemaining: cRemaining !== null ? formatDaysRemaining(cRemaining) : 'Unknown',
            dCheckRemaining: dRemaining !== null ? formatDaysRemaining(dRemaining) : 'Unknown',

            // Seller/lessor is the player airline
            seller: {
              type: 'airline',
              name: airlineName,
              shortName: airlineName,
              country: '',
              reason: pListing.status === 'listed_sale' ? 'Fleet restructuring' : 'Available for lease'
            },
            lessor: {
              name: airlineName,
              shortName: airlineName,
              country: '',
              isPlayer: true
            }
          };

          usedAircraft.push(playerAc);
        }
      }

      // Sort so player listings intermix with NPC listings of the same type
      usedAircraft.sort((a, b) => {
        const keyA = `${a.manufacturer} ${a.model} ${a.variant || ''}`;
        const keyB = `${b.manufacturer} ${b.model} ${b.variant || ''}`;
        return keyA.localeCompare(keyB);
      });

      res.json(usedAircraft);
    } else {
      // Return new aircraft (active variants)
      const newAircraft = await Aircraft.findAll({
        where: whereClause,
        order: [['manufacturer', 'ASC'], ['model', 'ASC']]
      });

      console.log(`Found ${newAircraft.length} aircraft variants available for year ${currentYear || 'any'} (new category)`);

      // Add manufacturer/seller info and lessor info to each aircraft
      const aircraftWithSellers = newAircraft.map(ac => {
        const acData = ac.toJSON();
        // For new aircraft, seller is the manufacturer
        acData.seller = getManufacturer(ac.manufacturer);
        // Lessor is a random leasing company
        acData.lessor = getRandomLessor(ac.type);
        return acData;
      });

      res.json(aircraftWithSellers);
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

  // For each variant, generate 5-15 used examples with different conditions
  for (const variant of variants) {
    // Determine how many used examples to create for this variant (5-15)
    const count = Math.floor(Math.random() * 11) + 5;

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

      // Generate C and D check validity remaining
      // D check interval: 6-10 years (2190-3650 days), C check: 18-24 months (540-720 days)
      // For used aircraft, remaining validity depends on age and randomness

      // D Check: newer aircraft have more validity remaining
      let dCheckRemainingDays;
      if (age <= 3) {
        // Recently delivered, 5-10 years remaining
        dCheckRemainingDays = 1825 + Math.floor(Math.random() * 1825); // 5-10 years
      } else if (age <= 8) {
        // Mid-life, 2-6 years remaining
        dCheckRemainingDays = 730 + Math.floor(Math.random() * 1460); // 2-6 years
      } else if (age <= 15) {
        // Older, 1-3 years remaining
        dCheckRemainingDays = 365 + Math.floor(Math.random() * 730); // 1-3 years
      } else {
        // Very old, 6 months to 2 years remaining
        dCheckRemainingDays = 180 + Math.floor(Math.random() * 550); // 0.5-2 years
      }

      // C Check: 3 months to 2 years remaining
      let cCheckRemainingDays;
      if (age <= 5) {
        cCheckRemainingDays = 365 + Math.floor(Math.random() * 365); // 1-2 years
      } else if (age <= 10) {
        cCheckRemainingDays = 180 + Math.floor(Math.random() * 365); // 6-18 months
      } else {
        cCheckRemainingDays = 90 + Math.floor(Math.random() * 270); // 3-12 months
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

      // Apply check validity discount (up to 15% off for low validity)
      // D check cost is significant (~$5-15M), so low validity = big discount
      const dCheckMaxDays = 3650; // 10 years max
      const cCheckMaxDays = 720; // 2 years max
      const dCheckValidityRatio = Math.min(dCheckRemainingDays / dCheckMaxDays, 1);
      const cCheckValidityRatio = Math.min(cCheckRemainingDays / cCheckMaxDays, 1);

      // Weight D check more heavily (it's more expensive)
      const checkValidityDiscount = 1 - ((1 - dCheckValidityRatio) * 0.10 + (1 - cCheckValidityRatio) * 0.05);
      depreciationFactor *= checkValidityDiscount;
      depreciationFactor = Math.max(depreciationFactor, 0.03); // Minimum 3%

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
        icaoCode: variant.icaoCode,
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
        category: 'used',

        // Check validity (days remaining)
        cCheckRemainingDays: cCheckRemainingDays,
        dCheckRemainingDays: dCheckRemainingDays,
        // Convert to human-readable format
        cCheckRemaining: formatDaysRemaining(cCheckRemainingDays),
        dCheckRemaining: formatDaysRemaining(dCheckRemainingDays),

        // Seller info (who's selling this used aircraft)
        seller: getUsedAircraftSeller(age, condition),
        // Lessor info (who you'd lease from)
        lessor: getRandomLessor(variant.type)
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
