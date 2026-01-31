// Aircraft Scheduling JavaScript - v2.0
let userFleet = [];
let routes = [];
let selectedDayOfWeek = 1; // Default to Monday (1=Monday, 0=Sunday)
let currentAircraftId = null; // Aircraft being scheduled
let draggedRoute = null; // Route being dragged
let scheduledFlights = []; // All scheduled flights
let scheduledMaintenance = []; // All scheduled maintenance checks
let scheduleWorldReferenceTime = null; // Server's world time at a specific moment
let scheduleWorldReferenceTimestamp = null; // Real-world timestamp when scheduleWorldReferenceTime was captured
let scheduleWorldTimeAcceleration = 60; // Time acceleration factor
let timelineInterval = null; // Interval for updating the timeline
let isFirstLoad = true; // Track if this is the first load
let worldTimeFetchInProgress = false; // Prevent concurrent fetches
let worldTimeFetchSequence = 0; // Track request order to ignore stale responses
let confirmModalResolve = null; // Promise resolve for confirm modal

// Wind adjustment for realistic flight times
// Jet stream flows west to east at mid-latitudes, making eastbound flights faster
const WIND_ADJUSTMENT_FACTOR = 0.13; // 13% variation for jet stream effect
const ROUTE_VARIATION_FACTOR = 0.035; // ±3.5% for natural-looking times

// Format a Date object to YYYY-MM-DD using local time (avoids UTC timezone shift issues)
function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Calculate days until target day of week
// Uses a heuristic: show the closest occurrence of the target day
// If target is more than 3 days back, assume user wants next week instead
function getDaysUntilTargetInWeek(currentDay, selectedDayOfWeek) {
  let diff = selectedDayOfWeek - currentDay;

  // If diff is very negative (more than 3 days back), go forward to next week
  if (diff < -3) {
    diff += 7;
  }
  // If diff is very positive (more than 3 days forward), go back to last week
  else if (diff > 3) {
    diff -= 7;
  }

  return diff;
}

// Format route number with color differentiation (prefix letters vs numbers)
function formatRouteNumber(routeNum) {
  if (!routeNum) return '';
  const match = routeNum.match(/^([A-Za-z]+)(\d+)$/);
  if (match) {
    return `<span class="route-prefix">${match[1]}</span><span class="route-num">${match[2]}</span>`;
  }
  return routeNum;
}

function getWindMultiplier(depLng, arrLng, depLat = 0, arrLat = 0) {
  // Calculate longitude difference (handling date line crossing)
  let lngDiff = arrLng - depLng;
  if (lngDiff > 180) lngDiff -= 360;
  else if (lngDiff < -180) lngDiff += 360;

  // Scale effect based on latitude (strongest at mid-latitudes 30-60°)
  const avgLat = Math.abs((depLat + arrLat) / 2);
  let latitudeScale = 1.0;
  if (avgLat < 20) latitudeScale = 0.2;
  else if (avgLat < 30) latitudeScale = 0.5;
  else if (avgLat > 60) latitudeScale = 0.6;

  // Only apply wind effect for significant east-west travel
  if (Math.abs(lngDiff) < 10) return 1.0;

  // Eastbound (positive lngDiff) = faster, Westbound = slower
  const direction = lngDiff > 0 ? -1 : 1;
  const eastWestRatio = Math.min(1, Math.abs(lngDiff) / 90);
  return 1 + (direction * WIND_ADJUSTMENT_FACTOR * latitudeScale * eastWestRatio);
}

// Deterministic route-specific variation for natural-looking times
function getRouteVariation(depLat, depLng, arrLat, arrLng) {
  const coordSum = (depLat * 7.3) + (depLng * 11.7) + (arrLat * 13.1) + (arrLng * 17.9);
  const hash = Math.sin(coordSum) * 10000;
  const normalized = hash - Math.floor(hash);
  const variation = (normalized - 0.5) * 2 * ROUTE_VARIATION_FACTOR;
  return 1 + variation;
}

function calculateFlightMinutes(distanceNm, cruiseSpeed, depLng, arrLng, depLat, arrLat) {
  const baseMinutes = (distanceNm / cruiseSpeed) * 60;
  const windMultiplier = getWindMultiplier(depLng, arrLng, depLat, arrLat);
  const routeVariation = getRouteVariation(depLat, depLng, arrLat, arrLng);
  return Math.round(baseMinutes * windMultiplier * routeVariation);
}

// Check maintenance schedule for warnings
// Returns array of { type: 'daily'|'weekly', message: string }
function getMaintenanceWarnings(aircraft) {
  const warnings = [];
  const maintenance = aircraft.recurringMaintenance || [];

  // Get daily checks (type A) - should be scheduled for all 7 days
  const dailyChecks = maintenance.filter(m => m.checkType === 'A');
  const dailyDays = new Set(dailyChecks.map(m => m.dayOfWeek));

  if (dailyDays.size < 7) {
    const missingDays = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayIndexes = [1, 2, 3, 4, 5, 6, 0]; // Monday first, Sunday last
    for (let i = 0; i < 7; i++) {
      if (!dailyDays.has(dayIndexes[i])) {
        missingDays.push(dayNames[i]);
      }
    }
    if (missingDays.length === 7) {
      warnings.push({ type: 'daily', message: 'No daily check scheduled' });
    } else {
      warnings.push({ type: 'daily', message: `Daily check missing: ${missingDays.join(', ')}` });
    }
  }

  // Get weekly checks (type B) - should have at least one
  const weeklyChecks = maintenance.filter(m => m.checkType === 'B');
  if (weeklyChecks.length === 0) {
    warnings.push({ type: 'weekly', message: 'No weekly check scheduled' });
  }

  return warnings;
}

// Listen for world time updates from layout.js (which manages the centralized socket connection)
window.addEventListener('worldTimeUpdated', (event) => {
  // Sync with the centralized time from layout.js
  if (scheduleWorldReferenceTime) {
    scheduleWorldReferenceTime = new Date(event.detail.referenceTime);
    scheduleWorldReferenceTimestamp = event.detail.referenceTimestamp;
    scheduleWorldTimeAcceleration = event.detail.acceleration;
    console.log('[Scheduling] Time synced from socket:', scheduleWorldReferenceTime.toLocaleTimeString());
  }
});

// Modal Helper Functions
function showConfirmModal(title, message) {
  return new Promise((resolve) => {
    confirmModalResolve = resolve;
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMessage').textContent = message;
    document.getElementById('confirmModal').style.display = 'flex';
  });
}

function closeConfirmModal(result) {
  document.getElementById('confirmModal').style.display = 'none';
  if (confirmModalResolve) {
    confirmModalResolve(result);
    confirmModalResolve = null;
  }
}

function showAlertModal(title, message) {
  return new Promise((resolve) => {
    document.getElementById('alertModalTitle').textContent = title;
    document.getElementById('alertModalMessage').textContent = message;
    document.getElementById('alertModal').style.display = 'flex';
    // Store resolve for when modal closes
    window.alertModalResolve = resolve;
  });
}

function closeAlertModal() {
  document.getElementById('alertModal').style.display = 'none';
  if (window.alertModalResolve) {
    window.alertModalResolve();
    window.alertModalResolve = null;
  }
}

// Loading Modal for batch operations
function showLoadingModal(title, message) {
  // Create loading modal if it doesn't exist
  let modal = document.getElementById('loadingModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'loadingModal';
    // Apply all styles inline to avoid any CSS class conflicts
    modal.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      margin: 0 !important;
      padding: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      background: rgba(0, 0, 0, 0.85) !important;
      z-index: 999999 !important;
    `;
    modal.innerHTML = `
      <div style="min-width: 320px; max-width: 400px; background: #161b22; border: 1px solid #30363d; border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);">
        <div style="padding: 1rem 1.5rem; border-bottom: 1px solid #30363d;">
          <h3 id="loadingModalTitle" style="margin: 0; color: #c9d1d9; font-size: 1.1rem;">Loading...</h3>
        </div>
        <div style="text-align: center; padding: 2rem;">
          <div style="margin-bottom: 1rem;">
            <svg width="48" height="48" viewBox="0 0 48 48" style="animation: spin 1s linear infinite;">
              <circle cx="24" cy="24" r="20" fill="none" stroke="#58a6ff" stroke-width="4" stroke-dasharray="80" stroke-linecap="round"/>
            </svg>
          </div>
          <p id="loadingModalMessage" style="margin: 0; color: #8b949e;"></p>
          <div id="loadingModalProgress" style="margin-top: 1rem; display: none;">
            <div style="background: #21262d; border-radius: 4px; height: 8px; overflow: hidden;">
              <div id="loadingModalProgressBar" style="background: #58a6ff; height: 100%; width: 0%; transition: width 0.3s ease;"></div>
            </div>
            <p id="loadingModalProgressText" style="margin: 0.5rem 0 0 0; font-size: 0.85rem; color: #8b949e;"></p>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Add CSS animation for spinner if not already present
    if (!document.getElementById('loadingModalStyles')) {
      const style = document.createElement('style');
      style.id = 'loadingModalStyles';
      style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
      document.head.appendChild(style);
    }
  }

  document.getElementById('loadingModalTitle').textContent = title;
  document.getElementById('loadingModalMessage').textContent = message;
  document.getElementById('loadingModalProgress').style.display = 'none';
  modal.style.display = 'flex';
}

function updateLoadingProgress(current, total, message) {
  const progressDiv = document.getElementById('loadingModalProgress');
  const progressBar = document.getElementById('loadingModalProgressBar');
  const progressText = document.getElementById('loadingModalProgressText');

  if (progressDiv && progressBar && progressText) {
    progressDiv.style.display = 'block';
    const percent = Math.round((current / total) * 100);
    progressBar.style.width = `${percent}%`;
    progressText.textContent = message || `${current} of ${total}`;
  }
}

function closeLoadingModal() {
  const modal = document.getElementById('loadingModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Get aircraft that are currently visible based on the filter
function getVisibleAircraft() {
  const filterValue = document.getElementById('aircraftFilter')?.value || 'all';

  if (filterValue === 'all') {
    return userFleet;
  }

  // Filter to specific aircraft type
  return userFleet.filter(aircraft => {
    const typeKey = `${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? '-' + aircraft.aircraft.variant : ''}`;
    return typeKey === filterValue;
  });
}

// Clear All Schedules Modal Functions
function showClearAllSchedulesModal() {
  // Count visible aircraft (respecting the filter)
  const visibleAircraft = getVisibleAircraft();
  const visibleAircraftCount = visibleAircraft.length;

  if (visibleAircraftCount === 0) {
    showAlertModal('No Aircraft', 'There are no aircraft visible to clear schedules from.');
    return;
  }

  // Update the count in the modal
  document.getElementById('clearAllAircraftCount').textContent = visibleAircraftCount;
  document.getElementById('clearAllModal').style.display = 'flex';
}

function closeClearAllModal() {
  document.getElementById('clearAllModal').style.display = 'none';
}

async function confirmClearAllSchedules() {
  closeClearAllModal();

  // Get IDs of visible aircraft only (respecting the filter)
  const visibleAircraft = getVisibleAircraft();
  const aircraftIds = visibleAircraft.map(a => a.id);

  if (aircraftIds.length === 0) {
    return;
  }

  showLoadingModal('Clearing Schedules', 'Removing all flights and maintenance...');

  try {
    const response = await fetch('/api/schedule/clear-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aircraftIds })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to clear schedules');
    }

    const result = await response.json();
    closeLoadingModal();

    // Refresh the schedule view
    await loadSchedule();

    // Show success message
    await showAlertModal('Schedules Cleared',
      `Successfully cleared:\n• ${result.flightsDeleted} scheduled flights\n• ${result.maintenanceDeleted} maintenance checks`);

  } catch (error) {
    closeLoadingModal();
    console.error('Error clearing schedules:', error);
    await showAlertModal('Error', `Failed to clear schedules: ${error.message}`);
  }
}

// Fetch user's fleet
async function fetchUserFleet() {
  try {
    const response = await fetch('/api/fleet');
    if (response.ok) {
      userFleet = await response.json();
    }
  } catch (error) {
    console.error('Error fetching fleet:', error);
  }
}

// Fetch routes
async function fetchRoutes() {
  try {
    const response = await fetch('/api/routes');
    if (response.ok) {
      routes = await response.json();
    }
  } catch (error) {
    console.error('Error fetching routes:', error);
  }
}

// Fetch scheduled flights for the selected day of week
async function fetchScheduledFlights() {
  try {
    // Get the next occurrence of the selected day of week using game world time
    const worldTime = getCurrentWorldTime();
    if (!worldTime) {
      console.error('World time not available for fetching flights');
      return;
    }

    const today = new Date(worldTime);
    const currentDay = today.getDay();
    const daysUntilTarget = getDaysUntilTargetInWeek(currentDay, selectedDayOfWeek);
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntilTarget);

    const dateStr = formatLocalDate(targetDate);
    console.log('Fetching flights for date:', dateStr);

    const response = await fetch(`/api/schedule/flights?startDate=${dateStr}&endDate=${dateStr}`);
    if (response.ok) {
      scheduledFlights = await response.json();
      console.log('Flights returned:', scheduledFlights.length, scheduledFlights.map(f => ({ route: f.route?.routeNumber, scheduledDate: f.scheduledDate, arrivalDate: f.arrivalDate })));
    }
  } catch (error) {
    console.error('Error fetching scheduled flights:', error);
  }
}

