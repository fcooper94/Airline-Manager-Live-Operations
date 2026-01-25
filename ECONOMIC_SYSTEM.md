# Economic Scaling System - Historical Aviation Economics

## Overview

This document defines a globally scalable financial system that accurately represents airline economics from 1950 to 2025, balancing historical accuracy with fair gameplay.

## Core Philosophy

**Problem**: A DC-3 cost $100,000 in 1950 but $8.5M in 2024 dollars (inflation-adjusted). How do we make both eras feel authentic while maintaining game balance?

**Solution**: Hybrid approach using **Era Economic Factors** that scale all financial values relative to the time period.

---

## Era Economic Definitions

### Economic Parameters by Decade

| Era | Years | Inflation Multiplier | Starting Capital (Small) | Starting Capital (Medium) | Starting Capital (Large) | Notes |
|-----|-------|---------------------|-------------------------|--------------------------|-------------------------|-------|
| **Propeller Era** | 1936-1957 | 0.10x | $500,000 | $2,000,000 | $10,000,000 | Pre-jet age, small regional ops |
| **Early Jet Era** | 1958-1969 | 0.15x | $2,000,000 | $8,000,000 | $30,000,000 | 707/DC-8 revolution |
| **Widebody Era** | 1970-1979 | 0.25x | $10,000,000 | $40,000,000 | $150,000,000 | 747 changes everything |
| **Deregulation Era** | 1980-1989 | 0.40x | $25,000,000 | $100,000,000 | $400,000,000 | US deregulation, competition |
| **Modern Era** | 1990-1999 | 0.65x | $50,000,000 | $200,000,000 | $800,000,000 | Globalization |
| **Next-Gen Era** | 2000-2009 | 0.85x | $100,000,000 | $400,000,000 | $1,500,000,000 | 9/11, consolidation |
| **Contemporary Era** | 2010-2025 | 1.00x | $150,000,000 | $600,000,000 | $2,500,000,000 | Current market |

### Inflation Multiplier Usage

All prices in the database are stored in **2024 USD**. To display era-appropriate values:

```javascript
displayPrice = databasePrice * eraInflationMultiplier
```

**Example:**
- Boeing 707 in database: $45,000,000 (2024 USD)
- In 1960 (0.15x multiplier): $6,750,000 displayed
- In 2024 (1.00x multiplier): $45,000,000 displayed

---

## Starting Capital System

### Airline Type Scaling

Players choose airline type at world join, which determines starting capital:

#### 1950s World Example:
| Type | Description | Capital | Can Afford |
|------|-------------|---------|------------|
| **Regional Commuter** | Small props, <50 pax | $500,000 | 1-2 DC-3s |
| **Regional Carrier** | Medium props, 50-100 pax | $2,000,000 | 1 Constellation + DC-3s |
| **National Carrier** | Large operations | $10,000,000 | Multiple Constellations |

#### 2020s World Example:
| Type | Description | Capital | Can Afford |
|------|-------------|---------|------------|
| **Regional Commuter** | Small regional jets | $150,000,000 | 2-3 CRJ-700s |
| **Regional Carrier** | Medium narrowbodies | $600,000,000 | 3-4 A320s or 737s |
| **National Carrier** | Widebody operations | $2,500,000,000 | Mix of widebodies + narrowbodies |

### Dynamic Starting Capital Formula

```javascript
function getStartingCapital(airlineType, worldYear) {
  const eraMultiplier = getEraMultiplier(worldYear);

  const baseCapital = {
    'commuter': 150000000,      // $150M base (2024)
    'regional': 600000000,      // $600M base (2024)
    'national': 2500000000      // $2.5B base (2024)
  };

  return baseCapital[airlineType] * eraMultiplier;
}
```

---

## Relative Aircraft Affordability

### The Affordability Ratio

To ensure fair gameplay across eras, aircraft should cost roughly the same **percentage** of starting capital:

**Target Ratios:**
- **Entry Aircraft**: 30-50% of small starting capital (can afford 2-3 aircraft)
- **Mid-Range Aircraft**: 100-150% of small starting capital (need loans/leasing)
- **Premium Aircraft**: 300-500% of small starting capital (major investment)

### Examples:

#### 1950s:
- DC-3: $8.5M × 0.10 = **$850k** displayed
- Starting capital (small): $500k
- **Ratio**: 170% - Need modest loan for first aircraft ✓

#### 1960s:
- Boeing 707: $45M × 0.15 = **$6.75M** displayed
- Starting capital (small): $2M
- **Ratio**: 338% - Premium jet, major investment ✓

