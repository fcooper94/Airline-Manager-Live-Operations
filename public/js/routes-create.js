let baseAirport = null;
let worldInfo = null;
let availableAirports = [];
let selectedDestinationAirport = null;
let selectedTechStopAirport = null;
let userFleet = [];
let allRoutes = [];
let selectedDaysOfWeek = [1, 2, 3, 4, 5, 6, 0]; // Default: all days selected (Mon-Sun)
let globalPricing = null;
let aircraftTypePricing = {};
let aircraftDataById = {}; // Store aircraft data by ID for lookup

// Fetch world info and base airport
async function fetchWorldInfo() {
  try {
    const response = await fetch('/api/world/info');
    if (response.ok) {
      worldInfo = await response.json();
      if (worldInfo.baseAirport) {
        baseAirport = worldInfo.baseAirport;
        document.getElementById('departureAirport').value =
          `${baseAirport.icaoCode} - ${baseAirport.name}`;
      }

      // Set route number prefix from airline IATA code
      if (worldInfo.iataCode) {
        document.getElementById('routePrefix').value = worldInfo.iataCode;
        document.getElementById('returnRoutePrefix').value = worldInfo.iataCode;
      }
    }
  } catch (error) {
    console.error('Error fetching world info:', error);
  }
}

// Fetch user's fleet
async function fetchUserFleet() {
  try {
    const response = await fetch('/api/fleet');
    if (response.ok) {
      userFleet = await response.json();
      populateFleetDropdown();
    }
  } catch (error) {
    console.error('Error fetching fleet:', error);
  }
}

// Fetch existing routes
async function fetchExistingRoutes() {
  try {
    const response = await fetch('/api/routes');
    if (response.ok) {
      allRoutes = await response.json();
    }
  } catch (error) {
    console.error('Error fetching routes:', error);
  }
}

// Populate fleet dropdown (by aircraft type only)
function populateFleetDropdown() {
  const select = document.getElementById('assignedAircraft');

  // Group aircraft by type and get unique types
  const aircraftTypes = {};
  userFleet.forEach(userAircraft => {
    const typeKey = `${userAircraft.aircraft.manufacturer} ${userAircraft.aircraft.model}${userAircraft.aircraft.variant ? '-' + userAircraft.aircraft.variant : ''}`;
    if (!aircraftTypes[typeKey]) {
      aircraftTypes[typeKey] = {
        displayName: typeKey,
        aircraft: userAircraft.aircraft,
        userAircraftId: userAircraft.id, // Store the first UserAircraft ID of this type
        count: 0
      };
    }
    aircraftTypes[typeKey].count++;
  });

  // Build dropdown with aircraft types only and store aircraft data for lookup
  let html = '<option value="">-- Select aircraft type --</option>';

  Object.keys(aircraftTypes).sort().forEach(typeKey => {
    const typeInfo = aircraftTypes[typeKey];
    // Store aircraft data by UserAircraft ID for later lookup
    aircraftDataById[typeInfo.userAircraftId] = typeInfo.aircraft;
    // Store the UserAircraft ID in the value (not the Aircraft ID)
    html += `<option value='${typeInfo.userAircraftId}'>${typeInfo.displayName} (${typeInfo.count} available)</option>`;
  });

  select.innerHTML = html;
}

// Get aircraft type key from aircraft data
function getAircraftTypeKey(aircraftData) {
  if (!aircraftData) return null;
  return `${aircraftData.manufacturer}_${aircraftData.model}_${aircraftData.variant || 'default'}`;
}

// Load default turnaround time for aircraft type
function loadDefaultTurnaroundTime(aircraftData) {
  const typeKey = getAircraftTypeKey(aircraftData);
  if (!typeKey) return;

  // Load from localStorage
  const savedDefaults = JSON.parse(localStorage.getItem('aircraftTurnaroundDefaults') || '{}');
  const defaultTime = savedDefaults[typeKey];

  if (defaultTime) {
    document.getElementById('turnaroundTime').value = defaultTime;
    calculateFlightTiming();
  }
}

// Save default turnaround time for aircraft type
function saveDefaultTurnaroundTime() {
  const aircraftSelect = document.getElementById('assignedAircraft');
  if (!aircraftSelect.value) return;

  try {
    // Look up aircraft data by ID
    const aircraftData = aircraftDataById[aircraftSelect.value];
    if (!aircraftData) return;

    const typeKey = getAircraftTypeKey(aircraftData);
    const turnaroundTime = parseInt(document.getElementById('turnaroundTime').value);

    if (typeKey && turnaroundTime) {
      // Load existing defaults
      const savedDefaults = JSON.parse(localStorage.getItem('aircraftTurnaroundDefaults') || '{}');

      // Update with new default
      savedDefaults[typeKey] = turnaroundTime;

      // Save back to localStorage
      localStorage.setItem('aircraftTurnaroundDefaults', JSON.stringify(savedDefaults));

      // Show feedback
      const checkbox = document.getElementById('saveDefaultTurnaround');
      const label = checkbox.parentElement;
      const originalText = label.querySelector('span').textContent;
      label.querySelector('span').textContent = '✓ Saved as default for this aircraft type';
      label.querySelector('span').style.color = 'var(--success-color)';

      setTimeout(() => {
        label.querySelector('span').textContent = originalText;
        label.querySelector('span').style.color = '';
        checkbox.checked = false;
      }, 2000);
    }
  } catch (e) {
    console.error('Error saving default turnaround time:', e);
  }
}

// Handle aircraft selection change
function onAircraftSelectionChange() {
  const aircraftSelect = document.getElementById('assignedAircraft');
  const pricingSection = document.getElementById('pricingConfigSection');

  if (aircraftSelect.value) {
    try {
      // Look up aircraft data by ID
      const aircraftData = aircraftDataById[aircraftSelect.value];
      if (aircraftData) {
        // Show pricing section when aircraft is selected
        if (pricingSection) {
          pricingSection.style.display = 'block';
        }
        loadDefaultTurnaroundTime(aircraftData);
        updatePassengerClassAvailability(aircraftData);
        applyDefaultPricing(aircraftData);
      }
    } catch (e) {
      console.error('Error loading default turnaround time:', e);
    }
  } else {
    // No aircraft selected - hide pricing section and enable all fields
    if (pricingSection) {
      pricingSection.style.display = 'none';
    }
    updatePassengerClassAvailability(null);
  }

  calculateFlightTiming();
}

