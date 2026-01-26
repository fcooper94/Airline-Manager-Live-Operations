let baseAirport = null;
let worldInfo = null;
let availableAirports = [];
let selectedDestinationAirport = null;
let userFleet = [];
let allRoutes = [];
let selectedDaysOfWeek = [0, 1, 2, 3, 4, 5, 6]; // Default: all days selected

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

// Populate fleet dropdown
function populateFleetDropdown() {
  const select = document.getElementById('assignedAircraft');
  select.innerHTML = '<option value="">-- Not assigned --</option>' +
    userFleet.map(aircraft => `
      <option value="${aircraft.id}">
        ${aircraft.registration} - ${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? '-' + aircraft.aircraft.variant : ''}
      </option>
    `).join('');
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

  if (selectedDestinationAirport) {
    // Update selected destination panel
    const panel = document.getElementById('selectedDestinationPanel');
    panel.style.display = 'block';

    document.getElementById('selectedDestName').textContent =
      `${selectedDestinationAirport.icaoCode} - ${selectedDestinationAirport.name}`;

    document.getElementById('selectedDestDetails').textContent =
      `${selectedDestinationAirport.city}, ${selectedDestinationAirport.country} • ${selectedDestinationAirport.type}`;

    document.getElementById('selectedDestDistance').textContent =
      `${Math.round(selectedDestinationAirport.distance)} NM`;

    // Re-render list to show selection
    applyDestinationFilters();

    // Calculate return time if applicable
    calculateReturnTime();

    // Scroll to selected destination panel
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Clear destination selection
function clearDestination() {
  selectedDestinationAirport = null;
  document.getElementById('selectedDestinationPanel').style.display = 'none';
  document.getElementById('calculatedReturnTime').value = '--:--';
  applyDestinationFilters();
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
    // Select all days
    selectedDaysOfWeek = [0, 1, 2, 3, 4, 5, 6];
  } else {
    // Deselect all days
    selectedDaysOfWeek = [];
  }

  updateDayButtonStates();
}

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
  const flightTimeMinutes = Math.round(flightTimeHours * 60);
  return flightTimeMinutes;
}

// Calculate return departure time
function calculateReturnTime() {
  if (!selectedDestinationAirport) {
    document.getElementById('calculatedReturnTime').value = '--:--';
    return;
  }

  const outboundDepartureTime = document.getElementById('departureTime').value;
  if (!outboundDepartureTime) {
    document.getElementById('calculatedReturnTime').value = '--:--';
    return;
  }

  const turnaroundMinutes = parseInt(document.getElementById('turnaroundTime').value) || 45;
  const flightTimeMinutes = calculateFlightTime(selectedDestinationAirport.distance);

  // Parse outbound departure time
  const [hours, minutes] = outboundDepartureTime.split(':').map(Number);
  let totalMinutes = (hours * 60) + minutes + flightTimeMinutes + turnaroundMinutes;

  // Handle day overflow
  const daysOffset = Math.floor(totalMinutes / (24 * 60));
  totalMinutes = totalMinutes % (24 * 60);

  const returnHours = Math.floor(totalMinutes / 60);
  const returnMinutes = totalMinutes % 60;

  const returnTimeStr = `${String(returnHours).padStart(2, '0')}:${String(returnMinutes).padStart(2, '0')}`;
  const dayNote = daysOffset > 0 ? ` (+${daysOffset}d)` : '';

  document.getElementById('calculatedReturnTime').value = returnTimeStr + dayNote;
}

// Update return route number suggestion
function suggestReturnRouteNumber() {
  const outboundNumber = document.getElementById('routeNumber').value.trim();
  const returnNumberField = document.getElementById('returnRouteNumber');

  if (!outboundNumber) {
    returnNumberField.value = '';
    returnNumberField.placeholder = 'e.g., BA124';
    return;
  }

  // Always increment the route number by 1
  const match = outboundNumber.match(/^([A-Z]+)(\d+)$/i);
  if (match) {
    const prefix = match[1].toUpperCase();
    const number = parseInt(match[2]);
    const suggestedReturn = `${prefix}${number + 1}`;
    returnNumberField.value = suggestedReturn;
  } else {
    // If format doesn't match, append -R
    returnNumberField.value = `${outboundNumber}-R`;
  }
}

// Submit new route
async function submitNewRoute() {
  const routeNumber = document.getElementById('routeNumber').value.trim();
  const returnRouteNumber = document.getElementById('returnRouteNumber').value.trim();
  const assignedAircraftId = document.getElementById('assignedAircraft').value || null;
  const departureTime = document.getElementById('departureTime').value;
  const ticketPrice = parseFloat(document.getElementById('ticketPrice').value);
  const frequency = document.getElementById('frequency').value;
  const turnaroundTime = parseInt(document.getElementById('turnaroundTime').value) || 45;

  // Validation
  if (!routeNumber) {
    alert('Please enter an outbound flight number');
    document.getElementById('routeNumber').focus();
    return;
  }

  if (!returnRouteNumber) {
    alert('Please enter a return flight number');
    document.getElementById('returnRouteNumber').focus();
    return;
  }

  if (!selectedDestinationAirport) {
    alert('Please select a destination airport');
    return;
  }

  if (!ticketPrice || ticketPrice <= 0) {
    alert('Please enter a valid ticket price');
    document.getElementById('ticketPrice').focus();
    return;
  }

  if (!departureTime) {
    alert('Please enter a departure time');
    document.getElementById('departureTime').focus();
    return;
  }

  if (selectedDaysOfWeek.length === 0) {
    alert('Please select at least one day of operation');
    return;
  }

  try {
    // Create route with both outbound and return flight numbers
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
        assignedAircraftId,
        distance: selectedDestinationAirport.distance,
        scheduledDepartureTime: departureTime,
        turnaroundTime,
        frequency,
        daysOfWeek: selectedDaysOfWeek,
        ticketPrice,
        demand: 0
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create route');
    }

    alert(`Route created successfully: ${routeNumber} / ${returnRouteNumber}`);
    window.location.href = '/routes';
  } catch (error) {
    console.error('Error creating route:', error);
    alert(`Error: ${error.message}`);
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
  await fetchWorldInfo();
  await fetchUserFleet();
  await fetchExistingRoutes();

  if (!baseAirport) {
    alert('Error: Could not determine your base airport. Please set a base airport first.');
    window.location.href = '/routes';
    return;
  }

  await loadAvailableAirports();

  // Add event listeners for return route calculations
  document.getElementById('departureTime').addEventListener('change', calculateReturnTime);
  document.getElementById('turnaroundTime').addEventListener('input', calculateReturnTime);
  document.getElementById('routeNumber').addEventListener('input', suggestReturnRouteNumber);
});
