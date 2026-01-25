const express = require('express');
const router = express.Router();
const { WorldMembership, UserAircraft, User, World } = require('../models');

/**
 * Get financial data for current world
 */
router.get('/', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const activeWorldId = req.session?.activeWorldId;
    if (!activeWorldId) {
      return res.status(400).json({ error: 'No active world selected' });
    }

    const weekOffset = parseInt(req.query.weekOffset) || 0;

    // Get user's membership
    const user = await User.findOne({ where: { vatsimId: req.user.vatsimId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const membership = await WorldMembership.findOne({
      where: { userId: user.id, worldId: activeWorldId }
    });

    if (!membership) {
      return res.status(404).json({ error: 'Not a member of this world' });
    }

    const world = await World.findByPk(activeWorldId);
    if (!world) {
      return res.status(404).json({ error: 'World not found' });
    }

    // Get fleet for lease expenses
    const fleet = await UserAircraft.findAll({
      where: { worldMembershipId: membership.id }
    });

    // Calculate lease expenses
    const leaseExpenses = fleet
      .filter(a => a.acquisitionType === 'lease' && a.status === 'active')
      .reduce((sum, a) => sum + Number(a.leaseMonthlyPayment || 0), 0);

    // Since we don't have actual weekly data yet, generate placeholder data
    // In the future, this would query actual financial transactions
    const weeks = [];
    for (let i = 0; i < 4; i++) {
      const week = {
        weekNumber: i - weekOffset,
        revenues: {
          economy: 0,
          business: 0,
          first: 0,
          cargoLight: 0,
          cargoStandard: 0,
          cargoHeavy: 0,
          total: 0
        },
        expenses: {
          staffSalaries: -2907,
          staffTraining: 0,
          fuel: 0,
          fuelFees: 0,
          maintenance: 0,
          leases: -leaseExpenses,
          insurance: 0,
          parking: 0,
          passengerFees: 0,
          navigationFees: 0,
          landingFees: 0,
          groundHandling: 0,
          groundHandlingCargo: 0,
          depreciation: 0,
          marketing: 0,
          officeRent: -348,
          fines: 0,
          allianceFees: 0,
          total: -2907 - 348 - leaseExpenses
        },
        other: {
          leaseFees: 0,
          leaseIncome: 0,
          profitOnSales: 0,
          lossOnSales: 0,
          slotFees: 0,
          bankFees: -1000,
          interest: 0,
          total: -1000
        },
        operatingProfit: 0,
        operatingMargin: 0,
        profitBeforeTaxes: 0,
        taxes: 0,
        netProfit: 0,
        netMargin: 0
      };

      // Calculate totals
      week.expenses.total = Object.values(week.expenses).reduce((sum, val) => {
        if (typeof val === 'number') return sum + val;
        return sum;
      }, 0);

      week.other.total = Object.values(week.other).reduce((sum, val) => {
        if (typeof val === 'number') return sum + val;
        return sum;
      }, 0);

      week.operatingProfit = week.revenues.total + week.expenses.total;
      week.profitBeforeTaxes = week.operatingProfit + week.other.total;
      week.netProfit = week.profitBeforeTaxes - week.taxes;

      weeks.push(week);
    }

    res.json({ weeks });
  } catch (error) {
    console.error('Error fetching financial data:', error);
    res.status(500).json({ error: 'Failed to fetch financial data' });
  }
});

module.exports = router;
