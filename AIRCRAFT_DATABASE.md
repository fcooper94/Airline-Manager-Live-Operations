# Aircraft Database Guide

This guide explains the comprehensive historical aircraft database covering commercial aviation from 1950 to present.

## Overview

The aircraft database contains **50+ carefully researched aircraft models** spanning 75 years of commercial aviation history:

- **1950s Era:** Classic propeller aircraft and early jets (DC-3, Constellation, Comet 4, 707)
- **1960s Era:** Jet age expansion (727, 737 Original, DC-8, DC-9)
- **1970s Era:** Widebody revolution (747, DC-10, L-1011, A300, Concorde)
- **1980s Era:** Modern efficiency (757, 767, A310, A320, MD-80)
- **1990s Era:** ETOPS & regional jets (777, A330/A340, MD-11, CRJ, ERJ)
- **2000s Era:** Next generation (A380, 787, A350, 747-8)
- **2010s-Present:** Latest technology (737 MAX, A320neo, A220, 777X)

All aircraft are enabled by default (`isActive: true`) - the `availableFrom` and `availableUntil` dates control which worlds they appear in.

## Quick Start

### Import Historical Aircraft Database

```bash
npm run db:seed-historical-aircraft
```

**What this does:**
- Adds 50+ aircraft models from 1950-present
- Includes retired classics (DC-3, 707, Concorde, L-1011)
- Includes modern aircraft (787, A350, 737 MAX, A320neo)
- All aircraft enabled - availability dates control world access
- Prices adjusted for inflation to 2024 USD values

The script will automatically update existing aircraft if re-run.

## Aircraft Database Structure

Each aircraft includes:

| Field | Description | Example |
|-------|-------------|---------|
| **manufacturer** | Boeing, Airbus, Douglas, etc. | Boeing |
| **model** | Aircraft model number | 747 |
| **variant** | Specific variant | 400 |
| **type** | Narrowbody, Widebody, Regional, Cargo | Widebody |
| **rangeCategory** | Short/Medium/Long Haul | Long Haul |
| **rangeNm** | Maximum range in nautical miles | 7260 |
| **cruiseSpeed** | Typical cruise speed in knots | 493 |
| **passengerCapacity** | Typical passenger configuration | 416 |
| **cargoCapacityKg** | Cargo capacity in kilograms | 45000 |
| **fuelCapacityLiters** | Fuel capacity in liters | 216840 |
| **purchasePrice** | New purchase price (2024 USD) | 260000000 |
| **usedPrice** | Used market price (2024 USD) | 120000000 |
| **maintenanceCostPerHour** | Hourly maintenance cost | 4000 |
| **maintenanceCostPerMonth** | Monthly maintenance cost | 360000 |
| **fuelBurnPerHour** | Fuel consumption (liters/hour) | 12000 |
| **firstIntroduced** | Year first introduced | 1989 |
| **availableFrom** | Year available in game | 1989 |
| **availableUntil** | Year retired (null = still available) | 2018 |
| **requiredPilots** | Number of pilots required | 2 |
| **requiredCabinCrew** | Number of cabin crew | 9 |
| **isActive** | Admin control (always true by default) | true |
| **description** | Aircraft description | Improved 747... |

## Aircraft by Era

### 1950s - Propeller & Early Jets (3 aircraft)

**Douglas DC-3** (1936-1975)
- The legendary propeller aircraft that revolutionized air travel
- 32 passengers, 1,500 nm range
- Available at game start (1950) for historical scenarios

**Lockheed L-1049 Super Constellation** (1951-1968)
- Iconic triple-tail luxury propeller airliner
- 95 passengers, 2,400 nm range
- Symbol of 1950s elegance

**de Havilland Comet 4** (1958-1981)
- First commercial jetliner
- 81 passengers, 3,225 nm range
- Pioneered jet travel but had design challenges

### 1960s - Jet Age Begins (5 aircraft)

**Boeing 707-320B** (1958-1991)
- Aircraft that started the jet age
- 189 passengers, 4,300 nm range
- Required 3 crew (flight engineer)

**Douglas DC-8-63** (1959-1995)
- Douglas rival to 707
- 259 passengers, 4,500 nm range
- Stretched Super 60 series

**Boeing 727-200** (1963-2001)
- Tri-jet workhorse - short runway capability
- 189 passengers, 1,900 nm range
- Most successful tri-jet ever

**Boeing 737-200** (1968-2000)
- Original 737 - started most successful family
- 130 passengers, 2,370 nm range
- Foundation for modern 737s

**Douglas DC-9-30** (1965-1990)
- Popular short-haul jet
- 115 passengers, 1,450 nm range
- Competed with early 737

**BAC One-Eleven 500** (1963-1989)
- British short-haul jet
- 119 passengers, 1,480 nm range
- Rear-mounted engines

### 1970s - Widebody Revolution (6 aircraft)

