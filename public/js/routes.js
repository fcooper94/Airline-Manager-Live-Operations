let allRoutes = [];

// Format days of week for display
function formatDaysOfWeek(daysArray) {
  if (!daysArray || daysArray.length === 0) return 'No days';
  if (daysArray.length === 7) return 'Daily';

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return daysArray.map(d => dayLabels[d]).join(' ');
}

// Load route performance summary
async function loadRouteSummary() {
  try {
    const response = await fetch('/api/routes/summary');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch route summary');
    }

    // Update total routes badge
    const totalRoutesBadge = document.getElementById('totalRoutesBadge');
    if (totalRoutesBadge) {
      const activeText = data.totalActiveRoutes !== data.totalRoutes
        ? `${data.totalActiveRoutes} ACTIVE / ${data.totalRoutes} TOTAL`
        : `${data.totalRoutes} ROUTES`;
      totalRoutesBadge.textContent = activeText;
    }

    // Display best performing routes
    displayBestRoutes(data.bestRoutes);

    // Display worst performing routes
    displayWorstRoutes(data.worstRoutes);
  } catch (error) {
    console.error('Error loading route summary:', error);
    document.getElementById('bestRoutesContainer').innerHTML = `
      <div class="empty-message">Error loading performance data</div>
    `;
    document.getElementById('worstRoutesContainer').innerHTML = `
      <div class="empty-message">Error loading performance data</div>
    `;
  }
}

// Display best performing routes
function displayBestRoutes(routes) {
  const container = document.getElementById('bestRoutesContainer');

  if (!routes || routes.length === 0) {
    container.innerHTML = `
      <div class="empty-message">No routes with flight history yet</div>
    `;
    return;
  }

  const html = routes.map((route, index) => `
    <div style="background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <div>
          <span style="color: var(--accent-color); font-weight: 600; font-size: 1.1rem;">#${index + 1}</span>
          <span style="color: var(--text-primary); font-weight: 600; margin-left: 0.5rem;">${route.routeNumber}${route.returnRouteNumber ? ' / ' + route.returnRouteNumber : ''}</span>
        </div>
        <div style="color: var(--success-color); font-weight: 600; font-size: 1.1rem;">
          +$${Math.round(route.profit).toLocaleString('en-US')}
        </div>
      </div>
      <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.5rem;">
        ${route.departureAirport.icaoCode} → ${route.arrivalAirport.icaoCode} → ${route.departureAirport.icaoCode}
      </div>
      <div style="display: flex; gap: 1.5rem; font-size: 0.85rem;">
        <div>
          <span style="color: var(--text-muted);">Flights:</span>
          <span style="color: var(--text-primary); font-weight: 600;">${route.totalFlights}</span>
        </div>
        <div>
          <span style="color: var(--text-muted);">Margin:</span>
          <span style="color: var(--text-primary); font-weight: 600;">${route.profitMargin.toFixed(1)}%</span>
        </div>
        <div>
          <span style="color: var(--text-muted);">Load:</span>
          <span style="color: var(--text-primary); font-weight: 600;">${route.averageLoadFactor.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  `).join('');

  container.innerHTML = html;
}

