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
    const typeKey = `${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? '-' + aircraft.aircraft.variant : ''}`;

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
  const typeStr = `${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? '-' + aircraft.aircraft.variant : ''}`;

  let html = '<tr style="border-bottom: 1px solid var(--border-color);">';

  // Aircraft info column (sticky left)
  html += `
    <td style="padding: 1rem; position: sticky; left: 0; background: var(--surface); border-right: 2px solid var(--border-color); z-index: 5;">
      <div style="color: var(--accent-color); font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">
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