**Boeing 747-100** (1970-1993)
- Queen of the Skies - revolutionary jumbo jet
- 366 passengers, 5,300 nm range
- Changed aviation forever

**McDonnell Douglas DC-10-30** (1971-2000)
- Tri-jet widebody competitor
- 380 passengers, 5,200 nm range
- Versatile long-haul aircraft

**Lockheed L-1011 TriStar** (1972-1984)
- Advanced tri-jet with sophisticated systems
- 400 passengers, 4,850 nm range
- Technologically ahead of its time

**Airbus A300-B4** (1974-2007)
- First Airbus - twin-engine widebody pioneer
- 266 passengers, 3,900 nm range
- Started European competition

**Aerospatiale-BAC Concorde** (1976-2003)
- Supersonic legend - flew at Mach 2.04
- 100 passengers, 3,900 nm range
- Very high operating costs, prestigious

**Boeing 737-300** (1984-2008)
- 737 Classic - improved and stretched
- 149 passengers, 2,800 nm range

### 1980s - Modern Efficiency (5 aircraft)

**Boeing 757-200** (1983-2005)
- Narrow widebody with powerful engines
- 200 passengers, 3,900 nm range
- Exceptional performance

**Boeing 767-300ER** (1982-present)
- Twin widebody - pioneered ETOPS
- 269 passengers, 6,385 nm range
- Still produced as freighter

**Airbus A310-300** (1983-2007)
- Shortened A300 with glass cockpit
- 220 passengers, 5,150 nm range

**Airbus A320-200** (1988-present)
- Revolutionary fly-by-wire narrowbody
- 180 passengers, 3,300 nm range
- Challenged 737 dominance

**McDonnell Douglas MD-80-83** (1980-1999)
- Stretched DC-9 - very popular in 1980s
- 155 passengers, 2,900 nm range

**Boeing 747-400** (1989-2018)
- Improved 747 - glass cockpit, winglets
- 416 passengers, 7,260 nm range
- Dominant long-haul aircraft for decades

### 1990s - ETOPS & Regional Jets (7 aircraft)

**Boeing 777-200ER** (1995-present)
- First fly-by-wire Boeing - largest twin jet
- 317 passengers, 7,065 nm range
- Revolutionized long-haul operations

**Airbus A330-300** (1993-present)
- Twin widebody with A340 commonality
- 335 passengers, 6,350 nm range

**Airbus A340-300** (1993-2011)
- Four-engine ultra long range
- 295 passengers, 7,400 nm range

**McDonnell Douglas MD-11** (1990-2000)
- Stretched DC-10 - last MD commercial jet
- 323 passengers, 7,240 nm range

**Boeing 737-800** (1998-present)
- 737 Next Generation with modern avionics
- 189 passengers, 3,115 nm range
- Best-selling 737 variant

**Bombardier CRJ-700** (2001-present)
- Stretched CRJ regional jet
- 78 passengers, 1,600 nm range

**Embraer ERJ 145** (1996-present)
- Brazilian regional jet - very successful
- 50 passengers, 1,550 nm range

### 2000s - Next Generation (5 aircraft)

**Airbus A380-800** (2007-2021)
- Largest passenger aircraft - superjumbo
- 525 passengers, 8,000 nm range
- Double-decker giant

**Boeing 787-9 Dreamliner** (2011-present)
- Composite construction, fuel efficient
- 296 passengers, 7,635 nm range
- Revolutionary materials

**Airbus A350-900** (2013-present)
- Carbon fiber widebody - 787 competitor
- 325 passengers, 8,100 nm range

**Boeing 747-8** (2012-2023)
- Final 747 variant - stretched & modernized
- 467 passengers, 8,000 nm range
- End of an era

**Embraer E195-E2** (2019-present)
- Next-gen E-Jet - efficient regional
- 146 passengers, 2,600 nm range

### 2010s-Present - Latest Generation (5 aircraft)

**Boeing 737 MAX 8** (2017-present)
- Latest 737 with LEAP engines
- 178 passengers, 3,550 nm range
- Improved efficiency

**Airbus A320neo** (2015-present)
- New Engine Option - 15% fuel savings
- 180 passengers, 3,300 nm range
- Best-selling narrowbody

**Airbus A220-300** (2016-present)
- Former Bombardier C Series - very efficient
- 160 passengers, 3,350 nm range
- Clean-sheet design

**Boeing 777-9X** (2020-present)
- Latest 777 with folding wingtips
- 426 passengers, 7,285 nm range
- Ultra-efficient twin

**Airbus A350-1000** (2018-present)
- Stretched A350 - longest range commercial jet
- 369 passengers, 8,700 nm range

### Cargo Aircraft (3 aircraft)

**Boeing 777F** (2009-present)
- Heavy cargo - 102,000 kg capacity
- 5,625 nm range

**Boeing 747-8F** (2011-present)
- Largest 747 freighter - 134,000 kg capacity
- 4,390 nm range
- Still in production