// Display worst performing routes
function displayWorstRoutes(routes) {
  const container = document.getElementById('worstRoutesContainer');

  if (!routes || routes.length === 0) {
    container.innerHTML = `
      <div class="empty-message">No routes with flight history yet</div>
    `;
    return;
  }

  const html = routes.map((route, index) => `
    <div style="background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <div>
          <span style="color: var(--text-muted); font-weight: 600; font-size: 1.1rem;">#${index + 1}</span>
          <span style="color: var(--text-primary); font-weight: 600; margin-left: 0.5rem;">${route.routeNumber}${route.returnRouteNumber ? ' / ' + route.returnRouteNumber : ''}</span>
        </div>
        <div style="color: var(--warning-color); font-weight: 600; font-size: 1.1rem;">
          ${route.profit >= 0 ? '+' : ''}$${Math.round(route.profit).toLocaleString('en-US')}
        </div>
      </div>
      <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.5rem;">
        ${route.departureAirport.icaoCode} → ${route.arrivalAirport.icaoCode} → ${route.departureAirport.icaoCode}
      </div>
      <div style="display: flex; gap: 1.5rem; font-size: 0.85rem;">
        <div>
          <span style="color: var(--text-muted);">Flights:</span>
          <span style="color: var(--text-primary); font-weight: 600;">${route.totalFlights}</span>
        </div>
        <div>
          <span style="color: var(--text-muted);">Margin:</span>
          <span style="color: var(--text-primary); font-weight: 600;">${route.profitMargin.toFixed(1)}%</span>
        </div>
        <div>
          <span style="color: var(--text-muted);">Load:</span>
          <span style="color: var(--text-primary); font-weight: 600;">${route.averageLoadFactor.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  `).join('');

  container.innerHTML = html;
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
    displayAllRoutes(routes);
  } catch (error) {
    console.error('Error loading routes:', error);
    document.getElementById('routesTable').innerHTML = `
      <div class="empty-message">Error loading routes</div>
    `;
  }
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
          <th style="padding: 1rem; text-align: left; color: var(--text-secondary); font-weight: 600;">FROM → TO</th>
          <th style="padding: 1rem; text-align: left; color: var(--text-secondary); font-weight: 600;">AIRCRAFT</th>
          <th style="padding: 1rem; text-align: center; color: var(--text-secondary); font-weight: 600;">DISTANCE</th>
          <th style="padding: 1rem; text-align: center; color: var(--text-secondary); font-weight: 600;">PRICE</th>
          <th style="padding: 1rem; text-align: center; color: var(--text-secondary); font-weight: 600;">FLIGHTS</th>
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

          const aircraftText = route.assignedAircraft
            ? `${route.assignedAircraft.registration}`
            : '<span style="color: var(--text-muted);">Not assigned</span>';

          return `
            <tr style="border-bottom: 1px solid var(--border-color);">
              <td style="padding: 1rem; color: var(--accent-color); font-weight: 600;">
                ${route.routeNumber}${route.returnRouteNumber ? ' / ' + route.returnRouteNumber : ''}
              </td>
              <td style="padding: 1rem;">
                <div style="color: var(--text-primary);">${route.departureAirport.icaoCode} → ${route.arrivalAirport.icaoCode} → ${route.departureAirport.icaoCode}</div>
                <div style="color: var(--text-muted); font-size: 0.85rem;">${route.departureAirport.city} → ${route.arrivalAirport.city} → ${route.departureAirport.city}</div>
              </td>
              <td style="padding: 1rem; color: var(--text-primary);">
                <div>${aircraftText}</div>
                <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 0.25rem;">${formatDaysOfWeek(route.daysOfWeek)}</div>
              </td>
              <td style="padding: 1rem; text-align: center; color: var(--text-primary);">
                ${Math.round(route.distance)} NM
              </td>
              <td style="padding: 1rem; text-align: center; color: var(--text-primary);">
                $${Math.round(route.ticketPrice).toLocaleString('en-US')}
              </td>
              <td style="padding: 1rem; text-align: center; color: var(--text-primary);">
                ${route.totalFlights}
              </td>
              <td style="padding: 1rem; text-align: center; color: ${profitColor}; font-weight: 600;">
                ${profit >= 0 ? '+' : ''}$${Math.round(profit).toLocaleString('en-US')}
              </td>
              <td style="padding: 1rem; text-align: center; color: var(--text-primary);">
                ${route.averageLoadFactor.toFixed(1)}%
              </td>
              <td style="padding: 1rem; text-align: center;">
                <span style="color: ${statusColor}; font-weight: 600; font-size: 0.85rem;">
                  ${statusText}
                </span>
              </td>
              <td style="padding: 1rem; text-align: center;">
                <div style="display: flex; gap: 0.5rem; justify-content: center;">
                  <button class="btn btn-sm btn-secondary" onclick="editRoute('${route.id}')" title="Edit Route">
                    EDIT
                  </button>
                  <button class="btn btn-sm btn-danger" onclick="deleteRoute('${route.id}')" title="Delete Route">
                    DELETE
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

// Create new route - navigate to creation page
function createNewRoute() {
  window.location.href = '/routes/create';
}

// Edit route - navigate to edit page
function editRoute(routeId) {
  window.location.href = `/routes/edit?id=${routeId}`;
}

// Delete route
async function deleteRoute(routeId) {
  const route = allRoutes.find(r => r.id === routeId);
  if (!route) return;

  if (!confirm(`Are you sure you want to delete route ${route.routeNumber}?\n\nThis action cannot be undone.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/routes/${routeId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete route');
    }

    // Reload routes after deletion
    await loadAllRoutes();
    await loadRouteSummary();

    alert(`Route ${route.routeNumber} deleted successfully`);
  } catch (error) {
    console.error('Error deleting route:', error);
    alert(`Error: ${error.message}`);
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadRouteSummary();
  loadAllRoutes();
});
