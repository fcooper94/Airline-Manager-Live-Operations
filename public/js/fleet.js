let fleetData = [];
let filteredFleet = [];

// Load fleet data
async function loadFleet() {
  try {
    const response = await fetch('/api/fleet');
    const fleet = await response.json();

    if (!response.ok) {
      throw new Error(fleet.error || 'Failed to load fleet');
    }

    fleetData = fleet;
    filteredFleet = fleet;
    populateTypeFilter();
    updateAircraftCount();
    displayFleet();
  } catch (error) {
    console.error('Error loading fleet:', error);
    document.getElementById('fleetGrid').innerHTML = `
      <div class="empty-message" style="color: var(--warning-color);">Error loading fleet data</div>
    `;
  }
}

// Populate type filter dropdown
function populateTypeFilter() {
  const typeFilter = document.getElementById('typeFilter');
  const types = new Set();

  fleetData.forEach(userAircraft => {
    const aircraft = userAircraft.aircraft;
    if (aircraft) {
      const typeName = `${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? '-' + aircraft.variant : ''}`;
      types.add(typeName);
    }
  });

  const sortedTypes = Array.from(types).sort();
  typeFilter.innerHTML = '<option value="">All Types</option>' +
    sortedTypes.map(type => `<option value="${type}">${type}</option>`).join('');
}

// Filter fleet based on current filter values
function filterFleet() {
  const searchTerm = document.getElementById('searchFilter').value.toLowerCase();
  const typeFilter = document.getElementById('typeFilter').value;
  const statusFilter = document.getElementById('statusFilter').value;

  filteredFleet = fleetData.filter(userAircraft => {
    const aircraft = userAircraft.aircraft;
    if (!aircraft) return false;

    // Search filter (registration)
    if (searchTerm && !userAircraft.registration?.toLowerCase().includes(searchTerm)) {
      return false;
    }

    // Type filter
    if (typeFilter) {
      const typeName = `${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? '-' + aircraft.variant : ''}`;
      if (typeName !== typeFilter) return false;
    }

    // Status filter (owned/leased)
    if (statusFilter) {
      const isOwned = userAircraft.acquisitionType === 'purchase';
      if (statusFilter === 'owned' && !isOwned) return false;
      if (statusFilter === 'leased' && isOwned) return false;
    }

    return true;
  });

  updateAircraftCount();
  displayFleet();
}

// Update aircraft count display
function updateAircraftCount() {
  document.getElementById('aircraftCount').textContent = filteredFleet.length;
}

// Get condition class based on percentage
function getConditionClass(conditionPercent) {
  if (conditionPercent >= 90) return 'cond-excellent';
  if (conditionPercent >= 70) return 'cond-good';
  if (conditionPercent >= 50) return 'cond-fair';
  return 'cond-poor';
}

// Display fleet
function displayFleet() {
  const grid = document.getElementById('fleetGrid');

  if (filteredFleet.length === 0) {
    grid.innerHTML = `
      <div class="table-empty" style="padding: 3rem; text-align: center;">
        <div class="empty-message" style="color: var(--text-muted);">NO AIRCRAFT FOUND</div>
        ${fleetData.length === 0 ? `
          <div style="margin-top: 1rem;">
            <button class="btn btn-primary" onclick="window.location.href='/aircraft-marketplace'">ADD AIRCRAFT</button>
          </div>
        ` : ''}
      </div>
    `;
    return;
  }

  // Group aircraft by type (manufacturer + model + variant)
  const groupedAircraft = {};
  filteredFleet.forEach(userAircraft => {
    const aircraft = userAircraft.aircraft;
    if (!aircraft) return;

    const typeKey = `${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? '-' + aircraft.variant : ''}`;
    if (!groupedAircraft[typeKey]) {
      groupedAircraft[typeKey] = [];
    }
    groupedAircraft[typeKey].push(userAircraft);
  });

  // Generate HTML - wrap in 2-column grid
  let html = '<div class="fleet-grid-wrapper">';
  const sortedTypes = Object.keys(groupedAircraft).sort();

  sortedTypes.forEach((typeKey) => {
    const aircraftList = groupedAircraft[typeKey];
    const count = aircraftList.length;

    // Start type group container
    html += `<div class="fleet-type-group">`;

    // Type header
    html += `
      <div class="fleet-type-header">
        <h3>${typeKey} <span>(${count})</span></h3>
      </div>
    `;

    // Column headers
    html += `
      <div class="fleet-header">
        <span>REG</span>
        <span>PROFIT</span>
        <span>ACQN</span>
        <span>COND</span>
        <span>LOC</span>
        <span></span>
      </div>
    `;

    // Aircraft rows
    aircraftList.forEach(userAircraft => {
      const isOwned = userAircraft.acquisitionType === 'purchase';
      const conditionPercent = userAircraft.conditionPercentage || 100;
      const profit = userAircraft.profit || 0;
      const profitDisplay = profit !== 0 ? (profit > 0 ? '+' : '') + '$' + formatCurrency(Math.abs(profit)) : '$0';
      const profitColor = profit >= 0 ? 'var(--success-color)' : 'var(--warning-color)';

      html += `
        <div class="fleet-row" onclick="showAircraftDetails('${userAircraft.id}')">
          <div class="fleet-cell fleet-reg">${userAircraft.registration || 'N/A'}</div>
          <div class="fleet-cell" style="color: ${profitColor}; font-weight: 600;">${profitDisplay}</div>
          <div class="fleet-cell">
            <span class="status-badge ${isOwned ? 'status-owned' : 'status-leased'}">${isOwned ? 'Own' : 'Lse'}</span>
          </div>
          <div class="fleet-cell">
            <span class="status-badge ${getConditionClass(conditionPercent)}">${conditionPercent}%</span>
          </div>
          <div class="fleet-cell" style="color: var(--text-primary);">${userAircraft.currentAirport || 'N/A'}</div>
          <div class="fleet-cell">
            <button class="btn btn-primary" style="padding: 0.2rem 0.4rem; font-size: 0.65rem;" onclick="event.stopPropagation(); showAircraftDetails('${userAircraft.id}')">VIEW</button>
          </div>
        </div>
      `;
    });

    // Close type group container
    html += `</div>`;
  });

  html += '</div>';
  grid.innerHTML = html;
}