// Fetch scheduled maintenance checks for the selected day of week
async function fetchScheduledMaintenance() {
  try {
    // Get the next occurrence of the selected day of week using game world time
    const worldTime = getCurrentWorldTime();
    if (!worldTime) {
      console.error('World time not available for fetching maintenance');
      return;
    }

    const today = new Date(worldTime);
    const currentDay = today.getDay();
    const daysUntilTarget = getDaysUntilTargetInWeek(currentDay, selectedDayOfWeek);
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntilTarget);

    const dateStr = formatLocalDate(targetDate);

    const response = await fetch(`/api/schedule/maintenance?startDate=${dateStr}&endDate=${dateStr}`);
    if (response.ok) {
      scheduledMaintenance = await response.json();
    }
  } catch (error) {
    console.error('Error fetching scheduled maintenance:', error);
  }
}

// Update selected day of week from dropdown
function updateSelectedDay() {
  const daySelect = document.getElementById('dayOfWeek');
  if (daySelect) {
    selectedDayOfWeek = parseInt(daySelect.value);
  }
}

// Navigate to previous day
function previousDay() {
  const daySelect = document.getElementById('dayOfWeek');
  if (daySelect) {
    let currentDay = parseInt(daySelect.value);
    // Move to previous day (Sunday is 0, Saturday is 6)
    currentDay = currentDay - 1;
    if (currentDay < 0) {
      currentDay = 6; // Wrap to Saturday
    }
    daySelect.value = currentDay;
    loadSchedule();
  }
}

// Navigate to next day
function nextDay() {
  const daySelect = document.getElementById('dayOfWeek');
  if (daySelect) {
    let currentDay = parseInt(daySelect.value);
    // Move to next day (Sunday is 0, Saturday is 6)
    currentDay = currentDay + 1;
    if (currentDay > 6) {
      currentDay = 0; // Wrap to Sunday
    }
    daySelect.value = currentDay;
    loadSchedule();
  }
}

// Group aircraft by type
function groupAircraftByType(fleet) {
  const grouped = {};

  fleet.forEach(aircraft => {
    const typeKey = `${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? '-' + aircraft.aircraft.variant : ''}`;

    if (!grouped[typeKey]) {
      grouped[typeKey] = [];
    }

    grouped[typeKey].push(aircraft);
  });

  return grouped;
}

// Populate the aircraft filter dropdown with available types
function populateAircraftFilterDropdown() {
  const dropdown = document.getElementById('aircraftFilter');
  if (!dropdown) return;

  // Remember current selection
  const currentValue = dropdown.value;

  // Clear existing options except "All Aircraft"
  dropdown.innerHTML = '<option value="all">All Aircraft</option>';

  // Get unique aircraft types
  const types = groupAircraftByType(userFleet);
  const sortedTypes = Object.keys(types).sort();

  // Add each type as an option
  sortedTypes.forEach(typeKey => {
    const count = types[typeKey].length;
    const option = document.createElement('option');
    option.value = typeKey;
    option.textContent = `${typeKey} (${count})`;
    dropdown.appendChild(option);
  });

  // Restore selection if it still exists
  if (currentValue && Array.from(dropdown.options).some(opt => opt.value === currentValue)) {
    dropdown.value = currentValue;
  }
}

// Get routes assigned to aircraft
function getAircraftRoutes(aircraftId) {
  return routes.filter(route => route.assignedAircraftId === aircraftId);
}

// Get flights for a specific cell (aircraft + date + optional hour for daily view)
function getFlightsForCell(aircraftId, date, hour = null) {
  return scheduledFlights.filter(flight => {
    if (flight.aircraftId !== aircraftId) {
      return false;
    }

    // Check if flight departs on this date
    const departuresOnDate = flight.scheduledDate === date;
    // Check if flight arrives on this date (overnight flight)
    const arrivesOnDate = flight.arrivalDate === date && flight.scheduledDate !== date;
    // Check if flight is "in transit" on this date (departed before, arrives after)
    // Use Date objects for reliable comparison
    const flightStart = new Date(flight.scheduledDate);
    const flightEnd = new Date(flight.arrivalDate);
    const viewDate = new Date(date);
    const inTransitOnDate = flightStart < viewDate && flightEnd > viewDate;

    if (!departuresOnDate && !arrivesOnDate && !inTransitOnDate) {
      return false;
    }

    // For daily view, determine which hour cell this flight belongs to
    if (hour !== null) {
      if (departuresOnDate) {
        // Flight departs on this date - show in departure hour cell
        const flightHour = parseInt(flight.departureTime.split(':')[0]);
        return flightHour === hour;
      } else if (arrivesOnDate || inTransitOnDate) {
        // Flight arrives or is in transit - show in hour 0 cell
        return hour === 0;
      }
    }

    return true;
  });
}

// Get maintenance checks for a specific cell (aircraft + date + optional hour for daily view)
function getMaintenanceForCell(aircraftId, date, hour = null) {
  return scheduledMaintenance.filter(maintenance => {
    if (maintenance.aircraftId !== aircraftId || maintenance.scheduledDate !== date) {
      return false;
    }

    // For daily view, only show maintenance in the hour it starts
    if (hour !== null) {
      const maintenanceHour = parseInt(maintenance.startTime.split(':')[0]);
      return maintenanceHour === hour;
    }

    return true;
  });
}

// Round a time string (HH:MM) to the nearest 5 minutes
function roundTimeToNearest5(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const roundedMinutes = Math.round(minutes / 5) * 5;
  const finalHours = roundedMinutes === 60 ? (hours + 1) % 24 : hours;
  const finalMinutes = roundedMinutes === 60 ? 0 : roundedMinutes;
  return `${finalHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`;
}

// Render overnight arrival block (flight that departed yesterday, arriving today)
// arrivalTime in the database is the FINAL return time (when round-trip completes)
function renderOvernightArrivalBlock(flight, route) {
  const arrTime = flight.arrivalTime ? flight.arrivalTime.substring(0, 5) : '??:??';
  const depTime = flight.departureTime ? flight.departureTime.substring(0, 5) : '??:??';
  const [arrHours, arrMinutes] = arrTime.split(':').map(Number);
  const [depHours, depMinutes] = depTime.split(':').map(Number);

  // arrivalTime is already the final return time from the backend calculation
  // Block spans from midnight (00:00) to arrivalTime
  const arrivalMinutesFromMidnight = (arrHours * 60) + arrMinutes;
  const totalHoursFromMidnight = arrivalMinutesFromMidnight / 60;

  // Width from midnight (00:00) to when aircraft returns
  const widthPercent = totalHoursFromMidnight * 100;

  // Get airport codes
  const depAirport = route.departureAirport.iataCode || route.departureAirport.icaoCode;
  const arrAirport = route.arrivalAirport.iataCode || route.arrivalAirport.icaoCode;
  const techStopAirport = route.techStopAirport ? (route.techStopAirport.iataCode || route.techStopAirport.icaoCode) : null;

  // Round the displayed return time to nearest 5 minutes
  const returnArrTime = arrTime !== '??:??' ? roundTimeToNearest5(arrTime) : arrTime;

  // Calculate strip durations to determine if flight numbers should show
  const departureStripHours = 24 - depHours - (depMinutes / 60);

  // Show flight numbers only if BOTH strips have enough space (>= 2 hours each)
  const showFlightNumbers = totalHoursFromMidnight >= 2 && departureStripHours >= 2;

  // Overnight arrival block - shows the portion of round-trip after midnight
  // Arrow on left (continuing from prev day), arrival info, then return info on right
  return `
    <div
      class="flight-block overnight-arrival"
      style="
        position: absolute;
        top: 0;
        left: -0.4rem;
        width: calc(${widthPercent}% + 0.4rem);
        height: 100%;
        min-height: 50px;
        background: var(--accent-color);
        border-radius: 0 3px 3px 0;
        color: white;
        font-size: 0.6rem;
        font-weight: 600;
        padding: 0.2rem 0.5rem;
        cursor: pointer;
        z-index: 1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-sizing: border-box;
      "
      onclick="viewFlightDetails('${flight.id}')"
      title="${route.routeNumber}/${route.returnRouteNumber}: ${techStopAirport ? `${depAirport}→${techStopAirport}→${arrAirport}→${techStopAirport}→${depAirport}` : `${depAirport}→${arrAirport}→${depAirport}`} | Arr ${arrAirport} ${arrTime}, returns ${depAirport} ${returnArrTime}"
    >
      <div style="width: 2.5rem;"></div>
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 0.7rem; line-height: 1.2;">
        ${techStopAirport ? `<div style="font-size: 0.6rem; font-weight: 700; color: #10b981;">via ${techStopAirport}</div>` : ''}
        <div>${formatRouteNumber(route.routeNumber)}</div>
        <div>${formatRouteNumber(route.returnRouteNumber)}</div>
        ${techStopAirport ? `<div style="font-size: 0.6rem; font-weight: 700; color: #10b981;">via ${techStopAirport}</div>` : ''}
      </div>
      <div style="text-align: right; display: flex; flex-direction: column; justify-content: space-between;">
        <div style="font-size: 0.65rem;">${arrAirport}</div>
        <div style="font-size: 0.55rem; opacity: 0.85;">${returnArrTime}</div>
        <div style="font-size: 0.6rem;">${depAirport}</div>
      </div>
    </div>
  `;
}

// Render "continues" block for multi-day flights (aircraft in transit all day)
function renderContinuesBlock(flight, route) {
  const depAirport = route.departureAirport.iataCode || route.departureAirport.icaoCode;
  const arrAirport = route.arrivalAirport.iataCode || route.arrivalAirport.icaoCode;
  const techStopAirport = route.techStopAirport ? (route.techStopAirport.iataCode || route.techStopAirport.icaoCode) : null;

  return `
    <div
      class="flight-block continues"
      style="
        position: absolute;
        top: 0;
        left: -0.4rem;
        width: calc(2400% + 1.5rem);
        height: 100%;
        min-height: 50px;
        background: var(--accent-color);
        border-radius: 0;
        color: white;
        font-size: 0.7rem;
        font-weight: 600;
        padding: 0.25rem 0.5rem;
        cursor: pointer;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: visible;
        box-sizing: border-box;
      "
      onclick="viewFlightDetails('${flight.id}')"
      title="${route.routeNumber}/${route.returnRouteNumber}: ${techStopAirport ? `${depAirport}→${techStopAirport}→${arrAirport}→${techStopAirport}→${depAirport}` : `${depAirport}→${arrAirport}→${depAirport}`} | In transit"
    >
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.2;">
        ${techStopAirport ? `<div style="font-size: 0.6rem; font-weight: 700; color: #10b981;">via ${techStopAirport}</div>` : ''}
        <div>${formatRouteNumber(route.routeNumber)}</div>
        <div>${formatRouteNumber(route.returnRouteNumber)}</div>
        ${techStopAirport ? `<div style="font-size: 0.6rem; font-weight: 700; color: #10b981;">via ${techStopAirport}</div>` : ''}
      </div>
    </div>
  `;
}

