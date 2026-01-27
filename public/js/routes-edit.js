let routeId = null;
let existingRoute = null;
let baseAirport = null;
let worldInfo = null;
let availableAirports = [];
let newDestinationAirport = null;
let userFleet = [];
let allRoutes = [];
let isChangingDestination = false;
let selectedDaysOfWeek = [];

// Get route ID from URL
function getRouteIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('id');
}

// Fetch existing route data
async function fetchRouteData() {
  try {
    const response = await fetch(`/api/routes`);
    if (response.ok) {
      const routes = await response.json();
      existingRoute = routes.find(r => r.id === routeId);

      if (!existingRoute) {
        alert('Route not found');
        window.location.href = '/routes';
        return;
      }

      populateFormFields();
    }
  } catch (error) {
    console.error('Error fetching route:', error);
    alert('Error loading route data');
    window.location.href = '/routes';
  }
}

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

// Fetch existing routes for filtering
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

// Populate fleet dropdown
function populateFleetDropdown() {
  const select = document.getElementById('assignedAircraft');
  select.innerHTML = '<option value="">-- Not assigned --</option>' +
    userFleet.map(aircraft => `
      <option value="${aircraft.id}">
        ${aircraft.registration} - ${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? '-' + aircraft.aircraft.variant : ''}
      </option>
    `).join('');

  // Select current aircraft if assigned
  if (existingRoute && existingRoute.assignedAircraft) {
    select.value = existingRoute.assignedAircraft.id;
  }
}

