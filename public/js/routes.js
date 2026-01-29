let allRoutes = [];

// Format days of week for display
function formatDaysOfWeek(daysArray) {
  if (!daysArray || daysArray.length === 0) return 'No days';
  if (daysArray.length === 7) return 'Daily';

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return daysArray.map(d => dayLabels[d]).join(' ');
}

// Display days of week as visual indicators (M T W T F S S)
function displayDaysOfWeek(daysArray) {
  if (!daysArray || daysArray.length === 0) {
    return '<span style="color: var(--text-muted);">No days</span>';
  }

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // M T W T F S S

  return dayOrder.map(dayIndex => {
    const isActive = daysArray.includes(dayIndex);
    const label = dayLabels[dayIndex];
    const color = isActive ? 'var(--success-color)' : 'var(--border-color)';
    const fontWeight = isActive ? '700' : '400';

    return `<span style="color: ${color}; font-weight: ${fontWeight}; margin: 0 0.15rem;">${label}</span>`;
  }).join('');
}

// Load all routes
async function loadAllRoutes() {
  try {
    const response = await fetch('/api/routes');
    const routes = await response.json();

    if (!response.ok) {
      throw new Error(routes.error || 'Failed to fetch routes');
    }

    allRoutes = routes;
    populateAircraftTypeFilter(routes);
    displayAllRoutes(routes);
  } catch (error) {
    console.error('Error loading routes:', error);
    document.getElementById('routesTable').innerHTML = `
      <div class="empty-message">Error loading routes</div>
    `;
  }
}

// Populate aircraft type filter dropdown
function populateAircraftTypeFilter(routes) {
  const filterSelect = document.getElementById('aircraftTypeFilter');
  if (!filterSelect) return;

  // Extract unique aircraft types from routes
  const aircraftTypes = new Set();
  routes.forEach(route => {
    if (route.assignedAircraft && route.assignedAircraft.aircraft) {
      const aircraft = route.assignedAircraft.aircraft;
      const typeName = `${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? '-' + aircraft.variant : ''}`;
      aircraftTypes.add(typeName);
    }
  });

  // Sort aircraft types alphabetically
  const sortedTypes = Array.from(aircraftTypes).sort();

  // Keep the "All Aircraft Types" option and add the sorted types
  filterSelect.innerHTML = '<option value="">All Aircraft Types</option>' +
    sortedTypes.map(type => `<option value="${type}">${type}</option>`).join('');
}

