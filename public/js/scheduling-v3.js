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
let maintenanceDetailsUpdateInterval = null; // Interval for auto-updating maintenance details modal
let currentMaintenanceModalId = null; // Track which maintenance modal is open
let aircraftStatusUpdateInterval = null; // Interval for updating GROUNDED/IN MAINT badges

// Wind/timing constants and calculations now in shared flight-timing.js

// Generate deterministic random interval for C and D checks based on aircraft ID
// C check: 18-24 months (548-730 days)
// D check: 6-10 years (2190-3650 days)
function getCheckIntervalForAircraft(aircraftId, checkType) {
  // Create a hash from aircraft ID to get consistent "random" value
  let hash = 0;
  const str = aircraftId + checkType;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  hash = Math.abs(hash);

  if (checkType === 'C') {
    // 18-24 months = 548-730 days
    const minDays = 548;
    const maxDays = 730;
    return minDays + (hash % (maxDays - minDays + 1));
  } else if (checkType === 'D') {
    // 6-10 years = 2190-3650 days
    const minDays = 2190;
    const maxDays = 3650;
    return minDays + (hash % (maxDays - minDays + 1));
  }

  return null;
}

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

    // Parse departure time and calculate arrival datetime (use local time to match world time)
    const depDate = new Date(flight.scheduledDate + 'T00:00:00');
    const depTimeStr = flight.departureTime?.substring(0, 5) || '00:00';
    const [depH, depM] = depTimeStr.split(':').map(Number);
    const depDateTime = new Date(depDate.getFullYear(), depDate.getMonth(), depDate.getDate(), depH, depM);
    const arrDateTime = new Date(depDateTime.getTime() + totalMinutes * 60000);

    const arrYear = arrDateTime.getFullYear();
    const arrMonth = String(arrDateTime.getMonth() + 1).padStart(2, '0');
    const arrDay = String(arrDateTime.getDate()).padStart(2, '0');
    return `${arrYear}-${arrMonth}-${arrDay}`;
  } catch (e) {
    console.error('Error calculating arrival date:', e, flight);
    return flight.scheduledDate; // Fallback to same day on error
  }
}

// Calculate days until target day of week
// FORWARD-ONLY: Shows a week from today through 6 days ahead
// If the target day has passed this week, shows next week's occurrence
// This ensures display and scheduling are always consistent
function getDaysUntilTargetInWeek(currentDay, selectedDayOfWeek) {
  let diff = selectedDayOfWeek - currentDay;

  // If the day has already passed this week (diff < 0), go to next week
  if (diff < 0) {
    diff += 7;
  }

  return diff;
}

// Alias for scheduling - same forward-only logic
function getDaysUntilTargetForScheduling(currentDay, selectedDayOfWeek) {
  return getDaysUntilTargetInWeek(currentDay, selectedDayOfWeek);
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

// getWindMultiplier, getRouteVariation, calculateFlightMinutes now in shared flight-timing.js

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

  // Weekly checks - valid for 7-8 days
  // No warning needed for weekly checks since they're less frequent than daily

  return warnings;
}

// Check if any maintenance checks are expired OR in progress (aircraft cannot fly)
function getExpiredChecks(aircraft) {
  const expired = [];
  const checkTypes = ['daily', 'weekly', 'A', 'C', 'D'];
  const checkNames = {
    'daily': 'Daily Check',
    'weekly': 'Weekly Check',
    'A': 'A Check',
    'C': 'C Check',
    'D': 'D Check'
  };

  for (const checkType of checkTypes) {
    const status = getCheckStatusSimple(aircraft, checkType);
    // Aircraft is grounded if check is expired OR never performed
    if (status === 'expired' || status === 'none') {
      expired.push({ type: checkType, name: checkNames[checkType] });
    }
  }

  // Also check for maintenance IN PROGRESS - aircraft cannot fly during active maintenance
  const inProgressMaintenance = getInProgressMaintenance(aircraft.id);

  // Determine what check types are covered by in-progress maintenance (cascading)
  // D check covers: C, A, weekly, daily
  // C check covers: A, weekly, daily
  // A check covers: weekly, daily
  // weekly check covers: daily
  const coveredByInProgress = new Set();
  for (const maint of inProgressMaintenance) {
    coveredByInProgress.add(maint.checkType);
    // Add cascading coverage
    if (maint.checkType === 'D') {
      coveredByInProgress.add('C');
      coveredByInProgress.add('A');
      coveredByInProgress.add('weekly');
      coveredByInProgress.add('daily');
    } else if (maint.checkType === 'C') {
      coveredByInProgress.add('A');
      coveredByInProgress.add('weekly');
      coveredByInProgress.add('daily');
    } else if (maint.checkType === 'A') {
      coveredByInProgress.add('weekly');
      coveredByInProgress.add('daily');
    } else if (maint.checkType === 'weekly') {
      coveredByInProgress.add('daily');
    }
  }

  // Mark all covered checks as in-progress
  for (const checkType of coveredByInProgress) {
    const checkName = checkNames[checkType] || `${checkType} Check`;
    const existingEntry = expired.find(e => e.type === checkType);
    if (existingEntry) {
      // Mark the existing expired entry as in-progress (maintenance has started or is covered)
      existingEntry.inProgress = true;
    } else {
      expired.push({ type: checkType, name: checkName, inProgress: true });
    }
  }

  return expired;
}

// Check if maintenance covering the given check types is scheduled within the next N hours
function hasUpcomingMaintenance(aircraftId, expiredCheckTypes) {
  const worldTime = getCurrentWorldTime() || new Date();

  // Build set of check types that would cover any expired check (cascading)
  const coveringTypes = new Set();
  for (const ct of expiredCheckTypes) {
    coveringTypes.add(ct);
    // Higher checks cover lower ones
    if (ct === 'daily') { coveringTypes.add('weekly'); coveringTypes.add('A'); coveringTypes.add('C'); coveringTypes.add('D'); }
    else if (ct === 'weekly') { coveringTypes.add('A'); coveringTypes.add('C'); coveringTypes.add('D'); }
    else if (ct === 'A') { coveringTypes.add('C'); coveringTypes.add('D'); }
    else if (ct === 'C') { coveringTypes.add('D'); }
  }

  // Check if ANY maintenance of covering type is scheduled (today or any future day)
  // This hides PERFORM NOW when auto-scheduling has already planned the checks
  return scheduledMaintenance.some(m => {
    const maintAircraftId = m.aircraftId || m.aircraft?.id;
    if (maintAircraftId != aircraftId) return false;
    if (m.status === 'completed' || m.status === 'inactive') return false;
    if (m.isOngoing) return false;
    if (!coveringTypes.has(m.checkType)) return false;

    // Get scheduled date
    let scheduledDate;
    if (m.scheduledDate instanceof Date) {
      scheduledDate = m.scheduledDate;
    } else if (m.scheduledDate) {
      scheduledDate = new Date(m.scheduledDate);
    } else {
      return false;
    }

    // Parse start time and combine with date
    const startTimeStr = m.startTime instanceof Date
      ? m.startTime.toTimeString().split(' ')[0]
      : String(m.startTime || '00:00:00');
    const [startH, startM] = startTimeStr.split(':').map(Number);

    const maintDateTime = new Date(scheduledDate);
    maintDateTime.setHours(startH, startM, 0, 0);

    // Check if maintenance is scheduled in the future (or currently happening)
    const duration = m.duration || 30;
    const maintEndTime = new Date(maintDateTime.getTime() + duration * 60000);

    // Return true if maintenance hasn't ended yet (covers scheduled and in-progress)
    return maintEndTime > worldTime;
  });
}

// Check if aircraft has maintenance currently in progress
function getInProgressMaintenance(aircraftId) {
  const worldTime = getCurrentWorldTime() || new Date();
  // Use local time methods to match the displayed game clock (not UTC)
  const today = formatLocalDate(worldTime);
  const currentMinutes = worldTime.getHours() * 60 + worldTime.getMinutes();

  return scheduledMaintenance.filter(m => {
    // Handle both m.aircraftId and m.aircraft.id patterns
    const maintAircraftId = m.aircraftId || m.aircraft?.id;
    // Status can be 'active', 'scheduled', or undefined (all are valid for checking in-progress)
    if (maintAircraftId != aircraftId) return false; // Use != for type-coercive comparison
    if (m.status === 'completed' || m.status === 'inactive') return false;

    // Skip "ongoing" display blocks - they're copies for multi-day display
    // Only check the primary block (where scheduledDate matches displayDate or isOngoing is false)
    if (m.isOngoing) return false;

    // Get scheduled date (could be Date object or string)
    let scheduledDate;
    if (m.scheduledDate instanceof Date) {
      scheduledDate = formatLocalDate(m.scheduledDate);
    } else if (m.scheduledDate) {
      scheduledDate = m.scheduledDate.split('T')[0];
    } else {
      return false; // No scheduled date
    }

    // Parse start time
    const startTimeStr = m.startTime instanceof Date
      ? m.startTime.toTimeString().split(' ')[0]
      : String(m.startTime || '00:00:00');
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const startMinutes = startH * 60 + startM;

    // Calculate end date/time
    const duration = m.duration || 60;
    const endMinutes = startMinutes + duration;
    const daysSpanned = Math.floor(endMinutes / 1440);
    const endMinuteOfDay = endMinutes % 1440;

    // Calculate completion date using local time
    const startDate = new Date(scheduledDate + 'T12:00:00'); // Use noon to avoid DST issues
    startDate.setDate(startDate.getDate() + daysSpanned);
    const completionDateStr = formatLocalDate(startDate);

    // Check if maintenance has started (today >= scheduledDate AND time >= startTime)
    const hasStarted = today > scheduledDate ||
      (today === scheduledDate && currentMinutes >= startMinutes);

    // Check if maintenance has completed (today > completionDate OR (today == completionDate AND time >= endTime))
    const hasCompleted = today > completionDateStr ||
      (today === completionDateStr && currentMinutes >= endMinuteOfDay);

    // Maintenance is in progress if it has started but not completed
    return hasStarted && !hasCompleted;
  });
}

// Check if a maintenance check has completed for this aircraft (past its end time)
// Returns true if any matching check (or cascading higher check) has completed
function hasMaintenanceJustCompleted(aircraftId, checkType) {
  const worldTime = getCurrentWorldTime() || new Date();
  const today = formatLocalDate(worldTime);
  const currentMinutes = worldTime.getHours() * 60 + worldTime.getMinutes();

  // A higher check covers lower ones: D→C→A→weekly→daily
  const coveringTypes = {
    'daily': ['daily', 'weekly', 'A', 'C', 'D'],
    'weekly': ['weekly', 'A', 'C', 'D'],
    'A': ['A', 'C', 'D'],
    'C': ['C', 'D'],
    'D': ['D']
  };
  const validTypes = coveringTypes[checkType] || [checkType];

  return scheduledMaintenance.some(m => {
    const maintAircraftId = m.aircraftId || m.aircraft?.id;
    if (maintAircraftId != aircraftId) return false;
    if (m.status === 'completed' || m.status === 'inactive') return false;
    if (m.isOngoing) return false;
    if (!validTypes.includes(m.checkType)) return false;

    let scheduledDate;
    if (m.scheduledDate instanceof Date) {
      scheduledDate = formatLocalDate(m.scheduledDate);
    } else if (m.scheduledDate) {
      scheduledDate = m.scheduledDate.split('T')[0];
    } else return false;

    const startTimeStr = m.startTime instanceof Date
      ? m.startTime.toTimeString().split(' ')[0]
      : String(m.startTime || '00:00:00');
    const [startH, startM] = startTimeStr.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = startMinutes + (m.duration || 30);
    const daysSpanned = Math.floor(endMinutes / 1440);
    const endMinuteOfDay = endMinutes % 1440;

    const startDate = new Date(scheduledDate + 'T12:00:00');
    startDate.setDate(startDate.getDate() + daysSpanned);
    const completionDateStr = formatLocalDate(startDate);

    // Has the maintenance completed?
    return today > completionDateStr ||
      (today === completionDateStr && currentMinutes >= endMinuteOfDay);
  });
}

// Simplified check status for expired detection (avoids circular dependency with full getCheckStatus)
function getCheckStatusSimple(aircraft, checkType) {
  const worldTime = getCurrentWorldTime() || new Date();

  // A check is hours-based
  if (checkType === 'A') {
    if (!aircraft.lastACheckDate) return 'none';
    const lastACheckHours = parseFloat(aircraft.lastACheckHours) || 0;
    const currentFlightHours = parseFloat(aircraft.totalFlightHours) || 0;
    const intervalHours = aircraft.aCheckIntervalHours || getCheckIntervalForAircraft(aircraft.id, 'A');
    const hoursSinceCheck = currentFlightHours - lastACheckHours;
    const hoursUntilDue = intervalHours - hoursSinceCheck;
    if (hoursUntilDue < 0) {
      // Check if maintenance has just completed (DB updated but frontend cache stale)
      if (hasMaintenanceJustCompleted(aircraft.id, checkType)) {
        aircraft.lastACheckDate = worldTime;
        aircraft.lastACheckHours = currentFlightHours;
        return 'valid';
      }
      return 'expired';
    }
    return 'valid';
  }

  // Days-based checks
  let lastCheckDate;
  let intervalDays;
  let lastCheckField;

  switch (checkType) {
    case 'daily':
      lastCheckDate = aircraft.lastDailyCheckDate;
      lastCheckField = 'lastDailyCheckDate';
      intervalDays = 1; // Valid check day + next day
      break;
    case 'weekly':
      lastCheckDate = aircraft.lastWeeklyCheckDate;
      lastCheckField = 'lastWeeklyCheckDate';
      intervalDays = 8;
      break;
    case 'C':
      lastCheckDate = aircraft.lastCCheckDate;
      lastCheckField = 'lastCCheckDate';
      intervalDays = aircraft.cCheckIntervalDays || 730;
      break;
    case 'D':
      lastCheckDate = aircraft.lastDCheckDate;
      lastCheckField = 'lastDCheckDate';
      intervalDays = aircraft.dCheckIntervalDays || getCheckIntervalForAircraft(aircraft.id, 'D');
      break;
    default:
      return 'none';
  }

  if (!lastCheckDate) {
    // No check date at all - check if maintenance has just completed
    if (hasMaintenanceJustCompleted(aircraft.id, checkType)) {
      aircraft[lastCheckField] = worldTime;
      return 'valid';
    }
    return 'none';
  }

  const lastCheck = new Date(lastCheckDate);
  const expiryDate = new Date(lastCheck);
  expiryDate.setDate(expiryDate.getDate() + intervalDays);
  expiryDate.setUTCHours(23, 59, 59, 999);

  const hoursUntilExpiry = (expiryDate - worldTime) / (1000 * 60 * 60);
  if (hoursUntilExpiry < 0) {
    // Check if maintenance has just completed (DB updated but frontend cache stale)
    if (hasMaintenanceJustCompleted(aircraft.id, checkType)) {
      aircraft[lastCheckField] = worldTime;
      return 'valid';
    }
    return 'expired';
  }
  return 'valid';
}

// Update GROUNDED/IN MAINT badges live as maintenance completes or starts
function updateAircraftStatusBadges() {
  // Find all aircraft rows with data-aircraft-id
  const rows = document.querySelectorAll('tr[data-aircraft-id]');
  if (rows.length === 0) return;

  rows.forEach(row => {
    const aircraftId = row.getAttribute('data-aircraft-id');
    const aircraft = userFleet.find(a => a.id === aircraftId);
    if (!aircraft) return;

    // Recalculate expired/in-progress checks
    const expiredChecks = getExpiredChecks(aircraft);
    const hasExpiredChecks = expiredChecks.length > 0;
    const inProgressChecks = expiredChecks.filter(c => c.inProgress);
    const actuallyExpired = expiredChecks.filter(c => !c.inProgress);

    // Find the info cell containing the badge
    const infoCell = row.querySelector('.aircraft-info-cell');
    if (!infoCell) return;

    // Find existing badge (may or may not exist)
    const existingBadge = infoCell.querySelector('.aircraft-status-badge');
    const registrationSpan = infoCell.querySelector('.aircraft-registration');

    // Determine if we should have a badge
    if (hasExpiredChecks) {
      // Build tooltip
      let groundedTooltip = '';
      if (actuallyExpired.length > 0 && inProgressChecks.length > 0) {
        groundedTooltip = `GROUNDED: ${actuallyExpired.map(c => c.name).join(', ')} expired; ${inProgressChecks.map(c => c.name).join(', ')} in progress`;
      } else if (inProgressChecks.length > 0) {
        groundedTooltip = `MAINTENANCE IN PROGRESS: ${inProgressChecks.map(c => c.name).join(', ')}`;
      } else {
        groundedTooltip = `GROUNDED: ${actuallyExpired.map(c => c.name).join(', ')} expired`;
      }

      const badgeColor = inProgressChecks.length > 0 && actuallyExpired.length === 0 ? '#d29922' : '#f85149';
      const badgeText = inProgressChecks.length > 0 && actuallyExpired.length === 0 ? 'IN MAINT' : 'GROUNDED';
      const rgbaColor = badgeColor === '#d29922' ? '210, 153, 34' : '248, 81, 73';

      if (existingBadge) {
        // Update existing badge
        existingBadge.textContent = badgeText;
        existingBadge.title = groundedTooltip;
        existingBadge.style.color = badgeColor;
        existingBadge.style.background = `rgba(${rgbaColor}, 0.15)`;
      } else {
        // Create new badge
        const newBadge = document.createElement('span');
        newBadge.className = 'aircraft-status-badge';
        newBadge.textContent = badgeText;
        newBadge.title = groundedTooltip;
        newBadge.style.cssText = `font-size: 0.7rem; color: ${badgeColor}; font-weight: 600; background: rgba(${rgbaColor}, 0.15); padding: 0.1rem 0.35rem; border-radius: 3px; cursor: help;`;
        const container = infoCell.querySelector('div');
        if (container) container.appendChild(newBadge);
      }

      // Update registration span color to grayed out
      if (registrationSpan) {
        registrationSpan.style.color = '#8b949e';
      }
    } else {
      // No expired checks - remove badge if it exists
      if (existingBadge) {
        existingBadge.remove();
      }
      // Update registration span color to normal
      if (registrationSpan) {
        registrationSpan.style.color = 'var(--accent-color)';
      }
    }
  });
}

// Start interval for updating aircraft status badges
function startAircraftStatusUpdates() {
  // Clear any existing interval
  if (aircraftStatusUpdateInterval) {
    clearInterval(aircraftStatusUpdateInterval);
  }
  // Update every 5 seconds
  aircraftStatusUpdateInterval = setInterval(updateAircraftStatusBadges, 5000);
}