// Render flight blocks within a cell (daily view only)
function renderFlightBlocks(flights, viewingDate) {
  if (!flights || flights.length === 0) return '';

  return flights.map(flight => {
    const route = flight.route;

    // Debug logging
    console.log('Flight:', route.routeNumber, 'scheduledDate:', flight.scheduledDate, 'arrivalDate:', flight.arrivalDate, 'viewingDate:', viewingDate);

    // Use Date objects for reliable comparison
    const flightStart = new Date(flight.scheduledDate);
    const flightEnd = new Date(flight.arrivalDate);
    const viewDate = new Date(viewingDate);

    // Check if this is an "in transit" day (departed before, arrives after)
    const isInTransit = flightStart < viewDate && flightEnd > viewDate;
    console.log('isInTransit:', isInTransit, 'flightStart < viewDate:', flightStart < viewDate, 'flightEnd > viewDate:', flightEnd > viewDate);

    if (isInTransit) {
      // Render continues block - full day with centered flight numbers
      return renderContinuesBlock(flight, route);
    }

    // Check if this is an overnight arrival (flight departed before, arrives today)
    const isOvernightArrival = flight.arrivalDate === viewingDate && flight.scheduledDate !== viewingDate;
    console.log('isOvernightArrival:', isOvernightArrival);

    if (isOvernightArrival) {
      // Render overnight arrival block - starts at midnight, ends at arrival time
      return renderOvernightArrivalBlock(flight, route);
    }

    const depTime = flight.departureTime.substring(0, 5); // HH:MM

    // Daily view: position horizontally to span across hours
    const [hours, minutes] = depTime.split(':').map(Number);

    // Calculate minute offset within the starting hour (0-60)
    const minuteOffsetPercent = (minutes / 60) * 100;
    const leftPercent = minuteOffsetPercent;

    // Calculate estimated flight time with wind adjustment
    let outboundFlightMinutes = 0;
    let returnFlightMinutes = 0;
    const turnaroundMinutes = route.turnaroundTime || 45;
    const techStopMinutes = 30; // Tech stop ground time
    const hasTechStop = route.techStopAirport;

    if (flight.aircraft && flight.aircraft.aircraft && flight.aircraft.aircraft.cruiseSpeed) {
      const cruiseSpeed = flight.aircraft.aircraft.cruiseSpeed;
      const depLat = parseFloat(route.departureAirport?.latitude) || 0;
      const depLng = parseFloat(route.departureAirport?.longitude) || 0;
      const arrLat = parseFloat(route.arrivalAirport?.latitude) || 0;
      const arrLng = parseFloat(route.arrivalAirport?.longitude) || 0;

      if (hasTechStop) {
        // Tech stop route: calculate each leg separately
        const techLat = parseFloat(route.techStopAirport?.latitude) || 0;
        const techLng = parseFloat(route.techStopAirport?.longitude) || 0;
        const leg1Distance = route.legOneDistance || Math.round(route.distance * 0.4);
        const leg2Distance = route.legTwoDistance || Math.round(route.distance * 0.6);

        // Outbound: leg1 (DEP→TECH) + techStop + leg2 (TECH→ARR)
        const leg1Minutes = calculateFlightMinutes(leg1Distance, cruiseSpeed, depLng, techLng, depLat, techLat);
        const leg2Minutes = calculateFlightMinutes(leg2Distance, cruiseSpeed, techLng, arrLng, techLat, arrLat);
        outboundFlightMinutes = leg1Minutes + techStopMinutes + leg2Minutes;

        // Return: leg3 (ARR→TECH) + techStop + leg4 (TECH→DEP)
        const leg3Minutes = calculateFlightMinutes(leg2Distance, cruiseSpeed, arrLng, techLng, arrLat, techLat);
        const leg4Minutes = calculateFlightMinutes(leg1Distance, cruiseSpeed, techLng, depLng, techLat, depLat);
        returnFlightMinutes = leg3Minutes + techStopMinutes + leg4Minutes;
      } else {
        // Direct route: departure -> arrival (with wind effect)
        outboundFlightMinutes = calculateFlightMinutes(route.distance, cruiseSpeed, depLng, arrLng, depLat, arrLat);
        // Return: arrival -> departure (opposite wind effect)
        returnFlightMinutes = calculateFlightMinutes(route.distance, cruiseSpeed, arrLng, depLng, arrLat, depLat);
      }
    }

    // Calculate total duration (outbound + turnaround + return)
    const totalDurationMinutes = outboundFlightMinutes + turnaroundMinutes + returnFlightMinutes;

    // Convert duration to a percentage across multiple hour cells
    const durationHours = totalDurationMinutes / 60;

    // Width as percentage: span across cells (each cell is 100% of its width)
    let widthPercent = (durationHours * 100) - minuteOffsetPercent;

    // Check if this flight spans past midnight (overnight departure)
    const isOvernightDeparture = flight.arrivalDate && flight.arrivalDate !== flight.scheduledDate;
    if (isOvernightDeparture) {
      // Cap the width to end at midnight (24:00 - departure hour)
      // hoursUntilMidnight already accounts for minutes, so don't subtract minuteOffsetPercent
      const hoursUntilMidnight = 24 - hours - (minutes / 60);
      widthPercent = hoursUntilMidnight * 100;

      // Get airport codes for overnight departure display
      const depAirport = route.departureAirport.iataCode || route.departureAirport.icaoCode;
      const arrAirport = route.arrivalAirport.iataCode || route.arrivalAirport.icaoCode;
      const techAirport = hasTechStop ? (route.techStopAirport.iataCode || route.techStopAirport.icaoCode) : null;

      // Calculate arrival strip duration to determine if flight numbers should show
      const arrTime = flight.arrivalTime ? flight.arrivalTime.substring(0, 5) : '00:00';
      const [arrHours, arrMinutes] = arrTime.split(':').map(Number);
      const arrivalStripHours = arrHours + (arrMinutes / 60);

      // Show flight numbers only if BOTH strips have enough space (>= 2 hours each)
      const showFlightNumbers = hoursUntilMidnight >= 2 && arrivalStripHours >= 2;

      // Build route string for tooltip
      const routeStr = hasTechStop
        ? `${depAirport}→${techAirport}→${arrAirport}→${techAirport}→${depAirport}`
        : `${depAirport}→${arrAirport}→${depAirport}`;

      // Render overnight departure block - goes to edge with arrow indicator (centered)
      // Render overnight departure block - departure info on left, flight numbers centered
      return `
        <div
          class="flight-block overnight-departure"
          style="
            position: absolute;
            top: 0;
            left: ${leftPercent}%;
            width: calc(${widthPercent}% + 1.5rem);
            height: 100%;
            min-height: 50px;
            background: var(--accent-color);
            border-radius: 3px 0 0 3px;
            color: white;
            font-size: 0.65rem;
            font-weight: 600;
            padding: 0.25rem 0.5rem;
            cursor: pointer;
            z-index: 1;
            display: flex;
            align-items: center;
            justify-content: space-between;
            overflow: visible;
            box-sizing: border-box;
          "
          onclick="viewFlightDetails('${flight.id}')"
          title="${route.routeNumber}/${route.returnRouteNumber}: ${routeStr} | Departs ${depTime}, arrives ${flight.arrivalDate} at ${flight.arrivalTime?.substring(0, 5) || '??:??'}"
        >
          <div style="display: flex; flex-direction: column; gap: 0.05rem;">
            <div>${depAirport}</div>
            <div style="font-size: 0.55rem; opacity: 0.85;">${depTime}</div>
            <div>${arrAirport}</div>
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 0.7rem; line-height: 1.2;">
            ${hasTechStop ? `<div style="font-size: 0.6rem; font-weight: 700; color: #10b981;">via ${techAirport}</div>` : ''}
            <div>${formatRouteNumber(route.routeNumber)}</div>
            <div>${formatRouteNumber(route.returnRouteNumber)}</div>
            ${hasTechStop ? `<div style="font-size: 0.6rem; font-weight: 700; color: #10b981;">via ${techAirport}</div>` : ''}
          </div>
          <div style="width: 2rem;"></div>
        </div>
      `;
    }

    // Calculate arrival times
    const depDate = new Date(`2000-01-01T${flight.departureTime}`);
    const outboundArrDate = new Date(depDate.getTime() + outboundFlightMinutes * 60000);
    const returnDepDate = new Date(outboundArrDate.getTime() + turnaroundMinutes * 60000);
    const returnArrDate = new Date(returnDepDate.getTime() + returnFlightMinutes * 60000);

    // Round return times to nearest 5 minutes
    const roundToNearest5 = (date) => {
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const roundedMinutes = Math.round(minutes / 5) * 5;
      const finalHours = roundedMinutes === 60 ? hours + 1 : hours;
      const finalMinutes = roundedMinutes === 60 ? 0 : roundedMinutes;
      return `${finalHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`;
    };

    const returnDepTime = roundToNearest5(returnDepDate);
    const returnArrTime = isOvernightDeparture ? flight.arrivalTime?.substring(0, 5) || '??' : roundToNearest5(returnArrDate);

    // Get airport codes
    const depAirport = route.departureAirport.iataCode || route.departureAirport.icaoCode;
    const arrAirport = route.arrivalAirport.iataCode || route.arrivalAirport.icaoCode;
    const techStopAirport = route.techStopAirport ? (route.techStopAirport.iataCode || route.techStopAirport.icaoCode) : null;

    // Use simplified layout for short flights (under 2 hours total)
    const isShortFlight = durationHours < 2;
    const isVeryShortFlight = durationHours < 1.5;

    if (isVeryShortFlight) {
      // Ultra-compact layout for very short flights - IATA codes only
      // For tech stops, show tech stop code in green above route info
      if (techStopAirport) {
        return `
          <div
            class="flight-block"
            style="
              position: absolute;
              top: 0;
              left: ${leftPercent}%;
              width: ${widthPercent}%;
              height: 100%;
              min-height: 50px;
              background: var(--accent-color);
              border-radius: 3px;
              color: white;
              font-size: 0.55rem;
              font-weight: 600;
              padding: 0.2rem 0.25rem;
              cursor: pointer;
              z-index: 1;
              display: grid;
              grid-template-columns: 1fr auto 1fr;
              grid-template-rows: auto auto auto auto;
              gap: 0.04rem 0.1rem;
              line-height: 1;
              align-items: center;
            "
            onclick="viewFlightDetails('${flight.id}')"
            title="${route.routeNumber}/${route.returnRouteNumber}: ${depAirport}→${techStopAirport}→${arrAirport}→${techStopAirport}→${depAirport} | Block-Off ${depTime} Block-On ${returnArrTime}"
          >
            <div style="grid-column: 1; grid-row: 1; text-align: left;">${depAirport}</div>
            <div style="grid-column: 2; grid-row: 1; text-align: center; color: #10b981; font-size: 0.5rem; font-weight: 700;">via ${techStopAirport}</div>
            <div style="grid-column: 3; grid-row: 1; text-align: right;">${arrAirport}</div>

            <div style="grid-column: 1 / 4; grid-row: 2; text-align: center; font-size: 0.5rem;">${formatRouteNumber(route.routeNumber)} / ${formatRouteNumber(route.returnRouteNumber)}</div>

            <div style="grid-column: 1; grid-row: 3; text-align: left;">${arrAirport}</div>
            <div style="grid-column: 2; grid-row: 3; text-align: center; color: #10b981; font-size: 0.5rem; font-weight: 700;">via ${techStopAirport}</div>
            <div style="grid-column: 3; grid-row: 3; text-align: right;">${depAirport}</div>

            <div style="grid-column: 1 / 4; grid-row: 4; text-align: center; font-size: 0.48rem; opacity: 0.85; margin-top: 0.02rem;">${depTime}</div>
          </div>
        `;
      }

      return `
        <div
          class="flight-block"
          style="
            position: absolute;
            top: 0;
            left: ${leftPercent}%;
            width: ${widthPercent}%;
            height: auto;
            min-height: 62px;
            background: var(--accent-color);
            border-radius: 3px;
            color: white;
            font-size: 0.6rem;
            font-weight: 600;
            padding: 0.2rem 0.25rem;
            cursor: pointer;
            z-index: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: auto auto auto;
            gap: 0.05rem;
            line-height: 1;
            align-items: center;
          "
          onclick="viewFlightDetails('${flight.id}')"
          title="${route.routeNumber}/${route.returnRouteNumber}: ${depAirport}→${arrAirport}→${depAirport} | Block-Off ${depTime} Block-On ${returnArrTime}"
        >
          <div style="grid-column: 1; grid-row: 1; text-align: left;">${depAirport}</div>
          <div style="grid-column: 2; grid-row: 1; text-align: right;">${arrAirport}</div>
          <div style="grid-column: 1; grid-row: 2; text-align: left;">${arrAirport}</div>
          <div style="grid-column: 2; grid-row: 2; text-align: right;">${depAirport}</div>
          <div style="grid-column: 1 / 3; grid-row: 3; text-align: center; font-size: 0.52rem; opacity: 0.85; margin-top: 0.05rem;">${depTime}</div>
        </div>
      `;
    }

    if (isShortFlight) {
      // Compact layout for short flights - hide bottom row and return time
      // For tech stops, show tech stop code above route numbers in green
      if (techStopAirport) {
        return `
          <div
            class="flight-block"
            style="
              position: absolute;
              top: 0;
              left: ${leftPercent}%;
              width: ${widthPercent}%;
              height: 100%;
              min-height: 50px;
              background: var(--accent-color);
              border-radius: 3px;
              color: white;
              font-size: 0.6rem;
              font-weight: 600;
              padding: 0.2rem 0.25rem;
              cursor: pointer;
              z-index: 1;
              display: grid;
              grid-template-columns: auto 1fr auto;
              grid-template-rows: auto auto auto;
              gap: 0.08rem 0.2rem;
              line-height: 1;
            "
            onclick="viewFlightDetails('${flight.id}')"
            title="${route.routeNumber}/${route.returnRouteNumber}: ${depAirport}→${techStopAirport}→${arrAirport}→${techStopAirport}→${depAirport} | Block-Off ${depTime} Block-On ${returnArrTime}"
          >
            <div style="grid-column: 1; grid-row: 1; text-align: left;">${depAirport}</div>
            <div style="grid-column: 2; grid-row: 1; text-align: center; color: #10b981; font-size: 0.58rem; font-weight: 700;">via ${techStopAirport}</div>
            <div style="grid-column: 3; grid-row: 1; text-align: right;">${arrAirport}</div>
            <div style="grid-column: 1; grid-row: 2; text-align: left; font-size: 0.52rem; opacity: 0.85;">${depTime}</div>
            <div style="grid-column: 2; grid-row: 2; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 0.58rem; gap: 0.02rem;">
              <div>${formatRouteNumber(route.routeNumber)}</div>
              <div>${formatRouteNumber(route.returnRouteNumber)}</div>
            </div>
            <div style="grid-column: 3; grid-row: 2; text-align: right; font-size: 0.52rem; opacity: 0.85;"></div>
            <div style="grid-column: 1; grid-row: 3; text-align: left;">${arrAirport}</div>
            <div style="grid-column: 2; grid-row: 3; text-align: center; color: #10b981; font-size: 0.58rem; font-weight: 700;">via ${techStopAirport}</div>
            <div style="grid-column: 3; grid-row: 3; text-align: right;">${depAirport}</div>
          </div>
        `;
      }

      return `
        <div
          class="flight-block"
          style="
            position: absolute;
            top: 0;
            left: ${leftPercent}%;
            width: ${widthPercent}%;
            height: auto;
            min-height: 62px;
            background: var(--accent-color);
            border-radius: 3px;
            color: white;
            font-size: 0.6rem;
            font-weight: 600;
            padding: 0.2rem 0.25rem;
            cursor: pointer;
            z-index: 1;
            display: grid;
            grid-template-columns: auto 1fr auto;
            grid-template-rows: auto auto;
            gap: 0.1rem 0.2rem;
            line-height: 1;
          "
          onclick="viewFlightDetails('${flight.id}')"
          title="${route.routeNumber}/${route.returnRouteNumber}: ${depAirport}→${arrAirport}→${depAirport} | Block-Off ${depTime} Block-On ${returnArrTime}"
        >
          <div style="grid-column: 1; grid-row: 1; text-align: left;">${depAirport}</div>
          <div style="grid-column: 2; grid-row: 1 / 3; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 0.62rem; gap: 0.05rem;">
            <div>${formatRouteNumber(route.routeNumber)}</div>
            <div>${formatRouteNumber(route.returnRouteNumber)}</div>
          </div>
          <div style="grid-column: 3; grid-row: 1; text-align: right;">${arrAirport}</div>
          <div style="grid-column: 1; grid-row: 2; text-align: left; font-size: 0.52rem; opacity: 0.85;">${depTime}</div>
        </div>
      `;
    }

    // Full layout for longer flights
    // For tech stops, show tech stop code in green above route numbers
    if (techStopAirport) {
      return `
        <div
          class="flight-block"
          style="
            position: absolute;
            top: 0;
            left: ${leftPercent}%;
            width: ${widthPercent}%;
            height: auto;
            min-height: 62px;
            background: var(--accent-color);
            border-radius: 3px;
            color: white;
            font-size: 0.65rem;
            font-weight: 600;
            padding: 0.25rem 0.35rem;
            cursor: pointer;
            z-index: 1;
            display: grid;
            grid-template-columns: auto 1fr auto;
            grid-template-rows: auto auto auto;
            gap: 0.12rem 0.25rem;
            line-height: 1.1;
          "
          onclick="viewFlightDetails('${flight.id}')"
          title="${route.routeNumber}/${route.returnRouteNumber}: ${depAirport}→${techStopAirport}→${arrAirport}→${techStopAirport}→${depAirport} | Block-Off ${depTime} Block-On ${returnArrTime}"
        >
          <div style="grid-column: 1; grid-row: 1; text-align: left;">${depAirport}</div>
          <div style="grid-column: 2; grid-row: 1; display: flex; align-items: center; justify-content: center;">
            <span style="color: #10b981; font-size: 0.6rem; font-weight: 700;">via ${techStopAirport}</span>
          </div>
          <div style="grid-column: 3; grid-row: 1; text-align: right;">${arrAirport}</div>

          <div style="grid-column: 1; grid-row: 2; text-align: left; font-size: 0.58rem; opacity: 0.85;">${depTime}</div>
          <div style="grid-column: 2; grid-row: 2; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 0.68rem; gap: 0.08rem;">
            <div>${formatRouteNumber(route.routeNumber)}</div>
            <div>${formatRouteNumber(route.returnRouteNumber)}</div>
          </div>
          <div style="grid-column: 3; grid-row: 2; text-align: right; font-size: 0.58rem; opacity: 0.85;">${returnArrTime}</div>

          <div style="grid-column: 1; grid-row: 3; text-align: left;">${arrAirport}</div>
          <div style="grid-column: 2; grid-row: 3; display: flex; align-items: center; justify-content: center;">
            <span style="color: #10b981; font-size: 0.6rem; font-weight: 700;">via ${techStopAirport}</span>
          </div>
          <div style="grid-column: 3; grid-row: 3; text-align: right;">${depAirport}</div>
        </div>
      `;
    }

    return `
      <div
        class="flight-block"
        style="
          position: absolute;
          top: 0;
          left: ${leftPercent}%;
          width: ${widthPercent}%;
          height: 100%;
          min-height: 50px;
          background: var(--accent-color);
          border-radius: 3px;
          color: white;
          font-size: 0.65rem;
          font-weight: 600;
          padding: 0.25rem 0.35rem;
          cursor: pointer;
          z-index: 1;
          display: grid;
          grid-template-columns: auto 1fr auto;
          grid-template-rows: auto auto auto;
          gap: 0.15rem 0.25rem;
          line-height: 1.1;
        "
        onclick="viewFlightDetails('${flight.id}')"
        title="${route.routeNumber}/${route.returnRouteNumber}: ${depAirport}→${arrAirport}→${depAirport} | Block-Off ${depTime} Block-On ${returnArrTime}"
      >
        <div style="grid-column: 1; grid-row: 1; text-align: left;">${depAirport}</div>
        <div style="grid-column: 2; grid-row: 1 / 4; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 0.7rem;">
          <div>${formatRouteNumber(route.routeNumber)}</div>
          <div>${formatRouteNumber(route.returnRouteNumber)}</div>
        </div>
        <div style="grid-column: 3; grid-row: 1; text-align: right;">${arrAirport}</div>
        <div style="grid-column: 1; grid-row: 3; text-align: left;">${arrAirport}</div>
        <div style="grid-column: 3; grid-row: 3; text-align: right;">${depAirport}</div>
        <div style="grid-column: 1 / 2; grid-row: 2; text-align: left; font-size: 0.6rem; opacity: 0.85;">${depTime}</div>
        <div style="grid-column: 3 / 4; grid-row: 2; text-align: right; font-size: 0.6rem; opacity: 0.85;">${returnArrTime}</div>
      </div>
    `;
  }).join('');
}