#### 2020s:
- Boeing 737-800: $105M × 1.00 = **$105M** displayed
- Starting capital (small): $150M
- **Ratio**: 70% - Can afford 1-2 aircraft ✓

---

## Operating Economics by Era

### Fuel Costs

Jet fuel prices have varied dramatically:

| Era | Real Price (per gallon) | Database Multiplier | Notes |
|-----|------------------------|---------------------|-------|
| 1950s | $0.15 | 0.08x | Very cheap fuel |
| 1970s | $0.30 | 0.12x | Oil crisis begins |
| 1980s | $0.85 | 0.35x | High oil prices |
| 1990s | $0.65 | 0.30x | Stable period |
| 2000s | $1.80 | 0.75x | Rising prices |
| 2010s | $2.50 | 0.95x | High volatility |
| 2020s | $2.80 | 1.00x | Current prices |

**Formula:**
```javascript
fuelCostPerLiter = baseFuelCost * eraFuelMultiplier
```

### Labor Costs

Pilot and crew salaries have increased dramatically:

| Era | Pilot Salary/Year | Crew Salary/Year | Multiplier |
|-----|------------------|------------------|------------|
| 1950s | $8,000 | $3,000 | 0.10x |
| 1960s | $15,000 | $5,000 | 0.15x |
| 1970s | $35,000 | $12,000 | 0.25x |
| 1980s | $60,000 | $20,000 | 0.40x |
| 1990s | $90,000 | $35,000 | 0.65x |
| 2000s | $120,000 | $50,000 | 0.85x |
| 2010-2025 | $150,000 | $65,000 | 1.00x |

### Maintenance Costs

Maintenance costs follow similar inflation patterns:

| Era | Base Cost | Multiplier | Notes |
|-----|-----------|------------|-------|
| 1950s | Low | 0.08x | Simple systems, cheap labor |
| 1970s | Medium | 0.25x | More complex jets |
| 1990s | High | 0.65x | Advanced avionics |
| 2020s | Very High | 1.00x | Complex systems, expensive |

---

## Revenue System

### Ticket Prices by Era

Ticket prices must balance historical accuracy with game economy:

#### Price per Mile Formulas

**1950s** (Propeller Era):
- Very expensive relative to income
- Only wealthy could afford to fly
- Price: $0.12/mile × 0.10 = **$0.012/mile displayed**

**1970s** (Jet Era):
- Prices dropping due to jets
- Middle class starting to fly
- Price: $0.08/mile × 0.25 = **$0.020/mile displayed**

**2000s** (Deregulation Impact):
- Low-cost carriers emerge
- Much cheaper fares
- Price: $0.15/mile × 0.85 = **$0.13/mile displayed**

**2020s** (Modern):
- Ultra-competitive market
- Variable pricing
- Price: $0.18/mile × 1.00 = **$0.18/mile displayed**

### Passenger Demand by Era

| Era | Annual PAX (Millions) | Growth Rate | Load Factor |
|-----|----------------------|-------------|-------------|
| 1950s | 50M | 10%/year | 65% |
| 1960s | 150M | 15%/year | 68% |
| 1970s | 300M | 8%/year | 70% |
| 1980s | 500M | 6%/year | 72% |
| 1990s | 1,500M | 5%/year | 75% |
| 2000s | 2,000M | 4%/year | 78% |
| 2010s | 4,000M | 5%/year | 82% |
| 2020s | 4,500M | 3%/year | 84% |

---

## Implementation Plan

### Phase 1: Database Schema (Current)
- ✅ All prices stored in 2024 USD
- ✅ Aircraft have `availableFrom`/`availableUntil` dates
- ✅ World has `era` and `currentTime` fields

### Phase 2: Era Economic Service (NEW)

Create `src/services/eraEconomicService.js`:

```javascript
class EraEconomicService {
  getEraMultiplier(year) {
    if (year < 1958) return 0.10;
    if (year < 1970) return 0.15;
    if (year < 1980) return 0.25;
    if (year < 1990) return 0.40;
    if (year < 2000) return 0.65;
    if (year < 2010) return 0.85;
    return 1.00;
  }

  convertToEraPrice(price2024USD, year) {
    return price2024USD * this.getEraMultiplier(year);
  }

  getStartingCapital(airlineType, year) {
    const baseCapital = {
      'commuter': 150000000,
      'regional': 600000000,
      'national': 2500000000
    };
    return baseCapital[airlineType] * this.getEraMultiplier(year);
  }

  getFuelCostMultiplier(year) {
    if (year < 1958) return 0.08;
    if (year < 1970) return 0.12;
    if (year < 1980) return 0.35;
    if (year < 1990) return 0.30;
    if (year < 2000) return 0.75;
    if (year < 2010) return 0.95;
    return 1.00;
  }

  getLaborCostMultiplier(year) {
    return this.getEraMultiplier(year);
  }

  getTicketPricePerMile(routeDistance, year, class) {
    // Base 2024 prices
    const basePrices = {
      economy: 0.18,
      business: 0.45,
      first: 0.90
    };

    // Distance discount (longer routes = cheaper per mile)
    const distanceMultiplier = Math.max(0.5, 1 - (routeDistance / 10000));

    return basePrices[class] * distanceMultiplier * this.getEraMultiplier(year);
  }
}
```

### Phase 3: Frontend Display (NEW)

Update all price displays to show era-appropriate values:

```javascript
// In aircraft marketplace
function displayPrice(aircraft, worldYear) {
  const eraPrice = eraEconomicService.convertToEraPrice(
    aircraft.purchasePrice,
    worldYear
  );

  return formatCurrency(eraPrice, worldYear);
}

function formatCurrency(amount, year) {
  // Show appropriate currency symbol and format
  const symbol = year < 2002 && isEuropean ? '₣' : '$';
  return `${symbol}${amount.toLocaleString()}`;
}
```

### Phase 4: Starting Capital Update

Update world join flow in `src/routes/world.js`:

```javascript
router.post('/join', async (req, res) => {
  const { worldId, airlineType, airlineName, airlineCode, baseAirportId } = req.body;

  const world = await World.findByPk(worldId);
  const worldYear = new Date(world.currentTime).getFullYear();

  const startingCapital = eraEconomicService.getStartingCapital(
    airlineType,
    worldYear
  );

  const membership = await WorldMembership.create({
    userId: req.user.id,
    worldId,
    airlineName,
    airlineCode,
    baseAirportId,
    balance: startingCapital, // Era-appropriate starting capital
    airlineType
  });

  res.json({ success: true, startingCapital });
});
```

---

## Game Balance Verification

### Test Scenarios

#### Scenario 1: 1950 Regional Startup
- **Starting Capital**: $500,000
- **First Aircraft**: DC-3 ($850,000)
- **Action**: Take loan for $350,000
- **Monthly Payment**: ~$5,000
- **First Route Revenue**: $8,000/month
- **Outcome**: Profitable after 6 months ✓

#### Scenario 2: 1970 Jet Startup
- **Starting Capital**: $10,000,000
- **First Aircraft**: 737-200 ($15,000,000)
- **Action**: Take loan for $5,000,000
- **Monthly Payment**: ~$75,000
- **First Route Revenue**: $150,000/month
- **Outcome**: Profitable after 8 months ✓

#### Scenario 3: 2020 Low-Cost Carrier
- **Starting Capital**: $150,000,000
- **First Aircraft**: 737-800 ($105,000,000)
- **Action**: Lease aircraft at $400,000/month
- **Monthly Revenue**: $800,000/month
- **Outcome**: Profitable immediately ✓

---

## Currency Display Options

### Option A: Always Show USD (Simple)
```
1950: DC-3 costs $850,000
2020: 737-800 costs $105,000,000
```

### Option B: Era-Appropriate Currency (Immersive)
```
1950: DC-3 costs £305,000 (UK airline)
1980: A300 costs 120,000,000₣ (French airline)
2020: A350 costs €225,000,000 (EU airline)
```

### Option C: Hybrid (Recommended)
```
Primary Display: Era USD
Tooltip: "(2024 equivalent: $8.5M)"
```

---

## Recommended Implementation Order

1. **Create Era Economic Service** - Core calculations
2. **Update Starting Capital** - Balanced by era
3. **Add Frontend Price Conversion** - Display era prices
4. **Adjust Fuel/Labor Costs** - Operating expense scaling
5. **Implement Revenue System** - Era-appropriate ticket pricing
6. **Add Economic Tooltips** - Help players understand economics

---

## Summary

This system ensures:
- ✅ **Historical Accuracy**: Prices feel authentic to each era
- ✅ **Game Balance**: Similar difficulty across all time periods
- ✅ **Fair Competition**: No era has unfair advantage
- ✅ **Immersive Experience**: Numbers feel "right" for the time period
- ✅ **Scalable**: Easy to add new eras or adjust parameters

The key insight: **Store in 2024 USD, display in era dollars, balance by relative affordability.**
