/**
 * Airport Growth Service
 *
 * Dynamically calculates traffic demand and infrastructure levels based on:
 * - World year (airports grow over time)
 * - Real-world 2024 passenger data
 * - Historical airport development patterns
 */

class AirportGrowthService {
  /**
   * Historical passenger data for major airports (millions/year)
   * Key data points for accurate interpolation
   * Sources: Airport authority reports, ACI World, FAA statistics, Eurostat
   */
  HISTORICAL_PASSENGER_DATA = {
    // USA - Major Hubs
    'KATL': { 1955: 2.1, 1970: 16.5, 1980: 46.9, 1990: 48.0, 2000: 80.2, 2010: 89.3, 2019: 110.5, 2024: 104 },
    'KORD': { 1960: 10.2, 1970: 26.8, 1980: 37.5, 1990: 59.1, 2000: 72.1, 2010: 66.8, 2019: 84.6, 2024: 74 },
    'KLAX': { 1960: 9.9, 1970: 18.5, 1980: 28.9, 1990: 45.9, 2000: 66.4, 2010: 59.1, 2019: 88.1, 2024: 75 },
    'KDFW': { 1975: 15.2, 1980: 24.1, 1990: 48.5, 2000: 60.7, 2010: 57.0, 2019: 75.1, 2024: 81 },
    'KJFK': { 1955: 4.5, 1970: 16.1, 1980: 24.2, 1990: 27.1, 2000: 32.8, 2010: 46.5, 2019: 62.5, 2024: 59 },
    'KDEN': { 1996: 31.0, 2000: 38.8, 2010: 52.2, 2019: 69.0, 2024: 77 },
    'KSEA': { 1970: 8.5, 1980: 13.0, 1990: 20.4, 2000: 28.5, 2010: 31.9, 2019: 51.8, 2024: 53 },
    'KSFO': { 1960: 5.5, 1970: 14.2, 1980: 21.5, 1990: 30.9, 2000: 40.4, 2010: 39.5, 2019: 57.8, 2024: 36 },
    'KLAS': { 1970: 6.5, 1980: 14.5, 1990: 23.5, 2000: 36.9, 2010: 39.8, 2019: 51.5, 2024: 57 },
    'KMIA': { 1970: 11.8, 1980: 20.2, 1990: 27.0, 2000: 35.3, 2010: 35.4, 2019: 45.9, 2024: 46 },
    'KEWR': { 1970: 15.5, 1980: 24.5, 1990: 29.0, 2000: 34.2, 2010: 33.1, 2019: 46.3, 2024: 45 },
    'KMCO': { 1982: 8.5, 1990: 21.1, 2000: 30.0, 2010: 34.6, 2019: 50.6, 2024: 51 },
    'KPHX': { 1970: 4.2, 1980: 11.8, 1990: 22.0, 2000: 35.8, 2010: 38.6, 2019: 46.0, 2024: 48 },
    'KIAH': { 1970: 7.5, 1980: 16.2, 1990: 25.5, 2000: 36.5, 2010: 40.1, 2019: 45.4, 2024: 47 },
    'KBOS': { 1970: 12.0, 1980: 18.5, 1990: 25.3, 2000: 27.0, 2010: 27.9, 2019: 42.5, 2024: 38 },
    'KCLT': { 1990: 15.2, 2000: 27.5, 2010: 38.5, 2019: 50.2, 2024: 49 },
    'KMSP': { 1970: 10.5, 1980: 15.8, 1990: 22.5, 2000: 33.2, 2010: 34.0, 2019: 39.5, 2024: 40 },
    'KDTW': { 1970: 8.2, 1980: 14.5, 1990: 23.8, 2000: 35.5, 2010: 30.9, 2019: 36.4, 2024: 35 },
    'KSLC': { 1970: 3.5, 1980: 8.2, 1990: 15.5, 2000: 20.6, 2010: 21.0, 2019: 26.8, 2024: 27 },

    // Europe - Major Hubs
    'EGLL': { 1955: 5.0, 1970: 15.7, 1980: 27.5, 1990: 38.0, 2000: 64.6, 2010: 65.9, 2019: 80.9, 2024: 79 },
    'LFPG': { 1980: 15.8, 1990: 25.3, 2000: 48.2, 2010: 58.2, 2019: 76.2, 2024: 67 },
    'EHAM': { 1955: 1.0, 1970: 6.3, 1980: 12.5, 1990: 16.2, 2000: 39.6, 2010: 45.2, 2019: 71.7, 2024: 58 },
    'EDDF': { 1970: 12.4, 1980: 17.3, 1990: 29.1, 2000: 49.4, 2010: 53.0, 2019: 70.6, 2024: 55 },
    'LEMD': { 1970: 4.5, 1980: 10.2, 1990: 16.1, 2000: 32.9, 2010: 49.9, 2019: 61.7, 2024: 45 },
    'LEBL': { 1970: 3.2, 1980: 7.8, 1990: 12.5, 2000: 21.3, 2010: 29.2, 2019: 52.7, 2024: 43 },
    'LIRF': { 1965: 3.5, 1980: 12.8, 1990: 20.5, 2000: 26.0, 2010: 36.3, 2019: 43.5, 2024: 44 },
    'EGKK': { 1970: 3.8, 1980: 10.2, 1990: 18.5, 2000: 31.0, 2010: 31.4, 2019: 46.6, 2024: 42 },
    'EDDM': { 1995: 17.5, 2000: 23.2, 2010: 34.7, 2019: 47.9, 2024: 48 },
    'LOWW': { 1970: 3.2, 1980: 5.8, 1990: 10.5, 2000: 11.8, 2010: 19.7, 2019: 31.7, 2024: 33 },
    'LSZH': { 1970: 5.5, 1980: 8.8, 1990: 13.2, 2000: 22.7, 2010: 22.9, 2019: 31.5, 2024: 17 },
    'EGCC': { 1970: 3.0, 1980: 7.2, 1990: 12.5, 2000: 18.3, 2010: 18.8, 2019: 29.4, 2024: 30 },
    'LFPO': { 1960: 2.5, 1970: 8.5, 1980: 15.2, 1990: 20.8, 2000: 24.9, 2010: 26.2, 2019: 33.1, 2024: 47 },
    'LPPT': { 1980: 4.5, 1990: 7.8, 2000: 12.0, 2010: 14.0, 2019: 31.0, 2024: 33 },
    'ESSA': { 1965: 2.8, 1980: 8.5, 1990: 11.8, 2000: 17.3, 2010: 18.6, 2019: 27.4, 2024: 32 },
    'EKCH': { 1960: 2.0, 1980: 9.2, 1990: 13.5, 2000: 19.0, 2010: 21.5, 2019: 30.3, 2024: 24 },

    // Asia - Major Hubs
    'RJTT': { 1960: 3.2, 1970: 10.5, 1980: 21.7, 1990: 35.3, 2000: 56.4, 2010: 64.2, 2019: 87.1, 2024: 78 },
    'RJAA': { 1980: 12.5, 1990: 22.3, 2000: 30.7, 2010: 31.9, 2019: 43.9, 2024: 70 },
    'RJBB': { 1995: 14.2, 2000: 17.5, 2010: 13.3, 2019: 31.9, 2024: 35 },
    'ZBAA': { 1980: 2.5, 1990: 8.2, 2000: 21.7, 2010: 73.9, 2019: 100.0, 2024: 83 },
    'ZSPD': { 2000: 10.2, 2005: 20.0, 2010: 40.6, 2019: 76.2, 2024: 52 },
    'ZGSZ': { 2000: 5.8, 2010: 26.7, 2015: 39.8, 2019: 52.9, 2024: 56 },
    'RKSI': { 2002: 20.5, 2005: 23.4, 2010: 33.5, 2019: 71.2, 2024: 62 },
    'VHHH': { 1999: 29.5, 2000: 33.1, 2010: 50.9, 2019: 71.5, 2024: 42 },
    'WSSS': { 1990: 15.3, 2000: 28.0, 2010: 42.0, 2019: 68.3, 2024: 63 },
    'VTBS': { 2007: 41.2, 2010: 42.8, 2015: 52.8, 2019: 65.9, 2024: 60 },
    'WMKK': { 1999: 15.8, 2005: 26.7, 2010: 37.7, 2019: 62.3, 2024: 52 },
    'VIDP': { 1970: 3.5, 1980: 5.8, 1990: 8.5, 2000: 12.8, 2010: 34.0, 2019: 69.9, 2024: 64 },
    'VABB': { 1970: 2.8, 1980: 4.5, 1990: 8.2, 2000: 15.5, 2010: 30.1, 2019: 49.8, 2024: 34 },

    // Middle East
    'OMDB': { 1990: 3.1, 2000: 11.8, 2010: 47.2, 2015: 78.0, 2019: 86.4, 2024: 87 },
    'OTHH': { 2015: 30.2, 2017: 37.3, 2019: 38.8, 2022: 37.3, 2024: 31 },
    'LTFM': { 2019: 52.0, 2020: 23.4, 2022: 64.3, 2024: 76 },
    'OERK': { 2000: 15.2, 2010: 20.3, 2019: 39.5, 2024: 38 },
    'OMAA': { 1990: 2.5, 2000: 5.8, 2010: 12.0, 2019: 21.3, 2024: 19 },

    // Oceania
    'YSSY': { 1970: 5.8, 1980: 11.6, 1990: 18.1, 2000: 28.6, 2010: 35.6, 2019: 44.4, 2024: 56 },
    'YMML': { 1975: 5.2, 1985: 8.5, 1995: 15.2, 2005: 22.8, 2010: 25.2, 2019: 37.7, 2024: 38 },
    'YBBN': { 1990: 8.5, 2000: 14.0, 2010: 18.9, 2019: 24.2, 2024: 24 },
    'NZAA': { 1980: 3.5, 1990: 6.8, 2000: 10.5, 2010: 13.0, 2019: 21.2, 2024: 21 },

    // Latin America
    'SBGR': { 1990: 8.5, 2000: 15.2, 2010: 27.9, 2019: 42.0, 2024: 44 },
    'SCEL': { 1980: 3.2, 1990: 5.5, 2000: 7.5, 2010: 12.3, 2019: 24.0, 2024: 25 },
    'MMMX': { 1970: 5.2, 1980: 10.5, 1990: 15.8, 2000: 22.0, 2010: 24.1, 2019: 50.3, 2024: 48 },
    'SKBO': { 1980: 4.5, 1990: 7.2, 2000: 10.5, 2010: 18.7, 2019: 35.6, 2024: 35 },
    'SAEZ': { 1970: 4.8, 1980: 7.5, 1990: 9.2, 2000: 7.5, 2010: 9.5, 2019: 11.5, 2024: 13 },

    // Africa
    'FAOR': { 1970: 3.5, 1980: 6.8, 1990: 10.2, 2000: 13.5, 2010: 18.7, 2019: 21.5, 2024: 35 },
    'HECA': { 1980: 4.5, 1990: 6.8, 2000: 9.5, 2010: 14.2, 2019: 18.5, 2024: 20 },

    // Canada
    'CYYZ': { 1960: 2.8, 1970: 8.5, 1980: 15.2, 1990: 20.5, 2000: 28.8, 2010: 31.2, 2019: 50.5, 2024: 50 },
    'CYVR': { 1970: 3.5, 1980: 7.2, 1990: 11.8, 2000: 15.3, 2010: 17.0, 2019: 26.4, 2024: 26 },
    'CYUL': { 1970: 5.2, 1980: 8.5, 1990: 9.8, 2000: 10.5, 2010: 13.0, 2019: 20.3, 2024: 21 },
  };