// Update passenger class field availability based on aircraft capabilities
function updatePassengerClassAvailability(aircraftData) {
  const economyField = document.getElementById('economyPrice');
  const economyPlusField = document.getElementById('economyPlusPrice');
  const businessField = document.getElementById('businessPrice');
  const firstField = document.getElementById('firstPrice');
  const cargoLightField = document.getElementById('cargoLightRate');
  const cargoStandardField = document.getElementById('cargoStandardRate');
  const cargoHeavyField = document.getElementById('cargoHeavyRate');

  if (!aircraftData) {
    // No aircraft selected - enable all fields
    [economyField, economyPlusField, businessField, firstField, cargoLightField, cargoStandardField, cargoHeavyField].forEach(field => {
      if (field) {
        field.disabled = false;
        field.style.opacity = '1';
        field.style.cursor = 'text';
        // Update label to remove "(not available)" text
        const label = field.closest('div').querySelector('label');
        if (label) {
          label.innerHTML = label.innerHTML.replace(' <span style="color: var(--text-muted); font-weight: normal;">(not available on this aircraft)</span>', '');
        }
      }
    });
    return;
  }

  // Economy class
  if (economyField) {
    const hasEconomy = aircraftData?.hasEconomy !== false;
    economyField.disabled = !hasEconomy;
    economyField.style.opacity = hasEconomy ? '1' : '0.5';
    economyField.style.cursor = hasEconomy ? 'text' : 'not-allowed';
    if (!hasEconomy) economyField.value = '';
    updateFieldLabel(economyField, hasEconomy);
  }

  // Economy Plus class
  if (economyPlusField) {
    const hasEconomyPlus = aircraftData?.hasEconomyPlus === true;
    economyPlusField.disabled = !hasEconomyPlus;
    economyPlusField.style.opacity = hasEconomyPlus ? '1' : '0.5';
    economyPlusField.style.cursor = hasEconomyPlus ? 'text' : 'not-allowed';
    if (!hasEconomyPlus) economyPlusField.value = '';
    updateFieldLabel(economyPlusField, hasEconomyPlus);
  }

  // Business class
  if (businessField) {
    const hasBusiness = aircraftData?.hasBusiness === true;
    businessField.disabled = !hasBusiness;
    businessField.style.opacity = hasBusiness ? '1' : '0.5';
    businessField.style.cursor = hasBusiness ? 'text' : 'not-allowed';
    if (!hasBusiness) businessField.value = '';
    updateFieldLabel(businessField, hasBusiness);
  }

  // First class
  if (firstField) {
    const hasFirst = aircraftData?.hasFirst === true;
    firstField.disabled = !hasFirst;
    firstField.style.opacity = hasFirst ? '1' : '0.5';
    firstField.style.cursor = hasFirst ? 'text' : 'not-allowed';
    if (!hasFirst) firstField.value = '';
    updateFieldLabel(firstField, hasFirst);
  }

  // Light cargo
  if (cargoLightField) {
    const hasCargoLight = aircraftData?.hasCargoLight !== false;
    cargoLightField.disabled = !hasCargoLight;
    cargoLightField.style.opacity = hasCargoLight ? '1' : '0.5';
    cargoLightField.style.cursor = hasCargoLight ? 'text' : 'not-allowed';
    if (!hasCargoLight) cargoLightField.value = '';
    updateFieldLabel(cargoLightField, hasCargoLight);
  }

  // Standard cargo
  if (cargoStandardField) {
    const hasCargoStandard = aircraftData?.hasCargoStandard !== false;
    cargoStandardField.disabled = !hasCargoStandard;
    cargoStandardField.style.opacity = hasCargoStandard ? '1' : '0.5';
    cargoStandardField.style.cursor = hasCargoStandard ? 'text' : 'not-allowed';
    if (!hasCargoStandard) cargoStandardField.value = '';
    updateFieldLabel(cargoStandardField, hasCargoStandard);
  }

  // Heavy cargo
  if (cargoHeavyField) {
    const hasCargoHeavy = aircraftData?.hasCargoHeavy === true;
    cargoHeavyField.disabled = !hasCargoHeavy;
    cargoHeavyField.style.opacity = hasCargoHeavy ? '1' : '0.5';
    cargoHeavyField.style.cursor = hasCargoHeavy ? 'text' : 'not-allowed';
    if (!hasCargoHeavy) cargoHeavyField.value = '';
    updateFieldLabel(cargoHeavyField, hasCargoHeavy);
  }

  console.log('Updated class/cargo availability:', {
    economy: aircraftData?.hasEconomy !== false,
    economyPlus: aircraftData?.hasEconomyPlus === true,
    business: aircraftData?.hasBusiness === true,
    first: aircraftData?.hasFirst === true,
    cargoLight: aircraftData?.hasCargoLight !== false,
    cargoStandard: aircraftData?.hasCargoStandard !== false,
    cargoHeavy: aircraftData?.hasCargoHeavy === true
  });
}

// Helper function to update field label with availability indicator
function updateFieldLabel(field, isAvailable) {
  const label = field.closest('div').querySelector('label');
  if (!label) return;

  // Remove existing "(not available)" text
  label.innerHTML = label.innerHTML.replace(' <span style="color: var(--text-muted); font-weight: normal;">(not available on this aircraft)</span>', '');

  // Add "(not available)" text if field is not available
  if (!isAvailable) {
    label.innerHTML += ' <span style="color: var(--text-muted); font-weight: normal;">(not available on this aircraft)</span>';
  }
}

// Fetch global pricing defaults
async function fetchGlobalPricing() {
  try {
    const response = await fetch('/api/pricing/global');
    if (response.ok) {
      globalPricing = await response.json();
      console.log('Global pricing loaded:', globalPricing);
      // Apply global defaults immediately if no aircraft selected
      applyDefaultPricing(null);
    }
  } catch (error) {
    console.error('Error fetching global pricing:', error);
  }
}

// Fetch aircraft type pricing
async function fetchAircraftTypePricing() {
  try {
    const response = await fetch('/api/pricing/aircraft-types');
    if (response.ok) {
      aircraftTypePricing = await response.json();
      console.log('Aircraft type pricing loaded:', Object.keys(aircraftTypePricing).length, 'types');
    }
  } catch (error) {
    console.error('Error fetching aircraft type pricing:', error);
  }
}