// Populate form fields with existing route data
function populateFormFields() {
  // Set prefix fields
  if (worldInfo && worldInfo.iataCode) {
    document.getElementById('routePrefix').value = worldInfo.iataCode;
    document.getElementById('returnRoutePrefix').value = worldInfo.iataCode;
  }

  // Extract route number suffix (remove prefix)
  const prefix = worldInfo?.iataCode || '';
  const routeNumSuffix = existingRoute.routeNumber.startsWith(prefix)
    ? existingRoute.routeNumber.substring(prefix.length)
    : existingRoute.routeNumber;
  const returnRouteNumSuffix = existingRoute.returnRouteNumber && existingRoute.returnRouteNumber.startsWith(prefix)
    ? existingRoute.returnRouteNumber.substring(prefix.length)
    : existingRoute.returnRouteNumber || '';

  document.getElementById('routeNumber').value = routeNumSuffix;
  document.getElementById('returnRouteNumber').value = returnRouteNumSuffix;
  document.getElementById('departureTime').value = existingRoute.scheduledDepartureTime;
  document.getElementById('isActive').checked = existingRoute.isActive;

  // Set turnaround time
  document.getElementById('turnaroundTime').value = existingRoute.turnaroundTime || 45;

  // Set transport type
  document.getElementById('transportType').value = existingRoute.transportType || 'both';

  // Set pricing values
  document.getElementById('economyPrice').value = existingRoute.economyPrice || 0;
  document.getElementById('economyPlusPrice').value = existingRoute.economyPlusPrice || 0;
  document.getElementById('businessPrice').value = existingRoute.businessPrice || 0;
  document.getElementById('firstPrice').value = existingRoute.firstPrice || 0;

  // Set days of week
  if (existingRoute.daysOfWeek && existingRoute.daysOfWeek.length > 0) {
    selectedDaysOfWeek = [...existingRoute.daysOfWeek];
    selectedDaysOfWeek.forEach(day => {
      const button = document.querySelector(`button[data-day="${day}"]`);
      if (button) {
        button.style.background = 'var(--accent-color)';
        button.style.borderColor = 'var(--accent-color)';
        button.style.color = 'white';
      }
    });
  }

  // Show current destination
  document.getElementById('currentDestName').textContent =
    `${existingRoute.arrivalAirport.icaoCode} - ${existingRoute.arrivalAirport.name}`;
  document.getElementById('currentDestDetails').textContent =
    `${existingRoute.arrivalAirport.city}, ${existingRoute.arrivalAirport.country}`;
  document.getElementById('currentDestDistance').textContent =
    `${Math.round(existingRoute.distance)} NM`;

  // Show arrival airport in readonly field
  document.getElementById('arrivalAirport').value =
    `${existingRoute.arrivalAirport.icaoCode} - ${existingRoute.arrivalAirport.name}`;

  // Show the form
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('editForm').style.display = 'block';
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

// Show destination change panel
async function changeDestination() {
  isChangingDestination = true;
  document.getElementById('currentDestinationPanel').style.display = 'none';
  document.getElementById('destinationSelectionPanel').style.display = 'block';

  // Load airports if not already loaded
  if (availableAirports.length === 0) {
    await loadAvailableAirports();
  }
}

// Cancel destination change
function cancelDestinationChange() {
  isChangingDestination = false;
  newDestinationAirport = null;
  document.getElementById('currentDestinationPanel').style.display = 'block';
  document.getElementById('destinationSelectionPanel').style.display = 'none';
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

  // Get existing route destinations (excluding current route)
  const existingDestinations = allRoutes
    .filter(r => r.id !== routeId)
    .map(r => r.arrivalAirport.icaoCode);

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
    const isSelected = newDestinationAirport?.id === airport.id;
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
  newDestinationAirport = availableAirports.find(a => a.id === airportId);

  if (newDestinationAirport) {
    // Update current destination panel with new selection
    document.getElementById('currentDestName').textContent =
      `${newDestinationAirport.icaoCode} - ${newDestinationAirport.name}`;

    document.getElementById('currentDestDetails').textContent =
      `${newDestinationAirport.city}, ${newDestinationAirport.country}`;

    document.getElementById('currentDestDistance').textContent =
      `${Math.round(newDestinationAirport.distance)} NM`;

    // Update arrival airport field
    document.getElementById('arrivalAirport').value =
      `${newDestinationAirport.icaoCode} - ${newDestinationAirport.name}`;

    // Hide selection panel and show updated current destination
    document.getElementById('destinationSelectionPanel').style.display = 'none';
    document.getElementById('currentDestinationPanel').style.display = 'block';

    // Re-render list to show selection
    applyDestinationFilters();
  }
}

// Toggle day selection
function toggleDay(day) {
  const button = document.querySelector(`button[data-day="${day}"]`);
  if (!button) return;

  const index = selectedDaysOfWeek.indexOf(day);

  if (index > -1) {
    // Day is selected, remove it
    selectedDaysOfWeek.splice(index, 1);
    button.style.background = 'var(--surface-elevated)';
    button.style.borderColor = 'var(--border-color)';
    button.style.color = 'var(--text-muted)';
  } else {
    // Day is not selected, add it
    selectedDaysOfWeek.push(day);
    button.style.background = 'var(--accent-color)';
    button.style.borderColor = 'var(--accent-color)';
    button.style.color = 'white';
  }
}

// Show confirmation modal
function showConfirmationModal() {
  document.getElementById('confirmationModal').style.display = 'flex';
}

// Close confirmation modal
function closeConfirmationModal() {
  document.getElementById('confirmationModal').style.display = 'none';
}

// Confirm and submit route update
async function confirmRouteUpdate() {
  closeConfirmationModal();
  await submitRouteUpdate();
}

// Submit route update
async function submitRouteUpdate() {
  const prefix = worldInfo?.iataCode || '';
  const routeNumberPart = document.getElementById('routeNumber').value.trim();
  const returnRouteNumberPart = document.getElementById('returnRouteNumber').value.trim();
  const assignedAircraftId = document.getElementById('assignedAircraft').value || null;
  const departureTime = document.getElementById('departureTime').value;
  const turnaroundTime = parseInt(document.getElementById('turnaroundTime').value) || 45;
  const transportType = document.getElementById('transportType').value;
  const isActive = document.getElementById('isActive').checked;

  // Get pricing values
  const economyPrice = parseFloat(document.getElementById('economyPrice').value) || 0;
  const economyPlusPrice = parseFloat(document.getElementById('economyPlusPrice').value) || 0;
  const businessPrice = parseFloat(document.getElementById('businessPrice').value) || 0;
  const firstPrice = parseFloat(document.getElementById('firstPrice').value) || 0;

  // Validation
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

  if (selectedDaysOfWeek.length === 0) {
    alert('Please select at least one day of operation');
    return;
  }

  if (!departureTime) {
    alert('Please enter a departure time');
    document.getElementById('departureTime').focus();
    return;
  }

  if (!economyPrice || economyPrice <= 0) {
    alert('Please enter a valid economy class price');
    document.getElementById('economyPrice').focus();
    return;
  }

  if (!businessPrice || businessPrice <= 0) {
    alert('Please enter a valid business class price');
    document.getElementById('businessPrice').focus();
    return;
  }

  if (!firstPrice || firstPrice <= 0) {
    alert('Please enter a valid first class price');
    document.getElementById('firstPrice').focus();
    return;
  }

  // Prepare update data
  const updateData = {
    routeNumber: prefix + routeNumberPart,
    returnRouteNumber: prefix + returnRouteNumberPart,
    assignedAircraftId,
    scheduledDepartureTime: departureTime,
    turnaroundTime,
    daysOfWeek: selectedDaysOfWeek,
    transportType,
    economyPrice,
    economyPlusPrice,
    businessPrice,
    firstPrice,
    isActive
  };

  // If destination changed, include new destination and distance
  if (newDestinationAirport) {
    updateData.arrivalAirportId = newDestinationAirport.id;
    updateData.distance = newDestinationAirport.distance;
  }

  try {
    const response = await fetch(`/api/routes/${routeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update route');
    }

    // Navigate back to routes page
    window.location.href = '/routes';
  } catch (error) {
    console.error('Error updating route:', error);
    alert(`Error: ${error.message}`);
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
  routeId = getRouteIdFromUrl();

  if (!routeId) {
    alert('No route ID specified');
    window.location.href = '/routes';
    return;
  }

  await fetchWorldInfo();
  await fetchUserFleet();
  await fetchExistingRoutes();
  await fetchRouteData();
});