// Render maintenance blocks within a cell (daily view only)
function renderMaintenanceBlocks(maintenance) {
  if (!maintenance || maintenance.length === 0) return '';

  return maintenance.map(check => {
    const startTime = check.startTime.substring(0, 5); // HH:MM
    const [hours, minutes] = startTime.split(':').map(Number);

    // Calculate minute offset within the starting hour (0-60)
    const minuteOffsetPercent = (minutes / 60) * 100;
    const leftPercent = minuteOffsetPercent;

    // Duration in minutes (30 for Daily, 90 for Weekly)
    const durationMinutes = check.duration;
    const durationHours = durationMinutes / 60;

    // Width as percentage: span across cells
    const widthPercent = (durationHours * 100) - minuteOffsetPercent;

    // Calculate end time
    const startDate = new Date(`2000-01-01T${check.startTime}`);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    const endTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;

    // Color based on check type
    const backgroundColor = check.checkType === 'A' ? '#FFA500' : '#DC3545';
    const checkLabel = check.checkType === 'A' ? 'DAILY' : 'WEEKLY';
    const checkDescription = check.checkType === 'A' ? 'Daily Check (60 minutes)' : 'Weekly Check (120 minutes)';

    // Get aircraft registration
    const registration = check.aircraft ? check.aircraft.registration : 'Unknown';

    return `
      <div
        class="maintenance-block"
        style="
          position: absolute;
          top: 2px;
          left: ${leftPercent}%;
          width: ${widthPercent}%;
          height: calc(100% - 4px);
          background: ${backgroundColor};
          border-radius: 2px;
          color: white;
          font-size: 0.85rem;
          font-weight: 700;
          padding: 0.15rem;
          cursor: pointer;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          line-height: 1;
        "
        onclick="viewMaintenanceDetails('${check.id}')"
        title="${checkLabel}: ${checkDescription} | Start ${startTime} End ${endTime}"
      >
        ⚙ ${checkLabel}
      </div>
    `;
  }).join('');
}

// View flight details
async function viewFlightDetails(flightId) {
  const flight = scheduledFlights.find(f => f.id === flightId);
  if (!flight) return;

  const route = flight.route;
  const aircraft = flight.aircraft;

  const confirmed = await showConfirmModal(
    'Flight Details',
    `Route: ${route.routeNumber} / ${route.returnRouteNumber}\nAircraft: ${aircraft.registration}\nDate: ${flight.scheduledDate}\nTime: ${flight.departureTime.substring(0, 5)}\nRoute: ${route.departureAirport.icaoCode} → ${route.arrivalAirport.icaoCode}\nStatus: ${flight.status}\n\nDelete this flight?`
  );

  if (confirmed) {
    deleteScheduledFlight(flightId);
  }
}