**Airbus A330-200F** (2010-present)
- Medium cargo - 70,000 kg capacity
- 4,000 nm range

## Historical Pricing

All prices are adjusted for inflation to **2024 USD values** to maintain game balance:

- **DC-3 (1936):** $8.5M new - inflation-adjusted from ~$100,000 original price
- **Boeing 707 (1958):** $45M new - adjusted from ~$5M
- **Boeing 747-100 (1970):** $180M new - adjusted from ~$24M
- **Boeing 787 (2011):** $280M new - close to actual 2024 price
- **A380 (2007):** $450M new - actual 2024 list price

This ensures fair gameplay across different eras while maintaining historical aircraft characteristics.

## World Integration

Aircraft availability automatically adjusts based on world year:

**Example: 1970 World**
- ✓ Available: DC-3, Constellation, Comet 4, 707, 727, DC-8, DC-9, 737-200, BAC One-Eleven, 747-100 (new!)
- ✗ Not available: Any aircraft introduced after 1970

**Example: 1990 World**
- ✓ Available: All 1950s-1980s aircraft still in service
- ✗ Retired: DC-3, Constellation, Comet 4, early 707s
- ✓ New: 747-400, MD-11, 767, 757, A320, A310

**Example: 2024 World**
- ✓ Available: Modern fleet (737 MAX, A320neo, 787, A350, 777X, etc.)
- ✗ Retired: All classic jets (707, 727, DC-10, L-1011, early 747s, Concorde, A380)

## Game Mechanics

### Crew Requirements

**Three-Crew Aircraft (Flight Engineer Era):**
- 707, DC-8, 727, early 747s, DC-10, L-1011, A300 (early)
- Higher crew costs
- Available 1958-1989

**Two-Crew Aircraft (Modern):**
- All aircraft from 1988 onwards (glass cockpits)
- Lower crew costs
- Better economics

### Operating Costs

Aircraft economics vary significantly:

**Most Economical:**
- A220-300: $1,400/hour, 2,100 L/hour
- 737-200: $1,400/hour, 2,800 L/hour
- A320neo: $1,600/hour, 2,400 L/hour

**Least Economical:**
- Concorde: $8,000/hour, 25,600 L/hour (supersonic!)
- A380: $5,000/hour, 14,500 L/hour
- 747-8F: $4,800/hour, 11,500 L/hour

### Aircraft Lifespan

Retired aircraft (`availableUntil` set) represent:
- End of passenger production
- Withdrawal from major airline service
- Still available in historical worlds during their operational period

Currently available aircraft (`availableUntil: null`) can be purchased in any world after their introduction year.

## Data Sources

Aircraft data compiled from:
- **Manufacturer specifications** (Boeing, Airbus, Embraer, Bombardier)
- **Aviation databases** (Planespotters, Airfleets, ch-aviation)
- **Historical records** (delivery dates, retirement years)
- **Operating cost estimates** (adjusted for 2024 values)
- **Wikipedia aviation project** (cross-referenced dates and specifications)

## Customization

### Add Custom Aircraft

You can add more aircraft by editing [src/scripts/seedHistoricalAircraft.js](src/scripts/seedHistoricalAircraft.js):

```javascript
{
  manufacturer: 'Manufacturer',
  model: 'Model',
  variant: 'Variant or null',
  type: 'Narrowbody|Widebody|Regional|Cargo',
  rangeCategory: 'Short Haul|Medium Haul|Long Haul',
  rangeNm: 5000,
  cruiseSpeed: 480,
  passengerCapacity: 250,
  cargoCapacityKg: 30000,
  fuelCapacityLiters: 100000,
  purchasePrice: 150000000,
  usedPrice: 80000000,
  maintenanceCostPerHour: 2500,
  maintenanceCostPerMonth: 200000,
  fuelBurnPerHour: 6000,
  firstIntroduced: 1995,
  availableFrom: 1995,
  availableUntil: null, // or year if retired
  requiredPilots: 2,
  requiredCabinCrew: 5,
  isActive: true,
  description: 'Aircraft description'
}
```

Then re-run: `npm run db:seed-historical-aircraft`

### Adjust Pricing

To rebalance aircraft economics, edit the price fields in the seed file and re-run the import.

## Database Stats

After import:
- **Total Aircraft:** 50+
- **Narrowbody:** ~25 models
- **Widebody:** ~20 models
- **Regional:** ~5 models
- **Cargo:** ~3 models
- **Retired Aircraft:** ~20 models
- **Currently Available:** ~30+ models
- **Era Coverage:** 1936-2024 (88 years)

## Support

For issues or questions:
1. Review this guide
2. Check [src/scripts/seedHistoricalAircraft.js](src/scripts/seedHistoricalAircraft.js) for implementation details
3. Use admin panel for manual corrections or additions

## License

Aircraft specifications are factual data compiled from public sources. Prices and operating costs are estimates adjusted for game balance.
