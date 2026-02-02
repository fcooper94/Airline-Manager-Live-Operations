// Aircraft Scheduling JavaScript - v2.0
let userFleet = [];
let routes = [];
let selectedDayOfWeek = 1; // Default to Monday (1=Monday, 0=Sunday)
let viewMode = 'weekly'; // 'daily' or 'weekly'
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
let flightDetailsUpdateInterval = null; // Interval for auto-updating flight details modal

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

// Calculate effective arrival date for a flight (from stored data or calculated from duration)
function getEffectiveArrivalDate(flight) {
  try {
    // If arrivalDate is stored, use it
    if (flight.arrivalDate) {
      return flight.arrivalDate;
    }

    // Otherwise calculate from flight duration
    const route = flight.route;
    const aircraft = flight.aircraft;
    if (!route || !aircraft?.aircraft?.cruiseSpeed) {
      return flight.scheduledDate; // Fallback to same day
    }

    const cruiseSpeed = aircraft.aircraft.cruiseSpeed;
    const turnaroundMinutes = route.turnaroundTime || 45;
    const distance = route.distance || 500;

    const depLat = parseFloat(route.departureAirport?.latitude) || 0;
    const depLng = parseFloat(route.departureAirport?.longitude) || 0;
    const arrLat = parseFloat(route.arrivalAirport?.latitude) || 0;
    const arrLng = parseFloat(route.arrivalAirport?.longitude) || 0;

    let totalMinutes;
    if (route.techStopAirport) {
      const techStopMinutes = 30;
      const techLat = parseFloat(route.techStopAirport?.latitude) || 0;
      const techLng = parseFloat(route.techStopAirport?.longitude) || 0;
      const leg1Distance = route.legOneDistance || Math.round(distance * 0.4);
      const leg2Distance = route.legTwoDistance || Math.round(distance * 0.6);

      const leg1Min = calculateFlightMinutes(leg1Distance, cruiseSpeed, depLng, techLng, depLat, techLat);
      const leg2Min = calculateFlightMinutes(leg2Distance, cruiseSpeed, techLng, arrLng, techLat, arrLat);
      const leg3Min = calculateFlightMinutes(leg2Distance, cruiseSpeed, arrLng, techLng, arrLat, techLat);
      const leg4Min = calculateFlightMinutes(leg1Distance, cruiseSpeed, techLng, depLng, techLat, depLat);
      totalMinutes = leg1Min + techStopMinutes + leg2Min + turnaroundMinutes + leg3Min + techStopMinutes + leg4Min;
    } else {
      const outMin = calculateFlightMinutes(distance, cruiseSpeed, depLng, arrLng, depLat, arrLat);
      const retMin = calculateFlightMinutes(distance, cruiseSpeed, arrLng, depLng, arrLat, depLat);
      totalMinutes = outMin + turnaroundMinutes + retMin;
    }

    // Parse departure time and calculate arrival datetime
    const depDate = new Date(flight.scheduledDate + 'T00:00:00');
    const depTimeStr = flight.departureTime?.substring(0, 5) || '00:00';
    const [depH, depM] = depTimeStr.split(':').map(Number);
    const depDateTime = new Date(Date.UTC(depDate.getFullYear(), depDate.getMonth(), depDate.getDate(), depH, depM));
    const arrDateTime = new Date(depDateTime.getTime() + totalMinutes * 60000);

    const arrYear = arrDateTime.getUTCFullYear();
    const arrMonth = String(arrDateTime.getUTCMonth() + 1).padStart(2, '0');
    const arrDay = String(arrDateTime.getUTCDate()).padStart(2, '0');
    return `${arrYear}-${arrMonth}-${arrDay}`;
  } catch (e) {
    console.error('Error calculating arrival date:', e, flight);
    return flight.scheduledDate; // Fallback to same day on error
  }
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
// Returns array of { type: 'daily', message: string }
function getMaintenanceWarnings(aircraft) {
  const warnings = [];
  const maintenance = aircraft.recurringMaintenance || [];

  // Get daily checks - should be scheduled for all 7 days (valid for 2 days, so need every day)
  const dailyChecks = maintenance.filter(m => m.checkType === 'daily');
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

  // Get B checks - optional, only needed every 6-8 months
  // No warning needed for B checks since they're infrequent

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

    let startDateStr, endDateStr;

    if (viewMode === 'weekly') {
      // For weekly view, use rolling week (next occurrence of each day)
      // Calculate the date range that covers all 7 "next occurrences"
      const dayDates = [];
      for (let dow = 0; dow < 7; dow++) {
        const daysUntil = getDaysUntilTargetInWeek(currentDay, dow);
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + daysUntil);
        dayDates.push(targetDate);
      }
      // Find min and max dates
      const minDate = new Date(Math.min(...dayDates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dayDates.map(d => d.getTime())));

      startDateStr = formatLocalDate(minDate);
      endDateStr = formatLocalDate(maxDate);
    } else {
      // For daily view, fetch just the selected day
      const daysUntilTarget = getDaysUntilTargetInWeek(currentDay, selectedDayOfWeek);
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysUntilTarget);
      startDateStr = formatLocalDate(targetDate);
      endDateStr = startDateStr;
    }

    console.log('Fetching flights for:', startDateStr, 'to', endDateStr);

    const response = await fetch(`/api/schedule/flights?startDate=${startDateStr}&endDate=${endDateStr}`);
    if (response.ok) {
      scheduledFlights = await response.json();
      console.log('Flights returned:', scheduledFlights.length);
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

    let startDateStr, endDateStr;

    if (viewMode === 'weekly') {
      // For weekly view, fetch the entire current week (Mon-Sun)
      const daysToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const monday = new Date(today);
      monday.setDate(today.getDate() + daysToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      startDateStr = formatLocalDate(monday);
      endDateStr = formatLocalDate(sunday);
    } else {
      // For daily view, fetch just the selected day
      const daysUntilTarget = getDaysUntilTargetInWeek(currentDay, selectedDayOfWeek);
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysUntilTarget);
      startDateStr = formatLocalDate(targetDate);
      endDateStr = startDateStr;
    }

    const response = await fetch(`/api/schedule/maintenance?startDate=${startDateStr}&endDate=${endDateStr}`);
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

// Set view mode (daily or weekly)
function setViewMode(mode) {
  viewMode = mode;

  // Update button styles
  const dailyBtn = document.getElementById('viewDaily');
  const weeklyBtn = document.getElementById('viewWeekly');
  const daySelector = document.getElementById('daySelector');

  if (mode === 'daily') {
    dailyBtn.style.background = 'var(--accent-color)';
    dailyBtn.style.borderColor = 'var(--accent-color)';
    dailyBtn.style.color = 'white';
    weeklyBtn.style.background = 'var(--surface-elevated)';
    weeklyBtn.style.borderColor = 'var(--border-color)';
    weeklyBtn.style.color = 'var(--text-secondary)';
    if (daySelector) daySelector.style.display = 'block';
  } else {
    weeklyBtn.style.background = 'var(--accent-color)';
    weeklyBtn.style.borderColor = 'var(--accent-color)';
    weeklyBtn.style.color = 'white';
    dailyBtn.style.background = 'var(--surface-elevated)';
    dailyBtn.style.borderColor = 'var(--border-color)';
    dailyBtn.style.color = 'var(--text-secondary)';
    if (daySelector) daySelector.style.display = 'none';
  }

  // Reload data since weekly/daily views need different date ranges
  loadSchedule();
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
// calculatedArrTime is the dynamically calculated arrival time with wind effects
function renderOvernightArrivalBlock(flight, route, calculatedArrTime = null) {
  // Use calculated time if provided, otherwise fall back to stored time
  const arrTime = calculatedArrTime || (flight.arrivalTime ? flight.arrivalTime.substring(0, 5) : '??:??');
  const depTime = flight.departureTime ? flight.departureTime.substring(0, 5) : '??:??';
  const [arrHours, arrMinutes] = arrTime.split(':').map(Number);
  const [depHours, depMinutes] = depTime.split(':').map(Number);

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

  // Calculate post-flight extension for overnight arrival
  const postFlightInfo = calculatePostFlightDuration(flight.aircraft, flight.arrivalDate || flight.scheduledDate);
  const postFlightMinutes = postFlightInfo.duration;
  const postFlightWidthPercent = (postFlightMinutes / 60) * 100;
  const postFlightLeftPercent = widthPercent; // Starts where flight ends

  const postFlightExtensionHtml = postFlightMinutes > 0 ? `
    <div
      class="turnaround-extension postflight ${postFlightInfo.hasHeavyCheck ? 'has-check' : ''}"
      style="
        position: absolute;
        left: ${postFlightLeftPercent}%;
        width: ${postFlightWidthPercent}%;
        border-radius: 0;
      "
      onclick="event.stopPropagation(); viewFlightDetailsWeekly('${flight.id}')"
      title="Post-flight: Deboarding & Cleaning (${postFlightMinutes}m)${postFlightInfo.hasHeavyCheck ? ' + ' + postFlightInfo.checkType + ' Check' : ''} - Click for details"
    >POST</div>
  ` : '';

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
    ${postFlightExtensionHtml}
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

    // Calculate the arrival time with wind effects (for overnight arrival check)
    const calcDepDate = new Date(`2000-01-01T${flight.departureTime}`);
    const calcReturnArrDate = new Date(calcDepDate.getTime() + totalDurationMinutes * 60000);
    const calculatedArrHours = calcReturnArrDate.getHours() % 24;
    const calculatedArrMins = calcReturnArrDate.getMinutes();
    const roundedMins = Math.round(calculatedArrMins / 5) * 5;
    const finalArrHours = roundedMins === 60 ? (calculatedArrHours + 1) % 24 : calculatedArrHours;
    const finalArrMins = roundedMins === 60 ? 0 : roundedMins;
    const calculatedArrTime = `${String(finalArrHours).padStart(2, '0')}:${String(finalArrMins).padStart(2, '0')}`;

    // Check if this is an overnight arrival (flight departed before, arrives today)
    const isOvernightArrival = flight.arrivalDate === viewingDate && flight.scheduledDate !== viewingDate;
    if (isOvernightArrival) {
      // Render overnight arrival block with calculated arrival time
      return renderOvernightArrivalBlock(flight, route, calculatedArrTime);
    }

    // Convert duration to a percentage across multiple hour cells
    const durationHours = totalDurationMinutes / 60;

    // Width as percentage: span across cells (each cell is 100% of its width)
    let widthPercent = (durationHours * 100) - minuteOffsetPercent;

    // Calculate pre-flight turnaround extension (for overnight flights that need it early)
    const preFlightMinutesEarly = calculatePreFlightDuration(flight.aircraft, route);
    const preFlightWidthPercentEarly = (preFlightMinutesEarly / 60) * 100;
    const preFlightLeftPercentEarly = leftPercent - preFlightWidthPercentEarly;

    const preFlightExtensionHtmlEarly = preFlightMinutesEarly > 0 ? `
      <div
        class="turnaround-extension preflight"
        style="
          position: absolute;
          left: ${preFlightLeftPercentEarly}%;
          width: ${preFlightWidthPercentEarly}%;
        "
        onclick="event.stopPropagation(); viewFlightDetailsWeekly('${flight.id}')"
        title="Pre-flight: Catering & Fuelling (${preFlightMinutesEarly}m) - Click for details"
      >PRE</div>
    ` : '';

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
        ${preFlightExtensionHtmlEarly}
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

    // Calculate turnaround extensions (pre-flight and post-flight duties)
    const preFlightMinutes = calculatePreFlightDuration(flight.aircraft, route);
    const postFlightInfo = calculatePostFlightDuration(flight.aircraft, flight.scheduledDate);
    const postFlightMinutes = postFlightInfo.duration;

    // Convert turnaround durations to percentage widths (each hour = 100%)
    const preFlightWidthPercent = (preFlightMinutes / 60) * 100;
    const postFlightWidthPercent = (postFlightMinutes / 60) * 100;

    // Calculate positions for extensions
    // Pre-flight extension starts before the flight (to the left)
    const preFlightLeftPercent = leftPercent - preFlightWidthPercent;
    // Post-flight extension starts after the flight ends
    const postFlightLeftPercent = leftPercent + widthPercent;

    // Build pre-flight extension HTML (shown before the flight block)
    const preFlightExtensionHtml = preFlightMinutes > 0 ? `
      <div
        class="turnaround-extension preflight"
        style="
          position: absolute;
          left: ${preFlightLeftPercent}%;
          width: ${preFlightWidthPercent}%;
        "
        onclick="event.stopPropagation(); viewFlightDetailsWeekly('${flight.id}')"
        title="Pre-flight: Catering & Fuelling (${preFlightMinutes}m) - Click for details"
      >PRE</div>
    ` : '';

    // Build post-flight extension HTML (shown after the flight block)
    const postFlightExtensionHtml = postFlightMinutes > 0 ? `
      <div
        class="turnaround-extension postflight ${postFlightInfo.hasHeavyCheck ? 'has-check' : ''}"
        style="
          position: absolute;
          left: ${postFlightLeftPercent}%;
          width: ${postFlightWidthPercent}%;
          border-radius: 0;
        "
        onclick="event.stopPropagation(); viewFlightDetailsWeekly('${flight.id}')"
        title="Post-flight: Deboarding & Cleaning (${postFlightMinutes}m)${postFlightInfo.hasHeavyCheck ? ' + ' + postFlightInfo.checkType + ' Check' : ''} - Click for details"
      >POST</div>
    ` : '';

    // Use simplified layout for short flights (under 2 hours total)
    const isShortFlight = durationHours < 2;
    const isVeryShortFlight = durationHours < 1.5;

    if (isVeryShortFlight) {
      // Ultra-compact layout for very short flights - IATA codes only
      // For tech stops, show tech stop code in green above route info
      if (techStopAirport) {
        return `
          ${preFlightExtensionHtml}
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
          ${postFlightExtensionHtml}
        `;
      }

      return `
        ${preFlightExtensionHtml}
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
        ${postFlightExtensionHtml}
      `;
    }

    if (isShortFlight) {
      // Compact layout for short flights - hide bottom row and return time
      // For tech stops, show tech stop code above route numbers in green
      if (techStopAirport) {
        return `
          ${preFlightExtensionHtml}
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
          ${postFlightExtensionHtml}
        `;
      }

      return `
        ${preFlightExtensionHtml}
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
        ${postFlightExtensionHtml}
      `;
    }

    // Full layout for longer flights
    // For tech stops, show tech stop code in green above route numbers
    if (techStopAirport) {
      return `
        ${preFlightExtensionHtml}
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
        ${postFlightExtensionHtml}
      `;
    }

    return `
      ${preFlightExtensionHtml}
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
      ${postFlightExtensionHtml}
    `;
  }).join('');
}

