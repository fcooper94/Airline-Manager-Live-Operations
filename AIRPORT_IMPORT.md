# Airport Database Import Guide

This guide explains how to import and maintain the airport database using OurAirports data.

## Overview

The system uses **OurAirports.com** as the primary data source - a comprehensive, public domain database of over 70,000 airports worldwide, updated daily.

Instead of importing all airports, we filter to the **top 10 airports per country** based on:
- Airport size (large > medium > small)
- Commercial service (IATA code required)
- Scheduled service status
- International airport designation

This provides a balanced, fair representation for users worldwide while keeping the database manageable.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

This will install `csv-parser` required for the import.

### 2. Import Modern Airports from OurAirports

```bash
npm run db:import-airports
```

**What this does:**
- Downloads latest data from OurAirports (airports.csv + countries.csv)
- Filters to ~1,500-2,000 major commercial airports worldwide
- Selects top 20 airports per country based on priority scoring
- Imports to your database with coordinates, codes, and timezones
- **WARNING:** This will REPLACE all existing airports

The script will ask for confirmation before replacing data.

### 3. Add Historical Closed Airports

```bash
npm run db:seed-historical
```

**What this does:**
- Adds 26 famous historical airports that don't exist in OurAirports:
  - VHHX - Kai Tak, Hong Kong (1925-1998)
  - EDDT - Berlin Tegel (1948-2020)
  - EDDI - Berlin Tempelhof (1923-2008)
  - EDDM - Munich-Riem (1939-1992)
  - KCGX - Meigs Field, Chicago (1948-2003)
  - KDEN - Stapleton, Denver (1929-1995)
  - LGAT - Athens Ellinikon (1938-2001)
  - ENFB - Oslo Fornebu (1939-1998)
  - YMEN - Melbourne Essendon (1921-1970)
  - WSSL - Kuala Lumpur Subang (1965-1998)
  - Plus 16 more historically significant airports
- These airports are marked as enabled (isActive: true)
- They will only appear in worlds set during their operational period based on dates

### 4. Update Operational Dates

```bash
npm run db:update-airport-dates
```

**What this does:**
- Updates all historical airports with accurate closure dates
- Sets accurate opening dates for major airports (~100 airports)
- Sets conservative defaults (1970) for remaining airports

## Import Details

### Filtering Criteria

The import selects airports using a priority scoring system:

| Criterion | Score |
|-----------|-------|
| Large airport (International Hub) | +100 |
| Medium airport (Major) | +50 |
| Small airport (Regional) | +10 |
| Has IATA code | +30 |
| Has scheduled service | +20 |
| "International" in name | +15 |

**Per Country:** Top 10 highest-scoring airports are selected.

### Data Mapping

OurAirports → Your Database:

| OurAirports Field | Your Field | Notes |
|-------------------|------------|-------|
| ident (ICAO) | icaoCode | 4-letter code (required) |
| iata_code | iataCode | 3-letter code |
| name | name | Airport name |
| municipality | city | City name |
| iso_country → name | country | Resolved from countries.csv |
| latitude_deg | latitude | Decimal degrees |
| longitude_deg | longitude | Decimal degrees |
| elevation_ft | elevation | Feet above sea level |
| type | type | Mapped to International Hub/Major/Regional |
| - | timezone | Auto-assigned by country |
| - | operationalFrom | Set by update script |
| - | operationalUntil | Set by update script (null if open) |

### Known Historical Airports

The following historical airports have accurate dates:

- **VHHX** - Kai Tak, Hong Kong (1925-1998)
- **EDDT** - Berlin Tegel (1948-2020)
- **EDDI** - Berlin Tempelhof (1923-2008)
- **LTBA** - Istanbul Atatürk (1953-2019)
- **KCGX** - Meigs Field, Chicago (1948-2003)
- **LGAT** - Athens Ellinikon (1938-2001)
- **ENFB** - Oslo Fornebu (1939-1998)

### Major Airport Opening Dates

~50 major airports have researched opening dates, including:
- JFK (1948), LAX (1930), ORD (1944)
- Heathrow (1946), CDG (1974), Schiphol (1916)
- Hong Kong Int'l (1998), Changi (1981), Incheon (2001)

See [src/scripts/updateAirportDates.js](src/scripts/updateAirportDates.js) for complete list.

## Manual Adjustments

After import, you can:

1. **Add specific airports** via Admin Panel → Airports → Add Airport
2. **Update operational dates** for specific airports you know about
3. **Disable airports** that shouldn't be available in certain worlds
4. **Adjust airport types** to better reflect their importance

## Data Freshness

OurAirports updates their data **daily**. To get the latest data:

1. Delete cached files:
   ```bash
   rm -rf data/ourairports-*.csv
   ```

2. Re-run import:
   ```bash
   npm run db:import-airports
   ```

## Customization

### Change Airports Per Country

Edit [src/scripts/importOurAirports.js](src/scripts/importOurAirports.js):

```javascript
const topAirports = filterTopAirports(filteredAirports, 10); // Change 10 to desired number
```

### Include Small Airports

Edit the `relevantTypes` filter:

```javascript
const relevantTypes = ['large_airport', 'medium_airport', 'small_airport']; // Already included
```

### Adjust Priority Scoring

Modify the scoring in `filterTopAirports()` function to weight different factors.

## Adding More Historical Dates

To add more airports with known operational dates:

1. Edit `KNOWN_HISTORICAL_AIRPORTS` in [src/scripts/updateAirportDates.js](src/scripts/updateAirportDates.js)
2. Add entry:
   ```javascript
   'ICAO': { name: 'Airport Name', operationalFrom: YYYY, operationalUntil: YYYY },
   ```
3. Re-run: `npm run db:update-airport-dates`

## Troubleshooting

### Import fails with "No ICAO code"

Some airports in OurAirports don't have valid 4-letter ICAO codes. The import automatically filters these out.

### Wrong timezone assigned

Edit `getTimezone()` function in [src/scripts/importOurAirports.js](src/scripts/importOurAirports.js) to add country-specific timezone mappings.

### Airport missing

Check if it:
- Has an IATA code
- Has scheduled service
- Is in top 10 for its country

If not, add manually via admin panel.

## Data Sources

- **Primary:** [OurAirports](https://ourairports.com/data/) - Public domain, updated daily
- **Operational dates:** Manual research from airport websites, Wikipedia, aviation history sources
- **Timezones:** Country-based approximation (can be manually refined)

## License

OurAirports data is released to the **Public Domain** with no guarantee of accuracy.

## Support

For issues or questions:
1. Check this guide
2. Review the script files for implementation details
3. Use admin panel for manual corrections