// Delete scheduled flight
async function deleteScheduledFlight(flightId) {
  try {
    const response = await fetch(`/api/schedule/flight/${flightId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete flight');
    }

    // Remove from local array immediately
    const index = scheduledFlights.findIndex(f => f.id === flightId);
    if (index !== -1) {
      scheduledFlights.splice(index, 1);
    }

    await showAlertModal('Success', 'Flight deleted successfully');
    // Just re-render without fetching
    renderSchedule();
  } catch (error) {
    console.error('Error deleting flight:', error);
    await showAlertModal('Error', error.message);
  }
}

// View maintenance check details
async function viewMaintenanceDetails(maintenanceId) {
  const maintenance = scheduledMaintenance.find(m => m.id === maintenanceId);
  if (!maintenance) return;

  const aircraft = maintenance.aircraft;
  const checkType = maintenance.checkType === 'A' ? 'Daily Check' : 'Weekly Check';
  const durationMinutes = maintenance.checkType === 'A' ? '60 minutes' : '120 minutes';
  const duration = durationMinutes;

  // Get day of week for better description
  const date = new Date(maintenance.scheduledDate + 'T00:00:00Z');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[date.getUTCDay()];

  const confirmed = await showConfirmModal(
    'Maintenance Check Details',
    `Type: ${checkType}\nAircraft: ${aircraft.registration}\nDay: ${dayName}\nStart Time: ${maintenance.startTime.substring(0, 5)}\nDuration: ${duration}\n\nWARNING: This will delete ALL future ${checkType}s on ${dayName} for this aircraft.\n\nDelete this recurring maintenance check?`
  );

  if (confirmed) {
    deleteScheduledMaintenance(maintenanceId);
  }
}

// Delete scheduled maintenance check
async function deleteScheduledMaintenance(maintenanceId) {
  try {
    const response = await fetch(`/api/schedule/maintenance/${maintenanceId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete maintenance check');
    }

    // Remove from local array immediately
    const index = scheduledMaintenance.findIndex(m => m.id === maintenanceId);
    if (index !== -1) {
      scheduledMaintenance.splice(index, 1);
    }

    await showAlertModal('Success', 'Maintenance check deleted successfully');
    // Just re-render without fetching
    renderSchedule();
  } catch (error) {
    console.error('Error deleting maintenance check:', error);
    await showAlertModal('Error', error.message);
  }
}

// Generate time columns for daily view
function generateDailyTimeColumns() {
  const columns = [];
  for (let hour = 0; hour < 24; hour++) {
    columns.push({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`
    });
  }
  return columns;
}

// Generate day columns for weekly view
function generateWeeklyDayColumns() {
  const columns = [];
  const startDate = new Date(currentDate);

  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    columns.push({
      date: new Date(date),
      label: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    });
  }

  return columns;
}

// Render schedule (without fetching data)
function renderSchedule() {
  const container = document.getElementById('scheduleGrid');
  const filterValue = document.getElementById('aircraftFilter')?.value || 'all';

  // Populate the filter dropdown with current aircraft types
  populateAircraftFilterDropdown();

  if (userFleet.length === 0) {
    container.innerHTML = `
      <div style="padding: 3rem; text-align: center;">
        <p style="color: var(--text-muted); font-size: 1.1rem;">NO AIRCRAFT IN FLEET</p>
        <p style="color: var(--text-secondary); margin-top: 0.5rem;">
          <a href="/aircraft-marketplace" style="color: var(--accent-color);">Purchase aircraft</a> to start scheduling
        </p>
      </div>
    `;
    return;
  }

  const timeColumns = generateDailyTimeColumns();

  // Build schedule grid HTML
  let html = '<table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">';

  // Header row
  html += '<thead><tr style="background: var(--surface-elevated); border-bottom: 2px solid var(--border-color); position: sticky; top: 0; z-index: 10;">';
  html += '<th style="padding: 0.75rem 1rem; text-align: left; color: var(--text-secondary); font-weight: 600; min-width: 200px; position: sticky; left: 0; background: var(--surface-elevated); border-right: 2px solid var(--border-color); z-index: 11;">AIRCRAFT</th>';

  timeColumns.forEach((col, index) => {
    // Add thicker border every 6 hours for visual clarity
    const borderStyle = (col.hour % 6 === 0) ? 'border-left: 2px solid var(--border-color);' : 'border-left: 1px solid var(--border-color);';
    html += `<th style="padding: 0.5rem 0.2rem; text-align: center; color: var(--text-secondary); font-weight: 600; min-width: 40px; ${borderStyle}">${col.label}</th>`;
  });

  html += '<th style="padding: 0.75rem 0.5rem; text-align: center; color: var(--text-secondary); font-weight: 600; min-width: 100px; border-left: 2px solid var(--border-color); position: sticky; right: 0; background: var(--surface-elevated); z-index: 11;">ACTIONS</th>';
  html += '</tr></thead>';

  html += '<tbody>';

  if (filterValue === 'all') {
    // Show all aircraft grouped by type
    const grouped = groupAircraftByType(userFleet);

    Object.keys(grouped).sort().forEach(typeKey => {
      const aircraftInGroup = grouped[typeKey];

      // Group header row
      html += `
        <tr style="background: var(--surface); border-bottom: 1px solid var(--border-color);">
          <td style="padding: 0.75rem 1rem; color: var(--text-primary); font-weight: 600; font-size: 0.95rem; position: sticky; left: 0; background: var(--surface); border-right: 2px solid var(--border-color); z-index: 5;">
            ${typeKey} <span style="color: var(--text-muted); font-weight: normal;">(${aircraftInGroup.length})</span>
          </td>
          <td colspan="${timeColumns.length + 1}" style="background: var(--surface);"></td>
        </tr>
      `;

      // Aircraft rows
      aircraftInGroup.forEach(aircraft => {
        html += generateAircraftRow(aircraft, timeColumns);
      });
    });
  } else {
    // Filter to specific aircraft type - show without group header
    const filteredFleet = userFleet.filter(aircraft => {
      const typeKey = `${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? '-' + aircraft.aircraft.variant : ''}`;
      return typeKey === filterValue;
    });

    filteredFleet.forEach(aircraft => {
      html += generateAircraftRow(aircraft, timeColumns);
    });
  }

  html += '</tbody></table>';

  container.innerHTML = html;

  // Start or update the red timeline
  updateTimeline();
}

// Load and display schedule (fetches data then renders)
async function loadSchedule() {
  const container = document.getElementById('scheduleGrid');

  try {
    // Close add route modal if it's open
    closeAddRouteModal();

    // Show loading indicator
    container.innerHTML = `
      <div style="padding: 3rem; text-align: center; color: var(--text-muted);">
        <div style="font-size: 1.2rem;">Loading...</div>
      </div>
    `;

    updateSelectedDay();

    // Fetch all data in parallel for better performance
    await Promise.all([
      fetchUserFleet(),
      fetchRoutes(),
      fetchScheduledFlights(),
      fetchScheduledMaintenance()
    ]);

    // Render the schedule
    renderSchedule();
  } catch (error) {
    console.error('Error loading schedule:', error);
    container.innerHTML = `
      <div style="padding: 3rem; text-align: center; color: var(--warning-color);">
        <div style="font-size: 1.2rem;">Error loading schedule</div>
        <div style="margin-top: 1rem; color: var(--text-muted);">${error.message}</div>
      </div>
    `;
  }
}

// Generate a single aircraft row (with flights and maintenance in the same row)
function generateAircraftRow(aircraft, timeColumns) {
  const aircraftRoutes = getAircraftRoutes(aircraft.id);
  const typeStr = `${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? '-' + aircraft.aircraft.variant : ''}`;

  let html = '';

  // Single row containing both flights and maintenance
  html += '<tr style="border-bottom: 1px solid var(--border-color);">';

  // Aircraft info column (sticky left)
  // Check maintenance warnings
  const maintenanceWarnings = getMaintenanceWarnings(aircraft);
  const warningIcons = maintenanceWarnings.map(w =>
    `<span style="font-size: 1.1rem; cursor: help; ${w.type === 'daily' ? 'color: #ef4444;' : 'color: #eab308;'}" title="${w.message}">⚠</span>`
  ).join(' ');

  html += `
    <td style="padding: 1rem; position: sticky; left: 0; background: var(--surface); border-right: 2px solid var(--border-color); z-index: 5;">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="color: var(--accent-color); font-weight: 600; font-size: 1rem;">
          ${aircraft.registration}
        </span>
        ${warningIcons}
      </div>
    </td>
  `;

  // Get date for this schedule using game world time
  const worldTime = getCurrentWorldTime();
  if (!worldTime) {
    console.error('World time not available for generating aircraft row');
    return '';
  }

  const today = new Date(worldTime);
  const currentDay = today.getDay();
  const daysUntilTarget = getDaysUntilTargetInWeek(currentDay, selectedDayOfWeek);
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntilTarget);
  const dateStr = formatLocalDate(targetDate);

  // Time slot columns - BOTH flights and maintenance
  timeColumns.forEach((col, index) => {
    // Add thicker border every 6 hours for visual clarity
    const borderStyle = (col.hour % 6 === 0) ? 'border-left: 2px solid var(--border-color);' : 'border-left: 1px solid var(--border-color);';

    const timeValue = col.hour;
    const cellWidth = '40px';

    // Get both flights and maintenance for this aircraft on this date and hour
    const cellFlights = getFlightsForCell(aircraft.id, dateStr, col.hour);
    const cellMaintenance = getMaintenanceForCell(aircraft.id, dateStr, col.hour);

    html += `
      <td
        class="schedule-cell"
        data-aircraft-id="${aircraft.id}"
        data-time="${timeValue}"
        data-date="${dateStr}"
        ondragover="handleDragOver(event)"
        ondragleave="handleDragLeave(event)"
        ondrop="handleDrop(event, '${aircraft.id}', '${timeValue}')"
        style="padding: 0.3rem 0.2rem 0.3rem 0.2rem; text-align: center; background: var(--surface-elevated); ${borderStyle} height: 65px; min-width: ${cellWidth}; position: relative; vertical-align: top; overflow: visible;"
      >
        ${renderFlightBlocks(cellFlights, dateStr)}
        ${renderMaintenanceBlocks(cellMaintenance)}
      </td>
    `;
  });

  // Actions column (sticky right)
  html += `
    <td style="padding: 0.5rem; position: sticky; right: 0; background: var(--surface); border-left: 2px solid var(--border-color); z-index: 5;">
      <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
        <button
          onclick="addRouteToAircraft('${aircraft.id}')"
          title="Add Route"
          style="
            width: 28px;
            height: 28px;
            padding: 0;
            background: var(--primary-color);
            border: 1px solid var(--accent-color);
            color: white;
            font-size: 1rem;
            font-weight: bold;
            cursor: pointer;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
          "
          onmouseover="this.style.background='var(--accent-color)'"
          onmouseout="this.style.background='var(--primary-color)'"
        >+</button>
        <button
          onclick="scheduleMaintenance('${aircraft.id}')"
          title="Schedule Maintenance"
          style="
            width: 28px;
            height: 28px;
            padding: 0;
            background: transparent;
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            font-size: 1.4rem;
            cursor: pointer;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
          "
          onmouseover="this.style.borderColor='var(--primary-color)'; this.style.color='var(--text-primary)'"
          onmouseout="this.style.borderColor='var(--border-color)'; this.style.color='var(--text-secondary)'"
        >⚙</button>
        <button
          onclick="clearSchedule('${aircraft.id}')"
          title="Clear Schedule"
          style="
            width: 28px;
            height: 28px;
            padding: 0;
            background: transparent;
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            font-size: 1rem;
            font-weight: bold;
            cursor: pointer;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
          "
          onmouseover="this.style.borderColor='#dc3545'; this.style.color='#dc3545'"
          onmouseout="this.style.borderColor='var(--border-color)'; this.style.color='var(--text-secondary)'"
        >✖</button>
      </div>
    </td>
  `;

  html += '</tr>';

  return html;
}

// Action: Add route to aircraft
async function addRouteToAircraft(aircraftId) {
  const aircraft = userFleet.find(a => a.id === aircraftId);
  if (!aircraft) return;

  currentAircraftId = aircraftId;

  // Show modal
  const modal = document.getElementById('addRouteModal');
  if (modal) {
    modal.style.display = 'flex';
  }

  // Load unassigned or aircraft-specific routes
  await loadUnassignedRoutes(aircraftId);
}

// Close add route modal
function closeAddRouteModal() {
  const modal = document.getElementById('addRouteModal');
  if (modal) {
    modal.style.display = 'none';
  }
  currentAircraftId = null;
}

// Load unassigned routes
async function loadUnassignedRoutes(aircraftId) {
  const container = document.getElementById('unassignedRoutesList');

  // Filter routes assigned to this aircraft or unassigned, AND operating on the selected day
  const availableRoutes = routes.filter(r => {
    // Check if route is assigned to this aircraft or unassigned
    const aircraftMatch = r.assignedAircraftId === aircraftId || r.assignedAircraftId === null;

    // Check if route operates on the selected day (or all 7 days = daily)
    const dayMatch = r.daysOfWeek && (
      r.daysOfWeek.includes(selectedDayOfWeek) || r.daysOfWeek.length === 7
    );

    // Check if route is NOT already scheduled on the selected day
    const notAlreadyScheduled = !scheduledFlights.some(sf => sf.routeId === r.id);

    return aircraftMatch && dayMatch && notAlreadyScheduled;
  });

  if (availableRoutes.length === 0) {
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center;">
        <p style="color: var(--text-muted); font-size: 1.1rem;">NO ROUTES AVAILABLE</p>
        <p style="color: var(--text-secondary); margin-top: 0.5rem; font-size: 0.85rem;">
          No routes operate on this day for this aircraft.<br/>
          <a href="/routes/create" style="color: var(--accent-color);">Create a route</a> or select a different day
        </p>
      </div>
    `;
    return;
  }

  const html = availableRoutes.map(route => {
    // Format departure time (off-blocks time)
    const depTime = route.scheduledDepartureTime ? route.scheduledDepartureTime.substring(0, 5) : '--:--';

    // Calculate estimated flight time with wind adjustment
    let outboundFlightMinutes = 0;
    let returnFlightMinutes = 0;

    if (route.assignedAircraft && route.assignedAircraft.aircraft && route.assignedAircraft.aircraft.cruiseSpeed) {
      const cruiseSpeed = route.assignedAircraft.aircraft.cruiseSpeed;
      const depLat = parseFloat(route.departureAirport?.latitude) || 0;
      const depLng = parseFloat(route.departureAirport?.longitude) || 0;
      const arrLat = parseFloat(route.arrivalAirport?.latitude) || 0;
      const arrLng = parseFloat(route.arrivalAirport?.longitude) || 0;

      // Outbound: departure -> arrival (with wind effect)
      outboundFlightMinutes = calculateFlightMinutes(route.distance, cruiseSpeed, depLng, arrLng, depLat, arrLat);
      // Return: arrival -> departure (opposite wind effect)
      returnFlightMinutes = calculateFlightMinutes(route.distance, cruiseSpeed, arrLng, depLng, arrLat, depLat);
    }

    // Calculate block-on time (when aircraft returns to base)
    let blockOnTime = '--:--';
    let blockOnTimeColor = 'var(--success-color)';

    if (!route.assignedAircraft || !route.assignedAircraft.aircraft || !route.assignedAircraft.aircraft.cruiseSpeed) {
      // Aircraft type is required, so this indicates incomplete route data
      blockOnTime = 'Missing aircraft type';
      blockOnTimeColor = 'var(--warning-color)';
    } else if (route.scheduledDepartureTime && outboundFlightMinutes > 0 && route.turnaroundTime) {
      const depDate = new Date(`2000-01-01T${route.scheduledDepartureTime}`);
      const turnaroundMinutes = route.turnaroundTime;

      // Total time: outbound flight + turnaround + return flight (with wind adjustment)
      const totalMinutes = outboundFlightMinutes + turnaroundMinutes + returnFlightMinutes;
      const blockOnDate = new Date(depDate.getTime() + totalMinutes * 60000);

      // Round to nearest 5 minutes
      const hours = blockOnDate.getHours();
      const minutes = blockOnDate.getMinutes();
      const roundedMinutes = Math.round(minutes / 5) * 5;
      const finalHours = roundedMinutes === 60 ? hours + 1 : hours;
      const finalMinutes = roundedMinutes === 60 ? 0 : roundedMinutes;

      blockOnTime = `${finalHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`;
    }

    // Get aircraft type for display
    let aircraftType = 'Missing aircraft type';
    if (route.assignedAircraft && route.assignedAircraft.aircraft) {
      const manufacturer = route.assignedAircraft.aircraft.manufacturer || '';
      const model = route.assignedAircraft.aircraft.model || '';
      const variant = route.assignedAircraft.aircraft.variant || '';
      aircraftType = `${manufacturer} ${model}${variant ? '-' + variant : ''}`.trim();
    }

    return `
      <div
        class="route-draggable"
        draggable="true"
        data-route-id="${route.id}"
        data-aircraft-type="${route.assignedAircraft?.aircraft?.type || ''}"
        style="background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 4px; padding: 0.75rem; margin-bottom: 0.5rem; transition: all 0.2s; font-size: 0.85rem;"
        onmouseover="this.style.background='var(--surface)'"
        onmouseout="this.style.background='var(--surface-elevated)'"
      >
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <div style="color: var(--accent-color); font-weight: 600; font-size: 0.9rem;">
            ${formatRouteNumber(route.routeNumber)} / ${formatRouteNumber(route.returnRouteNumber)}
          </div>
        </div>
        <div style="color: var(--text-primary); font-size: 0.8rem; margin-bottom: 0.5rem;">
          ${route.departureAirport.icaoCode} → ${route.arrivalAirport.icaoCode} → ${route.departureAirport.icaoCode}
        </div>
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem; font-size: 0.75rem; margin-bottom: 0.5rem;">
          <div style="color: var(--text-secondary); font-weight: 600;">Block Off:</div>
          <div style="color: var(--success-color); font-weight: 600;">${depTime}</div>
          <div style="color: var(--text-secondary); font-weight: 600;">Block On:</div>
          <div style="color: ${blockOnTimeColor}; font-weight: 600; font-size: ${blockOnTime.includes('Assign') ? '0.7rem' : '0.75rem'};">${blockOnTime}</div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="color: var(--text-muted); font-size: 0.75rem;">
            ${aircraftType}
          </div>
          <div style="color: var(--text-muted); font-size: 0.75rem;">
            ${formatDaysOfWeek(route.daysOfWeek)}
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;

  // Add event listeners to draggable items
  container.querySelectorAll('.route-draggable').forEach(element => {
    const routeId = element.getAttribute('data-route-id');
    element.addEventListener('dragstart', (e) => handleDragStart(e, routeId));
    element.addEventListener('dragend', handleDragEnd);
  });
}

// Format days of week
function formatDaysOfWeek(daysArray) {
  if (!daysArray || daysArray.length === 0) return 'No days';
  if (daysArray.length === 7) return 'Daily';

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return daysArray.map(d => dayLabels[d]).join(' ');
}

// Handle drag start
function handleDragStart(event, routeId) {
  draggedRoute = routes.find(r => r.id === routeId);
  if (!draggedRoute) {
    console.error('Route not found:', routeId);
    return;
  }

  // console.log('Dragging route:', draggedRoute.routeNumber);

  // Set data for drag
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', routeId);

  // Create drag preview
  const preview = document.getElementById('dragPreview');
  preview.textContent = `${draggedRoute.routeNumber} / ${draggedRoute.returnRouteNumber}`;
  preview.style.display = 'block';

  // Slightly fade the modal during drag (but keep it visible)
  const modal = document.getElementById('addRouteModal');
  if (modal) {
    modal.style.opacity = '0.7';
  }
}

// Handle drag end
function handleDragEnd(event) {
  const preview = document.getElementById('dragPreview');
  preview.style.display = 'none';

  // Restore modal opacity
  document.getElementById('addRouteModal').style.opacity = '1';

  // Remove drag-over class from all cells
  document.querySelectorAll('.drag-over').forEach(cell => {
    cell.classList.remove('drag-over');
  });
}

// Update drag preview position
function updateDragPreview(event) {
  const preview = document.getElementById('dragPreview');
  if (preview.style.display === 'block') {
    preview.style.left = (event.clientX + 10) + 'px';
    preview.style.top = (event.clientY + 10) + 'px';
  }
}

// Action: Schedule maintenance
async function scheduleMaintenance(aircraftId) {
  const aircraft = userFleet.find(a => a.id === aircraftId);
  if (!aircraft) return;

  // Get the target date for scheduling - use game world time!
  const worldTime = getCurrentWorldTime();
  if (!worldTime) {
    await showAlertModal('Error', 'World time not available. Please try again.');
    return;
  }

  const today = new Date(worldTime);
  const currentDay = today.getDay();
  const daysUntilTarget = getDaysUntilTargetInWeek(currentDay, selectedDayOfWeek);
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntilTarget);
  const dateStr = formatLocalDate(targetDate);

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'maintenanceModalOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
  `;

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: var(--surface);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 2rem;
    width: 90%;
    max-width: 500px;
  `;

  modalContent.innerHTML = `
    <h2 style="margin-bottom: 1.5rem; color: var(--text-primary);">SCHEDULE MAINTENANCE CHECK</h2>
    <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">Aircraft: <strong style="color: var(--accent-color);">${aircraft.registration}</strong></p>

    <div style="margin-bottom: 1.5rem;">
      <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600;">Check Type</label>
      <select id="checkType" style="width: 100%; padding: 0.75rem; background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 1rem;">
        <option value="A">Daily Check (60 minutes)</option>
        <option value="B">Weekly Check (120 minutes)</option>
      </select>
    </div>

    <div style="margin-bottom: 1.5rem;">
      <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); cursor: pointer;">
        <input type="checkbox" id="repeatCheck" checked style="width: 18px; height: 18px; cursor: pointer;" />
        <span id="repeatLabel" style="font-weight: 600;">Repeat daily</span>
      </label>
    </div>

    <div style="margin-bottom: 1.5rem;">
      <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600;">Start Time</label>
      <input type="time" id="startTime" value="00:00" style="width: 100%; padding: 0.75rem; background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 1rem;" />
    </div>

    <div style="display: flex; gap: 1rem; justify-content: flex-end;">
      <button id="cancelMaintenanceBtn" class="btn btn-secondary" style="padding: 0.75rem 1.5rem;">Cancel</button>
      <button id="scheduleMaintenanceBtn" class="btn btn-primary" style="padding: 0.75rem 1.5rem;">Schedule</button>
    </div>
  `;

  overlay.appendChild(modalContent);
  document.body.appendChild(overlay);

  // Add event listeners
  document.getElementById('cancelMaintenanceBtn').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });

  // Update repeat label when check type changes
  document.getElementById('checkType').addEventListener('change', function() {
    const repeatLabel = document.getElementById('repeatLabel');
    repeatLabel.textContent = this.value === 'A' ? 'Repeat daily' : 'Repeat weekly';
  });

  document.getElementById('scheduleMaintenanceBtn').addEventListener('click', async () => {
    const checkType = document.getElementById('checkType').value;
    const startTime = document.getElementById('startTime').value;
    const repeatCheck = document.getElementById('repeatCheck').checked;

    if (!startTime) {
      await showAlertModal('Validation Error', 'Please select a start time');
      return;
    }

    try {
      console.log('Scheduling maintenance:', { aircraftId, checkType, scheduledDate: dateStr, startTime, repeat: repeatCheck });

      // Close modal first
      document.body.removeChild(overlay);

      // Show loading overlay
      const checkTypeLabel = checkType === 'A' ? 'Daily' : 'Weekly';
      const message = repeatCheck ?
        `Creating recurring ${checkTypeLabel.toLowerCase()} maintenance patterns...` :
        `Scheduling ${checkTypeLabel.toLowerCase()} maintenance check...`;
      showLoadingOverlay(message);

      const response = await fetch('/api/schedule/maintenance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          aircraftId,
          checkType,
          scheduledDate: dateStr,
          startTime,
          repeat: repeatCheck
        })
      });

      if (response.ok) {
        await loadSchedule(); // Reload schedule
        hideLoadingOverlay();
      } else {
        hideLoadingOverlay();
        const error = await response.json();
        await showAlertModal('Scheduling Error', `Error scheduling maintenance: ${error.error}`);
      }
    } catch (error) {
      hideLoadingOverlay();
      console.error('Error scheduling maintenance:', error);
      await showAlertModal('Error', 'Error scheduling maintenance. Please try again.');
    }
  });

  // Close modal when clicking outside
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
}

// Loading overlay functions
function showLoadingOverlay(message = 'Processing...') {
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
    </div>
  `;

  // Add spinner animation if not already present
  if (!document.getElementById('spinnerAnimation')) {
    const style = document.createElement('style');
    style.id = 'spinnerAnimation';
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.remove();
  }
}

// Action: Clear schedule
async function clearSchedule(aircraftId) {
  const aircraft = userFleet.find(a => a.id === aircraftId);
  if (!aircraft) return;

  const aircraftRoutes = getAircraftRoutes(aircraftId);

  if (aircraftRoutes.length === 0) {
    await showAlertModal('No Routes', `${aircraft.registration} has no routes assigned.`);
    return;
  }

  const confirmed = await showConfirmModal(
    'Clear Schedule',
    `Clear schedule for ${aircraft.registration}?\n\nThis will unassign the aircraft from ${aircraftRoutes.length} route(s). The routes will remain but will no longer have an aircraft assigned.\n\nThis action cannot be undone.`
  );

  if (!confirmed) {
    return;
  }

  try {
    // Unassign aircraft from all routes
    for (const route of aircraftRoutes) {
      const response = await fetch(`/api/routes/${route.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...route,
          assignedAircraftId: null
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to unassign route ${route.routeNumber}`);
      }
    }

    await showAlertModal('Success', `Schedule cleared for ${aircraft.registration}`);
    await loadSchedule();
  } catch (error) {
    console.error('Error clearing schedule:', error);
    await showAlertModal('Error', error.message);
  }
}

// Handle drag over
function handleDragOver(event) {
  if (!draggedRoute) return;

  event.preventDefault();
  event.stopPropagation();

  const cell = event.currentTarget;
  const row = cell.closest('tr');

  // Get the aircraft ID from the row
  const aircraftIdCell = row?.querySelector('[data-aircraft-id]');
  const aircraftId = aircraftIdCell?.getAttribute('data-aircraft-id');

  // Find the aircraft in the fleet
  const aircraft = userFleet.find(a => a.id === aircraftId);

  // Check if route has an assigned aircraft type requirement
  const routeAircraftType = draggedRoute.assignedAircraft?.aircraft?.type;
  const targetAircraftType = aircraft?.aircraft?.type;

  // Only allow drop if aircraft types match or route has no assigned aircraft
  const canDrop = !routeAircraftType || routeAircraftType === targetAircraftType;

  if (canDrop) {
    event.dataTransfer.dropEffect = 'move';
    // Highlight only the cell corresponding to the route's departure time
    if (row) {
      // First clear all highlights in this row
      row.querySelectorAll('.schedule-cell').forEach(c => c.classList.remove('drag-over'));

      // Find the cell that matches the route's scheduled departure hour
      const departureTime = draggedRoute.scheduledDepartureTime || '00:00:00';
      const departureHour = parseInt(departureTime.split(':')[0], 10);
      const targetCell = row.querySelector(`.schedule-cell[data-time="${departureHour}"]`);
      if (targetCell) {
        targetCell.classList.add('drag-over');
      }
    }
  } else {
    event.dataTransfer.dropEffect = 'none';
    // Show as invalid drop target - highlight only the departure time cell with red
    if (row) {
      row.querySelectorAll('.schedule-cell').forEach(c => {
        c.classList.remove('drag-over');
        c.style.background = '';
      });

      // Find the cell that matches the route's scheduled departure hour
      const departureTime = draggedRoute.scheduledDepartureTime || '00:00:00';
      const departureHour = parseInt(departureTime.split(':')[0], 10);
      const targetCell = row.querySelector(`.schedule-cell[data-time="${departureHour}"]`);
      if (targetCell) {
        targetCell.style.background = 'rgba(220, 53, 69, 0.3)'; // Red tint for invalid
      }
    }
  }

  // Update preview - show route's scheduled departure time, not the hour they're hovering over
  const preview = document.getElementById('dragPreview');
  const routeTime = draggedRoute.scheduledDepartureTime ? draggedRoute.scheduledDepartureTime.substring(0, 5) : '--:--';
  const compatibilityIndicator = canDrop ? '' : ' ⚠ INCOMPATIBLE AIRCRAFT';
  preview.textContent = `${draggedRoute.routeNumber} / ${draggedRoute.returnRouteNumber} @ ${routeTime}${compatibilityIndicator}`;
}

// Handle drag leave
function handleDragLeave(event) {
  event.preventDefault();
  const cell = event.currentTarget;

  // Check if we're actually leaving the row, not just moving to another cell in the same row
  const row = cell.closest('tr');
  const rect = row.getBoundingClientRect();
  const y = event.clientY;

  // Only remove highlighting if we're leaving the row entirely
  if (y < rect.top || y >= rect.bottom) {
    if (row && draggedRoute) {
      // Clear only the departure time cell highlight
      const departureTime = draggedRoute.scheduledDepartureTime || '00:00:00';
      const departureHour = parseInt(departureTime.split(':')[0], 10);
      const targetCell = row.querySelector(`.schedule-cell[data-time="${departureHour}"]`);
      if (targetCell) {
        targetCell.classList.remove('drag-over');
        targetCell.style.background = '';
      }
    }
  }
}

// Handle drop
async function handleDrop(event, aircraftId, timeValue) {
  event.preventDefault();
  event.stopPropagation();

  // console.log('Drop event triggered', { aircraftId, draggedRoute });

  const cell = event.currentTarget;

  // Clear all drag-over highlighting and red tint from the row
  const row = cell.closest('tr');
  if (row) {
    row.querySelectorAll('.schedule-cell').forEach(c => {
      c.classList.remove('drag-over');
      c.style.background = '';
    });
  }

  if (!draggedRoute) {
    console.error('No route being dragged');
    return;
  }

  // Find the aircraft in the fleet
  const aircraft = userFleet.find(a => a.id === aircraftId);
  if (!aircraft) {
    await showAlertModal('Error', 'Aircraft not found');
    draggedRoute = null;
    return;
  }

  // Check if route has an assigned aircraft type requirement
  const routeAircraftType = draggedRoute.assignedAircraft?.aircraft?.type;
  const targetAircraftType = aircraft?.aircraft?.type;

  // Only allow drop if aircraft types match or route has no assigned aircraft
  if (routeAircraftType && routeAircraftType !== targetAircraftType) {
    await showAlertModal('Aircraft Type Mismatch', `This route requires a ${routeAircraftType} aircraft. ${aircraft.registration} is a ${targetAircraftType}.`);
    draggedRoute = null;
    return;
  }

  // Use the route's scheduled departure time
  const departureTime = draggedRoute.scheduledDepartureTime || '00:00:00';

  // Get the next occurrence of the selected day of week using game world time
  const worldTime = getCurrentWorldTime();
  if (!worldTime) {
    await showAlertModal('Error', 'World time not available. Please try again.');
    draggedRoute = null;
    return;
  }

  const today = new Date(worldTime);
  const currentDay = today.getDay();
  const daysUntilTarget = getDaysUntilTargetInWeek(currentDay, selectedDayOfWeek);
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntilTarget);
  const scheduleDate = formatLocalDate(targetDate);

  // Confirm scheduling
  const timeStr = departureTime.substring(0, 5);

  // console.log('Confirming schedule:', { aircraft: aircraft?.registration, route: draggedRoute.routeNumber, time: timeStr });

  // Check if route is daily (operates all 7 days)
  const isDaily = draggedRoute.daysOfWeek && draggedRoute.daysOfWeek.length === 7;
  let scheduleForWholeWeek = false;

  if (isDaily) {
    // Ask if they want to schedule for the whole week
    const userChoice = await showConfirmModal(
      'Schedule Daily Route',
      `This is a daily route. Would you like to schedule it for all 7 days of the week?\n\nClick Confirm to schedule for all 7 days, or Cancel to schedule only for the selected day.`
    );
    scheduleForWholeWeek = userChoice;
  }

  // Final confirmation
  if (scheduleForWholeWeek) {
    const confirmed = await showConfirmModal(
      'Confirm Weekly Schedule',
      `Schedule route ${draggedRoute.routeNumber} / ${draggedRoute.returnRouteNumber} on ${aircraft.registration} at ${timeStr} for ALL 7 DAYS?`
    );
    if (!confirmed) {
      draggedRoute = null;
      return;
    }
  } else {
    const confirmed = await showConfirmModal(
      'Confirm Schedule',
      `Schedule route ${draggedRoute.routeNumber} / ${draggedRoute.returnRouteNumber} on ${aircraft.registration} at ${timeStr}?`
    );
    if (!confirmed) {
      draggedRoute = null;
      return;
    }
  }

  try {
    if (scheduleForWholeWeek) {
      // Schedule for all 7 days using batch endpoint (much faster)
      showLoadingModal('Scheduling Flights', 'Adding route to weekly schedule...');

      // Build array of flights to create
      const flightsToCreate = [];
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const targetDateForDay = new Date(today);
        targetDateForDay.setDate(today.getDate() + dayOffset);
        const scheduleDateForDay = formatLocalDate(targetDateForDay);

        flightsToCreate.push({
          scheduledDate: scheduleDateForDay,
          departureTime: departureTime
        });
      }

      updateLoadingProgress(0, 7, 'Sending request...');

      const response = await fetch('/api/schedule/flights/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          routeId: draggedRoute.id,
          aircraftId: aircraftId,
          flights: flightsToCreate
        })
      });

      closeLoadingModal();

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to schedule flights');
      }

      const result = await response.json();

      // Add all the new flights to the array
      if (result.created && Array.isArray(result.created)) {
        scheduledFlights.push(...result.created);
      }

      // Show warning if some flights had conflicts
      if (result.conflicts && result.conflicts.length > 0) {
        await showAlertModal(
          'Partial Success',
          `${result.created.length} flights scheduled. ${result.conflicts.length} day(s) skipped due to conflicts.`
        );
      }
    } else {
      // Schedule for single day only
      showLoadingModal('Scheduling Flight', 'Adding route to schedule...');

      const response = await fetch('/api/schedule/flight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          routeId: draggedRoute.id,
          aircraftId: aircraftId,
          scheduledDate: scheduleDate,
          departureTime: departureTime
        })
      });

      closeLoadingModal();

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to schedule flight');
      }

      const scheduledFlight = await response.json();
      // Add the new flight to the array immediately to avoid full reload
      scheduledFlights.push(scheduledFlight);
    }

    closeAddRouteModal();
    draggedRoute = null;

    // Just re-render without fetching data again
    renderSchedule();
  } catch (error) {
    closeLoadingModal();
    console.error('Error scheduling route:', error);
    await showAlertModal('Scheduling Error', error.message);
  }
}