  /**
   * Top 50 busiest airports in 2024 with passenger numbers (millions/year)
   * Now includes infrastructure milestone dates for realistic growth patterns
   *
   * Infrastructure milestones represent major upgrades:
   * - Terminal openings
   * - Runway additions
   * - Major renovations
   * - Technology upgrades
   */
  AIRPORT_2024_DATA = {
    // Top 10 - Traffic level 10
    'KATL': {
      pax2024: 104, opened: 1926, majorFrom: 1961,
      infraMilestones: [
        { year: 1961, level: 4, reason: 'New terminal complex' },
        { year: 1980, level: 6, reason: 'Midfield terminal' },
        { year: 2002, level: 8, reason: 'International concourse' },
        { year: 2012, level: 9, reason: 'Maynard Jackson terminal' },
        { year: 2020, level: 10, reason: 'Modernization complete' }
      ]
    },
    'OMDB': {
      pax2024: 87, opened: 1960, majorFrom: 1985,
      infraMilestones: [
        { year: 1985, level: 4, reason: 'Sheikh Rashid terminal' },
        { year: 2000, level: 6, reason: 'Terminal 2 expansion' },
        { year: 2008, level: 8, reason: 'Terminal 3 - world\'s largest' },
        { year: 2016, level: 9, reason: 'Concourse D' },
        { year: 2023, level: 10, reason: 'Al Maktoum expansion' }
      ]
    },
    'KDFW': {
      pax2024: 81, opened: 1974, majorFrom: 1974,
      infraMilestones: [
        { year: 1974, level: 5, reason: 'Airport opens - modern design' },
        { year: 1985, level: 7, reason: 'Terminal expansions' },
        { year: 2005, level: 8, reason: 'International terminal D' },
        { year: 2019, level: 10, reason: 'Terminal renewal complete' }
      ]
    },
    'EGLL': {
      pax2024: 79, opened: 1946, majorFrom: 1955,
      infraMilestones: [
        { year: 1955, level: 3, reason: 'Post-war facilities' },
        { year: 1968, level: 5, reason: 'Terminal 1 opens' },
        { year: 1986, level: 6, reason: 'Terminal 4' },
        { year: 2008, level: 8, reason: 'Terminal 5 - £4.3B project' },
        { year: 2014, level: 9, reason: 'Terminal 2 - Queen\'s Terminal' },
        { year: 2022, level: 10, reason: 'Full automation systems' }
      ]
    },
    'RJTT': {
      pax2024: 78, opened: 1931, majorFrom: 1964,
      infraMilestones: [
        { year: 1964, level: 4, reason: 'Tokyo Olympics upgrade' },
        { year: 1993, level: 6, reason: 'Terminal 1 & 2' },
        { year: 2004, level: 7, reason: 'International terminal' },
        { year: 2010, level: 8, reason: 'D runway expansion' },
        { year: 2020, level: 10, reason: 'Olympics modernization' }
      ]
    },
    'KDEN': {
      pax2024: 77, opened: 1995, majorFrom: 1995,
      infraMilestones: [
        { year: 1995, level: 7, reason: 'New airport - modern from start' },
        { year: 2006, level: 8, reason: 'Terminal expansions' },
        { year: 2021, level: 10, reason: 'Great Hall renovation' }
      ]
    },
    'LTFM': {
      pax2024: 76, opened: 2019, majorFrom: 2019,
      infraMilestones: [
        { year: 2019, level: 10, reason: 'Brand new - state of the art' }
      ]
    },
    'KLAX': {
      pax2024: 75, opened: 1930, majorFrom: 1960,
      infraMilestones: [
        { year: 1960, level: 4, reason: 'Jet age terminals' },
        { year: 1984, level: 6, reason: 'Olympics upgrade - Tom Bradley' },
        { year: 2013, level: 8, reason: 'Tom Bradley renovation' },
        { year: 2023, level: 9, reason: 'Automated people mover' }
      ]
    },
    'KORD': {
      pax2024: 74, opened: 1955, majorFrom: 1955,
      infraMilestones: [
        { year: 1955, level: 5, reason: 'Opens as modern jet-age airport' },
        { year: 1993, level: 7, reason: 'International terminal 5' },
        { year: 2018, level: 9, reason: 'O\'Hare 21 modernization begins' }
      ]
    },
    'LFPG': {
      pax2024: 67, opened: 1974, majorFrom: 1974,
      infraMilestones: [
        { year: 1974, level: 6, reason: 'Opens - purpose-built hub' },
        { year: 1989, level: 7, reason: 'Terminal 2 expansion' },
        { year: 2003, level: 8, reason: 'Terminal 2E - largest' },
        { year: 2012, level: 9, reason: 'Satellite 4 terminal' }
      ]
    },

    // Level 9 (60-66M)
    'ZGGG': {
      pax2024: 66, opened: 2004, majorFrom: 2010,
      infraMilestones: [
        { year: 2004, level: 6, reason: 'New airport opens' },
        { year: 2018, level: 9, reason: 'Terminal 2 - massive expansion' }
      ]
    },
    'VIDP': {
      pax2024: 64, opened: 1962, majorFrom: 1986,
      infraMilestones: [
        { year: 1986, level: 4, reason: 'Modernization begins' },
        { year: 2010, level: 7, reason: 'Terminal 3 - Commonwealth Games' },
        { year: 2023, level: 9, reason: 'Full renovation complete' }
      ]
    },
    'WSSS': {
      pax2024: 63, opened: 1981, majorFrom: 1981,
      infraMilestones: [
        { year: 1981, level: 6, reason: 'Opens - award-winning design' },
        { year: 1990, level: 7, reason: 'Terminal 2' },
        { year: 2008, level: 8, reason: 'Terminal 3 - world class' },
        { year: 2019, level: 10, reason: 'Jewel Changi - innovation hub' }
      ]
    },
    'RKSI': {
      pax2024: 62, opened: 2001, majorFrom: 2001,
      infraMilestones: [
        { year: 2001, level: 7, reason: 'New airport - modern design' },
        { year: 2018, level: 10, reason: 'Terminal 2 - tech showcase' }
      ]
    },

    // Level 8 (50-60M)
    'KJFK': {
      pax2024: 59, opened: 1948, majorFrom: 1960,
      infraMilestones: [
        { year: 1960, level: 4, reason: 'Jet age begins' },
        { year: 1998, level: 6, reason: 'Terminal 4 international' },
        { year: 2008, level: 7, reason: 'Terminal 5 JetBlue' },
        { year: 2023, level: 9, reason: 'Terminal 1 complete rebuild' }
      ]
    },
    'EHAM': {
      pax2024: 58, opened: 1920, majorFrom: 1950,
      infraMilestones: [
        { year: 1950, level: 3, reason: 'Post-war rebuild' },
        { year: 1967, level: 5, reason: 'Schiphol Plaza' },
        { year: 1993, level: 7, reason: 'New pier system' },
        { year: 2023, level: 9, reason: 'Sustainable terminal A' }
      ]
    },
    'KLAS': {
      pax2024: 57, opened: 1942, majorFrom: 1980,
      infraMilestones: [
        { year: 1980, level: 4, reason: 'Gaming boom expansion' },
        { year: 1998, level: 6, reason: 'D Gates international' },
        { year: 2012, level: 8, reason: 'Terminal 3 complete' }
      ]
    },
    'YSSY': {
      pax2024: 56, opened: 1920, majorFrom: 1960,
      infraMilestones: [
        { year: 1960, level: 4, reason: 'Jet age facilities' },
        { year: 1993, level: 6, reason: 'International terminal' },
        { year: 2010, level: 8, reason: 'T1 redevelopment' }
      ]
    },
    'EDDF': {
      pax2024: 55, opened: 1936, majorFrom: 1972,
      infraMilestones: [
        { year: 1972, level: 5, reason: 'Major hub development' },
        { year: 1994, level: 7, reason: 'Terminal 2' },
        { year: 2012, level: 8, reason: 'Northwest runway' },
        { year: 2022, level: 9, reason: 'Terminal 3 expansion' }
      ]
    },
    'KSEA': {
      pax2024: 53, opened: 1949, majorFrom: 1990,
      infraMilestones: [
        { year: 1990, level: 5, reason: 'International expansion' },
        { year: 2005, level: 7, reason: 'Central terminal' },
        { year: 2021, level: 9, reason: 'International arrivals facility' }
      ]
    },
    'ZSPD': {
      pax2024: 52, opened: 1999, majorFrom: 1999,
      infraMilestones: [
        { year: 1999, level: 6, reason: 'New hub opens' },
        { year: 2008, level: 8, reason: 'Terminal 2' },
        { year: 2019, level: 10, reason: 'Satellite terminal S1/S2' }
      ]
    },
    'KMCO': {
      pax2024: 51, opened: 1981, majorFrom: 1990,
      infraMilestones: [
        { year: 1981, level: 4, reason: 'New airport for tourism' },
        { year: 2000, level: 6, reason: 'Airside 4' },
        { year: 2022, level: 8, reason: 'Terminal C - South complex' }
      ]
    },

    // Level 7 (40-50M)
    'KCLT': {
      pax2024: 49, opened: 1935, majorFrom: 1990,
      infraMilestones: [
        { year: 1990, level: 4, reason: 'Hub development' },
        { year: 2010, level: 6, reason: 'Hourly slot expansion' },
        { year: 2023, level: 8, reason: 'Destination CLT expansion' }
      ]
    },
    'KPHX': {
      pax2024: 48, opened: 1929, majorFrom: 1990,
      infraMilestones: [
        { year: 1990, level: 5, reason: 'Terminal 4 - America West hub' },
        { year: 2008, level: 7, reason: 'Terminal 4 expansion' },
        { year: 2020, level: 8, reason: 'Modernization project' }
      ]
    },
    'LFPO': {
      pax2024: 47, opened: 1932, majorFrom: 1960,
      infraMilestones: [
        { year: 1960, level: 4, reason: 'Sud/Ouest terminals' },
        { year: 1971, level: 5, reason: 'Orly Sud extension' },
        { year: 2019, level: 7, reason: 'Unified terminal renovation' }
      ]
    },
    'KMIA': {
      pax2024: 46, opened: 1928, majorFrom: 1960,
      infraMilestones: [
        { year: 1960, level: 4, reason: 'Latin America gateway' },
        { year: 1996, level: 6, reason: 'North terminal expansion' },
        { year: 2023, level: 8, reason: 'Central terminal complete' }
      ]
    },
    'LEMD': {
      pax2024: 45, opened: 1931, majorFrom: 1970,
      infraMilestones: [
        { year: 1970, level: 4, reason: 'Tourism expansion begins' },
        { year: 2006, level: 7, reason: 'Terminal 4 - €6.2B' },
        { year: 2022, level: 8, reason: 'Sustainability upgrades' }
      ]
    },
    'LIRF': {
      pax2024: 44, opened: 1961, majorFrom: 1961,
      infraMilestones: [
        { year: 1961, level: 5, reason: 'New Leonardo da Vinci airport' },
        { year: 2008, level: 7, reason: 'Terminal 5 complete' },
        { year: 2021, level: 8, reason: 'Terminal 1 renovation' }
      ]
    },
    'LEBL': {
      pax2024: 43, opened: 1918, majorFrom: 1992,
      infraMilestones: [
        { year: 1992, level: 5, reason: 'Olympics transformation' },
        { year: 2009, level: 8, reason: 'Terminal 1 - new hub' },
        { year: 2022, level: 9, reason: 'Expansion complete' }
      ]
    },
    'EGKK': {
      pax2024: 42, opened: 1958, majorFrom: 1970,
      infraMilestones: [
        { year: 1970, level: 4, reason: 'Secondary London hub' },
        { year: 1988, level: 6, reason: 'North terminal' },
        { year: 2019, level: 8, reason: 'Pier 6 expansion' }
      ]
    },
    'EGSS': {
      pax2024: 29, opened: 1942, majorFrom: 1991,
      infraMilestones: [
        { year: 1991, level: 5, reason: 'Norman Foster terminal opens' },
        { year: 2008, level: 6, reason: 'Satellite 1 expansion' },
        { year: 2017, level: 7, reason: 'Arrivals terminal' }
      ]
    },

    // Level 6 (30-40M)
    'KBOS': {
      pax2024: 38, opened: 1923, majorFrom: 1960,
      infraMilestones: [
        { year: 1960, level: 4, reason: 'Terminal expansion' },
        { year: 2006, level: 6, reason: 'Terminal A renovation' },
        { year: 2023, level: 8, reason: 'Terminal E complete' }
      ]
    },
    'KIAD': {
      pax2024: 37, opened: 1962, majorFrom: 1990,
      infraMilestones: [
        { year: 1962, level: 5, reason: 'Saarinen iconic terminal' },
        { year: 1990, level: 6, reason: 'Concourses expansion' },
        { year: 2021, level: 8, reason: 'Silver Line metro' }
      ]
    },
    'KSFO': {
      pax2024: 36, opened: 1927, majorFrom: 1960,
      infraMilestones: [
        { year: 1960, level: 4, reason: 'Jet age modernization' },
        { year: 2000, level: 7, reason: 'International terminal' },
        { year: 2020, level: 8, reason: 'Terminal 1 renovation' }
      ]
    },
    'FAOR': {
      pax2024: 35, opened: 1952, majorFrom: 1994,
      infraMilestones: [
        { year: 1994, level: 5, reason: 'Post-apartheid upgrade' },
        { year: 2010, level: 8, reason: 'World Cup modernization' }
      ]
    },
    'VABB': {
      pax2024: 34, opened: 1942, majorFrom: 1990,
      infraMilestones: [
        { year: 1990, level: 4, reason: 'Economic liberalization' },
        { year: 2014, level: 7, reason: 'Terminal 2 - iconic design' }
      ]
    },
    'LOWW': {
      pax2024: 33, opened: 1954, majorFrom: 1960,
      infraMilestones: [
        { year: 1960, level: 4, reason: 'Central Europe hub' },
        { year: 2012, level: 7, reason: 'Terminal 3 - skylink' }
      ]
    },
    'ESSA': {
      pax2024: 32, opened: 1960, majorFrom: 1960,
      infraMilestones: [
        { year: 1960, level: 5, reason: 'New jet-age airport' },
        { year: 1990, level: 6, reason: 'Terminal expansions' },
        { year: 2019, level: 7, reason: 'Terminal 5 Arlanda' }
      ]
    },
    'OTHH': {
      pax2024: 31, opened: 2014, majorFrom: 2014,
      infraMilestones: [
        { year: 2014, level: 9, reason: 'Ultra-modern new hub' },
        { year: 2022, level: 10, reason: 'World Cup expansion' }
      ]
    },

    // Level 5 (20-30M)
    'FACT': {
      pax2024: 28, opened: 1954, majorFrom: 1990,
      infraMilestones: [
        { year: 1990, level: 4, reason: 'Tourism growth' },
        { year: 2010, level: 7, reason: 'World Cup terminal' }
      ]
    },
    'EDDT': {
      pax2024: 27, opened: 2020, majorFrom: 2020,
      infraMilestones: [
        { year: 2020, level: 8, reason: 'New unified Berlin airport' }
      ]
    },
    'ENGM': {
      pax2024: 26, opened: 1998, majorFrom: 1998,
      infraMilestones: [
        { year: 1998, level: 6, reason: 'Modern new hub' },
        { year: 2017, level: 7, reason: 'Terminal expansion' }
      ]
    },
    'EBBR': {
      pax2024: 25, opened: 1958, majorFrom: 1960,
      infraMilestones: [
        { year: 1960, level: 4, reason: 'EU capital facilities' },
        { year: 2015, level: 7, reason: 'Connector pier A' }
      ]
    },
    'EKCH': {
      pax2024: 24, opened: 1925, majorFrom: 1960,
      infraMilestones: [
        { year: 1960, level: 4, reason: 'SAS hub development' },
        { year: 1998, level: 6, reason: 'Terminal 3' },
        { year: 2019, level: 7, reason: 'Finger C expansion' }
      ]
    },
    'EIDW': {
      pax2024: 23, opened: 1940, majorFrom: 1990,
      infraMilestones: [
        { year: 1990, level: 4, reason: 'Celtic tiger growth' },
        { year: 2010, level: 7, reason: 'Terminal 2' }
      ]
    },
    'EPWA': {
      pax2024: 22, opened: 1934, majorFrom: 2000,
      infraMilestones: [
        { year: 2000, level: 4, reason: 'EU expansion growth' },
        { year: 2015, level: 6, reason: 'Terminal A renovation' }
      ]
    },

    // Level 4 (10-20M)
    'FAJS': {
      pax2024: 18, opened: 1952, majorFrom: 1994,
      infraMilestones: [
        { year: 1994, level: 3, reason: 'Secondary airport' },
        { year: 2010, level: 5, reason: 'Business aviation hub' }
      ]
    },
    'LSZH': {
      pax2024: 17, opened: 1948, majorFrom: 1960,
      infraMilestones: [
        { year: 1960, level: 4, reason: 'Swiss precision hub' },
        { year: 2003, level: 6, reason: 'Dock E' },
        { year: 2020, level: 7, reason: 'The Circle - innovation' }
      ]
    },

    // === ADDITIONAL 100+ MAJOR AIRPORTS ===

    // USA - Major Hubs
    'KIAH': { pax2024: 47, opened: 1969, majorFrom: 1980, infraMilestones: [
      { year: 1980, level: 5, reason: 'Continental hub' },
      { year: 2004, level: 7, reason: 'International terminal D' }
    ]},
    'KEWR': { pax2024: 45, opened: 1928, majorFrom: 1970, infraMilestones: [
      { year: 1970, level: 4, reason: 'Terminal expansion' },
      { year: 2022, level: 7, reason: 'Terminal A complete rebuild' }
    ]},
    'KSAN': { pax2024: 26, opened: 1928, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 4, reason: 'Terminal 1 expansion' },
      { year: 2013, level: 6, reason: 'Green Build terminal 2' }
    ]},
    'KMDW': { pax2024: 25, opened: 1927, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 4, reason: 'Southwest expansion' },
      { year: 2011, level: 6, reason: 'Terminal modernization' }
    ]},
    'KDTW': { pax2024: 35, opened: 1930, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 5, reason: 'Northwest hub' },
      { year: 2002, level: 7, reason: 'McNamara terminal' }
    ]},
    'KMSP': { pax2024: 40, opened: 1920, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 5, reason: 'Hub development' },
      { year: 2013, level: 7, reason: 'Terminal 1 renovation' }
    ]},
    'KBWI': { pax2024: 27, opened: 1950, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 4, reason: 'Low-cost hub' },
      { year: 2005, level: 6, reason: 'Concourse expansion' }
    ]},
    'KPDX': { pax2024: 20, opened: 1940, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 4, reason: 'International growth' },
      { year: 2010, level: 6, reason: 'Sustainability upgrades' }
    ]},
    'KSLC': { pax2024: 27, opened: 1960, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 4, reason: 'Delta hub' },
      { year: 2020, level: 8, reason: 'New terminal - Phase 1' }
    ]},
    'KTPA': { pax2024: 22, opened: 1971, majorFrom: 1990, infraMilestones: [
      { year: 1971, level: 5, reason: 'Modern hub design' },
      { year: 2018, level: 7, reason: 'International expansion' }
    ]},

    // Canada
    'CYYZ': { pax2024: 50, opened: 1939, majorFrom: 1970, infraMilestones: [
      { year: 1970, level: 4, reason: 'Terminal 1' },
      { year: 2007, level: 7, reason: 'Terminal 1 rebuild' },
      { year: 2019, level: 8, reason: 'Pier expansion' }
    ]},
    'CYVR': { pax2024: 26, opened: 1931, majorFrom: 1996, infraMilestones: [
      { year: 1996, level: 5, reason: 'New international terminal' },
      { year: 2020, level: 7, reason: 'Terminal expansion' }
    ]},
    'CYUL': { pax2024: 21, opened: 1941, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 4, reason: 'International hub' },
      { year: 2016, level: 6, reason: 'International terminal' }
    ]},

    // UK & Ireland
    'EGCC': { pax2024: 30, opened: 1938, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 5, reason: 'Terminal 2' },
      { year: 2019, level: 7, reason: 'Super terminal' }
    ]},
    'EGPH': { pax2024: 15, opened: 1916, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 4, reason: 'Terminal expansion' },
      { year: 2017, level: 6, reason: 'Runway extension' }
    ]},
    'EGLL': { pax2024: 79, opened: 1946, majorFrom: 1955 }, // Already detailed above

    // Germany
    'EDDM': { pax2024: 48, opened: 1992, majorFrom: 1992, infraMilestones: [
      { year: 1992, level: 7, reason: 'New hub opens' },
      { year: 2016, level: 9, reason: 'Satellite terminal' }
    ]},
    'EDDB': { pax2024: 22, opened: 1923, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 4, reason: 'Post-unification' },
      { year: 2012, level: 5, reason: 'Terminal improvements' }
    ]},
    'EDDL': { pax2024: 25, opened: 1927, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 5, reason: 'Hub development' },
      { year: 2013, level: 7, reason: 'Pier expansion' }
    ]},

    // France
    'LFPB': { pax2024: 5, opened: 1919, majorFrom: 1950, infraMilestones: [
      { year: 1950, level: 3, reason: 'Business aviation' },
      { year: 2000, level: 4, reason: 'Executive terminal' }
    ]},
    'LFML': { pax2024: 11, opened: 1922, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 4, reason: 'Terminal 1 renovation' },
      { year: 2006, level: 6, reason: 'MP2 terminal' }
    ]},
    'LFLL': { pax2024: 12, opened: 1975, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 5, reason: 'Regional hub' },
      { year: 2018, level: 6, reason: 'Terminal 1 renovation' }
    ]},

    // Spain & Portugal
    'LPPT': { pax2024: 33, opened: 1942, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 4, reason: 'Tourism growth' },
      { year: 2012, level: 7, reason: 'Terminal 2 expansion' }
    ]},
    'LEAL': { pax2024: 15, opened: 1967, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 4, reason: 'Low-cost boom' },
      { year: 2011, level: 6, reason: 'Terminal expansion' }
    ]},
    'LEMG': { pax2024: 20, opened: 1919, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 4, reason: 'Costa del Sol boom' },
      { year: 2010, level: 6, reason: 'Terminal 3' }
    ]},

    // Italy
    'LIMC': { pax2024: 25, opened: 1998, majorFrom: 1998, infraMilestones: [
      { year: 1998, level: 6, reason: 'New hub opens' },
      { year: 2015, level: 7, reason: 'Satellite expansion' }
    ]},
    'LIPE': { pax2024: 6, opened: 1936, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 4, reason: 'Low-cost growth' },
      { year: 2007, level: 5, reason: 'Terminal renovation' }
    ]},
    'LIPZ': { pax2024: 12, opened: 1935, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 4, reason: 'Marco Polo renovation' },
      { year: 2019, level: 6, reason: 'Terminal expansion' }
    ]},

    // Netherlands & Belgium
    'EHRD': { pax2024: 2, opened: 1956, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 3, reason: 'Regional hub' },
      { year: 2015, level: 4, reason: 'Cargo expansion' }
    ]},

    // Switzerland
    'LSGG': { pax2024: 18, opened: 1920, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 5, reason: 'International hub' },
      { year: 2012, level: 6, reason: 'Pier expansion' }
    ]},

    // Scandinavia
    'EKBI': { pax2024: 3, opened: 1972, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 3, reason: 'Regional growth' },
      { year: 2010, level: 4, reason: 'Terminal renovation' }
    ]},
    'ESGG': { pax2024: 7, opened: 1923, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 4, reason: 'Landvetter terminal' },
      { year: 2018, level: 6, reason: 'Pier expansion' }
    ]},

    // Eastern Europe
    'LKPR': { pax2024: 18, opened: 1937, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 4, reason: 'Post-communist growth' },
      { year: 2012, level: 6, reason: 'Terminal 2 expansion' }
    ]},
    'LHBP': { pax2024: 16, opened: 1950, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 4, reason: 'Low-cost hub' },
      { year: 2011, level: 6, reason: 'Terminal 2 renovation' }
    ]},
    'LROP': { pax2024: 15, opened: 1965, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 3, reason: 'Post-Soviet growth' },
      { year: 2012, level: 5, reason: 'Terminal expansion' }
    ]},

    // Turkey
    'LTBA': { pax2024: 42, opened: 1912, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 4, reason: 'International terminal' },
      { year: 2018, level: 6, reason: 'Final expansion before closure' }
    ]},

    // Russia
    'UUEE': { pax2024: 52, opened: 1959, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 4, reason: 'Post-Soviet renovation' },
      { year: 2017, level: 7, reason: 'Modern terminal complex' }
    ]},
    'UUDD': { pax2024: 21, opened: 1933, majorFrom: 2010, infraMilestones: [
      { year: 2010, level: 5, reason: 'Major renovation begins' },
      { year: 2018, level: 6, reason: 'Terminal A expansion' }
    ]},

    // Middle East
    'OJAI': { pax2024: 23, opened: 1983, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 5, reason: 'Hub expansion' },
      { year: 2018, level: 7, reason: 'New terminal' }
    ]},
    'OMAA': { pax2024: 19, opened: 1982, majorFrom: 2010, infraMilestones: [
      { year: 2010, level: 6, reason: 'Midfield terminal' },
      { year: 2019, level: 8, reason: 'Terminal 3 complete' }
    ]},
    'OERK': { pax2024: 38, opened: 1983, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 5, reason: 'International expansion' },
      { year: 2016, level: 7, reason: 'Terminal 5' }
    ]},

    // Asia - China
    'ZBAA': { pax2024: 83, opened: 1958, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 5, reason: 'Terminal 2' },
      { year: 2008, level: 8, reason: 'Olympics Terminal 3' },
      { year: 2019, level: 9, reason: 'Daxing overflow' }
    ]},
    'ZGSZ': { pax2024: 56, opened: 1991, majorFrom: 2010, infraMilestones: [
      { year: 2010, level: 6, reason: 'Bao\'an Terminal 3' },
      { year: 2013, level: 8, reason: 'Satellite concourses' }
    ]},
    'ZUUU': { pax2024: 62, opened: 1938, majorFrom: 2010, infraMilestones: [
      { year: 2010, level: 6, reason: 'Terminal 2 expansion' },
      { year: 2021, level: 9, reason: 'Tianfu new airport' }
    ]},
    'ZUCK': { pax2024: 50, opened: 1997, majorFrom: 2010, infraMilestones: [
      { year: 2010, level: 6, reason: 'Terminal 2' },
      { year: 2017, level: 8, reason: 'Terminal 3 expansion' }
    ]},

    // Asia - Japan
    'RJAA': { pax2024: 70, opened: 1978, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 6, reason: 'Terminal 2' },
      { year: 2004, level: 7, reason: 'Terminal 2 expansion' },
      { year: 2020, level: 9, reason: 'Olympics upgrades' }
    ]},
    'RJBB': { pax2024: 35, opened: 1994, majorFrom: 1994, infraMilestones: [
      { year: 1994, level: 7, reason: 'New hub - artificial island' },
      { year: 2012, level: 8, reason: 'Terminal 2 expansion' }
    ]},

    // Asia - SE Asia
    'VTBS': { pax2024: 60, opened: 2006, majorFrom: 2006, infraMilestones: [
      { year: 2006, level: 8, reason: 'Suvarnabhumi opens' },
      { year: 2019, level: 9, reason: 'Satellite terminal' }
    ]},
    'WMKK': { pax2024: 52, opened: 1998, majorFrom: 1998, infraMilestones: [
      { year: 1998, level: 7, reason: 'KLIA opens - iconic design' },
      { year: 2012, level: 8, reason: 'KLIA2 low-cost terminal' }
    ]},
    'VHHH': { pax2024: 42, opened: 1998, majorFrom: 1998, infraMilestones: [
      { year: 1998, level: 8, reason: 'Chek Lap Kok opens' },
      { year: 2016, level: 9, reason: 'Midfield concourse' }
    ]},
    'RCTP': { pax2024: 48, opened: 1979, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 6, reason: 'Terminal 2' },
      { year: 2013, level: 8, reason: 'Third runway expansion' }
    ]},

    // Asia - South Asia
    'VCBI': { pax2024: 16, opened: 1930, majorFrom: 2010, infraMilestones: [
      { year: 2010, level: 5, reason: 'International terminal' },
      { year: 2023, level: 7, reason: 'Terminal expansion' }
    ]},

    // Oceania
    'YMML': { pax2024: 38, opened: 1970, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 5, reason: 'International terminal' },
      { year: 2015, level: 7, reason: 'Terminal 4' }
    ]},
    'YBBN': { pax2024: 24, opened: 1988, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 5, reason: 'International terminal' },
      { year: 2015, level: 7, reason: 'Runway expansion' }
    ]},
    'NZAA': { pax2024: 21, opened: 1965, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 5, reason: 'International terminal' },
      { year: 2017, level: 6, reason: 'Domestic terminal upgrade' }
    ]},

    // Latin America
    'SBGR': { pax2024: 44, opened: 1985, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 5, reason: 'Terminal 2' },
      { year: 2014, level: 7, reason: 'World Cup upgrades' }
    ]},
    'SCEL': { pax2024: 25, opened: 1967, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 5, reason: 'International terminal' },
      { year: 2019, level: 6, reason: 'Terminal renovation' }
    ]},
    'SBBR': { pax2024: 18, opened: 1957, majorFrom: 2010, infraMilestones: [
      { year: 2010, level: 5, reason: 'Capital expansion' },
      { year: 2014, level: 6, reason: 'World Cup terminal' }
    ]},
    'SKBO': { pax2024: 35, opened: 1959, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 4, reason: 'El Dorado expansion' },
      { year: 2012, level: 7, reason: 'New international terminal' }
    ]},
    'SAEZ': { pax2024: 13, opened: 1949, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 4, reason: 'Terminal renovation' },
      { year: 2000, level: 5, reason: 'Terminal C' }
    ]},
    'MMMX': { pax2024: 48, opened: 1952, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 5, reason: 'Terminal 1 renovation' },
      { year: 2007, level: 7, reason: 'Terminal 2' }
    ]},
    'MUHA': { pax2024: 3, opened: 1930, majorFrom: 1990, infraMilestones: [
      { year: 1990, level: 3, reason: 'Terminal expansion' },
      { year: 2015, level: 5, reason: 'Terminal 3' }
    ]},

    // Caribbean
    'TNCM': { pax2024: 2, opened: 1943, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 4, reason: 'Terminal expansion' },
      { year: 2019, level: 5, reason: 'Hurricane rebuild' }
    ]},

    // Africa
    'HECA': { pax2024: 20, opened: 1963, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 4, reason: 'Terminal 2' },
      { year: 2009, level: 6, reason: 'Terminal 3' }
    ]},
    'DNMM': { pax2024: 9, opened: 1975, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 4, reason: 'Terminal renovation' },
      { year: 2019, level: 5, reason: 'New terminal' }
    ]},
    'GMME': { pax2024: 6, opened: 1959, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 3, reason: 'Basic expansion' },
      { year: 2016, level: 5, reason: 'Terminal 1 renovation' }
    ]},
    'HKJK': { pax2024: 9, opened: 1958, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 4, reason: 'Terminal expansion' },
      { year: 2019, level: 6, reason: 'Terminal 1A' }
    ]},
    'FALE': { pax2024: 5, opened: 1960, majorFrom: 2000, infraMilestones: [
      { year: 2000, level: 3, reason: 'Capital airport growth' },
      { year: 2017, level: 5, reason: 'New terminal' }
    ]}
  };

  /**
   * Calculate traffic demand for an airport in a given year
   * @param {string} icaoCode - Airport ICAO code
   * @param {number} year - Year to calculate for
   * @param {string} airportType - Airport type (International Hub, Major, etc.)
   * @returns {number} - Traffic level 1-10
   */
  getTrafficDemand(icaoCode, year, airportType) {
    const airportData = this.AIRPORT_2024_DATA[icaoCode];

    // If we have specific data for this airport, use it
    if (airportData) {
      return this.calculateHistoricalTraffic(airportData, year, icaoCode);
    }

    // Otherwise, use type-based estimation with passenger scaling
    return this.estimateTrafficByType(airportType, year, icaoCode);
  }

  /**
   * Calculate historical traffic based on real data
   * Traffic grows more smoothly than infrastructure (which jumps at milestones)
   * This creates realistic divergence between traffic and infrastructure
   * Scale is RELATIVE to the era - busiest airport of each era = 20/20
   * @private
   */
  calculateHistoricalTraffic(airportData, year, icaoCode) {
    const { opened } = airportData;

    // If before airport opened, traffic = 0
    if (year < opened) return 2;

    // Get actual passengers for this year using historical data or estimates
    const actualPax = this.getAnnualPassengers(icaoCode, year, 10);

    // Get era multiplier to understand relative importance in that year
    const eraMultiplier = this.getEraTrafficMultiplier(year);

    // Scale relative to era's maximum with harsher curve
    // In 1950, ~10M pax = busiest airport (20/20)
    // In 2024, ~104M pax = busiest airport (20/20)
    const eraMaxPax = 104 * eraMultiplier; // Maximum pax for this era
    const ratio = actualPax / eraMaxPax;

    // Use power curve to make 20/20 harder to achieve
    // Only the very top airports reach 20/20
    // Power > 1 makes high values harder to reach (curves down)
    // e.g., 80% of max = 0.8^1.5 = 0.715 → 14/20 (instead of 16/20)
    const curvedRatio = Math.pow(ratio, 1.5); // Harsher curve
    const relativeLevel = curvedRatio * 20;

    return Math.max(2, Math.min(20, Math.round(relativeLevel)));
  }

  /**
   * Determine regional infrastructure development pattern
   * Different regions upgraded at different times
   * @private
   */
  getRegionalInfraPattern(icaoCode) {
    const prefix = icaoCode.substring(0, 1);

    // Regional infrastructure upgrade waves
    const patterns = {
      // North America (K = USA, C = Canada)
      'K': { waves: [1960, 1985, 2005], lag: -2 }, // Often ahead of traffic
      'C': { waves: [1965, 1990, 2010], lag: -1 },

      // Europe (E/L/EB/ED/EG/etc.)
      'E': { waves: [1970, 1992, 2010], lag: 0 }, // EU formation boost in 1992
      'L': { waves: [1970, 1992, 2010], lag: 0 },

      // Asia Pacific - varied development
      'R': { waves: [1980, 2000, 2015], lag: 1 }, // Japan/Korea - quality focus
      'V': { waves: [1995, 2010, 2020], lag: 2 }, // India - infrastructure lag
      'W': { waves: [1990, 2005, 2019], lag: -3 }, // Singapore/Malaysia - ahead
      'Z': { waves: [2000, 2010, 2020], lag: 1 }, // China - rapid build
      'Y': { waves: [1985, 2000, 2010], lag: 0 }, // Australia/NZ

      // Middle East
      'O': { waves: [1990, 2005, 2015], lag: -2 }, // Gulf states - over-built

      // Africa
      'F': { waves: [2000, 2010, 2020], lag: 3 }, // Infrastructure lags
      'H': { waves: [2000, 2010, 2020], lag: 3 },

      // South America
      'S': { waves: [1980, 2000, 2015], lag: 2 }
    };

    return patterns[prefix] || { waves: [1970, 1990, 2010], lag: 1 };
  }

  /**
   * Estimate traffic for airports without specific data
   * Uses smooth exponential growth
   * Scale is relative to era - typical airport of this type should be around 10-12/20 in any era
   * @private
   */
  estimateTrafficByType(airportType, year, icaoCode) {
    // For airports without detailed data, estimate passengers based on type
    // Then scale to traffic level the same way as airports with detailed data

    // Estimate passengers directly based on airport type and era
    const typePassengerRatios = {
      'International Hub': 0.60,   // 60% of era max before damping
      'Major': 0.35,               // 35% of era max
      'Regional': 0.15,            // 15% of era max
      'Small Regional': 0.05       // 5% of era max
    };

    const ratio = typePassengerRatios[airportType] || 0.20;

    // Calculate estimated passengers for this era (before damping)
    const eraMultiplier = this.getEraTrafficMultiplier(year);
    const eraMaxPax = 104 * eraMultiplier;
    let estimatedPax = eraMaxPax * ratio;

    // Apply era damping
    let eraDamping = 1.0;
    if (year < 1960) eraDamping = 0.05;
    else if (year < 1970) eraDamping = 0.15;
    else if (year < 1980) eraDamping = 0.35;
    else if (year < 1990) eraDamping = 0.60;
    else if (year < 2000) eraDamping = 0.85;

    estimatedPax *= eraDamping;

    // Now scale to traffic level using same logic as calculateHistoricalTraffic
    const paxRatio = estimatedPax / eraMaxPax;
    const curvedRatio = Math.pow(paxRatio, 1.5);
    const relativeLevel = curvedRatio * 20;

    return Math.max(2, Math.min(20, Math.round(relativeLevel)));
  }

  /**
   * Get infrastructure level for an airport in a given year
   * @param {string} icaoCode - Airport ICAO code
   * @param {number} year - Year to calculate for
   * @param {string} airportType - Airport type
   * @returns {number} - Infrastructure level 1-10
   */
  getInfrastructureLevel(icaoCode, year, airportType) {
    const airportData = this.AIRPORT_2024_DATA[icaoCode];

    if (airportData) {
      return this.calculateHistoricalInfrastructure(airportData, year);
    }

    return this.estimateInfrastructureByType(airportType, year, icaoCode);
  }

  /**
   * Calculate historical infrastructure using milestone-based approach
   * Infrastructure improves in discrete jumps at specific dates
   * Scale is RELATIVE to the era - best infrastructure of each era = 20/20
   * @private
   */
  calculateHistoricalInfrastructure(airportData, year) {
    const { opened, infraMilestones } = airportData;

    if (year < opened) return 2;

    // If we have milestone data, use it for accurate historical infrastructure
    if (infraMilestones && infraMilestones.length > 0) {
      // Find the most recent milestone that has occurred by this year
      let absoluteLevel = 2; // Basic facilities when first opened

      for (const milestone of infraMilestones) {
        if (year >= milestone.year) {
          absoluteLevel = milestone.level; // Use original 1-10 value as absolute quality
        } else {
          // Stop once we hit a future milestone
          break;
        }
      }

      // Scale relative to era's infrastructure standards
      // In 1950, a level 5 absolute = state-of-the-art (20/20)
      // In 2024, a level 10 absolute = state-of-the-art (20/20)
      const eraMaxInfra = this.getEraMaxInfrastructure(year);
      const relativeLevel = (absoluteLevel / eraMaxInfra) * 20;

      return Math.max(2, Math.min(20, Math.round(relativeLevel)));
    }

    // Fallback for airports without milestone data
    const { majorFrom } = airportData;

    if (year < majorFrom) {
      // Basic infrastructure before becoming major
      const yearsOpen = year - opened;
      const absoluteLevel = Math.min(4, 2 + (yearsOpen / 20));
      const eraMaxInfra = this.getEraMaxInfrastructure(year);
      const relativeLevel = (absoluteLevel / eraMaxInfra) * 20;
      return Math.max(2, Math.min(20, Math.round(relativeLevel)));
    } else {
      // After becoming major, infrastructure improves in steps
      const yearsSinceMajor = year - majorFrom;
      const totalYearsToPresent = 2024 - majorFrom;
      const ratio = Math.min(1, yearsSinceMajor / totalYearsToPresent);

      // Step function - major upgrades happen in chunks every ~10 years
      const absoluteLevel = 4 + Math.floor(ratio * 6); // 4-10 absolute scale

      const eraMaxInfra = this.getEraMaxInfrastructure(year);
      const relativeLevel = (absoluteLevel / eraMaxInfra) * 20;

      return Math.max(2, Math.min(20, Math.round(relativeLevel)));
    }
  }

  /**
   * Estimate infrastructure for airports without specific data
   * Uses era-independent base levels with regional variations
   * Creates realistic divergence from traffic levels
   * @private
   */
  estimateInfrastructureByType(airportType, year, icaoCode) {
    // Base relative infrastructure levels for each airport type (era-independent)
    // Infrastructure is typically behind traffic demand, creating opportunity for upgrades
    const baseRelativeLevels = {
      'International Hub': 13,   // Top tier infrastructure
      'Major': 9,                // Good facilities
      'Regional': 6,             // Adequate facilities
      'Small Regional': 4        // Basic facilities
    };

    const baseLevel = baseRelativeLevels[airportType] || 6;

    // Get regional infrastructure pattern for lag/lead adjustment
    const pattern = icaoCode ? this.getRegionalInfraPattern(icaoCode) : { lag: 2 };

    // Apply regional lag/lead (±3 levels max)
    // Negative lag = infrastructure ahead of traffic (over-built)
    // Positive lag = infrastructure behind traffic (congested)
    const lagAdjustment = -Math.max(-3, Math.min(3, pattern.lag));

    // Add era-based variation (infrastructure improves over time but not dramatically)
    let eraAdjustment = 0;
    if (year < 1970) {
      // Older eras: infrastructure tends to be more basic, but still functional
      eraAdjustment = -2;
    } else if (year >= 2010) {
      // Modern era: generally better infrastructure
      eraAdjustment = 1;
    }

    // For International Hubs, add extra variation based on modernization waves
    if (airportType === 'International Hub') {
      if (year >= 2000 && year < 2020) {
        eraAdjustment += 2; // Major modernization wave
      }
    }

    const finalLevel = baseLevel + lagAdjustment + eraAdjustment;

    return Math.max(2, Math.min(20, finalLevel));
  }

  /**
   * Traffic grew exponentially from 1950s to 2024
   * @private
   */
  getEraTrafficMultiplier(year) {
    if (year < 1950) return 0.05;  // Almost no commercial aviation
    if (year < 1960) return 0.10;  // Early commercial era
    if (year < 1970) return 0.20;  // Jet age begins
    if (year < 1980) return 0.35;  // Widebody expansion
    if (year < 1990) return 0.50;  // Deregulation boom
    if (year < 2000) return 0.70;  // Globalization
    if (year < 2010) return 0.85;  // Pre-crisis
    if (year < 2020) return 0.95;  // Modern era
    return 1.00;  // 2020+
  }

  /**
   * Infrastructure improved in steps with major investments
   * @private
   */
  getEraInfrastructureMultiplier(year) {
    if (year < 1950) return 0.20;  // Basic facilities
    if (year < 1960) return 0.30;  // Post-war improvements
    if (year < 1970) return 0.45;  // Jet age terminals
    if (year < 1980) return 0.60;  // Modern terminals emerge
    if (year < 1990) return 0.75;  // High-tech systems
    if (year < 2000) return 0.85;  // Advanced facilities
    if (year < 2010) return 0.92;  // Security upgrades
    return 1.00;  // Contemporary
  }

  /**
   * Get maximum infrastructure quality available in each era (absolute scale 1-10)
   * Used for era-relative scaling of infrastructure
   * @private
   */
  getEraMaxInfrastructure(year) {
    if (year < 1950) return 2;   // Very basic facilities
    if (year < 1960) return 3;   // Post-war basic terminals
    if (year < 1970) return 4;   // Early jet age
    if (year < 1980) return 5;   // Modern terminal designs emerge
    if (year < 1990) return 6;   // Advanced terminals with tech
    if (year < 2000) return 7;   // High-tech facilities
    if (year < 2010) return 8;   // State-of-the-art security & automation
    if (year < 2020) return 9;   // Contemporary ultra-modern
    return 10;  // 2020+ cutting edge (Jewel Changi, Istanbul, Doha)
  }

  /**
   * Calculate annual passenger movements for an airport using historical data
   * @param {string} icaoCode - Airport ICAO code
   * @param {number} year - Year to calculate for
   * @param {number} trafficLevel - Traffic demand level (1-20)
   * @returns {number} - Annual passenger movements (millions)
   */
  getAnnualPassengers(icaoCode, year, trafficLevel) {
    const historicalData = this.HISTORICAL_PASSENGER_DATA[icaoCode];
    const airportData = this.AIRPORT_2024_DATA[icaoCode];

    // Priority 1: Use historical passenger data with interpolation
    if (historicalData) {
      const years = Object.keys(historicalData).map(Number).sort((a, b) => a - b);

      // If before first data point, extrapolate conservatively
      if (year < years[0]) {
        const firstYear = years[0];
        const firstPax = historicalData[firstYear];
        const airportInfo = this.AIRPORT_2024_DATA[icaoCode];
        const opened = airportInfo?.opened || firstYear - 20;

        // Very conservative growth before first data point
        const yearsSinceOpen = year - opened;
        const yearsToFirstData = firstYear - opened;
        if (yearsSinceOpen <= 0) return 0.1;

        const ratio = Math.max(0, Math.min(1, yearsSinceOpen / yearsToFirstData));
        return Math.round(firstPax * ratio * 0.5 * 10) / 10; // 50% of linear interpolation
      }

      // If after last data point, use last value
      if (year >= years[years.length - 1]) {
        return historicalData[years[years.length - 1]];
      }

      // Interpolate between two known data points
      for (let i = 0; i < years.length - 1; i++) {
        const year1 = years[i];
        const year2 = years[i + 1];

        if (year >= year1 && year <= year2) {
          const pax1 = historicalData[year1];
          const pax2 = historicalData[year2];
          const ratio = (year - year1) / (year2 - year1);
          const interpolated = pax1 + (pax2 - pax1) * ratio;
          return Math.round(interpolated * 10) / 10;
        }
      }
    }

    // Priority 2: Use 2024 data with VERY conservative growth model
    // This model accounts for the fact that global air travel was MUCH smaller pre-1970
    if (airportData && airportData.pax2024) {
      const { pax2024, opened, majorFrom } = airportData;

      let actualTrafficRatio;

      if (year >= 2024) {
        actualTrafficRatio = 1.0;
      } else if (year < opened) {
        return 0.1;
      } else if (year < majorFrom) {
        // Much more conservative pre-major growth
        const yearsOpen = year - opened;
        const yearsSinceMajor = majorFrom - opened;
        const growthRatio = Math.min(1, yearsOpen / yearsSinceMajor);

        // Apply era-based damping - air travel was MUCH smaller before 1970
        let eraDamping = 1.0;
        if (year < 1960) eraDamping = 0.01; // 1% for 1950s
        else if (year < 1970) eraDamping = 0.05; // 5% for 1960s
        else if (year < 1980) eraDamping = 0.15; // 15% for 1970s
        else if (year < 1990) eraDamping = 0.30; // 30% for 1980s

        actualTrafficRatio = (0.005 + (growthRatio * 0.045)) * eraDamping;
      } else {
        // Post-major: still conservative exponential growth with era damping
        const yearsSinceMajor = year - majorFrom;
        const totalYearsToPresent = 2024 - majorFrom;
        const growthRatio = Math.min(1, yearsSinceMajor / totalYearsToPresent);
        const growthCurve = Math.pow(growthRatio, 0.8);

        // Apply era-based damping for post-major growth too
        let eraDamping = 1.0;
        if (year < 1960) eraDamping = 0.02;
        else if (year < 1970) eraDamping = 0.10;
        else if (year < 1980) eraDamping = 0.25;
        else if (year < 1990) eraDamping = 0.50;
        else if (year < 2000) eraDamping = 0.75;

        actualTrafficRatio = (0.05 + (growthCurve * 0.95)) * eraDamping;
      }

      return Math.round(pax2024 * actualTrafficRatio * 10) / 10;
    }

    // Priority 3: Estimate based on traffic level and era (with damping)
    const eraMultiplier = this.getEraTrafficMultiplier(year);
    const eraMaxPax = 104;
    let estimatedPax = (trafficLevel / 20) * eraMaxPax * eraMultiplier;

    // Apply era damping to prevent unrealistic early-year values
    let eraDamping = 1.0;
    if (year < 1960) eraDamping = 0.05; // 5% for 1950s
    else if (year < 1970) eraDamping = 0.15; // 15% for 1960s
    else if (year < 1980) eraDamping = 0.35; // 35% for 1970s
    else if (year < 1990) eraDamping = 0.60; // 60% for 1980s
    else if (year < 2000) eraDamping = 0.85; // 85% for 1990s

    estimatedPax *= eraDamping;

    return Math.round(estimatedPax * 10) / 10;
  }

  /**
   * Calculate number of runways for an airport
   * @param {string} airportType - Airport type
   * @param {number} infrastructureLevel - Infrastructure level (1-20)
   * @returns {number} - Number of runways
   */
  getRunways(airportType, infrastructureLevel) {
    // Base runways by airport type
    const baseRunways = {
      'International Hub': 3,
      'Major': 2,
      'Regional': 1,
      'Small Regional': 1
    };

    let runways = baseRunways[airportType] || 1;

    // Add runways based on infrastructure level
    if (airportType === 'International Hub') {
      if (infrastructureLevel >= 15) runways = 4;
      else if (infrastructureLevel >= 10) runways = 3;
      else if (infrastructureLevel >= 6) runways = 2;
      else runways = 1;
    } else if (airportType === 'Major') {
      if (infrastructureLevel >= 12) runways = 3;
      else if (infrastructureLevel >= 7) runways = 2;
      else runways = 1;
    } else if (airportType === 'Regional') {
      if (infrastructureLevel >= 14) runways = 2;
      else runways = 1;
    }

    return runways;
  }

  /**
   * Calculate number of aircraft stands for an airport
   * @param {string} airportType - Airport type
   * @param {number} infrastructureLevel - Infrastructure level (1-20)
   * @param {number} trafficLevel - Traffic demand level (1-20)
   * @returns {number} - Number of aircraft stands
   */
  getStands(airportType, infrastructureLevel, trafficLevel) {
    // Base stands by airport type
    const baseStands = {
      'International Hub': 80,
      'Major': 40,
      'Regional': 20,
      'Small Regional': 10
    };

    const base = baseStands[airportType] || 15;

    // Scale by infrastructure level (infrastructure determines capacity)
    const infraMultiplier = infrastructureLevel / 10; // 0.2 to 2.0
    let stands = Math.round(base * infraMultiplier);

    // If traffic significantly exceeds infrastructure, show congestion
    const congestionRatio = trafficLevel / infrastructureLevel;
    if (congestionRatio > 1.2) {
      // Airport is over capacity, might have fewer usable stands
      stands = Math.round(stands * 0.9);
    }

    return Math.max(5, stands); // Minimum 5 stands
  }

  /**
   * Get both traffic and infrastructure for an airport
   * @param {Object} airport - Airport object with icaoCode and type
   * @param {number} year - Year to calculate for
   * @returns {Object} - { trafficDemand, infrastructureLevel, annualPassengers, runways, stands }
   */
  getAirportMetrics(airport, year) {
    const trafficDemand = this.getTrafficDemand(airport.icaoCode, year, airport.type);
    const infrastructureLevel = this.getInfrastructureLevel(airport.icaoCode, year, airport.type);
    const annualPassengers = this.getAnnualPassengers(airport.icaoCode, year, trafficDemand);
    const runways = this.getRunways(airport.type, infrastructureLevel);
    const stands = this.getStands(airport.type, infrastructureLevel, trafficDemand);

    return {
      trafficDemand,
      infrastructureLevel,
      annualPassengers,
      runways,
      stands
    };
  }

  /**
   * Get upcoming infrastructure milestones for an airport
   * Useful for showing players what's coming next
   * @param {string} icaoCode - Airport ICAO code
   * @param {number} currentYear - Current world year
   * @returns {Array} - Array of upcoming milestones
   */
  getUpcomingMilestones(icaoCode, currentYear) {
    const airportData = this.AIRPORT_2024_DATA[icaoCode];

    if (!airportData || !airportData.infraMilestones) {
      return [];
    }

    return airportData.infraMilestones
      .filter(m => m.year > currentYear && m.year <= 2024)
      .map(m => ({
        year: m.year,
        level: m.level,
        reason: m.reason,
        yearsUntil: m.year - currentYear
      }));
  }

  /**
   * Get the most recent infrastructure milestone
   * @param {string} icaoCode - Airport ICAO code
   * @param {number} currentYear - Current world year
   * @returns {Object|null} - Most recent milestone or null
   */
  getRecentMilestone(icaoCode, currentYear) {
    const airportData = this.AIRPORT_2024_DATA[icaoCode];

    if (!airportData || !airportData.infraMilestones) {
      return null;
    }

    // Find the most recent milestone that has occurred
    let recentMilestone = null;
    for (const milestone of airportData.infraMilestones) {
      if (milestone.year <= currentYear) {
        recentMilestone = milestone;
      } else {
        break;
      }
    }

    return recentMilestone;
  }

  /**
   * Get full growth timeline for an airport
   * Shows historical and future milestones
   * @param {string} icaoCode - Airport ICAO code
   * @returns {Object} - Timeline data
   */
  getAirportTimeline(icaoCode) {
    const airportData = this.AIRPORT_2024_DATA[icaoCode];

    if (!airportData) {
      return null;
    }

    return {
      icaoCode,
      opened: airportData.opened,
      majorFrom: airportData.majorFrom,
      pax2024: airportData.pax2024,
      milestones: airportData.infraMilestones || [],
      hasDetailedData: !!airportData.infraMilestones
    };
  }
}

// Singleton instance
const airportGrowthService = new AirportGrowthService();

module.exports = airportGrowthService;