// Display all routes in a table
function displayAllRoutes(routes) {
  const container = document.getElementById('routesTable');

  if (routes.length === 0) {
    container.innerHTML = `
      <div class="empty-message">
        <p>NO ROUTES CREATED YET</p>
        <p style="font-size: 0.9rem; color: var(--text-muted); margin-top: 0.5rem;">
          Create your first route to start operating flights
        </p>
      </div>
    `;
    return;
  }

  const tableHtml = `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: var(--surface-elevated); border-bottom: 2px solid var(--border-color);">
          <th style="padding: 1rem; text-align: left; color: var(--text-secondary); font-weight: 600;">ROUTE</th>
          <th style="padding: 1rem; text-align: left; color: var(--text-secondary); font-weight: 600; white-space: nowrap;">FROM → TO</th>
          <th style="padding: 1rem; text-align: center; color: var(--text-secondary); font-weight: 600;">OPERATING DAYS</th>
          <th style="padding: 1rem; text-align: center; color: var(--text-secondary); font-weight: 600;">PROFIT</th>
          <th style="padding: 1rem; text-align: center; color: var(--text-secondary); font-weight: 600;">LOAD %</th>
          <th style="padding: 1rem; text-align: center; color: var(--text-secondary); font-weight: 600;">STATUS</th>
          <th style="padding: 1rem; text-align: center; color: var(--text-secondary); font-weight: 600;">ACTIONS</th>
        </tr>
      </thead>
      <tbody>
        ${routes.map(route => {
          const profit = route.profit || 0;
          const profitColor = profit >= 0 ? 'var(--success-color)' : 'var(--warning-color)';
          const statusColor = route.isActive ? 'var(--success-color)' : 'var(--text-muted)';
          const statusText = route.isActive ? 'ACTIVE' : 'INACTIVE';

          return `
            <tr style="border-bottom: 1px solid var(--border-color);">
              <td style="padding: 1rem; color: var(--accent-color); font-weight: 600; white-space: nowrap;">
                ${route.routeNumber}${route.returnRouteNumber ? ' / ' + route.returnRouteNumber : ''}
              </td>
              <td style="padding: 1rem; white-space: nowrap;">
                <div style="color: var(--text-primary);">
                  ${route.techStopAirport
                    ? `${route.departureAirport.icaoCode} → <span style="color: var(--accent-color); font-weight: 600;" title="Technical stop for refuelling">${route.techStopAirport.icaoCode}</span> → ${route.arrivalAirport.icaoCode} → <span style="color: var(--accent-color); font-weight: 600;" title="Technical stop for refuelling">${route.techStopAirport.icaoCode}</span> → ${route.departureAirport.icaoCode}`
                    : `${route.departureAirport.icaoCode} → ${route.arrivalAirport.icaoCode} → ${route.departureAirport.icaoCode}`
                  }
                </div>
              </td>
              <td style="padding: 1rem; text-align: center; color: var(--text-primary); font-size: 0.95rem; white-space: nowrap;">
                ${displayDaysOfWeek(route.daysOfWeek)}
              </td>
              <td style="padding: 1rem; text-align: center; color: ${profitColor}; font-weight: 600; white-space: nowrap;">
                ${profit >= 0 ? '+' : ''}$${Math.round(profit).toLocaleString('en-US')}
              </td>
              <td style="padding: 1rem; text-align: center; color: var(--text-primary); white-space: nowrap;">
                ${route.averageLoadFactor.toFixed(1)}%
              </td>
              <td style="padding: 1rem; text-align: center; white-space: nowrap;">
                <span style="color: ${statusColor}; font-weight: 600; font-size: 0.85rem;">
                  ${statusText}
                </span>
              </td>
              <td style="padding: 1rem; text-align: center; white-space: nowrap;">
                <div style="display: flex; gap: 0.5rem; justify-content: center;">
                  <button onclick="editRoute('${route.id}')" title="Edit Route" style="background: transparent; border: none; color: var(--accent-color); cursor: pointer; padding: 0.4rem 0.8rem; font-size: 1.2rem; line-height: 1; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
                    ✎
                  </button>
                  <button onclick="deleteRoute('${route.id}')" title="Delete Route" style="background: transparent; border: none; color: var(--warning-color); cursor: pointer; padding: 0.4rem 0.8rem; font-size: 1.5rem; line-height: 1; font-weight: 400; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
                    ×
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = tableHtml;
}

// Filter routes based on search input and aircraft type
function filterRoutes() {
  const searchInput = document.getElementById('routeSearchInput');
  const aircraftTypeFilter = document.getElementById('aircraftTypeFilter');

  if (!searchInput || !aircraftTypeFilter) return;

  const searchTerm = searchInput.value.toLowerCase().trim();
  const selectedAircraftType = aircraftTypeFilter.value;

  // Filter routes based on both search term and aircraft type
  let filtered = allRoutes;

  // Apply aircraft type filter
  if (selectedAircraftType !== '') {
    filtered = filtered.filter(route => {
      if (!route.assignedAircraft || !route.assignedAircraft.aircraft) return false;

      const aircraft = route.assignedAircraft.aircraft;
      const typeName = `${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? '-' + aircraft.variant : ''}`;

      return typeName === selectedAircraftType;
    });
  }

  // Apply search term filter
  if (searchTerm !== '') {
    filtered = filtered.filter(route => {
      // Search in flight numbers
      if (route.routeNumber?.toLowerCase().includes(searchTerm)) return true;
      if (route.returnRouteNumber?.toLowerCase().includes(searchTerm)) return true;

      // Search in departure airport
      if (route.departureAirport?.icaoCode?.toLowerCase().includes(searchTerm)) return true;
      if (route.departureAirport?.iataCode?.toLowerCase().includes(searchTerm)) return true;
      if (route.departureAirport?.name?.toLowerCase().includes(searchTerm)) return true;
      if (route.departureAirport?.city?.toLowerCase().includes(searchTerm)) return true;

      // Search in arrival airport
      if (route.arrivalAirport?.icaoCode?.toLowerCase().includes(searchTerm)) return true;
      if (route.arrivalAirport?.iataCode?.toLowerCase().includes(searchTerm)) return true;
      if (route.arrivalAirport?.name?.toLowerCase().includes(searchTerm)) return true;
      if (route.arrivalAirport?.city?.toLowerCase().includes(searchTerm)) return true;

      // Search in tech stop airport (if present)
      if (route.techStopAirport) {
        if (route.techStopAirport?.icaoCode?.toLowerCase().includes(searchTerm)) return true;
        if (route.techStopAirport?.iataCode?.toLowerCase().includes(searchTerm)) return true;
        if (route.techStopAirport?.name?.toLowerCase().includes(searchTerm)) return true;
        if (route.techStopAirport?.city?.toLowerCase().includes(searchTerm)) return true;
      }

      return false;
    });
  }

  displayAllRoutes(filtered);
}

