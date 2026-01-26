/**
 * ICAO Aircraft Registration Prefixes by Country
 * Maps country names to their corresponding aircraft registration prefixes
 */

const REGISTRATION_PREFIXES = {
  // Major countries
  'United States': 'N-',
  'United Kingdom': 'G-',
  'Germany': 'D-',
  'France': 'F-',
  'Italy': 'I-',
  'Spain': 'EC-',
  'Netherlands': 'PH-',
  'Belgium': 'OO-',
  'Switzerland': 'HB-',
  'Austria': 'OE-',
  'Sweden': 'SE-',
  'Norway': 'LN-',
  'Denmark': 'OY-',
  'Finland': 'OH-',
  'Poland': 'SP-',
  'Czech Republic': 'OK-',
  'Portugal': 'CS-',
  'Greece': 'SX-',
  'Turkey': 'TC-',
  'Russia': 'RA-',
  'Ukraine': 'UR-',
  'Romania': 'YR-',
  'Hungary': 'HA-',
  'Bulgaria': 'LZ-',
  'Serbia': 'YU-',
  'Croatia': '9A-',
  'Slovenia': 'S5-',
  'Slovakia': 'OM-',
  'Ireland': 'EI-',
  'Iceland': 'TF-',
  'Luxembourg': 'LX-',

  // Asia-Pacific
  'China': 'B-',
  'Japan': 'JA-',
  'South Korea': 'HL-',
  'India': 'VT-',
  'Australia': 'VH-',
  'New Zealand': 'ZK-',
  'Singapore': '9V-',
  'Malaysia': '9M-',
  'Indonesia': 'PK-',
  'Thailand': 'HS-',
  'Philippines': 'RP-',
  'Vietnam': 'VN-',
  'Hong Kong': 'B-H',
  'Taiwan': 'B-',
  'Pakistan': 'AP-',
  'Bangladesh': 'S2-',
  'Sri Lanka': '4R-',
  'Nepal': '9N-',

  // Middle East
  'Saudi Arabia': 'HZ-',
  'United Arab Emirates': 'A6-',
  'Qatar': 'A7-',
  'Kuwait': '9K-',
  'Oman': 'A4O-',
  'Bahrain': 'A9C-',
  'Israel': '4X-',
  'Jordan': 'JY-',
  'Lebanon': 'OD-',
  'Iran': 'EP-',
  'Iraq': 'YI-',
  'Egypt': 'SU-',

  // Americas
  'Canada': 'C-',
  'Mexico': 'XA-',
  'Brazil': 'PR-',
  'Argentina': 'LV-',
  'Chile': 'CC-',
  'Colombia': 'HK-',
  'Peru': 'OB-',
  'Venezuela': 'YV-',
  'Ecuador': 'HC-',
  'Bolivia': 'CP-',
  'Paraguay': 'ZP-',
  'Uruguay': 'CX-',
  'Costa Rica': 'TI-',
  'Panama': 'HP-',
  'Cuba': 'CU-',
  'Jamaica': '6Y-',

  // Africa
  'South Africa': 'ZS-',
  'Nigeria': '5N-',
  'Kenya': '5Y-',
  'Ethiopia': 'ET-',
  'Morocco': 'CN-',
  'Algeria': '7T-',
  'Tunisia': 'TS-',
  'Ghana': '9G-',
  'Tanzania': '5H-',
  'Uganda': '5X-',
  'Zimbabwe': 'Z-',
  'Angola': 'D2-',
  'Mozambique': 'C9-',

  // Default fallback
  'default': 'N-'
};

/**
 * Get the ICAO registration prefix for a given country
 * @param {string} country - Country name
 * @returns {string} - ICAO registration prefix (e.g., 'G-', 'N-')
 */
function getRegistrationPrefix(country) {
  if (!country) {
    return REGISTRATION_PREFIXES.default;
  }

  return REGISTRATION_PREFIXES[country] || REGISTRATION_PREFIXES.default;
}

/**
 * Validate a registration with its country prefix
 * @param {string} registration - Full registration string
 * @param {string} prefix - Expected prefix
 * @returns {boolean} - Whether the registration starts with the correct prefix
 */
function validateRegistrationPrefix(registration, prefix) {
  if (!registration || !prefix) {
    return false;
  }

  return registration.toUpperCase().startsWith(prefix.toUpperCase());
}

// Expose functions globally
if (typeof window !== 'undefined') {
  window.getRegistrationPrefix = getRegistrationPrefix;
  window.validateRegistrationPrefix = validateRegistrationPrefix;
  window.REGISTRATION_PREFIXES = REGISTRATION_PREFIXES;
}
