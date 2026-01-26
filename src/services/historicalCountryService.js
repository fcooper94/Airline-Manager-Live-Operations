/**
 * Historical Country Service
 * Maps modern country names to historical names based on year
 * Handles political changes, renames, and territorial changes
 */

class HistoricalCountryService {
  /**
   * Get the historically accurate country name for a given year
   * @param {string} modernCountry - Modern country name
   * @param {number} year - Year to get historical name for
   * @returns {string} - Historically accurate country name
   */
  getHistoricalCountryName(modernCountry, year) {
    // Map modern countries to their historical names
    const historicalMappings = {
      'Russia': this.getRussiaName(year),
      'Czech Republic': this.getCzechName(year),
      'Slovakia': year < 1993 ? 'Czechoslovakia' : 'Slovakia',
      'Belarus': year < 1991 ? 'Soviet Union' : 'Belarus',
      'Ukraine': year < 1991 ? 'Soviet Union' : 'Ukraine',
      'Kazakhstan': year < 1991 ? 'Soviet Union' : 'Kazakhstan',
      'Uzbekistan': year < 1991 ? 'Soviet Union' : 'Uzbekistan',
      'Georgia': year < 1991 ? 'Soviet Union' : 'Georgia',
      'Armenia': year < 1991 ? 'Soviet Union' : 'Armenia',
      'Azerbaijan': year < 1991 ? 'Soviet Union' : 'Azerbaijan',
      'Lithuania': year < 1991 ? 'Soviet Union' : 'Lithuania',
      'Latvia': year < 1991 ? 'Soviet Union' : 'Latvia',
      'Estonia': year < 1991 ? 'Soviet Union' : 'Estonia',
      'Moldova': year < 1991 ? 'Soviet Union' : 'Moldova',
      'Turkmenistan': year < 1991 ? 'Soviet Union' : 'Turkmenistan',
      'Kyrgyzstan': year < 1991 ? 'Soviet Union' : 'Kyrgyzstan',
      'Tajikistan': year < 1991 ? 'Soviet Union' : 'Tajikistan',

      'Germany': this.getGermanyName(year),
      'Vietnam': year < 1976 ? (year < 1955 ? 'French Indochina' : 'South Vietnam') : 'Vietnam',
      'Yemen': year < 1990 ? 'North Yemen' : 'Yemen',
      'South Korea': year < 1948 ? 'Korea' : 'South Korea',
      'North Korea': year < 1948 ? 'Korea' : 'North Korea',

      'Croatia': year < 1991 ? 'Yugoslavia' : 'Croatia',
      'Serbia': year < 2006 ? (year < 1992 ? 'Yugoslavia' : 'Serbia and Montenegro') : 'Serbia',
      'Montenegro': year < 2006 ? (year < 1992 ? 'Yugoslavia' : 'Serbia and Montenegro') : 'Montenegro',
      'Slovenia': year < 1991 ? 'Yugoslavia' : 'Slovenia',
      'Bosnia and Herzegovina': year < 1992 ? 'Yugoslavia' : 'Bosnia and Herzegovina',
      'North Macedonia': year < 1991 ? 'Yugoslavia' : (year < 2019 ? 'Macedonia' : 'North Macedonia'),

      'Bangladesh': year < 1971 ? 'Pakistan' : 'Bangladesh',
      'Pakistan': year < 1947 ? 'British India' : 'Pakistan',
      'India': year < 1947 ? 'British India' : 'India',
      'Myanmar': year < 1989 ? 'Burma' : 'Myanmar',
      'Sri Lanka': year < 1972 ? 'Ceylon' : 'Sri Lanka',

      'Zimbabwe': year < 1980 ? 'Rhodesia' : 'Zimbabwe',
      'Zambia': year < 1964 ? 'Northern Rhodesia' : 'Zambia',
      'Namibia': year < 1990 ? 'South West Africa' : 'Namibia',
      'Tanzania': year < 1964 ? 'Tanganyika' : 'Tanzania',

      'Turkey': year < 1923 ? 'Ottoman Empire' : 'Turkey',
      'Thailand': year < 1939 ? 'Siam' : (year >= 1945 ? 'Thailand' : 'Siam'),

      'United Arab Emirates': year < 1971 ? 'Trucial States' : 'United Arab Emirates',
      'Bahrain': year < 1971 ? 'British Protectorate' : 'Bahrain',
      'Qatar': year < 1971 ? 'British Protectorate' : 'Qatar',

      'Taiwan': year < 1945 ? 'Japanese Taiwan' : 'Taiwan',
      'Hong Kong': year < 1997 ? 'British Hong Kong' : 'Hong Kong',
      'Macau': year < 1999 ? 'Portuguese Macau' : 'Macau',

      'Indonesia': year < 1949 ? 'Dutch East Indies' : 'Indonesia',
      'Malaysia': year < 1963 ? (year < 1957 ? 'British Malaya' : 'Federation of Malaya') : 'Malaysia',
      'Singapore': year < 1965 ? (year < 1963 ? 'British Singapore' : 'Malaysia') : 'Singapore'
    };

    return historicalMappings[modernCountry] || modernCountry;
  }