// Create new route - navigate to creation page
function createNewRoute() {
  window.location.href = '/routes/create';
}

// Edit route - navigate to edit page
function editRoute(routeId) {
  window.location.href = `/routes/edit?id=${routeId}`;
}

// Store route to be deleted
let pendingDeleteRoute = null;

// Delete route - show modal
function deleteRoute(routeId) {
  const route = allRoutes.find(r => r.id === routeId);
  if (!route) return;

  pendingDeleteRoute = route;

  // Show modal
  const modal = document.getElementById('deleteModal');
  const message = document.getElementById('deleteModalMessage');
  message.textContent = `Are you sure you want to delete route ${route.routeNumber}${route.returnRouteNumber ? ' / ' + route.returnRouteNumber : ''}? This action cannot be undone.`;
  modal.style.display = 'flex';
}

// Close delete modal
function closeDeleteModal() {
  document.getElementById('deleteModal').style.display = 'none';
  pendingDeleteRoute = null;
}

// Confirm and execute delete
async function confirmDeleteRoute() {
  if (!pendingDeleteRoute) return;

  const route = pendingDeleteRoute;
  const routeNumber = route.routeNumber;

  closeDeleteModal();

  try {
    const response = await fetch(`/api/routes/${route.id}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete route');
    }

    // Reload routes after deletion
    await loadAllRoutes();

    // Show success banner
    showSuccessBanner('deleted', routeNumber);
  } catch (error) {
    console.error('Error deleting route:', error);
    alert(`Error: ${error.message}`);
  }
}

// Show success banner (from URL params or direct call)
function showSuccessBanner(type = null, route = null) {
  // Check URL params if not provided directly
  if (!type || !route) {
    const urlParams = new URLSearchParams(window.location.search);
    type = urlParams.get('success');
    route = urlParams.get('route');
  }

  if (!type || !route) return;

  const container = document.getElementById('successBannerContainer');
  if (!container) return;

  // Clear any existing banners
  container.innerHTML = '';

  const routeNumber = decodeURIComponent(route);
  let message = '';
  let link = '';

  if (type === 'created') {
    message = `✓ Route ${routeNumber} created successfully!`;
    link = `<a href="/scheduling" style="color: var(--success-color); text-decoration: underline; margin-left: 1rem;">Assign it on the scheduling page</a>`;
  } else if (type === 'deleted') {
    message = `✓ Route ${routeNumber} deleted successfully!`;
    link = '';
  }

  const banner = document.createElement('div');
  banner.style.cssText = `
    background: rgba(34, 197, 94, 0.1);
    border: 1px solid var(--success-color);
    border-radius: 4px;
    color: var(--success-color);
    padding: 1rem 1.5rem;
    margin-bottom: 2rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;
  banner.innerHTML = `
    <div>
      <span style="font-weight: 600;">${message}</span>
      ${link}
    </div>
    <button onclick="this.parentElement.remove()" style="background: none; border: none; color: var(--success-color); font-size: 1.5rem; cursor: pointer; padding: 0 0.5rem; line-height: 1;">×</button>
  `;
  container.appendChild(banner);

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    if (banner.parentElement) {
      banner.remove();
    }
  }, 10000);

  // Clean up URL if it came from URL params
  if (window.location.search) {
    window.history.replaceState({}, '', '/routes');
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  showSuccessBanner();
  loadAllRoutes();
});