// Fetch current world time
async function fetchWorldTime() {
  // Prevent concurrent fetches to avoid race conditions
  if (worldTimeFetchInProgress) {
    return;
  }

  try {
    worldTimeFetchInProgress = true;
    const currentSequence = ++worldTimeFetchSequence;

    // console.log('Fetching world time...');
    const response = await fetch('/api/world/info');

    // Ignore this response if a newer request has been made
    if (currentSequence !== worldTimeFetchSequence) {
      return;
    }

    if (response.ok) {
      const worldInfo = await response.json();

      // console.log('[Scheduling] Server sent time:', worldInfo.currentTime, '(ISO string)');

      // Always use client-side time to avoid clock skew issues
      const clientReceiveTime = Date.now();
      const newReferenceTime = new Date(worldInfo.currentTime);

      // console.log('[Scheduling] Parsed as Date object:', newReferenceTime.toString());
      // console.log('[Scheduling] Local time string:', newReferenceTime.toLocaleTimeString());

      // Log time sync details for debugging
      if (scheduleWorldReferenceTime) {
        const oldCalculatedTime = getCurrentWorldTime();
        const timeDiffMs = newReferenceTime.getTime() - oldCalculatedTime.getTime();
        if (Math.abs(timeDiffMs) > 60000) { // More than 1 minute difference
          console.warn(`⚠ Large time sync adjustment: ${Math.round(timeDiffMs / 1000)}s (${Math.round(timeDiffMs / 60000)} minutes)`);
        }
      }

      scheduleWorldReferenceTime = newReferenceTime;
      scheduleWorldReferenceTimestamp = clientReceiveTime;
      scheduleWorldTimeAcceleration = worldInfo.timeAcceleration || 60;

      // console.log('[Scheduling] Reference time set to:', scheduleWorldReferenceTime.toLocaleTimeString(), 'Day:', scheduleWorldReferenceTime.getDay(),
      //   `(source: ${worldInfo.timeSource || 'unknown'}, accel: ${scheduleWorldTimeAcceleration}x)`);

      // Set default day of week to current world day (only on first load)
      if (isFirstLoad) {
        selectedDayOfWeek = scheduleWorldReferenceTime.getDay();

        // console.log('First load - setting selected day to:', selectedDayOfWeek);

        const daySelect = document.getElementById('dayOfWeek');
        if (daySelect) {
          daySelect.value = selectedDayOfWeek;
          // console.log('Day select updated to:', daySelect.value);
        }

        isFirstLoad = false;
      }

      // Update timeline immediately after syncing time
      updateTimeline();
    }
  } catch (error) {
    console.error('Error fetching world time:', error);
  } finally {
    worldTimeFetchInProgress = false;
  }
}

