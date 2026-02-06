// Aircraft Scheduling JavaScript - v2.0
let userFleet = [];
let routes = [];
let selectedDayOfWeek = 1; // Default to Monday (1=Monday, 0=Sunday)
let groupBy = 'type'; // 'type' or 'none'
let currentAircraftId = null; // Aircraft being scheduled
let draggedRoute = null; // Route being dragged
let scheduledFlights = []; // All scheduled flights
let worldReferenceTime = null; // Server's world time at a specific moment
let worldReferenceTimestamp = null; // Real-world timestamp when worldReferenceTime was captured
let worldTimeAcceleration = 60; // Time acceleration factor
let timelineInterval = null; // Interval for updating the timeline
let isFirstLoad = true; // Track if this is the first load

// Fetch user's fleet
async function fetchUserFleet() {
  try {
    const response = await fetch('/api/fleet');
    if (response.ok) {
      userFleet = await response.json();
      updateFleetBadge();
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
    // Get the next occurrence of the selected day of week
    const today = new Date();
    const currentDay = today.getDay();
    const daysUntilTarget = (selectedDayOfWeek - currentDay + 7) % 7;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntilTarget);

    const dateStr = targetDate.toISOString().split('T')[0];

    const response = await fetch(`/api/schedule/flights?startDate=${dateStr}&endDate=${dateStr}`);
    if (response.ok) {
      scheduledFlights = await response.json();
    }
  } catch (error) {
    console.error('Error fetching scheduled flights:', error);
  }
}

// Update fleet count badge
function updateFleetBadge() {
  const badge = document.getElementById('fleetCountBadge');
  if (badge) {
    badge.textContent = `${userFleet.length} AIRCRAFT`;
  }
}

