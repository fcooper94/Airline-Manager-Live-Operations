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
      const typeName = `${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? (aircraft.variant.startsWith('-') ? aircraft.variant : '-' + aircraft.variant) : ''}`;
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
      const typeName = `${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? (aircraft.variant.startsWith('-') ? aircraft.variant : '-' + aircraft.variant) : ''}`;
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

    const typeKey = `${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? (aircraft.variant.startsWith('-') ? aircraft.variant : '-' + aircraft.variant) : ''}`;
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
async function showAircraftDetails(userAircraftId) {
  const userAircraft = fleetData.find(a => a.id === userAircraftId);
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