// Calculate current world time (accelerated)
function getCurrentWorldTime() {
  // Try to use the global time from layout.js first (ensures consistency across page)
  if (window.getGlobalWorldTime) {
    const globalTime = window.getGlobalWorldTime();
    if (globalTime) {
      // Log occasionally for debugging
      // const callCount = window.getTimeCallCount || 0;
      // window.getTimeCallCount = callCount + 1;

      // if (callCount < 5 || Math.random() < 0.01) { // First 5 calls or 1% of the time
      //   console.log('[getCurrentWorldTime] Using layout.js global time:', {
      //     time: globalTime.toLocaleTimeString(),
      //     source: 'window.getGlobalWorldTime',
      //     layoutRefTime: window.serverReferenceTime ? new Date(window.serverReferenceTime).toLocaleTimeString() : 'N/A',
      //     layoutRefTimestamp: window.serverReferenceTimestamp ? new Date(window.serverReferenceTimestamp).toLocaleTimeString() : 'N/A'
      //   });
      // }
      return globalTime;
    }
  }

  // Fall back to local calculation if layout hasn't loaded yet
  if (!scheduleWorldReferenceTime || !scheduleWorldReferenceTimestamp) {
    console.warn('[getCurrentWorldTime] No time reference available');
    return null;
  }

  // Calculate real-world time elapsed since we got the reference
  const realElapsedMs = Date.now() - scheduleWorldReferenceTimestamp;

  // Calculate game time advancement (accelerated)
  const gameElapsedMs = realElapsedMs * scheduleWorldTimeAcceleration;

  // Calculate current game time
  const calculatedTime = new Date(scheduleWorldReferenceTime.getTime() + gameElapsedMs);

  // Log occasionally for debugging
  // const callCount = window.getTimeCallCount || 0;
  // window.getTimeCallCount = callCount + 1;

  // if (callCount < 5 || Math.random() < 0.01) { // First 5 calls or 1% of the time
  //   console.log('[getCurrentWorldTime] Using local calculation:', {
  //     calculatedTime: calculatedTime.toLocaleTimeString(),
  //     source: 'local-calculation',
  //     referenceTime: scheduleWorldReferenceTime.toLocaleTimeString(),
  //     realElapsedSec: (realElapsedMs / 1000).toFixed(1),
  //     gameElapsedSec: (gameElapsedMs / 1000).toFixed(1),
  //     acceleration: scheduleWorldTimeAcceleration
  //   });
  // }

  return calculatedTime;
}