// Apply default pricing based on global defaults and aircraft type
function applyDefaultPricing(aircraftData) {
  if (!globalPricing) return; // No pricing loaded yet

  const typeKey = aircraftData ? getAircraftTypeKey(aircraftData) : null;
  const typePricing = typeKey ? aircraftTypePricing[typeKey] : null;

  // Helper to get effective price (aircraft type override or global default)
  const getPrice = (field) => {
    if (typePricing && typePricing[field] != null) {
      return typePricing[field];
    }
    return globalPricing[field] || 0;
  };

  // Only apply if fields are empty and enabled (don't override user input, skip disabled classes)
  const economyField = document.getElementById('economyPrice');
  const economyPlusField = document.getElementById('economyPlusPrice');
  const businessField = document.getElementById('businessPrice');
  const firstField = document.getElementById('firstPrice');
  const cargoLightField = document.getElementById('cargoLightRate');
  const cargoStandardField = document.getElementById('cargoStandardRate');
  const cargoHeavyField = document.getElementById('cargoHeavyRate');

  if (economyField && !economyField.disabled && !economyField.value) economyField.value = getPrice('economyPrice');
  if (economyPlusField && !economyPlusField.disabled && !economyPlusField.value) economyPlusField.value = getPrice('economyPlusPrice');
  if (businessField && !businessField.disabled && !businessField.value) businessField.value = getPrice('businessPrice');
  if (firstField && !firstField.disabled && !firstField.value) firstField.value = getPrice('firstPrice');
  if (cargoLightField && !cargoLightField.disabled && !cargoLightField.value) cargoLightField.value = getPrice('cargoLightRate');
  if (cargoStandardField && !cargoStandardField.disabled && !cargoStandardField.value) cargoStandardField.value = getPrice('cargoStandardRate');
  if (cargoHeavyField && !cargoHeavyField.disabled && !cargoHeavyField.value) cargoHeavyField.value = getPrice('cargoHeavyRate');
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // Radius of Earth in nautical miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Load available airports for destination selection
async function loadAvailableAirports() {
  try {
    const response = await fetch('/api/world/airports');
    if (response.ok) {
      const airports = await response.json();
      // Filter out the base airport and calculate distances
      availableAirports = airports
        .filter(airport => airport.icaoCode !== baseAirport.icaoCode)
        .map(airport => {
          const distance = calculateDistance(
            baseAirport.latitude,
            baseAirport.longitude,
            airport.latitude,
            airport.longitude
          );
          return { ...airport, distance };
        });

      // Populate country and timezone filters
      populateCountryFilter();
      populateTimezoneFilter();

      // Display airports
      applyDestinationFilters();
    }
  } catch (error) {
    console.error('Error loading airports:', error);
    document.getElementById('availableAirportsList').innerHTML = `
      <div style="padding: 3rem; text-align: center; color: var(--warning-color);">
        Error loading airports
      </div>
    `;
  }
}

// Populate country filter dropdown
function populateCountryFilter() {
  const countries = [...new Set(availableAirports.map(a => a.country))].sort();
  const countryFilter = document.getElementById('countryFilter');
  countryFilter.innerHTML = '<option value="">-- All countries --</option>' +
    countries.map(country => `<option value="${country}">${country}</option>`).join('');
}

// Populate timezone filter dropdown
function populateTimezoneFilter() {
  const timezones = [...new Set(availableAirports.map(a => a.timezone).filter(tz => tz))].sort();
  const timezoneFilter = document.getElementById('timezoneFilter');
  timezoneFilter.innerHTML = '<option value="">Any</option>' +
    timezones.map(tz => `<option value="${tz}">${tz}</option>`).join('');
}

// Filter airports by continent (updates country filter)
function filterAirportsByContinent() {
  const continent = document.getElementById('continentFilter').value;

  // Continent to countries mapping
  const continentCountries = {
    'Africa': ['South Africa', 'Nigeria', 'Kenya', 'Ethiopia', 'Morocco', 'Algeria', 'Tunisia', 'Ghana', 'Tanzania', 'Uganda', 'Zimbabwe', 'Angola', 'Mozambique'],
    'Asia': ['China', 'Japan', 'South Korea', 'India', 'Singapore', 'Malaysia', 'Indonesia', 'Thailand', 'Philippines', 'Vietnam', 'Hong Kong', 'Taiwan', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal'],
    'Europe': ['United Kingdom', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Czech Republic', 'Portugal', 'Greece', 'Turkey', 'Russia', 'Ukraine', 'Romania', 'Hungary', 'Bulgaria', 'Serbia', 'Croatia', 'Slovenia', 'Slovakia', 'Ireland', 'Iceland', 'Luxembourg'],
    'North America': ['United States', 'Canada', 'Mexico', 'Costa Rica', 'Panama', 'Cuba', 'Jamaica'],
    'South America': ['Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Venezuela', 'Ecuador', 'Bolivia', 'Paraguay', 'Uruguay'],
    'Oceania': ['Australia', 'New Zealand']
  };

  const countryFilter = document.getElementById('countryFilter');

  if (!continent) {
    // Show all countries
    populateCountryFilter();
  } else {
    // Filter countries by continent
    const filteredCountries = availableAirports
      .map(a => a.country)
      .filter(country => continentCountries[continent]?.includes(country));

    const uniqueCountries = [...new Set(filteredCountries)].sort();

    countryFilter.innerHTML = '<option value="">-- All countries --</option>' +
      uniqueCountries.map(country => `<option value="${country}">${country}</option>`).join('');
  }

  applyDestinationFilters();
}

// Apply all destination filters
function applyDestinationFilters() {
  const searchKeyword = document.getElementById('searchKeyword').value.toLowerCase();
  const country = document.getElementById('countryFilter').value;
  const infraOperator = document.getElementById('infraOperator').value;
  const infraLevel = parseInt(document.getElementById('infraLevel').value) || null;
  const trafficOperator = document.getElementById('trafficOperator').value;
  const trafficLevel = parseInt(document.getElementById('trafficLevel').value) || null;
  const timezone = document.getElementById('timezoneFilter').value;
  const minRange = parseFloat(document.getElementById('minRange').value) || 0;
  const maxRange = parseFloat(document.getElementById('maxRange').value) || 0;
  const excludeExisting = document.getElementById('excludeExistingRoutes').checked;

  // Get existing route destinations
  const existingDestinations = allRoutes.map(r => r.arrivalAirport.icaoCode);

  let filtered = availableAirports.filter(airport => {
    // Search keyword filter
    if (searchKeyword && !(
      airport.icaoCode.toLowerCase().includes(searchKeyword) ||
      airport.iataCode?.toLowerCase().includes(searchKeyword) ||
      airport.name.toLowerCase().includes(searchKeyword) ||
      airport.city.toLowerCase().includes(searchKeyword)
    )) {
      return false;
    }

    // Country filter
    if (country && airport.country !== country) {
      return false;
    }

    // Infrastructure level filter
    if (infraLevel !== null) {
      const airportInfra = airport.infrastructureLevel || 0;
      if (infraOperator === '=' && airportInfra !== infraLevel) return false;
      if (infraOperator === '>=' && airportInfra < infraLevel) return false;
      if (infraOperator === '<=' && airportInfra > infraLevel) return false;
    }

    // Traffic level filter
    if (trafficLevel !== null) {
      const airportTraffic = airport.trafficDemand || 0;
      if (trafficOperator === '=' && airportTraffic !== trafficLevel) return false;
      if (trafficOperator === '>=' && airportTraffic < trafficLevel) return false;
      if (trafficOperator === '<=' && airportTraffic > trafficLevel) return false;
    }

    // Timezone filter
    if (timezone && airport.timezone !== timezone) {
      return false;
    }

    // Range filter
    if (minRange > 0 || maxRange > 0) {
      if (minRange > 0 && airport.distance < minRange) return false;
      if (maxRange > 0 && airport.distance > maxRange) return false;
    }

    // Exclude existing routes
    if (excludeExisting && existingDestinations.includes(airport.icaoCode)) {
      return false;
    }

    return true;
  });

  // Sort by distance
  filtered.sort((a, b) => a.distance - b.distance);

  // Update badge
  const badge = document.getElementById('airportCountBadge');
  if (badge) {
    badge.textContent = `${filtered.length} AIRPORT${filtered.length !== 1 ? 'S' : ''}`;
  }

  // Display filtered airports
  displayAvailableAirports(filtered);
}

// Display available airports
function displayAvailableAirports(airports) {
  const container = document.getElementById('availableAirportsList');

  if (airports.length === 0) {
    container.innerHTML = `
      <div style="padding: 3rem; text-align: center; color: var(--text-muted);">
        No airports match your filters
      </div>
    `;
    return;
  }

  const html = airports.map(airport => {
    const isSelected = selectedDestinationAirport?.id === airport.id;
    return `
      <div
        onclick="selectDestinationAirport('${airport.id}')"
        style="
          padding: 1.25rem;
          border-bottom: 1px solid var(--border-color);
          cursor: pointer;
          background: ${isSelected ? 'var(--accent-color-dim)' : 'transparent'};
          transition: background 0.2s;
        "
        onmouseover="if (!${isSelected}) this.style.background='var(--surface-elevated)'"
        onmouseout="if (!${isSelected}) this.style.background='transparent'"
      >
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="flex: 1;">
            <div style="color: var(--text-primary); font-weight: 600; font-size: 1.05rem;">
              ${airport.icaoCode} ${airport.iataCode ? `(${airport.iataCode})` : ''} - ${airport.name}
            </div>
            <div style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.25rem;">
              ${airport.city}, ${airport.country} • ${airport.type}
            </div>
            <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.25rem;">
              Infrastructure: ${airport.infrastructureLevel}/20 • Traffic: ${airport.trafficDemand}/20${airport.timezone ? ` • ${airport.timezone}` : ''}
            </div>
          </div>
          <div style="text-align: right; margin-left: 2rem;">
            <div style="color: var(--text-muted); font-size: 0.85rem;">Distance</div>
            <div style="color: var(--accent-color); font-weight: 600; font-size: 1.2rem;">${Math.round(airport.distance)} NM</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// Select destination airport
function selectDestinationAirport(airportId) {
  selectedDestinationAirport = availableAirports.find(a => a.id === airportId);

  // Clear any existing tech stop when changing destination
  if (selectedTechStopAirport) {
    selectedTechStopAirport = null;
    const techStopCheckbox = document.getElementById('includeTechStop');
    if (techStopCheckbox) {
      techStopCheckbox.checked = false;
      toggleTechStopSection();
    }
  }

  if (selectedDestinationAirport) {
    // Update selected destination panel in step 1
    const panelStep1 = document.getElementById('selectedDestinationPanelStep1');
    panelStep1.style.display = 'block';

    document.getElementById('selectedDestNameStep1').textContent =
      `${selectedDestinationAirport.icaoCode} - ${selectedDestinationAirport.name}`;

    document.getElementById('selectedDestDetailsStep1').textContent =
      `${selectedDestinationAirport.city}, ${selectedDestinationAirport.country} • ${selectedDestinationAirport.type}`;

    document.getElementById('selectedDestDistanceStep1').textContent =
      `${Math.round(selectedDestinationAirport.distance)} NM`;

    // Re-render list to show selection
    applyDestinationFilters();

    // Scroll to selected destination panel
    panelStep1.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Clear destination selection in step 1
function clearDestinationStep1() {
  selectedDestinationAirport = null;
  document.getElementById('selectedDestinationPanelStep1').style.display = 'none';
  applyDestinationFilters();

  // Scroll to search section
  document.getElementById('searchKeyword').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Proceed to step 2 (route configuration)
function proceedToStep2() {
  if (!selectedDestinationAirport) {
    alert('Please select a destination airport first');
    return;
  }

  // Hide step 1, show step 2
  document.getElementById('step1Container').style.display = 'none';
  document.getElementById('step2Container').style.display = 'block';

  // Update step indicators
  document.getElementById('step1Indicator').style.background = 'var(--surface-elevated)';
  document.getElementById('step1Indicator').style.border = '1px solid var(--border-color)';
  document.getElementById('step1Indicator').style.color = 'var(--text-muted)';

  document.getElementById('step2Indicator').style.background = 'var(--accent-color)';
  document.getElementById('step2Indicator').style.border = 'none';
  document.getElementById('step2Indicator').style.color = 'white';

  // Update subtitle
  document.getElementById('stepSubtitle').textContent = 'STEP 2: CONFIGURE ROUTE';

  // Update arrival airport field
  document.getElementById('arrivalAirport').value =
    `${selectedDestinationAirport.icaoCode} - ${selectedDestinationAirport.name} (${Math.round(selectedDestinationAirport.distance)} NM)`;

  // Calculate return time
  calculateReturnTime();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Go back to step 1 (destination selection)
function backToStep1() {
  // Show step 1, hide step 2
  document.getElementById('step1Container').style.display = 'block';
  document.getElementById('step2Container').style.display = 'none';

  // Update step indicators
  document.getElementById('step1Indicator').style.background = 'var(--accent-color)';
  document.getElementById('step1Indicator').style.border = 'none';
  document.getElementById('step1Indicator').style.color = 'white';

  document.getElementById('step2Indicator').style.background = 'var(--surface-elevated)';
  document.getElementById('step2Indicator').style.border = '1px solid var(--border-color)';
  document.getElementById('step2Indicator').style.color = 'var(--text-muted)';

  // Update subtitle
  document.getElementById('stepSubtitle').textContent = 'STEP 1: SELECT DESTINATION';

  // Reset tech stop
  const techStopCheckbox = document.getElementById('includeTechStop');
  if (techStopCheckbox) {
    techStopCheckbox.checked = false;
    toggleTechStopSection();
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Toggle a specific day of the week
function toggleDay(day) {
  const dayIndex = selectedDaysOfWeek.indexOf(day);

  if (dayIndex > -1) {
    // Day is selected, remove it
    selectedDaysOfWeek.splice(dayIndex, 1);
  } else {
    // Day is not selected, add it
    selectedDaysOfWeek.push(day);
  }

  // Sort the array
  selectedDaysOfWeek.sort((a, b) => a - b);

  // Update button visual state
  updateDayButtonStates();

  // Update 7 day schedule checkbox state
  const sevenDayCheckbox = document.getElementById('sevenDaySchedule');
  sevenDayCheckbox.checked = selectedDaysOfWeek.length === 7;
}

// Toggle 7 day schedule
function toggleSevenDaySchedule() {
  const checkbox = document.getElementById('sevenDaySchedule');

  if (checkbox.checked) {
    // Select all days (Mon-Sun)
    selectedDaysOfWeek = [1, 2, 3, 4, 5, 6, 0];
  } else {
    // Deselect all days
    selectedDaysOfWeek = [];
  }

  updateDayButtonStates();
}

// Days of week section is always visible (no frequency dropdown anymore)

// Update the visual state of day buttons
function updateDayButtonStates() {
  const dayButtons = document.querySelectorAll('.day-button');

  dayButtons.forEach(button => {
    const day = parseInt(button.getAttribute('data-day'));
    const isSelected = selectedDaysOfWeek.includes(day);

    if (isSelected) {
      button.style.background = 'var(--accent-color)';
      button.style.borderColor = 'var(--accent-color)';
      button.style.color = 'white';
    } else {
      button.style.background = 'transparent';
      button.style.borderColor = 'var(--border-color)';
      button.style.color = 'var(--text-muted)';
    }
  });
}

// Calculate flight time based on distance (using average cruise speed)
function calculateFlightTime(distanceNM) {
  // Assume average cruise speed of 450 knots (typical for medium-range aircraft)
  const cruiseSpeedKnots = 450;
  const flightTimeHours = distanceNM / cruiseSpeedKnots;
  const flightTimeMinutes = Math.round(flightTimeHours * 60 / 5) * 5;
  return flightTimeMinutes;
}

// Calculate flight time based on aircraft speed and distance
function calculateFlightTimeWithAircraft(distanceNM, aircraftData) {
  if (!aircraftData || !aircraftData.cruiseSpeed) {
    // Default speed if no aircraft selected
    return calculateFlightTime(distanceNM);
  }

  const cruiseSpeedKnots = aircraftData.cruiseSpeed;
  const flightTimeHours = distanceNM / cruiseSpeedKnots;
  const flightTimeMinutes = Math.round(flightTimeHours * 60 / 5) * 5;
  return flightTimeMinutes;
}

// Calculate and display detailed flight timing
function calculateFlightTiming() {
  const timingContainer = document.getElementById('flightTimingDisplay');

  if (!selectedDestinationAirport) {
    if (timingContainer) {
      timingContainer.style.display = 'none';
    }
    document.getElementById('calculatedReturnTime').value = '--:--';
    return;
  }

  const outboundDepartureTime = document.getElementById('departureTime').value;
  if (!outboundDepartureTime) {
    if (timingContainer) {
      timingContainer.style.display = 'none';
    }
    document.getElementById('calculatedReturnTime').value = '--:--';
    return;
  }

  // Get selected aircraft data - REQUIRED
  const aircraftSelect = document.getElementById('assignedAircraft');
  let aircraftData = null;
  if (!aircraftSelect.value) {
    // Aircraft is mandatory - hide timing until selected
    if (timingContainer) {
      timingContainer.style.display = 'none';
    }
    document.getElementById('calculatedReturnTime').value = '--:--';
    return;
  }

  // Look up aircraft data by ID
  aircraftData = aircraftDataById[aircraftSelect.value];
  if (!aircraftData) {
    console.error('Aircraft data not found for ID:', aircraftSelect.value);
    if (timingContainer) {
      timingContainer.style.display = 'none';
    }
    document.getElementById('calculatedReturnTime').value = '--:--';
    return;
  }

  const turnaroundMinutes = parseInt(document.getElementById('turnaroundTime').value) || 45;

  // Use routing distance if tech stop is present, otherwise use direct distance
  const effectiveDistance = selectedTechStopAirport && selectedDestinationAirport.routingDistance
    ? selectedDestinationAirport.routingDistance
    : selectedDestinationAirport.distance;

  const flightTimeMinutes = calculateFlightTimeWithAircraft(effectiveDistance, aircraftData);

  // Taxi time: normal route has 2 taxi operations per leg (out + in)
  // Tech stop route has 4 taxi operations per leg (out at A, in at B, out at B, in at C)
  // So tech stop doubles the taxi time
  const BASE_TAXI_TIME_PER_LEG = 15; // minutes for normal route
  const taxiTimePerLeg = selectedTechStopAirport ? BASE_TAXI_TIME_PER_LEG * 2 : BASE_TAXI_TIME_PER_LEG;

  // Refueling time at tech stop (20 minutes per leg)
  const refuelingTimePerLeg = selectedTechStopAirport ? 20 : 0;

  const blockTimeMinutes = flightTimeMinutes + taxiTimePerLeg + refuelingTimePerLeg;

  // Parse outbound departure time
  const [hours, minutes] = outboundDepartureTime.split(':').map(Number);

  // Calculate all timing points using block time
  const offBlocksOutbound = hours * 60 + minutes;
  const onBlocksDestination = offBlocksOutbound + blockTimeMinutes;
  const offBlocksReturn = onBlocksDestination + turnaroundMinutes;
  const onBlocksBase = offBlocksReturn + blockTimeMinutes;

  // Format times
  const formatTime = (totalMinutes) => {
    const days = Math.floor(totalMinutes / (24 * 60));
    const mins = totalMinutes % (24 * 60);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return days > 0 ? `${timeStr} (+${days}d)` : timeStr;
  };

  const formatDuration = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) {
      return `${h}h ${m}m`;
    }
    return `${m}m`;
  };

  // Update return time field
  document.getElementById('calculatedReturnTime').value = formatTime(offBlocksReturn);

  // Display detailed timing
  if (timingContainer) {
    const aircraftName = aircraftData ? `${aircraftData.manufacturer} ${aircraftData.model}${aircraftData.variant ? '-' + aircraftData.variant : ''}` : 'Default Aircraft';
    const cruiseSpeed = aircraftData ? aircraftData.cruiseSpeed : 450;

    // Build tech stop routing display
    let routingDisplay = '';
    let distanceDisplay = '';

    if (selectedTechStopAirport) {
      const depCode = baseAirport.icaoCode;
      const techCode = selectedTechStopAirport.icaoCode;
      const destCode = selectedDestinationAirport.icaoCode;

      routingDisplay = `<div style="color: var(--text-secondary); font-size: 0.9rem;">Routing: <span style="color: var(--accent-color); font-weight: 600;">${depCode} → ${techCode} → ${destCode} → ${techCode} → ${depCode}</span></div>`;

      const legAB = selectedTechStopAirport.distanceFromDeparture;
      const legBC = selectedTechStopAirport.distanceToDestination;
      const totalRouting = legAB + legBC;

      distanceDisplay = `
        <div style="color: var(--text-secondary); font-size: 0.9rem;">
          Distance: <span style="color: var(--text-primary); font-weight: 600;">${Math.round(totalRouting)} NM</span>
          <span style="color: var(--text-muted); font-size: 0.85rem;"> (${legAB} + ${legBC})</span>
        </div>`;
    } else {
      const directDistance = Math.round(selectedDestinationAirport.distance);
      distanceDisplay = `<div style="color: var(--text-secondary); font-size: 0.9rem;">Distance: <span style="color: var(--text-primary); font-weight: 600;">${directDistance} NM</span></div>`;
    }

    timingContainer.style.display = 'block';
    timingContainer.innerHTML = `
      <div style="background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 4px; padding: 1.5rem;">
        <h4 style="margin: 0 0 1rem 0; color: var(--text-primary); font-weight: 600;">FLIGHT TIMING</h4>
        <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
          <div style="color: var(--text-secondary); font-size: 0.9rem;">Aircraft: <span style="color: var(--text-primary); font-weight: 600;">${aircraftName}</span></div>
          <div style="color: var(--text-secondary); font-size: 0.9rem;">Cruise Speed: <span style="color: var(--text-primary); font-weight: 600;">${cruiseSpeed} knots</span></div>
          ${routingDisplay}
          ${distanceDisplay}
          <div style="color: var(--text-secondary); font-size: 0.9rem;">Flight Time (air): <span style="color: var(--text-primary); font-weight: 600;">${formatDuration(flightTimeMinutes)}</span></div>
          <div style="color: var(--text-secondary); font-size: 0.9rem;">Taxi Time (per leg): <span style="color: var(--text-primary); font-weight: 600;">${formatDuration(taxiTimePerLeg)}</span>${selectedTechStopAirport ? ' <span style="color: var(--accent-color); font-size: 0.85rem;">(doubled for tech stop)</span>' : ''}</div>
          ${selectedTechStopAirport ? `<div style="color: var(--text-secondary); font-size: 0.9rem;">Refueling Time: <span style="color: var(--accent-color); font-weight: 600;">${formatDuration(refuelingTimePerLeg)}</span> <span style="color: var(--text-muted); font-size: 0.85rem;">(at ${selectedTechStopAirport.icaoCode})</span></div>` : ''}
          <div style="color: var(--text-secondary); font-size: 0.9rem;">Block Time (per leg): <span style="color: var(--text-primary); font-weight: 600;">${formatDuration(blockTimeMinutes)}</span></div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem;">
          <div>
            <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.25rem;">OFF BLOCKS</div>
            <div style="color: var(--accent-color); font-weight: 700; font-size: 1.3rem;">${formatTime(offBlocksOutbound)}</div>
            <div style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 0.25rem;">Outbound Departure</div>
          </div>
          <div>
            <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.25rem;">ON BLOCKS</div>
            <div style="color: var(--success-color); font-weight: 700; font-size: 1.3rem;">${formatTime(onBlocksDestination)}</div>
            <div style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 0.25rem;">Arrival at ${selectedDestinationAirport.iataCode || selectedDestinationAirport.icaoCode}</div>
          </div>
          <div>
            <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.25rem;">OFF BLOCKS</div>
            <div style="color: var(--accent-color); font-weight: 700; font-size: 1.3rem;">${formatTime(offBlocksReturn)}</div>
            <div style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 0.25rem;">Return Departure</div>
          </div>
          <div>
            <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.25rem;">ON BLOCKS</div>
            <div style="color: var(--success-color); font-weight: 700; font-size: 1.3rem;">${formatTime(onBlocksBase)}</div>
            <div style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 0.25rem;">Arrival at ${baseAirport.iataCode || baseAirport.icaoCode}</div>
          </div>
        </div>
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.85rem;">
          Total Block Time: <span style="color: var(--text-primary); font-weight: 600;">${formatDuration(onBlocksBase - offBlocksOutbound)}</span>
        </div>
      </div>
    `;
  }
}

// Backward compatibility - keep old function name
function calculateReturnTime() {
  calculateFlightTiming();
}

// Validate route number for duplicates (checking day conflicts)
function validateRouteNumber(fieldId) {
  const field = document.getElementById(fieldId);
  const numberPart = field.value.trim();

  // Clear previous validation
  let errorDiv = field.parentElement.parentElement.querySelector('.validation-error');
  if (errorDiv) {
    errorDiv.remove();
  }
  field.style.borderColor = '';

  if (!numberPart) return true;

  // Get the full route number (prefix + number)
  const prefix = worldInfo?.iataCode || '';
  const fullRouteNumber = prefix + numberPart;

  // Check if route number conflicts with existing routes on same days
  const conflictingRoute = allRoutes.find(route => {
    const matchesRouteNumber = route.routeNumber === fullRouteNumber || route.returnRouteNumber === fullRouteNumber;

    if (!matchesRouteNumber) return false;

    // Check if there's any overlap in operating days
    const existingDays = route.daysOfWeek || [];
    const hasOverlap = selectedDaysOfWeek.some(day => existingDays.includes(day));

    return hasOverlap;
  });

  if (conflictingRoute) {
    field.style.borderColor = 'var(--warning-color)';
    errorDiv = document.createElement('div');
    errorDiv.className = 'validation-error';
    errorDiv.style.cssText = 'color: var(--warning-color); font-size: 0.85rem; margin-top: 0.25rem;';
    errorDiv.textContent = `Route number ${fullRouteNumber} conflicts with existing route on selected days`;
    field.parentElement.parentElement.appendChild(errorDiv);
    return false;
  }

  return true;
}

// Update return route number suggestion
function suggestReturnRouteNumber() {
  const outboundNumber = document.getElementById('routeNumber').value.trim();
  const returnNumberField = document.getElementById('returnRouteNumber');

  // Validate for duplicates
  validateRouteNumber('routeNumber');

  if (!outboundNumber) {
    returnNumberField.value = '';
    returnNumberField.placeholder = '124';
    return;
  }

  // Parse the number and increment by 1
  const number = parseInt(outboundNumber);
  if (!isNaN(number)) {
    returnNumberField.value = (number + 1).toString();
  } else {
    // If not a valid number, just copy it
    returnNumberField.value = outboundNumber;
  }
}

// Update pricing section visibility based on transport type
function updatePricingVisibility() {
  const transportType = document.getElementById('transportType').value;
  const passengerSection = document.getElementById('passengerPricingSection');
  const cargoSection = document.getElementById('cargoPricingSection');

  passengerSection.style.display = (transportType === 'cargo_only') ? 'none' : 'block';
  cargoSection.style.display = (transportType === 'passengers_only') ? 'none' : 'block';
}

// Auto-calculate business and first class prices from economy
function autoCalculateBusinessFirst() {
  const economyPrice = parseFloat(document.getElementById('economyPrice').value) || 0;
  if (economyPrice > 0) {
    const businessField = document.getElementById('businessPrice');
    const firstField = document.getElementById('firstPrice');

    // Only auto-calculate if fields are enabled (available on this aircraft)
    if (!businessField.disabled) {
      businessField.value = Math.round(economyPrice * 2.6);
    }
    if (!firstField.disabled) {
      firstField.value = Math.round(economyPrice * 4.6);
    }
  }
}

// Adjust individual price field by percentage
function adjustPrice(fieldId, percentage) {
  const field = document.getElementById(fieldId);
  // Skip disabled fields (unavailable passenger classes)
  if (field.disabled) return;

  const currentValue = parseFloat(field.value) || 0;
  const newValue = Math.round(currentValue * (1 + percentage / 100));
  field.value = newValue;
}

// Bulk adjust all ticket prices
function adjustAllTicketPrices(percentage) {
  adjustPrice('economyPrice', percentage);
  adjustPrice('economyPlusPrice', percentage);
  adjustPrice('businessPrice', percentage);
  adjustPrice('firstPrice', percentage);
}

// Bulk adjust all cargo rates
function adjustAllCargoRates(percentage) {
  adjustPrice('cargoLightRate', percentage);
  adjustPrice('cargoStandardRate', percentage);
  adjustPrice('cargoHeavyRate', percentage);
}

// Submit new route
async function submitNewRoute() {
  const prefix = worldInfo?.iataCode || '';
  const routeNumberPart = document.getElementById('routeNumber').value.trim();
  const returnRouteNumberPart = document.getElementById('returnRouteNumber').value.trim();

  // Validation - check for empty flight numbers
  if (!routeNumberPart) {
    alert('Please enter an outbound flight number');
    document.getElementById('routeNumber').focus();
    return;
  }

  if (!returnRouteNumberPart) {
    alert('Please enter a return flight number');
    document.getElementById('returnRouteNumber').focus();
    return;
  }

  const routeNumber = prefix + routeNumberPart;
  const returnRouteNumber = prefix + returnRouteNumberPart;
  const assignedAircraftId = document.getElementById('assignedAircraft').value || null;
  const departureTime = document.getElementById('departureTime').value;
  const turnaroundTime = parseInt(document.getElementById('turnaroundTime').value) || 45;

  // Get pricing values
  const economyPrice = parseFloat(document.getElementById('economyPrice').value) || 0;
  const economyPlusPrice = parseFloat(document.getElementById('economyPlusPrice').value) || 0;
  const businessPrice = parseFloat(document.getElementById('businessPrice').value) || 0;
  const firstPrice = parseFloat(document.getElementById('firstPrice').value) || 0;
  const transportType = document.getElementById('transportType').value;

  // Check for route number conflicts on same operating days
  if (!validateRouteNumber('routeNumber')) {
    alert('Route number conflicts with an existing route on the selected operating days. Choose a different route number or change the operating days.');
    document.getElementById('routeNumber').focus();
    return;
  }

  // Check for return route number conflicts on same operating days
  if (!validateRouteNumber('returnRouteNumber')) {
    alert('Return route number conflicts with an existing route on the selected operating days. Choose a different route number or change the operating days.');
    document.getElementById('returnRouteNumber').focus();
    return;
  }

  if (!selectedDestinationAirport) {
    alert('Please select a destination airport');
    return;
  }

  if (!departureTime) {
    alert('Please enter a departure time');
    document.getElementById('departureTime').focus();
    return;
  }

  if (!assignedAircraftId) {
    alert('Please select an aircraft type for route calculations');
    document.getElementById('assignedAircraft').focus();
    return;
  }

  // Validate pricing based on transport type
  if (transportType === 'passengers_only' || transportType === 'both') {
    const economyField = document.getElementById('economyPrice');
    // Only validate economy price if the field is enabled (aircraft has economy class)
    if (!economyField.disabled && (!economyPrice || economyPrice <= 0)) {
      alert('Please enter a valid Economy class ticket price');
      economyField.focus();
      return;
    }
  }

  if (selectedDaysOfWeek.length === 0) {
    alert('Please select at least one day of operation');
    return;
  }

  // Check if we should create separate routes for each day
  const createSeparateRoutes = document.getElementById('createSeparateDailyRoutes').checked;

  // Show loading overlay
  showLoadingOverlay(createSeparateRoutes ? `Creating ${selectedDaysOfWeek.length} routes...` : 'Creating route...');

  try {
    if (createSeparateRoutes && selectedDaysOfWeek.length > 1) {
      // Create separate routes for each selected day (same flight number, different days)
      let createdRoutes = [];
      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      for (let i = 0; i < selectedDaysOfWeek.length; i++) {
        const day = selectedDaysOfWeek[i];
        updateLoadingProgress(i + 1, selectedDaysOfWeek.length, `Creating ${routeNumber} (${dayLabels[day]})...`);
        const response = await fetch('/api/routes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            routeNumber: routeNumber, // Same flight number for all
            returnRouteNumber: returnRouteNumber, // Same return flight number for all
            departureAirportId: baseAirport.id,
            arrivalAirportId: selectedDestinationAirport.id,
            techStopAirportId: selectedTechStopAirport ? selectedTechStopAirport.id : null,
            assignedAircraftId: assignedAircraftId,
            distance: selectedTechStopAirport && selectedDestinationAirport.routingDistance
              ? selectedDestinationAirport.routingDistance
              : selectedDestinationAirport.distance,
            scheduledDepartureTime: departureTime,
            turnaroundTime,
            daysOfWeek: [day], // Single day only
            ticketPrice: economyPrice,
            economyPrice: economyPrice,
            economyPlusPrice: economyPlusPrice,
            businessPrice: businessPrice,
            firstPrice: firstPrice,
            cargoLightRate: parseFloat(document.getElementById('cargoLightRate').value) || 0,
            cargoStandardRate: parseFloat(document.getElementById('cargoStandardRate').value) || 0,
            cargoHeavyRate: parseFloat(document.getElementById('cargoHeavyRate').value) || 0,
            transportType: transportType,
            demand: 0
          })
        });

        const data = await response.json();

        if (!response.ok) {
          hideLoadingOverlay();
          throw new Error(data.error || `Failed to create route ${routeNumber} for ${dayLabels[day]}`);
        }

        createdRoutes.push(`${routeNumber} (${dayLabels[day]})`);
      }

      // Success - keep loading overlay visible during redirect
      window.location.href = `/routes?success=created&route=${encodeURIComponent(routeNumber + ' - ' + selectedDaysOfWeek.length + ' services')}`;
    } else {
      // Create single route with all selected days (default behavior)
      const response = await fetch('/api/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          routeNumber,
          returnRouteNumber,
          departureAirportId: baseAirport.id,
          arrivalAirportId: selectedDestinationAirport.id,
          techStopAirportId: selectedTechStopAirport ? selectedTechStopAirport.id : null,
          assignedAircraftId: assignedAircraftId,
          distance: selectedTechStopAirport && selectedDestinationAirport.routingDistance
            ? selectedDestinationAirport.routingDistance
            : selectedDestinationAirport.distance,
          scheduledDepartureTime: departureTime,
          turnaroundTime,
          daysOfWeek: selectedDaysOfWeek,
          ticketPrice: economyPrice,
          economyPrice: economyPrice,
          economyPlusPrice: economyPlusPrice,
          businessPrice: businessPrice,
          firstPrice: firstPrice,
          cargoLightRate: parseFloat(document.getElementById('cargoLightRate').value) || 0,
          cargoStandardRate: parseFloat(document.getElementById('cargoStandardRate').value) || 0,
          cargoHeavyRate: parseFloat(document.getElementById('cargoHeavyRate').value) || 0,
          transportType: transportType,
          demand: 0
        })
      });

      const data = await response.json();

      if (!response.ok) {
        hideLoadingOverlay();
        throw new Error(data.error || 'Failed to create route');
      }

      // Success - keep loading overlay visible during redirect
      window.location.href = `/routes?success=created&route=${encodeURIComponent(routeNumber)}`;
    }
  } catch (error) {
    hideLoadingOverlay();
    console.error('Error creating route:', error);
    alert(`Error: ${error.message}`);
  }
}

// Loading overlay functions
function showLoadingOverlay(message = 'Creating route...') {
  // Remove existing overlay if present
  hideLoadingOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'loadingOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  overlay.innerHTML = `
    <div style="text-align: center;">
      <div class="loading-spinner" style="
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-top: 4px solid var(--accent-color);
        border-radius: 50%;
        width: 60px;
        height: 60px;
        animation: spin 1s linear infinite;
        margin: 0 auto 1.5rem auto;
      "></div>
      <div id="loadingMessage" style="
        color: white;
        font-size: 1.2rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
      ">${message}</div>
      <div id="loadingProgress" style="
        color: rgba(255, 255, 255, 0.7);
        font-size: 0.9rem;
      "></div>
    </div>
  `;

  // Add spinner animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(overlay);
}

function updateLoadingProgress(current, total, message) {
  const messageEl = document.getElementById('loadingMessage');
  const progressEl = document.getElementById('loadingProgress');

  if (messageEl) {
    messageEl.textContent = message;
  }

  if (progressEl) {
    progressEl.textContent = `${current} of ${total} routes created`;
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.remove();
  }
}

// Technical Stop Functions
function toggleTechStopSection() {
  const checkbox = document.getElementById('includeTechStop');
  const section = document.getElementById('techStopSection');

  if (checkbox.checked) {
    section.style.display = 'block';
  } else {
    section.style.display = 'none';
    clearTechStop();
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  // Haversine formula to calculate distance in nautical miles
  const R = 3440.065; // Earth's radius in nautical miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return Math.round(distance);
}

function searchTechStopAirports() {
  const searchInput = document.getElementById('techStopSearch');
  const searchTerm = searchInput.value.trim().toLowerCase();
  const resultsContainer = document.getElementById('techStopResults');

  if (searchTerm.length < 2) {
    resultsContainer.style.display = 'none';
    return;
  }

  // Filter airports based on search term
  const filteredAirports = availableAirports.filter(airport => {
    return (
      airport.icaoCode?.toLowerCase().includes(searchTerm) ||
      airport.iataCode?.toLowerCase().includes(searchTerm) ||
      airport.name?.toLowerCase().includes(searchTerm) ||
      airport.city?.toLowerCase().includes(searchTerm)
    );
  }).slice(0, 10); // Limit to 10 results

  if (filteredAirports.length === 0) {
    resultsContainer.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.75rem;">No airports found</div>';
    resultsContainer.style.display = 'block';
    return;
  }

  // Render results
  resultsContainer.innerHTML = filteredAirports.map(airport => `
    <div
      onclick="selectTechStop('${airport.id}')"
      style="padding: 0.5rem; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background 0.2s;"
      onmouseover="this.style.background='var(--surface)'"
      onmouseout="this.style.background='transparent'"
    >
      <div style="font-weight: 600; font-size: 0.8rem; color: var(--text-primary); margin-bottom: 0.15rem;">
        ${airport.icaoCode} - ${airport.name}
      </div>
      <div style="font-size: 0.7rem; color: var(--text-secondary);">
        ${airport.city}, ${airport.country}
      </div>
    </div>
  `).join('');

  resultsContainer.style.display = 'block';
}

function selectTechStop(airportId) {
  if (!baseAirport || !selectedDestinationAirport) {
    alert('Please select a destination first');
    return;
  }

  // Find the selected airport
  const airport = availableAirports.find(a => a.id === airportId);
  if (!airport) return;

  selectedTechStopAirport = airport;

  // Calculate distances for each leg
  const distanceFromDep = calculateDistance(
    baseAirport.latitude,
    baseAirport.longitude,
    airport.latitude,
    airport.longitude
  );

  const distanceToDest = calculateDistance(
    airport.latitude,
    airport.longitude,
    selectedDestinationAirport.latitude,
    selectedDestinationAirport.longitude
  );

  // Store leg distances on the tech stop object for later use
  selectedTechStopAirport.distanceFromDeparture = distanceFromDep;
  selectedTechStopAirport.distanceToDestination = distanceToDest;

  // Calculate total routing distance (one-way): A→B + B→C
  const totalRoutingDistance = distanceFromDep + distanceToDest;

  // Update the destination's distance to reflect the routing distance
  selectedDestinationAirport.routingDistance = totalRoutingDistance;

  // Update display
  document.getElementById('techStopName').textContent =
    `${airport.icaoCode} - ${airport.name}`;
  document.getElementById('techStopDetails').textContent =
    `${airport.city}, ${airport.country}`;
  document.getElementById('techStopDistanceFromDep').textContent =
    `${distanceFromDep} NM`;
  document.getElementById('techStopDistanceToDest').textContent =
    `${distanceToDest} NM`;

  // Hide search results and show selected tech stop
  document.getElementById('techStopResults').style.display = 'none';
  document.getElementById('selectedTechStop').style.display = 'block';
  document.getElementById('techStopSearch').value = '';

  // Recalculate flight timing with tech stop
  calculateFlightTiming();
}

function clearTechStop() {
  selectedTechStopAirport = null;

  // Clear routing distance from destination
  if (selectedDestinationAirport) {
    delete selectedDestinationAirport.routingDistance;
  }

  document.getElementById('selectedTechStop').style.display = 'none';
  document.getElementById('techStopSearch').value = '';
  document.getElementById('techStopResults').style.display = 'none';

  // Recalculate flight timing without tech stop
  calculateFlightTiming();
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
  await fetchWorldInfo();
  await fetchUserFleet();
  await fetchExistingRoutes();

  // Fetch pricing defaults in the background
  fetchGlobalPricing();
  fetchAircraftTypePricing();

  if (!baseAirport) {
    alert('Error: Could not determine your base airport. Please set a base airport first.');
    window.location.href = '/routes';
    return;
  }

  await loadAvailableAirports();

  // Add event listeners for return route calculations
  document.getElementById('departureTime').addEventListener('change', calculateReturnTime);
  document.getElementById('turnaroundTime').addEventListener('input', calculateReturnTime);
  document.getElementById('assignedAircraft').addEventListener('change', onAircraftSelectionChange);
  document.getElementById('routeNumber').addEventListener('input', suggestReturnRouteNumber);
  document.getElementById('returnRouteNumber').addEventListener('input', () => validateRouteNumber('returnRouteNumber'));

  // Add event listener for default turnaround time checkbox
  const saveDefaultCheckbox = document.getElementById('saveDefaultTurnaround');
  if (saveDefaultCheckbox) {
    saveDefaultCheckbox.addEventListener('change', function() {
      if (this.checked) {
        saveDefaultTurnaroundTime();
      }
    });
  }

  // Add event listeners for pricing functionality
  const transportTypeEl = document.getElementById('transportType');
  if (transportTypeEl) {
    transportTypeEl.addEventListener('change', updatePricingVisibility);
  }

  const economyPriceEl = document.getElementById('economyPrice');
  if (economyPriceEl) {
    economyPriceEl.addEventListener('change', autoCalculateBusinessFirst);
  }
});