// Render maintenance blocks within a cell (daily view only)
function renderMaintenanceBlocks(maintenance, cellFlights = [], aircraft = null) {
  if (!maintenance || maintenance.length === 0) return '';

  // Calculate where flights + POST blocks end (to determine if maintenance is adjacent)
  let flightEndMinuteInHour = -1;
  if (cellFlights && cellFlights.length > 0 && aircraft) {
    cellFlights.forEach(flight => {
      // Get arrival time and add post-flight duration
      const arrTimeStr = flight.arrivalTime?.substring(0, 5) || '00:00';
      const [arrH, arrM] = arrTimeStr.split(':').map(Number);
      let arrMins = arrH * 60 + arrM;

      // Calculate post-flight duration
      const acType = aircraft.aircraft?.type || 'Narrowbody';
      const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;
      let deboardDur = 0;
      if (acType !== 'Cargo') {
        if (paxCapacity < 50) deboardDur = 5;
        else if (paxCapacity < 100) deboardDur = 8;
        else if (paxCapacity < 200) deboardDur = 12;
        else if (paxCapacity < 300) deboardDur = 15;
        else deboardDur = 20;
      }
      let cleanDur;
      if (paxCapacity < 50) cleanDur = 5;
      else if (paxCapacity < 100) cleanDur = 10;
      else if (paxCapacity < 200) cleanDur = 15;
      else if (paxCapacity < 300) cleanDur = 20;
      else cleanDur = 25;

      const postFlightEnd = arrMins + deboardDur + cleanDur;
      // Get the minute within the hour where post-flight ends
      const endMinuteInHour = postFlightEnd % 60;
      if (endMinuteInHour > flightEndMinuteInHour) {
        flightEndMinuteInHour = endMinuteInHour;
      }
    });
  }

  return maintenance.map(check => {
    const startTime = check.startTime.substring(0, 5); // HH:MM
    const [hours, minutes] = startTime.split(':').map(Number);

    // Calculate minute offset within the starting hour (0-60)
    const minuteOffsetPercent = (minutes / 60) * 100;
    const leftPercent = minuteOffsetPercent;

    // Duration in minutes
    const durationMinutes = check.duration;
    const durationHours = durationMinutes / 60;

    // Width as percentage of cell width (60 min = 100% of one cell)
    // The block will overflow into adjacent cells if needed
    const widthPercent = durationHours * 100;

    // Calculate end time (rounded to nearest 5 minutes)
    const startDate = new Date(`2000-01-01T${check.startTime}`);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    const endMins = endDate.getMinutes();
    const roundedEndMins = Math.round(endMins / 5) * 5;
    const endHours = roundedEndMins === 60 ? (endDate.getHours() + 1) % 24 : endDate.getHours();
    const finalEndMins = roundedEndMins === 60 ? 0 : roundedEndMins;
    const endTime = `${endHours.toString().padStart(2, '0')}:${finalEndMins.toString().padStart(2, '0')}`;

    // Color and label based on check type
    const checkConfig = {
      'daily': { color: '#FFA500', label: 'DAILY', description: 'Daily Check (1 hour)' },
      'A': { color: '#17A2B8', label: 'A CHK', description: 'A Check (3 hours)' },
      'B': { color: '#8B5CF6', label: 'B CHK', description: 'B Check (6 hours)' }
    };
    const config = checkConfig[check.checkType] || { color: '#6C757D', label: check.checkType, description: 'Maintenance' };
    const backgroundColor = config.color;
    const checkLabel = config.label;
    const checkDescription = config.description;

    // Get aircraft registration
    const registration = check.aircraft ? check.aircraft.registration : 'Unknown';

    // Check if maintenance starts where a flight/POST block ends (within 5 minutes tolerance)
    const isAdjacentToFlight = flightEndMinuteInHour >= 0 && Math.abs(minutes - flightEndMinuteInHour) <= 5;
    const borderRadius = isAdjacentToFlight ? '0 2px 2px 0' : '2px';

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
          border-radius: ${borderRadius};
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

// Calculate pre-flight turnaround duration (catering + boarding + fuelling before departure)
// Returns duration in minutes
// Boarding can't start until catering is complete, fuelling happens in parallel
function calculatePreFlightDuration(aircraft, route) {
  const acType = aircraft.aircraft?.type || 'Narrowbody';
  const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;

  // Pre-flight catering (5-15 mins for 50+ pax)
  let cateringDuration = 0;
  if (paxCapacity >= 50 && acType !== 'Cargo') {
    if (paxCapacity < 100) {
      cateringDuration = 5;
    } else if (paxCapacity < 200) {
      cateringDuration = 10;
    } else {
      cateringDuration = 15;
    }
  }

  // Boarding duration (10-35 mins based on capacity) - starts after catering
  let boardingDuration = 0;
  if (acType !== 'Cargo') {
    if (paxCapacity < 50) {
      boardingDuration = 10;
    } else if (paxCapacity < 100) {
      boardingDuration = 15;
    } else if (paxCapacity < 200) {
      boardingDuration = 20;
    } else if (paxCapacity < 300) {
      boardingDuration = 25;
    } else {
      boardingDuration = 35;
    }
  }

  // Catering + boarding happen in sequence
  const cateringBoardingDuration = cateringDuration + boardingDuration;

  // Pre-flight fuelling based on the route distance (10-25 mins) - happens in parallel
  const distance = route?.distance || 0;
  let fuellingDuration = 0;
  if (distance < 500) {
    fuellingDuration = 10;
  } else if (distance < 1500) {
    fuellingDuration = 15;
  } else if (distance < 3000) {
    fuellingDuration = 20;
  } else {
    fuellingDuration = 25;
  }

  // Total is the max of (catering + boarding) vs fuelling
  return Math.max(cateringBoardingDuration, fuellingDuration);
}

// Calculate post-flight turnaround duration (deboarding + cleaning)
// Returns { duration: number, hasHeavyCheck: boolean, checkType: 'C'|'D'|null }
function calculatePostFlightDuration(aircraft, scheduledDate) {
  const acType = aircraft.aircraft?.type || 'Narrowbody';
  const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;

  // Calculate deboarding time (5-20 mins based on capacity)
  let deboardingDuration = 0;
  if (acType !== 'Cargo') {
    if (paxCapacity < 50) {
      deboardingDuration = 5;
    } else if (paxCapacity < 100) {
      deboardingDuration = 8;
    } else if (paxCapacity < 200) {
      deboardingDuration = 12;
    } else if (paxCapacity < 300) {
      deboardingDuration = 15;
    } else {
      deboardingDuration = 20;
    }
  }

  // Calculate cleaning duration (5-25 mins based on size) - starts after deboarding
  let cleaningDuration;
  if (paxCapacity < 50) {
    cleaningDuration = 5;
  } else if (paxCapacity < 100) {
    cleaningDuration = 10;
  } else if (paxCapacity < 200) {
    cleaningDuration = 15;
  } else if (paxCapacity < 300) {
    cleaningDuration = 20;
  } else {
    cleaningDuration = 25;
  }

  const totalDuration = deboardingDuration + cleaningDuration;

  // Check for scheduled heavy maintenance (C/D check)
  let hasHeavyCheck = false;
  let checkType = null;

  const dCheckDue = isHeavyCheckDue(aircraft, 'D', scheduledDate);
  const cCheckDue = isHeavyCheckDue(aircraft, 'C', scheduledDate);

  if (dCheckDue) {
    hasHeavyCheck = true;
    checkType = 'D';
  } else if (cCheckDue) {
    hasHeavyCheck = true;
    checkType = 'C';
  }

  return { duration: totalDuration, hasHeavyCheck, checkType };
}

// Build post-flight actions HTML for flight details modal
function buildPostFlightHtml(aircraft, flight, arrHomeMins, formatTime, allFlights) {
  const scheduledDate = flight.scheduledDate;

  // Get aircraft details for cleaning/catering duration
  const acType = aircraft.aircraft?.type || 'Narrowbody';
  const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;

  // Calculate deboarding time (5-20 mins based on capacity)
  // Cleaning and catering can't start until deboarding is complete
  let deboardingDuration = 0;
  if (acType !== 'Cargo') {
    if (paxCapacity < 50) {
      deboardingDuration = 5;
    } else if (paxCapacity < 100) {
      deboardingDuration = 8;
    } else if (paxCapacity < 200) {
      deboardingDuration = 12;
    } else if (paxCapacity < 300) {
      deboardingDuration = 15;
    } else {
      deboardingDuration = 20;
    }
  }
  const deboardingEndMins = arrHomeMins + deboardingDuration;

  // Calculate cleaning duration (5-25 mins based on size) - starts after deboarding
  let cleaningDuration;
  if (paxCapacity < 50) {
    cleaningDuration = 5;
  } else if (paxCapacity < 100) {
    cleaningDuration = 10;
  } else if (paxCapacity < 200) {
    cleaningDuration = 15;
  } else if (paxCapacity < 300) {
    cleaningDuration = 20;
  } else {
    cleaningDuration = 25;
  }
  const cleaningEndMins = deboardingEndMins + cleaningDuration;

  // Calculate catering duration (5-15 mins for 50+ pax aircraft) - starts after deboarding
  let cateringDuration = 0;
  let cateringEndMins = deboardingEndMins;
  if (paxCapacity >= 50 && acType !== 'Cargo') {
    if (paxCapacity < 100) {
      cateringDuration = 5;
    } else if (paxCapacity < 200) {
      cateringDuration = 10;
    } else {
      cateringDuration = 15;
    }
    cateringEndMins = deboardingEndMins + cateringDuration;
  }

  // Calculate water/waste servicing duration (5-10 mins for regional and airliners) - starts at arrival
  let waterWasteDuration = 0;
  let waterWasteEndMins = arrHomeMins;
  if (paxCapacity >= 30 && acType !== 'Cargo') {
    if (paxCapacity < 100) {
      waterWasteDuration = 5;
    } else if (paxCapacity < 200) {
      waterWasteDuration = 7;
    } else {
      waterWasteDuration = 10;
    }
    waterWasteEndMins = arrHomeMins + waterWasteDuration;
  }

  // Check if there's a next flight for this aircraft to determine fuelling
  let fuellingDuration = 0;
  let fuellingEndMins = arrHomeMins;
  let fuellingSector = '';

  if (allFlights && allFlights.length > 0) {
    // Find the next flight for this aircraft (same or later date)
    const nextFlight = allFlights
      .filter(f =>
        f.aircraft.id === aircraft.id &&
        f.id !== flight.id &&
        (f.scheduledDate > scheduledDate ||
         (f.scheduledDate === scheduledDate && f.departureTime > flight.departureTime))
      )
      .sort((a, b) => {
        if (a.scheduledDate !== b.scheduledDate) {
          return a.scheduledDate.localeCompare(b.scheduledDate);
        }
        return a.departureTime.localeCompare(b.departureTime);
      })[0];

    if (nextFlight) {
      // Calculate fuelling duration based on next flight's distance (10-25 mins)
      const nextDistance = nextFlight.route?.distance || 0;
      if (nextDistance < 500) {
        fuellingDuration = 10;
      } else if (nextDistance < 1500) {
        fuellingDuration = 15;
      } else if (nextDistance < 3000) {
        fuellingDuration = 20;
      } else {
        fuellingDuration = 25;
      }
      fuellingEndMins = arrHomeMins + fuellingDuration;

      // Get the sector for display
      const depCode = nextFlight.route?.departureAirport?.iataCode || nextFlight.route?.departureAirport?.icaoCode || '???';
      const arrCode = nextFlight.route?.arrivalAirport?.iataCode || nextFlight.route?.arrivalAirport?.icaoCode || '???';
      fuellingSector = `${depCode}-${arrCode}`;
    }
  }

  // Calculate turnaround end time - the latest of all activities
  const turnaroundEndMins = Math.max(cleaningEndMins, cateringEndMins, waterWasteEndMins, fuellingEndMins);

  // Check if C or D check is due for this aircraft
  let heavyCheckHtml = '';
  let availableDate = scheduledDate;
  let availableTime = formatTime(turnaroundEndMins);

  // Calculate if C check is due (check expiry based on last check date and interval)
  const cCheckDue = isHeavyCheckDue(aircraft, 'C', scheduledDate);
  const dCheckDue = isHeavyCheckDue(aircraft, 'D', scheduledDate);

  if (dCheckDue) {
    // D check takes 60 days
    const releaseDate = addDaysToDate(scheduledDate, 60);
    heavyCheckHtml = `
      <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.25rem 0.5rem; font-size: 0.85rem; margin-top: 0.25rem;">
        <span style="color: #f85149;">D Check</span>
        <span style="color: #8b949e;">Heavy maintenance overhaul</span>
        <span style="color: #f85149;">60 days</span>
      </div>
    `;
    availableDate = releaseDate;
    availableTime = '00:00';
  } else if (cCheckDue) {
    // C check takes 14 days
    const releaseDate = addDaysToDate(scheduledDate, 14);
    heavyCheckHtml = `
      <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.25rem 0.5rem; font-size: 0.85rem; margin-top: 0.25rem;">
        <span style="color: #a371f7;">C Check</span>
        <span style="color: #8b949e;">Structural inspection</span>
        <span style="color: #a371f7;">14 days</span>
      </div>
    `;
    availableDate = releaseDate;
    availableTime = '00:00';
  }

  // Format the available date/time string
  const showDate = availableDate !== scheduledDate;
  const availableStr = showDate
    ? `${formatDateShort(availableDate)} at ${availableTime}`
    : availableTime;

  // Determine which activity finishes last (to highlight it)
  const isCleaningLast = cleaningEndMins >= turnaroundEndMins;
  const isCateringLast = cateringDuration > 0 && cateringEndMins >= turnaroundEndMins;
  const isWaterWasteLast = waterWasteDuration > 0 && waterWasteEndMins >= turnaroundEndMins;
  const isFuellingLast = fuellingDuration > 0 && fuellingEndMins >= turnaroundEndMins;

  const highlightColor = '#ffa657';
  const normalColor = '#8b949e';

  // Build deboarding row if applicable
  const deboardingRowHtml = deboardingDuration > 0 ? `
      <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.25rem 0.5rem; font-size: 0.85rem;">
        <span>Deboarding</span>
        <span style="color: #8b949e;">${formatTime(arrHomeMins)} → ${formatTime(deboardingEndMins)}</span>
        <span style="color: #8b949e;">${deboardingDuration}m</span>
      </div>
  ` : '';

  // Build catering row if applicable (with conditional highlighting) - starts after deboarding
  const cateringRowHtml = cateringDuration > 0 ? `
      <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.25rem 0.5rem; font-size: 0.85rem;">
        <span>Catering</span>
        <span style="color: #8b949e;">${formatTime(deboardingEndMins)} → ${formatTime(cateringEndMins)}</span>
        <span style="color: ${isCateringLast ? highlightColor : normalColor};">${cateringDuration}m</span>
      </div>
  ` : '';

  // Build water/waste row if applicable (with conditional highlighting) - starts at arrival
  const waterWasteRowHtml = waterWasteDuration > 0 ? `
      <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.25rem 0.5rem; font-size: 0.85rem;">
        <span>Water &amp; Waste</span>
        <span style="color: #8b949e;">${formatTime(arrHomeMins)} → ${formatTime(waterWasteEndMins)}</span>
        <span style="color: ${isWaterWasteLast ? highlightColor : normalColor};">${waterWasteDuration}m</span>
      </div>
  ` : '';

  // Build fuelling row if there's a next flight scheduled
  const fuellingRowHtml = fuellingDuration > 0 ? `
      <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.25rem 0.5rem; font-size: 0.85rem;">
        <span>Fuelling <span style="color: #58a6ff;">(${fuellingSector})</span></span>
        <span style="color: #8b949e;">${formatTime(arrHomeMins)} → ${formatTime(fuellingEndMins)}</span>
        <span style="color: ${isFuellingLast ? highlightColor : normalColor};">${fuellingDuration}m</span>
      </div>
  ` : '';

  return `
    <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #30363d;">
      <div style="font-weight: 600; margin-bottom: 0.5rem; color: #58a6ff;">Post-flight Actions</div>
      ${deboardingRowHtml}
      <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.25rem 0.5rem; font-size: 0.85rem;">
        <span>Cleaning</span>
        <span style="color: #8b949e;">${formatTime(deboardingEndMins)} → ${formatTime(cleaningEndMins)}</span>
        <span style="color: ${isCleaningLast ? highlightColor : normalColor};">${cleaningDuration}m</span>
      </div>
      ${cateringRowHtml}
      ${waterWasteRowHtml}
      ${fuellingRowHtml}
      ${heavyCheckHtml}
      <div style="margin-top: 0.5rem; font-size: 0.85rem; color: #7ee787;">
        Aircraft available from ${availableStr}
      </div>
    </div>
  `;
}

// Check if a heavy maintenance check (C or D) is due
function isHeavyCheckDue(aircraft, checkType, flightDate) {
  const lastCheckField = checkType === 'C' ? 'lastCCheckDate' : 'lastDCheckDate';
  const intervalField = checkType === 'C' ? 'cCheckIntervalDays' : 'dCheckIntervalDays';
  const defaultInterval = checkType === 'C' ? 660 : 2920; // ~22 months for C, ~8 years for D

  const lastCheckDate = aircraft[lastCheckField];
  if (!lastCheckDate) return false; // Never had a check, not automatically due yet

  const interval = aircraft[intervalField] || defaultInterval;
  const lastCheck = new Date(lastCheckDate);
  const flightDateObj = new Date(flightDate + 'T23:59:59Z');

  // Calculate expiry date
  const expiryDate = new Date(lastCheck);
  expiryDate.setUTCDate(expiryDate.getUTCDate() + interval);

  // Check is due if flight date is past expiry
  return flightDateObj >= expiryDate;
}

// Add days to a date string (YYYY-MM-DD format)
function addDaysToDate(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

// Format date as short string (e.g., "8 Feb 2014")
function formatDateShort(dateStr) {
  const date = new Date(dateStr + 'T00:00:00Z');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// Show pre-flight actions modal
function showPreFlightModal(flightId) {
  const flight = scheduledFlights.find(f => f.id === flightId);
  if (!flight) return;

  const aircraft = flight.aircraft;
  const route = flight.route;
  const acType = aircraft.aircraft?.type || 'Narrowbody';
  const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;

  // Calculate pre-flight durations
  let cateringDuration = 0;
  if (paxCapacity >= 50 && acType !== 'Cargo') {
    if (paxCapacity < 100) cateringDuration = 5;
    else if (paxCapacity < 200) cateringDuration = 10;
    else cateringDuration = 15;
  }

  // Boarding duration (10-35 mins based on capacity) - starts after catering
  let boardingDuration = 0;
  if (acType !== 'Cargo') {
    if (paxCapacity < 50) boardingDuration = 10;
    else if (paxCapacity < 100) boardingDuration = 15;
    else if (paxCapacity < 200) boardingDuration = 20;
    else if (paxCapacity < 300) boardingDuration = 25;
    else boardingDuration = 35;
  }

  const distance = route?.distance || 0;
  let fuellingDuration = 0;
  if (distance < 500) fuellingDuration = 10;
  else if (distance < 1500) fuellingDuration = 15;
  else if (distance < 3000) fuellingDuration = 20;
  else fuellingDuration = 25;

  // Catering + boarding happen in sequence, fuelling in parallel
  const cateringBoardingDuration = cateringDuration + boardingDuration;
  const totalDuration = Math.max(cateringBoardingDuration, fuellingDuration);

  // Calculate progress based on current time
  const now = typeof window.getGlobalWorldTime === 'function' ? window.getGlobalWorldTime() : new Date();
  const scheduledDate = flight.scheduledDate;
  const depTime = flight.departureTime.substring(0, 5);
  const [depH, depM] = depTime.split(':').map(Number);

  // Create departure datetime
  const [year, month, day] = scheduledDate.split('-').map(Number);
  const departureTime = new Date(Date.UTC(year, month - 1, day, depH, depM));

  // Pre-flight starts before departure
  const preFlightStartTime = new Date(departureTime.getTime() - totalDuration * 60000);

  // Calculate elapsed minutes since pre-flight start
  const elapsedMins = (now.getTime() - preFlightStartTime.getTime()) / 60000;

  // Calculate progress for each action
  // Catering: starts at 0, ends at cateringDuration
  // Boarding: starts at cateringDuration, ends at cateringDuration + boardingDuration
  // Fuelling: starts at 0, ends at fuellingDuration (parallel)
  const calcProgress = (startMin, duration) => {
    if (duration === 0) return 100;
    if (elapsedMins < startMin) return 0;
    if (elapsedMins >= startMin + duration) return 100;
    return Math.round(((elapsedMins - startMin) / duration) * 100);
  };

  const cateringProgress = calcProgress(0, cateringDuration);
  const boardingProgress = calcProgress(cateringDuration, boardingDuration);
  const fuellingProgress = calcProgress(0, fuellingDuration);
  const totalProgress = calcProgress(0, totalDuration);

  // Helper to build progress bar HTML
  const progressBar = (progress, color) => `
    <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
      <div style="flex: 1; height: 6px; background: #21262d; border-radius: 3px; overflow: hidden;">
        <div style="width: ${progress}%; height: 100%; background: ${color}; border-radius: 3px; transition: width 0.3s;"></div>
      </div>
      <span style="color: ${progress === 100 ? '#7ee787' : '#8b949e'}; font-size: 0.75rem; min-width: 35px; text-align: right;">${progress}%</span>
    </div>
  `;

  // Build modal content
  let content = `
    <div style="display: grid; grid-template-columns: 1fr auto; gap: 0.5rem 1rem; font-size: 0.9rem;">
      <span style="color: #8b949e;">Aircraft:</span>
      <span style="color: #f0f6fc; font-weight: 600;">${aircraft.registration}</span>
      <span style="color: #8b949e;">Route:</span>
      <span style="color: #f0f6fc;">${route.routeNumber} / ${route.returnRouteNumber}</span>
    </div>
    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #30363d;">
      <div style="font-weight: 600; margin-bottom: 0.5rem; color: #3fb950;">Pre-flight Actions</div>
  `;

  if (cateringDuration > 0) {
    content += `
      <div style="padding: 0.35rem 0;">
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
          <span>Catering</span>
          <span style="color: #8b949e;">${cateringDuration}m</span>
        </div>
        ${progressBar(cateringProgress, '#f97316')}
      </div>
    `;
  }

  if (boardingDuration > 0) {
    content += `
      <div style="padding: 0.35rem 0;">
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
          <span>Boarding${cateringDuration > 0 ? ' <span style="color: #ffa657; font-size: 0.7rem;">(after catering)</span>' : ''}</span>
          <span style="color: #8b949e;">${boardingDuration}m</span>
        </div>
        ${progressBar(boardingProgress, '#a855f7')}
      </div>
    `;
  }

  content += `
    <div style="padding: 0.35rem 0;">
      <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
        <span>Fuelling <span style="color: #58a6ff; font-size: 0.7rem;">(${Math.round(distance)}nm)</span></span>
        <span style="color: #8b949e;">${fuellingDuration}m</span>
      </div>
      ${progressBar(fuellingProgress, '#3b82f6')}
    </div>
    <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #30363d;">
      <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600;">
        <span>Total Pre-flight</span>
        <span style="color: #3fb950;">${totalDuration}m</span>
      </div>
      ${progressBar(totalProgress, '#22c55e')}
    </div>
  </div>
  `;

  showTurnaroundModal('Pre-flight Actions', content);
}

// Show post-flight actions modal
function showPostFlightModal(flightId) {
  const flight = scheduledFlights.find(f => f.id === flightId);
  if (!flight) return;

  const aircraft = flight.aircraft;
  const route = flight.route;
  const acType = aircraft.aircraft?.type || 'Narrowbody';
  const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;
  const scheduledDate = flight.scheduledDate;

  // Calculate deboarding duration
  let deboardingDuration = 0;
  if (acType !== 'Cargo') {
    if (paxCapacity < 50) deboardingDuration = 5;
    else if (paxCapacity < 100) deboardingDuration = 8;
    else if (paxCapacity < 200) deboardingDuration = 12;
    else if (paxCapacity < 300) deboardingDuration = 15;
    else deboardingDuration = 20;
  }

  // Calculate cleaning duration
  let cleaningDuration;
  if (paxCapacity < 50) cleaningDuration = 5;
  else if (paxCapacity < 100) cleaningDuration = 10;
  else if (paxCapacity < 200) cleaningDuration = 15;
  else if (paxCapacity < 300) cleaningDuration = 20;
  else cleaningDuration = 25;

  const totalDuration = deboardingDuration + cleaningDuration;

  // Check for heavy maintenance
  const cCheckDue = isHeavyCheckDue(aircraft, 'C', scheduledDate);
  const dCheckDue = isHeavyCheckDue(aircraft, 'D', scheduledDate);

  // Calculate arrival time for progress calculation
  const hasTechStopForProgress = route.techStopAirport;
  const techStopMinsForProgress = 30;
  const turnaroundMinsForProgress = route.turnaroundTime || 45;
  let outboundMinsForProgress = 0;
  let returnMinsForProgress = 0;

  if (aircraft.aircraft && aircraft.aircraft.cruiseSpeed) {
    const cruiseSpeed = aircraft.aircraft.cruiseSpeed;
    const depLat = parseFloat(route.departureAirport?.latitude) || 0;
    const depLng = parseFloat(route.departureAirport?.longitude) || 0;
    const arrLat = parseFloat(route.arrivalAirport?.latitude) || 0;
    const arrLng = parseFloat(route.arrivalAirport?.longitude) || 0;

    if (hasTechStopForProgress) {
      const techLat = parseFloat(route.techStopAirport?.latitude) || 0;
      const techLng = parseFloat(route.techStopAirport?.longitude) || 0;
      const leg1Distance = route.legOneDistance || Math.round(route.distance * 0.4);
      const leg2Distance = route.legTwoDistance || Math.round(route.distance * 0.6);
      const leg1Minutes = calculateFlightMinutes(leg1Distance, cruiseSpeed, depLng, techLng, depLat, techLat);
      const leg2Minutes = calculateFlightMinutes(leg2Distance, cruiseSpeed, techLng, arrLng, techLat, arrLat);
      const leg3Minutes = calculateFlightMinutes(leg2Distance, cruiseSpeed, arrLng, techLng, arrLat, techLat);
      const leg4Minutes = calculateFlightMinutes(leg1Distance, cruiseSpeed, techLng, depLng, techLat, depLat);
      outboundMinsForProgress = leg1Minutes + techStopMinsForProgress + leg2Minutes;
      returnMinsForProgress = leg3Minutes + techStopMinsForProgress + leg4Minutes;
    } else {
      outboundMinsForProgress = calculateFlightMinutes(route.distance, cruiseSpeed, depLng, arrLng, depLat, arrLat);
      returnMinsForProgress = calculateFlightMinutes(route.distance, cruiseSpeed, arrLng, depLng, arrLat, depLat);
    }
  }

  const totalFlightMinsForProgress = outboundMinsForProgress + turnaroundMinsForProgress + returnMinsForProgress;
  const depTimeStr = flight.departureTime.substring(0, 5);
  const [depHour, depMin] = depTimeStr.split(':').map(Number);

  // Create arrival datetime
  const [year, month, day] = scheduledDate.split('-').map(Number);
  const departureDateTime = new Date(Date.UTC(year, month - 1, day, depHour, depMin));
  const arrivalTime = new Date(departureDateTime.getTime() + totalFlightMinsForProgress * 60000);

  // Calculate progress based on current time
  const now = typeof window.getGlobalWorldTime === 'function' ? window.getGlobalWorldTime() : new Date();
  const elapsedMins = (now.getTime() - arrivalTime.getTime()) / 60000;

  // Calculate progress for each action
  // Deboarding: starts at 0 (arrival), ends at deboardingDuration
  // Cleaning: starts at deboardingDuration, ends at deboardingDuration + cleaningDuration
  const calcProgress = (startMin, duration) => {
    if (duration === 0) return 100;
    if (elapsedMins < startMin) return 0;
    if (elapsedMins >= startMin + duration) return 100;
    return Math.round(((elapsedMins - startMin) / duration) * 100);
  };

  const deboardingProgress = calcProgress(0, deboardingDuration);
  const cleaningProgress = calcProgress(deboardingDuration, cleaningDuration);
  const totalProgress = calcProgress(0, totalDuration);

  // Helper to build progress bar HTML
  const progressBar = (progress, color) => `
    <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
      <div style="flex: 1; height: 6px; background: #21262d; border-radius: 3px; overflow: hidden;">
        <div style="width: ${progress}%; height: 100%; background: ${color}; border-radius: 3px; transition: width 0.3s;"></div>
      </div>
      <span style="color: ${progress === 100 ? '#7ee787' : '#8b949e'}; font-size: 0.75rem; min-width: 35px; text-align: right;">${progress}%</span>
    </div>
  `;

  // Build modal content
  let content = `
    <div style="display: grid; grid-template-columns: 1fr auto; gap: 0.5rem 1rem; font-size: 0.9rem;">
      <span style="color: #8b949e;">Aircraft:</span>
      <span style="color: #f0f6fc; font-weight: 600;">${aircraft.registration}</span>
      <span style="color: #8b949e;">Route:</span>
      <span style="color: #f0f6fc;">${route.routeNumber} / ${route.returnRouteNumber}</span>
    </div>
    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #30363d;">
      <div style="font-weight: 600; margin-bottom: 0.5rem; color: #58a6ff;">Post-flight Actions</div>
  `;

  if (deboardingDuration > 0) {
    content += `
      <div style="padding: 0.35rem 0;">
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
          <span>Deboarding</span>
          <span style="color: #8b949e;">${deboardingDuration}m</span>
        </div>
        ${progressBar(deboardingProgress, '#f97316')}
      </div>
    `;
  }

  content += `
    <div style="padding: 0.35rem 0;">
      <div style="display: flex; justify-content: space-between; font-size: 0.85rem;">
        <span>Cleaning</span>
        <span style="color: #8b949e;">${cleaningDuration}m</span>
      </div>
      ${progressBar(cleaningProgress, '#06b6d4')}
    </div>
    <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #30363d;">
      <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600;">
        <span>Total Post-flight</span>
        <span style="color: #58a6ff;">${totalDuration}m</span>
      </div>
      ${progressBar(totalProgress, '#3b82f6')}
    </div>
  `;

  if (dCheckDue) {
    const releaseDate = addDaysToDate(scheduledDate, 60);
    content += `
      <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid #30363d;">
        <div style="font-weight: 600; margin-bottom: 0.5rem; color: #f85149;">Scheduled Heavy Maintenance</div>
        <div style="display: flex; justify-content: space-between; padding: 0.25rem 0; font-size: 0.85rem;">
          <span style="color: #f85149;">D Check</span>
          <span style="color: #8b949e;">60 days</span>
        </div>
        <div style="font-size: 0.85rem; color: #7ee787; margin-top: 0.25rem;">
          Release: ${formatDateShort(releaseDate)}
        </div>
      </div>
    `;
  } else if (cCheckDue) {
    const releaseDate = addDaysToDate(scheduledDate, 14);
    content += `
      <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid #30363d;">
        <div style="font-weight: 600; margin-bottom: 0.5rem; color: #a371f7;">Scheduled Heavy Maintenance</div>
        <div style="display: flex; justify-content: space-between; padding: 0.25rem 0; font-size: 0.85rem;">
          <span style="color: #a371f7;">C Check</span>
          <span style="color: #8b949e;">14 days</span>
        </div>
        <div style="font-size: 0.85rem; color: #7ee787; margin-top: 0.25rem;">
          Release: ${formatDateShort(releaseDate)}
        </div>
      </div>
    `;
  }

  // Calculate aircraft available time
  const hasTechStop = route.techStopAirport;
  const techStopMinutes = 30;
  const turnaroundMinutes = route.turnaroundTime || 45;
  let outboundMinutes = 0;
  let returnMinutes = 0;

  if (aircraft.aircraft && aircraft.aircraft.cruiseSpeed) {
    const cruiseSpeed = aircraft.aircraft.cruiseSpeed;
    const depLat = parseFloat(route.departureAirport?.latitude) || 0;
    const depLng = parseFloat(route.departureAirport?.longitude) || 0;
    const arrLat = parseFloat(route.arrivalAirport?.latitude) || 0;
    const arrLng = parseFloat(route.arrivalAirport?.longitude) || 0;

    if (hasTechStop) {
      const techLat = parseFloat(route.techStopAirport?.latitude) || 0;
      const techLng = parseFloat(route.techStopAirport?.longitude) || 0;
      const leg1Distance = route.legOneDistance || Math.round(route.distance * 0.4);
      const leg2Distance = route.legTwoDistance || Math.round(route.distance * 0.6);
      const leg1Minutes = calculateFlightMinutes(leg1Distance, cruiseSpeed, depLng, techLng, depLat, techLat);
      const leg2Minutes = calculateFlightMinutes(leg2Distance, cruiseSpeed, techLng, arrLng, techLat, arrLat);
      const leg3Minutes = calculateFlightMinutes(leg2Distance, cruiseSpeed, arrLng, techLng, arrLat, techLat);
      const leg4Minutes = calculateFlightMinutes(leg1Distance, cruiseSpeed, techLng, depLng, techLat, depLat);
      outboundMinutes = leg1Minutes + techStopMinutes + leg2Minutes;
      returnMinutes = leg3Minutes + techStopMinutes + leg4Minutes;
    } else {
      outboundMinutes = calculateFlightMinutes(route.distance, cruiseSpeed, depLng, arrLng, depLat, arrLat);
      returnMinutes = calculateFlightMinutes(route.distance, cruiseSpeed, arrLng, depLng, arrLat, depLat);
    }
  }

  const totalFlightMinutes = outboundMinutes + turnaroundMinutes + returnMinutes;
  const depTime = flight.departureTime.substring(0, 5);
  const [depH, depM] = depTime.split(':').map(Number);
  const depTotalMins = depH * 60 + depM;
  const arrHomeMins = depTotalMins + totalFlightMinutes;
  const availableMins = arrHomeMins + totalDuration;

  const formatTime = (totalMins) => {
    const roundedTotalMins = Math.round(totalMins / 5) * 5;
    const h = Math.floor((roundedTotalMins % 1440) / 60);
    const m = roundedTotalMins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // Add aircraft available info
  if (dCheckDue) {
    const releaseDate = addDaysToDate(scheduledDate, 60);
    content += `
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #8b949e; font-size: 0.85rem;">Aircraft Available:</span>
        <span style="color: #f85149; font-size: 0.85rem; font-weight: 600;">${formatDateShort(releaseDate)} (after D Check)</span>
      </div>
    `;
  } else if (cCheckDue) {
    const releaseDate = addDaysToDate(scheduledDate, 14);
    content += `
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #8b949e; font-size: 0.85rem;">Aircraft Available:</span>
        <span style="color: #a371f7; font-size: 0.85rem; font-weight: 600;">${formatDateShort(releaseDate)} (after C Check)</span>
      </div>
    `;
  } else {
    const availableDay = Math.floor(availableMins / 1440);
    let availableDateStr = scheduledDate;
    if (availableDay > 0) {
      availableDateStr = addDaysToDate(scheduledDate, availableDay);
    }
    content += `
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #8b949e; font-size: 0.85rem;">Aircraft Available:</span>
        <span style="color: #7ee787; font-size: 0.85rem; font-weight: 600;">${availableDay > 0 ? formatDateShort(availableDateStr) + ' ' : ''}${formatTime(availableMins)}</span>
      </div>
    `;
  }

  content += `</div>`;

  showTurnaroundModal('Post-flight Actions', content);
}

// Show turnaround modal
function showTurnaroundModal(title, content) {
  // Remove existing modal if any
  const existing = document.getElementById('turnaroundModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'turnaroundModal';
  modal.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(10, 15, 26, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2500;
    " onclick="closeTurnaroundModal()">
      <div style="
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 8px;
        min-width: 320px;
        max-width: 400px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      " onclick="event.stopPropagation()">
        <div style="padding: 1rem 1.5rem; border-bottom: 1px solid #30363d;">
          <h3 style="margin: 0; color: #f0f6fc; font-size: 1rem;">${title}</h3>
        </div>
        <div style="padding: 1.5rem;">
          ${content}
        </div>
        <div style="padding: 1rem 1.5rem; border-top: 1px solid #30363d; display: flex; justify-content: flex-end;">
          <button onclick="closeTurnaroundModal()" style="
            padding: 0.5rem 1rem;
            background: #21262d;
            border: 1px solid #30363d;
            border-radius: 6px;
            color: #c9d1d9;
            cursor: pointer;
            font-size: 0.9rem;
          ">Close</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

// Close turnaround modal
function closeTurnaroundModal() {
  const modal = document.getElementById('turnaroundModal');
  if (modal) modal.remove();
}

// View flight details - redirect to the detailed weekly modal
async function viewFlightDetails(flightId) {
  return viewFlightDetailsWeekly(flightId);
}

// Legacy view flight details (kept for reference)
async function viewFlightDetailsLegacy(flightId) {
  const flight = scheduledFlights.find(f => f.id === flightId);
  if (!flight) return;

  const route = flight.route;
  const aircraft = flight.aircraft;
  const hasTechStop = route.techStopAirport;

  // Get airport codes
  const depAirport = route.departureAirport.iataCode || route.departureAirport.icaoCode;
  const arrAirport = route.arrivalAirport.iataCode || route.arrivalAirport.icaoCode;
  const techAirport = hasTechStop ? (route.techStopAirport.iataCode || route.techStopAirport.icaoCode) : null;

  // Calculate flight times
  const techStopMinutes = 30;
  const turnaroundMinutes = route.turnaroundTime || 45;
  let outboundMinutes = 0;
  let returnMinutes = 0;
  let leg1Minutes = 0, leg2Minutes = 0, leg3Minutes = 0, leg4Minutes = 0;

  if (aircraft.aircraft && aircraft.aircraft.cruiseSpeed) {
    const cruiseSpeed = aircraft.aircraft.cruiseSpeed;
    const depLat = parseFloat(route.departureAirport?.latitude) || 0;
    const depLng = parseFloat(route.departureAirport?.longitude) || 0;
    const arrLat = parseFloat(route.arrivalAirport?.latitude) || 0;
    const arrLng = parseFloat(route.arrivalAirport?.longitude) || 0;

    if (hasTechStop) {
      const techLat = parseFloat(route.techStopAirport?.latitude) || 0;
      const techLng = parseFloat(route.techStopAirport?.longitude) || 0;
      const leg1Distance = route.legOneDistance || Math.round(route.distance * 0.4);
      const leg2Distance = route.legTwoDistance || Math.round(route.distance * 0.6);

      leg1Minutes = calculateFlightMinutes(leg1Distance, cruiseSpeed, depLng, techLng, depLat, techLat);
      leg2Minutes = calculateFlightMinutes(leg2Distance, cruiseSpeed, techLng, arrLng, techLat, arrLat);
      leg3Minutes = calculateFlightMinutes(leg2Distance, cruiseSpeed, arrLng, techLng, arrLat, techLat);
      leg4Minutes = calculateFlightMinutes(leg1Distance, cruiseSpeed, techLng, depLng, techLat, depLat);
      outboundMinutes = leg1Minutes + techStopMinutes + leg2Minutes;
      returnMinutes = leg3Minutes + techStopMinutes + leg4Minutes;
    } else {
      outboundMinutes = calculateFlightMinutes(route.distance, cruiseSpeed, depLng, arrLng, depLat, arrLat);
      returnMinutes = calculateFlightMinutes(route.distance, cruiseSpeed, arrLng, depLng, arrLat, depLat);
    }
  }

  const totalMinutes = outboundMinutes + turnaroundMinutes + returnMinutes;

  // Format time helper (rounded to nearest 5 mins, padded)
  const formatDuration = (mins) => {
    const roundedMins = Math.round(mins / 5) * 5;
    const h = Math.floor(roundedMins / 60);
    const m = roundedMins % 60;
    const mStr = String(m).padStart(2, '0');
    return h > 0 ? `${h}h ${mStr}m` : `${m}m`;
  };

  // Calculate arrival times
  const depTime = flight.departureTime.substring(0, 5);
  const [depH, depM] = depTime.split(':').map(Number);
  const depTotalMins = depH * 60 + depM;

  const arrAtDestMins = depTotalMins + outboundMinutes;
  const depReturnMins = arrAtDestMins + turnaroundMinutes;
  const arrHomeMins = depReturnMins + returnMinutes;

  const formatTime = (totalMins) => {
    // Round to nearest 5 minutes
    const roundedTotalMins = Math.round(totalMins / 5) * 5;
    const h = Math.floor((roundedTotalMins % 1440) / 60);
    const m = roundedTotalMins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // Build sector details HTML
  let sectorHtml = '';
  if (hasTechStop) {
    const techArr1Mins = depTotalMins + leg1Minutes;
    const techDep1Mins = techArr1Mins + techStopMinutes;
    const techArr2Mins = arrAtDestMins + turnaroundMinutes + leg3Minutes;
    const techDep2Mins = techArr2Mins + techStopMinutes;

    sectorHtml = `
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #30363d;">
        <div style="font-weight: 600; margin-bottom: 0.5rem; color: #58a6ff;">Outbound - ${route.routeNumber}</div>
        <div style="display: grid; grid-template-columns: auto 1fr auto; gap: 0.25rem 0.5rem; font-size: 0.85rem;">
          <span style="color: #ffa657;">${depAirport}→${techAirport}</span>
          <span style="color: #8b949e;">${depTime} → ${formatTime(techArr1Mins)}</span><span style="color: #7ee787;">${formatDuration(leg1Minutes)}</span>
          <span style="color: #22c55e;">Tech Stop (${techAirport})</span>
          <span style="color: #8b949e;">${formatTime(techArr1Mins)} → ${formatTime(techDep1Mins)}</span><span style="color: #ffa657;">${formatDuration(techStopMinutes)}</span>
          <span style="color: #ffa657;">${techAirport}→${arrAirport}</span>
          <span style="color: #8b949e;">${formatTime(techDep1Mins)} → ${formatTime(arrAtDestMins)}</span><span style="color: #7ee787;">${formatDuration(leg2Minutes)}</span>
        </div>
        <div style="font-weight: 600; margin: 0.75rem 0 0.5rem; color: #58a6ff;">Turnaround at ${arrAirport}</div>
        <div style="font-size: 0.85rem; color: #ffa657;">${formatDuration(turnaroundMinutes)}</div>
        <div style="font-weight: 600; margin: 0.75rem 0 0.5rem; color: #58a6ff;">Return - ${route.returnRouteNumber}</div>
        <div style="display: grid; grid-template-columns: auto 1fr auto; gap: 0.25rem 0.5rem; font-size: 0.85rem;">
          <span style="color: #ffa657;">${arrAirport}→${techAirport}</span>
          <span style="color: #8b949e;">${formatTime(depReturnMins)} → ${formatTime(techArr2Mins)}</span><span style="color: #7ee787;">${formatDuration(leg3Minutes)}</span>
          <span style="color: #22c55e;">Tech Stop (${techAirport})</span>
          <span style="color: #8b949e;">${formatTime(techArr2Mins)} → ${formatTime(techDep2Mins)}</span><span style="color: #ffa657;">${formatDuration(techStopMinutes)}</span>
          <span style="color: #ffa657;">${techAirport}→${depAirport}</span>
          <span style="color: #8b949e;">${formatTime(techDep2Mins)} → ${formatTime(arrHomeMins)}</span><span style="color: #7ee787;">${formatDuration(leg4Minutes)}</span>
        </div>
      </div>
    `;
  } else {
    sectorHtml = `
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #30363d;">
        <div style="font-weight: 600; margin-bottom: 0.5rem; color: #58a6ff;">Outbound - ${route.routeNumber}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.25rem 0.5rem; font-size: 0.85rem;">
          <span>${depAirport} → ${arrAirport}</span>
          <span style="color: #8b949e;">${depTime} → ${formatTime(arrAtDestMins)}</span>
          <span style="color: #7ee787;">${formatDuration(outboundMinutes)}</span>
        </div>
        <div style="font-weight: 600; margin: 0.75rem 0 0.5rem; color: #58a6ff;">Turnaround at ${arrAirport}</div>
        <div style="font-size: 0.85rem; color: #ffa657;">${formatDuration(turnaroundMinutes)}</div>
        <div style="font-weight: 600; margin: 0.75rem 0 0.5rem; color: #58a6ff;">Return - ${route.returnRouteNumber}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.25rem 0.5rem; font-size: 0.85rem;">
          <span>${arrAirport} → ${depAirport}</span>
          <span style="color: #8b949e;">${formatTime(depReturnMins)} → ${formatTime(arrHomeMins)}</span>
          <span style="color: #7ee787;">${formatDuration(returnMinutes)}</span>
        </div>
      </div>
    `;
  }

  // Calculate aircraft available time (after post-flight duties)
  const acType = aircraft.aircraft?.type || 'Narrowbody';
  const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;
  const scheduledDate = flight.scheduledDate;

  // Calculate post-flight duration (deboarding + cleaning)
  let deboardingDuration = 0;
  if (acType !== 'Cargo') {
    if (paxCapacity < 50) deboardingDuration = 5;
    else if (paxCapacity < 100) deboardingDuration = 8;
    else if (paxCapacity < 200) deboardingDuration = 12;
    else if (paxCapacity < 300) deboardingDuration = 15;
    else deboardingDuration = 20;
  }

  let cleaningDuration;
  if (paxCapacity < 50) cleaningDuration = 5;
  else if (paxCapacity < 100) cleaningDuration = 10;
  else if (paxCapacity < 200) cleaningDuration = 15;
  else if (paxCapacity < 300) cleaningDuration = 20;
  else cleaningDuration = 25;

  const postFlightDuration = deboardingDuration + cleaningDuration;
  const availableMins = arrHomeMins + postFlightDuration;

  // Check for heavy maintenance
  const cCheckDue = isHeavyCheckDue(aircraft, 'C', scheduledDate);
  const dCheckDue = isHeavyCheckDue(aircraft, 'D', scheduledDate);

  let availableHtml = '';
  if (dCheckDue) {
    const releaseDate = addDaysToDate(scheduledDate, 60);
    availableHtml = `
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #30363d;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #8b949e; font-size: 0.85rem;">Aircraft Available:</span>
          <span style="color: #f85149; font-size: 0.85rem; font-weight: 600;">${formatDateShort(releaseDate)} (after D Check)</span>
        </div>
      </div>
    `;
  } else if (cCheckDue) {
    const releaseDate = addDaysToDate(scheduledDate, 14);
    availableHtml = `
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #30363d;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #8b949e; font-size: 0.85rem;">Aircraft Available:</span>
          <span style="color: #a371f7; font-size: 0.85rem; font-weight: 600;">${formatDateShort(releaseDate)} (after C Check)</span>
        </div>
      </div>
    `;
  } else {
    // Calculate if goes into next day
    const availableDay = Math.floor(availableMins / 1440);
    let availableDateStr = scheduledDate;
    if (availableDay > 0) {
      availableDateStr = addDaysToDate(scheduledDate, availableDay);
    }
    availableHtml = `
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #30363d;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #8b949e; font-size: 0.85rem;">Aircraft Available:</span>
          <span style="color: #7ee787; font-size: 0.85rem; font-weight: 600;">${availableDay > 0 ? formatDateShort(availableDateStr) + ' ' : ''}${formatTime(availableMins)}</span>
        </div>
      </div>
    `;
  }

  // Check if aircraft is currently airborne (visible on map)
  const now = new Date();
  const nowStr = now.toISOString().split('T')[0];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Calculate actual flight times for today's check
  const flightDate = new Date(scheduledDate + 'T00:00:00');
  const isToday = nowStr === scheduledDate;

  // Check if on outbound flight (departure to arrival at destination)
  const outboundDepartureMin = depTotalMins;
  const outboundArrivalMin = arrAtDestMins;
  const isOnOutboundFlight = isToday && currentMinutes >= outboundDepartureMin && currentMinutes < outboundArrivalMin;

  // Check if on return flight (departure from destination to arrival home)
  const returnDepartureMin = depReturnMins;
  const returnArrivalMin = arrHomeMins;
  // Handle day overflow for return flight
  const returnSpansNextDay = returnArrivalMin >= 1440;
  let isOnReturnFlight = false;
  if (!returnSpansNextDay) {
    isOnReturnFlight = isToday && currentMinutes >= returnDepartureMin && currentMinutes < returnArrivalMin;
  } else {
    // Return spans midnight - check if we're either:
    // 1. On scheduled day after return departure
    // 2. On next day before return arrival
    const nextDay = new Date(flightDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split('T')[0];
    isOnReturnFlight = (isToday && currentMinutes >= returnDepartureMin) ||
                       (nowStr === nextDayStr && currentMinutes < (returnArrivalMin - 1440));
  }

  const isAirborne = isOnOutboundFlight || isOnReturnFlight;

  // Create and show custom modal
  const modalHtml = `
    <div id="flightDetailsModal" onclick="closeFlightDetailsModal()" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    ">
      <div onclick="event.stopPropagation()" style="
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 8px;
        min-width: 400px;
        max-width: 500px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      ">
        <div style="padding: 1rem 1.5rem; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; color: #f0f6fc; font-size: 1.1rem;">Flight Details</h3>
          <button onclick="closeFlightDetailsModal()" style="background: none; border: none; color: #8b949e; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
        </div>
        <div style="padding: 1.5rem;">
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem; font-size: 0.9rem;">
            <span style="color: #8b949e;">Route:</span>
            <span style="color: #f0f6fc; font-weight: 600;">${route.routeNumber} / ${route.returnRouteNumber}</span>
            <span style="color: #8b949e;">Aircraft:</span>
            <span style="color: #f0f6fc;">${aircraft.registration} (${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model})</span>
            <span style="color: #8b949e;">Date:</span>
            <span style="color: #f0f6fc;">${flight.scheduledDate}</span>
            <span style="color: #8b949e;">Block Time:</span>
            <span style="color: #f0f6fc;">${depTime} → ${formatTime(arrHomeMins)} (${formatDuration(totalMinutes)})</span>
          </div>
          ${sectorHtml}
          ${availableHtml}
        </div>
        <div style="padding: 1rem 1.5rem; border-top: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center;">
          <button onclick="window.location.href='#'" style="
            padding: 0.5rem 1rem;
            background: #238636;
            border: 1px solid #2ea043;
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
          ">Financial Stats</button>
          <div style="display: flex; gap: 0.75rem;">
            ${isAirborne ? `<button onclick="showAircraftOnMap('${aircraft.registration}')" style="
              padding: 0.5rem 1rem;
              background: #1f6feb;
              border: 1px solid #388bfd;
              border-radius: 6px;
              color: white;
              cursor: pointer;
              font-size: 0.9rem;
              font-weight: 500;
            ">Show on Map</button>` : ''}
            <button onclick="closeFlightDetailsModal()" style="
              padding: 0.5rem 1rem;
              background: #21262d;
              border: 1px solid #30363d;
              border-radius: 6px;
              color: #c9d1d9;
              cursor: pointer;
              font-size: 0.9rem;
            ">Close</button>
            <button onclick="removeFlightFromModal('${flightId}')" style="
              padding: 0.5rem 1rem;
              background: #da3633;
              border: 1px solid #f85149;
              border-radius: 6px;
              color: white;
              cursor: pointer;
              font-size: 0.9rem;
              font-weight: 500;
            ">Remove from Schedule</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if any
  const existingModal = document.getElementById('flightDetailsModal');
  if (existingModal) existingModal.remove();

  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeFlightDetailsModal() {
  // Clear the update interval if running
  if (flightDetailsUpdateInterval) {
    clearInterval(flightDetailsUpdateInterval);
    flightDetailsUpdateInterval = null;
  }
  const modal = document.getElementById('flightDetailsModal');
  if (modal) modal.remove();
}

// Navigate to world map and focus on aircraft
function showAircraftOnMap(registration) {
  window.location.href = `/world-map?aircraft=${encodeURIComponent(registration)}`;
}

// View flight details for weekly view (includes turnaround details)
async function viewFlightDetailsWeekly(flightId) {
  const flight = scheduledFlights.find(f => f.id === flightId);
  if (!flight) return;

  const route = flight.route;
  const aircraft = flight.aircraft;
  const hasTechStop = route.techStopAirport;
  const acType = aircraft.aircraft?.type || 'Narrowbody';
  const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;
  const scheduledDate = flight.scheduledDate;
  // Format date as DD/MM/YYYY
  const dateParts = scheduledDate.split('-');
  const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

  // Get airport codes
  const depAirport = route.departureAirport.iataCode || route.departureAirport.icaoCode;
  const arrAirport = route.arrivalAirport.iataCode || route.arrivalAirport.icaoCode;
  const techAirport = hasTechStop ? (route.techStopAirport.iataCode || route.techStopAirport.icaoCode) : null;

  // Calculate flight times
  const techStopMinutes = 30;
  const turnaroundMinutes = route.turnaroundTime || 45;
  let outboundMinutes = 0;
  let returnMinutes = 0;

  // Tech stop leg times (used for progress tracking)
  let leg1Minutes = 0, leg2Minutes = 0, leg3Minutes = 0, leg4Minutes = 0;

  if (aircraft.aircraft && aircraft.aircraft.cruiseSpeed) {
    const cruiseSpeed = aircraft.aircraft.cruiseSpeed;
    const depLat = parseFloat(route.departureAirport?.latitude) || 0;
    const depLng = parseFloat(route.departureAirport?.longitude) || 0;
    const arrLat = parseFloat(route.arrivalAirport?.latitude) || 0;
    const arrLng = parseFloat(route.arrivalAirport?.longitude) || 0;

    if (hasTechStop) {
      const techLat = parseFloat(route.techStopAirport?.latitude) || 0;
      const techLng = parseFloat(route.techStopAirport?.longitude) || 0;
      const leg1Distance = route.legOneDistance || Math.round(route.distance * 0.4);
      const leg2Distance = route.legTwoDistance || Math.round(route.distance * 0.6);

      leg1Minutes = calculateFlightMinutes(leg1Distance, cruiseSpeed, depLng, techLng, depLat, techLat);
      leg2Minutes = calculateFlightMinutes(leg2Distance, cruiseSpeed, techLng, arrLng, techLat, arrLat);
      leg3Minutes = calculateFlightMinutes(leg2Distance, cruiseSpeed, arrLng, techLng, arrLat, techLat);
      leg4Minutes = calculateFlightMinutes(leg1Distance, cruiseSpeed, techLng, depLng, techLat, depLat);
      outboundMinutes = leg1Minutes + techStopMinutes + leg2Minutes;
      returnMinutes = leg3Minutes + techStopMinutes + leg4Minutes;
    } else {
      outboundMinutes = calculateFlightMinutes(route.distance, cruiseSpeed, depLng, arrLng, depLat, arrLat);
      returnMinutes = calculateFlightMinutes(route.distance, cruiseSpeed, arrLng, depLng, arrLat, depLat);
    }
  }

  const totalMinutes = outboundMinutes + turnaroundMinutes + returnMinutes;

  const formatDuration = (mins) => {
    const roundedMins = Math.round(mins / 5) * 5;
    const h = Math.floor(roundedMins / 60);
    const m = roundedMins % 60;
    const mStr = String(m).padStart(2, '0');
    return h > 0 ? `${h}h ${mStr}m` : `${m}m`;
  };

  const depTime = flight.departureTime.substring(0, 5);
  const [depH, depM] = depTime.split(':').map(Number);
  const depTotalMins = depH * 60 + depM;
  const arrAtDestMins = depTotalMins + outboundMinutes;
  const depReturnMins = arrAtDestMins + turnaroundMinutes;
  const arrHomeMins = depReturnMins + returnMinutes;


  const formatTime = (totalMins) => {
    const roundedTotalMins = Math.round(totalMins / 5) * 5;
    const h = Math.floor((roundedTotalMins % 1440) / 60);
    const m = roundedTotalMins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // Calculate pre-flight durations (same for both sectors)
  let cateringDuration = 0;
  if (paxCapacity >= 50 && acType !== 'Cargo') {
    if (paxCapacity < 100) cateringDuration = 5;
    else if (paxCapacity < 200) cateringDuration = 10;
    else cateringDuration = 15;
  }

  // Boarding duration (10-35 mins based on capacity) - starts after catering
  let boardingDuration = 0;
  if (acType !== 'Cargo') {
    if (paxCapacity < 50) boardingDuration = 10;
    else if (paxCapacity < 100) boardingDuration = 15;
    else if (paxCapacity < 200) boardingDuration = 20;
    else if (paxCapacity < 300) boardingDuration = 25;
    else boardingDuration = 35;
  }

  const distance = route?.distance || 0;
  let fuellingDuration = 0;
  if (distance < 500) fuellingDuration = 10;
  else if (distance < 1500) fuellingDuration = 15;
  else if (distance < 3000) fuellingDuration = 20;
  else fuellingDuration = 25;

  // Catering + boarding in sequence, fuelling in parallel
  const preFlightTotal = Math.max(cateringDuration + boardingDuration, fuellingDuration);

  // Calculate post-flight durations (same for both sectors)
  let deboardingDuration = 0;
  if (acType !== 'Cargo') {
    if (paxCapacity < 50) deboardingDuration = 5;
    else if (paxCapacity < 100) deboardingDuration = 8;
    else if (paxCapacity < 200) deboardingDuration = 12;
    else if (paxCapacity < 300) deboardingDuration = 15;
    else deboardingDuration = 20;
  }

  let cleaningDuration;
  if (paxCapacity < 50) cleaningDuration = 5;
  else if (paxCapacity < 100) cleaningDuration = 10;
  else if (paxCapacity < 200) cleaningDuration = 15;
  else if (paxCapacity < 300) cleaningDuration = 20;
  else cleaningDuration = 25;

  const postFlightTotal = deboardingDuration + cleaningDuration;

  // Check for heavy maintenance
  const cCheckDue = isHeavyCheckDue(aircraft, 'C', scheduledDate);
  const dCheckDue = isHeavyCheckDue(aircraft, 'D', scheduledDate);

  // Calculate all phase times - MUST match display times for consistency
  const now = typeof window.getGlobalWorldTime === 'function' ? window.getGlobalWorldTime() : new Date();
  const [year, month, day] = scheduledDate.split('-').map(Number);
  const departureDateTime = new Date(Date.UTC(year, month - 1, day, depH, depM));

  // Outbound sector times
  const outboundPreFlightStart = new Date(departureDateTime.getTime() - preFlightTotal * 60000);
  const outboundDepartureTime = departureDateTime;
  const outboundArrivalTime = new Date(departureDateTime.getTime() + outboundMinutes * 60000);

  // Return departs at arrAtDestMins + turnaroundMinutes (same as display shows)
  const returnDepartureTime = new Date(outboundArrivalTime.getTime() + turnaroundMinutes * 60000);
  const returnArrivalTime = new Date(returnDepartureTime.getTime() + returnMinutes * 60000);
  const returnPostFlightEnd = new Date(returnArrivalTime.getTime() + postFlightTotal * 60000);

  // For progress calculations: return pre-flight starts after outbound post-flight
  // Cap post-flight at turnaround time to ensure pre-flight doesn't start after return departure
  const effectivePostFlightAtDest = Math.min(postFlightTotal, turnaroundMinutes);
  const returnPreFlightStart = new Date(outboundArrivalTime.getTime() + effectivePostFlightAtDest * 60000);

  // Total operation time
  const totalOperationMs = returnPostFlightEnd.getTime() - outboundPreFlightStart.getTime();
  const totalOperationMins = totalOperationMs / 60000;

  // Overall flight progress
  const overallElapsedMs = now.getTime() - outboundPreFlightStart.getTime();
  const overallProgress = Math.max(0, Math.min(100, Math.round((overallElapsedMs / totalOperationMs) * 100)));

  // Helper to calculate progress for a phase
  const calcPhaseProgress = (phaseStartTime, phaseDurationMins) => {
    const phaseStartMs = phaseStartTime.getTime();
    const phaseDurationMs = phaseDurationMins * 60000;
    const elapsedMs = now.getTime() - phaseStartMs;
    if (elapsedMs < 0) return 0;
    if (elapsedMs >= phaseDurationMs) return 100;
    return Math.round((elapsedMs / phaseDurationMs) * 100);
  };

  // Outbound pre-flight progress
  const outPreFlightProgress = calcPhaseProgress(outboundPreFlightStart, preFlightTotal);
  const outCateringProgress = cateringDuration > 0 ? calcPhaseProgress(outboundPreFlightStart, cateringDuration) : 100;
  const outBoardingProgress = boardingDuration > 0 ? calcPhaseProgress(new Date(outboundPreFlightStart.getTime() + cateringDuration * 60000), boardingDuration) : 100;
  const outFuellingProgress = calcPhaseProgress(outboundPreFlightStart, fuellingDuration);

  // Outbound flight progress
  const outFlightProgress = calcPhaseProgress(outboundDepartureTime, outboundMinutes);

  // Outbound post-flight progress
  const outPostFlightProgress = calcPhaseProgress(outboundArrivalTime, postFlightTotal);
  const outDeboardingProgress = deboardingDuration > 0 ? calcPhaseProgress(outboundArrivalTime, deboardingDuration) : 100;
  const outCleaningProgress = calcPhaseProgress(new Date(outboundArrivalTime.getTime() + deboardingDuration * 60000), cleaningDuration);

  // Return pre-flight progress
  const retPreFlightProgress = calcPhaseProgress(returnPreFlightStart, preFlightTotal);
  const retCateringProgress = cateringDuration > 0 ? calcPhaseProgress(returnPreFlightStart, cateringDuration) : 100;
  const retBoardingProgress = boardingDuration > 0 ? calcPhaseProgress(new Date(returnPreFlightStart.getTime() + cateringDuration * 60000), boardingDuration) : 100;
  const retFuellingProgress = calcPhaseProgress(returnPreFlightStart, fuellingDuration);

  // Return flight progress
  const retFlightProgress = calcPhaseProgress(returnDepartureTime, returnMinutes);

  // Return post-flight progress
  const retPostFlightProgress = calcPhaseProgress(returnArrivalTime, postFlightTotal);
  const retDeboardingProgress = deboardingDuration > 0 ? calcPhaseProgress(returnArrivalTime, deboardingDuration) : 100;
  const retCleaningProgress = calcPhaseProgress(new Date(returnArrivalTime.getTime() + deboardingDuration * 60000), cleaningDuration);

  // Tech stop progress (for routes with tech stops)
  let outLeg1Progress = 0, outTechStopProgress = 0, outLeg2Progress = 0;
  let retLeg3Progress = 0, retTechStopProgress = 0, retLeg4Progress = 0;
  if (hasTechStop) {
    // Outbound leg times
    const outLeg1Start = outboundDepartureTime;
    const outTechStopStart = new Date(outLeg1Start.getTime() + leg1Minutes * 60000);
    const outLeg2Start = new Date(outTechStopStart.getTime() + techStopMinutes * 60000);
    outLeg1Progress = calcPhaseProgress(outLeg1Start, leg1Minutes);
    outTechStopProgress = calcPhaseProgress(outTechStopStart, techStopMinutes);
    outLeg2Progress = calcPhaseProgress(outLeg2Start, leg2Minutes);

    // Return leg times
    const retLeg3Start = returnDepartureTime;
    const retTechStopStart = new Date(retLeg3Start.getTime() + leg3Minutes * 60000);
    const retLeg4Start = new Date(retTechStopStart.getTime() + techStopMinutes * 60000);
    retLeg3Progress = calcPhaseProgress(retLeg3Start, leg3Minutes);
    retTechStopProgress = calcPhaseProgress(retTechStopStart, techStopMinutes);
    retLeg4Progress = calcPhaseProgress(retLeg4Start, leg4Minutes);
  }

  // Helper to build progress bar HTML with optional ID for live updates
  const progressBar = (progress, color, height = '4px', id = null) => `
    <div style="display: flex; align-items: center; gap: 0.4rem; margin-top: 0.1rem;">
      <div style="flex: 1; height: ${height}; background: #21262d; border-radius: 2px; overflow: hidden;">
        <div ${id ? `id="${id}-bar"` : ''} style="width: ${progress}%; height: 100%; background: ${color}; border-radius: 2px; transition: width 0.3s;"></div>
      </div>
      <span ${id ? `id="${id}-pct"` : ''} style="color: ${progress === 100 ? '#7ee787' : '#8b949e'}; font-size: 0.65rem; min-width: 28px; text-align: right;">${progress}%</span>
    </div>
  `;

  // Helper to build a single action row with blur when complete
  const actionRow = (label, duration, progress, color, id) => {
    const isComplete = progress === 100;
    const style = isComplete ? 'opacity: 0.35; filter: blur(0.5px);' : '';
    return `<div id="${id}-row" style="margin-bottom: 0.2rem; ${style}"><div style="display: flex; justify-content: space-between;"><span>${label}</span><span style="color: #8b949e;">${duration}m</span></div>${progressBar(progress, color, '4px', id)}</div>`;
  };

  // Helper to build pre-flight section with IDs for live updates
  const buildPreFlightSection = (cateringProg, boardingProg, fuellingProg, totalProg, prefix) => {
    const allComplete = totalProg === 100;
    const headerStyle = allComplete ? 'opacity: 0.4;' : '';
    return `
    <div style="flex: 1; min-width: 140px;">
      <div id="${prefix}-header" style="font-weight: 600; margin-bottom: 0.4rem; color: #3fb950; font-size: 0.75rem; ${headerStyle}">PRE-FLIGHT${allComplete ? ' ✓' : ''}</div>
      <div style="font-size: 0.75rem;">
        ${cateringDuration > 0 ? actionRow('Catering', cateringDuration, cateringProg, '#3fb950', `${prefix}-catering`) : ''}
        ${boardingDuration > 0 ? actionRow('Boarding', boardingDuration, boardingProg, '#3fb950', `${prefix}-boarding`) : ''}
        ${actionRow('Fuelling', fuellingDuration, fuellingProg, '#3fb950', `${prefix}-fuelling`)}
      </div>
    </div>
  `;
  };

  // Helper to build post-flight section with IDs for live updates
  const buildPostFlightSection = (deboardingProg, cleaningProg, totalProg, prefix) => {
    const allComplete = totalProg === 100;
    const headerStyle = allComplete ? 'opacity: 0.4;' : '';
    return `
    <div style="flex: 1; min-width: 140px;">
      <div id="${prefix}-header" style="font-weight: 600; margin-bottom: 0.4rem; color: #58a6ff; font-size: 0.75rem; ${headerStyle}">POST-FLIGHT${allComplete ? ' ✓' : ''}</div>
      <div style="font-size: 0.75rem;">
        ${deboardingDuration > 0 ? actionRow('Deboarding', deboardingDuration, deboardingProg, '#58a6ff', `${prefix}-deboard`) : ''}
        ${actionRow('Cleaning', cleaningDuration, cleaningProg, '#58a6ff', `${prefix}-cleaning`)}
      </div>
    </div>
  `;
  };

  // Build maintenance info if applicable
  let maintenanceHtml = '';
  if (dCheckDue) {
    const releaseDate = addDaysToDate(scheduledDate, 60);
    maintenanceHtml = `
      <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(248, 81, 73, 0.1); border: 1px solid #f85149; border-radius: 6px;">
        <div style="font-weight: 600; color: #f85149; font-size: 0.85rem;">D Check Scheduled</div>
        <div style="font-size: 0.8rem; color: #8b949e; margin-top: 0.25rem;">Duration: 60 days • Release: <span style="color: #7ee787;">${formatDateShort(releaseDate)}</span></div>
      </div>
    `;
  } else if (cCheckDue) {
    const releaseDate = addDaysToDate(scheduledDate, 14);
    maintenanceHtml = `
      <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(163, 113, 247, 0.1); border: 1px solid #a371f7; border-radius: 6px;">
        <div style="font-weight: 600; color: #a371f7; font-size: 0.85rem;">C Check Scheduled</div>
        <div style="font-size: 0.8rem; color: #8b949e; margin-top: 0.25rem;">Duration: 14 days • Release: <span style="color: #7ee787;">${formatDateShort(releaseDate)}</span></div>
      </div>
    `;
  }

  // Calculate aircraft available time
  const availableMins = arrHomeMins + postFlightTotal;
  let availableText = '';
  if (dCheckDue) {
    const releaseDate = addDaysToDate(scheduledDate, 60);
    availableText = `<span style="color: #f85149;">${formatDateShort(releaseDate)} (after D Check)</span>`;
  } else if (cCheckDue) {
    const releaseDate = addDaysToDate(scheduledDate, 14);
    availableText = `<span style="color: #a371f7;">${formatDateShort(releaseDate)} (after C Check)</span>`;
  } else {
    const availableDay = Math.floor(availableMins / 1440);
    let availableDateStr = scheduledDate;
    if (availableDay > 0) {
      availableDateStr = addDaysToDate(scheduledDate, availableDay);
    }
    availableText = `<span style="color: #7ee787;">${availableDay > 0 ? formatDateShort(availableDateStr) + ' ' : ''}${formatTime(availableMins)}</span>`;
  }

  // Check if aircraft is currently airborne (visible on map)
  const isOnOutboundFlight = now >= outboundDepartureTime && now < outboundArrivalTime;
  const isOnReturnFlight = now >= returnDepartureTime && now < returnArrivalTime;
  const isAirborne = isOnOutboundFlight || isOnReturnFlight;

  // Create and show custom modal
  const modalHtml = `
    <div id="flightDetailsModal" onclick="closeFlightDetailsModal()" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    ">
      <div onclick="event.stopPropagation()" style="
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 8px;
        width: 850px;
        max-width: 95vw;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      ">
        <div style="padding: 1rem 1.5rem; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; color: #f0f6fc; font-size: 1.1rem;">Flight Details - ${route.routeNumber} / ${route.returnRouteNumber}</h3>
          <button onclick="closeFlightDetailsModal()" style="background: none; border: none; color: #8b949e; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
        </div>
        <div style="padding: 1.25rem;">
          <!-- Header info row -->
          <div style="display: flex; gap: 2rem; margin-bottom: 1rem; font-size: 0.85rem; flex-wrap: wrap;">
            <div><span style="color: #8b949e;">Aircraft:</span> <span style="color: #f0f6fc; font-weight: 600;">${aircraft.registration}</span> <span style="color: #8b949e;">(${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model})</span></div>
            <div><span style="color: #8b949e;">Date:</span> <span style="color: #f0f6fc;">${formattedDate}</span></div>
            <div><span style="color: #8b949e;">Flight Time:</span> <span style="color: #7ee787; font-weight: 600;">${formatDuration(totalMinutes)}</span></div>
            <div><span style="color: #8b949e;">Total Operation:</span> <span style="color: #ffa657; font-weight: 600;">${formatDuration(totalOperationMins)}</span></div>
          </div>

          <!-- Overall progress bar -->
          <div style="margin-bottom: 1.25rem; padding: 0.75rem; background: #21262d; border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span style="color: #f0f6fc; font-weight: 600; font-size: 0.85rem;">Overall Flight Progress</span>
              <span id="overall-pct" style="color: ${overallProgress === 100 ? '#7ee787' : '#ffa657'}; font-weight: 600; font-size: 0.9rem;">${overallProgress}%</span>
            </div>
            <div style="height: 8px; background: #30363d; border-radius: 4px; overflow: hidden;">
              <div id="overall-bar" style="width: ${overallProgress}%; height: 100%; background: linear-gradient(90deg, #3fb950, #58a6ff); border-radius: 4px; transition: width 0.3s;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 0.4rem; font-size: 0.7rem; color: #8b949e;">
              <span>${formatTime(depTotalMins - preFlightTotal)}</span>
              <span>Aircraft Available: ${availableText}</span>
            </div>
          </div>

          <!-- Two sector columns -->
          <div style="display: flex; gap: 1.5rem;">
            <!-- Outbound Sector -->
            <div style="flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 1rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid #30363d;">
                <div>
                  <div style="font-weight: 700; color: #58a6ff; font-size: 0.9rem;">OUTBOUND</div>
                  <div style="color: #8b949e; font-size: 0.75rem;">${route.routeNumber}</div>
                </div>
                <div style="text-align: right;">
                  <div style="color: #f0f6fc; font-weight: 600;">${depAirport} ${hasTechStop ? `→ <span style="color: #22c55e;">${techAirport}</span> ` : ''}→ ${arrAirport}</div>
                  <div style="color: #8b949e; font-size: 0.8rem;">${depTime} → ${formatTime(arrAtDestMins)}</div>
                </div>
              </div>

              <!-- Flight progress -->
              <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: #161b22; border-radius: 4px;">
                ${hasTechStop ? `
                  <!-- Leg 1 -->
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-bottom: 0.25rem;">
                    <span style="color: #ffa657; font-weight: 600;">${depAirport}→${techAirport}</span>
                    <span style="color: #7ee787;">${formatDuration(leg1Minutes)}</span>
                  </div>
                  ${progressBar(outLeg1Progress, '#ffa657', '4px', 'out-leg1')}
                  <!-- Tech Stop Fuel -->
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-top: 0.4rem; margin-bottom: 0.25rem;">
                    <span style="color: #22c55e; font-weight: 600;">Tech Stop <span style="color: #8b949e; font-weight: 400;">(${techAirport})</span></span>
                    <span style="color: #7ee787;">${techStopMinutes}m</span>
                  </div>
                  ${progressBar(outTechStopProgress, '#22c55e', '4px', 'out-tech')}
                  <!-- Leg 2 -->
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-top: 0.4rem; margin-bottom: 0.25rem;">
                    <span style="color: #ffa657; font-weight: 600;">${techAirport}→${arrAirport}</span>
                    <span style="color: #7ee787;">${formatDuration(leg2Minutes)}</span>
                  </div>
                  ${progressBar(outLeg2Progress, '#ffa657', '4px', 'out-leg2')}
                  <!-- Total -->
                  <div style="margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px solid #30363d;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
                      <span style="color: #58a6ff; font-weight: 600;">Total Flight</span>
                      <span style="color: #7ee787;">${formatDuration(outboundMinutes)}</span>
                    </div>
                    ${progressBar(outFlightProgress, '#58a6ff', '6px', 'out-flight')}
                  </div>
                ` : `
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
                    <span style="color: #ffa657; font-weight: 600;">Flight</span>
                    <span style="color: #7ee787;">${formatDuration(outboundMinutes)}</span>
                  </div>
                  ${progressBar(outFlightProgress, '#ffa657', '6px', 'out-flight')}
                `}
              </div>

              <!-- Pre and Post flight side by side -->
              <div style="display: flex; gap: 0.75rem;">
                ${buildPreFlightSection(outCateringProgress, outBoardingProgress, outFuellingProgress, outPreFlightProgress, 'out-pre')}
                ${buildPostFlightSection(outDeboardingProgress, outCleaningProgress, outPostFlightProgress, 'out-post')}
              </div>
            </div>

            <!-- Return Sector -->
            <div style="flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 1rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid #30363d;">
                <div>
                  <div style="font-weight: 700; color: #a855f7; font-size: 0.9rem;">RETURN</div>
                  <div style="color: #8b949e; font-size: 0.75rem;">${route.returnRouteNumber}</div>
                </div>
                <div style="text-align: right;">
                  <div style="color: #f0f6fc; font-weight: 600;">${arrAirport} ${hasTechStop ? `→ <span style="color: #22c55e;">${techAirport}</span> ` : ''}→ ${depAirport}</div>
                  <div style="color: #8b949e; font-size: 0.8rem;">${formatTime(depReturnMins)} → ${formatTime(arrHomeMins)}</div>
                </div>
              </div>

              <!-- Flight progress -->
              <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: #161b22; border-radius: 4px;">
                ${hasTechStop ? `
                  <!-- Leg 3 -->
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-bottom: 0.25rem;">
                    <span style="color: #ffa657; font-weight: 600;">${arrAirport}→${techAirport}</span>
                    <span style="color: #7ee787;">${formatDuration(leg3Minutes)}</span>
                  </div>
                  ${progressBar(retLeg3Progress, '#ffa657', '4px', 'ret-leg3')}
                  <!-- Tech Stop Fuel -->
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-top: 0.4rem; margin-bottom: 0.25rem;">
                    <span style="color: #22c55e; font-weight: 600;">Tech Stop <span style="color: #8b949e; font-weight: 400;">(${techAirport})</span></span>
                    <span style="color: #7ee787;">${techStopMinutes}m</span>
                  </div>
                  ${progressBar(retTechStopProgress, '#22c55e', '4px', 'ret-tech')}
                  <!-- Leg 4 -->
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-top: 0.4rem; margin-bottom: 0.25rem;">
                    <span style="color: #ffa657; font-weight: 600;">${techAirport}→${depAirport}</span>
                    <span style="color: #7ee787;">${formatDuration(leg4Minutes)}</span>
                  </div>
                  ${progressBar(retLeg4Progress, '#ffa657', '4px', 'ret-leg4')}
                  <!-- Total -->
                  <div style="margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px solid #30363d;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
                      <span style="color: #58a6ff; font-weight: 600;">Total Flight</span>
                      <span style="color: #7ee787;">${formatDuration(returnMinutes)}</span>
                    </div>
                    ${progressBar(retFlightProgress, '#58a6ff', '6px', 'ret-flight')}
                  </div>
                ` : `
                  <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
                    <span style="color: #ffa657; font-weight: 600;">Flight</span>
                    <span style="color: #7ee787;">${formatDuration(returnMinutes)}</span>
                  </div>
                  ${progressBar(retFlightProgress, '#ffa657', '6px', 'ret-flight')}
                `}
              </div>

              <!-- Pre and Post flight side by side -->
              <div style="display: flex; gap: 0.75rem;">
                ${buildPreFlightSection(retCateringProgress, retBoardingProgress, retFuellingProgress, retPreFlightProgress, 'ret-pre')}
                ${buildPostFlightSection(retDeboardingProgress, retCleaningProgress, retPostFlightProgress, 'ret-post')}
              </div>
            </div>
          </div>

          ${maintenanceHtml}
        </div>
        <div style="padding: 1rem 1.5rem; border-top: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center;">
          <button onclick="window.location.href='#'" style="
            padding: 0.5rem 1rem;
            background: #238636;
            border: 1px solid #2ea043;
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
          ">Financial Stats</button>
          <div style="display: flex; gap: 0.75rem;">
            ${isAirborne ? `<button onclick="showAircraftOnMap('${aircraft.registration}')" style="
              padding: 0.5rem 1rem;
              background: #1f6feb;
              border: 1px solid #388bfd;
              border-radius: 6px;
              color: white;
              cursor: pointer;
              font-size: 0.9rem;
              font-weight: 500;
            ">Show on Map</button>` : ''}
            <button onclick="closeFlightDetailsModal()" style="
              padding: 0.5rem 1rem;
              background: #21262d;
              border: 1px solid #30363d;
              border-radius: 6px;
              color: #c9d1d9;
              cursor: pointer;
              font-size: 0.9rem;
            ">Close</button>
            <button onclick="removeFlightFromModal('${flightId}')" style="
              padding: 0.5rem 1rem;
              background: #da3633;
              border: 1px solid #f85149;
              border-radius: 6px;
              color: white;
              cursor: pointer;
              font-size: 0.9rem;
              font-weight: 500;
            ">Remove from Schedule</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if any
  const existingModal = document.getElementById('flightDetailsModal');
  if (existingModal) existingModal.remove();

  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Clear any existing interval
  if (flightDetailsUpdateInterval) {
    clearInterval(flightDetailsUpdateInterval);
  }

  // Helper to update a progress bar element and apply blur when complete
  const updateProgressBar = (id, progress) => {
    const bar = document.getElementById(`${id}-bar`);
    const pct = document.getElementById(`${id}-pct`);
    const row = document.getElementById(`${id}-row`);
    if (bar) bar.style.width = `${progress}%`;
    if (pct) {
      pct.textContent = `${progress}%`;
      pct.style.color = progress === 100 ? '#7ee787' : '#8b949e';
    }
    // Apply blur effect to completed action rows
    if (row) {
      if (progress === 100) {
        row.style.opacity = '0.35';
        row.style.filter = 'blur(0.5px)';
      } else {
        row.style.opacity = '1';
        row.style.filter = 'none';
      }
    }
  };

  // Helper to update section header when section completes
  const updateSectionComplete = (prefix, isComplete) => {
    const header = document.getElementById(`${prefix}-header`);
    if (header) {
      header.style.opacity = isComplete ? '0.4' : '1';
      const label = prefix.includes('pre') ? 'PRE-FLIGHT' : 'POST-FLIGHT';
      header.innerHTML = isComplete ? `${label} ✓` : label;
    }
  };

  // Set up interval to update progress every second
  flightDetailsUpdateInterval = setInterval(() => {
    // Check if modal still exists
    if (!document.getElementById('flightDetailsModal')) {
      clearInterval(flightDetailsUpdateInterval);
      flightDetailsUpdateInterval = null;
      return;
    }

    // Get current world time
    const now = typeof window.getGlobalWorldTime === 'function' ? window.getGlobalWorldTime() : new Date();

    // Recalculate overall progress
    const overallElapsedMs = now.getTime() - outboundPreFlightStart.getTime();
    const newOverallProgress = Math.max(0, Math.min(100, Math.round((overallElapsedMs / totalOperationMs) * 100)));

    // Update overall progress bar
    const overallBar = document.getElementById('overall-bar');
    const overallPct = document.getElementById('overall-pct');
    if (overallBar) overallBar.style.width = `${newOverallProgress}%`;
    if (overallPct) {
      overallPct.textContent = `${newOverallProgress}%`;
      overallPct.style.color = newOverallProgress === 100 ? '#7ee787' : '#ffa657';
    }

    // Helper to calculate phase progress (same logic as above)
    const calcProgress = (phaseStartTime, phaseDurationMins) => {
      const phaseStartMs = phaseStartTime.getTime();
      const phaseDurationMs = phaseDurationMins * 60000;
      const elapsedMs = now.getTime() - phaseStartMs;
      if (elapsedMs < 0) return 0;
      if (elapsedMs >= phaseDurationMs) return 100;
      return Math.round((elapsedMs / phaseDurationMs) * 100);
    };

    // Outbound pre-flight
    if (cateringDuration > 0) updateProgressBar('out-pre-catering', calcProgress(outboundPreFlightStart, cateringDuration));
    if (boardingDuration > 0) updateProgressBar('out-pre-boarding', calcProgress(new Date(outboundPreFlightStart.getTime() + cateringDuration * 60000), boardingDuration));
    updateProgressBar('out-pre-fuelling', calcProgress(outboundPreFlightStart, fuellingDuration));
    const outPreTotal = calcProgress(outboundPreFlightStart, preFlightTotal);
    updateSectionComplete('out-pre', outPreTotal === 100);

    // Outbound flight
    updateProgressBar('out-flight', calcProgress(outboundDepartureTime, outboundMinutes));

    // Outbound tech stop legs (if applicable)
    if (hasTechStop) {
      const outLeg1Start = outboundDepartureTime;
      const outTechStopStart = new Date(outLeg1Start.getTime() + leg1Minutes * 60000);
      const outLeg2Start = new Date(outTechStopStart.getTime() + techStopMinutes * 60000);
      updateProgressBar('out-leg1', calcProgress(outLeg1Start, leg1Minutes));
      updateProgressBar('out-tech', calcProgress(outTechStopStart, techStopMinutes));
      updateProgressBar('out-leg2', calcProgress(outLeg2Start, leg2Minutes));
    }

    // Outbound post-flight
    if (deboardingDuration > 0) updateProgressBar('out-post-deboard', calcProgress(outboundArrivalTime, deboardingDuration));
    updateProgressBar('out-post-cleaning', calcProgress(new Date(outboundArrivalTime.getTime() + deboardingDuration * 60000), cleaningDuration));
    const outPostTotal = calcProgress(outboundArrivalTime, postFlightTotal);
    updateSectionComplete('out-post', outPostTotal === 100);

    // Return pre-flight
    if (cateringDuration > 0) updateProgressBar('ret-pre-catering', calcProgress(returnPreFlightStart, cateringDuration));
    if (boardingDuration > 0) updateProgressBar('ret-pre-boarding', calcProgress(new Date(returnPreFlightStart.getTime() + cateringDuration * 60000), boardingDuration));
    updateProgressBar('ret-pre-fuelling', calcProgress(returnPreFlightStart, fuellingDuration));
    const retPreTotal = calcProgress(returnPreFlightStart, preFlightTotal);
    updateSectionComplete('ret-pre', retPreTotal === 100);

    // Return flight
    updateProgressBar('ret-flight', calcProgress(returnDepartureTime, returnMinutes));

    // Return tech stop legs (if applicable)
    if (hasTechStop) {
      const retLeg3Start = returnDepartureTime;
      const retTechStopStart = new Date(retLeg3Start.getTime() + leg3Minutes * 60000);
      const retLeg4Start = new Date(retTechStopStart.getTime() + techStopMinutes * 60000);
      updateProgressBar('ret-leg3', calcProgress(retLeg3Start, leg3Minutes));
      updateProgressBar('ret-tech', calcProgress(retTechStopStart, techStopMinutes));
      updateProgressBar('ret-leg4', calcProgress(retLeg4Start, leg4Minutes));
    }

    // Return post-flight
    if (deboardingDuration > 0) updateProgressBar('ret-post-deboard', calcProgress(returnArrivalTime, deboardingDuration));
    updateProgressBar('ret-post-cleaning', calcProgress(new Date(returnArrivalTime.getTime() + deboardingDuration * 60000), cleaningDuration));
    const retPostTotal = calcProgress(returnArrivalTime, postFlightTotal);
    updateSectionComplete('ret-post', retPostTotal === 100);
  }, 1000);
}

async function removeFlightFromModal(flightId) {
  closeFlightDetailsModal();
  await deleteScheduledFlight(flightId);
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

  // Use actual duration from maintenance record, or calculate based on check type
  const checkTypeDurations = { 'daily': 60, 'A': 180, 'B': 360 }; // daily=1hr, A=3hrs, B=6hrs
  const durationMinutes = maintenance.duration || checkTypeDurations[maintenance.checkType] || 60;
  const endTime = calculateEndTime(maintenance.startTime, durationMinutes);

  // Determine check type label and description
  const checkTypeLabels = { 'daily': 'Daily Check', 'A': 'A Check', 'B': 'B Check' };
  const checkType = checkTypeLabels[maintenance.checkType] || `${maintenance.checkType} Check`;
  const checkIntervals = { 'daily': '2 days', 'A': '6 weeks', 'B': '6-8 months' };
  const checkInterval = checkIntervals[maintenance.checkType] || '';

  // Get day of week for better description
  const date = new Date(maintenance.scheduledDate + 'T00:00:00Z');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[date.getUTCDay()];

  // Count how many checks of this type exist for this aircraft
  const checksOfType = scheduledMaintenance.filter(m =>
    m.aircraft.id === aircraft.id && m.checkType === maintenance.checkType
  );

  // Determine maintenance status based on current game time
  const gameTime = typeof getGlobalWorldTime === 'function' ? getGlobalWorldTime() : new Date();
  const currentTimeStr = gameTime.toISOString().substring(11, 16);
  const startTimeStr = maintenance.startTime.substring(0, 5);

  let statusText, statusColor, availableText;
  if (currentTimeStr < startTimeStr) {
    statusText = 'UPCOMING';
    statusColor = '#8b949e';
    availableText = `Available from ${endTime}`;
  } else if (currentTimeStr < endTime) {
    statusText = 'IN PROGRESS';
    statusColor = '#ffa657';
    availableText = `Available from ${endTime}`;
  } else {
    statusText = 'COMPLETED';
    statusColor = '#3fb950';
    availableText = `Completed at ${endTime}`;
  }

  // Create and show custom modal
  const modalHtml = `
    <div id="maintenanceDetailsModal" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    ">
      <div style="
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 8px;
        min-width: 380px;
        max-width: 450px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      ">
        <div style="padding: 1rem 1.5rem; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; color: #f0f6fc; font-size: 1.1rem;">Maintenance Details</h3>
          <button onclick="closeMaintenanceDetailsModal()" style="background: none; border: none; color: #8b949e; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
        </div>
        <div style="padding: 1.5rem;">
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem; font-size: 0.9rem;">
            <span style="color: #8b949e;">Type:</span>
            <span style="color: ${maintenance.checkType === 'A' ? '#ffa657' : '#a371f7'}; font-weight: 600;">${checkType}</span>
            <span style="color: #8b949e;">Aircraft:</span>
            <span style="color: #f0f6fc;">${aircraft.registration}</span>
            <span style="color: #8b949e;">Day:</span>
            <span style="color: #f0f6fc;">${dayName}</span>
            <span style="color: #8b949e;">Time:</span>
            <span style="color: #f0f6fc;">${maintenance.startTime.substring(0, 5)} → ${endTime}</span>
            <span style="color: #8b949e;">Duration:</span>
            <span style="color: #f0f6fc;">${durationMinutes} minutes</span>
            <span style="color: #8b949e;">Status:</span>
            <span style="color: ${statusColor}; font-weight: 600;">${statusText}</span>
          </div>
          <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(88, 166, 255, 0.1); border-radius: 6px; display: flex; align-items: center; gap: 0.75rem;">
            <span style="color: #8b949e; font-size: 0.85rem;">Aircraft:</span>
            <span style="color: #58a6ff; font-weight: 600; font-size: 0.95rem;">${availableText}</span>
          </div>
          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #30363d;">
            <div style="font-size: 0.85rem; color: #8b949e;">
              This ${checkType.toLowerCase()} is scheduled every ${dayName}. Interval: ${checkInterval}.
              ${checksOfType.length > 1 ? `There are ${checksOfType.length} ${checkType.toLowerCase()}s scheduled for this aircraft.` : ''}
            </div>
          </div>
        </div>
        <div style="padding: 1rem 1.5rem; border-top: 1px solid #30363d; display: flex; gap: 0.75rem; justify-content: flex-end;">
          <button onclick="removeMaintenanceFromModal('${maintenanceId}')" style="
            padding: 0.5rem 1rem;
            background: #da3633;
            border: 1px solid #f85149;
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 0.85rem;
          ">Remove ${dayName} Check</button>
          <button onclick="removeAllMaintenanceOfType('${aircraft.id}', '${maintenance.checkType}')" style="
            padding: 0.5rem 1rem;
            background: #6e2d2d;
            border: 1px solid #da3633;
            border-radius: 6px;
            color: #ffa198;
            cursor: pointer;
            font-size: 0.85rem;
          ">Remove All ${checkType}s</button>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if any
  const existingModal = document.getElementById('maintenanceDetailsModal');
  if (existingModal) existingModal.remove();

  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function calculateEndTime(startTime, durationMinutes) {
  const [h, m] = startTime.split(':').map(Number);
  const totalMins = h * 60 + m + durationMinutes;
  // Round to nearest 5 minutes
  const roundedTotalMins = Math.round(totalMins / 5) * 5;
  const endH = Math.floor((roundedTotalMins % 1440) / 60);
  const endM = roundedTotalMins % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

function closeMaintenanceDetailsModal() {
  const modal = document.getElementById('maintenanceDetailsModal');
  if (modal) modal.remove();
}

async function removeMaintenanceFromModal(maintenanceId) {
  closeMaintenanceDetailsModal();
  await deleteScheduledMaintenance(maintenanceId);
}

async function removeAllMaintenanceOfType(aircraftId, checkType) {
  closeMaintenanceDetailsModal();

  const checkTypeNames = { 'daily': 'daily checks', 'A': 'A checks', 'B': 'B checks' };
  const checkTypeName = checkTypeNames[checkType] || `${checkType} checks`;
  const confirmed = await showConfirmModal(
    'Confirm Deletion',
    `Are you sure you want to remove ALL ${checkTypeName} for this aircraft?\n\nThis will delete all scheduled ${checkTypeName}.`
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`/api/schedule/maintenance/aircraft/${aircraftId}/type/${checkType}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete maintenance checks');
    }

    // Remove from local array immediately
    scheduledMaintenance = scheduledMaintenance.filter(m =>
      !(m.aircraft.id === aircraftId && m.checkType === checkType)
    );

    await showAlertModal('Success', `All ${checkTypeName} deleted successfully`);
    renderSchedule();
  } catch (error) {
    console.error('Error deleting maintenance checks:', error);
    await showAlertModal('Error', error.message);
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
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayValues = [1, 2, 3, 4, 5, 6, 0]; // JS day values (0=Sun, 1=Mon, etc.)

  for (let i = 0; i < 7; i++) {
    columns.push({
      dayOfWeek: dayValues[i],
      label: dayNames[i]
    });
  }

  return columns;
}

// Render schedule (without fetching data)
function renderSchedule() {
  if (viewMode === 'weekly') {
    renderWeeklySchedule();
  } else {
    renderDailySchedule();
  }
}

// Render daily schedule view
function renderDailySchedule() {
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

  html += '<th style="padding: 0.75rem 0.5rem 0.75rem 0.75rem; text-align: center; color: var(--text-secondary); font-weight: 600; min-width: 100px; border-left: 2px solid var(--border-color); position: sticky; right: 0; background: var(--surface-elevated); z-index: 11; box-shadow: -5px 0 0 var(--surface-elevated);">ACTIONS</th>';
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

// Render weekly schedule view
function renderWeeklySchedule() {
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

  const dayColumns = generateWeeklyDayColumns();

  // Build schedule grid HTML - use table-layout: fixed for even day column widths
  let html = '<table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; table-layout: fixed;">';

  // Header row
  html += '<thead><tr style="background: var(--surface-elevated); border-bottom: 2px solid var(--border-color); position: sticky; top: 0; z-index: 10;">';
  html += '<th style="padding: 0.75rem 1rem; text-align: left; color: var(--text-secondary); font-weight: 600; width: 180px; min-width: 180px; position: sticky; left: 0; background: var(--surface-elevated); border-right: 2px solid var(--border-color); z-index: 11;">AIRCRAFT</th>';

  dayColumns.forEach((col) => {
    const isToday = col.dayOfWeek === getCurrentWorldTime()?.getDay();
    const bgColor = isToday ? 'background: rgba(0, 102, 204, 0.15);' : '';
    const todayIndicator = isToday ? '<span style="color: var(--accent-color); font-size: 0.65rem; margin-left: 0.25rem;">●</span>' : '';
    html += `
      <th style="padding: 0.75rem 0.5rem; text-align: center; color: var(--text-secondary); font-weight: 600; border-left: 1px solid var(--border-color); cursor: pointer; ${bgColor}" onclick="goToDay(${col.dayOfWeek})" title="Click to view ${col.label}">
        ${col.label}${todayIndicator}
      </th>`;
  });

  html += '<th style="padding: 0.75rem 0.5rem 0.75rem 0.75rem; text-align: center; color: var(--text-secondary); font-weight: 600; width: 100px; min-width: 100px; border-left: 2px solid var(--border-color); position: sticky; right: 0; background: var(--surface-elevated); z-index: 11; box-shadow: -5px 0 0 var(--surface-elevated);">ACTIONS</th>';
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
          <td colspan="${dayColumns.length + 1}" style="background: var(--surface);"></td>
        </tr>
      `;

      // Aircraft rows
      aircraftInGroup.forEach(aircraft => {
        html += generateAircraftRowWeekly(aircraft, dayColumns);
      });
    });
  } else {
    // Filter to specific aircraft type - show without group header
    const filteredFleet = userFleet.filter(aircraft => {
      const typeKey = `${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? '-' + aircraft.aircraft.variant : ''}`;
      return typeKey === filterValue;
    });

    filteredFleet.forEach(aircraft => {
      html += generateAircraftRowWeekly(aircraft, dayColumns);
    });
  }

  html += '</tbody></table>';

  container.innerHTML = html;

  // Start timeline updates for weekly view too
  updateTimeline();
}

// Go to daily view for a specific day
function goToDay(dayOfWeek) {
  const daySelect = document.getElementById('dayOfWeek');
  if (daySelect) {
    daySelect.value = dayOfWeek;
    selectedDayOfWeek = dayOfWeek;
  }
  setViewMode('daily');
}

// Generate aircraft row for weekly view
function generateAircraftRowWeekly(aircraft, dayColumns) {
  // Check maintenance warnings
  const maintenanceWarnings = getMaintenanceWarnings(aircraft);
  const warningIcons = maintenanceWarnings.map(w =>
    `<span style="font-size: 1.1rem; cursor: help; ${w.type === 'daily' ? 'color: #ef4444;' : 'color: #eab308;'}" title="${w.message}">⚠</span>`
  ).join(' ');

  let html = '<tr style="border-bottom: 1px solid var(--border-color);">';

  // Aircraft info column (sticky left)
  html += `
    <td style="padding: 0.75rem 1rem; position: sticky; left: 0; background: var(--surface); border-right: 2px solid var(--border-color); z-index: 5; vertical-align: middle;">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="color: var(--accent-color); font-weight: 600; font-size: 0.95rem; text-decoration: underline; cursor: pointer;" onclick="event.stopPropagation();">
          ${aircraft.registration}
        </span>
        ${warningIcons}
      </div>
    </td>
  `;

  // Day columns - render time-positioned flight blocks
  dayColumns.forEach(col => {
    const dayFlights = getFlightsForDay(aircraft.id, col.dayOfWeek);
    const dayMaintenance = getMaintenanceForDay(aircraft.id, col.dayOfWeek);
    const isToday = col.dayOfWeek === getCurrentWorldTime()?.getDay();
    const bgColor = isToday ? 'rgba(0, 102, 204, 0.1)' : 'var(--surface-elevated)';

    let cellContent = '';

    // Render flight blocks as positioned time bars
    if (dayFlights.length > 0) {
      dayFlights.forEach(flight => {
        const route = flight.route;
        const arrAirport = route?.arrivalAirport?.iataCode || route?.arrivalAirport?.icaoCode || '???';
        const techStopAirport = route?.techStopAirport?.iataCode || route?.techStopAirport?.icaoCode || null;
        const routeNum = route?.routeNumber || '';

        // Parse departure and arrival times from stored data
        const depTimeStr = flight.departureTime?.substring(0, 5) || '00:00';
        const arrTimeStr = flight.arrivalTime?.substring(0, 5) || '23:59';
        const [depH, depM] = depTimeStr.split(':').map(Number);
        const [arrH, arrM] = arrTimeStr.split(':').map(Number);

        // Use stored departure time as operation start (pre-flight is already factored into storage)
        let depMinutes = depH * 60 + depM;

        // Use stored arrival time (this is when aircraft returns home after round-trip)
        let arrMinutes = arrH * 60 + arrM;

        // Calculate pre-flight and post-flight duration to extend the visual strip
        const acType = aircraft.aircraft?.type || 'Narrowbody';
        const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;

        // Calculate pre-flight duration (catering + boarding vs fuelling, whichever is longer)
        let cateringDur = 0;
        if (paxCapacity >= 50 && acType !== 'Cargo') {
          if (paxCapacity < 100) cateringDur = 5;
          else if (paxCapacity < 200) cateringDur = 10;
          else cateringDur = 15;
        }
        let boardingDur = 0;
        if (acType !== 'Cargo') {
          if (paxCapacity < 50) boardingDur = 10;
          else if (paxCapacity < 100) boardingDur = 15;
          else if (paxCapacity < 200) boardingDur = 20;
          else if (paxCapacity < 300) boardingDur = 25;
          else boardingDur = 35;
        }
        const routeDistance = route?.distance || 0;
        let fuelDur = 0;
        if (routeDistance < 500) fuelDur = 10;
        else if (routeDistance < 1500) fuelDur = 15;
        else if (routeDistance < 3000) fuelDur = 20;
        else fuelDur = 25;
        const preFlightDur = Math.max(cateringDur + boardingDur, fuelDur);

        // Subtract pre-flight time from departure to get true operation start
        depMinutes -= preFlightDur;

        // Post-flight duration
        let deboardDur = 0;
        if (acType !== 'Cargo') {
          if (paxCapacity < 50) deboardDur = 5;
          else if (paxCapacity < 100) deboardDur = 8;
          else if (paxCapacity < 200) deboardDur = 12;
          else if (paxCapacity < 300) deboardDur = 15;
          else deboardDur = 20;
        }
        let cleanDur;
        if (paxCapacity < 50) cleanDur = 5;
        else if (paxCapacity < 100) cleanDur = 10;
        else if (paxCapacity < 200) cleanDur = 15;
        else if (paxCapacity < 300) cleanDur = 20;
        else cleanDur = 25;
        const postFlightDur = deboardDur + cleanDur;

        // Add post-flight time to arrival to get true operation end
        arrMinutes += postFlightDur;

        // Calculate total operation time from route data to properly detect multi-day flights
        // This is necessary because arrivalTime only stores time-of-day, not which day
        const cruiseSpeed = aircraft.aircraft?.cruiseSpeed || 450;
        const depAirport = route?.departureAirport;
        const arrAirport2 = route?.arrivalAirport;
        const depLng = depAirport?.longitude || 0;
        const depLat = depAirport?.latitude || 0;
        const arrLng = arrAirport2?.longitude || 0;
        const arrLat = arrAirport2?.latitude || 0;

        // Calculate outbound and return flight times
        let outboundMins = 0, returnMins = 0;
        if (routeDistance > 0 && cruiseSpeed > 0) {
          outboundMins = calculateFlightMinutes(routeDistance, cruiseSpeed, depLng, arrLng, depLat, arrLat);
          returnMins = calculateFlightMinutes(routeDistance, cruiseSpeed, arrLng, depLng, arrLat, depLat);
        }

        // Calculate turnaround time (same logic as flight details modal)
        let turnaroundMins = 45; // Default minimum
        if (routeDistance > 3000) turnaroundMins = 60;
        if (routeDistance > 6000) turnaroundMins = 75;
        if (paxCapacity > 300) turnaroundMins = Math.max(turnaroundMins, 60);

        // Calculate actual arrival minutes from departure
        // depMinutes already has pre-flight subtracted, so we add back pre-flight then add total flight time
        const actualDepMins = depMinutes + preFlightDur; // Original departure time
        arrMinutes = actualDepMins + outboundMins + turnaroundMins + returnMins + postFlightDur;

        // Get day of week for operation start (including pre-flight)
        let opStartDate = new Date(flight.scheduledDate + 'T00:00:00');
        // Handle pre-flight pushing into previous day
        if (depMinutes < 0) {
          depMinutes += 1440;
          opStartDate.setDate(opStartDate.getDate() - 1);
        }
        const opStartDayOfWeek = opStartDate.getDay();

        // Calculate operation end date based on total minutes from scheduled date midnight
        // arrMinutes is calculated from departure time, so we need to account for days it spans
        let arrDate = new Date(flight.scheduledDate + 'T00:00:00');
        let normalizedArrMinutes = arrMinutes;
        while (normalizedArrMinutes >= 1440) {
          normalizedArrMinutes -= 1440;
          arrDate.setDate(arrDate.getDate() + 1);
        }
        arrMinutes = normalizedArrMinutes;
        const arrDayOfWeek = arrDate.getDay();
        const isMultiDay = arrDate.toISOString().split('T')[0] !== opStartDate.toISOString().split('T')[0];

        // Calculate days difference to detect transit days
        const daysDiff = Math.round((arrDate - opStartDate) / (1000 * 60 * 60 * 24));
        const hasTransitDays = daysDiff > 1;

        // Check if current column is a transit day
        let isTransitDay = false;
        if (hasTransitDays) {
          for (let i = 1; i < daysDiff; i++) {
            const transitDayOfWeek = (opStartDayOfWeek + i) % 7;
            if (transitDayOfWeek === col.dayOfWeek) {
              isTransitDay = true;
              break;
            }
          }
        }

        // Calculate position and width for this day's portion
        let leftPct, widthPct, borderRadius;

        if (!isMultiDay) {
          // Single day operation (pre-flight through post-flight on same day)
          leftPct = (depMinutes / 1440) * 100;
          widthPct = ((arrMinutes - depMinutes) / 1440) * 100;
          borderRadius = '3px';
        } else if (col.dayOfWeek === opStartDayOfWeek) {
          // Operation start day - starts at pre-flight time, extends to end of day
          leftPct = (depMinutes / 1440) * 100;
          widthPct = 100 - leftPct;
          borderRadius = hasTransitDays ? '3px 0 0 3px' : '3px 0 0 3px';
        } else if (col.dayOfWeek === arrDayOfWeek) {
          // Arrival day - starts at 0, ends at arrival time
          leftPct = 0;
          widthPct = (arrMinutes / 1440) * 100;
          borderRadius = '0 3px 3px 0';
        } else if (isTransitDay) {
          // Transit day (full day in flight)
          leftPct = 0;
          widthPct = 100;
          borderRadius = '0';
        } else {
          // Shouldn't reach here, but fallback
          leftPct = 0;
          widthPct = 100;
          borderRadius = '0';
        }

        // Minimum width for visibility
        if (widthPct < 5) widthPct = 5;

        // Show ICAO - prefer transit day if exists, otherwise use midpoint logic
        let showLabel = true;
        if (isMultiDay) {
          if (hasTransitDays) {
            // Show label on first transit day only
            const firstTransitDayOfWeek = (opStartDayOfWeek + 1) % 7;
            showLabel = col.dayOfWeek === firstTransitDayOfWeek;
          } else {
            // No transit days - use midpoint logic for 2-day operations
            const opStartDayMinutesRemaining = 1440 - depMinutes;
            const totalOperationMinutes = opStartDayMinutesRemaining + arrMinutes;
            const midpointMinutes = totalOperationMinutes / 2;
            const midpointOnOpStartDay = midpointMinutes <= opStartDayMinutesRemaining;

            if (col.dayOfWeek === opStartDayOfWeek) {
              showLabel = midpointOnOpStartDay;
            } else if (col.dayOfWeek === arrDayOfWeek) {
              showLabel = !midpointOnOpStartDay;
            } else {
              showLabel = false;
            }
          }
        }

        // Build label content - use vertical text for narrow strips, hide if too small
        let labelContent = '';
        if (showLabel) {
          const isNarrow = widthPct < 12; // Less than ~12% of day width
          const isTooSmall = widthPct < 5; // Less than ~5% - don't show label at all

          if (isTooSmall) {
            labelContent = '';
          } else if (isNarrow) {
            // Vertically stacked letters for narrow strips (letters upright, stacked top to bottom)
            const stackedLetters = arrAirport.split('').join('<br>');
            labelContent = `
              <span style="color: white; font-size: 0.55rem; font-weight: 600; line-height: 0.9; text-align: center;">${stackedLetters}</span>
            `;
          } else {
            // Normal horizontal text with optional tech stop
            const techStopLabel = techStopAirport ? `<div style="color: #22c55e; font-size: 0.55rem; white-space: nowrap;">via ${techStopAirport}</div>` : '';
            labelContent = `
              <div style="display: flex; flex-direction: column; align-items: center; line-height: 1.2;">
                <span style="color: white; font-size: 0.7rem; font-weight: 600; white-space: nowrap;">${arrAirport}</span>
                ${techStopLabel}
              </div>
            `;
          }
        }

        // Check if maintenance immediately follows this flight (to remove right border-radius)
        const flightEndPct = leftPct + widthPct;
        const hasMaintenanceAfter = dayMaintenance.some(maint => {
          const startTimeStr = maint.startTime?.substring(0, 5) || '00:00';
          const [startH, startM] = startTimeStr.split(':').map(Number);
          const startMinutes = startH * 60 + startM;
          const maintStartPct = (startMinutes / 1440) * 100;
          return Math.abs(flightEndPct - maintStartPct) < 1; // Within 1% (~14 minutes)
        });

        // Adjust border-radius to remove right side if maintenance follows
        let finalBorderRadius = borderRadius;
        if (hasMaintenanceAfter) {
          // Remove right border-radius
          if (borderRadius === '3px') {
            finalBorderRadius = '3px 0 0 3px';
          } else if (borderRadius === '0 3px 3px 0') {
            finalBorderRadius = '0';
          }
        }

        // Main flight block - covers the full flight time (no separate pre/post-flight slivers in weekly view)
        cellContent += `
          <div
            onclick="event.stopPropagation(); viewFlightDetailsWeekly('${flight.id}')"
            title="${routeNum}: ${depTimeStr}→${arrTimeStr}${techStopAirport ? ' via ' + techStopAirport : ''}"
            style="position: absolute; left: ${leftPct}%; width: ${widthPct}%; top: 0; bottom: 0; background: var(--accent-color); border-radius: ${finalBorderRadius}; display: flex; align-items: center; justify-content: center; cursor: pointer; overflow: hidden;"
          >
            ${labelContent}
          </div>
        `;
      });
    }

    // Render maintenance blocks (full height)
    if (dayMaintenance.length > 0) {
      // Get current time for status comparison (only for today's column)
      const gameTime = getCurrentWorldTime();
      const currentMinutes = gameTime ? (gameTime.getHours() * 60 + gameTime.getMinutes()) : 0;

      dayMaintenance.forEach(maint => {
        // Distinct colors for each check type
        const maintColors = { 'daily': '#FFA500', 'A': '#17A2B8', 'B': '#8B5CF6' }; // Orange, Teal, Purple
        let maintBg = maintColors[maint.checkType] || '#6b7280';

        // Parse maintenance time
        const startTimeStr = maint.startTime?.substring(0, 5) || '00:00';
        const [startH, startM] = startTimeStr.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        // Use actual duration or calculate from check type
        const checkTypeDurations = { 'daily': 60, 'A': 180, 'B': 360 };
        const durationMinutes = maint.duration || checkTypeDurations[maint.checkType] || 60;
        const endMinutes = Math.min(startMinutes + durationMinutes, 1440);

        // Determine maintenance status for today's column
        let maintOpacity = '1';
        let maintFilter = 'none';
        if (isToday) {
          if (currentMinutes >= endMinutes) {
            // Completed - fade out and desaturate
            maintOpacity = '0.4';
            maintFilter = 'grayscale(50%)';
          } else if (currentMinutes >= startMinutes) {
            // In progress - normal with slight glow
            maintFilter = 'brightness(1.1)';
          }
          // Upcoming - normal appearance (maintFilter stays 'none')
        }

        const leftPct = (startMinutes / 1440) * 100;
        let widthPct = ((endMinutes - startMinutes) / 1440) * 100;
        if (widthPct < 5) widthPct = 5;

        // Show label for each check type
        const maintLabels = { 'daily': 'D', 'A': 'A', 'B': 'B' };
        const content = `<span style="color: white; font-size: 0.65rem; font-weight: 600;">${maintLabels[maint.checkType] || maint.checkType}</span>`;

        // Check if maintenance starts exactly where a flight ends (no gap needed)
        const flightEndsPct = dayFlights.length > 0 ? Math.max(...dayFlights.map(f => {
          const arrStr = f.arrivalTime?.substring(0, 5) || '23:59';
          const [aH, aM] = arrStr.split(':').map(Number);
          let arrMins = aH * 60 + aM;
          // Add post-flight time
          const acT = aircraft.aircraft?.type || 'Narrowbody';
          const paxCap = aircraft.aircraft?.passengerCapacity || 150;
          let dbDur = 0;
          if (acT !== 'Cargo') {
            if (paxCap < 50) dbDur = 5;
            else if (paxCap < 100) dbDur = 8;
            else if (paxCap < 200) dbDur = 12;
            else if (paxCap < 300) dbDur = 15;
            else dbDur = 20;
          }
          let clDur;
          if (paxCap < 50) clDur = 5;
          else if (paxCap < 100) clDur = 10;
          else if (paxCap < 200) clDur = 15;
          else if (paxCap < 300) clDur = 20;
          else clDur = 25;
          arrMins += dbDur + clDur;
          if (arrMins >= 1440) arrMins -= 1440;
          return (arrMins / 1440) * 100;
        })) : 0;
        const maintStartsPct = leftPct;
        // If maintenance starts within 1% of where flight ends, remove left border radius
        const isAdjacentToFlight = Math.abs(flightEndsPct - maintStartsPct) < 1;
        const maintBorderRadius = isAdjacentToFlight ? '0 3px 3px 0' : '3px';

        cellContent += `
          <div
            onclick="event.stopPropagation(); viewMaintenanceDetails('${maint.id}')"
            title="${maint.checkType === 'daily' ? 'Daily' : maint.checkType} Check @ ${startTimeStr}"
            style="position: absolute; left: ${leftPct}%; width: ${widthPct}%; top: 0; bottom: 0; background: ${maintBg}; border-radius: ${maintBorderRadius}; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: ${maintOpacity}; filter: ${maintFilter};"
          >
            ${content}
          </div>
        `;
      });
    }

    const hasContent = dayFlights.length > 0 || dayMaintenance.length > 0;

    html += `
      <td
        class="schedule-cell weekly-cell"
        data-day="${col.dayOfWeek}"
        data-aircraft-id="${aircraft.id}"
        style="position: relative; height: 36px; border-left: 1px solid var(--border-color); background: ${bgColor};"
        ondragover="handleWeeklyDragOver(event, ${col.dayOfWeek})"
        ondragleave="handleWeeklyDragLeave(event)"
        ondrop="handleWeeklyDrop(event, '${aircraft.id}', ${col.dayOfWeek})"
        title="Drag route here to schedule"
      >
        ${hasContent ? cellContent : ''}
      </td>
    `;
  });

  // Actions column (sticky right)
  html += `
    <td style="padding: 0.5rem 0.6rem 0.5rem 0.75rem; position: sticky; right: 0; background: var(--surface); border-left: 2px solid var(--border-color); z-index: 5; box-shadow: -5px 0 0 var(--surface); vertical-align: middle;">
      <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
        <button
          onclick="event.stopPropagation(); addRouteToAircraft('${aircraft.id}')"
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
          onclick="event.stopPropagation(); scheduleMaintenance('${aircraft.id}')"
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
          onclick="event.stopPropagation(); clearWeekSchedule('${aircraft.id}')"
          title="Clear Week Schedule"
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

// Get flights for a specific day of week for an aircraft
function getFlightsForDay(aircraftId, dayOfWeek) {
  return scheduledFlights.filter(f => {
    if (f.aircraft?.id !== aircraftId) return false;
    if (!f.scheduledDate) return false;

    // Calculate pre-flight duration to determine operation start
    const aircraft = f.aircraft;
    const route = f.route;
    const acType = aircraft?.aircraft?.type || 'Narrowbody';
    const paxCapacity = aircraft?.aircraft?.passengerCapacity || 150;

    // Calculate pre-flight duration
    let cateringDur = 0;
    if (paxCapacity >= 50 && acType !== 'Cargo') {
      if (paxCapacity < 100) cateringDur = 5;
      else if (paxCapacity < 200) cateringDur = 10;
      else cateringDur = 15;
    }
    let boardingDur = 0;
    if (acType !== 'Cargo') {
      if (paxCapacity < 50) boardingDur = 10;
      else if (paxCapacity < 100) boardingDur = 15;
      else if (paxCapacity < 200) boardingDur = 20;
      else if (paxCapacity < 300) boardingDur = 25;
      else boardingDur = 35;
    }
    const routeDistance = route?.distance || 0;
    let fuelDur = 0;
    if (routeDistance < 500) fuelDur = 10;
    else if (routeDistance < 1500) fuelDur = 15;
    else if (routeDistance < 3000) fuelDur = 20;
    else fuelDur = 25;
    const preFlightDur = Math.max(cateringDur + boardingDur, fuelDur);

    // Parse departure time
    const depTimeStr = f.departureTime?.substring(0, 5) || '00:00';
    const [depH, depM] = depTimeStr.split(':').map(Number);
    let depMinutes = depH * 60 + depM;

    // Calculate operation start (departure minus pre-flight)
    let opStartDate = new Date(f.scheduledDate + 'T00:00:00');
    depMinutes -= preFlightDur;
    if (depMinutes < 0) {
      depMinutes += 1440;
      opStartDate.setDate(opStartDate.getDate() - 1);
    }
    const opStartDayOfWeek = opStartDate.getDay();

    // Check operation start day (pre-flight start)
    if (opStartDayOfWeek === dayOfWeek) return true;

    // Calculate full round-trip flight duration
    const cruiseSpeed = aircraft?.aircraft?.cruiseSpeed || 450;
    const turnaroundMinutes = route?.turnaroundTime || 45;
    const techStopMinutes = route?.techStopAirport ? 30 : 0;

    // Calculate one-way flight time
    let oneWayFlightMins;
    if (route?.techStopAirport) {
      const leg1Dist = route.legOneDistance || Math.round(routeDistance * 0.4);
      const leg2Dist = route.legTwoDistance || Math.round(routeDistance * 0.6);
      oneWayFlightMins = Math.round((leg1Dist / cruiseSpeed) * 60) + techStopMinutes + Math.round((leg2Dist / cruiseSpeed) * 60);
    } else {
      oneWayFlightMins = Math.round((routeDistance / cruiseSpeed) * 60);
    }

    // Total flight time = outbound + turnaround + return
    const totalFlightMins = oneWayFlightMins + turnaroundMinutes + oneWayFlightMins;

    // Calculate return home arrival time (departure + total flight time)
    let arrMinutes = (depH * 60 + depM) + totalFlightMins;

    // Calculate post-flight duration
    let deboardDur = 0;
    if (acType !== 'Cargo') {
      if (paxCapacity < 50) deboardDur = 5;
      else if (paxCapacity < 100) deboardDur = 8;
      else if (paxCapacity < 200) deboardDur = 12;
      else if (paxCapacity < 300) deboardDur = 15;
      else deboardDur = 20;
    }
    let cleanDur;
    if (paxCapacity < 50) cleanDur = 5;
    else if (paxCapacity < 100) cleanDur = 10;
    else if (paxCapacity < 200) cleanDur = 15;
    else if (paxCapacity < 300) cleanDur = 20;
    else cleanDur = 25;
    const postFlightDur = deboardDur + cleanDur;

    // Add post-flight to get operation end
    arrMinutes += postFlightDur;

    // Calculate operation end date (can span multiple days)
    let opEndDate = new Date(f.scheduledDate + 'T00:00:00');
    while (arrMinutes >= 1440) {
      arrMinutes -= 1440;
      opEndDate.setDate(opEndDate.getDate() + 1);
    }
    const opEndDayOfWeek = opEndDate.getDay();

    // Check operation end day (post-flight end)
    if (opEndDayOfWeek === dayOfWeek) return true;

    // Check transit days (days between operation start and operation end)
    const daysDiff = Math.round((opEndDate - opStartDate) / (1000 * 60 * 60 * 24));
    if (daysDiff > 1) {
      // There are transit days - check if dayOfWeek falls between start and end
      for (let i = 1; i < daysDiff; i++) {
        const transitDayOfWeek = (opStartDayOfWeek + i) % 7;
        if (transitDayOfWeek === dayOfWeek) return true;
      }
    }

    return false;
  });
}

// Get maintenance for a specific day of week for an aircraft
function getMaintenanceForDay(aircraftId, dayOfWeek) {
  return scheduledMaintenance.filter(m => {
    if (m.aircraft?.id !== aircraftId) return false;
    // Get day of week from scheduledDate
    if (!m.scheduledDate) return false;
    const maintDate = new Date(m.scheduledDate + 'T00:00:00');
    const maintDayOfWeek = maintDate.getDay();
    return maintDayOfWeek === dayOfWeek;
  });
}

// Load and display schedule (fetches data then renders)
async function loadSchedule() {
  const container = document.getElementById('scheduleGrid');

  try {
    // Close add route modal if it's open
    closeAddRouteModal();

    // Show loading indicator
    container.innerHTML = `
      <div style="padding: 3rem; text-align: center; color: var(--text-secondary);">
        <div style="
          border: 3px solid var(--border-color);
          border-top: 3px solid var(--accent-color);
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: scheduleSpin 1s linear infinite;
          margin: 0 auto 1rem auto;
        "></div>
        <div style="font-size: 1rem;">Loading schedule...</div>
      </div>
      <style>
        @keyframes scheduleSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
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
        ${renderMaintenanceBlocks(cellMaintenance, cellFlights, aircraft)}
      </td>
    `;
  });

  // Actions column (sticky right) - extra left padding to cover any flight block overflow
  html += `
    <td style="padding: 0.5rem 0.6rem 0.5rem 0.75rem; position: sticky; right: 0; background: var(--surface); border-left: 2px solid var(--border-color); z-index: 5; box-shadow: -5px 0 0 var(--surface);">
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
          onclick="clearDaySchedule('${aircraft.id}')"
          title="Clear Day Schedule"
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

  // Show modal and reset position to default (bottom-right)
  const modal = document.getElementById('addRouteModal');
  if (modal) {
    modal.style.top = 'auto';
    modal.style.left = 'auto';
    modal.style.bottom = '2rem';
    modal.style.right = '2rem';
    modal.style.display = 'flex';
  }

  // Show/hide day filter based on view mode
  const dayFilterContainer = document.getElementById('routeDayFilterContainer');
  if (dayFilterContainer) {
    if (viewMode === 'weekly') {
      dayFilterContainer.style.display = 'block';
      // Reset filter to "All Days"
      const dayFilter = document.getElementById('routeDayFilter');
      if (dayFilter) dayFilter.value = 'all';
    } else {
      dayFilterContainer.style.display = 'none';
    }
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

// Close add route modal when clicking outside
document.addEventListener('click', (e) => {
  const modal = document.getElementById('addRouteModal');
  if (!modal || modal.style.display === 'none') return;

  // Check if click is outside the modal
  if (!modal.contains(e.target)) {
    // Don't close if clicking on the "Add Route" button that opens the modal
    if (e.target.closest('[onclick*="addRouteToAircraft"]')) return;
    closeAddRouteModal();
  }
});

// Make the add route modal draggable
function initDraggableModal() {
  const modal = document.getElementById('addRouteModal');
  const header = document.getElementById('addRouteModalHeader');
  if (!modal || !header) return;

  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener('mousedown', (e) => {
    // Don't start drag if clicking the close button
    if (e.target.tagName === 'BUTTON') return;

    isDragging = true;
    const rect = modal.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    // Prevent text selection during drag
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    // Calculate new position
    let newX = e.clientX - offsetX;
    let newY = e.clientY - offsetY;

    // Keep modal within viewport bounds
    const modalRect = modal.getBoundingClientRect();
    const maxX = window.innerWidth - modalRect.width;
    const maxY = window.innerHeight - modalRect.height;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    // Switch from bottom/right positioning to top/left for dragging
    modal.style.bottom = 'auto';
    modal.style.right = 'auto';
    modal.style.left = newX + 'px';
    modal.style.top = newY + 'px';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

// Initialize draggable modal when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDraggableModal);
} else {
  initDraggableModal();
}

// Load unassigned routes
async function loadUnassignedRoutes(aircraftId) {
  const container = document.getElementById('unassignedRoutesList');

  // Get the day filter value (only used in weekly view)
  const dayFilterValue = viewMode === 'weekly'
    ? (document.getElementById('routeDayFilter')?.value || 'all')
    : null;

  // Filter routes assigned to this aircraft or unassigned
  const availableRoutes = routes.filter(r => {
    // Check if route is assigned to this aircraft or unassigned
    const aircraftMatch = r.assignedAircraftId === aircraftId || r.assignedAircraftId === null;

    // Day matching logic differs between daily and weekly view
    let dayMatch = false;
    if (viewMode === 'weekly') {
      // Weekly view: show all routes, optionally filtered by day
      if (dayFilterValue === 'all') {
        dayMatch = true; // Show all routes
      } else {
        // Filter to routes that operate on the selected day
        const filterDay = parseInt(dayFilterValue, 10);
        dayMatch = r.daysOfWeek && (
          r.daysOfWeek.includes(filterDay) || r.daysOfWeek.length === 7
        );
      }
    } else {
      // Daily view: only show routes that operate on the selected day
      dayMatch = r.daysOfWeek && (
        r.daysOfWeek.includes(selectedDayOfWeek) || r.daysOfWeek.length === 7
      );
    }

    // Check if route is NOT already scheduled on the selected day (daily view only)
    // In weekly view, we show all routes regardless of scheduling
    let notAlreadyScheduled = true;
    if (viewMode !== 'weekly') {
      notAlreadyScheduled = !scheduledFlights.some(sf => sf.routeId === r.id);
    }

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
    // Click to schedule (alternative to drag)
    element.addEventListener('click', (e) => {
      // Don't trigger if dragging
      if (e.defaultPrevented) return;
      showDaySelectionForRoute(routeId);
    });
    element.style.cursor = 'pointer';
  });
}

// Show day selection dialog for scheduling a route via click
async function showDaySelectionForRoute(routeId) {
  const route = routes.find(r => r.id === routeId);
  if (!route || !currentAircraftId) return;

  const aircraft = userFleet.find(a => a.id === currentAircraftId);
  if (!aircraft) return;

  // Check aircraft type compatibility (using full type key)
  const routeAircraftType = getAircraftTypeKey(route.assignedAircraft?.aircraft);
  const targetAircraftType = getAircraftTypeKey(aircraft?.aircraft);

  if (routeAircraftType && routeAircraftType !== targetAircraftType) {
    await showAlertModal('Aircraft Type Mismatch', `This route requires a ${routeAircraftType} aircraft. ${aircraft.registration} is a ${targetAircraftType}.`);
    return;
  }

  // Get available days for this route
  const availableDays = route.daysOfWeek || [];
  if (availableDays.length === 0) {
    await showAlertModal('No Schedule', 'This route has no operating days configured.');
    return;
  }

  // Create day selection modal
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun order

  // Build day buttons
  let dayButtonsHtml = '';
  dayOrder.forEach(dayNum => {
    const isAvailable = availableDays.includes(dayNum) || availableDays.length === 7;
    if (isAvailable) {
      dayButtonsHtml += `
        <button
          onclick="scheduleRouteForDay('${routeId}', ${dayNum})"
          style="padding: 0.75rem 1rem; background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s; min-width: 100px;"
          onmouseover="this.style.background='var(--accent-color)'; this.style.borderColor='var(--accent-color)'; this.style.color='white'"
          onmouseout="this.style.background='var(--surface-elevated)'; this.style.borderColor='var(--border-color)'; this.style.color='var(--text-primary)'"
        >${dayNames[dayNum]}</button>
      `;
    }
  });

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'daySelectionOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 2000;
    display: flex;
    justify-content: center;
    align-items: center;
  `;

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: var(--surface);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
    width: 90%;
    max-width: 400px;
  `;

  const depTime = route.scheduledDepartureTime ? route.scheduledDepartureTime.substring(0, 5) : '--:--';

  modalContent.innerHTML = `
    <h2 style="margin: 0 0 1rem 0; color: var(--text-primary); font-size: 1.1rem;">SCHEDULE ROUTE</h2>
    <p style="margin: 0 0 0.5rem 0; color: var(--accent-color); font-weight: 600;">
      ${route.routeNumber} / ${route.returnRouteNumber}
    </p>
    <p style="margin: 0 0 0.5rem 0; color: var(--text-secondary); font-size: 0.9rem;">
      ${route.departureAirport.icaoCode} → ${route.arrivalAirport.icaoCode} → ${route.departureAirport.icaoCode}
    </p>
    <p style="margin: 0 0 1rem 0; color: var(--text-muted); font-size: 0.85rem;">
      Departure: <span style="color: var(--success-color); font-weight: 600;">${depTime}</span> • Aircraft: <span style="color: var(--text-primary);">${aircraft.registration}</span>
    </p>
    <p style="margin: 0 0 1rem 0; color: var(--text-secondary); font-size: 0.9rem;">Select day to schedule:</p>
    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.5rem;">
      ${dayButtonsHtml}
    </div>
    <div style="text-align: right;">
      <button
        onclick="closeDaySelectionModal()"
        style="padding: 0.5rem 1rem; background: transparent; border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-secondary); font-size: 0.85rem; cursor: pointer;"
      >Cancel</button>
    </div>
  `;

  overlay.appendChild(modalContent);
  document.body.appendChild(overlay);

  // Close on background click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeDaySelectionModal();
    }
  });
}

// Close day selection modal
function closeDaySelectionModal() {
  const overlay = document.getElementById('daySelectionOverlay');
  if (overlay) {
    overlay.remove();
  }
}

// Schedule route for a specific day (called from day selection modal)
async function scheduleRouteForDay(routeId, dayOfWeek) {
  closeDaySelectionModal();

  const route = routes.find(r => r.id === routeId);
  if (!route || !currentAircraftId) return;

  const aircraft = userFleet.find(a => a.id === currentAircraftId);
  if (!aircraft) return;

  // Use the route's scheduled departure time
  const departureTime = route.scheduledDepartureTime || '00:00:00';

  // Get the next occurrence of this day of week using game world time
  const worldTime = getCurrentWorldTime();
  if (!worldTime) {
    await showAlertModal('Error', 'World time not available. Please try again.');
    return;
  }

  const today = new Date(worldTime);
  const currentDay = today.getDay();
  const daysUntilTarget = getDaysUntilTargetInWeek(currentDay, dayOfWeek);
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntilTarget);
  const scheduleDate = formatLocalDate(targetDate);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[dayOfWeek];

  try {
    showLoadingModal('Scheduling Flight', `Adding flight for ${dayName}...`);

    const response = await fetch('/api/schedule/flight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routeId: route.id,
        aircraftId: currentAircraftId,
        scheduledDate: scheduleDate,
        departureTime: departureTime
      })
    });

    if (response.ok) {
      await loadSchedule();
      closeLoadingModal();
      closeAddRouteModal();
    } else {
      closeLoadingModal();
      const errorData = await response.json();

      // Check if this is a conflict error with details
      if (response.status === 409 && errorData.conflict) {
        await showConflictModal(errorData.conflict);
      } else {
        await showAlertModal('Scheduling Error', `Error: ${errorData.error || 'Unknown error'}`);
      }
    }
  } catch (error) {
    closeLoadingModal();
    console.error('Error scheduling flight:', error);
    await showAlertModal('Error', 'Failed to schedule flight. Please try again.');
  }
}

// Show schedule conflict modal with details
async function showConflictModal(conflict) {
  const existingModal = document.getElementById('conflictModal');
  if (existingModal) existingModal.remove();

  let conflictDetails = '';

  if (conflict.type === 'flight') {
    conflictDetails = `
      <div style="background: #21262d; border-radius: 6px; padding: 1rem; margin-bottom: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
          <span style="color: #f85149; font-size: 1.2rem;">✈</span>
          <span style="color: #f0f6fc; font-weight: 600; font-size: 1rem;">Conflicting Flight</span>
        </div>
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; font-size: 0.9rem;">
          <span style="color: #8b949e;">Route:</span>
          <span style="color: #58a6ff; font-weight: 600;">${conflict.routeNumber}${conflict.returnRouteNumber ? ' / ' + conflict.returnRouteNumber : ''}</span>
          <span style="color: #8b949e;">Sector:</span>
          <span style="color: #f0f6fc;">${conflict.departure} → ${conflict.arrival}</span>
          <span style="color: #8b949e;">Date:</span>
          <span style="color: #f0f6fc;">${conflict.date}</span>
          <span style="color: #8b949e;">Time:</span>
          <span style="color: #f0f6fc;">${conflict.departureTime} → ${conflict.arrivalTime}</span>
        </div>
      </div>
    `;
  } else if (conflict.type === 'maintenance') {
    const checkColors = { 'daily': '#3fb950', 'A': '#58a6ff', 'B': '#a371f7', 'C': '#f97316', 'D': '#f85149' };
    const checkColor = checkColors[conflict.checkType] || '#8b949e';

    conflictDetails = `
      <div style="background: #21262d; border-radius: 6px; padding: 1rem; margin-bottom: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
          <span style="color: ${checkColor}; font-size: 1.2rem;">🔧</span>
          <span style="color: #f0f6fc; font-weight: 600; font-size: 1rem;">Conflicting Maintenance</span>
        </div>
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; font-size: 0.9rem;">
          <span style="color: #8b949e;">Check Type:</span>
          <span style="color: ${checkColor}; font-weight: 600;">${conflict.checkName}</span>
          <span style="color: #8b949e;">Start Time:</span>
          <span style="color: #f0f6fc;">${conflict.startTime}</span>
          <span style="color: #8b949e;">Duration:</span>
          <span style="color: #f0f6fc;">${conflict.duration} minutes</span>
        </div>
      </div>
    `;
  }

  const modalHtml = `
    <div id="conflictModal" onclick="closeConflictModal()" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    ">
      <div onclick="event.stopPropagation()" style="
        background: #161b22;
        border: 1px solid #f85149;
        border-radius: 8px;
        min-width: 400px;
        max-width: 500px;
        box-shadow: 0 8px 32px rgba(248, 81, 73, 0.2);
      ">
        <div style="padding: 1rem 1.5rem; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; background: rgba(248, 81, 73, 0.1);">
          <h3 style="margin: 0; color: #f85149; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.3rem;">⚠️</span> Schedule Conflict
          </h3>
          <button onclick="closeConflictModal()" style="background: none; border: none; color: #8b949e; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
        </div>
        <div style="padding: 1.5rem;">
          <p style="color: #f0f6fc; margin: 0 0 1rem 0; font-size: 0.95rem;">
            This aircraft already has a scheduled duty that overlaps with the requested time slot.
          </p>
          ${conflictDetails}
          <p style="color: #8b949e; margin: 0; font-size: 0.85rem;">
            Please choose a different time slot or remove the conflicting schedule first.
          </p>
        </div>
        <div style="padding: 1rem 1.5rem; border-top: 1px solid #30363d; display: flex; justify-content: flex-end;">
          <button onclick="closeConflictModal()" style="
            padding: 0.5rem 1.5rem;
            background: #21262d;
            border: 1px solid #30363d;
            border-radius: 6px;
            color: #c9d1d9;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
          ">OK</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeConflictModal() {
  const modal = document.getElementById('conflictModal');
  if (modal) modal.remove();
}

// Get aircraft type key for comparison (e.g., "Airbus A350-1000")
function getAircraftTypeKey(aircraftData) {
  if (!aircraftData) return null;
  const manufacturer = aircraftData.manufacturer || '';
  const model = aircraftData.model || '';
  const variant = aircraftData.variant || '';
  return `${manufacturer} ${model}${variant ? '-' + variant : ''}`.trim() || null;
}

// Format days of week
function formatDaysOfWeek(daysArray) {
  if (!daysArray || daysArray.length === 0) return 'No days';
  if (daysArray.length === 7) return 'Daily';

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return daysArray.map(d => dayLabels[d]).join(' ');
}

// Filter routes by day (used in weekly view popup)
function filterRoutesByDay() {
  if (currentAircraftId) {
    loadUnassignedRoutes(currentAircraftId);
  }
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

// Get maintenance check status for an aircraft
function getCheckStatus(aircraft, checkType) {
  const worldTime = getCurrentWorldTime() || new Date();
  let lastCheckDate;
  let intervalDays;

  switch (checkType) {
    case 'daily':
      lastCheckDate = aircraft.lastDailyCheckDate;
      intervalDays = 2;
      break;
    case 'A':
      lastCheckDate = aircraft.lastACheckDate;
      intervalDays = aircraft.aCheckIntervalDays || 42;
      break;
    case 'B':
      lastCheckDate = aircraft.lastBCheckDate;
      intervalDays = aircraft.bCheckIntervalDays || 210;
      break;
    case 'C':
      lastCheckDate = aircraft.lastCCheckDate;
      intervalDays = aircraft.cCheckIntervalDays || 730;
      break;
    case 'D':
      lastCheckDate = aircraft.lastDCheckDate;
      intervalDays = aircraft.dCheckIntervalDays || 2920;
      break;
    default:
      return { status: 'none', text: 'N/A' };
  }

  if (!lastCheckDate) {
    return { status: 'none', text: 'Never', lastCheck: null, expiryDate: null, intervalDays };
  }

  const lastCheck = new Date(lastCheckDate);
  const expiryDate = new Date(lastCheck);
  expiryDate.setDate(expiryDate.getDate() + intervalDays);

  // All checks expire at end of day (23:59 UTC) on their calculated expiry date
  expiryDate.setUTCHours(23, 59, 59, 999);

  const now = worldTime;
  const warningThreshold = intervalDays * 0.1; // 10% of interval
  const warningDate = new Date(expiryDate);
  warningDate.setDate(warningDate.getDate() - warningThreshold);

  if (now > expiryDate) {
    return { status: 'expired', text: 'EXPIRED', lastCheck, expiryDate, intervalDays };
  } else if (now > warningDate) {
    return { status: 'warning', text: 'DUE SOON', lastCheck, expiryDate, intervalDays };
  } else {
    return { status: 'valid', text: 'Valid', lastCheck, expiryDate, intervalDays };
  }
}

// Format date for display
function formatCheckDate(date) {
  if (!date) return 'Never';
  const d = new Date(date);
  const day = d.getUTCDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hours = d.getUTCHours().toString().padStart(2, '0');
  const mins = d.getUTCMinutes().toString().padStart(2, '0');
  return `${day} ${month} ${year} ${hours}:${mins}`;
}

// Action: Schedule maintenance - shows overview modal
async function scheduleMaintenance(aircraftId) {
  const aircraft = userFleet.find(a => a.id === aircraftId);
  if (!aircraft) return;

  const worldTime = getCurrentWorldTime();
  if (!worldTime) {
    await showAlertModal('Error', 'World time not available. Please try again.');
    return;
  }

  // Get status for all check types
  const checks = [
    { type: 'daily', name: 'Daily Check', duration: '1 hour', color: '#FFA500', schedulable: true },
    { type: 'A', name: 'A Check', duration: '3 hours', color: '#17A2B8', schedulable: true },
    { type: 'B', name: 'B Check', duration: '6 hours', color: '#8B5CF6', schedulable: true },
    { type: 'C', name: 'C Check', duration: '14 days', color: '#6C757D', schedulable: false },
    { type: 'D', name: 'D Check', duration: '60 days', color: '#6C757D', schedulable: false }
  ];

  // Build check rows HTML
  const checkRowsHtml = checks.map(check => {
    const status = getCheckStatus(aircraft, check.type);
    const statusColors = {
      'valid': '#3fb950',
      'warning': '#d29922',
      'expired': '#f85149',
      'none': '#8b949e'
    };
    const statusColor = statusColors[status.status] || '#8b949e';

    const lastCheckText = status.lastCheck ? formatCheckDate(status.lastCheck) : 'Never';
    const expiryText = status.expiryDate ? formatCheckDate(status.expiryDate) : '-';

    // Auto toggle for schedulable checks, "Always" label for C/D
    const autoToggle = check.schedulable ? `
      <label style="position: relative; display: inline-block; width: 32px; height: 18px; cursor: pointer;">
        <input type="checkbox" class="auto-check-toggle" data-check-type="${check.type}" style="opacity: 0; width: 0; height: 0;">
        <span class="auto-toggle-slider" data-check-type="${check.type}" style="
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #4b5563;
          transition: 0.3s;
          border-radius: 18px;
        "></span>
        <span class="auto-toggle-knob" data-check-type="${check.type}" style="
          position: absolute;
          height: 12px;
          width: 12px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
        "></span>
      </label>
    ` : `<span style="color: #6b7280; font-size: 0.65rem;">Always</span>`;

    // Schedule button only for schedulable checks
    const scheduleBtn = check.schedulable ? `
      <button
        class="schedule-check-btn"
        data-check-type="${check.type}"
        data-aircraft-id="${aircraftId}"
        data-color="${check.color}"
        onclick="openScheduleCheckModal('${aircraftId}', '${check.type}')"
        style="padding: 0.35rem 0.6rem; background: ${check.color}; border: none; border-radius: 4px; color: white; font-size: 0.7rem; font-weight: 600; cursor: pointer;"
      >Schedule</button>
    ` : `<span style="color: #6b7280; font-size: 0.7rem;">-</span>`;

    return `
      <div style="display: grid; grid-template-columns: 95px 65px 1fr 1fr 45px 70px; gap: 0.5rem; align-items: center; padding: 0.65rem; background: var(--surface-elevated); border-radius: 6px; margin-bottom: 0.5rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="width: 10px; height: 10px; background: ${check.color}; border-radius: 2px; flex-shrink: 0;"></span>
          <span style="color: var(--text-primary); font-weight: 600; font-size: 0.8rem;">${check.name}</span>
        </div>
        <span style="color: ${statusColor}; font-weight: 600; font-size: 0.7rem;">${status.text}</span>
        <div style="font-size: 0.7rem;">
          <span style="color: #8b949e;">Last: </span>
          <span style="color: var(--text-primary);">${lastCheckText}</span>
        </div>
        <div style="font-size: 0.7rem;">
          <span style="color: #8b949e;">Until: </span>
          <span style="color: ${status.status === 'expired' ? '#f85149' : 'var(--text-primary)'};">${expiryText}</span>
        </div>
        <div style="display: flex; justify-content: center; align-items: center;">
          ${autoToggle}
        </div>
        <div style="text-align: right;">
          ${scheduleBtn}
        </div>
      </div>
    `;
  }).join('');

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

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: var(--surface);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
    width: 95%;
    max-width: 700px;
    max-height: 90vh;
    overflow-y: auto;
  `;

  modalContent.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <h2 style="margin: 0; color: var(--text-primary); font-size: 1.2rem;">MAINTENANCE STATUS</h2>
      <button onclick="document.getElementById('maintenanceModalOverlay').remove()" style="background: none; border: none; color: #8b949e; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: var(--surface-elevated); border-radius: 6px;">
      <div style="display: flex; align-items: center; gap: 1rem;">
        <div style="width: 40px; height: 40px; background: var(--accent-color); border-radius: 6px; display: flex; align-items: center; justify-content: center;">
          <span style="color: white; font-weight: 700; font-size: 0.9rem;">✈</span>
        </div>
        <div>
          <div style="color: var(--accent-color); font-weight: 700; font-size: 1.1rem;">${aircraft.registration}</div>
          <div style="color: #8b949e; font-size: 0.85rem;">${aircraft.aircraft?.manufacturer || ''} ${aircraft.aircraft?.model || ''}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; background: var(--surface); border: 1px solid var(--border-color); border-radius: 6px;">
        <span style="color: var(--text-secondary); font-size: 0.8rem; font-weight: 600;">Auto Schedule All</span>
        <label style="position: relative; display: inline-block; width: 40px; height: 22px; cursor: pointer;">
          <input type="checkbox" id="autoScheduleAll" style="opacity: 0; width: 0; height: 0;">
          <span id="autoScheduleAllSlider" style="
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #4b5563;
            transition: 0.3s;
            border-radius: 22px;
          "></span>
          <span id="autoScheduleAllKnob" style="
            position: absolute;
            content: '';
            height: 16px;
            width: 16px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: 0.3s;
            border-radius: 50%;
          "></span>
        </label>
      </div>
    </div>

    <div style="margin-bottom: 1rem;">
      <div style="display: grid; grid-template-columns: 95px 65px 1fr 1fr 45px 70px; gap: 0.5rem; padding: 0.5rem 0.65rem; color: #8b949e; font-size: 0.65rem; text-transform: uppercase; font-weight: 600;">
        <span>Check</span>
        <span>Status</span>
        <span>Last Completed</span>
        <span>Valid Until</span>
        <span style="text-align: center;">Auto</span>
        <span style="text-align: right;">Manual</span>
      </div>
      ${checkRowsHtml}
    </div>

    <div style="padding-top: 1rem; border-top: 1px solid var(--border-color); color: #8b949e; font-size: 0.75rem;">
      <p style="margin: 0;"><strong>Note:</strong> C and D checks are always auto-scheduled. Enable auto-scheduling for Daily, A, and B checks to have them scheduled automatically when due.</p>
    </div>
  `;

  overlay.appendChild(modalContent);
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  // Setup auto-schedule toggle interactions
  const autoAllCheckbox = document.getElementById('autoScheduleAll');
  const autoAllSlider = document.getElementById('autoScheduleAllSlider');
  const autoAllKnob = document.getElementById('autoScheduleAllKnob');
  const individualToggles = document.querySelectorAll('.auto-check-toggle');

  // Toggle visual state helper for main toggle (larger)
  function updateMainToggleVisual(checkbox, slider, knob) {
    if (checkbox.checked) {
      slider.style.backgroundColor = 'var(--accent-color)';
      knob.style.transform = 'translateX(18px)';
    } else {
      slider.style.backgroundColor = '#4b5563';
      knob.style.transform = 'translateX(0)';
    }
  }

  // Toggle visual state helper for individual toggles (smaller)
  function updateIndividualToggleVisual(checkType, isChecked) {
    const slider = document.querySelector(`.auto-toggle-slider[data-check-type="${checkType}"]`);
    const knob = document.querySelector(`.auto-toggle-knob[data-check-type="${checkType}"]`);
    if (slider && knob) {
      if (isChecked) {
        slider.style.backgroundColor = 'var(--accent-color)';
        knob.style.transform = 'translateX(14px)';
      } else {
        slider.style.backgroundColor = '#4b5563';
        knob.style.transform = 'translateX(0)';
      }
    }
  }

  // Update schedule button state based on auto toggle
  function updateScheduleButtonState(checkType, isAutoEnabled) {
    const btn = document.querySelector(`.schedule-check-btn[data-check-type="${checkType}"]`);
    if (btn) {
      if (isAutoEnabled) {
        btn.disabled = true;
        btn.style.background = '#4b5563';
        btn.style.cursor = 'not-allowed';
        btn.style.opacity = '0.5';
      } else {
        btn.disabled = false;
        btn.style.background = btn.getAttribute('data-color');
        btn.style.cursor = 'pointer';
        btn.style.opacity = '1';
      }
    }
  }

  // Auto Schedule All toggle handler
  autoAllCheckbox.addEventListener('change', () => {
    updateMainToggleVisual(autoAllCheckbox, autoAllSlider, autoAllKnob);
    // Toggle all individual checkboxes, visuals, and buttons
    individualToggles.forEach(toggle => {
      toggle.checked = autoAllCheckbox.checked;
      const checkType = toggle.getAttribute('data-check-type');
      updateIndividualToggleVisual(checkType, autoAllCheckbox.checked);
      updateScheduleButtonState(checkType, autoAllCheckbox.checked);
    });
  });

  // Individual toggle handlers - update visual, button, and "All" toggle state
  individualToggles.forEach(toggle => {
    toggle.addEventListener('change', () => {
      const checkType = toggle.getAttribute('data-check-type');
      updateIndividualToggleVisual(checkType, toggle.checked);
      updateScheduleButtonState(checkType, toggle.checked);

      const allChecked = Array.from(individualToggles).every(t => t.checked);
      const noneChecked = Array.from(individualToggles).every(t => !t.checked);

      if (allChecked) {
        autoAllCheckbox.checked = true;
        updateMainToggleVisual(autoAllCheckbox, autoAllSlider, autoAllKnob);
      } else if (noneChecked) {
        autoAllCheckbox.checked = false;
        updateMainToggleVisual(autoAllCheckbox, autoAllSlider, autoAllKnob);
      } else {
        // Partial state - uncheck the all toggle
        autoAllCheckbox.checked = false;
        updateMainToggleVisual(autoAllCheckbox, autoAllSlider, autoAllKnob);
      }
    });
  });
}

// Open the schedule check modal for a specific check type
function openScheduleCheckModal(aircraftId, checkType) {
  // Close the overview modal
  const overviewModal = document.getElementById('maintenanceModalOverlay');
  if (overviewModal) overviewModal.remove();

  const aircraft = userFleet.find(a => a.id === aircraftId);
  if (!aircraft) return;

  const worldTime = getCurrentWorldTime();
  if (!worldTime) return;

  const today = new Date(worldTime);
  const currentDay = today.getDay();

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'scheduleCheckModalOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 1001;
    display: flex;
    justify-content: center;
    align-items: center;
  `;

  const checkNames = { 'daily': 'Daily Check', 'A': 'A Check', 'B': 'B Check' };
  const checkDurations = { 'daily': '1 hour', 'A': '3 hours', 'B': '6 hours' };
  const checkColors = { 'daily': '#FFA500', 'A': '#17A2B8', 'B': '#8B5CF6' };
  const checkIntervals = { 'daily': '2 days', 'A': '6 weeks', 'B': '6-8 months' };

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOptionsHtml = dayNames.map((name, index) => {
    const isSelected = index === selectedDayOfWeek ? 'selected' : '';
    return `<option value="${index}" ${isSelected}>${name.toUpperCase()}</option>`;
  }).join('');

  const showRepeat = checkType === 'daily';

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: var(--surface);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1.5rem;
    width: 90%;
    max-width: 450px;
  `;

  modalContent.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span style="width: 16px; height: 16px; background: ${checkColors[checkType]}; border-radius: 3px;"></span>
        <h2 style="margin: 0; color: var(--text-primary); font-size: 1.1rem;">Schedule ${checkNames[checkType]}</h2>
      </div>
      <button onclick="document.getElementById('scheduleCheckModalOverlay').remove()" style="background: none; border: none; color: #8b949e; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
    </div>

    <p style="margin-bottom: 1.5rem; color: var(--text-secondary); font-size: 0.9rem;">
      Aircraft: <strong style="color: var(--accent-color);">${aircraft.registration}</strong>
      <span style="margin-left: 1rem; color: #8b949e;">Duration: ${checkDurations[checkType]} • Interval: ${checkIntervals[checkType]}</span>
    </p>

    <div style="margin-bottom: 1.25rem;">
      <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600; font-size: 0.85rem;">Day</label>
      <select id="scheduleDay" style="width: 100%; padding: 0.65rem; background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 0.95rem;">
        ${dayOptionsHtml}
      </select>
    </div>

    <div style="margin-bottom: 1.25rem;">
      <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600; font-size: 0.85rem;">Start Time</label>
      <input type="time" id="scheduleTime" value="00:00" style="width: 100%; padding: 0.65rem; background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 0.95rem;" />
    </div>

    ${showRepeat ? `
    <div style="margin-bottom: 1.25rem;">
      <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); cursor: pointer;">
        <input type="checkbox" id="scheduleRepeat" checked style="width: 16px; height: 16px; cursor: pointer;" />
        <span style="font-weight: 600; font-size: 0.85rem;">Repeat every day at this time</span>
      </label>
    </div>
    ` : ''}

    <div style="margin-bottom: 1.25rem; padding: 0.65rem; background: rgba(88, 166, 255, 0.1); border: 1px solid rgba(88, 166, 255, 0.2); border-radius: 6px; display: flex; align-items: center; gap: 0.75rem;">
      <span style="color: var(--text-secondary); font-size: 0.8rem;">Aircraft Available:</span>
      <span id="scheduleAvailableTime" style="color: #58a6ff; font-weight: 600; font-size: 0.9rem;">--:--</span>
    </div>

    <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
      <button id="cancelScheduleBtn" style="padding: 0.6rem 1.25rem; background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-secondary); cursor: pointer; font-size: 0.9rem;">Cancel</button>
      <button id="confirmScheduleBtn" style="padding: 0.6rem 1.25rem; background: ${checkColors[checkType]}; border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: 600; font-size: 0.9rem;">Schedule</button>
    </div>
  `;

  overlay.appendChild(modalContent);
  document.body.appendChild(overlay);

  // Update available time
  const durations = { 'daily': 60, 'A': 180, 'B': 360 };
  function updateAvailableTime() {
    const startTime = document.getElementById('scheduleTime').value;
    const endTime = calculateEndTime(startTime, durations[checkType]);
    document.getElementById('scheduleAvailableTime').textContent = endTime;
  }
  document.getElementById('scheduleTime').addEventListener('change', updateAvailableTime);
  updateAvailableTime();

  // Cancel button
  document.getElementById('cancelScheduleBtn').addEventListener('click', () => {
    overlay.remove();
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  // Confirm button
  document.getElementById('confirmScheduleBtn').addEventListener('click', async () => {
    const selectedDay = parseInt(document.getElementById('scheduleDay').value);
    const startTime = document.getElementById('scheduleTime').value;
    const repeatCheck = showRepeat ? document.getElementById('scheduleRepeat')?.checked : false;

    if (!startTime) {
      await showAlertModal('Validation Error', 'Please select a start time');
      return;
    }

    const daysUntilSelected = getDaysUntilTargetInWeek(currentDay, selectedDay);
    const selectedTargetDate = new Date(today);
    selectedTargetDate.setDate(today.getDate() + daysUntilSelected);
    const selectedDateStr = formatLocalDate(selectedTargetDate);

    try {
      overlay.remove();
      showLoadingOverlay(`Scheduling ${checkNames[checkType]}...`);

      const response = await fetch('/api/schedule/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraftId,
          checkType,
          scheduledDate: selectedDateStr,
          startTime,
          repeat: repeatCheck
        })
      });

      if (response.ok) {
        await loadSchedule();
        hideLoadingOverlay();
      } else {
        hideLoadingOverlay();
        const errorData = await response.json();
        if (response.status === 409 && errorData.conflict) {
          await showConflictModal(errorData.conflict);
        } else {
          await showAlertModal('Scheduling Error', `Error scheduling maintenance: ${errorData.error}`);
        }
      }
    } catch (error) {
      hideLoadingOverlay();
      console.error('Error scheduling maintenance:', error);
      await showAlertModal('Error', 'Error scheduling maintenance. Please try again.');
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

// Clear all scheduled flights for an aircraft on the selected day
async function clearDaySchedule(aircraftId) {
  const aircraft = userFleet.find(a => a.id === aircraftId);
  if (!aircraft) return;

  // Get flights for this aircraft on the selected day
  const dayFlights = scheduledFlights.filter(f => {
    if (f.aircraft?.id !== aircraftId) return false;
    if (!f.scheduledDate) return false;
    const flightDate = new Date(f.scheduledDate + 'T00:00:00');
    return flightDate.getDay() === selectedDayOfWeek;
  });

  // Get maintenance for this aircraft on the selected day
  const dayMaint = scheduledMaintenance.filter(m => {
    if (m.aircraft?.id !== aircraftId) return false;
    if (!m.scheduledDate) return false;
    const maintDate = new Date(m.scheduledDate + 'T00:00:00');
    return maintDate.getDay() === selectedDayOfWeek;
  });

  const totalItems = dayFlights.length + dayMaint.length;

  if (totalItems === 0) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    await showAlertModal('No Schedule', `${aircraft.registration} has no flights or maintenance scheduled for ${dayNames[selectedDayOfWeek]}.`);
    return;
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const confirmed = await showConfirmModal(
    'Clear Day Schedule',
    `Clear all scheduled items for ${aircraft.registration} on ${dayNames[selectedDayOfWeek]}?\n\nThis will delete:\n• ${dayFlights.length} flight(s)\n• ${dayMaint.length} maintenance check(s)\n\nThis action cannot be undone.`
  );

  if (!confirmed) return;

  try {
    showLoadingModal('Clearing Schedule', `Removing ${totalItems} item(s)...`);

    // Delete flights
    for (const flight of dayFlights) {
      await fetch(`/api/schedule/flight/${flight.id}`, { method: 'DELETE' });
    }

    // Delete maintenance
    for (const maint of dayMaint) {
      await fetch(`/api/schedule/maintenance/${maint.id}`, { method: 'DELETE' });
    }

    await loadSchedule();
    closeLoadingModal();
  } catch (error) {
    closeLoadingModal();
    console.error('Error clearing day schedule:', error);
    await showAlertModal('Error', 'Failed to clear schedule. Please try again.');
  }
}

// Clear all scheduled flights for an aircraft for the entire week
async function clearWeekSchedule(aircraftId) {
  const aircraft = userFleet.find(a => a.id === aircraftId);
  if (!aircraft) return;

  // Get all flights for this aircraft in the current week data
  const weekFlights = scheduledFlights.filter(f => f.aircraft?.id === aircraftId);

  // Get all maintenance for this aircraft in the current week data
  const weekMaint = scheduledMaintenance.filter(m => m.aircraft?.id === aircraftId);

  const totalItems = weekFlights.length + weekMaint.length;

  if (totalItems === 0) {
    await showAlertModal('No Schedule', `${aircraft.registration} has no flights or maintenance scheduled this week.`);
    return;
  }

  const confirmed = await showConfirmModal(
    'Clear Week Schedule',
    `Clear ALL scheduled items for ${aircraft.registration} this week?\n\nThis will delete:\n• ${weekFlights.length} flight(s)\n• ${weekMaint.length} maintenance check(s)\n\nThis action cannot be undone.`
  );

  if (!confirmed) return;

  try {
    showLoadingModal('Clearing Week Schedule', `Removing ${totalItems} item(s)...`);

    // Delete flights
    for (const flight of weekFlights) {
      await fetch(`/api/schedule/flight/${flight.id}`, { method: 'DELETE' });
    }

    // Delete maintenance
    for (const maint of weekMaint) {
      await fetch(`/api/schedule/maintenance/${maint.id}`, { method: 'DELETE' });
    }

    await loadSchedule();
    closeLoadingModal();
  } catch (error) {
    closeLoadingModal();
    console.error('Error clearing week schedule:', error);
    await showAlertModal('Error', 'Failed to clear schedule. Please try again.');
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

  // Check if route has an assigned aircraft type requirement (using full type key)
  const routeAircraftType = getAircraftTypeKey(draggedRoute.assignedAircraft?.aircraft);
  const targetAircraftType = getAircraftTypeKey(aircraft?.aircraft);

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

// Handle drag over for weekly view cells
function handleWeeklyDragOver(event, dayOfWeek) {
  if (!draggedRoute) return;

  event.preventDefault();
  event.stopPropagation();

  const cell = event.currentTarget;
  const aircraftId = cell.getAttribute('data-aircraft-id');

  // Find the aircraft in the fleet
  const aircraft = userFleet.find(a => a.id === aircraftId);

  // Check if route has an assigned aircraft type requirement (using full type key)
  const routeAircraftType = getAircraftTypeKey(draggedRoute.assignedAircraft?.aircraft);
  const targetAircraftType = getAircraftTypeKey(aircraft?.aircraft);

  // Check if aircraft types match
  const aircraftTypeMatch = !routeAircraftType || routeAircraftType === targetAircraftType;

  // Check if route operates on this day
  const routeOperatesOnDay = draggedRoute.daysOfWeek && (
    draggedRoute.daysOfWeek.includes(dayOfWeek) || draggedRoute.daysOfWeek.length === 7
  );

  const canDrop = aircraftTypeMatch && routeOperatesOnDay;

  // Clear all highlighting in the table first
  document.querySelectorAll('.weekly-cell').forEach(c => {
    c.classList.remove('drag-over');
    c.style.background = '';
  });

  // Highlight only cells for compatible aircraft in this day column
  if (routeOperatesOnDay) {
    event.dataTransfer.dropEffect = canDrop ? 'move' : 'none';

    // Find all compatible aircraft IDs
    const compatibleAircraftIds = userFleet
      .filter(a => !routeAircraftType || getAircraftTypeKey(a.aircraft) === routeAircraftType)
      .map(a => a.id);

    // Highlight cells in this day column only for compatible aircraft
    document.querySelectorAll(`.weekly-cell[data-day="${dayOfWeek}"]`).forEach(c => {
      const cellAircraftId = c.getAttribute('data-aircraft-id');
      if (compatibleAircraftIds.includes(cellAircraftId)) {
        c.classList.add('drag-over');
      }
    });

    // If current cell is not compatible, show red highlight
    if (!aircraftTypeMatch) {
      cell.style.background = 'rgba(220, 53, 69, 0.3)';
    }
  } else {
    event.dataTransfer.dropEffect = 'none';
    // Show as invalid - highlight the hovered cell red
    cell.style.background = 'rgba(220, 53, 69, 0.3)';
  }

  // Update drag preview
  const preview = document.getElementById('dragPreview');
  const routeTime = draggedRoute.scheduledDepartureTime ? draggedRoute.scheduledDepartureTime.substring(0, 5) : '--:--';
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  let statusText = '';
  if (!aircraftTypeMatch) {
    statusText = ' ⚠ INCOMPATIBLE AIRCRAFT';
  } else if (!routeOperatesOnDay) {
    statusText = ` ⚠ NOT SCHEDULED FOR ${dayNames[dayOfWeek].toUpperCase()}`;
  }

  preview.textContent = `${draggedRoute.routeNumber} / ${draggedRoute.returnRouteNumber} @ ${routeTime}${statusText}`;
}

// Handle drag leave for weekly view cells
function handleWeeklyDragLeave(event) {
  event.preventDefault();

  // Check if we're actually leaving the table area
  const relatedTarget = event.relatedTarget;
  const isStillInWeeklyCell = relatedTarget && relatedTarget.closest('.weekly-cell');

  if (!isStillInWeeklyCell) {
    // Clear all weekly cell highlights
    document.querySelectorAll('.weekly-cell').forEach(c => {
      c.classList.remove('drag-over');
      c.style.background = '';
    });
  }
}

// Handle drop for weekly view cells
async function handleWeeklyDrop(event, aircraftId, dayOfWeek) {
  event.preventDefault();
  event.stopPropagation();

  // Clear all weekly cell highlights
  document.querySelectorAll('.weekly-cell').forEach(c => {
    c.classList.remove('drag-over');
    c.style.background = '';
  });

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

  // Check if route has an assigned aircraft type requirement (using full type key)
  const routeAircraftType = getAircraftTypeKey(draggedRoute.assignedAircraft?.aircraft);
  const targetAircraftType = getAircraftTypeKey(aircraft?.aircraft);

  if (routeAircraftType && routeAircraftType !== targetAircraftType) {
    await showAlertModal('Aircraft Type Mismatch', `This route requires a ${routeAircraftType} aircraft. ${aircraft.registration} is a ${targetAircraftType}.`);
    draggedRoute = null;
    return;
  }

  // Check if route operates on this day
  const routeOperatesOnDay = draggedRoute.daysOfWeek && (
    draggedRoute.daysOfWeek.includes(dayOfWeek) || draggedRoute.daysOfWeek.length === 7
  );

  if (!routeOperatesOnDay) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    await showAlertModal('Schedule Conflict', `This route does not operate on ${dayNames[dayOfWeek]}. It operates on: ${formatDaysOfWeek(draggedRoute.daysOfWeek)}`);
    draggedRoute = null;
    return;
  }

  // Use the route's scheduled departure time
  const departureTime = draggedRoute.scheduledDepartureTime || '00:00:00';

  // Get the next occurrence of this day of week using game world time (rolling week)
  const worldTime = getCurrentWorldTime();
  if (!worldTime) {
    await showAlertModal('Error', 'World time not available. Please try again.');
    draggedRoute = null;
    return;
  }

  const today = new Date(worldTime);
  const currentDay = today.getDay();
  const daysUntilTarget = getDaysUntilTargetInWeek(currentDay, dayOfWeek);
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntilTarget);
  const scheduleDate = formatLocalDate(targetDate);

  // Get day name for confirmation
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[dayOfWeek];
  const timeStr = departureTime.substring(0, 5);

  // Confirm scheduling
  const confirmed = await showConfirmModal(
    'Confirm Schedule',
    `Schedule route ${draggedRoute.routeNumber} / ${draggedRoute.returnRouteNumber} on ${aircraft.registration} for ${dayName} at ${timeStr}?`
  );

  if (!confirmed) {
    draggedRoute = null;
    return;
  }

  try {
    showLoadingModal('Scheduling Flight', `Adding flight for ${dayName}...`);

    const response = await fetch('/api/schedule/flight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routeId: draggedRoute.id,
        aircraftId: aircraftId,
        scheduledDate: scheduleDate,
        departureTime: departureTime
      })
    });

    if (response.ok) {
      await loadSchedule();
      closeLoadingModal();
      closeAddRouteModal();
    } else {
      closeLoadingModal();
      const error = await response.json();
      await showAlertModal('Scheduling Error', `Error: ${error.error || 'Unknown error'}`);
    }
  } catch (error) {
    closeLoadingModal();
    console.error('Error scheduling flight:', error);
    await showAlertModal('Error', 'Failed to schedule flight. Please try again.');
  }

  draggedRoute = null;
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

  // Check if route has an assigned aircraft type requirement (using full type key)
  const routeAircraftType = getAircraftTypeKey(draggedRoute.assignedAircraft?.aircraft);
  const targetAircraftType = getAircraftTypeKey(aircraft?.aircraft);

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
        const errorData = await response.json();
        // Check if this is a conflict error with details
        if (response.status === 409 && errorData.conflict) {
          await showConflictModal(errorData.conflict);
          draggedRoute = null;
          return;
        }
        throw new Error(errorData.error || 'Failed to schedule flight');
      }

      const scheduledFlight = await response.json();
      // Add the new flight to the array immediately to avoid full reload
      scheduledFlights.push(scheduledFlight);
    }

    closeAddRouteModal();
    draggedRoute = null;

    // Full reload to ensure all flight data is properly loaded from server
    await loadSchedule();
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
          // Remove the "Loading..." placeholder option if it exists
          const loadingOption = daySelect.querySelector('option[value=""]');
          if (loadingOption) {
            loadingOption.remove();
          }
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

// Update the red timeline position - supports both daily and weekly views
function updateTimeline() {
  const currentTime = getCurrentWorldTime();
  if (!currentTime) return;

  const currentDay = currentTime.getDay();
  const container = document.getElementById('scheduleGrid');
  const table = container?.querySelector('table');
  const headerRow = table?.querySelector('thead tr');
  if (!container || !table || !headerRow) return;

  // Get all header cells
  const headerCells = Array.from(headerRow.querySelectorAll('th'));
  if (headerCells.length < 3) return;

  // Find the time/day column cells (skip first AIRCRAFT column and last ACTIONS column)
  const dataColumns = headerCells.slice(1, -1);

  // Calculate current time of day as fraction
  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const seconds = currentTime.getSeconds();
  const totalHours = hours + (minutes / 60) + (seconds / 3600);
  const dayFraction = totalHours / 24; // Fraction through the day (0-1)

  let targetColumnCell, fractionalPosition;

  if (viewMode === 'weekly') {
    // Weekly view: find today's column by day of week
    // Days are ordered Mon(1), Tue(2), Wed(3), Thu(4), Fri(5), Sat(6), Sun(0)
    const dayOrder = [1, 2, 3, 4, 5, 6, 0];
    const todayIndex = dayOrder.indexOf(currentDay);
    if (todayIndex === -1) return;

    targetColumnCell = dataColumns[todayIndex];
    fractionalPosition = dayFraction; // Position within the day column
  } else {
    // Daily view: only show if viewing today
    if (currentDay !== selectedDayOfWeek) {
      const existingTimeline = document.getElementById('scheduleTimeline');
      if (existingTimeline) existingTimeline.remove();
      return;
    }

    // Find which hour column
    const currentHourIndex = Math.floor(totalHours);
    fractionalPosition = totalHours - currentHourIndex;
    targetColumnCell = dataColumns[currentHourIndex];
  }

  if (!targetColumnCell) return;

  // Use getBoundingClientRect to get exact rendered positions
  const containerRect = container.getBoundingClientRect();
  const columnRect = targetColumnCell.getBoundingClientRect();

  // Calculate the exact visual position of the timeline on screen
  const timelineVisualX = columnRect.left + (fractionalPosition * columnRect.width);

  // Get the AIRCRAFT column to determine where the schedule time area starts
  const aircraftColumn = headerCells[0];
  const aircraftColumnRect = aircraftColumn.getBoundingClientRect();
  const scheduleAreaLeft = aircraftColumnRect.right;

  // Get the ACTIONS column to determine where the schedule time area ends
  const actionsColumn = headerCells[headerCells.length - 1];
  const actionsColumnRect = actionsColumn.getBoundingClientRect();
  const scheduleAreaRight = actionsColumnRect.left;

  // Check if the current time position is within the visible schedule area
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
  let timelineLeft = columnRect.left - containerRect.left;
  timelineLeft += fractionalPosition * columnRect.width;

  // Update position
  timeline.style.left = `${timelineLeft}px`;
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