// Update the red timeline position - NEW SIMPLE APPROACH
function updateTimeline() {
  const currentTime = getCurrentWorldTime();
  if (!currentTime) return;

  // Only show timeline if we're viewing today
  const currentDay = currentTime.getDay();
  if (currentDay !== selectedDayOfWeek) {
    // Remove timeline if viewing different day
    const existingTimeline = document.getElementById('scheduleTimeline');
    if (existingTimeline) existingTimeline.remove();
    return;
  }

  const container = document.getElementById('scheduleGrid');
  const table = container?.querySelector('table');
  const headerRow = table?.querySelector('thead tr');
  if (!container || !table || !headerRow) return;

  // Calculate current time position
  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const seconds = currentTime.getSeconds();
  const totalHours = hours + (minutes / 60) + (seconds / 3600);

  // Get all header cells
  const headerCells = Array.from(headerRow.querySelectorAll('th'));
  if (headerCells.length < 3) return; // Need at least AIRCRAFT + time columns + ACTIONS

  // Find the time column cells (skip first AIRCRAFT column and last ACTIONS column)
  const timeColumns = headerCells.slice(1, -1);

  // Determine which column the current time falls into
  const currentHourIndex = Math.floor(totalHours);
  const fractionalHour = totalHours - currentHourIndex;

  // Get the target column (index 0 = 00:00, index 1 = 01:00, etc.)
  const targetColumnCell = timeColumns[currentHourIndex];
  if (!targetColumnCell) return;

  // Use getBoundingClientRect to get exact rendered positions
  const containerRect = container.getBoundingClientRect();
  const columnRect = targetColumnCell.getBoundingClientRect();

  // Calculate the exact visual position of the timeline on screen
  const timelineVisualX = columnRect.left + (fractionalHour * columnRect.width);

  // Get the AIRCRAFT column to determine where the schedule time area starts
  const aircraftColumn = headerCells[0];
  const aircraftColumnRect = aircraftColumn.getBoundingClientRect();
  const scheduleAreaLeft = aircraftColumnRect.right; // Time columns start after AIRCRAFT

  // Get the ACTIONS column to determine where the schedule time area ends
  const actionsColumn = headerCells[headerCells.length - 1];
  const actionsColumnRect = actionsColumn.getBoundingClientRect();
  const scheduleAreaRight = actionsColumnRect.left; // Time columns end before ACTIONS

  // Check if the current time position is within the visible schedule area
  // The timeline should only show if it falls between AIRCRAFT and ACTIONS columns visually
  const isTimelineVisible = timelineVisualX >= scheduleAreaLeft && timelineVisualX <= scheduleAreaRight;

  // Get or create timeline element
  let timeline = document.getElementById('scheduleTimeline');

  // If timeline is not within visible area, hide/remove it
  if (!isTimelineVisible) {
    if (timeline) {
      timeline.style.display = 'none';
    }
    return;
  }

  if (!timeline) {
    timeline = document.createElement('div');
    timeline.id = 'scheduleTimeline';
    timeline.style.cssText = `
      position: absolute;
      top: 0;
      width: 2px;
      height: 100%;
      background: #ff0000;
      z-index: 1000;
      pointer-events: none;
    `;

    // Make container relative if it isn't already
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    container.appendChild(timeline);
  }

  // Show timeline and update position
  timeline.style.display = 'block';

  // Calculate position relative to container
  // Start at the left edge of the target column
  let timelineLeft = columnRect.left - containerRect.left;

  // Add fractional position within the column
  timelineLeft += fractionalHour * columnRect.width;

  // Update position
  timeline.style.left = `${timelineLeft}px`;

  // Debug logging (every 20 updates)
  // const updateCount = (window.timelineUpdateCount || 0) + 1;
  // window.timelineUpdateCount = updateCount;

  // if (updateCount % 20 === 0) {
  //   console.log('[Timeline]', {
  //     time: `${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`,
  //     column: currentHourIndex,
  //     fractional: fractionalHour.toFixed(3),
  //     columnLabel: targetColumnCell.textContent,
  //     position: timelineLeft.toFixed(2) + 'px'
  //   });
  // }
}

// Start timeline updates
function startTimelineUpdates() {
  // Clear any existing interval
  if (timelineInterval) {
    clearInterval(timelineInterval);
  }

  // Update timeline every 100ms for smooth movement
  timelineInterval = setInterval(() => {
    updateTimeline();
  }, 100);

  // Also update timeline on scroll to keep it aligned
  const container = document.getElementById('scheduleGrid');
  if (container) {
    // Remove existing scroll listener if it exists
    const newScrollHandler = () => {
      try {
        updateTimeline();
      } catch (error) {
        console.error('[Timeline] Error updating on scroll:', error);
      }
    };
    container.addEventListener('scroll', newScrollHandler);
  }
}

// Listen for world time updates from layout.js (set up BEFORE page loads)
window.addEventListener('worldTimeUpdated', (event) => {
  const { referenceTime, referenceTimestamp, acceleration, source } = event.detail;

  // Sync our local reference time with the global one
  scheduleWorldReferenceTime = referenceTime;
  scheduleWorldReferenceTimestamp = referenceTimestamp;
  scheduleWorldTimeAcceleration = acceleration;

  // console.log('Scheduling page synced with layout time:', referenceTime.toLocaleTimeString(), `(source: ${source})`);

  // Update timeline immediately with new reference time
  if (document.getElementById('scheduleGrid')) {
    updateTimeline();
  }
});

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // console.log('[Scheduling] Page initializing...');
    // console.log('[Scheduling] Initial check - layout.js loaded?', {
    //   hasGlobalTime: !!window.getGlobalWorldTime,
    //   hasRefTime: !!window.serverReferenceTime,
    //   hasRefTimestamp: !!window.serverReferenceTimestamp
    // });

    // IMPORTANT: Always wait for layout.js to provide time
    // This ensures we always use the same time reference as the top clock
    let timeInitialized = false;
    let retries = 0;
    const maxRetries = 20; // Try for up to 2 seconds (20 * 100ms)

    // Retry loop to wait for layout.js
    while (!timeInitialized && retries < maxRetries) {
      // Check if layout.js has provided the global time reference
      if (window.serverReferenceTime && window.serverReferenceTimestamp) {
        // Layout.js is ready, sync directly with its raw reference times
        scheduleWorldReferenceTime = new Date(window.serverReferenceTime.getTime());
        scheduleWorldReferenceTimestamp = window.serverReferenceTimestamp;
        scheduleWorldTimeAcceleration = window.getWorldTimeAcceleration ? window.getWorldTimeAcceleration() : 60;

        const globalTime = window.getGlobalWorldTime();
        if (globalTime) {
          selectedDayOfWeek = globalTime.getDay();

          // Update the day selector dropdown to match current day
          const daySelect = document.getElementById('dayOfWeek');
          if (daySelect) {
            daySelect.value = selectedDayOfWeek;
          }

          // Mark first load as complete so fetchWorldTime() won't reset the day later
          isFirstLoad = false;
          timeInitialized = true;

          // console.log('[Scheduling] ✓ Synced with layout.js (attempt', retries + 1, ')');
          // console.log('[Scheduling]   Reference time:', scheduleWorldReferenceTime.toLocaleTimeString());
          // console.log('[Scheduling]   Reference timestamp:', new Date(scheduleWorldReferenceTimestamp).toLocaleTimeString());
          // console.log('[Scheduling]   Current calculated time:', globalTime.toLocaleTimeString());
          // console.log('[Scheduling]   Day of week:', selectedDayOfWeek);
          // console.log('[Scheduling]   Time source: layout.js raw reference');
        }
      }

      if (!timeInitialized) {
        retries++;
        // console.log('[Scheduling] Waiting for layout.js... (attempt', retries, '/', maxRetries, ')');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Last resort: fetch time ourselves if layout.js never loaded
    if (!timeInitialized) {
      // console.warn('[Scheduling] ⚠ Layout.js not ready after', maxRetries * 100, 'ms - fetching time independently');
      // console.warn('[Scheduling]   This may cause time desynchronization!');
      await fetchWorldTime();
    }

    // console.log('[Scheduling] Time initialized, selected day:', selectedDayOfWeek);

    // Load the schedule
    await loadSchedule();

    // Start timeline updates
    startTimelineUpdates();

    // Add mousemove listener for drag preview
    document.addEventListener('mousemove', updateDragPreview);

    // Add drag end listener
    document.addEventListener('dragend', handleDragEnd);

    // Sync with server every 30 seconds to avoid drift
    setInterval(fetchWorldTime, 30000);

    // Force a timeline update after everything is loaded
    setTimeout(() => {
      const currentTime = getCurrentWorldTime();
      if (currentTime) {
        const headerTime = document.getElementById('worldTime')?.textContent || 'N/A';
        // console.log('[Scheduling] Consistency check:');
        // console.log('  Header clock:', headerTime);
        // console.log('  Calculated time:', currentTime.toLocaleTimeString());
        // console.log('  Using global time?', !!window.getGlobalWorldTime);
        // console.log('  Reference times match?',
        //   scheduleWorldReferenceTime?.getTime() === window.serverReferenceTime?.getTime(),
        //   scheduleWorldReferenceTimestamp === window.serverReferenceTimestamp
        // );
        updateTimeline(); // Ensure timeline is positioned correctly
      }
    }, 1000); // Check after 1 second to ensure everything is settled

    // console.log('[Scheduling] ✓ Page initialized successfully');
  } catch (error) {
    console.error('[Scheduling] ✗ Error initializing:', error);
  }
});