// Show aircraft details
function showAircraftDetails(userAircraftId) {
  const userAircraft = fleetData.find(a => a.id === userAircraftId);
  if (!userAircraft || !userAircraft.aircraft) return;

  const aircraft = userAircraft.aircraft;
  const acquisitionType = userAircraft.acquisitionType === 'purchase' ? 'Owned' : 'Leased';
  const conditionPercent = userAircraft.conditionPercentage || 100;
  const ageDisplay = userAircraft.ageYears !== undefined ? `${userAircraft.ageYears} years` : 'New';

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'aircraftDetailOverlay';
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

  overlay.innerHTML = `
    <div style="background: var(--surface); border: 1px solid var(--border-color); border-radius: 8px; padding: 2rem; width: 90%; max-width: 800px; max-height: 90vh; overflow-y: auto;">
      <h2 style="margin-bottom: 1.5rem; color: var(--text-primary);">${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? '-' + aircraft.variant : ''}</h2>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 2rem; margin-bottom: 2rem;">
        <div>
          <h3 style="margin-bottom: 1rem; color: var(--accent-color); font-size: 1rem;">AIRCRAFT DETAILS</h3>
          <div class="info-row"><span class="info-label">Registration:</span> <strong>${userAircraft.registration}</strong></div>
          <div class="info-row"><span class="info-label">Type:</span> ${aircraft.type}</div>
          <div class="info-row"><span class="info-label">Acquisition:</span> <strong>${acquisitionType}</strong></div>
          <div class="info-row"><span class="info-label">Age:</span> ${ageDisplay}</div>
          <div class="info-row"><span class="info-label">Condition:</span> <strong>${conditionPercent}%</strong></div>
          <div class="info-row"><span class="info-label">Status:</span> <strong>${userAircraft.status || 'active'}</strong></div>
          <div class="info-row"><span class="info-label">Location:</span> ${userAircraft.currentAirport || 'N/A'}</div>
        </div>

        <div>
          <h3 style="margin-bottom: 1rem; color: var(--accent-color); font-size: 1rem;">SPECIFICATIONS</h3>
          <div class="info-row"><span class="info-label">Capacity:</span> ${aircraft.passengerCapacity || 'N/A'} passengers</div>
          <div class="info-row"><span class="info-label">Range:</span> ${aircraft.rangeNm || 'N/A'} nm</div>
          <div class="info-row"><span class="info-label">Cruise Speed:</span> ${aircraft.cruiseSpeed || 'N/A'} kts</div>
          <div class="info-row"><span class="info-label">Fuel Capacity:</span> ${aircraft.fuelCapacityLiters || 'N/A'} L</div>
          <div class="info-row"><span class="info-label">Fuel Burn/Hour:</span> ${userAircraft.fuelBurnPerHour || 'N/A'} L/hr</div>
          <div class="info-row"><span class="info-label">Maintenance/Hour:</span> $${formatCurrency(userAircraft.maintenanceCostPerHour || 0)}/hr</div>
        </div>
      </div>

      <div style="padding: 1.5rem; background: var(--surface-elevated); border-radius: 4px; margin-bottom: 2rem;">
        <h3 style="margin: 0 0 1rem 0; color: var(--accent-color); font-size: 1rem;">FINANCIAL DETAILS</h3>
        ${userAircraft.acquisitionType === 'purchase' ? `
          <div class="info-row"><span class="info-label">Purchase Price:</span> <strong style="color: var(--success-color);">$${formatCurrency(userAircraft.purchasePrice || 0)}</strong></div>
          <div class="info-row"><span class="info-label">Acquired On:</span> ${new Date(userAircraft.acquiredAt).toLocaleDateString('en-GB')}</div>
        ` : `
          <div class="info-row"><span class="info-label">Monthly Payment:</span> <strong style="color: var(--accent-color);">$${formatCurrency(userAircraft.leaseMonthlyPayment || 0)}/mo</strong></div>
          <div class="info-row"><span class="info-label">Lease Duration:</span> ${userAircraft.leaseDurationMonths || 0} months</div>
          <div class="info-row"><span class="info-label">Lease Start:</span> ${new Date(userAircraft.leaseStartDate).toLocaleDateString('en-GB')}</div>
          <div class="info-row"><span class="info-label">Lease End:</span> ${new Date(userAircraft.leaseEndDate).toLocaleDateString('en-GB')}</div>
        `}
      </div>

      <button id="closeDetailBtn" class="btn btn-secondary" style="width: 100%;">Close</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close on button click
  document.getElementById('closeDetailBtn').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });

  // Close on Escape key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      document.body.removeChild(overlay);
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

// Format currency
function formatCurrency(amount) {
  const numAmount = Number(amount) || 0;
  return numAmount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadFleet();
});