  /**
   * Get historical name for Russia
   * @private
   */
  getRussiaName(year) {
    if (year < 1922) return 'Russian Empire';
    if (year < 1991) return 'Soviet Union';
    return 'Russia';
  }

  /**
   * Get historical name for Germany
   * @private
   */
  getGermanyName(year) {
    if (year < 1949) return 'Germany';
    if (year < 1990) return 'West Germany'; // Most major airports were in West Germany
    return 'Germany';
  }

  /**
   * Get historical name for Czech Republic
   * @private
   */
  getCzechName(year) {
    if (year < 1918) return 'Austria-Hungary';
    if (year < 1939) return 'Czechoslovakia';
    if (year < 1945) return 'Protectorate of Bohemia and Moravia';
    if (year < 1993) return 'Czechoslovakia';
    return 'Czech Republic';
  }

  /**
   * Get region mapping for historical countries
   * Used for filtering in the UI
   */
  getRegionFromCountry(country) {
    const regionMap = {
      // North America
      'United States': 'North America',
      'Canada': 'North America',
      'Mexico': 'North America',

      // Europe
      'United Kingdom': 'Europe',
      'British Hong Kong': 'Asia',
      'France': 'Europe',
      'Germany': 'Europe',
      'West Germany': 'Europe',
      'East Germany': 'Europe',
      'Spain': 'Europe',
      'Italy': 'Europe',
      'Netherlands': 'Europe',
      'Belgium': 'Europe',
      'Switzerland': 'Europe',
      'Austria': 'Europe',
      'Austria-Hungary': 'Europe',
      'Sweden': 'Europe',
      'Norway': 'Europe',
      'Denmark': 'Europe',
      'Finland': 'Europe',
      'Ireland': 'Europe',
      'Portugal': 'Europe',
      'Poland': 'Europe',
      'Czech Republic': 'Europe',
      'Czechoslovakia': 'Europe',
      'Protectorate of Bohemia and Moravia': 'Europe',
      'Hungary': 'Europe',
      'Romania': 'Europe',
      'Turkey': 'Europe/Middle East',
      'Ottoman Empire': 'Middle East',

      // Former Soviet Union
      'Russia': 'Europe/Asia',
      'Russian Empire': 'Europe/Asia',
      'Soviet Union': 'Europe/Asia',
      'Ukraine': 'Europe',
      'Belarus': 'Europe',
      'Kazakhstan': 'Asia',
      'Georgia': 'Europe/Asia',
      'Armenia': 'Europe/Asia',
      'Azerbaijan': 'Europe/Asia',

      // Former Yugoslavia
      'Yugoslavia': 'Europe',
      'Serbia and Montenegro': 'Europe',
      'Croatia': 'Europe',
      'Serbia': 'Europe',
      'Montenegro': 'Europe',
      'Slovenia': 'Europe',
      'Bosnia and Herzegovina': 'Europe',
      'Macedonia': 'Europe',
      'North Macedonia': 'Europe',

      // Middle East
      'United Arab Emirates': 'Middle East',
      'Trucial States': 'Middle East',
      'Saudi Arabia': 'Middle East',
      'Qatar': 'Middle East',
      'British Protectorate': 'Middle East',
      'Oman': 'Middle East',
      'Jordan': 'Middle East',
      'Egypt': 'Africa',

      // Africa
      'South Africa': 'Africa',
      'Kenya': 'Africa',
      'Nigeria': 'Africa',
      'Morocco': 'Africa',
      'Zimbabwe': 'Africa',
      'Rhodesia': 'Africa',
      'Zambia': 'Africa',
      'Northern Rhodesia': 'Africa',
      'Namibia': 'Africa',
      'South West Africa': 'Africa',
      'Tanzania': 'Africa',
      'Tanganyika': 'Africa',

      // Asia
      'China': 'Asia',
      'Japan': 'Asia',
      'Japanese Taiwan': 'Asia',
      'South Korea': 'Asia',
      'North Korea': 'Asia',
      'Korea': 'Asia',
      'India': 'Asia',
      'British India': 'Asia',
      'Pakistan': 'Asia',
      'Bangladesh': 'Asia',
      'Singapore': 'Asia',
      'British Singapore': 'Asia',
      'Malaysia': 'Asia',
      'British Malaya': 'Asia',
      'Federation of Malaya': 'Asia',
      'Thailand': 'Asia',
      'Siam': 'Asia',
      'Indonesia': 'Asia',
      'Dutch East Indies': 'Asia',
      'Philippines': 'Asia',
      'Vietnam': 'Asia',
      'South Vietnam': 'Asia',
      'French Indochina': 'Asia',
      'Hong Kong': 'Asia',
      'Taiwan': 'Asia',
      'Myanmar': 'Asia',
      'Burma': 'Asia',
      'Sri Lanka': 'Asia',
      'Ceylon': 'Asia',

      // Oceania
      'Australia': 'Oceania',
      'New Zealand': 'Oceania',

      // South America
      'Brazil': 'South America',
      'Argentina': 'South America',
      'Chile': 'South America',
      'Colombia': 'South America',
      'Peru': 'South America'
    };

    return regionMap[country] || 'Other';
  }
}

// Singleton instance
const historicalCountryService = new HistoricalCountryService();

module.exports = historicalCountryService;