// Update selected day of week from dropdown
function updateSelectedDay() {
  const daySelect = document.getElementById('dayOfWeek');
  if (daySelect) {
    selectedDayOfWeek = parseInt(daySelect.value);
  }
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

// Get routes assigned to aircraft
function getAircraftRoutes(aircraftId) {
  return routes.filter(route => route.assignedAircraftId === aircraftId);
}

// Get flights for a specific cell (aircraft + date + optional hour for daily view)
function getFlightsForCell(aircraftId, date, hour = null) {
  return scheduledFlights.filter(flight => {
    if (flight.aircraftId !== aircraftId || flight.scheduledDate !== date) {
      return false;
    }

    // For daily view, only show flight in the hour it starts
    if (hour !== null) {
      const flightHour = parseInt(flight.departureTime.split(':')[0]);
      return flightHour === hour;
    }

    return true;
  });
}

// Render flight blocks within a cell (daily view only)
function renderFlightBlocks(flights) {
  if (!flights || flights.length === 0) return '';

  return flights.map(flight => {
    const route = flight.route;
    const time = flight.departureTime.substring(0, 5); // HH:MM

    // Daily view: position horizontally to span across hours
    const [hours, minutes] = time.split(':').map(Number);

    // Calculate minute offset within the starting hour (0-60)
    const minuteOffsetPercent = (minutes / 60) * 100;
    const leftPercent = minuteOffsetPercent;

    // Calculate total duration
    const oneWayFlightMinutes = route.estimatedFlightTime;
    const turnaroundMinutes = route.turnaroundTime || 45;
    const totalDurationMinutes = (oneWayFlightMinutes * 2) + turnaroundMinutes;

    // Convert duration to a percentage across multiple hour cells
    const durationHours = totalDurationMinutes / 60;

    // Width as percentage: span across cells (each cell is 100% of its width)
    const widthPercent = (durationHours * 100) - minuteOffsetPercent;

    return `
      <div
        class="flight-block"
        style="
          position: absolute;
          top: 0;
          left: ${leftPercent}%;
          width: calc(${widthPercent}% + ${Math.floor(widthPercent / 100)}*80px);
          height: 100%;
          min-height: 20px;
          background: var(--accent-color);
          border-radius: 3px;
          color: white;
          font-size: 0.7rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 0.25rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          cursor: pointer;
          z-index: 1;
        "
        onclick="viewFlightDetails('${flight.id}')"
        title="${route.routeNumber} / ${route.returnRouteNumber} - ${route.departureAirport.icaoCode} → ${route.arrivalAirport.icaoCode} @ ${time}"
      >
        ${time} ${route.routeNumber}
      </div>
    `;
  }).join('');
}

// View flight details
function viewFlightDetails(flightId) {
  const flight = scheduledFlights.find(f => f.id === flightId);
  if (!flight) return;

  const route = flight.route;
  const aircraft = flight.aircraft;

  if (confirm(`Flight Details:\n\nRoute: ${route.routeNumber} / ${route.returnRouteNumber}\nAircraft: ${aircraft.registration}\nDate: ${flight.scheduledDate}\nTime: ${flight.departureTime.substring(0, 5)}\nRoute: ${route.departureAirport.icaoCode} → ${route.arrivalAirport.icaoCode}\nStatus: ${flight.status}\n\nDelete this flight?`)) {
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

    alert('Flight deleted successfully');
    // Just re-render without fetching
    renderSchedule();
  } catch (error) {
    console.error('Error deleting flight:', error);
    alert(`Error: ${error.message}`);
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
  groupBy = document.getElementById('groupBy').value;

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

  timeColumns.forEach(col => {
    html += `<th style="padding: 0.75rem 0.5rem; text-align: center; color: var(--text-secondary); font-weight: 600; min-width: 80px; border-left: 1px solid var(--border-color);">${col.label}</th>`;
  });

  html += '<th style="padding: 0.75rem 1rem; text-align: center; color: var(--text-secondary); font-weight: 600; min-width: 280px; border-left: 2px solid var(--border-color); position: sticky; right: 0; background: var(--surface-elevated); z-index: 11;">ACTIONS</th>';
  html += '</tr></thead>';

  html += '<tbody>';

  if (groupBy === 'type') {
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
    // No grouping - just list all aircraft
    userFleet.forEach(aircraft => {
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
      fetchScheduledFlights()
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

// Generate a single aircraft row
function generateAircraftRow(aircraft, timeColumns) {
  const aircraftRoutes = getAircraftRoutes(aircraft.id);
  const typeStr = `${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? (aircraft.aircraft.variant.startsWith('-') ? aircraft.aircraft.variant : '-' + aircraft.aircraft.variant) : ''}`;

  let html = '<tr style="border-bottom: 1px solid var(--border-color);">';

  // Aircraft info column (sticky left)
  html += `
    <td style="padding: 1rem; position: sticky; left: 0; background: var(--surface); border-right: 2px solid var(--border-color); z-index: 5;">
      <div style="color: var(--accent-color); font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem; cursor: pointer;" onclick="showAircraftDetails('${aircraft.id}')" title="Click for aircraft details">
        ${aircraft.registration}
      </div>
      <div style="color: var(--text-muted); font-size: 0.85rem;">
        ${typeStr}
      </div>
      ${aircraftRoutes.length > 0 ? `
        <div style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 0.25rem;">
          ${aircraftRoutes.length} route${aircraftRoutes.length !== 1 ? 's' : ''} assigned
        </div>
      ` : ''}
    </td>
  `;

  // Time slot columns
  timeColumns.forEach((col, index) => {
    const borderStyle = index === 0 ? 'border-left: 1px solid var(--border-color);' :
                       (col.hour % 6 === 0) ? 'border-left: 1px solid var(--border-color);' : '';

    const timeValue = col.hour;

    // Get the next occurrence of the selected day of week
    const today = new Date();
    const currentDay = today.getDay();
    const daysUntilTarget = (selectedDayOfWeek - currentDay + 7) % 7;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysUntilTarget);
    const dateStr = targetDate.toISOString().split('T')[0];

    const cellWidth = '80px';

    // Get flights for this aircraft on this date and hour
    const cellFlights = getFlightsForCell(aircraft.id, dateStr, col.hour);

    html += `
      <td
        class="schedule-cell"
        data-aircraft-id="${aircraft.id}"
        data-time="${timeValue}"
        data-date="${dateStr}"
        ondragover="handleDragOver(event)"
        ondragleave="handleDragLeave(event)"
        ondrop="handleDrop(event, '${aircraft.id}', '${timeValue}')"
        style="padding: 0.5rem; text-align: center; background: var(--surface-elevated); ${borderStyle} min-height: 70px; min-width: ${cellWidth}; position: relative; vertical-align: top;"
      >
        ${renderFlightBlocks(cellFlights, 'daily')}
      </td>
    `;
  });

  // Actions column (sticky right)
  html += `
    <td style="padding: 1rem; position: sticky; right: 0; background: var(--surface); border-left: 2px solid var(--border-color); z-index: 5;">
      <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
        <button
          onclick="addRouteToAircraft('${aircraft.id}')"
          class="btn btn-sm btn-primary"
          style="padding: 0.4rem 0.8rem; font-size: 0.85rem;"
        >
          ADD ROUTE
        </button>
        <button
          onclick="scheduleMaintenance('${aircraft.id}')"
          class="btn btn-sm btn-secondary"
          style="padding: 0.4rem 0.8rem; font-size: 0.85rem;"
        >
          MAINTENANCE
        </button>
        <button
          onclick="clearSchedule('${aircraft.id}')"
          class="btn btn-sm btn-danger"
          style="padding: 0.4rem 0.8rem; font-size: 0.85rem;"
        >
          CLEAR
        </button>
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

  // Filter routes assigned to this aircraft or unassigned
  const availableRoutes = routes.filter(r =>
    r.assignedAircraftId === aircraftId || r.assignedAircraftId === null
  );

  if (availableRoutes.length === 0) {
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center;">
        <p style="color: var(--text-muted); font-size: 1.1rem;">NO ROUTES AVAILABLE</p>
        <p style="color: var(--text-secondary); margin-top: 0.5rem;">
          <a href="/routes/create" style="color: var(--accent-color);">Create a route</a> or assign existing routes to this aircraft
        </p>
      </div>
    `;
    return;
  }

  const html = availableRoutes.map(route => `
    <div
      class="route-draggable"
      draggable="true"
      data-route-id="${route.id}"
      style="background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 4px; padding: 0.75rem; margin-bottom: 0.5rem; transition: all 0.2s; font-size: 0.85rem;"
      onmouseover="this.style.background='var(--surface)'"
      onmouseout="this.style.background='var(--surface-elevated)'"
    >
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
        <div style="color: var(--accent-color); font-weight: 600; font-size: 0.9rem;">
          ${route.routeNumber} / ${route.returnRouteNumber}
        </div>
        <div style="color: var(--text-muted); font-size: 0.75rem;">
          ${formatDaysOfWeek(route.daysOfWeek)}
        </div>
      </div>
      <div style="color: var(--text-primary); font-size: 0.8rem; margin-bottom: 0.25rem;">
        ${route.departureAirport.icaoCode} → ${route.arrivalAirport.icaoCode}
      </div>
      <div style="color: var(--text-muted); font-size: 0.75rem;">
        ${Math.round(route.distance)} NM • ${route.turnaroundTime}min
      </div>
    </div>
  `).join('');

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

  console.log('Dragging route:', draggedRoute.routeNumber);

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
function scheduleMaintenance(aircraftId) {
  const aircraft = userFleet.find(a => a.id === aircraftId);
  if (!aircraft) return;

  // TODO: Implement maintenance scheduling
  alert(`Maintenance scheduling for ${aircraft.registration} will be available soon.`);
}

// Action: Clear schedule
async function clearSchedule(aircraftId) {
  const aircraft = userFleet.find(a => a.id === aircraftId);
  if (!aircraft) return;

  const aircraftRoutes = getAircraftRoutes(aircraftId);

  if (aircraftRoutes.length === 0) {
    alert(`${aircraft.registration} has no routes assigned.`);
    return;
  }

  if (!confirm(`Clear schedule for ${aircraft.registration}?\n\nThis will unassign the aircraft from ${aircraftRoutes.length} route(s). The routes will remain but will no longer have an aircraft assigned.\n\nThis action cannot be undone.`)) {
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

    alert(`Schedule cleared for ${aircraft.registration}`);
    await loadSchedule();
  } catch (error) {
    console.error('Error clearing schedule:', error);
    alert(`Error: ${error.message}`);
  }
}

// Handle drag over
function handleDragOver(event) {
  if (!draggedRoute) return;

  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = 'move';

  const cell = event.currentTarget;
  cell.classList.add('drag-over');

  // Update preview with time
  const timeValue = cell.getAttribute('data-time');
  const preview = document.getElementById('dragPreview');

  const hour = parseInt(timeValue);
  const timeStr = `${String(hour).padStart(2, '0')}:00`;
  preview.textContent = `${draggedRoute.routeNumber} / ${draggedRoute.returnRouteNumber} @ ${timeStr}`;
}

// Handle drag leave
function handleDragLeave(event) {
  event.preventDefault();
  const cell = event.currentTarget;

  // Only remove if we're actually leaving this cell
  const rect = cell.getBoundingClientRect();
  const x = event.clientX;
  const y = event.clientY;

  if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
    cell.classList.remove('drag-over');
  }
}

// Handle drop
async function handleDrop(event, aircraftId, timeValue) {
  event.preventDefault();
  event.stopPropagation();

  console.log('Drop event triggered', { aircraftId, timeValue, draggedRoute });

  const cell = event.currentTarget;
  cell.classList.remove('drag-over');

  if (!draggedRoute) {
    console.error('No route being dragged');
    return;
  }

  // Calculate departure time and date
  const hour = parseInt(timeValue);
  const departureTime = `${String(hour).padStart(2, '0')}:00:00`;

  // Get the next occurrence of the selected day of week
  const today = new Date();
  const currentDay = today.getDay();
  const daysUntilTarget = (selectedDayOfWeek - currentDay + 7) % 7;
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntilTarget);
  const scheduleDate = targetDate.toISOString().split('T')[0];

  // Confirm scheduling
  const aircraft = userFleet.find(a => a.id === aircraftId);
  const timeStr = departureTime.substring(0, 5);

  console.log('Confirming schedule:', { aircraft: aircraft?.registration, route: draggedRoute.routeNumber, time: timeStr });

  if (!confirm(`Schedule route ${draggedRoute.routeNumber} / ${draggedRoute.returnRouteNumber} on ${aircraft.registration} at ${timeStr}?`)) {
    draggedRoute = null;
    return;
  }

  try {
    // Call API to schedule the flight
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

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to schedule flight');
    }

    const scheduledFlight = await response.json();
    console.log('Flight scheduled:', scheduledFlight);

    // Add the new flight to the array immediately to avoid full reload
    scheduledFlights.push(scheduledFlight);

    closeAddRouteModal();
    draggedRoute = null;

    // Just re-render without fetching data again
    renderSchedule();
  } catch (error) {
    console.error('Error scheduling route:', error);
    alert(`Error: ${error.message}`);
  }
}

// Fetch current world time
async function fetchWorldTime() {
  try {
    console.log('Fetching world time...');
    const response = await fetch('/api/world/info');
    if (response.ok) {
      const worldInfo = await response.json();
      worldReferenceTime = new Date(worldInfo.currentTime);
      worldReferenceTimestamp = Date.now();
      worldTimeAcceleration = worldInfo.timeAcceleration || 60;

      console.log('World time:', worldReferenceTime, 'Day of week:', worldReferenceTime.getDay());

      // Set default day of week to current world day (only on first load)
      if (isFirstLoad) {
        selectedDayOfWeek = worldReferenceTime.getDay();

        console.log('First load - setting selected day to:', selectedDayOfWeek);

        const daySelect = document.getElementById('dayOfWeek');
        if (daySelect) {
          daySelect.value = selectedDayOfWeek;
          console.log('Day select updated to:', daySelect.value);
        }

        isFirstLoad = false;
      }
    }
  } catch (error) {
    console.error('Error fetching world time:', error);
  }
}

// Calculate current world time (accelerated)
function getCurrentWorldTime() {
  if (!worldReferenceTime || !worldReferenceTimestamp) return null;

  // Calculate real-world time elapsed since we got the reference
  const realElapsedMs = Date.now() - worldReferenceTimestamp;

  // Calculate game time advancement (accelerated)
  const gameElapsedMs = realElapsedMs * worldTimeAcceleration;

  // Calculate current game time
  return new Date(worldReferenceTime.getTime() + gameElapsedMs);
}

// Update the red timeline position
function updateTimeline() {
  // Remove existing timeline if it exists
  const existingTimeline = document.getElementById('scheduleTimeline');
  if (existingTimeline) {
    existingTimeline.remove();
  }

  const currentTime = getCurrentWorldTime();
  if (!currentTime) return;

  // Only show timeline if we're viewing today
  const currentDay = currentTime.getDay();
  if (currentDay !== selectedDayOfWeek) {
    return; // Don't show timeline if viewing a different day
  }

  const container = document.getElementById('scheduleGrid');
  const table = container.querySelector('table');
  if (!table) return;

  // Calculate position
  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  const dayMinutes = 24 * 60;

  // Calculate position: we have 24 columns after the first (aircraft) column
  // First column (aircraft info) is ~200px
  // Each time column is ~80px
  const firstColumnWidth = 200;
  const columnWidth = 80;
  const position = firstColumnWidth + (totalMinutes / 60) * columnWidth;

  // Create timeline element
  const timeline = document.createElement('div');
  timeline.id = 'scheduleTimeline';
  timeline.style.cssText = `
    position: absolute;
    left: ${position}px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #ff0000;
    z-index: 100;
    pointer-events: none;
  `;

  // Position relative to the table
  table.parentElement.style.position = 'relative';
  table.parentElement.appendChild(timeline);
}

// Start timeline updates
function startTimelineUpdates() {
  // Clear any existing interval
  if (timelineInterval) {
    clearInterval(timelineInterval);
  }

  // Update timeline every 1 second
  timelineInterval = setInterval(() => {
    updateTimeline();
  }, 1000);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('Scheduling page initializing...');

    // Fetch world time first to set the correct default day
    await fetchWorldTime();

    console.log('World time fetched, selected day:', selectedDayOfWeek);

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

    console.log('Scheduling page initialized successfully');
  } catch (error) {
    console.error('Error initializing scheduling page:', error);
  }
});