// Stop interval for updating aircraft status badges
function stopAircraftStatusUpdates() {
  if (aircraftStatusUpdateInterval) {
    clearInterval(aircraftStatusUpdateInterval);
    aircraftStatusUpdateInterval = null;
  }
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
    const typeKey = `${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? (aircraft.aircraft.variant.startsWith('-') ? aircraft.aircraft.variant : '-' + aircraft.aircraft.variant) : ''}`;
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

// Global Maintenance Modal - Set auto-maintenance for all aircraft
function showGlobalMaintenanceModal() {
  const existingModal = document.getElementById('globalMaintenanceModal');
  if (existingModal) existingModal.remove();

  // Count aircraft
  const aircraftCount = userFleet.length;
  if (aircraftCount === 0) {
    showAlertModal('No Aircraft', 'There are no aircraft in your fleet.');
    return;
  }

  // Check current state - count how many have each check enabled
  const counts = {
    daily: userFleet.filter(a => a.autoScheduleDaily).length,
    weekly: userFleet.filter(a => a.autoScheduleWeekly).length,
    A: userFleet.filter(a => a.autoScheduleA).length,
    C: userFleet.filter(a => a.autoScheduleC).length,
    D: userFleet.filter(a => a.autoScheduleD).length
  };

  const checkTypes = [
    { type: 'daily', name: 'Daily Check', color: '#3fb950', desc: 'Every 24 hours of operation' },
    { type: 'weekly', name: 'Weekly Check', color: '#a371f7', desc: 'Every 7 days' },
    { type: 'A', name: 'A Check', color: '#58a6ff', desc: 'Light maintenance (~500 flight hours)' },
    { type: 'C', name: 'C Check', color: '#f97316', desc: 'Heavy maintenance (~20 months)' },
    { type: 'D', name: 'D Check', color: '#f85149', desc: 'Major overhaul (~6 years)' }
  ];

  const checkRows = checkTypes.map(check => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: var(--surface-elevated); border-radius: 6px;">
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span style="color: ${check.color}; font-weight: 600; font-size: 0.9rem; min-width: 100px;">${check.name}</span>
        <span style="color: var(--text-muted); font-size: 0.8rem;">${check.desc}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span style="color: var(--text-muted); font-size: 0.75rem;">${counts[check.type]}/${aircraftCount} enabled</span>
        <label style="position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer;">
          <input type="checkbox" id="global_${check.type}" ${counts[check.type] === aircraftCount ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
          <span style="
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: ${counts[check.type] === aircraftCount ? check.color : 'var(--surface)'};
            border: 1px solid ${counts[check.type] === aircraftCount ? check.color : 'var(--border-color)'};
            transition: 0.2s;
            border-radius: 24px;
          "></span>
          <span style="
            position: absolute;
            content: '';
            height: 18px;
            width: 18px;
            left: ${counts[check.type] === aircraftCount ? '23px' : '3px'};
            top: 3px;
            background: white;
            transition: 0.2s;
            border-radius: 50%;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          "></span>
        </label>
      </div>
    </div>
  `).join('');

  const modalHtml = `
    <div id="globalMaintenanceModal" onclick="closeGlobalMaintenanceModal()" style="
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
        min-width: 500px;
        max-width: 600px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      ">
        <div style="padding: 1rem 1.5rem; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; color: #f0f6fc; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.2rem;">🔧</span> Global Maintenance Settings
          </h3>
          <button onclick="closeGlobalMaintenanceModal()" style="background: none; border: none; color: #8b949e; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
        </div>
        <div style="padding: 1.5rem;">
          <p style="color: #8b949e; margin: 0 0 1rem 0; font-size: 0.9rem;">
            Configure auto-scheduling for maintenance checks across all <strong style="color: #f0f6fc;">${aircraftCount} aircraft</strong> in your fleet.
          </p>

          <!-- Auto All Toggle -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: linear-gradient(135deg, rgba(88, 166, 255, 0.15), rgba(163, 113, 247, 0.15)); border: 1px solid rgba(88, 166, 255, 0.3); border-radius: 6px; margin-bottom: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="color: #f0f6fc; font-weight: 700; font-size: 0.95rem;">Auto All</span>
              <span style="color: #8b949e; font-size: 0.8rem;">Enable/disable all checks at once</span>
            </div>
            <label style="position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer;">
              <input type="checkbox" id="global_all" ${Object.values(counts).every(c => c === aircraftCount) ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
              <span id="global_all_slider" style="
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: ${Object.values(counts).every(c => c === aircraftCount) ? '#58a6ff' : 'var(--surface)'};
                border: 1px solid ${Object.values(counts).every(c => c === aircraftCount) ? '#58a6ff' : 'var(--border-color)'};
                transition: 0.2s;
                border-radius: 24px;
              "></span>
              <span id="global_all_knob" style="
                position: absolute;
                content: '';
                height: 18px;
                width: 18px;
                left: ${Object.values(counts).every(c => c === aircraftCount) ? '23px' : '3px'};
                top: 3px;
                background: white;
                transition: 0.2s;
                border-radius: 50%;
                box-shadow: 0 1px 3px rgba(0,0,0,0.3);
              "></span>
            </label>
          </div>

          <p style="color: #8b949e; margin: 0 0 0.5rem 0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">Individual Checks
          </p>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${checkRows}
          </div>
          <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(88, 166, 255, 0.1); border: 1px solid rgba(88, 166, 255, 0.2); border-radius: 6px;">
            <p style="color: #8b949e; margin: 0; font-size: 0.8rem;">
              <strong style="color: #58a6ff;">Note:</strong> Aircraft with expired checks will have auto-scheduling enabled but checks won't be scheduled until the expired check is performed manually.
            </p>
          </div>
        </div>
        <div style="padding: 1rem 1.5rem; border-top: 1px solid #30363d; display: flex; justify-content: flex-end; gap: 0.75rem;">
          <button onclick="closeGlobalMaintenanceModal()" style="
            padding: 0.5rem 1rem;
            background: #21262d;
            border: 1px solid #30363d;
            border-radius: 6px;
            color: #c9d1d9;
            cursor: pointer;
            font-size: 0.9rem;
          ">Cancel</button>
          <button onclick="applyGlobalMaintenanceSettings()" style="
            padding: 0.5rem 1rem;
            background: #238636;
            border: 1px solid #2ea043;
            border-radius: 6px;
            color: white;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 500;
          ">Apply to All Aircraft</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Add event listeners to toggles
  checkTypes.forEach(check => {
    const input = document.getElementById(`global_${check.type}`);
    if (input) {
      input.addEventListener('change', function() {
        const slider = this.nextElementSibling;
        const knob = slider.nextElementSibling;
        if (this.checked) {
          slider.style.background = check.color;
          slider.style.borderColor = check.color;
          knob.style.left = '23px';
        } else {
          slider.style.background = 'var(--surface)';
          slider.style.borderColor = 'var(--border-color)';
          knob.style.left = '3px';
        }
        // Update "Auto All" toggle state based on individual toggles
        updateAutoAllToggle(checkTypes);
      });
    }
  });

  // Add event listener for "Auto All" toggle
  const autoAllInput = document.getElementById('global_all');
  if (autoAllInput) {
    autoAllInput.addEventListener('change', function() {
      const isChecked = this.checked;
      const slider = document.getElementById('global_all_slider');
      const knob = document.getElementById('global_all_knob');

      // Update Auto All visual state
      if (isChecked) {
        slider.style.background = '#58a6ff';
        slider.style.borderColor = '#58a6ff';
        knob.style.left = '23px';
      } else {
        slider.style.background = 'var(--surface)';
        slider.style.borderColor = 'var(--border-color)';
        knob.style.left = '3px';
      }

      // Toggle all individual checks
      checkTypes.forEach(check => {
        const input = document.getElementById(`global_${check.type}`);
        if (input && input.checked !== isChecked) {
          input.checked = isChecked;
          const checkSlider = input.nextElementSibling;
          const checkKnob = checkSlider.nextElementSibling;
          if (isChecked) {
            checkSlider.style.background = check.color;
            checkSlider.style.borderColor = check.color;
            checkKnob.style.left = '23px';
          } else {
            checkSlider.style.background = 'var(--surface)';
            checkSlider.style.borderColor = 'var(--border-color)';
            checkKnob.style.left = '3px';
          }
        }
      });
    });
  }
}

// Helper to update Auto All toggle based on individual toggle states
function updateAutoAllToggle(checkTypes) {
  const allChecked = checkTypes.every(check => {
    const input = document.getElementById(`global_${check.type}`);
    return input && input.checked;
  });

  const autoAllInput = document.getElementById('global_all');
  const slider = document.getElementById('global_all_slider');
  const knob = document.getElementById('global_all_knob');

  if (autoAllInput && slider && knob) {
    autoAllInput.checked = allChecked;
    if (allChecked) {
      slider.style.background = '#58a6ff';
      slider.style.borderColor = '#58a6ff';
      knob.style.left = '23px';
    } else {
      slider.style.background = 'var(--surface)';
      slider.style.borderColor = 'var(--border-color)';
      knob.style.left = '3px';
    }
  }
}

function closeGlobalMaintenanceModal() {
  const modal = document.getElementById('globalMaintenanceModal');
  if (modal) modal.remove();
}

// Progress overlay for global maintenance
function showGlobalMaintenanceProgress(aircraftCount) {
  const existingOverlay = document.getElementById('globalMaintenanceProgress');
  if (existingOverlay) existingOverlay.remove();

  const overlayHtml = `
    <div id="globalMaintenanceProgress" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10001;
    ">
      <div style="
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 12px;
        padding: 2rem 3rem;
        text-align: center;
        min-width: 350px;
      ">
        <div style="margin-bottom: 1.5rem;">
          <div style="
            width: 60px;
            height: 60px;
            border: 4px solid rgba(88, 166, 255, 0.2);
            border-top-color: #58a6ff;
            border-radius: 50%;
            animation: globalMaintSpin 1s linear infinite;
            margin: 0 auto;
          "></div>
        </div>
        <h3 style="color: #f0f6fc; margin: 0 0 0.5rem 0; font-size: 1.2rem;">Applying Settings</h3>
        <p style="color: #8b949e; margin: 0 0 1rem 0; font-size: 0.9rem;">
          Processing <strong style="color: #58a6ff;">${aircraftCount}</strong> aircraft...
        </p>
        <div style="background: #21262d; border-radius: 6px; padding: 0.75rem; margin-top: 1rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; justify-content: center;">
            <span style="color: #3fb950; font-size: 1.1rem;">🔧</span>
            <span style="color: #8b949e; font-size: 0.85rem;">Scheduling maintenance checks...</span>
          </div>
        </div>
      </div>
    </div>
    <style>
      @keyframes globalMaintSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;

  document.body.insertAdjacentHTML('beforeend', overlayHtml);
}

function hideGlobalMaintenanceProgress() {
  const overlay = document.getElementById('globalMaintenanceProgress');
  if (overlay) overlay.remove();
}

async function applyGlobalMaintenanceSettings() {
  const settings = {
    autoScheduleDaily: document.getElementById('global_daily')?.checked || false,
    autoScheduleWeekly: document.getElementById('global_weekly')?.checked || false,
    autoScheduleA: document.getElementById('global_A')?.checked || false,
    autoScheduleC: document.getElementById('global_C')?.checked || false,
    autoScheduleD: document.getElementById('global_D')?.checked || false
  };

  closeGlobalMaintenanceModal();

  // Show progress overlay
  const aircraftCount = userFleet.length;
  showGlobalMaintenanceProgress(aircraftCount);

  try {
    const response = await fetch('/api/fleet/global-maintenance-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to apply settings');
    }

    const result = await response.json();
    hideGlobalMaintenanceProgress();

    // Update local fleet data
    userFleet.forEach(aircraft => {
      aircraft.autoScheduleDaily = settings.autoScheduleDaily;
      aircraft.autoScheduleWeekly = settings.autoScheduleWeekly;
      aircraft.autoScheduleA = settings.autoScheduleA;
      aircraft.autoScheduleC = settings.autoScheduleC;
      aircraft.autoScheduleD = settings.autoScheduleD;
    });

    // Refresh schedule to show new maintenance
    await loadSchedule();

    await showAlertModal('Settings Applied',
      `Updated ${result.updatedCount} aircraft.\n${result.maintenanceScheduled} maintenance checks scheduled.`);

  } catch (error) {
    hideGlobalMaintenanceProgress();
    console.error('Error applying global maintenance settings:', error);
    await showAlertModal('Error', `Failed to apply settings: ${error.message}`);
  }
}

// Fetch all schedule data in a single request (much faster than 4 separate requests)
async function fetchAllScheduleData() {
  try {
    // Calculate date range
    const worldTime = getCurrentWorldTime();
    if (!worldTime) {
      console.error('World time not available');
      return;
    }

    const today = new Date(worldTime);
    const currentDay = today.getDay();

    // Always fetch the full rolling week range (both views need flights from across the week
    // since a flight departing Saturday may arrive Monday, and the daily view for Monday needs it)
    const dayDates = [];
    for (let dow = 0; dow < 7; dow++) {
      const daysUntil = getDaysUntilTargetInWeek(currentDay, dow);
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysUntil);
      dayDates.push(targetDate);
    }
    const minDate = new Date(Math.min(...dayDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dayDates.map(d => d.getTime())));
    const startDateStr = formatLocalDate(minDate);
    const endDateStr = formatLocalDate(maxDate);

    // Add cache-buster to ensure fresh data
    const cacheBuster = Date.now();
    console.log('[DEBUG] Fetching schedule data with cache buster:', cacheBuster);
    const response = await fetch(`/api/schedule/data?startDate=${startDateStr}&endDate=${endDateStr}&_=${cacheBuster}`);
    if (response.ok) {
      const data = await response.json();
      console.log('[DEBUG] API returned maintenance count:', data.maintenance?.length || 0);
      userFleet = data.fleet || [];
      routes = data.routes || [];
      scheduledFlights = data.flights || [];
      scheduledMaintenance = data.maintenance || [];
      console.log(`Loaded: ${userFleet.length} aircraft, ${routes.length} routes, ${scheduledFlights.length} flights, ${scheduledMaintenance.length} maintenance`);
    } else {
      console.error('[DEBUG] API response not OK:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('Error fetching schedule data:', error);
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
      // For daily view, fetch the selected day PLUS the day before
      const daysUntilTarget = getDaysUntilTargetInWeek(currentDay, selectedDayOfWeek);
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysUntilTarget);
      const dayBefore = new Date(targetDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      startDateStr = formatLocalDate(dayBefore);
      endDateStr = formatLocalDate(targetDate);
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
      // For weekly view, use forward-looking 7 days (today to today+6)
      // Each weekday column shows the NEXT occurrence of that day
      // Days that have passed this week will show next week's date
      const startDay = new Date(today);
      const endDay = new Date(today);
      endDay.setDate(today.getDate() + 6); // Today + 6 more days = 7 days total

      startDateStr = formatLocalDate(startDay);
      endDateStr = formatLocalDate(endDay);
    } else {
      // For daily view, fetch the selected day PLUS the day before
      const daysUntilTarget = getDaysUntilTargetInWeek(currentDay, selectedDayOfWeek);
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysUntilTarget);
      const dayBefore = new Date(targetDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      startDateStr = formatLocalDate(dayBefore);
      endDateStr = formatLocalDate(targetDate);
    }

    const response = await fetch(`/api/schedule/maintenance?startDate=${startDateStr}&endDate=${endDateStr}`);
    if (response.ok) {
      const data = await response.json();
      // Handle both old format (array) and new format ({ maintenance, debug })
      if (Array.isArray(data)) {
        scheduledMaintenance = data;
      } else {
        scheduledMaintenance = data.maintenance || [];
        if (data.debug) {
          console.log('[MAINT DEBUG] Requested range:', data.debug.requestedRange);
          console.log('[MAINT DEBUG] Patterns found:', data.debug.patternsFound);
          console.log('[MAINT DEBUG] Patterns:', data.debug.patterns);
          console.log('[MAINT DEBUG] Blocks generated:', data.debug.blocksGenerated);
        }
      }
    }
  } catch (error) {
    console.error('Error fetching scheduled maintenance:', error);
  }
}

// Save auto-schedule preference to the backend
async function saveAutoSchedulePreference(aircraftId, checkType, isEnabled) {
  try {
    const response = await fetch(`/api/fleet/${aircraftId}/auto-schedule`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        checkType: checkType,
        enabled: isEnabled
      })
    });

    if (!response.ok) {
      const data = await response.json();
      console.error('Failed to save auto-schedule preference:', data.error);
      return false;
    }

    // Update local fleet data
    const aircraft = userFleet.find(a => a.id === aircraftId);
    if (aircraft) {
      const autoScheduleKeyMap = {
        'daily': 'autoScheduleDaily',
        'weekly': 'autoScheduleWeekly',
        'A': 'autoScheduleA',
        'C': 'autoScheduleC',
        'D': 'autoScheduleD'
      };
      const key = autoScheduleKeyMap[checkType];
      aircraft[key] = isEnabled;
    }

    return true;
  } catch (error) {
    console.error('Error saving auto-schedule preference:', error);
    return false;
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
    const typeKey = `${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? (aircraft.aircraft.variant.startsWith('-') ? aircraft.aircraft.variant : '-' + aircraft.aircraft.variant) : ''}`;

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
// Uses day-of-week matching so flights from any week occurrence are found
// (e.g. a flight departing Saturday arriving Monday shows on Monday's daily view)
function getFlightsForCell(aircraftId, date, hour = null) {
  const dateStr = typeof date === 'string' ? date.substring(0, 10) : '';
  const viewDow = new Date(dateStr + 'T00:00:00').getDay();

  // Use getFlightsForDay for day-of-week matching, then apply hour filter
  const dayFlights = getFlightsForDay(aircraftId, viewDow);

  if (hour === null) return dayFlights;

  return dayFlights.filter(flight => {
    // Determine what role this day-of-week plays for the flight
    const route = flight.route;
    const aircraft = flight.aircraft;
    const acType = aircraft?.aircraft?.type || 'Narrowbody';
    const paxCapacity = aircraft?.aircraft?.passengerCapacity || 150;
    const routeDistance = route?.distance || 0;
    const preFlightDur = calculatePreFlightTotal(routeDistance, paxCapacity, acType).total;

    const depTimeStr = flight.departureTime?.substring(0, 5) || '00:00';
    const [depH, depM] = depTimeStr.split(':').map(Number);
    let depMinutes = depH * 60 + depM - preFlightDur;
    let opStartDate = new Date(flight.scheduledDate + 'T00:00:00');
    if (depMinutes < 0) {
      depMinutes += 1440;
      opStartDate.setDate(opStartDate.getDate() - 1);
    }
    const opStartDow = opStartDate.getDay();

    if (opStartDow === viewDow) {
      // Flight operation starts on this day - show in the pre-flight/departure hour cell
      const flightHour = parseInt(flight.departureTime.split(':')[0]);
      return flightHour === hour;
    } else {
      // Arrives or in transit - show in hour 0 cell
      return hour === 0;
    }
  });
}

// Get maintenance checks for a specific cell (aircraft + date + optional hour for daily view)
function getMaintenanceForCell(aircraftId, date, hour = null) {
  const results = scheduledMaintenance.filter(maintenance => {
    if (maintenance.aircraftId != aircraftId) { // Use != for type-coercive comparison
      return false;
    }

    // For multi-day maintenance (C, D checks), the backend returns blocks with displayDate
    // which represents the actual date the block should be shown on
    let matchDate = maintenance.displayDate || maintenance.scheduledDate;
    // Normalize to YYYY-MM-DD format (remove any time component)
    if (matchDate && matchDate.includes('T')) {
      matchDate = matchDate.split('T')[0];
    }
    if (matchDate !== date) {
      return false;
    }

    // For daily view, only show maintenance in the hour it starts
    // For multi-day ongoing blocks (isOngoing=true), show at hour 0
    if (hour !== null) {
      if (maintenance.isOngoing) {
        return hour === 0; // Show ongoing multi-day maintenance at start of day
      }
      const maintenanceHour = parseInt(maintenance.startTime.split(':')[0]);
      return maintenanceHour === hour;
    }

    return true;
  });

  // Filter out daily checks that are within 24 hours of a previous daily check
  const prevDate = new Date(date + 'T00:00:00');
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().split('T')[0];

  // Get previous day's daily checks for this aircraft
  const prevDayDailyChecks = scheduledMaintenance.filter(m => {
    if (m.aircraftId != aircraftId) return false;
    if (m.checkType !== 'daily') return false;
    let matchDate = m.displayDate || m.scheduledDate;
    if (matchDate && matchDate.includes('T')) matchDate = matchDate.split('T')[0];
    return matchDate === prevDateStr;
  });

  // If there's a daily check on the previous day, check the time gap
  if (prevDayDailyChecks.length > 0) {
    return results.filter(m => {
      if (m.checkType !== 'daily') return true; // Keep non-daily checks

      // Get this check's start time in minutes from midnight
      const startTimeStr = m.startTime?.substring(0, 5) || '00:00';
      const [h, min] = startTimeStr.split(':').map(Number);
      const thisStartMinutes = h * 60 + min;

      // Check against previous day's daily checks
      for (const prevCheck of prevDayDailyChecks) {
        const prevStartStr = prevCheck.startTime?.substring(0, 5) || '00:00';
        const [prevH, prevM] = prevStartStr.split(':').map(Number);
        const prevStartMinutes = prevH * 60 + prevM;

        // Calculate minutes from previous check to this check
        const minutesBetween = (1440 - prevStartMinutes) + thisStartMinutes;

        // If less than 18 hours (1080 minutes) between checks, skip this one
        if (minutesBetween < 1080) {
          return false;
        }
      }
      return true;
    });
  }

  return results;
}

// Round a time string (HH:MM) to the nearest 5 minutes
function roundTimeToNearest5(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const roundedMinutes = Math.round(minutes / 5) * 5;
  const finalHours = roundedMinutes === 60 ? (hours + 1) % 24 : hours;
  const finalMinutes = roundedMinutes === 60 ? 0 : roundedMinutes;
  return `${finalHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`;
}

/**
 * Render flight as segmented strips: Outbound → Turnaround (purple) → Return
 * For tech stop routes: Out-Leg1 | Out-Leg2 → Turnaround → Ret-Leg1 | Ret-Leg2
 *
 * @param {Object} params - Parameters object
 * @param {Object} params.flight - The flight object
 * @param {Object} params.route - The route object
 * @param {number} params.leftPercent - Starting position as percentage within cell
 * @param {number} params.outboundMins - Outbound flight duration in minutes
 * @param {number} params.turnaroundMins - Turnaround duration in minutes
 * @param {number} params.returnMins - Return flight duration in minutes
 * @param {boolean} params.hasTechStop - Whether route has tech stop
 * @param {Object} params.legMins - Leg durations for tech stop routes {leg1, leg2, leg3, leg4}
 * @param {string} params.depAirport - Departure airport code
 * @param {string} params.arrAirport - Arrival airport code
 * @param {string} params.techStopAirport - Tech stop airport code (if applicable)
 * @param {string} params.depTime - Departure time string
 * @param {string} params.returnArrTime - Return arrival time string
 * @returns {string} HTML string for all segments
 */
function renderFlightSegments(params) {
  const {
    flight, route, leftPercent,
    outboundMins, turnaroundMins, returnMins,
    hasTechStop, legMins = {},
    depAirport, arrAirport, techStopAirport,
    depTime, returnArrTime
  } = params;

  const techStopGroundTime = 30; // Tech stop ground time in minutes
  const totalMins = outboundMins + turnaroundMins + returnMins;
  const totalWidthPercent = (totalMins / 60) * 100;

  // Determine if we need compact display
  const totalHours = totalMins / 60;
  const isCompact = totalHours < 3;
  const isVeryCompact = totalHours < 2;

  let segmentsHtml = '';
  let currentLeft = leftPercent;

  // Get compact class based on size
  const compactClass = isVeryCompact ? 'very-compact' : (isCompact ? 'compact' : '');

  // Helper to format route number without HTML wrapper
  const getRouteNum = (routeNum) => {
    if (!routeNum) return '';
    return routeNum;
  };

  // Helper to add minutes to a time string and return formatted time
  const addMinutesToTime = (timeStr, minutes) => {
    if (!timeStr || timeStr === '??:??') return '??:??';
    const [hours, mins] = timeStr.split(':').map(Number);
    const totalMins = hours * 60 + mins + minutes;
    const newHours = Math.floor(totalMins / 60) % 24;
    const newMins = Math.round(totalMins % 60 / 5) * 5; // Round to nearest 5
    const finalHours = newMins === 60 ? (newHours + 1) % 24 : newHours;
    const finalMins = newMins === 60 ? 0 : newMins;
    return `${String(finalHours).padStart(2, '0')}:${String(finalMins).padStart(2, '0')}`;
  };

  // Calculate key times for each segment
  const outboundArrTime = addMinutesToTime(depTime, outboundMins);
  const returnDepTime = addMinutesToTime(depTime, outboundMins + turnaroundMins);

  // Check if daily check is needed at turnaround (only if no home base check covers this flight)
  const dailyCheckDue = flight.aircraft && flight.scheduledDate
    ? isDailyCheckDueAtTurnaround(flight.aircraft, flight.scheduledDate, depTime, flight.scheduledDate?.substring(0, 10))
    : false;
  const dailyCheckDuration = 30; // Daily check takes 30 minutes

  if (hasTechStop && legMins.leg1 && legMins.leg2) {
    // Tech stop route: 5 segments with gaps
    const { leg1, leg2, leg3, leg4 } = legMins;

    // Calculate times for each leg
    const leg1ArrTime = addMinutesToTime(depTime, leg1);
    const leg2DepTime = addMinutesToTime(depTime, leg1 + techStopGroundTime);
    const leg2ArrTime = addMinutesToTime(depTime, leg1 + techStopGroundTime + leg2);
    const leg3DepTime = addMinutesToTime(depTime, leg1 + techStopGroundTime + leg2 + turnaroundMins);
    const leg3ArrTime = addMinutesToTime(depTime, leg1 + techStopGroundTime + leg2 + turnaroundMins + leg3);
    const leg4DepTime = addMinutesToTime(depTime, leg1 + techStopGroundTime + leg2 + turnaroundMins + leg3 + techStopGroundTime);

    // Outbound Leg 1 (DEP → TECH)
    const leg1Width = (leg1 / 60) * 100;
    segmentsHtml += `
      <div class="flight-segment segment-outbound-leg1 ${compactClass}"
           style="left: ${currentLeft}%; width: ${leg1Width}%;"
           onclick="viewFlightDetails('${flight.id}')"
           title="${getRouteNum(route.routeNumber)}: ${depAirport} → ${techStopAirport} | Off: ${depTime} On: ${leg1ArrTime}">
        <span class="segment-flight-num">${getRouteNum(route.routeNumber)}</span>
        <span class="segment-route">${depAirport}-${techStopAirport}</span>
        <span class="segment-time">${depTime}-${leg1ArrTime}</span>
      </div>
    `;
    currentLeft += leg1Width;

    // Tech stop gap (outbound)
    const techGapWidth = (techStopGroundTime / 60) * 100;
    segmentsHtml += `<div class="tech-stop-gap" style="left: ${currentLeft}%;" title="Tech stop at ${techStopAirport} (${techStopGroundTime}m)"></div>`;
    currentLeft += techGapWidth;

    // Outbound Leg 2 (TECH → ARR)
    const leg2Width = (leg2 / 60) * 100;
    segmentsHtml += `
      <div class="flight-segment segment-outbound-leg2 ${compactClass}"
           style="left: ${currentLeft}%; width: ${leg2Width}%;"
           onclick="viewFlightDetails('${flight.id}')"
           title="${getRouteNum(route.routeNumber)}: ${techStopAirport} → ${arrAirport} | Off: ${leg2DepTime} On: ${leg2ArrTime}">
        <span class="segment-flight-num">${getRouteNum(route.routeNumber)}</span>
        <span class="segment-route">${techStopAirport}-${arrAirport}</span>
        <span class="segment-time">${leg2DepTime}-${leg2ArrTime}</span>
      </div>
    `;
    currentLeft += leg2Width;

    // Turnaround at destination (purple)
    const turnaroundWidth = (turnaroundMins / 60) * 100;
    const techTurnaroundTitle = dailyCheckDue
      ? `Turnaround at ${arrAirport} (${turnaroundMins}m) - DAILY CHECK (${dailyCheckDuration}m)`
      : `Turnaround at ${arrAirport} (${turnaroundMins}m)`;
    segmentsHtml += `
      <div class="flight-segment segment-turnaround ${compactClass} ${dailyCheckDue ? 'has-daily-check' : ''}"
           style="left: ${currentLeft}%; width: ${turnaroundWidth}%;"
           onclick="viewFlightDetails('${flight.id}')"
           title="${techTurnaroundTitle}">
        <span class="segment-label">${arrAirport}</span>
        ${dailyCheckDue
          ? `<span class="segment-time" style="color: #fbbf24;">Daily ${dailyCheckDuration}m</span>`
          : `<span class="segment-time">${turnaroundMins}m</span>`
        }
      </div>
    `;
    currentLeft += turnaroundWidth;

    // Return Leg 1 (ARR → TECH)
    const leg3Width = (leg3 / 60) * 100;
    segmentsHtml += `
      <div class="flight-segment segment-return-leg1 ${compactClass}"
           style="left: ${currentLeft}%; width: ${leg3Width}%;"
           onclick="viewFlightDetails('${flight.id}')"
           title="${getRouteNum(route.returnRouteNumber)}: ${arrAirport} → ${techStopAirport} | Off: ${leg3DepTime} On: ${leg3ArrTime}">
        <span class="segment-flight-num">${getRouteNum(route.returnRouteNumber)}</span>
        <span class="segment-route">${arrAirport}-${techStopAirport}</span>
        <span class="segment-time">${leg3DepTime}-${leg3ArrTime}</span>
      </div>
    `;
    currentLeft += leg3Width;

    // Tech stop gap (return)
    segmentsHtml += `<div class="tech-stop-gap" style="left: ${currentLeft}%;" title="Tech stop at ${techStopAirport} (${techStopGroundTime}m)"></div>`;
    currentLeft += techGapWidth;

    // Return Leg 2 (TECH → DEP)
    const leg4Width = (leg4 / 60) * 100;
    segmentsHtml += `
      <div class="flight-segment segment-return-leg2 ${compactClass}"
           style="left: ${currentLeft}%; width: ${leg4Width}%;"
           onclick="viewFlightDetails('${flight.id}')"
           title="${getRouteNum(route.returnRouteNumber)}: ${techStopAirport} → ${depAirport} | Off: ${leg4DepTime} On: ${returnArrTime}">
        <span class="segment-flight-num">${getRouteNum(route.returnRouteNumber)}</span>
        <span class="segment-route">${techStopAirport}-${depAirport}</span>
        <span class="segment-time">${leg4DepTime}-${returnArrTime}</span>
      </div>
    `;
  } else {
    // Standard route: 3 segments
    // Outbound segment
    const outboundWidth = (outboundMins / 60) * 100;
    segmentsHtml += `
      <div class="flight-segment segment-outbound ${compactClass}"
           style="left: ${currentLeft}%; width: ${outboundWidth}%;"
           onclick="viewFlightDetails('${flight.id}')"
           title="${getRouteNum(route.routeNumber)}: ${depAirport} → ${arrAirport} | Off: ${depTime} On: ${outboundArrTime}">
        <span class="segment-flight-num">${getRouteNum(route.routeNumber)}</span>
        <span class="segment-route">${depAirport}-${arrAirport}</span>
        <span class="segment-time">${depTime}-${outboundArrTime}</span>
      </div>
    `;
    currentLeft += outboundWidth;

    // Turnaround segment (purple)
    const turnaroundWidth = (turnaroundMins / 60) * 100;
    const stdTurnaroundTitle = dailyCheckDue
      ? `Turnaround at ${arrAirport} (${turnaroundMins}m) - DAILY CHECK (${dailyCheckDuration}m)`
      : `Turnaround at ${arrAirport} (${turnaroundMins}m)`;
    segmentsHtml += `
      <div class="flight-segment segment-turnaround ${compactClass} ${dailyCheckDue ? 'has-daily-check' : ''}"
           style="left: ${currentLeft}%; width: ${turnaroundWidth}%;"
           onclick="viewFlightDetails('${flight.id}')"
           title="${stdTurnaroundTitle}">
        <span class="segment-label">${arrAirport}</span>
        ${dailyCheckDue
          ? `<span class="segment-time" style="color: #fbbf24;">Daily ${dailyCheckDuration}m</span>`
          : `<span class="segment-time">${turnaroundMins}m</span>`
        }
      </div>
    `;
    currentLeft += turnaroundWidth;

    // Return segment
    const returnWidth = (returnMins / 60) * 100;
    segmentsHtml += `
      <div class="flight-segment segment-return ${compactClass}"
           style="left: ${currentLeft}%; width: ${returnWidth}%;"
           onclick="viewFlightDetails('${flight.id}')"
           title="${getRouteNum(route.returnRouteNumber)}: ${arrAirport} → ${depAirport} | Off: ${returnDepTime} On: ${returnArrTime}">
        <span class="segment-flight-num">${getRouteNum(route.returnRouteNumber)}</span>
        <span class="segment-route">${arrAirport}-${depAirport}</span>
        <span class="segment-time">${returnDepTime}-${returnArrTime}</span>
      </div>
    `;
  }

  return segmentsHtml;
}

// Render overnight arrival block (flight that departed yesterday, arriving today)
// Shows segmented display for the portion of the round-trip after midnight
function renderOvernightArrivalBlock(flight, route, calculatedArrTime = null, segmentDurations = null) {
  // Prefer stored arrival time, fall back to calculated, then to '??:??'
  const storedArr = flight.arrivalTime ? flight.arrivalTime.substring(0, 5) : null;
  const arrTime = storedArr || calculatedArrTime || '??:??';
  const depTime = flight.departureTime ? flight.departureTime.substring(0, 5) : '??:??';
  const [arrHours, arrMinutes] = arrTime.split(':').map(Number);
  const [depHours, depMinutes] = depTime.split(':').map(Number);

  // Guard against NaN parsed values
  const safeArrHours = isFinite(arrHours) ? arrHours : 0;
  const safeArrMinutes = isFinite(arrMinutes) ? arrMinutes : 0;
  const safeDepHours = isFinite(depHours) ? depHours : 0;
  const safeDepMinutes = isFinite(depMinutes) ? depMinutes : 0;

  // Calculate timing
  const arrivalMinutesFromMidnight = (safeArrHours * 60) + safeArrMinutes;
  const departureMinutesFromMidnight = (safeDepHours * 60) + safeDepMinutes;

  // Account for multi-day flights: calculate minutes from departure to the ARRIVAL DAY's midnight
  // For a flight departing Wed 12:00 arriving Fri 02:15, we need Wed 12:00 → Fri 00:00 = 2160 min
  // Not just Wed 12:00 → Thu 00:00 = 720 min (which is what (24*60)-dep gives)
  const normDepDate = typeof flight.scheduledDate === 'string' ? flight.scheduledDate.substring(0, 10) : '';
  const normArrDateForCalc = flight.arrivalDate ? (typeof flight.arrivalDate === 'string' ? flight.arrivalDate.substring(0, 10) : new Date(flight.arrivalDate).toISOString().split('T')[0]) : normDepDate;
  const daysBetweenDepArr = Math.round((new Date(normArrDateForCalc) - new Date(normDepDate)) / (1000 * 60 * 60 * 24));
  const minutesFromDepToMidnight = (daysBetweenDepArr * 1440) - departureMinutesFromMidnight;

  // Get airport codes
  const depAirport = route.departureAirport.iataCode || route.departureAirport.icaoCode;
  const arrAirport = route.arrivalAirport.iataCode || route.arrivalAirport.icaoCode;
  const techStopAirport = route.techStopAirport ? (route.techStopAirport.iataCode || route.techStopAirport.icaoCode) : null;

  // Round the displayed return time to nearest 5 minutes
  const returnArrTime = arrTime !== '??:??' ? roundTimeToNearest5(arrTime) : arrTime;

  // Calculate post-flight extension for overnight arrival
  const postFlightInfo = calculatePostFlightDuration(flight.aircraft, flight.arrivalDate || flight.scheduledDate);
  const postFlightMinutes = postFlightInfo.duration;
  const postFlightWidthPercent = (postFlightMinutes / 60) * 100;
  const postFlightLeftPercent = (arrivalMinutesFromMidnight / 60) * 100;

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

  // Get segment durations (passed from caller or use defaults)
  // Use nullish coalescing (??) instead of || to avoid treating 0 as falsy
  const outboundMins = segmentDurations?.outbound ?? 120;
  const turnaroundMins = segmentDurations?.turnaround ?? (route.turnaroundTime || 45);
  const returnMins = segmentDurations?.return ?? 120;

  // Check if daily check is needed at turnaround (only if no home base check covers this flight)
  // Pass scheduledDate as departureDate to filter out downroute checks from covering check search
  const dailyCheckDue = flight.aircraft && flight.arrivalDate
    ? isDailyCheckDueAtTurnaround(flight.aircraft, flight.arrivalDate, depTime, flight.scheduledDate?.substring(0, 10))
    : false;
  const dailyCheckDuration = 30;

  // Helper to calculate time from minutes after midnight
  const minsToTime = (mins) => {
    const h = Math.floor(mins / 60) % 24;
    const m = Math.round(mins % 60 / 5) * 5;
    const finalH = m === 60 ? (h + 1) % 24 : h;
    const finalM = m === 60 ? 0 : m;
    return `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
  };

  // Calculate how much of each segment was completed before midnight
  let segmentsHtml = '';
  let currentLeft = 0; // Start from left edge (midnight)
  let minutesConsumedBeforeMidnight = minutesFromDepToMidnight;

  // Determine which segment we're in at midnight and render remaining segments
  const getRouteNum = (routeNum) => routeNum || '';

  if (minutesConsumedBeforeMidnight < outboundMins) {
    // Outbound was still in progress at midnight - show remaining outbound
    const remainingOutbound = outboundMins - minutesConsumedBeforeMidnight;
    const outboundWidth = (remainingOutbound / 60) * 100;
    const isCompact = remainingOutbound < 90;
    const outboundOnTime = minsToTime(remainingOutbound);

    segmentsHtml += `
      <div class="flight-segment segment-outbound ${isCompact ? 'compact' : ''}"
           style="left: -0.4rem; width: calc(${outboundWidth}% + 0.4rem); border-radius: 0 3px 3px 0;"
           onclick="viewFlightDetails('${flight.id}')"
           title="${getRouteNum(route.routeNumber)}: continuing to ${arrAirport} | On: ${outboundOnTime}">
        <span class="segment-flight-num">${getRouteNum(route.routeNumber)}</span>
        <span class="segment-route">→${arrAirport}</span>
        <span class="segment-time">On: ${outboundOnTime}</span>
      </div>
    `;
    currentLeft = outboundWidth;

    // Calculate return departure time (after turnaround)
    const returnDepMins = remainingOutbound + turnaroundMins;
    const returnDepTimeStr = minsToTime(returnDepMins);

    // Show full turnaround
    const turnaroundWidth = (turnaroundMins / 60) * 100;
    const turnaroundTitle = dailyCheckDue
      ? `Turnaround at ${arrAirport} (${turnaroundMins}m) - DAILY CHECK (${dailyCheckDuration}m)`
      : `Turnaround at ${arrAirport} (${turnaroundMins}m)`;
    segmentsHtml += `
      <div class="flight-segment segment-turnaround ${turnaroundMins < 60 ? 'compact' : ''} ${dailyCheckDue ? 'has-daily-check' : ''}"
           style="left: ${currentLeft}%; width: ${turnaroundWidth}%;"
           onclick="viewFlightDetails('${flight.id}')"
           title="${turnaroundTitle}">
        <span class="segment-label">${arrAirport}</span>
        ${dailyCheckDue
          ? `<span class="segment-time" style="color: #fbbf24;">Daily ${dailyCheckDuration}m</span>`
          : `<span class="segment-time">${turnaroundMins}m</span>`
        }
      </div>
    `;
    currentLeft += turnaroundWidth;

    // Show full return
    const returnWidth = (returnMins / 60) * 100;
    segmentsHtml += `
      <div class="flight-segment segment-return ${returnMins < 90 ? 'compact' : ''}"
           style="left: ${currentLeft}%; width: ${returnWidth}%;"
           onclick="viewFlightDetails('${flight.id}')"
           title="${getRouteNum(route.returnRouteNumber)}: ${arrAirport} → ${depAirport} | ${returnDepTimeStr}-${returnArrTime}">
        <span class="segment-flight-num">${getRouteNum(route.returnRouteNumber)}</span>
        <span class="segment-route">${arrAirport}-${depAirport}</span>
        <span class="segment-time">${returnDepTimeStr}-${returnArrTime}</span>
      </div>
    `;
  } else if (minutesConsumedBeforeMidnight < outboundMins + turnaroundMins) {
    // Turnaround was in progress at midnight - show remaining turnaround + return
    const remainingTurnaround = (outboundMins + turnaroundMins) - minutesConsumedBeforeMidnight;
    const turnaroundWidth = (remainingTurnaround / 60) * 100;
    const continuingTitle = dailyCheckDue
      ? `Turnaround at ${arrAirport} (continuing) - DAILY CHECK (${dailyCheckDuration}m)`
      : `Turnaround at ${arrAirport} (continuing)`;

    segmentsHtml += `
      <div class="flight-segment segment-turnaround ${remainingTurnaround < 30 ? 'compact' : ''} ${dailyCheckDue ? 'has-daily-check' : ''}"
           style="left: -0.4rem; width: calc(${turnaroundWidth}% + 0.4rem); border-radius: 0;"
           onclick="viewFlightDetails('${flight.id}')"
           title="${continuingTitle}">
        <span class="segment-label">${arrAirport}</span>
        ${dailyCheckDue
          ? `<span class="segment-time" style="color: #fbbf24;">Daily ${dailyCheckDuration}m</span>`
          : `<span class="segment-time">${Math.round(remainingTurnaround)}m</span>`
        }
      </div>
    `;
    currentLeft = turnaroundWidth;

    // Calculate return departure time
    const returnDepTimeStr = minsToTime(remainingTurnaround);

    // Show full return
    const returnWidth = (returnMins / 60) * 100;
    segmentsHtml += `
      <div class="flight-segment segment-return ${returnMins < 90 ? 'compact' : ''}"
           style="left: ${currentLeft}%; width: ${returnWidth}%;"
           onclick="viewFlightDetails('${flight.id}')"
           title="${getRouteNum(route.returnRouteNumber)}: ${arrAirport} → ${depAirport} | ${returnDepTimeStr}-${returnArrTime}">
        <span class="segment-flight-num">${getRouteNum(route.returnRouteNumber)}</span>
        <span class="segment-route">${arrAirport}-${depAirport}</span>
        <span class="segment-time">${returnDepTimeStr}-${returnArrTime}</span>
      </div>
    `;
  } else {
    // Return was in progress at midnight - show remaining return only
    const remainingReturn = arrivalMinutesFromMidnight;
    const returnWidth = (remainingReturn / 60) * 100;
    const isCompact = remainingReturn < 90;

    segmentsHtml += `
      <div class="flight-segment segment-return ${isCompact ? 'compact' : ''}"
           style="left: -0.4rem; width: calc(${returnWidth}% + 0.4rem); border-radius: 0 3px 3px 0;"
           onclick="viewFlightDetails('${flight.id}')"
           title="${getRouteNum(route.returnRouteNumber)}: returning to ${depAirport} | On: ${returnArrTime}">
        <span class="segment-flight-num">${getRouteNum(route.returnRouteNumber)}</span>
        <span class="segment-route">→${depAirport}</span>
        <span class="segment-time">On: ${returnArrTime}</span>
      </div>
    `;
  }

  return `
    ${segmentsHtml}
    ${postFlightExtensionHtml}
  `;
}

// Render segmented transit day block for multi-day flights
// Shows which segments (outbound, turnaround, return) fall on this transit day
function renderTransitDayBlock(flight, route, viewingDate) {
  const depAirport = route.departureAirport.iataCode || route.departureAirport.icaoCode;
  const arrAirport = route.arrivalAirport.iataCode || route.arrivalAirport.icaoCode;
  const hasTechStop = !!route.techStopAirport;
  const turnaroundMins = route.turnaroundTime || 45;
  const techStopMinutes = 30;

  // Calculate flight segment durations
  let outboundMins = 0, returnMins = 0;

  if (flight.aircraft?.aircraft?.cruiseSpeed) {
    const cruiseSpeed = flight.aircraft.aircraft.cruiseSpeed;
    const depLat = parseFloat(route.departureAirport?.latitude) || 0;
    const depLng = parseFloat(route.departureAirport?.longitude) || 0;
    const arrLat = parseFloat(route.arrivalAirport?.latitude) || 0;
    const arrLng = parseFloat(route.arrivalAirport?.longitude) || 0;

    if (hasTechStop) {
      const techLat = parseFloat(route.techStopAirport?.latitude) || 0;
      const techLng = parseFloat(route.techStopAirport?.longitude) || 0;
      const leg1Dist = route.legOneDistance || Math.round(route.distance * 0.4);
      const leg2Dist = route.legTwoDistance || Math.round(route.distance * 0.6);
      const leg1 = calculateFlightMinutes(leg1Dist, cruiseSpeed, depLng, techLng, depLat, techLat);
      const leg2 = calculateFlightMinutes(leg2Dist, cruiseSpeed, techLng, arrLng, techLat, arrLat);
      outboundMins = leg1 + techStopMinutes + leg2;
      const leg3 = calculateFlightMinutes(leg2Dist, cruiseSpeed, arrLng, techLng, arrLat, techLat);
      const leg4 = calculateFlightMinutes(leg1Dist, cruiseSpeed, techLng, depLng, techLat, depLat);
      returnMins = leg3 + techStopMinutes + leg4;
    } else {
      outboundMins = calculateFlightMinutes(route.distance, cruiseSpeed, depLng, arrLng, depLat, arrLat);
      returnMins = calculateFlightMinutes(route.distance, cruiseSpeed, arrLng, depLng, arrLat, depLat);
    }
  }

  // NaN guard - fall back to estimates from stored times
  if (!isFinite(outboundMins) || !isFinite(returnMins)) {
    const storedArr = flight.arrivalTime ? flight.arrivalTime.substring(0, 5) : null;
    const depTimeStr = flight.departureTime ? flight.departureTime.substring(0, 5) : '00:00';
    const [dH, dM] = depTimeStr.split(':').map(Number);
    if (storedArr) {
      const [saH, saM] = storedArr.split(':').map(Number);
      const nDepDate = typeof flight.scheduledDate === 'string' ? flight.scheduledDate.substring(0, 10) : '';
      const nArrDate = flight.arrivalDate ? (typeof flight.arrivalDate === 'string' ? flight.arrivalDate.substring(0, 10) : new Date(flight.arrivalDate).toISOString().split('T')[0]) : nDepDate;
      const daysDiff = Math.round((new Date(nArrDate) - new Date(nDepDate)) / 86400000);
      const totalStored = (saH * 60 + saM) - (dH * 60 + dM) + daysDiff * 1440;
      const flightOnly = Math.max(0, totalStored - turnaroundMins);
      outboundMins = Math.round(flightOnly / 2);
      returnMins = flightOnly - outboundMins;
    } else {
      outboundMins = 120;
      returnMins = 120;
    }
  }

  // Calculate departure time in minutes from its day's midnight
  const depTimeStr = flight.departureTime ? flight.departureTime.substring(0, 5) : '00:00';
  const [depH, depM] = depTimeStr.split(':').map(Number);
  const depMinsFromMidnight = depH * 60 + depM;

  // Days from departure date to this transit day
  const normDepDate = typeof flight.scheduledDate === 'string' ? flight.scheduledDate.substring(0, 10) : '';
  const normViewDate = typeof viewingDate === 'string' ? viewingDate.substring(0, 10) : '';
  const daysFromDep = Math.round((new Date(normViewDate) - new Date(normDepDate)) / (1000 * 60 * 60 * 24));

  // Minutes from departure to the start of this transit day (its midnight)
  const dayStartFromDep = (daysFromDep * 1440) - depMinsFromMidnight;

  // Build segment list (minutes from departure)
  const segments = [
    { type: 'outbound', start: 0, end: outboundMins, routeNum: route.routeNumber || '', label: `${depAirport}-${arrAirport}` },
    { type: 'turnaround', start: outboundMins, end: outboundMins + turnaroundMins, routeNum: '', label: arrAirport },
    { type: 'return', start: outboundMins + turnaroundMins, end: outboundMins + turnaroundMins + returnMins, routeNum: route.returnRouteNumber || '', label: `${arrAirport}-${depAirport}` }
  ];

  // Helper to format minutes as HH:MM
  const minsToTime = (mins) => {
    const h = Math.floor(mins / 60) % 24;
    const m = Math.round(mins % 60 / 5) * 5;
    const finalH = m === 60 ? (h + 1) % 24 : h;
    const finalM = m === 60 ? 0 : m;
    return `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
  };

  let segmentsHtml = '';

  for (const seg of segments) {
    // Calculate overlap with this day [0, 1440] minutes from this day's midnight
    const overlapStart = Math.max(seg.start - dayStartFromDep, 0);
    const overlapEnd = Math.min(seg.end - dayStartFromDep, 1440);

    if (overlapStart >= overlapEnd) continue; // No overlap with this day

    const durationOnDay = overlapEnd - overlapStart;
    const leftPercent = (overlapStart / 60) * 100;
    const widthPercent = (durationOnDay / 60) * 100;

    const startsBeforeDay = seg.start < dayStartFromDep;
    const continuesAfterDay = seg.end > dayStartFromDep + 1440;
    const isCompact = durationOnDay < 90;

    // Border radius: flat edges where segment crosses day boundary
    let borderRadius = '';
    if (startsBeforeDay && continuesAfterDay) borderRadius = 'border-radius: 0;';
    else if (startsBeforeDay) borderRadius = 'border-radius: 0 3px 3px 0;';
    else if (continuesAfterDay) borderRadius = 'border-radius: 3px 0 0 3px;';

    // Left position: use -0.4rem for segments continuing from previous day
    const leftStyle = startsBeforeDay ? '-0.4rem' : `${leftPercent}%`;
    const widthStyle = startsBeforeDay ? `calc(${widthPercent}% + 0.4rem)` : `${widthPercent}%`;

    // Calculate display times for this segment on this day
    const segStartTime = minsToTime(overlapStart);
    const segEndTime = minsToTime(overlapEnd);

    const cssClass = seg.type === 'outbound' ? 'segment-outbound' :
                     seg.type === 'turnaround' ? 'segment-turnaround' :
                     'segment-return';

    if (seg.type === 'turnaround') {
      // Check daily check for turnaround - pass scheduledDate as departureDate to exclude downroute checks
      const dailyCheckDue = flight.aircraft && flight.arrivalDate
        ? isDailyCheckDueAtTurnaround(flight.aircraft, flight.arrivalDate, depTimeStr, flight.scheduledDate?.substring(0, 10))
        : false;

      segmentsHtml += `
        <div class="flight-segment ${cssClass} ${isCompact ? 'compact' : ''} ${dailyCheckDue ? 'has-daily-check' : ''}"
             style="left: ${leftStyle}; width: ${widthStyle}; ${borderRadius}"
             onclick="viewFlightDetails('${flight.id}')"
             title="Turnaround at ${arrAirport} (${turnaroundMins}m)${dailyCheckDue ? ' - DAILY CHECK (30m)' : ''} | ${segStartTime}-${segEndTime}">
          <span class="segment-label">${arrAirport}</span>
          ${dailyCheckDue
            ? `<span class="segment-time" style="color: #fbbf24;">Daily 30m</span>`
            : `<span class="segment-time">${turnaroundMins}m</span>`
          }
        </div>
      `;
    } else {
      segmentsHtml += `
        <div class="flight-segment ${cssClass} ${isCompact ? 'compact' : ''}"
             style="left: ${leftStyle}; width: ${widthStyle}; ${borderRadius}"
             onclick="viewFlightDetails('${flight.id}')"
             title="${seg.routeNum}: ${seg.label}${startsBeforeDay ? ' (continuing)' : ''}${continuesAfterDay ? ' (continues tomorrow)' : ''} | ${segStartTime}-${segEndTime}">
          <span class="segment-flight-num">${seg.routeNum}</span>
          <span class="segment-route">${seg.label}</span>
          ${!isCompact ? `<span class="segment-time">${segStartTime}-${segEndTime}</span>` : ''}
        </div>
      `;
    }
  }

  return segmentsHtml;
}

// Render flight blocks within a cell (daily view only)
function renderFlightBlocks(flights, viewingDate, isGrounded = false) {
  if (!flights || flights.length === 0) return '';

  // Blur style for grounded aircraft
  const blurStyle = isGrounded ? 'filter: blur(2px); opacity: 0.4;' : '';

  return flights.map(flight => {
    const route = flight.route;

    // Normalize dates to YYYY-MM-DD for reliable comparison
    const normSchedDate = typeof flight.scheduledDate === 'string' ? flight.scheduledDate.substring(0, 10) : '';
    const normArrDate = flight.arrivalDate ? (typeof flight.arrivalDate === 'string' ? flight.arrivalDate.substring(0, 10) : new Date(flight.arrivalDate).toISOString().split('T')[0]) : normSchedDate;
    const rawViewDate = typeof viewingDate === 'string' ? viewingDate.substring(0, 10) : '';

    // The viewing date may not align with the flight's actual dates (weekly recurring schedule).
    // Compute an effective viewing date within the flight's actual date range that matches
    // the viewing day-of-week, so all date-based comparisons work correctly.
    const viewDow = new Date(rawViewDate + 'T12:00:00').getDay();
    const schedDateObj = new Date(normSchedDate + 'T12:00:00');
    const arrDateObj = new Date(normArrDate + 'T12:00:00');
    const daysBetweenDepArr = Math.round((arrDateObj - schedDateObj) / 86400000);

    let normViewDate = rawViewDate;
    if (normSchedDate !== rawViewDate && normArrDate !== rawViewDate) {
      // Dates don't match directly - find the matching DOW within the flight's span
      // Also check one day before scheduledDate (pre-flight may start prev day)
      for (let i = -1; i <= daysBetweenDepArr + 1; i++) {
        const d = new Date(schedDateObj);
        d.setDate(d.getDate() + i);
        if (d.getDay() === viewDow) {
          normViewDate = d.toISOString().substring(0, 10);
          break;
        }
      }
    }

    // Use Date objects for reliable comparison
    const flightStart = new Date(normSchedDate);
    const flightEnd = new Date(normArrDate);
    const viewDate = new Date(normViewDate);

    // Check if this is an "in transit" day (departed before, arrives after)
    const isInTransit = flightStart < viewDate && flightEnd > viewDate;

    if (isInTransit) {
      // Render segmented transit day block showing outbound/turnaround/return
      // Pass effective normViewDate (DOW-aligned to flight's actual dates)
      const content = renderTransitDayBlock(flight, route, normViewDate);
      return blurStyle ? `<div style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; ${blurStyle}">${content}</div>` : content;
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

    // Leg minutes for tech stop routes (accessible outside the if block for segment rendering)
    let leg1Minutes = 0, leg2Minutes = 0, leg3Minutes = 0, leg4Minutes = 0;

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
        leg1Minutes = calculateFlightMinutes(leg1Distance, cruiseSpeed, depLng, techLng, depLat, techLat);
        leg2Minutes = calculateFlightMinutes(leg2Distance, cruiseSpeed, techLng, arrLng, techLat, arrLat);
        outboundFlightMinutes = leg1Minutes + techStopMinutes + leg2Minutes;

        // Return: leg3 (ARR→TECH) + techStop + leg4 (TECH→DEP)
        leg3Minutes = calculateFlightMinutes(leg2Distance, cruiseSpeed, arrLng, techLng, arrLat, techLat);
        leg4Minutes = calculateFlightMinutes(leg1Distance, cruiseSpeed, techLng, depLng, techLat, depLat);
        returnFlightMinutes = leg3Minutes + techStopMinutes + leg4Minutes;
      } else {
        // Direct route: departure -> arrival (with wind effect)
        outboundFlightMinutes = calculateFlightMinutes(route.distance, cruiseSpeed, depLng, arrLng, depLat, arrLat);
        // Return: arrival -> departure (opposite wind effect)
        returnFlightMinutes = calculateFlightMinutes(route.distance, cruiseSpeed, arrLng, depLng, arrLat, depLat);
      }
    }

    // Guard against NaN flight times - fall back to estimates from stored data
    if (!isFinite(outboundFlightMinutes) || !isFinite(returnFlightMinutes)) {
      // Calculate total from stored departure/arrival times
      const storedArr = flight.arrivalTime ? flight.arrivalTime.substring(0, 5) : null;
      if (storedArr) {
        const [saH, saM] = storedArr.split(':').map(Number);
        let totalStored = (saH * 60 + saM) - (hours * 60 + minutes);
        if (flight.arrivalDate && flight.arrivalDate !== flight.scheduledDate) {
          const daysDiff = Math.round((new Date(flight.arrivalDate) - new Date(flight.scheduledDate)) / 86400000);
          totalStored += daysDiff * 1440;
        }
        const flightOnly = Math.max(0, totalStored - turnaroundMinutes);
        outboundFlightMinutes = Math.round(flightOnly / 2);
        returnFlightMinutes = flightOnly - outboundFlightMinutes;
      } else {
        outboundFlightMinutes = 120;
        returnFlightMinutes = 120;
      }
    }

    // Calculate ACTUAL turnaround from stored times (not just route minimum)
    // actualTurnaround = total trip - outbound - return
    const storedArrForTurnaround = flight.arrivalTime ? flight.arrivalTime.substring(0, 5) : null;
    let actualTurnaroundMinutes = turnaroundMinutes; // default to route minimum
    if (storedArrForTurnaround) {
      const [saH2, saM2] = storedArrForTurnaround.split(':').map(Number);
      const nsd = typeof flight.scheduledDate === 'string' ? flight.scheduledDate.substring(0, 10) : '';
      const nad = flight.arrivalDate ? (typeof flight.arrivalDate === 'string' ? flight.arrivalDate.substring(0, 10) : new Date(flight.arrivalDate).toISOString().split('T')[0]) : nsd;
      const dd = Math.round((new Date(nad) - new Date(nsd)) / 86400000);
      const totalTrip = (saH2 * 60 + saM2) - (hours * 60 + minutes) + dd * 1440;
      const computed = totalTrip - outboundFlightMinutes - returnFlightMinutes;
      if (computed > 0) actualTurnaroundMinutes = computed;
    }

    // Calculate total duration (outbound + turnaround + return)
    const totalDurationMinutes = outboundFlightMinutes + actualTurnaroundMinutes + returnFlightMinutes;

    // Use stored arrival time as primary source, fall back to calculated
    const storedArrivalTime = flight.arrivalTime ? flight.arrivalTime.substring(0, 5) : null;
    let calculatedArrTime;
    if (storedArrivalTime) {
      calculatedArrTime = storedArrivalTime;
    } else {
      const calcDepDate = new Date(`2000-01-01T${flight.departureTime}`);
      const calcReturnArrDate = new Date(calcDepDate.getTime() + totalDurationMinutes * 60000);
      const calculatedArrHours = calcReturnArrDate.getHours() % 24;
      const calculatedArrMins = calcReturnArrDate.getMinutes();
      const roundedMins = Math.round(calculatedArrMins / 5) * 5;
      const finalArrHours = roundedMins === 60 ? (calculatedArrHours + 1) % 24 : calculatedArrHours;
      const finalArrMins = roundedMins === 60 ? 0 : roundedMins;
      calculatedArrTime = `${String(finalArrHours).padStart(2, '0')}:${String(finalArrMins).padStart(2, '0')}`;
    }

    // Check if this is an overnight arrival (flight departed before, arrives on this day)
    // Uses effective normViewDate (already DOW-aligned above)
    const isOvernightArrival = normArrDate === normViewDate && normSchedDate !== normViewDate;
    if (isOvernightArrival) {
      // calculatedArrTime already prefers stored flight.arrivalTime (set above)
      // Segment durations are already NaN-guarded (line 1729 fallback)
      const content = renderOvernightArrivalBlock(flight, route, calculatedArrTime, {
        outbound: outboundFlightMinutes,
        turnaround: actualTurnaroundMinutes,
        return: returnFlightMinutes
      });
      return blurStyle ? `<div style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; ${blurStyle}">${content}</div>` : content;
    }

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
      // Calculate minutes from departure to midnight
      const minutesUntilMidnight = (24 - hours) * 60 - minutes;

      // Get airport codes for overnight departure display
      const depAirport = route.departureAirport.iataCode || route.departureAirport.icaoCode;
      const arrAirport = route.arrivalAirport.iataCode || route.arrivalAirport.icaoCode;
      const techAirport = hasTechStop ? (route.techStopAirport.iataCode || route.techStopAirport.icaoCode) : null;

      // Build route string for tooltip
      const routeStr = hasTechStop
        ? `${depAirport}→${techAirport}→${arrAirport}→${techAirport}→${depAirport}`
        : `${depAirport}→${arrAirport}→${depAirport}`;

      // Helper to add minutes to a time string
      const addMinsToTime = (timeStr, mins) => {
        if (!timeStr) return '??:??';
        const [h, m] = timeStr.split(':').map(Number);
        const total = h * 60 + m + mins;
        const newH = Math.floor(total / 60) % 24;
        const newM = Math.round(total % 60 / 5) * 5;
        const finalH = newM === 60 ? (newH + 1) % 24 : newH;
        const finalM = newM === 60 ? 0 : newM;
        return `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
      };

      // Calculate key times
      const outboundArrTime = addMinsToTime(depTime, outboundFlightMinutes);
      const returnDepTimeCalc = addMinsToTime(depTime, outboundFlightMinutes + turnaroundMinutes);

      // Render overnight departure segments
      // Determine which segments fit before midnight
      let segmentsHtml = '';
      let currentLeft = leftPercent;
      let remainingMinutes = minutesUntilMidnight;

      // Outbound segment (or first part of it)
      const outboundWidth = Math.min(outboundFlightMinutes, remainingMinutes);
      const outboundWidthPercent = (outboundWidth / 60) * 100;
      const outboundContinues = outboundFlightMinutes > remainingMinutes;
      const outboundCompact = outboundWidth < 90 ? 'compact' : '';

      segmentsHtml += `
        <div class="flight-segment segment-outbound ${outboundCompact}"
             style="left: ${currentLeft}%; width: calc(${outboundWidthPercent}%${outboundContinues ? ' + 0.5rem' : ''}); ${outboundContinues ? 'border-radius: 3px 0 0 3px;' : ''}"
             onclick="viewFlightDetails('${flight.id}')"
             title="${route.routeNumber}: ${depAirport} → ${arrAirport} | ${depTime}-${outboundArrTime}${outboundContinues ? ' (continues tomorrow)' : ''}">
          <span class="segment-flight-num">${route.routeNumber}</span>
          <span class="segment-route">${depAirport}-${arrAirport}</span>
          <span class="segment-time">${depTime}${outboundContinues ? ' →' : '-' + outboundArrTime}</span>
        </div>
      `;
      currentLeft += outboundWidthPercent;
      remainingMinutes -= outboundWidth;

      // If outbound didn't finish, we're done for today
      if (!outboundContinues && remainingMinutes > 0) {
        // Turnaround segment (or first part of it)
        const turnaroundWidth = Math.min(turnaroundMinutes, remainingMinutes);
        const turnaroundWidthPercent = (turnaroundWidth / 60) * 100;
        const turnaroundContinues = turnaroundMinutes > remainingMinutes;
        const turnaroundCompact = turnaroundWidth < 45 ? 'compact' : '';

        segmentsHtml += `
          <div class="flight-segment segment-turnaround ${turnaroundCompact}"
               style="left: ${currentLeft}%; width: calc(${turnaroundWidthPercent}%${turnaroundContinues ? ' + 0.5rem' : ''});"
               onclick="viewFlightDetails('${flight.id}')"
               title="Turnaround at ${arrAirport} (${turnaroundMinutes}m)${turnaroundContinues ? ' (continues tomorrow)' : ''}">
            <span class="segment-label">${arrAirport}</span>
            <span class="segment-time">${turnaroundMinutes}m${turnaroundContinues ? ' →' : ''}</span>
          </div>
        `;
        currentLeft += turnaroundWidthPercent;
        remainingMinutes -= turnaroundWidth;

        // If turnaround finished, show return segment
        if (!turnaroundContinues && remainingMinutes > 0) {
          const returnWidth = Math.min(returnFlightMinutes, remainingMinutes);
          const returnWidthPercent = (returnWidth / 60) * 100;
          const returnContinues = returnFlightMinutes > remainingMinutes;
          const returnCompact = returnWidth < 90 ? 'compact' : '';
          const returnArrTimeCalc = addMinsToTime(returnDepTimeCalc, returnFlightMinutes);

          segmentsHtml += `
            <div class="flight-segment segment-return ${returnCompact}"
                 style="left: ${currentLeft}%; width: calc(${returnWidthPercent}%${returnContinues ? ' + 0.5rem' : ''}); ${returnContinues ? 'border-radius: 0;' : ''}"
                 onclick="viewFlightDetails('${flight.id}')"
                 title="${route.returnRouteNumber}: ${arrAirport} → ${depAirport} | ${returnDepTimeCalc}-${returnArrTimeCalc}${returnContinues ? ' (continues tomorrow)' : ''}">
              <span class="segment-flight-num">${route.returnRouteNumber}</span>
              <span class="segment-route">${arrAirport}-${depAirport}</span>
              <span class="segment-time">${returnContinues ? returnDepTimeCalc + ' →' : returnDepTimeCalc + '-' + returnArrTimeCalc}</span>
            </div>
          `;
        }
      }

      const content = `${preFlightExtensionHtmlEarly}${segmentsHtml}`;
      return blurStyle ? `<div style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; ${blurStyle}">${content}</div>` : content;
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
    // Use actual total duration (not widthPercent which incorrectly subtracts offset)
    const totalFlightWidthPercent = ((outboundFlightMinutes + turnaroundMinutes + returnFlightMinutes) / 60) * 100;
    const postFlightLeftPercent = leftPercent + totalFlightWidthPercent;

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

    // Render segmented flight strips: Outbound → Turnaround (purple) → Return
    const segmentsHtml = renderFlightSegments({
      flight,
      route,
      leftPercent,
      outboundMins: outboundFlightMinutes,
      turnaroundMins: turnaroundMinutes,
      returnMins: returnFlightMinutes,
      hasTechStop: !!hasTechStop,
      legMins: hasTechStop ? { leg1: leg1Minutes, leg2: leg2Minutes, leg3: leg3Minutes, leg4: leg4Minutes } : {},
      depAirport,
      arrAirport,
      techStopAirport,
      depTime,
      returnArrTime
    });

    // Wrap with blur if grounded (absolute positioning preserves layout)
    const content = `${preFlightExtensionHtml}${segmentsHtml}${postFlightExtensionHtml}`;
    return blurStyle ? `<div style="position: absolute; left: 0; right: 0; top: 0; bottom: 0; ${blurStyle}">${content}</div>` : content;
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

      // Calculate post-flight duration using shared library
      const acType = aircraft.aircraft?.type || 'Narrowbody';
      const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;
      const postFlightEnd = arrMins + calculatePostFlightTotal(paxCapacity, acType).total;
      // Get the minute within the hour where post-flight ends
      const endMinuteInHour = postFlightEnd % 60;
      if (endMinuteInHour > flightEndMinuteInHour) {
        flightEndMinuteInHour = endMinuteInHour;
      }
    });
  }

  return maintenance.map(check => {
    // Skip daily checks that overlap with a flight turnaround - the turnaround segment
    // already shows the daily check visually with the purple/orange gradient
    if (check.checkType === 'daily') {
      const checkDate = check.displayDate || check.scheduledDate;
      const normCheckDate = typeof checkDate === 'string' ? checkDate.substring(0, 10) : '';
      const hasOverlappingFlight = scheduledFlights.some(f => {
        if (f.aircraftId != check.aircraftId) return false;
        const fSchedDate = typeof f.scheduledDate === 'string' ? f.scheduledDate.substring(0, 10) : '';
        const fArrDate = f.arrivalDate ? (typeof f.arrivalDate === 'string' ? f.arrivalDate.substring(0, 10) : new Date(f.arrivalDate).toISOString().split('T')[0]) : fSchedDate;
        // Flight is in transit or arrives on this date (turnaround happens downroute)
        const inTransit = fSchedDate < normCheckDate && fArrDate > normCheckDate;
        const arrivesToday = fArrDate === normCheckDate && fSchedDate !== normCheckDate;
        return inTransit || arrivesToday;
      });
      if (hasOverlappingFlight) return '';
    }

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
      'daily': { color: '#FFA500', label: 'D', description: 'Daily Check (30-90 min)', isHeavy: false },
      'weekly': { color: '#8B5CF6', label: 'W', description: 'Weekly Check (1.5-3 hrs)', isHeavy: false },
      'A': { color: '#17A2B8', label: 'A', description: 'A Check (6-12 hrs)', isHeavy: false },
      'C': { color: '#6B7280', label: 'C', description: 'C Check (2-4 weeks)', isHeavy: true },
      'D': { color: '#4B5563', label: 'D', description: 'D Check (2-3 months)', isHeavy: true }
    };
    const config = checkConfig[check.checkType] || { color: '#6C757D', label: check.checkType, description: 'Maintenance', isHeavy: false };
    const backgroundColor = config.color;
    const checkLabel = config.label;
    const checkDescription = config.description;
    const isHeavyMaintenance = config.isHeavy;

    // Get aircraft registration
    const registration = check.aircraft ? check.aircraft.registration : 'Unknown';

    // Check if maintenance starts where a flight/POST block ends (within 5 minutes tolerance)
    const isAdjacentToFlight = flightEndMinuteInHour >= 0 && Math.abs(minutes - flightEndMinuteInHour) <= 5;
    const borderRadius = isAdjacentToFlight ? '0 2px 2px 0' : '2px';

    // For heavy maintenance (C, D), extend across remaining visible schedule
    if (isHeavyMaintenance) {
      // Check if this is an ongoing multi-day block (not the first day)
      const isOngoing = check.isOngoing;
      const leftPos = isOngoing ? 0 : leftPercent; // Start from beginning if ongoing
      const borderRadiusHeavy = isOngoing ? '0' : '2px 0 0 2px';

      // Calculate which day of maintenance this is
      let dayLabel = '';
      if (check.scheduledDate && check.displayDate && check.scheduledDate !== check.displayDate) {
        const startDate = new Date(check.scheduledDate + 'T00:00:00Z');
        const displayDate = new Date(check.displayDate + 'T00:00:00Z');
        const dayNum = Math.floor((displayDate - startDate) / (24 * 60 * 60 * 1000)) + 1;
        dayLabel = `DAY ${dayNum}`;
      }

      // Extend from start position across all remaining cells (2400% = 24 hours worth)
      // This creates a visual indicator that the check continues for days/weeks
      return `
        <div
          class="maintenance-block heavy-maintenance"
          style="
            position: absolute;
            top: 2px;
            left: ${leftPos}%;
            width: 2400%;
            height: calc(100% - 4px);
            background: ${backgroundColor};
            border-radius: ${borderRadiusHeavy};
            color: white;
            font-size: 0.75rem;
            font-weight: 700;
            padding: 0.15rem 0.4rem;
            cursor: pointer;
            z-index: 2;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            white-space: nowrap;
            overflow: hidden;
          "
          onclick="viewMaintenanceDetails('${check.id}')"
          title="${checkLabel} CHECK: ${checkDescription} | ${isOngoing ? dayLabel + ' - ' : 'Started ' + startTime + ' - '}ongoing for weeks"
        >
          <span style="background: rgba(255,255,255,0.2); padding: 0.1rem 0.3rem; border-radius: 2px;">${checkLabel}</span>
          <span style="opacity: 0.7; font-size: 0.7rem;">${dayLabel || 'IN PROGRESS'}</span>
          <span style="margin-left: auto; opacity: 0.6;">▸▸▸</span>
        </div>
      `;
    }

    // For A checks that start and extend past midnight (overnight A checks)
    if (check.checkType === 'A') {
      const startMinutes = hours * 60 + minutes;
      const endMinutes = startMinutes + durationMinutes;
      const isOvernight = check.spansOvernight || endMinutes > 1440;

      if (isOvernight) {
        // A check extends past midnight - show visual indication
        const minutesToMidnight = 1440 - startMinutes;
        const cappedWidthPercent = (minutesToMidnight / 60) * 100;

        // Get completion time on next day
        const nextDayEndTime = check.endTimeNextDay || endTime;
        const tooltipText = `${checkLabel}: ${checkDescription} | Start ${startTime}, ends ${nextDayEndTime} (next day)`;

        return `
          <div
            class="maintenance-block"
            style="
              position: absolute;
              top: 2px;
              left: ${leftPercent}%;
              width: ${cappedWidthPercent}%;
              height: calc(100% - 4px);
              background: ${backgroundColor};
              border-radius: ${borderRadius} 0 0 ${borderRadius};
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
            title="${tooltipText}"
          >
            <span>${checkLabel}</span>
          </div>
        `;
      }
    }

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
        ${checkLabel}
      </div>
    `;
  }).join('');
}

// Scheduling wrapper for pre-flight calculation using shared library
function calculatePreFlightDuration(aircraft, route) {
  const acType = aircraft.aircraft?.type || 'Narrowbody';
  const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;
  const distance = route?.distance || 0;
  return calculatePreFlightTotal(distance, paxCapacity, acType).total;
}

// Scheduling wrapper for post-flight calculation using shared library
// Returns { duration: number, hasHeavyCheck: boolean, checkType: 'C'|'D'|null }
function calculatePostFlightDuration(aircraft, scheduledDate) {
  const acType = aircraft.aircraft?.type || 'Narrowbody';
  const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;

  const totalDuration = calculatePostFlightTotal(paxCapacity, acType).total;

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

  // Get aircraft details using shared library functions
  const acType = aircraft.aircraft?.type || 'Narrowbody';
  const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;

  const deboardingDuration = calculateDeboardingDuration(paxCapacity, acType);
  const deboardingEndMins = arrHomeMins + deboardingDuration;

  const cleaningDuration = calculateCleaningDuration(paxCapacity);
  const cleaningEndMins = deboardingEndMins + cleaningDuration;

  const cateringDuration = calculateCateringDuration(paxCapacity, acType);
  let cateringEndMins = deboardingEndMins;
  if (cateringDuration > 0) {
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
        f.aircraft.id == aircraft.id && // Use == for type-coercive comparison
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
      // Calculate fuelling duration based on next flight's distance using shared library
      const nextDistance = nextFlight.route?.distance || 0;
      fuellingDuration = calculateFuellingDuration(nextDistance);
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

  const lastCheckDate = aircraft[lastCheckField];
  if (!lastCheckDate) return false; // Never had a check, not automatically due yet

  // Use stored interval or generate random interval for this aircraft (18-24 months for C, 6-10 years for D)
  const interval = aircraft[intervalField] || getCheckIntervalForAircraft(aircraft.id, checkType);
  const lastCheck = new Date(lastCheckDate);
  const flightDateObj = new Date(flightDate + 'T23:59:59Z');

  // Calculate expiry date
  const expiryDate = new Date(lastCheck);
  expiryDate.setUTCDate(expiryDate.getUTCDate() + interval);

  // Check is due if flight date is past expiry
  return flightDateObj >= expiryDate;
}

// Check if a daily check is due for the flight date
// Daily checks are valid for 2 calendar days until midnight UTC
function isDailyCheckDue(aircraft, flightDate) {
  const lastCheckDate = aircraft.lastDailyCheckDate;
  if (!lastCheckDate) return true; // No daily check recorded, assume needed

  const lastCheck = new Date(lastCheckDate);
  const flightDateObj = new Date(flightDate + 'T23:59:59Z');

  // Daily checks valid for 2 days
  const expiryDate = new Date(lastCheck);
  expiryDate.setUTCDate(expiryDate.getUTCDate() + 2);

  // Daily check is due if flight date is past expiry
  return flightDateObj >= expiryDate;
}

/**
 * Check if a daily check is needed at turnaround (downroute)
 * Only returns true if:
 * 1. A daily check is due based on expiry, AND
 * 2. There's no scheduled daily check at home base that would cover the flight
 *
 * The preference is always to do daily checks at home base. Only do downroute
 * checks if the flying schedule doesn't allow for a home base check.
 */
function isDailyCheckDueAtTurnaround(aircraft, turnaroundDate, departureTime = null, departureDate = null) {
  // First check if a daily check is even due by the turnaround date
  if (!isDailyCheckDue(aircraft, turnaroundDate)) {
    return false; // No daily check needed at all
  }

  // Check if there's a scheduled daily check at home base that would cover this flight
  const aircraftId = aircraft.id;
  const turnaroundDateObj = new Date(turnaroundDate + 'T00:00:00');

  // Look for scheduled daily checks on the turnaround date or the day before (within 2-day validity)
  const coveringCheck = scheduledMaintenance.find(m => {
    const maintAircraftId = m.aircraftId || m.aircraft?.id;
    if (maintAircraftId != aircraftId) return false;
    if (m.checkType !== 'daily') return false;
    if (m.status === 'completed' || m.status === 'inactive') return false;

    const checkDate = m.scheduledDate;
    if (!checkDate) return false;

    // Only consider checks scheduled at home base (on or before departure date)
    // Downroute checks (scheduled after departure) are the turnaround checks themselves
    // and should not cancel out the need for a turnaround check
    if (departureDate && checkDate > departureDate) return false;

    // Check completes after startTime + duration
    const checkDateObj = new Date(checkDate + 'T00:00:00');
    const [checkH, checkM] = (m.startTime || '00:00').substring(0, 5).split(':').map(Number);
    const checkDuration = m.duration || 60;
    const checkEndMinutes = checkH * 60 + checkM + checkDuration;

    // A daily check covers the flight if:
    // 1. It's on the same date AND completes before departure, OR
    // 2. It's on the previous date (still within 2-day validity window)
    const daysDiff = Math.floor((turnaroundDateObj - checkDateObj) / (1000 * 60 * 60 * 24));

    if (daysDiff === 0) {
      // Same day - check must complete before flight departure
      if (departureTime) {
        const [depH, depM] = departureTime.substring(0, 5).split(':').map(Number);
        const depMinutes = depH * 60 + depM;
        // Check completes before departure (with some buffer for pre-flight)
        return checkEndMinutes <= depMinutes - 30;
      }
      // No departure time specified, assume any same-day check covers it
      return true;
    } else if (daysDiff === 1) {
      // Previous day - within 2-day validity, so it covers today
      return true;
    }

    return false;
  });

  // If there's a covering check at home base, no turnaround check needed
  if (coveringCheck) {
    return false;
  }

  // No covering check found - daily check is needed at turnaround
  return true;
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

  // Calculate pre-flight durations using shared library
  const distance = route?.distance || 0;
  const cateringDuration = calculateCateringDuration(paxCapacity, acType);
  const boardingDuration = calculateBoardingDuration(paxCapacity, acType);
  const fuellingDuration = calculateFuellingDuration(distance);
  const cateringBoardingDuration = cateringDuration + boardingDuration;
  const totalDuration = Math.max(cateringBoardingDuration, fuellingDuration);

  // Calculate progress based on current time
  const now = typeof window.getGlobalWorldTime === 'function' ? window.getGlobalWorldTime() : new Date();
  const scheduledDate = flight.scheduledDate;
  const depTime = flight.departureTime.substring(0, 5);
  const [depH, depM] = depTime.split(':').map(Number);

  // Create departure datetime (use local time to match world time)
  const [year, month, day] = scheduledDate.split('-').map(Number);
  const departureTime = new Date(year, month - 1, day, depH, depM);

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

  // Calculate post-flight durations using shared library
  const deboardingDuration = calculateDeboardingDuration(paxCapacity, acType);
  const cleaningDuration = calculateCleaningDuration(paxCapacity);
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

  // Create arrival datetime (use local time to match world time)
  const [year, month, day] = scheduledDate.split('-').map(Number);
  const departureDateTime = new Date(year, month - 1, day, depHour, depMin);
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
        <span style="color: #8b949e; font-size: 0.85rem;">Aircraft next available:</span>
        <span style="color: #f85149; font-size: 0.85rem; font-weight: 600;">${formatDateShort(releaseDate)} (after D Check)</span>
      </div>
    `;
  } else if (cCheckDue) {
    const releaseDate = addDaysToDate(scheduledDate, 14);
    content += `
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #8b949e; font-size: 0.85rem;">Aircraft next available:</span>
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
        <span style="color: #8b949e; font-size: 0.85rem;">Aircraft next available:</span>
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

  // Calculate post-flight duration using shared library
  const deboardingDuration = calculateDeboardingDuration(paxCapacity, acType);
  const cleaningDuration = calculateCleaningDuration(paxCapacity);
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
          <span style="color: #8b949e; font-size: 0.85rem;">Aircraft next available:</span>
          <span style="color: #f85149; font-size: 0.85rem; font-weight: 600;">${formatDateShort(releaseDate)} (after D Check)</span>
        </div>
      </div>
    `;
  } else if (cCheckDue) {
    const releaseDate = addDaysToDate(scheduledDate, 14);
    availableHtml = `
      <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #30363d;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #8b949e; font-size: 0.85rem;">Aircraft next available:</span>
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
          <span style="color: #8b949e; font-size: 0.85rem;">Aircraft next available:</span>
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
            <span id="showOnMapBtnContainer" data-registration="${aircraft.registration}" data-scheduled-date="${scheduledDate}" data-out-dep-min="${outboundDepartureMin}" data-out-arr-min="${outboundArrivalMin}" data-ret-dep-min="${returnDepartureMin}" data-ret-arr-min="${returnArrivalMin}">${isAirborne ? `<button onclick="showAircraftOnMap('${aircraft.registration}')" style="
              padding: 0.5rem 1rem;
              background: #1f6feb;
              border: 1px solid #388bfd;
              border-radius: 6px;
              color: white;
              cursor: pointer;
              font-size: 0.9rem;
              font-weight: 500;
            ">Show on Map</button>` : ''}</span>
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

  // Set up interval to update Show on Map button dynamically
  flightDetailsUpdateInterval = setInterval(() => {
    updateShowOnMapButton();
  }, 1000);
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

// Dynamically update Show on Map button based on current flight status
function updateShowOnMapButton() {
  const container = document.getElementById('showOnMapBtnContainer');
  if (!container) return;

  const registration = container.dataset.registration;
  const now = typeof window.getGlobalWorldTime === 'function' ? window.getGlobalWorldTime() : new Date();
  const nowMs = now.getTime();

  let isAirborne = false;

  // Check if we have timestamp data (weekly modal format)
  if (container.dataset.outboundDep) {
    const outDep = parseInt(container.dataset.outboundDep);
    const outArr = parseInt(container.dataset.outboundArr);
    const retDep = parseInt(container.dataset.returnDep);
    const retArr = parseInt(container.dataset.returnArr);
    isAirborne = (nowMs >= outDep && nowMs < outArr) || (nowMs >= retDep && nowMs < retArr);
  }
  // Check if we have minute-based data (simple modal format)
  else if (container.dataset.scheduledDate) {
    const scheduledDate = container.dataset.scheduledDate;
    const outDepMin = parseInt(container.dataset.outDepMin);
    const outArrMin = parseInt(container.dataset.outArrMin);
    const retDepMin = parseInt(container.dataset.retDepMin);
    const retArrMin = parseInt(container.dataset.retArrMin);

    const nowStr = now.toISOString().split('T')[0];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const isToday = nowStr === scheduledDate;

    // Outbound check
    const isOnOutbound = isToday && currentMinutes >= outDepMin && currentMinutes < outArrMin;

    // Return check with day overflow handling
    const returnSpansNextDay = retArrMin >= 1440;
    let isOnReturn = false;
    if (!returnSpansNextDay) {
      isOnReturn = isToday && currentMinutes >= retDepMin && currentMinutes < retArrMin;
    } else {
      const flightDate = new Date(scheduledDate + 'T00:00:00');
      const nextDay = new Date(flightDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0];
      isOnReturn = (isToday && currentMinutes >= retDepMin) ||
                   (nowStr === nextDayStr && currentMinutes < (retArrMin - 1440));
    }

    isAirborne = isOnOutbound || isOnReturn;
  }

  // Update button visibility
  const hasButton = container.querySelector('button') !== null;
  if (isAirborne && !hasButton) {
    container.innerHTML = `<button onclick="showAircraftOnMap('${registration}')" style="
      padding: 0.5rem 1rem;
      background: #1f6feb;
      border: 1px solid #388bfd;
      border-radius: 6px;
      color: white;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
    ">Show on Map</button>`;
  } else if (!isAirborne && hasButton) {
    container.innerHTML = '';
  }
}

// Create next flight - navigate to route creation page with pre-filled time
function createNextFlight(aircraftId, routeId, availableTime) {
  closeFlightDetailsModal();
  // Navigate to route creation page with the available time pre-filled
  let url = '/routes/create';
  if (availableTime) {
    url += `?time=${encodeURIComponent(availableTime)}`;
  }
  window.location.href = url;
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

  // Calculate pre-flight durations using shared library (same for both sectors)
  const distance = route?.distance || 0;
  const cateringDuration = calculateCateringDuration(paxCapacity, acType);
  const boardingDuration = calculateBoardingDuration(paxCapacity, acType);
  const fuellingDuration = calculateFuellingDuration(distance);
  const preFlightTotal = Math.max(cateringDuration + boardingDuration, fuellingDuration);

  // Calculate post-flight durations using shared library (same for both sectors)
  const deboardingDuration = calculateDeboardingDuration(paxCapacity, acType);
  const cleaningDuration = calculateCleaningDuration(paxCapacity);
  const postFlightTotal = deboardingDuration + cleaningDuration;

  // Check for heavy maintenance
  const cCheckDue = isHeavyCheckDue(aircraft, 'C', scheduledDate);
  const dCheckDue = isHeavyCheckDue(aircraft, 'D', scheduledDate);

  // Check if daily check is due during turnaround (only if no home base check covers)
  // For multi-day flights, the turnaround happens on a later date than departure
  const turnaroundDaysAfterDep = Math.floor(arrAtDestMins / 1440);
  const turnaroundDate = turnaroundDaysAfterDep > 0 ? addDaysToDate(scheduledDate, turnaroundDaysAfterDep) : scheduledDate;
  let dailyCheckDue = isDailyCheckDueAtTurnaround(aircraft, turnaroundDate, depTime, scheduledDate);
  const dailyCheckDuration = 30; // Daily check takes 30 minutes

  // Fallback: if a downroute daily check is actually scheduled, show it regardless of expiry calc
  if (!dailyCheckDue) {
    dailyCheckDue = scheduledMaintenance.some(m => {
      const maintAircraftId = m.aircraftId || m.aircraft?.id;
      if (maintAircraftId != aircraft.id) return false;
      if (m.checkType !== 'daily') return false;
      if (m.status !== 'active') return false;
      const checkDate = typeof m.scheduledDate === 'string' ? m.scheduledDate.substring(0, 10) : '';
      return checkDate === turnaroundDate && checkDate > scheduledDate;
    });
  }

  // Calculate all phase times - MUST match display times for consistency
  const now = typeof window.getGlobalWorldTime === 'function' ? window.getGlobalWorldTime() : new Date();
  const [year, month, day] = scheduledDate.split('-').map(Number);
  // Use local time (not UTC) to match how world time is represented
  const departureDateTime = new Date(year, month - 1, day, depH, depM);

  // Check if this flight is in the future (scheduled date is after current world date)
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const flightDateOnly = new Date(year, month - 1, day);
  const isFutureFlight = flightDateOnly > nowDateOnly;

  // Outbound sector times
  const outboundPreFlightStart = new Date(departureDateTime.getTime() - preFlightTotal * 60000);
  const outboundDepartureTime = departureDateTime;
  const outboundArrivalTime = new Date(departureDateTime.getTime() + outboundMinutes * 60000);

  // Return departs at arrAtDestMins + turnaroundMinutes (same as display shows)
  const returnDepartureTime = new Date(outboundArrivalTime.getTime() + turnaroundMinutes * 60000);
  const returnArrivalTime = new Date(returnDepartureTime.getTime() + returnMinutes * 60000);

  // For progress calculations: return pre-flight starts after outbound post-flight
  // Cap post-flight at turnaround time to ensure pre-flight doesn't start after return departure
  const effectivePostFlightAtDest = Math.min(postFlightTotal, turnaroundMinutes);
  const returnPreFlightStart = new Date(outboundArrivalTime.getTime() + effectivePostFlightAtDest * 60000);


  // Helper to calculate progress for a phase
  const calcPhaseProgress = (phaseStartTime, phaseDurationMins) => {
    // Future flights always show 0% progress
    if (isFutureFlight) return 0;

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

  // Daily check progress (starts after cleaning, during turnaround)
  const dailyCheckStartTime = new Date(outboundArrivalTime.getTime() + (deboardingDuration + cleaningDuration) * 60000);
  const outDailyCheckProgress = dailyCheckDue ? calcPhaseProgress(dailyCheckStartTime, dailyCheckDuration) : 100;

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

  // Determine if sectors are complete (for dimming)
  const isOutboundComplete = outFlightProgress === 100 && outPostFlightProgress === 100;
  const isReturnComplete = retFlightProgress === 100 && retPostFlightProgress === 100;
  const isFlightComplete = isOutboundComplete && isReturnComplete;

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
  // showDailyCheck and dailyCheckProg are optional - only used for outbound sector
  const buildPostFlightSection = (deboardingProg, cleaningProg, totalProg, prefix, showDailyCheck = false, dailyCheckProg = 0) => {
    const allComplete = showDailyCheck ? (totalProg === 100 && dailyCheckProg === 100) : totalProg === 100;
    const headerStyle = allComplete ? 'opacity: 0.4;' : '';
    return `
    <div style="flex: 1; min-width: 140px;">
      <div id="${prefix}-header" style="font-weight: 600; margin-bottom: 0.4rem; color: #58a6ff; font-size: 0.75rem; ${headerStyle}">POST-FLIGHT${allComplete ? ' ✓' : ''}</div>
      <div style="font-size: 0.75rem;">
        ${deboardingDuration > 0 ? actionRow('Deboarding', deboardingDuration, deboardingProg, '#58a6ff', `${prefix}-deboard`) : ''}
        ${actionRow('Cleaning', cleaningDuration, cleaningProg, '#58a6ff', `${prefix}-cleaning`)}
        ${showDailyCheck ? actionRow('Daily Check', dailyCheckDuration, dailyCheckProg, '#fbbf24', `${prefix}-daily`) : ''}
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

  // Calculate aircraft available time (when post-flight ends and aircraft is ready for duty)
  const availableMins = arrHomeMins + postFlightTotal;
  let availableText = '';
  let availableTimeForNextFlight = ''; // HH:MM format for route creation
  if (dCheckDue) {
    const releaseDate = addDaysToDate(scheduledDate, 60);
    availableText = `<span style="color: #f85149;">${formatDateShort(releaseDate)} (after D Check)</span>`;
    availableTimeForNextFlight = '08:00'; // Default morning time after heavy maintenance
  } else if (cCheckDue) {
    const releaseDate = addDaysToDate(scheduledDate, 14);
    availableText = `<span style="color: #a371f7;">${formatDateShort(releaseDate)} (after C Check)</span>`;
    availableTimeForNextFlight = '08:00'; // Default morning time after heavy maintenance
  } else {
    const availableDay = Math.floor(availableMins / 1440);
    let availableDateStr = scheduledDate;
    if (availableDay > 0) {
      availableDateStr = addDaysToDate(scheduledDate, availableDay);
    }
    availableTimeForNextFlight = formatTime(availableMins % 1440); // Time of day in HH:MM
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
          </div>

          <!-- Two sector columns -->
          <div style="display: flex; gap: 1.5rem;">
            <!-- Outbound Sector -->
            <div id="outbound-sector" style="flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 1rem; ${isOutboundComplete ? 'opacity: 0.5;' : ''}">
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
                ${buildPostFlightSection(outDeboardingProgress, outCleaningProgress, outPostFlightProgress, 'out-post', dailyCheckDue, outDailyCheckProgress)}
              </div>
            </div>

            <!-- Return Sector -->
            <div id="return-sector" style="flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 1rem; ${isReturnComplete ? 'opacity: 0.5;' : ''}">
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

          <!-- Aircraft Next Available Section -->
          <div style="margin-top: 1.25rem; padding: 1rem; background: #21262d; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 0.75rem; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;">Aircraft Next Available</div>
              <div style="font-size: 1.25rem; font-weight: 700;">${availableText}</div>
            </div>
            <button onclick="createNextFlight('${aircraft.id}', '${route.id}', '${availableTimeForNextFlight}')" style="
              padding: 0.6rem 1.2rem;
              background: #238636;
              border: 1px solid #2ea043;
              border-radius: 6px;
              color: white;
              cursor: pointer;
              font-size: 0.85rem;
              font-weight: 600;
              display: flex;
              align-items: center;
              gap: 0.5rem;
            "><span style="font-size: 1.1rem;">+</span> Create Next Flight</button>
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
            <span id="showOnMapBtnContainer" data-registration="${aircraft.registration}" data-outbound-dep="${outboundDepartureTime.getTime()}" data-outbound-arr="${outboundArrivalTime.getTime()}" data-return-dep="${returnDepartureTime.getTime()}" data-return-arr="${returnArrivalTime.getTime()}">${isAirborne ? `<button onclick="showAircraftOnMap('${aircraft.registration}')" style="
              padding: 0.5rem 1rem;
              background: #1f6feb;
              border: 1px solid #388bfd;
              border-radius: 6px;
              color: white;
              cursor: pointer;
              font-size: 0.9rem;
              font-weight: 500;
            ">Show on Map</button>` : ''}</span>
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

    // Update Show on Map button visibility dynamically
    updateShowOnMapButton();

    // Get current world time
    const now = typeof window.getGlobalWorldTime === 'function' ? window.getGlobalWorldTime() : new Date();

    // Skip progress updates for future flights - keep showing "SCHEDULED"
    if (isFutureFlight) {
      return;
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
    // Daily check progress (starts after cleaning)
    const dailyCheckStart = new Date(outboundArrivalTime.getTime() + (deboardingDuration + cleaningDuration) * 60000);
    const dailyProg = dailyCheckDue ? calcProgress(dailyCheckStart, dailyCheckDuration) : 100;
    if (dailyCheckDue) updateProgressBar('out-post-daily', dailyProg);
    updateSectionComplete('out-post', dailyCheckDue ? (outPostTotal === 100 && dailyProg === 100) : outPostTotal === 100);

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

    // Update sector dimming when complete
    const outFlightProg = calcProgress(outboundDepartureTime, outboundMinutes);
    const retFlightProg = calcProgress(returnDepartureTime, returnMinutes);
    const outboundSector = document.getElementById('outbound-sector');
    const returnSector = document.getElementById('return-sector');

    if (outboundSector && outFlightProg === 100 && outPostTotal === 100) {
      outboundSector.style.opacity = '0.5';
    }
    if (returnSector && retFlightProg === 100 && retPostTotal === 100) {
      returnSector.style.opacity = '0.5';
    }
  }, 1000);
}

async function removeFlightFromModal(flightId) {
  closeFlightDetailsModal();
  await deleteScheduledFlight(flightId);
}

// Delete scheduled flight
async function deleteScheduledFlight(flightId) {
  try {
    // Get the aircraft ID before deleting so we can refresh maintenance
    const flight = scheduledFlights.find(f => f.id === flightId);
    const aircraftId = flight?.aircraftId;

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

    // Refresh auto-maintenance for this aircraft after removing flight
    if (aircraftId) {
      try {
        const refreshResp = await fetch(`/api/fleet/${aircraftId}/refresh-maintenance`, { method: 'POST' });
        const refreshData = await refreshResp.json();
        console.log('[MAINT] Refreshed:', refreshData.scheduledChecks, 'checks for', aircraftId);
      } catch (e) {
        console.error('Error refreshing maintenance:', e);
      }
    }

    await showAlertModal('Success', 'Flight deleted successfully');
    // Force fresh data fetch by reloading schedule
    await loadSchedule();
  } catch (error) {
    console.error('Error deleting flight:', error);
    await showAlertModal('Error', error.message);
  }
}

// Maintenance check task lists
const MAINTENANCE_TASKS = {
  daily: [
    'External visual inspection (fuselage, wings, empennage)',
    'Check tires, brakes, struts for damage/leaks',
    'Check fluid levels (oil, hydraulic, oxygen)',
    'Inspect lights, antennas, probes',
    'Check engine inlets/exhaust for FOD',
    'Check avionics cooling and vents',
    'Review aircraft technical log',
    'Check emergency equipment status',
    'Check cabin condition and safety items',
    'Rectify minor defects if required'
  ],
  weekly: [
    'More detailed exterior inspection',
    'Operational checks of flight controls',
    'Check engine oil consumption trends',
    'Test warning systems and indicators',
    'Inspect landing gear bays',
    'Check battery condition and charging',
    'Check windshield and wipers',
    'Inspect cabin systems more thoroughly',
    'Review deferred defects (MEL items)',
    'Perform scheduled lubrication tasks'
  ],
  A: [
    'Detailed visual inspection of airframe',
    'Operational checks of avionics systems',
    'Check and service fluids and filters',
    'Inspect brakes and wheels (may change)',
    'Inspect flight control linkages',
    'Test autopilot and navigation systems',
    'Inspect engine components (no teardown)',
    'Check corrosion-prone areas',
    'Perform software/database updates',
    'Clear or re-defer MEL items'
  ],
  C: [
    'Extensive airframe inspection (panels removed)',
    'Detailed structural inspections',
    'Non-destructive testing (NDT) on structure',
    'Inspect wiring looms and connectors',
    'Overhaul or replace major components',
    'Inspect and service landing gear (partial)',
    'Corrosion detection and treatment',
    'Cabin refurbishment and system checks',
    'Compliance with major ADs and SBs',
    'Functional testing of all major systems'
  ],
  D: [
    'Complete aircraft teardown (interior & exterior)',
    'Full structural inspection of fuselage, wings',
    'Extensive corrosion removal and repair',
    'Landing gear removed and fully overhauled',
    'Engines removed (sent for overhaul)',
    'Replacement of life-limited parts',
    'Major structural modifications if required',
    'Full rewiring or harness replacement (if needed)',
    'Complete repaint of aircraft',
    'Aircraft essentially rebuilt and re-certified'
  ]
};

// View maintenance check details
async function viewMaintenanceDetails(maintenanceId) {
  try {
    console.log('[MAINT] Opening details for maintenance:', maintenanceId);

    // Search by exact ID first, then by patternId (for heavy maintenance blocks)
    let maintenance = scheduledMaintenance.find(m => m.id === maintenanceId);
    if (!maintenance) {
      // Try matching by patternId (for C/D checks where we pass patternId instead of full ID)
      maintenance = scheduledMaintenance.find(m => m.patternId === maintenanceId || m.id.startsWith(maintenanceId + '-'));
    }
    if (!maintenance) {
      console.error('[MAINT] Maintenance not found:', maintenanceId);
      console.log('[MAINT] Available maintenance IDs:', scheduledMaintenance.map(m => ({ id: m.id, patternId: m.patternId })));
      await showAlertModal('Error', 'Maintenance record not found. Please refresh the page.');
      return;
    }

    console.log('[MAINT] Found maintenance:', maintenance.checkType, 'startTime:', maintenance.startTime);

    // Get aircraft - either from maintenance object or from fleet
    let aircraft = maintenance.aircraft;
    if (!aircraft && maintenance.aircraftId) {
      aircraft = userFleet.find(a => a.id === maintenance.aircraftId);
    }
    if (!aircraft) {
      console.error('[MAINT] Aircraft not found for maintenance:', maintenance);
      await showAlertModal('Error', 'Aircraft data not found. Please refresh the page.');
      return;
    }

    console.log('[MAINT] Aircraft:', aircraft.registration);

    // Store the current maintenance ID for live updates
    currentMaintenanceModalId = maintenanceId;

    // Create the modal shell first (header and footer are static)
    const checkColors = { 'daily': '#FFA500', 'weekly': '#8B5CF6', 'A': '#17A2B8', 'C': '#6B7280', 'D': '#4B5563' };
    const checkColor = checkColors[maintenance.checkType] || '#6b7280';
    const checkTypeLabels = { 'daily': 'Daily Check', 'weekly': 'Weekly Check', 'A': 'A Check', 'C': 'C Check', 'D': 'D Check' };
    const checkType = checkTypeLabels[maintenance.checkType] || `${maintenance.checkType} Check`;

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
      " onclick="if(event.target === this) closeMaintenanceDetailsModal()">
        <div style="
          background: #161b22;
          border: 1px solid #30363d;
          border-radius: 8px;
          width: 680px;
          max-width: 95vw;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        ">
          <!-- Header -->
          <div style="padding: 1rem 1.25rem; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; background: ${checkColor}15;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="background: ${checkColor}; color: white; padding: 0.25rem 0.6rem; border-radius: 4px; font-weight: 700; font-size: 0.9rem;">${maintenance.checkType === 'daily' ? 'D' : maintenance.checkType === 'weekly' ? 'W' : maintenance.checkType}</span>
              <div>
                <h3 style="margin: 0; color: #f0f6fc; font-size: 1rem;">${checkType}</h3>
                <span style="color: #8b949e; font-size: 0.75rem;">${aircraft.registration}</span>
              </div>
            </div>
            <button onclick="closeMaintenanceDetailsModal()" style="background: none; border: none; color: #8b949e; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
          </div>

          <!-- Dynamic content container (updated live) -->
          <div id="maintenanceModalContent"></div>

          <!-- Footer -->
          <div style="padding: 0.75rem 1.25rem; border-top: 1px solid #30363d; display: flex; gap: 0.75rem; justify-content: flex-end;">
            <button onclick="closeMaintenanceDetailsModal()" style="
              padding: 0.4rem 0.8rem;
              background: #21262d;
              border: 1px solid #30363d;
              border-radius: 6px;
              color: #c9d1d9;
              cursor: pointer;
              font-size: 0.8rem;
            ">Close</button>
            <button onclick="removeMaintenanceFromModal('${maintenanceId}')" style="
              padding: 0.4rem 0.8rem;
              background: #da3633;
              border: 1px solid #f85149;
              border-radius: 6px;
              color: white;
              cursor: pointer;
              font-size: 0.8rem;
            ">Remove Check</button>
          </div>
        </div>
      </div>
    `;

    // Remove existing modal if any
    const existingModal = document.getElementById('maintenanceDetailsModal');
    if (existingModal) existingModal.remove();

    // Clear any existing update interval
    if (maintenanceDetailsUpdateInterval) {
      clearInterval(maintenanceDetailsUpdateInterval);
      maintenanceDetailsUpdateInterval = null;
    }

    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Render initial content
    updateMaintenanceModalContent(maintenance, aircraft);

    // Set up live update interval (every second for smooth progress updates)
    maintenanceDetailsUpdateInterval = setInterval(() => {
      const modal = document.getElementById('maintenanceDetailsModal');
      if (!modal) {
        // Modal was closed, clear interval
        clearInterval(maintenanceDetailsUpdateInterval);
        maintenanceDetailsUpdateInterval = null;
        currentMaintenanceModalId = null;
        return;
      }
      updateMaintenanceModalContent(maintenance, aircraft);
    }, 1000);

  } catch (error) {
    console.error('[MAINT] Error showing maintenance details:', error);
    await showAlertModal('Error', 'Failed to load maintenance details. Check console for details.');
  }
}

// Update the dynamic content of the maintenance modal (called every second for live updates)
function updateMaintenanceModalContent(maintenance, aircraft) {
  const contentContainer = document.getElementById('maintenanceModalContent');
  if (!contentContainer) return;

  // Use actual duration from maintenance record, or calculate based on check type
  const checkTypeDurations = { 'daily': 60, 'weekly': 135, 'A': 540, 'C': 30240, 'D': 108000 };
  const durationMinutes = maintenance.duration || checkTypeDurations[maintenance.checkType] || 60;

  // For C/D checks that span multiple days, the "ongoing" blocks (on subsequent days) have
  // startTime='00:00:00'. Find the original pattern to get the real start time.
  let originalMaintenance = maintenance;
  if (maintenance.isOngoing && (maintenance.checkType === 'C' || maintenance.checkType === 'D')) {
    const aircraftId = maintenance.aircraftId || maintenance.aircraft?.id;
    const patternId = maintenance.patternId;

    // Try to find the original (non-ongoing) block
    let originalBlock = patternId ? scheduledMaintenance.find(m => m.patternId === patternId && !m.isOngoing) : null;

    if (!originalBlock) {
      originalBlock = scheduledMaintenance.find(m => {
        const mAircraftId = m.aircraftId || m.aircraft?.id;
        return mAircraftId == aircraftId &&
               m.checkType === maintenance.checkType &&
               m.scheduledDate === maintenance.scheduledDate &&
               !m.isOngoing;
      });
    }

    if (originalBlock) {
      originalMaintenance = originalBlock;
    }
  }

  // Handle startTime - could be a string "HH:MM:SS" or Date object
  let rawStartTime = originalMaintenance.startTime;
  if (rawStartTime instanceof Date) {
    rawStartTime = rawStartTime.toTimeString().split(' ')[0];
  }
  const startTimeForCalc = String(rawStartTime || '00:00:00');
  const endTime = calculateEndTime(startTimeForCalc, durationMinutes);

  // Check if this is an overnight A check (spans past midnight)
  const [sH, sM] = startTimeForCalc.split(':').map(Number);
  const startMinutesTotal = sH * 60 + sM;
  const isOvernightACheck = maintenance.checkType === 'A' && (startMinutesTotal + durationMinutes) > 1440;

  // For overnight A checks, format the end time with "(next day)" indicator
  let displayEndTime = endTime;
  if (isOvernightACheck) {
    displayEndTime = `${endTime} (next day)`;
  }

  // Determine check type label and description
  const checkIntervals = { 'daily': '1-2 days', 'weekly': '7-8 days', 'A': '800-1000 hrs', 'C': '~2 years', 'D': '5-7 years' };
  const checkInterval = checkIntervals[maintenance.checkType] || '';
  const checkDurationText = { 'daily': '30-90 mins', 'weekly': '1.5-3 hrs', 'A': '6-12 hrs', 'C': '2-4 weeks', 'D': '2-3 months' };

  // Determine maintenance status based on current game time AND date
  const gameTime = typeof getGlobalWorldTime === 'function' ? getGlobalWorldTime() : new Date();
  const currentDateStr = formatLocalDate(gameTime);
  // Use local time methods to match the displayed clock (which uses toLocaleTimeString)
  const currentTimeStr = `${String(gameTime.getHours()).padStart(2, '0')}:${String(gameTime.getMinutes()).padStart(2, '0')}`;
  const startTimeStr = startTimeForCalc.substring(0, 5);

  // Handle scheduledDate - use original maintenance's scheduledDate for calculations
  let rawScheduledDate = originalMaintenance.scheduledDate;
  if (rawScheduledDate instanceof Date) {
    rawScheduledDate = rawScheduledDate.toISOString().split('T')[0];
  }
  const scheduledDateStr = String(rawScheduledDate || '').split('T')[0];

  // Calculate elapsed time and progress for task list
  const [startH, startM] = startTimeStr.split(':').map(Number);
  // Create startDateTime using local time to match the displayed clock
  const startDateTime = new Date(scheduledDateStr + 'T' + startTimeStr + ':00');

  let elapsedMinutes = 0;
  let progressPercent = 0;
  let statusText, statusColor, availableText;

  // For multi-day checks (C, D), calculate completion date
  const isHeavyMaintenance = maintenance.checkType === 'C' || maintenance.checkType === 'D';
  const daysSpanned = Math.floor(durationMinutes / 1440);
  const completionDate = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);

  if (scheduledDateStr > currentDateStr) {
    statusText = 'SCHEDULED';
    statusColor = '#58a6ff';
    availableText = `Scheduled for ${scheduledDateStr}`;
    elapsedMinutes = 0;
    progressPercent = 0;
  } else if (isHeavyMaintenance) {
    // For heavy maintenance, calculate based on full duration including multiple days
    const now = gameTime.getTime();
    const start = startDateTime.getTime();
    const end = completionDate.getTime();

    if (now < start) {
      statusText = 'SCHEDULED';
      statusColor = '#58a6ff';
      availableText = `Starts ${startTimeStr}`;
      elapsedMinutes = 0;
      progressPercent = 0;
    } else if (now >= end) {
      statusText = 'COMPLETED';
      statusColor = '#3fb950';
      availableText = `Completed`;
      elapsedMinutes = durationMinutes;
      progressPercent = 100;
    } else {
      statusText = 'IN PROGRESS';
      statusColor = '#ffa657';
      elapsedMinutes = Math.floor((now - start) / (1000 * 60));
      progressPercent = Math.min(100, Math.round((elapsedMinutes / durationMinutes) * 100));
      const remainingDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
      availableText = `~${remainingDays} day${remainingDays !== 1 ? 's' : ''} remaining`;
    }
  } else if (isOvernightACheck) {
    // For overnight A checks, use date-aware comparison like heavy maintenance
    const now = gameTime.getTime();
    const start = startDateTime.getTime();
    const end = completionDate.getTime();

    if (now < start) {
      statusText = 'SCHEDULED';
      statusColor = '#58a6ff';
      availableText = `Starts ${startTimeStr}`;
      elapsedMinutes = 0;
      progressPercent = 0;
    } else if (now >= end) {
      statusText = 'COMPLETED';
      statusColor = '#3fb950';
      availableText = `Completed at ${displayEndTime}`;
      elapsedMinutes = durationMinutes;
      progressPercent = 100;
    } else {
      statusText = 'IN PROGRESS';
      statusColor = '#ffa657';
      elapsedMinutes = Math.floor((now - start) / (1000 * 60));
      progressPercent = Math.min(100, Math.round((elapsedMinutes / durationMinutes) * 100));
      const remainingMinutes = durationMinutes - elapsedMinutes;
      const remainingHours = Math.floor(remainingMinutes / 60);
      const remainingMins = remainingMinutes % 60;
      availableText = `~${remainingHours}h ${remainingMins}m remaining`;
    }
  } else {
    // For same-day checks (daily, weekly, non-overnight A checks)
    if (currentTimeStr < startTimeStr) {
      statusText = 'UPCOMING';
      statusColor = '#8b949e';
      availableText = `Available from ${endTime}`;
      elapsedMinutes = 0;
      progressPercent = 0;
    } else if (currentTimeStr < endTime) {
      statusText = 'IN PROGRESS';
      statusColor = '#ffa657';
      availableText = `Available from ${endTime}`;
      const [curH, curM] = currentTimeStr.split(':').map(Number);
      elapsedMinutes = (curH * 60 + curM) - (startH * 60 + startM);
      progressPercent = Math.min(100, Math.round((elapsedMinutes / durationMinutes) * 100));
    } else {
      statusText = 'COMPLETED';
      statusColor = '#3fb950';
      availableText = `Completed at ${displayEndTime}`;
      elapsedMinutes = durationMinutes;
      progressPercent = 100;
    }
  }

  // Get tasks for this check type
  const tasks = MAINTENANCE_TASKS[maintenance.checkType] || [];
  const taskCount = tasks.length;
  const minutesPerTask = taskCount > 0 ? durationMinutes / taskCount : 0;

  // Generate task list HTML with progress
  const taskListHtml = tasks.map((task, index) => {
    const taskStartMinute = index * minutesPerTask;
    const taskEndMinute = (index + 1) * minutesPerTask;

    let taskStatus, taskIcon, taskStyle;
    if (elapsedMinutes >= taskEndMinute) {
      taskStatus = 'completed';
      taskIcon = '✓';
      taskStyle = 'color: #3fb950; text-decoration: line-through; opacity: 0.7;';
    } else if (elapsedMinutes >= taskStartMinute) {
      taskStatus = 'in-progress';
      taskIcon = '⟳';
      taskStyle = 'color: #ffa657; font-weight: 600;';
    } else {
      taskStatus = 'pending';
      taskIcon = '○';
      taskStyle = 'color: #8b949e;';
    }

    return `
      <div style="display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.4rem 0.5rem; background: #21262d; border-radius: 4px;">
        <span style="width: 16px; text-align: center; flex-shrink: 0; ${taskStatus === 'completed' ? 'color: #3fb950;' : taskStatus === 'in-progress' ? 'color: #ffa657;' : 'color: #484f58;'}">${taskIcon}</span>
        <span style="${taskStyle} font-size: 0.78rem; line-height: 1.3;">${task}</span>
      </div>
    `;
  }).join('');

  // Format completion date for heavy maintenance
  let completionText = '';
  if (isHeavyMaintenance) {
    completionText = completionDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Update the content
  contentContainer.innerHTML = `
    <!-- Status & Progress -->
    <div style="padding: 1rem 1.25rem; border-bottom: 1px solid #30363d;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <span style="color: ${statusColor}; font-weight: 600; font-size: 0.9rem;">${statusText}</span>
        <span style="color: #f0f6fc; font-size: 0.85rem;">${progressPercent}% Complete</span>
      </div>
      <div style="background: #21262d; border-radius: 4px; height: 8px; overflow: hidden;">
        <div style="background: ${statusColor}; height: 100%; width: ${progressPercent}%; transition: width 0.3s;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem; color: #8b949e;">
        <span>${startTimeStr} ${isHeavyMaintenance ? `(${maintenance.scheduledDate})` : ''}</span>
        <span>${isHeavyMaintenance ? completionText : displayEndTime}</span>
      </div>
    </div>

    <!-- Info Grid -->
    <div style="padding: 0.75rem 1.25rem; border-bottom: 1px solid #30363d; display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.8rem;">
      <div>
        <span style="color: #8b949e;">Duration:</span>
        <span style="color: #f0f6fc; margin-left: 0.5rem;">${checkDurationText[maintenance.checkType] || durationMinutes + ' mins'}</span>
      </div>
      <div>
        <span style="color: #8b949e;">Interval:</span>
        <span style="color: #f0f6fc; margin-left: 0.5rem;">${checkInterval}</span>
      </div>
      <div style="grid-column: span 2;">
        <span style="color: #8b949e;">Availability:</span>
        <span style="color: #58a6ff; margin-left: 0.5rem; font-weight: 500;">${availableText}</span>
      </div>
    </div>

    <!-- Task List -->
    <div style="padding: 0.75rem 1.25rem;">
      <div style="color: #f0f6fc; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
        <span>Work Items</span>
        <span style="color: #8b949e; font-weight: 400; font-size: 0.75rem;">(${tasks.filter((_, i) => elapsedMinutes >= (i + 1) * minutesPerTask).length}/${taskCount} complete)</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem;">
        ${taskListHtml}
      </div>
    </div>
  `;
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
  // Clear the live update interval
  if (maintenanceDetailsUpdateInterval) {
    clearInterval(maintenanceDetailsUpdateInterval);
    maintenanceDetailsUpdateInterval = null;
  }
  currentMaintenanceModalId = null;

  const modal = document.getElementById('maintenanceDetailsModal');
  if (modal) modal.remove();
}

async function removeMaintenanceFromModal(maintenanceId) {
  closeMaintenanceDetailsModal();
  await deleteScheduledMaintenance(maintenanceId);
}

async function removeAllMaintenanceOfType(aircraftId, checkType) {
  closeMaintenanceDetailsModal();

  const checkTypeNames = { 'daily': 'daily checks', 'weekly': 'weekly checks', 'A': 'A checks' };
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
      !(m.aircraft.id == aircraftId && m.checkType === checkType) // Use == for type-coercive comparison
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

  // Get current world time for forward-looking date calculation
  const worldTime = getCurrentWorldTime();
  const today = worldTime ? new Date(worldTime) : new Date();
  const currentDay = today.getDay();

  for (let i = 0; i < 7; i++) {
    const targetDayOfWeek = dayValues[i];

    // Calculate forward-looking target date
    // If the day has already passed this week, show next week's occurrence
    let daysUntil = targetDayOfWeek - currentDay;
    if (daysUntil < 0) {
      daysUntil += 7; // Next week
    }

    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntil);

    columns.push({
      dayOfWeek: dayValues[i],
      label: dayNames[i],
      targetDate: formatLocalDate(targetDate) // YYYY-MM-DD string
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
  // Start live updates for aircraft status badges (GROUNDED/IN MAINT)
  startAircraftStatusUpdates();
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
        <tr style="background: rgba(88, 166, 255, 0.08); border-bottom: 1px solid var(--border-color); border-top: 2px solid var(--border-color);">
          <td style="padding: 0.5rem 1rem; color: var(--text-secondary); font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; position: sticky; left: 0; background: rgba(88, 166, 255, 0.08); border-right: 2px solid var(--border-color); z-index: 5;">
            ${typeKey} <span style="color: var(--text-muted); font-weight: 500;">(${aircraftInGroup.length})</span>
          </td>
          <td colspan="${timeColumns.length + 1}" style="background: rgba(88, 166, 255, 0.08);"></td>
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
      const typeKey = `${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? (aircraft.aircraft.variant.startsWith('-') ? aircraft.aircraft.variant : '-' + aircraft.aircraft.variant) : ''}`;
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
        <tr style="background: rgba(88, 166, 255, 0.08); border-bottom: 1px solid var(--border-color); border-top: 2px solid var(--border-color);">
          <td style="padding: 0.5rem 1rem; color: var(--text-secondary); font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; position: sticky; left: 0; background: rgba(88, 166, 255, 0.08); border-right: 2px solid var(--border-color); z-index: 5;">
            ${typeKey} <span style="color: var(--text-muted); font-weight: 500;">(${aircraftInGroup.length})</span>
          </td>
          <td colspan="${dayColumns.length + 1}" style="background: rgba(88, 166, 255, 0.08);"></td>
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
      const typeKey = `${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? (aircraft.aircraft.variant.startsWith('-') ? aircraft.aircraft.variant : '-' + aircraft.aircraft.variant) : ''}`;
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
  // Check for expired checks (aircraft cannot fly)
  const expiredChecks = getExpiredChecks(aircraft);
  const hasExpiredChecks = expiredChecks.length > 0;

  // Separate expired from in-progress for better tooltip
  const inProgressChecks = expiredChecks.filter(c => c.inProgress);
  const actuallyExpired = expiredChecks.filter(c => !c.inProgress);

  let groundedTooltip = '';
  if (actuallyExpired.length > 0 && inProgressChecks.length > 0) {
    groundedTooltip = `GROUNDED: ${actuallyExpired.map(c => c.name).join(', ')} expired; ${inProgressChecks.map(c => c.name).join(', ')} in progress`;
  } else if (inProgressChecks.length > 0) {
    groundedTooltip = `MAINTENANCE IN PROGRESS: ${inProgressChecks.map(c => c.name).join(', ')}`;
  } else {
    groundedTooltip = `GROUNDED: ${actuallyExpired.map(c => c.name).join(', ')} expired`;
  }

  let html = `<tr data-aircraft-id="${aircraft.id}" style="border-bottom: 1px solid var(--border-color);">`;

  // Aircraft info column (sticky left)
  // Show different badge color for in-progress maintenance vs expired
  const badgeColor = inProgressChecks.length > 0 && actuallyExpired.length === 0 ? '#d29922' : '#f85149';
  const badgeText = inProgressChecks.length > 0 && actuallyExpired.length === 0 ? 'IN MAINT' : 'GROUNDED';
  const groundedBadge = hasExpiredChecks
    ? `<span class="aircraft-status-badge" style="font-size: 0.7rem; color: ${badgeColor}; font-weight: 600; background: rgba(${badgeColor === '#d29922' ? '210, 153, 34' : '248, 81, 73'}, 0.15); padding: 0.1rem 0.35rem; border-radius: 3px; cursor: help;" title="${groundedTooltip}">${badgeText}</span>`
    : '';

  html += `
    <td class="aircraft-info-cell" style="padding: 0.75rem 1rem; position: sticky; left: 0; background: var(--surface); border-right: 2px solid var(--border-color); z-index: 5; vertical-align: middle;">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span class="aircraft-registration" style="color: ${actuallyExpired.length > 0 ? '#8b949e' : 'var(--accent-color)'}; font-weight: 600; font-size: 0.95rem; cursor: pointer;" onclick="event.stopPropagation(); showAircraftDetails('${aircraft.id}')" title="Click for aircraft details">
          ${aircraft.registration}
        </span>
        ${groundedBadge}
      </div>
    </td>
  `;

  // Day columns - render time-positioned flight blocks
  dayColumns.forEach((col, colIndex) => {
    const dayFlights = getFlightsForDay(aircraft.id, col.dayOfWeek);
    const dayMaintenance = getMaintenanceForDay(aircraft.id, col.dayOfWeek, col.targetDate);

    // Also check for overnight maintenance from previous day that spans into this day
    const prevDate = col.targetDate ? new Date(col.targetDate + 'T00:00:00') : null;
    if (prevDate) {
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      const prevDayMaint = getMaintenanceForDay(aircraft.id, (col.dayOfWeek + 6) % 7, prevDateStr);

      prevDayMaint.forEach(maint => {
        // Only process daily, weekly, A checks (not C/D which have their own multi-day logic)
        if (maint.checkType === 'C' || maint.checkType === 'D') return;

        const startTimeStr = maint.startTime?.substring(0, 5) || '00:00';
        const [startH, startM] = startTimeStr.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const checkTypeDurations = { 'daily': 60, 'weekly': 135, 'A': 540 };
        const durationMinutes = maint.duration || checkTypeDurations[maint.checkType] || 60;
        const endMinutes = startMinutes + durationMinutes;

        // If it spans past midnight, add overflow portion as continuation block
        if (endMinutes > 1440) {
          const overflowMinutes = endMinutes - 1440;
          dayMaintenance.push({
            ...maint,
            _isOvernightContinuation: true,
            _overflowMinutes: overflowMinutes
          });
        }
      });
    }

    const isToday = col.dayOfWeek === getCurrentWorldTime()?.getDay();
    const bgColor = isToday ? 'rgba(0, 102, 204, 0.1)' : 'var(--surface-elevated)';

    let cellContent = '';

    // Render flight blocks as positioned time bars
    let hasMultiDayOverflow = false; // Track if any flight extends past cell edge
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

        // Calculate pre-flight and post-flight durations using shared library
        const acType = aircraft.aircraft?.type || 'Narrowbody';
        const paxCapacity = aircraft.aircraft?.passengerCapacity || 150;
        const routeDistance = route?.distance || 0;
        const preFlightDur = calculatePreFlightTotal(routeDistance, paxCapacity, acType).total;
        const postFlightDur = calculatePostFlightTotal(paxCapacity, acType).total;

        // Subtract pre-flight time from departure to get true operation start
        depMinutes -= preFlightDur;

        // Add post-flight time to arrival to get true operation end
        arrMinutes += postFlightDur;

        // Use stored arrivalDate for multi-day detection (consistent with getFlightsForDay)
        // arrMinutes already has post-flight added from stored arrivalTime above

        // Get day of week for operation start (including pre-flight)
        let opStartDate = new Date(flight.scheduledDate + 'T00:00:00');
        // Handle pre-flight pushing into previous day
        if (depMinutes < 0) {
          depMinutes += 1440;
          opStartDate.setDate(opStartDate.getDate() - 1);
        }
        const opStartDayOfWeek = opStartDate.getDay();

        // Calculate operation end date from stored arrivalDate + arrivalTime + post-flight
        let arrDate = new Date((flight.arrivalDate || flight.scheduledDate) + 'T00:00:00');
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
          // Operation start day - extends to end of day
          leftPct = (depMinutes / 1440) * 100;
          widthPct = 100 - leftPct;
          borderRadius = '3px 0 0 3px';
        } else if (col.dayOfWeek === arrDayOfWeek) {
          // Arrival day - starts at cell edge
          leftPct = 0;
          widthPct = (arrMinutes / 1440) * 100;
          borderRadius = '0 3px 3px 0';
          hasMultiDayOverflow = true; // Remove left border on this cell
        } else if (isTransitDay) {
          // Transit day (full day in flight)
          leftPct = 0;
          widthPct = 100;
          borderRadius = '0';
          hasMultiDayOverflow = true; // Remove left border on this cell
        } else {
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

        // Check if this multi-day non-start day has a downroute daily check to embed in the strip
        let flightBg = 'var(--accent-color)';
        if (isMultiDay && isTransitDay && col.dayOfWeek !== opStartDayOfWeek) {
          const downrouteDaily = dayMaintenance.find(m => m.checkType === 'daily');
          if (downrouteDaily) {
            const mStartStr = downrouteDaily.startTime?.substring(0, 5) || '00:00';
            const [mH, mM] = mStartStr.split(':').map(Number);
            const maintStartMin = mH * 60 + mM;
            const maintDur = downrouteDaily.duration || 30;
            const maintEndMin = Math.min(maintStartMin + maintDur, 1440);

            // On transit days the strip covers the full day (1440 mins), so gradient works
            const checkStartPct = Math.max(0, Math.min(100, (maintStartMin / 1440) * 100));
            const checkEndPct = Math.max(0, Math.min(100, (maintEndMin / 1440) * 100));
            flightBg = `linear-gradient(to right, var(--accent-color) ${checkStartPct}%, #FFA500 ${checkStartPct}%, #FFA500 ${checkEndPct}%, var(--accent-color) ${checkEndPct}%)`;
          }
        }

        // Main flight block - covers the full flight time (no separate pre/post-flight slivers in weekly view)
        // Apply blur only if aircraft is actually grounded (not just in maintenance)
        const flightBlockBlur = actuallyExpired.length > 0 ? 'filter: blur(2px); opacity: 0.4;' : '';
        cellContent += `
          <div
            onclick="event.stopPropagation(); viewFlightDetailsWeekly('${flight.id}')"
            title="${routeNum}: ${depTimeStr}→${arrTimeStr}${techStopAirport ? ' via ' + techStopAirport : ''}"
            style="position: absolute; left: ${leftPct}%; width: ${widthPct}%; top: 0; bottom: 0; background: ${flightBg}; border-radius: ${finalBorderRadius}; display: flex; align-items: center; justify-content: center; cursor: pointer; overflow: hidden; ${flightBlockBlur}"
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
        const maintColors = { 'daily': '#FFA500', 'weekly': '#8B5CF6', 'A': '#17A2B8', 'C': '#6B7280', 'D': '#4B5563' };
        let maintBg = maintColors[maint.checkType] || '#6b7280';

        // Check if this is heavy maintenance (C or D check)
        const isHeavyMaintenance = maint.checkType === 'C' || maint.checkType === 'D';

        // For heavy maintenance: only render once per week
        // - If isOngoing (maintenance started before this day), only render on Monday (colIndex 0)
        // - If not isOngoing (this is the start day), render normally
        // This prevents duplicate full-week blocks from rendering on multiple days
        if (isHeavyMaintenance && maint.isOngoing && colIndex !== 0) {
          return; // Skip - already rendered from Monday or start day
        }

        // Daily checks that overlap with a flight turnaround downroute:
        // Render as integrated gradient within the flight strip instead of separate orange block
        let isDownrouteDaily = false;
        if (maint.checkType === 'daily' && col.targetDate) {
          const normMaintDate = col.targetDate.substring(0, 10);
          const hasTransitFlight = scheduledFlights.some(f => {
            if (f.aircraftId != aircraft.id && f.aircraft?.id !== aircraft.id) return false;
            const fSchedDate = typeof f.scheduledDate === 'string' ? f.scheduledDate.substring(0, 10) : '';
            const fArrDate = f.arrivalDate ? (typeof f.arrivalDate === 'string' ? f.arrivalDate.substring(0, 10) : new Date(f.arrivalDate).toISOString().split('T')[0]) : fSchedDate;
            // Only skip separate block for true transit days where the strip covers the full day
            // On arrival days the maintenance falls outside the flight strip's time range
            return fSchedDate < normMaintDate && fArrDate > normMaintDate;
          });
          if (hasTransitFlight) {
            return; // Skip separate block - embedded as gradient in flight strip
          }
        }

        // Handle overnight continuation blocks (starts at 00:00)
        let startMinutes, endMinutes, durationMinutes, startTimeStr, endTimeStr;
        const checkTypeDurations = { 'daily': 60, 'weekly': 135, 'A': 540, 'C': 30240, 'D': 108000 };

        if (maint._isOvernightContinuation) {
          // This is a continuation block from the previous day
          startMinutes = 0;
          durationMinutes = maint._overflowMinutes;
          endMinutes = durationMinutes;
          startTimeStr = '00:00';
          const endH = Math.floor(endMinutes / 60);
          const endM = endMinutes % 60;
          endTimeStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        } else {
          // Parse maintenance time normally
          startTimeStr = maint.startTime?.substring(0, 5) || '00:00';
          const [startH, startM] = startTimeStr.split(':').map(Number);
          startMinutes = startH * 60 + startM;
          durationMinutes = maint.duration || checkTypeDurations[maint.checkType] || 60;
          // Calculate end time (capped at end of day for display purposes)
          endMinutes = Math.min(startMinutes + durationMinutes, 1440);
          // Calculate completion time for tooltip
          const endTimeMinutes = startMinutes + durationMinutes;
          const endTimeH = Math.floor((endTimeMinutes % 1440) / 60);
          const endTimeM = endTimeMinutes % 60;
          endTimeStr = `${String(endTimeH).padStart(2, '0')}:${String(endTimeM).padStart(2, '0')}`;
        }

        // Determine maintenance status for today's column
        let maintOpacity = '1';
        let maintFilter = 'none';
        if (isToday) {
          if (currentMinutes >= endMinutes && !isHeavyMaintenance) {
            // Completed - fade out and desaturate (but not for heavy maintenance which spans days)
            maintOpacity = '0.4';
            maintFilter = 'grayscale(50%)';
          } else if (currentMinutes >= startMinutes) {
            // In progress - normal with slight glow
            maintFilter = 'brightness(1.1)';
          }
          // Upcoming - normal appearance (maintFilter stays 'none')
        }

        const leftPct = (startMinutes / 1440) * 100;

        // Show label for each check type
        const maintLabels = { 'daily': 'D', 'weekly': 'W', 'A': 'A', 'C': 'C', 'D': 'D' };

        // Check if maintenance starts exactly where a flight ends (no gap needed)
        const flightEndsPct = dayFlights.length > 0 ? Math.max(...dayFlights.map(f => {
          const arrStr = f.arrivalTime?.substring(0, 5) || '23:59';
          const [aH, aM] = arrStr.split(':').map(Number);
          const acT = aircraft.aircraft?.type || 'Narrowbody';
          const paxCap = aircraft.aircraft?.passengerCapacity || 150;
          let arrMins = aH * 60 + aM + calculatePostFlightTotal(paxCap, acT).total;
          if (arrMins >= 1440) arrMins -= 1440;
          return (arrMins / 1440) * 100;
        })) : 0;
        const maintStartsPct = leftPct;
        // If maintenance starts within 1% of where flight ends, remove left border radius
        const isAdjacentToFlight = Math.abs(flightEndsPct - maintStartsPct) < 1;

        // For heavy maintenance (C, D), use two blocks:
        // 1. Continuation block: Mon through day before current (filled completely)
        // 2. Current day block: from check start time to end of visible week
        if (isHeavyMaintenance) {
          const checkDescription = maint.checkType === 'C' ? 'C Check (2-4 weeks)' : 'D Check (2-3 months)';

          // Calculate completion date for heavy maintenance
          const durationDays = Math.ceil(durationMinutes / 1440); // Convert minutes to days
          const scheduledDate = maint.scheduledDate ? new Date(maint.scheduledDate) : new Date();
          const completionDate = new Date(scheduledDate);
          completionDate.setDate(completionDate.getDate() + durationDays);
          const completionDateStr = completionDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

          // Check if maintenance has actually started (compare with current world time)
          const worldTime = getCurrentWorldTime();
          const todayStr = worldTime ? formatLocalDate(worldTime) : '';
          const maintDateStr = maint.scheduledDate ? maint.scheduledDate.split('T')[0] : '';
          const hasStarted = maintDateStr < todayStr ||
            (maintDateStr === todayStr && currentMinutes >= startMinutes);

          const heavyMaintTooltip = hasStarted
            ? `${checkDescription}\nStarted: ${startTimeStr} on ${scheduledDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}\nCompletes: ~${completionDateStr}`
            : `${checkDescription}\nScheduled: ${startTimeStr} on ${scheduledDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}\nCompletes: ~${completionDateStr}`;

          // Use the full maintenance ID for the modal
          const maintId = maint.id;

          // Only show extended "in progress" blocks if maintenance has actually started
          if (hasStarted) {
            // Block 1: Days before current day (Mon through Tue if current is Wed)
            // Only render continuation if:
            // 1. We're not on Monday (colIndex > 0), AND
            // 2. This is an ongoing block (maintenance started before this day in a previous week)
            // Don't show "..." for start-day blocks since maintenance didn't exist before
            if (colIndex > 0 && maint.isOngoing) {
              const continuationLeft = -(colIndex * 100);
              const continuationWidth = colIndex * 100; // covers columns 0 to colIndex-1

              cellContent += `
                <div
                  onclick="event.stopPropagation(); viewMaintenanceDetails('${maintId}')"
                  title="${heavyMaintTooltip}"
                  style="position: absolute; left: ${continuationLeft}%; width: ${continuationWidth}%; top: 0; bottom: 0; background: ${maintBg}; border-radius: 0; display: flex; align-items: center; justify-content: flex-end; padding: 0 0.5rem; cursor: pointer; z-index: 2;"
                >
                  <span style="color: rgba(255,255,255,0.5); font-size: 0.9rem; letter-spacing: 2px;">...</span>
                </div>
              `;
            }

            // Block 2: From check start time to end of visible week (Sunday)
            // Width = rest of current day + all remaining days to Sunday
            const remainingDays = 6 - colIndex; // columns from current+1 to Sunday (index 6)
            const mainBlockWidth = (100 - leftPct) + (remainingDays * 100);

            // Content fits within single cell since cells now clip
            const content = `
              <span style="background: rgba(255,255,255,0.2); padding: 0.1rem 0.4rem; border-radius: 2px; color: white; font-size: 0.7rem; font-weight: 700;">${maint.checkType}</span>
            `;

            cellContent += `
              <div
                onclick="event.stopPropagation(); viewMaintenanceDetails('${maintId}')"
                title="${heavyMaintTooltip}"
                style="position: absolute; left: 0; width: 100%; top: 0; bottom: 0; background: ${maintBg}; border-radius: 0; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2;"
              >
                ${content}
              </div>
            `;
          } else {
            // Maintenance not yet started - just show a simple block for the scheduled day only
            let widthPct = 15; // Small block to indicate scheduled maintenance
            const content = `<span style="color: white; font-size: 0.65rem; font-weight: 600;">${maint.checkType}</span>`;

            cellContent += `
              <div
                onclick="event.stopPropagation(); viewMaintenanceDetails('${maintId}')"
                title="${heavyMaintTooltip}"
                style="position: absolute; left: ${leftPct}%; width: ${widthPct}%; top: 0; bottom: 0; background: ${maintBg}; border-radius: 3px; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2;"
              >
                ${content}
              </div>
            `;
          }
        } else {
          // Normal maintenance block (daily, weekly, A)

          // Check if A check spans overnight using the new property from server
          const isOvernightACheck = maint.checkType === 'A' && (maint.spansOvernight || (startMinutes + durationMinutes) > 1440);

          if (isOvernightACheck) {
            // Overnight A check - render as a single block that visually extends into the next day
            // Width = rest of today (100% - leftPct) + portion of next day
            const nextDayEndTime = maint.endTimeNextDay || '07:00';
            const [nextDayH, nextDayM] = nextDayEndTime.split(':').map(Number);
            const nextDayMinutes = nextDayH * 60 + nextDayM;
            const nextDayWidthPct = (nextDayMinutes / 1440) * 100;

            // Total width: remaining today + next day portion
            const todayRemainingPct = 100 - leftPct;
            const totalWidthPct = todayRemainingPct + nextDayWidthPct;

            const content = `<span style="color: white; font-size: 0.65rem; font-weight: 600;">A</span>`;
            const maintTooltip = `A Check\nStarts: ${startTimeStr}\nCompletes: ${nextDayEndTime} (next day)`;

            cellContent += `
              <div
                onclick="event.stopPropagation(); viewMaintenanceDetails('${maint.id}')"
                title="${maintTooltip}"
                style="position: absolute; left: ${leftPct}%; width: ${totalWidthPct}%; top: 0; bottom: 0; background: ${maintBg}; border-radius: ${isAdjacentToFlight ? '0' : '3px'} 3px 3px ${isAdjacentToFlight ? '0' : '3px'}; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: ${maintOpacity}; filter: ${maintFilter}; overflow: visible; z-index: 3;"
              >
                ${content}
              </div>
            `;
          } else {
            // Standard maintenance block (daily, weekly, or same-day A check)
            let widthPct = ((endMinutes - startMinutes) / 1440) * 100;
            if (widthPct < 5) widthPct = 5;

            // Downroute daily checks blend into the flight strip with no border-radius and higher z-index
            const maintBorderRadius = isDownrouteDaily ? '0' : (isAdjacentToFlight ? '0 3px 3px 0' : '3px');
            const maintZIndex = isDownrouteDaily ? 'z-index: 2;' : '';
            const content = `<span style="color: white; font-size: 0.65rem; font-weight: 600;">${maintLabels[maint.checkType] || maint.checkType}</span>`;

            // Build tooltip with completion time
            const checkName = maint.checkType === 'daily' ? 'Daily' : (maint.checkType === 'weekly' ? 'Weekly' : maint.checkType);
            let maintTooltip;
            if (maint._isOvernightContinuation) {
              maintTooltip = `${checkName} Check (continued from previous day)\nCompletes: ${endTimeStr}`;
            } else if (isDownrouteDaily) {
              maintTooltip = `${checkName} Check (downroute)\nStarts: ${startTimeStr}\nCompletes: ${endTimeStr}`;
            } else {
              maintTooltip = `${checkName} Check\nStarts: ${startTimeStr}\nCompletes: ${endTimeStr}`;
            }

            cellContent += `
              <div
                onclick="event.stopPropagation(); viewMaintenanceDetails('${maint.id}')"
                title="${maintTooltip}"
                style="position: absolute; left: ${leftPct}%; width: ${widthPct}%; top: 0; bottom: 0; background: ${maintBg}; border-radius: ${maintBorderRadius}; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: ${maintOpacity}; filter: ${maintFilter}; ${maintZIndex}"
              >
                ${content}
              </div>
            `;
          }
        }
      });
    }

    const hasContent = dayFlights.length > 0 || dayMaintenance.length > 0;

    // Show PERFORM NOW if there are expired checks not currently being handled
    // Hide if a covering check is scheduled within the next 12 hours
    const expiredTypes = actuallyExpired.map(c => c.type);
    const showPerformNow = actuallyExpired.length > 0 && !hasUpcomingMaintenance(aircraft.id, expiredTypes);
    // Only show the heaviest expired check (it will cover all lighter ones when performed)
    const checkPriority = ['D', 'C', 'A', 'weekly', 'daily'];
    const heaviestExpired = actuallyExpired.sort((a, b) => checkPriority.indexOf(a.type) - checkPriority.indexOf(b.type))[0];
    const expiredCheckList = heaviestExpired ? `${heaviestExpired.name} expired` : '';

    const expiredOverlay = (showPerformNow && colIndex === 0) ? `
      <div style="
        position: absolute;
        left: 0;
        top: 0;
        width: calc(700%);
        height: 100%;
        background: rgba(248, 81, 73, 0.06);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 3;
        pointer-events: auto;
      ">
        <div style="
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: rgba(22, 27, 34, 0.95);
          padding: 0.35rem 0.75rem;
          border-radius: 4px;
          border: 1px solid #f85149;
        ">
          <span style="color: #f85149; font-size: 0.7rem; font-weight: 600;">${expiredCheckList}</span>
          <button
            onclick="event.stopPropagation(); performAllChecksNow('${aircraft.id}')"
            style="padding: 0.25rem 0.5rem; font-size: 0.65rem; font-weight: 600; background: #f85149; border: none; border-radius: 3px; color: white; cursor: pointer; white-space: nowrap;"
          >PERFORM NOW</button>
        </div>
      </div>
    ` : '';

    html += `
      <td
        class="schedule-cell weekly-cell"
        data-day="${col.dayOfWeek}"
        data-aircraft-id="${aircraft.id}"
        style="position: relative; height: 36px; ${hasMultiDayOverflow ? '' : 'border-left: 1px solid var(--border-color);'} background: ${bgColor}; overflow: ${hasExpiredChecks ? 'visible' : 'hidden'};"
        ondragover="${hasExpiredChecks ? '' : `handleWeeklyDragOver(event, ${col.dayOfWeek})`}"
        ondragleave="${hasExpiredChecks ? '' : 'handleWeeklyDragLeave(event)'}"
        ondrop="${hasExpiredChecks ? '' : `handleWeeklyDrop(event, '${aircraft.id}', ${col.dayOfWeek})`}"
        title="${hasExpiredChecks ? groundedTooltip : 'Drag route here to schedule'}"
      >
        ${hasContent ? cellContent : ''}
        ${expiredOverlay}
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

    // Use stored arrivalDate from server (calculated with wind effects)
    // instead of recalculating locally with simplified formulas
    const aircraft = f.aircraft;
    const route = f.route;
    const acType = aircraft?.aircraft?.type || 'Narrowbody';
    const paxCapacity = aircraft?.aircraft?.passengerCapacity || 150;
    const routeDistance = route?.distance || 0;

    // Calculate pre-flight and post-flight durations using shared library
    const preFlightDur = calculatePreFlightTotal(routeDistance, paxCapacity, acType).total;
    const postFlightDur = calculatePostFlightTotal(paxCapacity, acType).total;

    // Operation start: departure minus pre-flight
    const depTimeStr = f.departureTime?.substring(0, 5) || '00:00';
    const [depH, depM] = depTimeStr.split(':').map(Number);
    let depMinutes = depH * 60 + depM - preFlightDur;
    let opStartDate = new Date(f.scheduledDate + 'T00:00:00');
    if (depMinutes < 0) {
      depMinutes += 1440;
      opStartDate.setDate(opStartDate.getDate() - 1);
    }
    const opStartDayOfWeek = opStartDate.getDay();
    if (opStartDayOfWeek === dayOfWeek) return true;

    // Operation end: use stored arrivalDate + arrivalTime + post-flight
    const arrDate = f.arrivalDate || f.scheduledDate;
    const arrTimeStr = f.arrivalTime?.substring(0, 5) || '23:59';
    const [arrH, arrM] = arrTimeStr.split(':').map(Number);
    let arrMinutes = arrH * 60 + arrM + postFlightDur;
    let opEndDate = new Date(arrDate + 'T00:00:00');
    while (arrMinutes >= 1440) {
      arrMinutes -= 1440;
      opEndDate.setDate(opEndDate.getDate() + 1);
    }
    const opEndDayOfWeek = opEndDate.getDay();
    if (opEndDayOfWeek === dayOfWeek) return true;

    // Check transit days (days between operation start and operation end)
    const daysDiff = Math.round((opEndDate - opStartDate) / (1000 * 60 * 60 * 24));
    if (daysDiff > 1) {
      for (let i = 1; i < daysDiff; i++) {
        const transitDayOfWeek = (opStartDayOfWeek + i) % 7;
        if (transitDayOfWeek === dayOfWeek) return true;
      }
    }

    return false;
  });
}

// Get maintenance for a specific date for an aircraft
// targetDate should be YYYY-MM-DD string for forward-looking match
function getMaintenanceForDay(aircraftId, dayOfWeek, targetDate = null) {
  const worldTime = getCurrentWorldTime() || new Date();
  const todayStr = formatLocalDate(worldTime);

  const results = scheduledMaintenance.filter(m => {
    // Check aircraftId - backend stores it at top level, but also check nested aircraft.id for compatibility
    const maintAircraftId = m.aircraftId || m.aircraft?.id;
    if (maintAircraftId != aircraftId) return false;
    if (!m.scheduledDate && !m.displayDate) return false;

    // If targetDate is provided, match by exact date (forward-looking)
    if (targetDate) {
      // For multi-day maintenance, use displayDate if available (the date block should show on)
      // Otherwise fall back to scheduledDate (the maintenance start date)
      const matchDate = m.displayDate || m.scheduledDate;

      // Normalize to YYYY-MM-DD string for comparison
      let maintDateStr = matchDate;
      if (typeof maintDateStr !== 'string') {
        maintDateStr = new Date(maintDateStr).toISOString().split('T')[0];
      } else {
        maintDateStr = maintDateStr.split('T')[0];
      }

      // For C/D checks, also include if currently in progress and targetDate falls within maintenance period
      if (['C', 'D'].includes(m.checkType) && !m.isOngoing) {
        const schedDateStr = m.scheduledDate?.split?.('T')?.[0] || m.scheduledDate;
        const durationDays = Math.ceil((m.duration || 1440) / 1440);
        const startDate = new Date(schedDateStr + 'T00:00:00');
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + durationDays);
        const targetDateObj = new Date(targetDate + 'T00:00:00');

        // Check if target date is within the maintenance period
        if (targetDateObj >= startDate && targetDateObj < endDate) {
          return true;
        }
      }

      return maintDateStr === targetDate;
    }

    // Fallback to day-of-week matching for backwards compatibility
    const matchDate = m.displayDate || m.scheduledDate;
    const maintDate = new Date(matchDate + 'T00:00:00');
    const maintDayOfWeek = maintDate.getDay();
    return maintDayOfWeek === dayOfWeek;
  });

  // Filter out daily checks that are within 24 hours of a previous daily check
  // to avoid showing redundant "double daily" checks
  if (targetDate) {
    const prevDate = new Date(targetDate + 'T00:00:00');
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    // Get previous day's daily checks for this aircraft
    const prevDayDailyChecks = scheduledMaintenance.filter(m => {
      const maintAircraftId = m.aircraftId || m.aircraft?.id;
      if (maintAircraftId != aircraftId) return false;
      if (m.checkType !== 'daily') return false;
      const matchDate = m.displayDate || m.scheduledDate;
      let maintDateStr = typeof matchDate === 'string' ? matchDate.split('T')[0] : new Date(matchDate).toISOString().split('T')[0];
      return maintDateStr === prevDateStr;
    });

    // If there's a daily check on the previous day, check the time gap
    if (prevDayDailyChecks.length > 0) {
      return results.filter(m => {
        if (m.checkType !== 'daily') return true; // Keep non-daily checks

        // Get this check's start time in minutes from midnight
        const startTimeStr = m.startTime?.substring(0, 5) || '00:00';
        const [h, min] = startTimeStr.split(':').map(Number);
        const thisStartMinutes = h * 60 + min;

        // Check against previous day's daily checks
        for (const prevCheck of prevDayDailyChecks) {
          const prevStartStr = prevCheck.startTime?.substring(0, 5) || '00:00';
          const [prevH, prevM] = prevStartStr.split(':').map(Number);
          const prevStartMinutes = prevH * 60 + prevM;

          // Calculate minutes from previous check to this check (prev day + time gap)
          // Previous check is on prev day, so add 1440 (24 hours) to this check's time
          const minutesBetween = (1440 - prevStartMinutes) + thisStartMinutes;

          // If less than 18 hours (1080 minutes) between checks, skip this one
          if (minutesBetween < 1080) {
            return false;
          }
        }
        return true;
      });
    }
  }

  return results;
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

    // Use combined endpoint for much faster loading (1 request instead of 4)
    await fetchAllScheduleData();

    // Debug: log maintenance data before rendering
    console.log('[DEBUG] Maintenance before render:', scheduledMaintenance.length, 'records');
    if (scheduledMaintenance.length > 0) {
      console.log('[DEBUG] First 3 maintenance records:', scheduledMaintenance.slice(0, 3).map(m => ({
        id: m.id,
        aircraftId: m.aircraftId,
        checkType: m.checkType,
        scheduledDate: m.scheduledDate
      })));
    }

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
  const typeStr = `${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? (aircraft.aircraft.variant.startsWith('-') ? aircraft.aircraft.variant : '-' + aircraft.aircraft.variant) : ''}`;

  let html = '';

  // Single row containing both flights and maintenance
  html += `<tr data-aircraft-id="${aircraft.id}" style="border-bottom: 1px solid var(--border-color);">`;

  // Check for expired checks (aircraft cannot fly)
  const expiredChecks = getExpiredChecks(aircraft);
  const hasExpiredChecks = expiredChecks.length > 0;

  // Separate expired from in-progress for better tooltip
  const inProgressChecks = expiredChecks.filter(c => c.inProgress);
  const actuallyExpired = expiredChecks.filter(c => !c.inProgress);

  let groundedTooltip = '';
  if (actuallyExpired.length > 0 && inProgressChecks.length > 0) {
    groundedTooltip = `GROUNDED: ${actuallyExpired.map(c => c.name).join(', ')} expired; ${inProgressChecks.map(c => c.name).join(', ')} in progress`;
  } else if (inProgressChecks.length > 0) {
    groundedTooltip = `MAINTENANCE IN PROGRESS: ${inProgressChecks.map(c => c.name).join(', ')}`;
  } else {
    groundedTooltip = `GROUNDED: ${actuallyExpired.map(c => c.name).join(', ')} expired`;
  }

  // Aircraft info column (sticky left)
  // Show different badge color for in-progress maintenance vs expired
  const badgeColor = inProgressChecks.length > 0 && actuallyExpired.length === 0 ? '#d29922' : '#f85149';
  const badgeText = inProgressChecks.length > 0 && actuallyExpired.length === 0 ? 'IN MAINT' : 'GROUNDED';
  const groundedBadge = hasExpiredChecks
    ? `<span class="aircraft-status-badge" style="font-size: 0.7rem; color: ${badgeColor}; font-weight: 600; background: rgba(${badgeColor === '#d29922' ? '210, 153, 34' : '248, 81, 73'}, 0.15); padding: 0.1rem 0.35rem; border-radius: 3px; cursor: help;" title="${groundedTooltip}">${badgeText}</span>`
    : '';

  html += `
    <td class="aircraft-info-cell" style="padding: 1rem; position: sticky; left: 0; background: var(--surface); border-right: 2px solid var(--border-color); z-index: 5;">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span class="aircraft-registration" style="color: ${actuallyExpired.length > 0 ? '#8b949e' : 'var(--accent-color)'}; font-weight: 600; font-size: 1rem; cursor: pointer;" onclick="event.stopPropagation(); showAircraftDetails('${aircraft.id}')" title="Click for aircraft details">
          ${aircraft.registration}
        </span>
        ${groundedBadge}
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

    // Show PERFORM NOW if there are expired checks not currently being handled
    // Hide if a covering check is scheduled within the next 12 hours
    const expiredTypes = actuallyExpired.map(c => c.type);
    const showPerformNowDaily = actuallyExpired.length > 0 && !hasUpcomingMaintenance(aircraft.id, expiredTypes);
    // Only show the heaviest expired check (it will cover all lighter ones when performed)
    const checkPriorityDaily = ['D', 'C', 'A', 'weekly', 'daily'];
    const heaviestExpiredDaily = actuallyExpired.sort((a, b) => checkPriorityDaily.indexOf(a.type) - checkPriorityDaily.indexOf(b.type))[0];
    const expiredCheckList = heaviestExpiredDaily ? `${heaviestExpiredDaily.name} expired` : '';

    const expiredOverlay = (showPerformNowDaily && index === 0) ? `
      <div style="
        position: absolute;
        left: 0;
        top: 0;
        width: calc(2400%);
        height: 100%;
        background: rgba(248, 81, 73, 0.06);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 3;
        pointer-events: auto;
      ">
        <div style="
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: rgba(22, 27, 34, 0.95);
          padding: 0.35rem 0.75rem;
          border-radius: 4px;
          border: 1px solid #f85149;
        ">
          <span style="color: #f85149; font-size: 0.7rem; font-weight: 600;">${expiredCheckList}</span>
          <button
            onclick="event.stopPropagation(); performAllChecksNow('${aircraft.id}')"
            style="padding: 0.25rem 0.5rem; font-size: 0.65rem; font-weight: 600; background: #f85149; border: none; border-radius: 3px; color: white; cursor: pointer; white-space: nowrap;"
          >PERFORM NOW</button>
        </div>
      </div>
    ` : '';

    html += `
      <td
        class="schedule-cell"
        data-aircraft-id="${aircraft.id}"
        data-time="${timeValue}"
        data-date="${dateStr}"
        ondragover="${hasExpiredChecks ? '' : 'handleDragOver(event)'}"
        ondragleave="${hasExpiredChecks ? '' : 'handleDragLeave(event)'}"
        ondrop="${hasExpiredChecks ? '' : `handleDrop(event, '${aircraft.id}', '${timeValue}')`}"
        style="padding: 0.3rem 0.2rem 0.3rem 0.2rem; text-align: center; background: var(--surface-elevated); ${borderStyle} height: 65px; min-width: ${cellWidth}; position: relative; vertical-align: top; overflow: visible;"
        title="${hasExpiredChecks ? groundedTooltip : ''}"
      >
        ${renderFlightBlocks(cellFlights, dateStr, actuallyExpired.length > 0)}${renderMaintenanceBlocks(cellMaintenance, cellFlights, aircraft)}
        ${expiredOverlay}
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

  // Get the current aircraft's type ID to match with routes
  const currentAircraft = userFleet.find(a => a.id === aircraftId);
  const currentAircraftTypeId = currentAircraft?.aircraftId || currentAircraft?.aircraft?.id;

  // Filter routes by aircraft TYPE (not specific aircraft ID)
  // Routes should be available to any aircraft of the same type
  const availableRoutes = routes.filter(r => {
    let aircraftMatch = false;
    if (r.assignedAircraftId === null) {
      // Unassigned route - available to all
      aircraftMatch = true;
    } else {
      // Look up the route's assigned aircraft in fleet to get its TYPE
      const routeAircraft = userFleet.find(a => a.id === r.assignedAircraftId);
      const routeAircraftTypeId = routeAircraft?.aircraftId || routeAircraft?.aircraft?.id;
      aircraftMatch = routeAircraftTypeId === currentAircraftTypeId;
    }

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
    // Enrich route with aircraft type data from fleet if missing
    if (route.assignedAircraftId && (!route.assignedAircraft || !route.assignedAircraft.aircraft)) {
      const fleetAircraft = userFleet.find(a => a.id === route.assignedAircraftId);
      if (fleetAircraft && fleetAircraft.aircraft) {
        route.assignedAircraft = route.assignedAircraft || {};
        route.assignedAircraft.aircraft = fleetAircraft.aircraft;
        route.assignedAircraft.id = fleetAircraft.id;
        route.assignedAircraft.registration = fleetAircraft.registration;
      }
    }

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

    // Schedule start is the stored departure time (this IS when the full schedule begins)
    const scheduleStartTime = route.scheduledDepartureTime ? route.scheduledDepartureTime.substring(0, 5) : '--:--';

    // Calculate pre-flight and post-flight durations for schedule end calculation
    let preFlightMinutes = 0;
    let postFlightMinutes = 0;
    if (route.assignedAircraft && route.assignedAircraft.aircraft) {
      preFlightMinutes = calculatePreFlightDuration(route.assignedAircraft, route);
      const postFlightInfo = calculatePostFlightDuration(route.assignedAircraft, null);
      postFlightMinutes = postFlightInfo.duration;
    }

    // Calculate schedule end time (start + pre-flight + outbound + turnaround + return + post-flight)
    let scheduleEndTime = '--:--';
    let scheduleEndTimeColor = 'var(--success-color)';

    if (!route.assignedAircraft || !route.assignedAircraft.aircraft || !route.assignedAircraft.aircraft.cruiseSpeed) {
      // Aircraft type is required, so this indicates incomplete route data
      scheduleEndTime = 'Missing aircraft type';
      scheduleEndTimeColor = 'var(--warning-color)';
    } else if (route.scheduledDepartureTime && outboundFlightMinutes > 0 && route.turnaroundTime) {
      const startDate = new Date(`2000-01-01T${route.scheduledDepartureTime}`);
      const turnaroundMinutes = route.turnaroundTime;

      // Total time from schedule start: pre-flight + outbound + turnaround + return + post-flight
      const totalMinutes = preFlightMinutes + outboundFlightMinutes + turnaroundMinutes + returnFlightMinutes + postFlightMinutes;
      const scheduleEndDate = new Date(startDate.getTime() + totalMinutes * 60000);

      // Round to nearest 5 minutes
      const hours = scheduleEndDate.getHours();
      const minutes = scheduleEndDate.getMinutes();
      const roundedMinutes = Math.round(minutes / 5) * 5;
      const finalHours = roundedMinutes === 60 ? hours + 1 : hours;
      const finalMinutes = roundedMinutes === 60 ? 0 : roundedMinutes;

      scheduleEndTime = `${finalHours.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`;
    }

    // Get aircraft type for display
    let aircraftType = 'Missing aircraft type';
    if (route.assignedAircraft && route.assignedAircraft.aircraft) {
      const manufacturer = route.assignedAircraft.aircraft.manufacturer || '';
      const model = route.assignedAircraft.aircraft.model || '';
      const variant = route.assignedAircraft.aircraft.variant || '';
      aircraftType = `${manufacturer} ${model}${variant ? (variant.startsWith('-') ? variant : '-' + variant) : ''}`.trim();
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
          <div style="color: var(--text-secondary); font-weight: 600;">Start:</div>
          <div style="color: var(--success-color); font-weight: 600;">${scheduleStartTime}</div>
          <div style="color: var(--text-secondary); font-weight: 600;">End:</div>
          <div style="color: ${scheduleEndTimeColor}; font-weight: 600; font-size: ${scheduleEndTime.includes('Missing') ? '0.7rem' : '0.75rem'};">${scheduleEndTime}</div>
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

  // Capture aircraftId at start - don't rely on global which may change
  const aircraftId = currentAircraftId;
  const aircraft = userFleet.find(a => a.id === aircraftId);
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
  const daysUntilTarget = getDaysUntilTargetForScheduling(currentDay, dayOfWeek);
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
        aircraftId: aircraftId,
        scheduledDate: scheduleDate,
        departureTime: departureTime
      })
    });

    if (response.ok) {
      // Refresh auto-maintenance for this aircraft after adding flight
      if (aircraftId) {
        try {
          const refreshResp = await fetch(`/api/fleet/${aircraftId}/refresh-maintenance`, { method: 'POST' });
          const refreshData = await refreshResp.json();
          console.log('[MAINT] Refreshed:', refreshData.scheduledChecks, 'checks for', aircraftId);
        } catch (e) {
          console.error('Error refreshing maintenance:', e);
        }
      }
      // Force fresh data fetch by reloading schedule
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
    const checkColors = { 'daily': '#3fb950', 'weekly': '#a371f7', 'A': '#58a6ff', 'C': '#f97316', 'D': '#f85149' };
    const checkColor = checkColors[conflict.checkType] || '#8b949e';
    const checkDescriptions = {
      'daily': 'Required every 24 hours of operation',
      'weekly': 'Required every 7 days',
      'A': 'Light maintenance check (every ~500 flight hours)',
      'C': 'Heavy maintenance check (every ~20 months)',
      'D': 'Major overhaul check (every ~6 years)'
    };
    const checkDesc = checkDescriptions[conflict.checkType] || '';

    conflictDetails = `
      <div style="background: #21262d; border-radius: 6px; padding: 1rem; margin-bottom: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
          <span style="color: ${checkColor}; font-size: 1.2rem;">🔧</span>
          <span style="color: #f0f6fc; font-weight: 600; font-size: 1rem;">Maintenance Check Required</span>
        </div>
        <div style="display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; font-size: 0.9rem;">
          <span style="color: #8b949e;">Check Type:</span>
          <span style="color: ${checkColor}; font-weight: 600;">${conflict.checkName}</span>
          <span style="color: #8b949e;">Scheduled:</span>
          <span style="color: #f0f6fc;">${conflict.startTime}</span>
          <span style="color: #8b949e;">Duration:</span>
          <span style="color: #f0f6fc;">${conflict.duration} minutes</span>
        </div>
        ${checkDesc ? `<div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #30363d; color: #8b949e; font-size: 0.8rem; font-style: italic;">${checkDesc}</div>` : ''}
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
            ${conflict.type === 'maintenance'
              ? 'This flight cannot be scheduled because a mandatory maintenance check would expire before it can be performed.'
              : 'This aircraft already has a scheduled duty that overlaps with the requested time slot.'}
          </p>
          ${conflictDetails}
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
  return `${manufacturer} ${model}${variant ? (variant.startsWith('-') ? variant : '-' + variant) : ''}`.trim() || null;
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

  // A check is hours-based
  if (checkType === 'A') {
    const lastACheckHours = parseFloat(aircraft.lastACheckHours) || 0;
    const currentFlightHours = parseFloat(aircraft.totalFlightHours) || 0;
    const intervalHours = aircraft.aCheckIntervalHours || getCheckIntervalForAircraft(aircraft.id, 'A'); // 800-1000 hrs
    const hoursSinceCheck = currentFlightHours - lastACheckHours;
    const hoursUntilDue = intervalHours - hoursSinceCheck;
    const warningThreshold = 100; // Warn 100 hrs before due

    const lastCheck = aircraft.lastACheckDate ? new Date(aircraft.lastACheckDate) : null;

    if (!lastCheck) {
      return { status: 'none', text: 'Never', lastCheck: null, expiryDate: null, intervalHours };
    }

    if (hoursUntilDue < 0) {
      return { status: 'expired', text: 'EXPIRED', lastCheck, expiryDate: null, intervalHours, hoursRemaining: hoursUntilDue };
    } else if (hoursUntilDue < warningThreshold) {
      return { status: 'warning', text: `${Math.round(hoursUntilDue)} hrs`, lastCheck, expiryDate: null, intervalHours, hoursRemaining: hoursUntilDue };
    } else {
      return { status: 'valid', text: 'Valid', lastCheck, expiryDate: null, intervalHours, hoursRemaining: hoursUntilDue };
    }
  }

  // Days-based checks: daily, weekly, C, D
  let lastCheckDate;
  let intervalDays;

  switch (checkType) {
    case 'daily':
      lastCheckDate = aircraft.lastDailyCheckDate;
      intervalDays = 1; // Valid check day + next day
      break;
    case 'weekly':
      lastCheckDate = aircraft.lastWeeklyCheckDate;
      intervalDays = 8; // Valid for 7-8 days
      break;
    case 'C':
      lastCheckDate = aircraft.lastCCheckDate;
      intervalDays = aircraft.cCheckIntervalDays || 730; // 2 years
      break;
    case 'D':
      lastCheckDate = aircraft.lastDCheckDate;
      intervalDays = aircraft.dCheckIntervalDays || getCheckIntervalForAircraft(aircraft.id, 'D'); // 5-7 years
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
  // Warning thresholds: daily=12hrs, weekly=2days, C=30days, D=60days
  let warningHours = 24;
  if (checkType === 'weekly') warningHours = 24 * 2;
  if (checkType === 'C') warningHours = 24 * 30;
  if (checkType === 'D') warningHours = 24 * 60;

  const hoursUntilExpiry = (expiryDate - now) / (1000 * 60 * 60);

  if (hoursUntilExpiry < 0) {
    return { status: 'expired', text: 'EXPIRED', lastCheck, expiryDate, intervalDays };
  } else if (hoursUntilExpiry < warningHours) {
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

// Action: Schedule check immediately (for expired checks)
// Schedules the check to start NOW, not mark as complete
async function performCheckNow(aircraftId, checkType) {
  const aircraft = userFleet.find(a => a.id === aircraftId);
  if (!aircraft) return;

  // Close any open maintenance modal first
  const overviewModal = document.getElementById('maintenanceModalOverlay');
  if (overviewModal) overviewModal.remove();

  const checkDurations = {
    'daily': 60,      // 1 hour
    'weekly': 135,    // 2.25 hours
    'A': 540,         // 9 hours
    'C': 30240,       // 21 days (in minutes)
    'D': 108000       // 75 days (in minutes)
  };

  try {
    const worldTime = getCurrentWorldTime();
    if (!worldTime) {
      await showAlertModal('Error', 'World time not available. Please try again.');
      return;
    }

    // Get today's date and current time (+5 min buffer)
    const startTimeDate = new Date(worldTime.getTime() + 5 * 60 * 1000);
    const today = formatLocalDate(startTimeDate);
    const currentHour = startTimeDate.getHours();
    const currentMinute = startTimeDate.getMinutes();
    const startTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}:00`;

    // Schedule the maintenance to start now
    const response = await fetch('/api/schedule/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aircraftId: aircraftId,
        checkType: checkType,
        scheduledDate: today,
        startTime: startTime,
        duration: checkDurations[checkType],
        dayOfWeek: startTimeDate.getDay()
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to schedule check');
    }

    const checkNames = { daily: 'Daily', weekly: 'Weekly', A: 'A Check', C: 'C Check', D: 'D Check' };
    const checkName = checkNames[checkType] || checkType;
    const durationText = checkType === 'daily' ? '1 hour' :
                         checkType === 'weekly' ? '2-3 hours' :
                         checkType === 'A' ? '6-12 hours' :
                         checkType === 'C' ? '2-4 weeks' : '2-3 months';

    await showAlertModal('Check Scheduled',
      `${checkName} has been scheduled to start now (${startTime}). ` +
      `Duration: ${durationText}. ` +
      `Once complete, you can enable auto-scheduling for this check type.`);

    // Refresh schedule data and re-render
    await loadSchedule();
    renderSchedule();

  } catch (error) {
    console.error('Error scheduling check:', error);
    await showAlertModal('Error', error.message || 'Failed to schedule check. Please try again.');
  }
}

// Schedule only the highest-level expired check (it will validate all lower checks)
// Hierarchy: D → C → A → weekly → daily
async function performAllChecksNow(aircraftId) {
  const aircraft = userFleet.find(a => a.id === aircraftId);
  if (!aircraft) return;

  const allExpiredChecks = getExpiredChecks(aircraft);
  if (allExpiredChecks.length === 0) return;

  // Find the highest-level check needed (D > C > A > weekly > daily)
  // Since higher checks validate all lower ones, we only need to schedule the highest
  const checkPriority = ['D', 'C', 'A', 'weekly', 'daily'];
  const expiredTypes = allExpiredChecks.map(c => c.type);

  let highestCheck = null;
  for (const checkType of checkPriority) {
    if (expiredTypes.includes(checkType)) {
      highestCheck = allExpiredChecks.find(c => c.type === checkType);
      break;
    }
  }

  if (!highestCheck) return;

  // Show loading overlay
  showLoadingOverlay(`Scheduling ${highestCheck.name}...`);

  // Immediately hide the PERFORM NOW banner for this aircraft
  // Find all cells for this aircraft and hide any PERFORM NOW overlays
  const cells = document.querySelectorAll(`td[data-aircraft-id="${aircraftId}"]`);
  cells.forEach(cell => {
    // Find the overlay div (it has position: absolute and contains the PERFORM NOW button)
    const overlays = cell.querySelectorAll('div');
    overlays.forEach(div => {
      const button = div.querySelector('button');
      if (button && button.textContent.includes('PERFORM NOW')) {
        // Hide the parent overlay container
        div.style.display = 'none';
      }
    });
  });

  // Check durations in minutes
  const checkDurations = {
    'daily': 60,      // 1 hour
    'weekly': 135,    // 2.25 hours
    'A': 540,         // 9 hours
    'C': 30240,       // 21 days (in minutes)
    'D': 108000       // 75 days (in minutes)
  };

  // What checks will be validated by this check
  const validatesMap = {
    'D': ['D', 'C', 'A', 'weekly', 'daily'],
    'C': ['C', 'A', 'weekly', 'daily'],
    'A': ['A', 'weekly', 'daily'],
    'weekly': ['weekly', 'daily'],
    'daily': ['daily']
  };

  try {
    const worldTime = getCurrentWorldTime();
    if (!worldTime) {
      hideLoadingOverlay();
      await showAlertModal('Error', 'World time not available. Please try again.');
      return;
    }

    const currentTime = new Date(worldTime);
    const today = formatLocalDate(currentTime);
    const startTime = `${String(currentTime.getHours()).padStart(2, '0')}:${String(currentTime.getMinutes()).padStart(2, '0')}:00`;

    console.log(`[MAINT] Scheduling ${highestCheck.name} for ${today} at ${startTime} (will validate: ${validatesMap[highestCheck.type].join(', ')})`);

    const response = await fetch('/api/schedule/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aircraftId: aircraftId,
        checkType: highestCheck.type,
        scheduledDate: today,
        startTime: startTime,
        duration: checkDurations[highestCheck.type],
        dayOfWeek: currentTime.getDay()
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`[MAINT] Failed to schedule ${highestCheck.name}:`, error);
      throw new Error(error.error || `Failed to schedule ${highestCheck.name}`);
    }

    const result = await response.json();
    console.log(`[MAINT] Successfully scheduled ${highestCheck.name}:`, result);

    // Refresh schedule data and re-render
    await loadSchedule();
    renderSchedule();

    // Hide loading overlay
    hideLoadingOverlay();

    // Show success confirmation with info about what will be validated
    const validatedChecks = validatesMap[highestCheck.type].map(t => {
      const names = { 'daily': 'Daily', 'weekly': 'Weekly', 'A': 'A Check', 'C': 'C Check', 'D': 'D Check' };
      return names[t];
    }).join(', ');

    await showAlertModal('Maintenance Scheduled',
      `Scheduled: ${highestCheck.name} on ${today} at ${startTime}\n\nThis will validate: ${validatedChecks}\n\nThe aircraft will be available once maintenance is complete.`);

  } catch (error) {
    hideLoadingOverlay();
    console.error('Error scheduling check:', error);
    await showAlertModal('Error', error.message || 'Failed to schedule check. Please try again.');
  }
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
  // All checks are schedulable for auto-scheduling (scheduled close to expiry)
  const checks = [
    { type: 'daily', name: 'Daily Check', duration: '30-90 min', color: '#FFA500', schedulable: true },
    { type: 'weekly', name: 'Weekly Check', duration: '1.5-3 hrs', color: '#8B5CF6', schedulable: true },
    { type: 'A', name: 'A Check', duration: '6-12 hrs', color: '#3B82F6', schedulable: true },
    { type: 'C', name: 'C Check', duration: '2-4 weeks', color: '#DC2626', schedulable: true },
    { type: 'D', name: 'D Check', duration: '2-3 months', color: '#10B981', schedulable: true }
  ];

  // Get in-progress maintenance for this aircraft
  const inProgressMaint = getInProgressMaintenance(aircraft.id);
  const inProgressCheckTypes = new Set(inProgressMaint.map(m => m.checkType));

  // Check hierarchy: D > C > A > weekly > daily (heavier checks cover lighter ones)
  const checkHierarchy = ['D', 'C', 'A', 'weekly', 'daily']; // Heaviest first

  // Find the heaviest check that is IN PROGRESS (this will cover lighter checks when complete)
  let heaviestInProgressCheck = null;
  for (const checkType of checkHierarchy) {
    if (inProgressCheckTypes.has(checkType)) {
      heaviestInProgressCheck = checkType;
      break;
    }
  }

  // Determine the HEAVIEST expired check that is NOT covered by an in-progress heavier check
  // Only that check should show the "Perform" button since it will validate all lighter checks
  let heaviestExpiredCheck = null;
  let heaviestExpiredCheckInProgress = false;
  for (const checkType of checkHierarchy) {
    const checkStatus = getCheckStatus(aircraft, checkType);
    if (checkStatus.status === 'expired' || checkStatus.status === 'none') {
      // Check if this expired check is covered by an in-progress heavier check
      if (heaviestInProgressCheck) {
        const inProgressIndex = checkHierarchy.indexOf(heaviestInProgressCheck);
        const currentIndex = checkHierarchy.indexOf(checkType);
        if (currentIndex > inProgressIndex) {
          // This expired check is lighter than the in-progress check, so it's covered
          continue;
        }
      }
      heaviestExpiredCheck = checkType;
      heaviestExpiredCheckInProgress = inProgressCheckTypes.has(checkType);
      break; // Found the heaviest expired that needs attention
    }
  }

  // Build check rows HTML
  const checkRowsHtml = checks.map(check => {
    const status = getCheckStatus(aircraft, check.type);
    const isCheckInProgress = inProgressCheckTypes.has(check.type);

    // Check if this check is covered by a heavier in-progress check
    // If so, it shouldn't show as "in progress" individually
    let isCoveredByHeavierInProgress = false;
    if (heaviestInProgressCheck && check.type !== heaviestInProgressCheck) {
      const heaviestIndex = checkHierarchy.indexOf(heaviestInProgressCheck);
      const currentIndex = checkHierarchy.indexOf(check.type);
      if (currentIndex > heaviestIndex) {
        isCoveredByHeavierInProgress = true;
      }
    }

    // Override status for in-progress checks (but not if covered by heavier in-progress check)
    let displayStatus = status.status;
    let displayText = status.text;
    if (isCheckInProgress && !isCoveredByHeavierInProgress && (status.status === 'expired' || status.status === 'none')) {
      displayStatus = 'in_progress';
      displayText = 'IN PROGRESS';
    } else if (isCoveredByHeavierInProgress && (status.status === 'expired' || status.status === 'none')) {
      // Covered by heavier in-progress check - show as covered, not expired
      displayStatus = 'covered';
      displayText = 'Covered';
    }

    const statusColors = {
      'valid': '#3fb950',
      'warning': '#d29922',
      'expired': '#f85149',
      'none': '#8b949e',
      'in_progress': '#ffa657',
      'covered': '#ffa657'
    };
    const statusColor = statusColors[displayStatus] || '#8b949e';

    const lastCheckText = status.lastCheck ? formatCheckDate(status.lastCheck) : 'Never';
    // For A check (hours-based), show hours remaining instead of expiry date
    let expiryText;
    if (check.type === 'A' && status.hoursRemaining !== undefined) {
      const hrs = Math.round(status.hoursRemaining);
      expiryText = hrs >= 0 ? `${hrs} hrs remaining` : `${Math.abs(hrs)} hrs overdue`;
    } else {
      expiryText = status.expiryDate ? formatCheckDate(status.expiryDate) : '-';
    }

    // Get stored auto-schedule preference for this check type
    // Note: weekly needs capital W (autoScheduleWeekly), others are already correct
    const autoScheduleKeyMap = {
      'daily': 'autoScheduleDaily',
      'weekly': 'autoScheduleWeekly',
      'A': 'autoScheduleA',
      'C': 'autoScheduleC',
      'D': 'autoScheduleD'
    };
    const autoScheduleKey = autoScheduleKeyMap[check.type];
    const isAutoEnabled = aircraft[autoScheduleKey] || false;
    // Treat both 'expired' and 'none' (never performed) as needing the check to be done first
    // BUT not if check is currently in progress
    const isExpired = (status.status === 'expired' || status.status === 'none') && !isCheckInProgress;
    // Only show Perform button for the HEAVIEST expired check (and not if already in progress)
    const isHeaviestExpired = heaviestExpiredCheck === check.type && !isCheckInProgress;

    // Check if this check is already scheduled (don't show Perform if scheduled)
    const worldTimeMs = worldTime.getTime();
    const getScheduledTimeEarly = (m) => {
      let time = m.startTime || '00:00';
      if (time.length === 5) time += ':00';
      return new Date(`${m.scheduledDate}T${time}Z`).getTime();
    };
    const hasScheduledCheck = scheduledMaintenance.some(m => {
      if (m.aircraftId != aircraftId || m.checkType !== check.type) return false;
      return getScheduledTimeEarly(m) > worldTimeMs;
    });

    // Auto toggle for all schedulable checks
    // DISABLED when check is expired or never performed - must perform check first
    let autoToggle;
    if (check.schedulable) {
      if (isExpired) {
        // Expired check - show disabled toggle with tooltip
        autoToggle = `
        <div style="display: flex; align-items: center;" title="Perform ${check.name} first before enabling auto-schedule">
          <label style="position: relative; display: inline-block; width: 32px; height: 18px; cursor: not-allowed; opacity: 0.4;">
            <input type="checkbox" class="auto-check-toggle" data-check-type="${check.type}" disabled style="opacity: 0; width: 0; height: 0;">
            <span class="auto-toggle-slider" data-check-type="${check.type}" style="
              position: absolute;
              cursor: not-allowed;
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
        </div>
      `;
      } else {
        // Not expired - normal toggle
        autoToggle = `
        <div style="display: flex; align-items: center;">
          <label style="position: relative; display: inline-block; width: 32px; height: 18px; cursor: pointer;">
            <input type="checkbox" class="auto-check-toggle" data-check-type="${check.type}" ${isAutoEnabled ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;">
            <span class="auto-toggle-slider" data-check-type="${check.type}" style="
              position: absolute;
              cursor: pointer;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background-color: ${isAutoEnabled ? 'var(--accent-color)' : '#4b5563'};
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
              ${isAutoEnabled ? 'transform: translateX(14px);' : ''}
            "></span>
          </label>
        </div>
      `;
      }
    } else {
      autoToggle = `<span style="color: #6b7280; font-size: 0.65rem;">-</span>`;
    }

    // Schedule/Perform Now button logic:
    // - Show "Covered" for lighter checks when a heavier check is in progress (check this FIRST)
    // - Show "In Progress" for the heaviest check currently being performed
    // - Only show "Perform" for the HEAVIEST expired check (it validates all lighter ones)
    // - Show "Covered" for other expired checks (they'll be validated by the heavier check)
    // - Show normal "Schedule" for valid checks
    let scheduleBtn;

    if (check.schedulable) {
      if (isCoveredByHeavierInProgress) {
        // This check is covered by a heavier in-progress check - show "Covered" (not "In Progress")
        const inProgressCheckName = { 'D': 'D Check', 'C': 'C Check', 'A': 'A Check', 'weekly': 'Weekly' }[heaviestInProgressCheck] || heaviestInProgressCheck;
        scheduleBtn = `<span style="color: #ffa657; font-size: 0.6rem; font-style: italic;" title="${inProgressCheckName} in progress will validate this check">Covered</span>`;
      } else if (isCheckInProgress) {
        // Check is currently in progress (and not covered by heavier) - show progress indicator
        scheduleBtn = `<span style="color: #ffa657; font-size: 0.65rem; font-weight: 600;">⟳ In Progress</span>`;
      } else if (isHeaviestExpired && !hasScheduledCheck) {
        // This is the heaviest expired check and not scheduled - show "Perform" button
        scheduleBtn = `
        <button
          class="perform-now-btn"
          data-check-type="${check.type}"
          data-aircraft-id="${aircraftId}"
          onclick="performCheckNow('${aircraftId}', '${check.type}')"
          style="padding: 0.35rem 0.5rem; background: #f85149; border: none; border-radius: 4px; color: white; font-size: 0.65rem; font-weight: 600; cursor: pointer; animation: pulse 1.5s infinite;"
          title="Perform ${check.name} now to bring aircraft back into compliance"
        >Perform</button>
        <style>
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
        </style>`;
      } else if (isHeaviestExpired && hasScheduledCheck) {
        // This is the heaviest expired check but already scheduled - show "Scheduled" text
        scheduleBtn = `<span style="color: #58a6ff; font-size: 0.65rem; font-weight: 500;">Scheduled</span>`;
      } else if (isExpired && heaviestExpiredCheck) {
        // Expired but a heavier check will cover this one
        const heavierCheckName = { 'D': 'D Check', 'C': 'C Check', 'A': 'A Check', 'weekly': 'Weekly' }[heaviestExpiredCheck] || heaviestExpiredCheck;
        scheduleBtn = `<span style="color: #6b7280; font-size: 0.6rem; font-style: italic;" title="${heavierCheckName} will validate this check">Covered</span>`;
      } else {
        // Not expired - normal schedule button
        const btnLabel = 'Schedule';
        const btnTitle = check.duration;
        scheduleBtn = `
        <button
          class="schedule-check-btn"
          data-check-type="${check.type}"
          data-aircraft-id="${aircraftId}"
          data-color="${check.color}"
          onclick="openScheduleCheckModal('${aircraftId}', '${check.type}')"
          ${isAutoEnabled ? 'disabled' : ''}
          style="padding: 0.35rem 0.6rem; background: ${isAutoEnabled ? '#4b5563' : check.color}; border: none; border-radius: 4px; color: white; font-size: 0.7rem; font-weight: 600; cursor: ${isAutoEnabled ? 'not-allowed' : 'pointer'}; ${isAutoEnabled ? 'opacity: 0.5;' : ''}"
          title="${btnTitle}"
        >${btnLabel}</button>`;
      }
    } else {
      scheduleBtn = `<span style="color: #6b7280; font-size: 0.7rem;">-</span>`;
    }

    // Check if this check is currently in progress - show that first
    const currentInProgress = inProgressMaint.find(m => m.checkType === check.type);
    let nextScheduledText, nextScheduledColor;

    if (currentInProgress) {
      // Show when the in-progress check started
      nextScheduledText = formatCheckDate(`${currentInProgress.scheduledDate}T${(currentInProgress.startTime || '00:00').substring(0, 5)}:00Z`);
      nextScheduledColor = '#ffa657';
    } else {
      // Look for future scheduled maintenance
      const nextScheduled = scheduledMaintenance
        .filter(m => {
          if (m.aircraftId != aircraftId || m.checkType !== check.type) return false; // Use != for type-coercive comparison
          return getScheduledTimeEarly(m) > worldTimeMs;
        })
        .sort((a, b) => getScheduledTimeEarly(a) - getScheduledTimeEarly(b))[0];
      nextScheduledText = nextScheduled
        ? formatCheckDate(`${nextScheduled.scheduledDate}T${(nextScheduled.startTime || '00:00').substring(0, 5)}:00Z`)
        : 'Not yet planned';
      nextScheduledColor = nextScheduled ? 'var(--text-primary)' : '#6b7280';
    }

    return `
      <div style="display: grid; grid-template-columns: 105px 80px 1fr 1fr 1fr 45px 70px; gap: 0.5rem; align-items: center; padding: 0.65rem; background: var(--surface-elevated); border-radius: 6px; margin-bottom: 0.5rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="width: 10px; height: 10px; background: ${check.color}; border-radius: 2px; flex-shrink: 0;"></span>
          <span style="color: var(--text-primary); font-weight: 600; font-size: 0.8rem;">${check.name}</span>
        </div>
        <span style="color: ${statusColor}; font-weight: 600; font-size: 0.7rem;">${displayText}</span>
        <span style="font-size: 0.75rem; color: var(--text-primary);">${lastCheckText}</span>
        <span style="font-size: 0.75rem; color: ${displayStatus === 'expired' ? '#f85149' : 'var(--text-primary)'};">${expiryText}</span>
        <span style="font-size: 0.75rem; color: ${nextScheduledColor};">${nextScheduledText}</span>
        <div style="display: flex; justify-content: center; align-items: center;">
          ${autoToggle}
        </div>
        <div style="text-align: right;">
          ${scheduleBtn}
        </div>
      </div>
    `;
  }).join('');

  // Calculate if ALL auto-schedule options are enabled for the "Auto Schedule All" toggle
  const allAutoScheduleEnabled = aircraft.autoScheduleDaily &&
    aircraft.autoScheduleWeekly &&
    aircraft.autoScheduleA &&
    aircraft.autoScheduleC &&
    aircraft.autoScheduleD;

  // Build banner HTML based on maintenance status
  const checkNameMap = { daily: 'Daily Check', weekly: 'Weekly Check', A: 'A Check', C: 'C Check', D: 'D Check' };
  const heaviestCheckName = heaviestExpiredCheck ? (checkNameMap[heaviestExpiredCheck] || heaviestExpiredCheck) : null;
  const heaviestInProgressCheckName = heaviestInProgressCheck ? (checkNameMap[heaviestInProgressCheck] || heaviestInProgressCheck) : null;

  // Check if the heaviest expired check is already scheduled
  const worldTimeMsBanner = worldTime.getTime();
  const heaviestExpiredIsScheduled = heaviestExpiredCheck && scheduledMaintenance.some(m => {
    if (m.aircraftId != aircraftId || m.checkType !== heaviestExpiredCheck) return false;
    let time = m.startTime || '00:00';
    if (time.length === 5) time += ':00';
    return new Date(`${m.scheduledDate}T${time}Z`).getTime() > worldTimeMsBanner;
  });

  let expiredBannerHtml = '';
  if (heaviestExpiredCheck && heaviestExpiredCheckInProgress) {
    // Heaviest expired check is currently in progress - show positive message
    expiredBannerHtml = `
    <div style="background: rgba(255, 166, 87, 0.15); border: 1px solid #ffa657; border-radius: 6px; padding: 1rem; margin-bottom: 1rem; color: #ffa657;">
      <div style="font-weight: 600; margin-bottom: 0.25rem;">⟳ Maintenance in progress</div>
      <div style="font-size: 0.85rem; color: var(--text-secondary);">
        <strong style="color: #ffa657;">${heaviestCheckName}</strong> is currently being performed. Auto-scheduling will be available once complete.
      </div>
    </div>
  `;
  } else if (!heaviestExpiredCheck && heaviestInProgressCheck) {
    // All expired checks are covered by an in-progress heavier check - show positive message
    expiredBannerHtml = `
    <div style="background: rgba(255, 166, 87, 0.15); border: 1px solid #ffa657; border-radius: 6px; padding: 1rem; margin-bottom: 1rem; color: #ffa657;">
      <div style="font-weight: 600; margin-bottom: 0.25rem;">⟳ Maintenance in progress</div>
      <div style="font-size: 0.85rem; color: var(--text-secondary);">
        <strong style="color: #ffa657;">${heaviestInProgressCheckName}</strong> is currently being performed. All expired checks will be validated once complete.
      </div>
    </div>
  `;
  } else if (heaviestExpiredCheck && heaviestExpiredIsScheduled) {
    // Heaviest expired check is scheduled - show info message
    expiredBannerHtml = `
    <div style="background: rgba(88, 166, 255, 0.15); border: 1px solid #58a6ff; border-radius: 6px; padding: 1rem; margin-bottom: 1rem; color: #58a6ff;">
      <div style="font-weight: 600; margin-bottom: 0.25rem;">📅 Maintenance scheduled</div>
      <div style="font-size: 0.85rem; color: var(--text-secondary);">
        <strong style="color: #58a6ff;">${heaviestCheckName}</strong> is scheduled and will begin soon. Auto-scheduling will be available once complete.
      </div>
    </div>
  `;
  } else if (heaviestExpiredCheck) {
    // Expired check needs to be performed - show warning
    expiredBannerHtml = `
    <div style="background: rgba(248, 81, 73, 0.15); border: 1px solid #f85149; border-radius: 6px; padding: 1rem; margin-bottom: 1rem; color: #f85149;">
      <div style="font-weight: 600; margin-bottom: 0.25rem;">⚠️ Auto-schedule unavailable</div>
      <div style="font-size: 0.85rem; color: var(--text-secondary);">
        <strong style="color: #f85149;">${heaviestCheckName}</strong> must be performed first before auto-scheduling can be enabled.
      </div>
    </div>
  `;
  }

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
    max-width: 850px;
    max-height: 90vh;
    overflow-y: auto;
  `;

  modalContent.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <h2 style="margin: 0; color: var(--text-primary); font-size: 1.2rem;">MAINTENANCE STATUS</h2>
      <button onclick="document.getElementById('maintenanceModalOverlay').remove()" style="background: none; border: none; color: #8b949e; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1;">&times;</button>
    </div>

    ${expiredBannerHtml}

    <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; padding: 1rem; background: var(--surface-elevated); border-radius: 6px;">
      <div style="display: flex; align-items: center; gap: 1rem;">
        <div style="width: 40px; height: 40px; background: var(--accent-color); border-radius: 6px; display: flex; align-items: center; justify-content: center;">
          <span style="color: white; font-weight: 700; font-size: 0.9rem;">✈</span>
        </div>
        <div>
          <div style="color: var(--accent-color); font-weight: 700; font-size: 1.1rem;">${aircraft.registration}</div>
          <div style="color: #8b949e; font-size: 0.85rem;">${aircraft.aircraft?.manufacturer || ''} ${aircraft.aircraft?.model || ''}${aircraft.aircraft?.variant ? (aircraft.aircraft.variant.startsWith('-') ? aircraft.aircraft.variant : '-' + aircraft.aircraft.variant) : ''}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; background: var(--surface); border: 1px solid var(--border-color); border-radius: 6px; ${heaviestExpiredCheck ? 'opacity: 0.5;' : ''}" ${heaviestExpiredCheck ? 'title="Perform expired checks first"' : ''}>
        <span style="color: var(--text-secondary); font-size: 0.8rem; font-weight: 600;">Auto Schedule All</span>
        <label style="position: relative; display: inline-block; width: 40px; height: 22px; cursor: ${heaviestExpiredCheck ? 'not-allowed' : 'pointer'};">
          <input type="checkbox" id="autoScheduleAll" ${allAutoScheduleEnabled ? 'checked' : ''} ${heaviestExpiredCheck ? 'disabled' : ''} style="opacity: 0; width: 0; height: 0;">
          <span id="autoScheduleAllSlider" style="
            position: absolute;
            cursor: ${heaviestExpiredCheck ? 'not-allowed' : 'pointer'};
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: ${allAutoScheduleEnabled && !heaviestExpiredCheck ? 'var(--accent-color)' : '#4b5563'};
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
            ${allAutoScheduleEnabled && !heaviestExpiredCheck ? 'transform: translateX(18px);' : ''}
          "></span>
        </label>
      </div>
    </div>

    <div style="margin-bottom: 1rem;">
      <div style="display: grid; grid-template-columns: 105px 80px 1fr 1fr 1fr 45px 70px; gap: 0.5rem; padding: 0.5rem 0.65rem; color: #8b949e; font-size: 0.65rem; text-transform: uppercase; font-weight: 600;">
        <span>Check</span>
        <span>Status</span>
        <span>Last Completed</span>
        <span>Valid Until</span>
        <span>Next Scheduled</span>
        <span style="text-align: center;">Auto</span>
        <span style="text-align: right;">Manual</span>
      </div>
      ${checkRowsHtml}
    </div>

    <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
      <button id="saveAutoScheduleBtn" style="flex: 1; padding: 0.75rem 1.5rem; background: var(--accent-color); border: none; border-radius: 6px; color: white; font-weight: 600; cursor: pointer; font-size: 0.9rem;">
        Save Preferences
      </button>
      <button id="closeMaintenanceModalBtn" style="flex: 1; padding: 0.75rem 1.5rem; background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-weight: 600; cursor: pointer; font-size: 0.9rem;">
        Cancel
      </button>
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

  // Auto Schedule All toggle handler (visual only, no save)
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

  // Individual toggle handlers - update visual, button, and "All" toggle state (no save)
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

  // Initialize "Auto Schedule All" toggle based on stored preferences
  const allCheckedInitial = Array.from(individualToggles).every(t => t.checked);
  if (allCheckedInitial) {
    autoAllCheckbox.checked = true;
    updateMainToggleVisual(autoAllCheckbox, autoAllSlider, autoAllKnob);
  }

  // Save button handler
  const saveBtn = document.getElementById('saveAutoScheduleBtn');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    saveBtn.style.opacity = '0.7';

    // Create loading overlay
    const loadingOverlay = document.createElement('div');
    loadingOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      z-index: 10;
    `;
    loadingOverlay.innerHTML = `
      <div style="width: 40px; height: 40px; border: 3px solid #4b5563; border-top-color: var(--accent-color); border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <p id="loadingMessage" style="color: white; margin-top: 1rem; font-size: 0.9rem;">Creating auto-schedules...</p>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;
    modalContent.style.position = 'relative';
    modalContent.appendChild(loadingOverlay);

    const loadingMsg = loadingOverlay.querySelector('#loadingMessage');

    try {
      // Build preferences object for batch save
      const preferences = {};
      individualToggles.forEach(toggle => {
        const checkType = toggle.getAttribute('data-check-type');
        preferences[checkType] = toggle.checked;
      });

      // Single batch API call - waits for scheduling to complete
      const response = await fetch(`/api/fleet/${aircraftId}/auto-schedule/batch`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences })
      });

      if (!response.ok) {
        const data = await response.json();

        // Handle expired checks error specially - show which checks need to be performed first
        if (data.expiredChecks && data.expiredChecks.length > 0) {
          loadingOverlay.remove();

          // Find the heaviest expired check (D > C > A > weekly > daily)
          const checkHierarchy = ['D', 'C', 'A', 'weekly', 'daily'];
          const checkNameMap = { daily: 'Daily Check', weekly: 'Weekly Check', A: 'A Check', C: 'C Check', D: 'D Check' };
          let heaviestExpired = null;
          for (const ct of checkHierarchy) {
            if (data.expiredChecks.includes(ct)) {
              heaviestExpired = ct;
              break;
            }
          }
          const heaviestCheckName = checkNameMap[heaviestExpired] || heaviestExpired;

          // Show error message in modal - only mention heaviest check
          const errorDiv = document.createElement('div');
          errorDiv.style.cssText = 'background: rgba(248, 81, 73, 0.15); border: 1px solid #f85149; border-radius: 6px; padding: 1rem; margin-bottom: 1rem; color: #f85149;';
          errorDiv.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 0.5rem;">⚠️ Cannot enable auto-schedule</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">
              <strong style="color: #f85149;">${heaviestCheckName}</strong> must be performed first.<br>
              ${data.expiredChecks.length > 1 ? `<span style="font-size: 0.8rem; opacity: 0.8;">(This will also validate ${data.expiredChecks.length - 1} lighter check${data.expiredChecks.length > 2 ? 's' : ''})</span><br>` : ''}
              <br>Click "Perform" on the ${heaviestCheckName} row below.
            </div>
          `;

          // Insert error at top of modal content
          const firstChild = modalContent.querySelector('div');
          if (firstChild && firstChild.nextSibling) {
            modalContent.insertBefore(errorDiv, firstChild.nextSibling);
          }

          // Reset save button
          saveBtn.textContent = 'Save Preferences';
          saveBtn.style.background = 'var(--accent-color)';
          saveBtn.disabled = false;
          saveBtn.style.opacity = '1';

          // Reset the toggles for expired checks to off
          data.expiredChecks.forEach(checkType => {
            const toggle = document.querySelector(`.auto-check-toggle[data-check-type="${checkType}"]`);
            if (toggle) {
              toggle.checked = false;
              updateIndividualToggleVisual(checkType, false);
            }
          });

          return; // Don't throw, we've handled this case
        }

        throw new Error(data.error || 'Failed to save preferences');
      }

      // Update local fleet data
      const aircraft = userFleet.find(a => a.id === aircraftId);
      if (aircraft) {
        const autoScheduleKeyMap = {
          'daily': 'autoScheduleDaily',
          'weekly': 'autoScheduleWeekly',
          'A': 'autoScheduleA',
          'C': 'autoScheduleC',
          'D': 'autoScheduleD'
        };
        individualToggles.forEach(toggle => {
          const checkType = toggle.getAttribute('data-check-type');
          const key = autoScheduleKeyMap[checkType];
          aircraft[key] = toggle.checked;
        });
      }

      // Update loading message and refresh schedule
      loadingMsg.textContent = 'Refreshing schedule...';
      await loadSchedule();

      // Remove loading overlay and close modal
      loadingOverlay.remove();
      saveBtn.textContent = 'Saved!';
      saveBtn.style.background = '#10B981';

      // Close modal after brief delay
      setTimeout(() => {
        overlay.remove();
      }, 500);
    } catch (error) {
      console.error('Error saving preferences:', error);
      loadingOverlay.remove();
      saveBtn.textContent = 'Error - Try Again';
      saveBtn.style.background = '#DC2626';
      saveBtn.disabled = false;
      saveBtn.style.opacity = '1';
    }
  });

  // Cancel button handler
  const cancelBtn = document.getElementById('closeMaintenanceModalBtn');
  cancelBtn.addEventListener('click', () => {
    overlay.remove();
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

  const checkNames = { 'daily': 'Daily Check', 'weekly': 'Weekly Check', 'A': 'A Check', 'C': 'C Check', 'D': 'D Check' };
  const checkDurations = { 'daily': '30-90 min', 'weekly': '1.5-3 hrs', 'A': '6-12 hrs', 'C': '2-4 weeks', 'D': '2-3 months' };
  const checkColors = { 'daily': '#FFA500', 'weekly': '#8B5CF6', 'A': '#17A2B8', 'C': '#DC2626', 'D': '#0E7490' };
  const checkIntervals = { 'daily': '1-2 days', 'weekly': '7-8 days', 'A': '800-1000 hrs', 'C': '2 years', 'D': '5-7 years' };

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const isDailyView = viewMode === 'daily';

  // Day selector HTML - only show in weekly view
  let daySelectorHtml = '';
  if (!isDailyView) {
    const dayOptionsHtml = dayNames.map((name, index) => {
      const isSelected = index === selectedDayOfWeek ? 'selected' : '';
      return `<option value="${index}" ${isSelected}>${name.toUpperCase()}</option>`;
    }).join('');

    daySelectorHtml = `
      <div style="margin-bottom: 1.25rem;">
        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-weight: 600; font-size: 0.85rem;">Day</label>
        <select id="scheduleDay" style="width: 100%; padding: 0.65rem; background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-size: 0.95rem;">
          ${dayOptionsHtml}
        </select>
      </div>
    `;
  }

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

  // Show which day we're scheduling for in daily view
  const dayInfoText = isDailyView
    ? `<div style="margin-bottom: 1rem; padding: 0.5rem 0.75rem; background: var(--surface-elevated); border-radius: 4px; color: var(--text-secondary); font-size: 0.85rem;">
        Scheduling for: <strong style="color: var(--text-primary);">${dayNames[selectedDayOfWeek].toUpperCase()}</strong>
      </div>`
    : '';

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

    ${dayInfoText}
    ${daySelectorHtml}

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
      <span style="color: var(--text-secondary); font-size: 0.8rem;">Aircraft next available:</span>
      <span id="scheduleAvailableTime" style="color: #58a6ff; font-weight: 600; font-size: 0.9rem;">--:--</span>
    </div>

    <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
      <button id="cancelScheduleBtn" style="padding: 0.6rem 1.25rem; background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-secondary); cursor: pointer; font-size: 0.9rem;">Cancel</button>
      <button id="confirmScheduleBtn" style="padding: 0.6rem 1.25rem; background: ${checkColors[checkType]}; border: none; border-radius: 4px; color: white; cursor: pointer; font-weight: 600; font-size: 0.9rem;">Schedule</button>
    </div>
  `;

  overlay.appendChild(modalContent);
  document.body.appendChild(overlay);

  // Update available time - C and D checks are multi-day
  // daily=60min, weekly=135min (2.25hrs), A=540min (9hrs), C=21 days, D=75 days
  const durations = { 'daily': 60, 'weekly': 135, 'A': 540, 'C': 30240, 'D': 108000 }; // minutes
  const isMultiDay = checkType === 'C' || checkType === 'D';
  function updateAvailableTime() {
    const startTime = document.getElementById('scheduleTime').value;
    if (isMultiDay) {
      // For C and D checks, show days until available (avg: C=21 days, D=75 days)
      const daysUntil = checkType === 'C' ? 21 : 75;
      document.getElementById('scheduleAvailableTime').textContent = `+${daysUntil} days at ${startTime}`;
    } else {
      const endTime = calculateEndTime(startTime, durations[checkType]);
      document.getElementById('scheduleAvailableTime').textContent = endTime;
    }
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
    // In daily view, use the currently viewed day; in weekly view, read from dropdown
    const selectedDay = isDailyView
      ? selectedDayOfWeek
      : parseInt(document.getElementById('scheduleDay').value);
    const startTime = document.getElementById('scheduleTime').value;
    const repeatCheck = showRepeat ? document.getElementById('scheduleRepeat')?.checked : false;

    if (!startTime) {
      await showAlertModal('Validation Error', 'Please select a start time');
      return;
    }

    const daysUntilSelected = getDaysUntilTargetForScheduling(currentDay, selectedDay);
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
    if ((m.aircraftId || m.aircraft?.id) != aircraftId) return false;
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

    // Delete all flights and maintenance in parallel
    await Promise.all([
      ...dayFlights.map(f => fetch(`/api/schedule/flight/${f.id}`, { method: 'DELETE' })),
      ...dayMaint.map(m => fetch(`/api/schedule/maintenance/${m.id}`, { method: 'DELETE' }))
    ]);

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
  const weekFlights = scheduledFlights.filter(f => f.aircraft?.id == aircraftId); // Use == for type-coercive comparison

  // Get all maintenance for this aircraft in the current week data
  const weekMaint = scheduledMaintenance.filter(m => (m.aircraftId || m.aircraft?.id) == aircraftId);

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

    // Delete all flights and maintenance in parallel
    await Promise.all([
      ...weekFlights.map(f => fetch(`/api/schedule/flight/${f.id}`, { method: 'DELETE' })),
      ...weekMaint.map(m => fetch(`/api/schedule/maintenance/${m.id}`, { method: 'DELETE' }))
    ]);

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
  const daysUntilTarget = getDaysUntilTargetForScheduling(currentDay, dayOfWeek);
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
      // Refresh auto-maintenance for this aircraft after adding flight
      if (aircraftId) {
        try {
          const refreshResp = await fetch(`/api/fleet/${aircraftId}/refresh-maintenance`, { method: 'POST' });
          const refreshData = await refreshResp.json();
          console.log('[MAINT] Refreshed:', refreshData.scheduledChecks, 'checks for', aircraftId);
        } catch (e) {
          console.error('Error refreshing maintenance:', e);
        }
      }
      // Force fresh data fetch by reloading schedule
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
  const daysUntilTarget = getDaysUntilTargetForScheduling(currentDay, selectedDayOfWeek);
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

// Format currency helper
function formatCurrencyValue(amount) {
  const numAmount = Number(amount) || 0;
  return numAmount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

// Show aircraft details modal
async function showAircraftDetails(userAircraftId) {
  const userAircraft = userFleet.find(a => a.id === userAircraftId);
  if (!userAircraft || !userAircraft.aircraft) return;

  const aircraft = userAircraft.aircraft;
  const isLeased = userAircraft.acquisitionType === 'lease';
  const conditionPercent = userAircraft.conditionPercentage || 100;

  // Calculate costs
  const fuelBurnPerHour = parseFloat(userAircraft.fuelBurnPerHour) || 0;
  const maintenanceCostPerHour = parseFloat(userAircraft.maintenanceCostPerHour) || 0;
  const fuelPricePerLiter = 0.75;
  const fuelCostPerHour = fuelBurnPerHour * fuelPricePerLiter;
  const totalHourlyCost = fuelCostPerHour + maintenanceCostPerHour;
  const hoursPerDay = 8;
  const monthlyOperatingCost = totalHourlyCost * hoursPerDay * 30;
  const leaseMonthly = parseFloat(userAircraft.leaseMonthlyPayment) || 0;
  const totalMonthlyCost = monthlyOperatingCost + (isLeased ? leaseMonthly : 0);

  const getConditionColor = (pct) => pct >= 80 ? 'var(--success-color)' : pct >= 50 ? 'var(--warning-color)' : 'var(--danger-color)';

  // Create modal
  const overlay = document.createElement('div');
  overlay.id = 'aircraftDetailOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:2000;display:flex;justify-content:center;align-items:center;padding:1rem;';

  overlay.innerHTML = `
    <div style="background: var(--surface); border: 1px solid var(--border-color); border-radius: 10px; width: 100%; max-width: 1100px;">
      <!-- Header -->
      <div style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
        <div>
          <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px;">${aircraft.type} • ${aircraft.rangeCategory}</span>
          <h2 style="margin: 0.25rem 0 0 0; color: var(--text-primary); font-size: 1.5rem;">${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? '-' + aircraft.variant : ''}</h2>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 1.8rem; font-weight: 700; color: var(--accent-color); font-family: monospace;">${userAircraft.registration}</div>
          <span class="status-badge ${isLeased ? 'status-leased' : 'status-owned'}" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;">${isLeased ? 'LEASED' : 'OWNED'}</span>
        </div>
      </div>

      <!-- Content -->
      <div style="padding: 1rem 1.5rem;">
        <!-- Stats Row -->
        <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.75rem; margin-bottom: 1rem;">
          <div style="background: var(--surface-elevated); padding: 0.75rem; border-radius: 6px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">Condition</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: ${getConditionColor(conditionPercent)};">${conditionPercent}%</div>
          </div>
          <div style="background: var(--surface-elevated); padding: 0.75rem; border-radius: 6px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">Age</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary);">${userAircraft.ageYears || 0} yrs</div>
          </div>
          <div style="background: var(--surface-elevated); padding: 0.75rem; border-radius: 6px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">Capacity</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary);">${aircraft.passengerCapacity} pax</div>
          </div>
          <div style="background: var(--surface-elevated); padding: 0.75rem; border-radius: 6px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">Location</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: var(--accent-color);">${userAircraft.currentAirport || 'N/A'}</div>
          </div>
          <div style="background: var(--surface-elevated); padding: 0.75rem; border-radius: 6px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">Flight Hours</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary);">${formatCurrencyValue(parseFloat(userAircraft.totalFlightHours) || 0)}</div>
          </div>
          <div style="background: var(--surface-elevated); padding: 0.75rem; border-radius: 6px; text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">Routes</div>
            <div style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary);" id="routeCount">...</div>
          </div>
        </div>

        <!-- Main Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1.3fr 1.3fr; gap: 0.75rem; font-size: 0.95rem;">
          <!-- Col 1: Specs -->
          <div style="background: var(--surface-elevated); border-radius: 6px; padding: 0.75rem;">
            <div style="font-size: 0.8rem; color: var(--accent-color); text-transform: uppercase; font-weight: 600; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.35rem;">Specifications</div>
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="color: var(--text-muted);">Range</span><span style="font-weight: 500;">${formatCurrencyValue(aircraft.rangeNm)} nm</span></div>
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="color: var(--text-muted);">Speed</span><span style="font-weight: 500;">${aircraft.cruiseSpeed} kts</span></div>
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="color: var(--text-muted);">Fuel Cap</span><span style="font-weight: 500;">${formatCurrencyValue(aircraft.fuelCapacityLiters)} L</span></div>
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="color: var(--text-muted);">Burn Rate</span><span style="font-weight: 500;">${formatCurrencyValue(fuelBurnPerHour)} L/hr</span></div>
          </div>

          <!-- Col 2: Costs -->
          <div style="background: var(--surface-elevated); border-radius: 6px; padding: 0.75rem;">
            <div style="font-size: 0.8rem; color: var(--warning-color); text-transform: uppercase; font-weight: 600; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.35rem;">Operating Costs</div>
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="color: var(--text-muted);">Fuel/hr</span><span style="font-weight: 500;">$${formatCurrencyValue(fuelCostPerHour)}</span></div>
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="color: var(--text-muted);">Maint/hr</span><span style="font-weight: 500;">$${formatCurrencyValue(maintenanceCostPerHour)}</span></div>
            <div style="display: flex; justify-content: space-between; padding: 0.4rem 0; border-top: 1px solid var(--border-color); margin-top: 0.2rem;"><span style="font-weight: 600;">Total/hr</span><span style="color: var(--warning-color); font-weight: 700; font-size: 1.05rem;">$${formatCurrencyValue(totalHourlyCost)}</span></div>
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="font-weight: 600;">Monthly</span><span style="color: var(--danger-color); font-weight: 700; font-size: 1.05rem;">$${formatCurrencyValue(totalMonthlyCost)}</span></div>
          </div>

          <!-- Col 3: Routes -->
          <div style="background: var(--surface-elevated); border-radius: 6px; padding: 0.75rem;">
            <div style="font-size: 0.8rem; color: var(--success-color); text-transform: uppercase; font-weight: 600; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.35rem;">Route Performance</div>
            <div id="routeInfo" style="color: var(--text-muted);">Loading...</div>
          </div>

          <!-- Col 4: Maintenance -->
          <div style="background: var(--surface-elevated); border-radius: 6px; padding: 0.75rem;">
            <div style="font-size: 0.8rem; color: var(--primary-color); text-transform: uppercase; font-weight: 600; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.35rem;">Heavy Checks Due</div>
            <div id="maintInfo" style="color: var(--text-muted);">Loading...</div>
          </div>
        </div>

        <!-- Bottom Row: Ownership -->
        <div style="margin-top: 0.75rem; background: var(--surface-elevated); border-radius: 6px; padding: 0.6rem 1rem; font-size: 0.95rem; display: flex; justify-content: space-between; align-items: center;">
          ${isLeased ? `
            <span><span style="color: var(--text-muted);">Lease:</span> <strong>${userAircraft.leaseDurationMonths} months</strong> @ <span style="color: var(--warning-color); font-weight: 600;">$${formatCurrencyValue(leaseMonthly)}/mo</span></span>
            <span><span style="color: var(--text-muted);">Ends:</span> <strong>${new Date(userAircraft.leaseEndDate).toLocaleDateString('en-GB')}</strong></span>
          ` : `
            <span><span style="color: var(--text-muted);">Purchased for:</span> <span style="color: var(--success-color); font-weight: 600;">$${formatCurrencyValue(userAircraft.purchasePrice || 0)}</span></span>
            <span><span style="color: var(--text-muted);">Acquired:</span> <strong>${new Date(userAircraft.acquiredAt).toLocaleDateString('en-GB')}</strong></span>
          `}
        </div>
      </div>

      <!-- Close -->
      <div style="padding: 0.75rem 1.5rem; border-top: 1px solid var(--border-color);">
        <button id="closeDetailBtn" class="btn btn-secondary" style="width: 100%; padding: 0.5rem; font-size: 1rem;">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Fetch additional details
  try {
    const response = await fetch(`/api/fleet/${userAircraftId}/details`);
    const details = await response.json();

    // Update route count
    document.getElementById('routeCount').textContent = details.activeRouteCount || 0;

    // Update route info
    const routeInfoEl = document.getElementById('routeInfo');
    if (details.mostProfitable || details.leastProfitable) {
      let routeHtml = '';
      if (details.mostProfitable) {
        const mp = details.mostProfitable;
        routeHtml += `<div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="color: var(--success-color); font-weight: 600;">Best Route:</span><span style="font-weight: 500;">${mp.origin} - ${mp.destination}</span></div>`;
        routeHtml += `<div style="display: flex; justify-content: space-between; padding: 0.2rem 0;"><span style="color: var(--text-muted);">Total Profit:</span><span style="color: var(--success-color); font-weight: 600;">$${formatCurrencyValue(mp.profit)}</span></div>`;
      }
      if (details.leastProfitable && details.leastProfitable.id !== details.mostProfitable?.id) {
        const lp = details.leastProfitable;
        const lpColor = lp.profit >= 0 ? 'var(--warning-color)' : 'var(--danger-color)';
        routeHtml += `<div style="display: flex; justify-content: space-between; padding: 0.3rem 0; margin-top: 0.3rem; border-top: 1px solid var(--border-color);"><span style="color: ${lpColor}; font-weight: 600;">Worst Route:</span><span style="font-weight: 500;">${lp.origin} - ${lp.destination}</span></div>`;
        routeHtml += `<div style="display: flex; justify-content: space-between; padding: 0.2rem 0;"><span style="color: var(--text-muted);">Total Profit:</span><span style="color: ${lpColor}; font-weight: 600;">$${formatCurrencyValue(lp.profit)}</span></div>`;
      }
      routeInfoEl.innerHTML = routeHtml || '<span style="color: var(--text-muted);">No route data yet</span>';
    } else {
      routeInfoEl.innerHTML = '<span style="color: var(--text-muted);">No routes assigned</span>';
    }

    // Update maintenance info
    const maintInfoEl = document.getElementById('maintInfo');
    const maint = details.maintenance;
    let maintHtml = '';

    if (maint.nextCCheck) {
      const cDate = new Date(maint.nextCCheck);
      const daysUntilC = Math.ceil((cDate - new Date()) / (1000 * 60 * 60 * 24));
      const cColor = daysUntilC < 30 ? 'var(--danger-color)' : daysUntilC < 90 ? 'var(--warning-color)' : 'var(--text-primary)';
      maintHtml += `<div style="display: flex; justify-content: space-between; padding: 0.4rem 0;"><span style="color: var(--text-muted);">C-Check Next Due:</span><span style="color: ${cColor}; font-weight: 600;">${cDate.toLocaleDateString('en-GB')}</span></div>`;
    } else {
      maintHtml += `<div style="display: flex; justify-content: space-between; padding: 0.4rem 0;"><span style="color: var(--text-muted);">C-Check Next Due:</span><span>Not scheduled</span></div>`;
    }

    if (maint.nextDCheck) {
      const dDate = new Date(maint.nextDCheck);
      const daysUntilD = Math.ceil((dDate - new Date()) / (1000 * 60 * 60 * 24));
      const dColor = daysUntilD < 90 ? 'var(--danger-color)' : daysUntilD < 180 ? 'var(--warning-color)' : 'var(--text-primary)';
      maintHtml += `<div style="display: flex; justify-content: space-between; padding: 0.4rem 0; border-top: 1px solid var(--border-color);"><span style="color: var(--text-muted);">D-Check Next Due:</span><span style="color: ${dColor}; font-weight: 600;">${dDate.toLocaleDateString('en-GB')}</span></div>`;
    } else {
      maintHtml += `<div style="display: flex; justify-content: space-between; padding: 0.4rem 0; border-top: 1px solid var(--border-color);"><span style="color: var(--text-muted);">D-Check Next Due:</span><span>Not scheduled</span></div>`;
    }

    maintInfoEl.innerHTML = maintHtml;
  } catch (error) {
    console.error('Error fetching aircraft details:', error);
    document.getElementById('routeCount').textContent = '?';
    document.getElementById('routeInfo').innerHTML = '<span style="color: var(--danger-color);">Error loading data</span>';
    document.getElementById('maintInfo').innerHTML = '<span style="color: var(--danger-color);">Error loading data</span>';
  }

  // Close handlers
  document.getElementById('closeDetailBtn').addEventListener('click', () => document.body.removeChild(overlay));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
  const escHandler = (e) => { if (e.key === 'Escape') { document.body.removeChild(overlay); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
}
