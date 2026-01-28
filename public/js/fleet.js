let fleetData = [];

// Load fleet data
async function loadFleet() {
  try {
    const response = await fetch('/api/fleet');
    const fleet = await response.json();

    if (!response.ok) {
      throw new Error(fleet.error || 'Failed to load fleet');
    }

    fleetData = fleet;
    updateFleetStats();
    displayFleet();
  } catch (error) {
    console.error('Error loading fleet:', error);
    document.getElementById('fleetGrid').innerHTML = `
      <div class="empty-message" style="color: var(--warning-color);">Error loading fleet data</div>
    `;
  }
}

// Update fleet statistics
function updateFleetStats() {
  const totalAircraft = fleetData.length;
  const ownedAircraft = fleetData.filter(a => a.acquisitionType === 'purchase').length;
  const leasedAircraft = fleetData.filter(a => a.acquisitionType === 'lease').length;
  // Only count purchase price for owned aircraft
  const totalValue = fleetData
    .filter(a => a.acquisitionType === 'purchase')
    .reduce((sum, a) => sum + Number(a.purchasePrice || 0), 0);

  // Update elements if they exist (fleet overview section may be removed)
  const totalAircraftEl = document.getElementById('totalAircraftCount');
  const ownedAircraftEl = document.getElementById('ownedAircraftCount');
  const leasedAircraftEl = document.getElementById('leasedAircraftCount');
  const totalFleetValueEl = document.getElementById('totalFleetValue');
  const fleetCountBadgeEl = document.getElementById('fleetCountBadge');

  if (totalAircraftEl) totalAircraftEl.textContent = totalAircraft;
  if (ownedAircraftEl) ownedAircraftEl.textContent = ownedAircraft;
  if (leasedAircraftEl) leasedAircraftEl.textContent = leasedAircraft;
  if (totalFleetValueEl) totalFleetValueEl.textContent = `$${formatCurrency(totalValue)}`;
  if (fleetCountBadgeEl) fleetCountBadgeEl.textContent = `${totalAircraft} AIRCRAFT`;
}

// Display fleet
function displayFleet() {
  const grid = document.getElementById('fleetGrid');

  if (fleetData.length === 0) {
    grid.innerHTML = `
      <div class="table-empty">
        <div class="empty-message">NO AIRCRAFT IN FLEET</div>
        <div class="empty-action">
          <button class="btn btn-action" onclick="window.location.href='/aircraft-marketplace'">ADD AIRCRAFT</button>
        </div>
      </div>
    `;
    return;
  }

  // Group aircraft by manufacturer and model
  const groupedAircraft = {};
  fleetData.forEach(userAircraft => {
    const aircraft = userAircraft.aircraft;
    if (!aircraft) return;

    if (!groupedAircraft[aircraft.manufacturer]) {
      groupedAircraft[aircraft.manufacturer] = {};
    }

    const modelKey = `${aircraft.model}${aircraft.variant ? '-' + aircraft.variant : ''}`;
    if (!groupedAircraft[aircraft.manufacturer][modelKey]) {
      groupedAircraft[aircraft.manufacturer][modelKey] = [];
    }

    groupedAircraft[aircraft.manufacturer][modelKey].push(userAircraft);
  });

  // Generate HTML for fleet table
  let tableRows = '';
  for (const [manufacturer, models] of Object.entries(groupedAircraft)) {
    // Add manufacturer header
    tableRows += `
      <tr style="background: var(--surface-elevated);">
        <td colspan="6" style="padding: 0.75rem 1rem 0.5rem; font-weight: bold; color: var(--accent-color); border-top: 2px solid var(--border-color); font-size: 0.9rem;">
          ${manufacturer}
        </td>
      </tr>
    `;

    // Add each model group
    for (const [model, aircraftList] of Object.entries(models)) {
      // Add model subheader
      tableRows += `
        <tr style="background: var(--surface);">
          <td colspan="6" style="padding: 0.6rem 2rem; font-weight: 600; color: var(--text-primary); border-left: 3px solid var(--accent-color); font-size: 0.85rem;">
            ${model}
          </td>
        </tr>
        <tr style="background: var(--surface); border-bottom: 1px solid var(--border-color);">
          <th style="padding: 0.5rem 0.75rem; text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">REG</th>
          <th style="padding: 0.5rem 0.75rem; text-align: center; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">PROFIT</th>
          <th style="padding: 0.5rem 0.75rem; text-align: center; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">ACQN</th>
          <th style="padding: 0.5rem 0.75rem; text-align: center; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">COND</th>
          <th style="padding: 0.5rem 0.75rem; text-align: center; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">LOCATION</th>
          <th style="padding: 0.5rem 0.75rem; text-align: center; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted);">ACTION</th>
        </tr>
      `;

      // Add aircraft rows
      tableRows += aircraftList.map(userAircraft => {
        const aircraft = userAircraft.aircraft;
        const acquisitionType = userAircraft.acquisitionType === 'purchase' ? 'Owned' : 'Leased';
        const acquisitionColor = userAircraft.acquisitionType === 'purchase' ? 'var(--success-color)' : 'var(--accent-color)';
        const conditionPercent = userAircraft.conditionPercentage || 100;
        const profit = userAircraft.profit || 0;
        const profitColor = profit >= 0 ? 'var(--success-color)' : 'var(--warning-color)';

        return `
          <tr style="border-bottom: 1px solid var(--border-color); cursor: pointer;" onclick="showAircraftDetails('${userAircraft.id}')">
            <td style="padding: 0.5rem 0.75rem;">
              <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9rem;">${userAircraft.registration || 'N/A'}</div>
            </td>
            <td style="padding: 0.5rem 0.75rem; text-align: center; font-weight: 600; color: ${profitColor}; font-size: 0.85rem;">
              ${profit !== 0 ? (profit > 0 ? '+' : '') + '$' + formatCurrency(Math.abs(profit)) : '$0'}
            </td>
            <td style="padding: 0.5rem 0.75rem; text-align: center;">
              <span style="padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.7rem; background: ${acquisitionColor}; color: white;">${acquisitionType}</span>
            </td>
            <td style="padding: 0.5rem 0.75rem; text-align: center;">
              <span style="padding: 0.2rem 0.4rem; border-radius: 3px; font-size: 0.75rem; display: inline-block; min-width: 50px; text-align: center; ${
                conditionPercent >= 90 ? 'background: var(--success-color); color: white;' :
                conditionPercent >= 70 ? 'background: #10b981; color: white;' :
                conditionPercent >= 50 ? 'background: #60a5fa; color: white;' :
                'background: var(--warning-color); color: white;'
              }">${conditionPercent}%</span>
            </td>
            <td style="padding: 0.5rem 0.75rem; text-align: center; color: var(--text-primary); font-size: 0.85rem;">${userAircraft.currentAirport || 'N/A'}</td>
            <td style="padding: 0.5rem 0.75rem; text-align: center;">
              <button class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.75rem;" onclick="event.stopPropagation(); showAircraftDetails('${userAircraft.id}')">Details</button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  grid.innerHTML = `
    <table style="width: 100%; border-collapse: collapse;">
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;
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

  document.getElementById('closeDetailBtn').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
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