// Format currency helper
function formatCurrency(amount) {
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
          <h2 style="margin: 0.25rem 0 0 0; color: var(--text-primary); font-size: 1.5rem;">${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? (aircraft.model.endsWith('-') || aircraft.variant.startsWith('-') ? aircraft.variant : '-' + aircraft.variant) : ''}</h2>
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
            <div style="font-size: 1.4rem; font-weight: 700; color: var(--text-primary);">${formatCurrency(parseFloat(userAircraft.totalFlightHours) || 0)}</div>
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
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="color: var(--text-muted);">Range</span><span style="font-weight: 500;">${formatCurrency(aircraft.rangeNm)} nm</span></div>
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="color: var(--text-muted);">Speed</span><span style="font-weight: 500;">${aircraft.cruiseSpeed} kts</span></div>
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="color: var(--text-muted);">Fuel Cap</span><span style="font-weight: 500;">${formatCurrency(aircraft.fuelCapacityLiters)} L</span></div>
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="color: var(--text-muted);">Burn Rate</span><span style="font-weight: 500;">${formatCurrency(fuelBurnPerHour)} L/hr</span></div>
          </div>

          <!-- Col 2: Costs -->
          <div style="background: var(--surface-elevated); border-radius: 6px; padding: 0.75rem;">
            <div style="font-size: 0.8rem; color: var(--warning-color); text-transform: uppercase; font-weight: 600; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.35rem;">Operating Costs</div>
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="color: var(--text-muted);">Fuel/hr</span><span style="font-weight: 500;">$${formatCurrency(fuelCostPerHour)}</span></div>
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="color: var(--text-muted);">Maint/hr</span><span style="font-weight: 500;">$${formatCurrency(maintenanceCostPerHour)}</span></div>
            <div style="display: flex; justify-content: space-between; padding: 0.4rem 0; border-top: 1px solid var(--border-color); margin-top: 0.2rem;"><span style="font-weight: 600;">Total/hr</span><span style="color: var(--warning-color); font-weight: 700; font-size: 1.05rem;">$${formatCurrency(totalHourlyCost)}</span></div>
            <div style="display: flex; justify-content: space-between; padding: 0.3rem 0;"><span style="font-weight: 600;">Monthly</span><span style="color: var(--danger-color); font-weight: 700; font-size: 1.05rem;">$${formatCurrency(totalMonthlyCost)}</span></div>
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
            <span><span style="color: var(--text-muted);">Lease:</span> <strong>${userAircraft.leaseDurationMonths} months</strong> @ <span style="color: var(--warning-color); font-weight: 600;">$${formatCurrency(leaseMonthly)}/mo</span></span>
            <span><span style="color: var(--text-muted);">Ends:</span> <strong>${new Date(userAircraft.leaseEndDate).toLocaleDateString('en-GB')}</strong></span>
          ` : `
            <span><span style="color: var(--text-muted);">Purchased for:</span> <span style="color: var(--success-color); font-weight: 600;">$${formatCurrency(userAircraft.purchasePrice || 0)}</span></span>
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
        routeHtml += `<div style="display: flex; justify-content: space-between; padding: 0.2rem 0;"><span style="color: var(--text-muted);">Total Profit:</span><span style="color: var(--success-color); font-weight: 600;">$${formatCurrency(mp.profit)}</span></div>`;
      }
      if (details.leastProfitable && details.leastProfitable.id !== details.mostProfitable?.id) {
        const lp = details.leastProfitable;
        const lpColor = lp.profit >= 0 ? 'var(--warning-color)' : 'var(--danger-color)';
        routeHtml += `<div style="display: flex; justify-content: space-between; padding: 0.3rem 0; margin-top: 0.3rem; border-top: 1px solid var(--border-color);"><span style="color: ${lpColor}; font-weight: 600;">Worst Route:</span><span style="font-weight: 500;">${lp.origin} - ${lp.destination}</span></div>`;
        routeHtml += `<div style="display: flex; justify-content: space-between; padding: 0.2rem 0;"><span style="color: var(--text-muted);">Total Profit:</span><span style="color: ${lpColor}; font-weight: 600;">$${formatCurrency(lp.profit)}</span></div>`;
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
