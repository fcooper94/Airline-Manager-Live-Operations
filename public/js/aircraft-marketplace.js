let allAircraft = [];
let currentCategory = '';
let selectedAircraft = null;
let registrationPrefix = 'N-'; // Default prefix, will be updated from world info
let baseCountry = null;

// Fetch world info to get registration prefix
async function fetchRegistrationPrefix() {
  try {
    const response = await fetch('/api/world/info');
    if (response.ok) {
      const worldInfo = await response.json();
      if (worldInfo.baseAirport && worldInfo.baseAirport.country) {
        baseCountry = worldInfo.baseAirport.country;
        registrationPrefix = getRegistrationPrefix(baseCountry);
      }
    }
  } catch (error) {
    console.error('Error fetching world info for registration prefix:', error);
    // Keep default prefix
  }
}

// Load aircraft based on category
async function loadAircraft() {
  try {
    // Get category from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    currentCategory = urlParams.get('category') || 'used';

    // Update page title and subtitle based on category
    const titleElement = document.getElementById('marketplaceTitle');
    const subtitleElement = document.getElementById('marketplaceSubtitle');

    if (currentCategory === 'new') {
      titleElement.textContent = 'NEW AIRCRAFT FROM MANUFACTURER';
      subtitleElement.textContent = 'PURCHASE BRAND NEW AIRCRAFT';
    } else {
      titleElement.textContent = 'USED AIRCRAFT MARKET';
      subtitleElement.textContent = 'BROWSE PREVIOUSLY OWNED AIRCRAFT';
    }

    // Fetch aircraft from API based on category
    const response = await fetch(`/api/aircraft?category=${currentCategory}`);
    const aircraft = await response.json();

    if (!response.ok) {
      throw new Error(aircraft.error || 'Failed to fetch aircraft');
    }

    allAircraft = aircraft;
    displayAircraft(allAircraft);
    updateActiveTab(); // Update the active tab after loading
  } catch (error) {
    console.error('Error loading aircraft:', error);
    document.getElementById('aircraftGrid').innerHTML = `
      <div class="empty-message">Error loading aircraft inventory</div>
    `;
  }
}

// Display aircraft in list format
function displayAircraft(aircraftArray) {
  const grid = document.getElementById('aircraftGrid');

  if (aircraftArray.length === 0) {
    grid.innerHTML = `
      <div class="empty-message">No aircraft found matching your criteria</div>
    `;
    return;
  }

  // Group aircraft by manufacturer first, then by model within each manufacturer
  const groupedAircraft = {};
  aircraftArray.forEach(aircraft => {
    if (!groupedAircraft[aircraft.manufacturer]) {
      groupedAircraft[aircraft.manufacturer] = {};
    }

    if (!groupedAircraft[aircraft.manufacturer][aircraft.model]) {
      groupedAircraft[aircraft.manufacturer][aircraft.model] = [];
    }

    groupedAircraft[aircraft.manufacturer][aircraft.model].push(aircraft);
  });

  // Convert condition to percentage
  function conditionToPercentage(condition) {
    switch(condition) {
      case 'New': return 100;
      case 'Excellent': return 90;
      case 'Very Good': return 80;
      case 'Good': return 70;
      case 'Fair': return 60;
      case 'Poor': return 40;
      default: return 50; // default value
    }
  }

  // Generate HTML for each manufacturer and model group
  let tableRows = '';
  for (const [manufacturer, models] of Object.entries(groupedAircraft)) {
    // Add manufacturer header
    tableRows += `
      <tr style="background: var(--surface-elevated);">
        <td colspan="9" style="padding: 1rem 1rem 0.5rem; font-weight: bold; color: var(--accent-color); border-top: 2px solid var(--border-color);">
          ${manufacturer}
        </td>
      </tr>
    `;

    // Add each model as a subcategory under the manufacturer
    for (const [model, aircraftList] of Object.entries(models)) {
      // Add model subheader
      tableRows += `
        <tr style="background: var(--surface);">
          <td colspan="9" style="padding: 0.75rem 2rem; font-weight: 600; color: var(--text-primary); border-left: 3px solid var(--accent-color);">
            ${model}
          </td>
        </tr>
        <tr style="background: var(--surface); border-bottom: 1px solid var(--border-color);">
          <th style="padding: 0.75rem 1rem; text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">MODEL</th>
          <th style="padding: 0.75rem 1rem; text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">TYPE</th>
          <th style="padding: 0.75rem 1rem; text-align: center; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">CAPACITY</th>
          <th style="padding: 0.75rem 1rem; text-align: center; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">RANGE</th>
          <th style="padding: 0.75rem 1rem; text-align: center; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">AGE</th>
          <th style="padding: 0.75rem 1rem; text-align: center; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">CONDITION</th>
          <th style="padding: 0.75rem 1rem; text-align: center; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">PURCHASE PRICE</th>
          <th style="padding: 0.75rem 1rem; text-align: center; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">LEASE PRICE/MONTH</th>
          <th style="padding: 0.75rem 1rem; text-align: center; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">ACTION</th>
        </tr>
      `;

      // Add aircraft rows for this model
      tableRows += aircraftList.map(aircraft => {
        // Format range based on whether it's a used or new aircraft
        const rangeDisplay = aircraft.rangeNm ? `${aircraft.rangeNm} nm` : aircraft.range || 'N/A';
        const ageDisplay = aircraft.age !== undefined ? `${aircraft.age} years` : 'New';
        const conditionDisplay = aircraft.condition || 'New';
        
        // Calculate condition percentage
        const conditionPercent = aircraft.conditionPercentage || conditionToPercentage(conditionDisplay);
        
        return `
          <tr style="border-bottom: 1px solid var(--border-color); cursor: pointer;" onclick="showAircraftDetails('${aircraft.id}')">
            <td style="padding: 1rem;">
              <div>
                <div style="font-weight: 600; color: var(--text-primary);">${aircraft.model}${aircraft.variant ? '-' + aircraft.variant : ''}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? '-' + aircraft.variant : ''}</div>
              </div>
            </td>
            <td style="padding: 1rem; color: var(--text-secondary);">${aircraft.type}</td>
            <td style="padding: 1rem; text-align: center; color: var(--text-primary);">${aircraft.passengerCapacity || 'N/A'} pax</td>
            <td style="padding: 1rem; text-align: center; color: var(--text-primary);">${rangeDisplay}</td>
            <td style="padding: 1rem; text-align: center; color: var(--text-primary);">${ageDisplay}</td>
            <td style="padding: 1rem; text-align: center;">
              <span style="padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; display: inline-block; min-width: 60px; text-align: center; ${
                conditionPercent >= 90 ? 'background: var(--success-color); color: white;' :
                conditionPercent >= 70 ? 'background: #10b981; color: white;' :
                conditionPercent >= 50 ? 'background: #60a5fa; color: white;' :
                'background: var(--warning-color); color: white;'
              }">${conditionPercent}%</span>
            </td>
            <td style="padding: 1rem; text-align: center; font-weight: 600; color: var(--success-color);">$${formatCurrency(aircraft.purchasePrice || 0)}</td>
            <td style="padding: 1rem; text-align: center; font-weight: 600; color: var(--accent-color);">$${formatCurrency(aircraft.leasePrice || 0)}/mo</td>
            <td style="padding: 1rem; text-align: center;">
              <button class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.8rem;" onclick="event.stopPropagation(); showAircraftDetails('${aircraft.id}')">View Details</button>
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

// Format currency for display
function formatCurrency(amount) {
  const numAmount = Number(amount) || 0;
  return numAmount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

// Search aircraft
function searchAircraft() {
  const searchTerm = document.getElementById('searchAircraftInput').value.toLowerCase();

  if (!searchTerm) {
    displayAircraft(allAircraft);
    return;
  }

  const filteredAircraft = allAircraft.filter(aircraft =>
    (aircraft.model && aircraft.model.toLowerCase().includes(searchTerm)) ||
    (aircraft.manufacturer && aircraft.manufacturer.toLowerCase().includes(searchTerm)) ||
    (aircraft.type && aircraft.type.toLowerCase().includes(searchTerm)) ||
    (aircraft.description && aircraft.description.toLowerCase().includes(searchTerm))
  );

  displayAircraft(filteredAircraft);
}

// Filter aircraft by multiple criteria
function filterAircraft() {
  const manufacturer = document.getElementById('manufacturerFilter').value;
  const type = document.getElementById('typeFilter').value;
  const range = document.getElementById('rangeFilter').value;

  let filteredAircraft = [...allAircraft];

  if (manufacturer) {
    filteredAircraft = filteredAircraft.filter(aircraft =>
      aircraft.manufacturer === manufacturer
    );
  }

  if (type) {
    filteredAircraft = filteredAircraft.filter(aircraft =>
      aircraft.type === type
    );
  }

  if (range) {
    filteredAircraft = filteredAircraft.filter(aircraft =>
      aircraft.rangeCategory === range
    );
  }

  displayAircraft(filteredAircraft);
}

// Show aircraft details in modal
function showAircraftDetails(aircraftId) {
  const aircraft = allAircraft.find(a => a.id === aircraftId);

  if (!aircraft) return;

  // Store selected aircraft for purchase/lease
  selectedAircraft = aircraft;

  const detailContent = document.getElementById('aircraftDetailContent');
  detailContent.innerHTML = `
    <div style="display: flex; gap: 2rem; align-items: flex-start;">
      <div style="flex: 1;">
        <h3 style="color: var(--text-primary); margin-bottom: 1rem;">${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? '-' + aircraft.variant : ''}</h3>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
          <div class="info-row">
            <span class="info-label">Type</span>
            <span class="info-value">${aircraft.type}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Range</span>
            <span class="info-value">${aircraft.rangeNm ? aircraft.rangeNm + ' nm' : 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Capacity</span>
            <span class="info-value">${aircraft.passengerCapacity || 'N/A'} passengers</span>
          </div>
          <div class="info-row">
            <span class="info-label">Fuel Burn/Hour</span>
            <span class="info-value">${aircraft.fuelBurnPerHour || 'N/A'} L/hr</span>
          </div>
          <div class="info-row">
            <span class="info-label">Age</span>
            <span class="info-value">${aircraft.age !== undefined ? aircraft.age + ' years' : 'New'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Condition</span>
            <span class="info-value">${aircraft.condition || 'New'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Maintenance Cost/Hour</span>
            <span class="info-value">$${formatCurrency(aircraft.maintenanceCostPerHour || 0)}/hr</span>
          </div>
          <div class="info-row">
            <span class="info-label">First Introduced</span>
            <span class="info-value">${aircraft.firstIntroduced || 'N/A'}</span>
          </div>
        </div>
        <div class="info-row" style="margin-bottom: 1.5rem;">
          <span class="info-label">Description</span>
          <span class="info-value">${aircraft.description || 'No description available.'}</span>
        </div>
      </div>
      <div style="flex: 1; display: flex; flex-direction: column; gap: 1rem;">
        <div class="card" style="padding: 1.5rem;">
          <h4 style="margin-top: 0; margin-bottom: 1rem; color: var(--text-primary);">PRICING</h4>
          <div class="info-row" style="margin-bottom: 1rem;">
            <span class="info-label">Purchase Price</span>
            <span class="info-value" style="font-weight: bold; color: var(--success-color);">$${formatCurrency(aircraft.purchasePrice || 0)}</span>
          </div>
          <div class="info-row" style="margin-bottom: 1rem;">
            <span class="info-label">Lease Price/Month</span>
            <span class="info-value" style="font-weight: bold; color: var(--accent-color);">$${formatCurrency(aircraft.leasePrice || 0)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Condition</span>
            <span class="info-value" style="font-weight: bold; color: var(--text-primary);">${aircraft.conditionPercentage || (aircraft.condition ? (aircraft.condition === 'New' ? 100 : 70) : 100)}%</span>
          </div>
          ${aircraft.category === 'used' || aircraft.cCheckRemaining ? `
          <div class="info-row" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
            <span class="info-label" style="color: #DC2626;">C Check Valid</span>
            <span class="info-value" style="font-weight: bold; color: ${aircraft.cCheckRemainingDays < 180 ? '#DC2626' : 'var(--text-primary)'};">${aircraft.cCheckRemaining || 'Full'}</span>
          </div>
          <div class="info-row">
            <span class="info-label" style="color: #10B981;">D Check Valid</span>
            <span class="info-value" style="font-weight: bold; color: ${aircraft.dCheckRemainingDays < 365 ? '#FFA500' : 'var(--text-primary)'};">${aircraft.dCheckRemaining || 'Full'}</span>
          </div>
          ` : ''}
        </div>
        <div class="card" style="padding: 1.5rem;">
          <h4 style="margin-top: 0; margin-bottom: 1rem; color: var(--text-primary);">SPECIFICATIONS</h4>
          <div class="info-row" style="margin-bottom: 0.5rem;">
            <span class="info-label">Cruise Speed</span>
            <span class="info-value">${aircraft.cruiseSpeed || 'N/A'} kts</span>
          </div>
          <div class="info-row" style="margin-bottom: 0.5rem;">
            <span class="info-label">Fuel Capacity</span>
            <span class="info-value">${aircraft.fuelCapacityLiters || 'N/A'} L</span>
          </div>
          <div class="info-row" style="margin-bottom: 0.5rem;">
            <span class="info-label">Cargo Capacity</span>
            <span class="info-value">${aircraft.cargoCapacityKg || 'N/A'} kg</span>
          </div>
          <div class="info-row">
            <span class="info-label">Range Category</span>
            <span class="info-value">${aircraft.rangeCategory || 'N/A'}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('detailModalTitle').textContent = `${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? '-' + aircraft.variant : ''} DETAILS`;
  document.getElementById('aircraftDetailModal').style.display = 'flex';
  
  // Update purchase button based on category
  const purchaseBtn = document.getElementById('purchaseAircraftBtn');
  if (currentCategory === 'new') {
    purchaseBtn.textContent = 'Purchase New Aircraft';
  } else {
    purchaseBtn.textContent = 'Purchase Used Aircraft';
  }
}

// Close aircraft detail modal
function closeAircraftDetailModal() {
  document.getElementById('aircraftDetailModal').style.display = 'none';
}

// Purchase aircraft
function purchaseAircraft() {
  if (!selectedAircraft) {
    showErrorMessage('No aircraft selected');
    return;
  }

  // Close detail modal
  closeAircraftDetailModal();

  // Show purchase/lease confirmation modal
  showPurchaseConfirmationModal();
}

// Show purchase/lease confirmation modal
function showPurchaseConfirmationModal() {
  if (!selectedAircraft) return;

  // Calculate condition percentage
  const conditionPercent = selectedAircraft.conditionPercentage || (selectedAircraft.condition === 'New' ? 100 : 70);
  const ageYears = selectedAircraft.age || 0;

  // Create confirmation modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'purchaseConfirmationOverlay';
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
    <div style="background: var(--surface); border: 1px solid var(--border-color); border-radius: 8px; padding: 2rem; width: 90%; max-width: 600px;">
      <h2 style="margin-bottom: 1.5rem; color: var(--text-primary); text-align: center;">CONFIRM ACQUISITION</h2>

      <div style="margin-bottom: 2rem; padding: 1rem; background: var(--surface-elevated); border-radius: 4px;">
        <h3 style="margin: 0 0 1rem 0; color: var(--accent-color);">${selectedAircraft.manufacturer} ${selectedAircraft.model}${selectedAircraft.variant ? '-' + selectedAircraft.variant : ''}</h3>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; font-size: 0.9rem;">
          <div><span style="color: var(--text-secondary);">Condition:</span> <strong>${conditionPercent}%</strong></div>
          <div><span style="color: var(--text-secondary);">Age:</span> <strong>${ageYears} years</strong></div>
          <div><span style="color: var(--text-secondary);">Capacity:</span> <strong>${selectedAircraft.passengerCapacity} pax</strong></div>
          <div><span style="color: var(--text-secondary);">Range:</span> <strong>${selectedAircraft.rangeNm} nm</strong></div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 2rem;">
        <button id="confirmPurchaseBtn" class="btn btn-primary" style="padding: 1.5rem; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
          <span>PURCHASE OUTRIGHT</span>
          <strong style="color: var(--success-color);">$${formatCurrency(selectedAircraft.purchasePrice || 0)}</strong>
        </button>
        <button id="confirmLeaseBtn" class="btn btn-secondary" style="padding: 1.5rem; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
          <span>LEASE (12 MONTHS)</span>
          <strong style="color: var(--accent-color);">$${formatCurrency(selectedAircraft.leasePrice || 0)}/mo</strong>
        </button>
      </div>

      <button id="cancelPurchaseBtn" class="btn btn-logout" style="width: 100%; padding: 0.75rem;">Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);

  // Add event listeners
  document.getElementById('confirmPurchaseBtn').addEventListener('click', () => {
    document.body.removeChild(overlay);
    processPurchase();
  });

  document.getElementById('confirmLeaseBtn').addEventListener('click', () => {
    document.body.removeChild(overlay);
    processLease();
  });

  document.getElementById('cancelPurchaseBtn').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
}

// Show purchase confirmation dialog
function processPurchase() {
  if (!selectedAircraft) return;

  const fullName = selectedAircraft.variant
    ? `${selectedAircraft.manufacturer} ${selectedAircraft.model}-${selectedAircraft.variant}`
    : `${selectedAircraft.manufacturer} ${selectedAircraft.model}`;

  const condition = selectedAircraft.condition || 'New';
  const price = selectedAircraft.purchasePrice;

  showConfirmationDialog(
    'CONFIRM PURCHASE',
    fullName,
    condition,
    `$${formatCurrency(price)}`,
    'Purchase',
    confirmPurchase
  );
}

// Show processing/ordering overlay
function showProcessingOverlay(actionType = 'order') {
  // Remove any existing processing overlay
  hideProcessingOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'processingOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    z-index: 3000;
    display: flex;
    justify-content: center;
    align-items: center;
  `;

  const actionText = actionType === 'lease' ? 'Leasing' : 'Purchasing';
  const icon = actionType === 'lease' ? '📋' : '🛒';

  overlay.innerHTML = `
    <div style="background: var(--surface); border: 1px solid var(--accent-color); border-radius: 8px; padding: 3rem; width: 90%; max-width: 400px; text-align: center;">
      <div style="margin-bottom: 1.5rem;">
        <div class="processing-spinner" style="width: 60px; height: 60px; border: 4px solid var(--border-color); border-top-color: var(--accent-color); border-radius: 50%; margin: 0 auto; animation: spin 1s linear infinite;"></div>
      </div>
      <h2 style="margin: 0 0 0.75rem 0; color: var(--text-primary); font-size: 1.3rem;">${actionText} Aircraft</h2>
      <p style="margin: 0; color: var(--text-secondary); font-size: 0.95rem;">Processing your order, please wait...</p>
      <p style="margin: 1rem 0 0 0; color: var(--text-muted); font-size: 0.8rem;">This may take a few seconds</p>
    </div>
    <style>
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  `;

  document.body.appendChild(overlay);
}

// Hide processing overlay
function hideProcessingOverlay() {
  const existing = document.getElementById('processingOverlay');
  if (existing) {
    existing.remove();
  }
}

// Actually process the purchase after confirmation
async function confirmPurchase(registration, autoSchedulePrefs = {}) {
  if (!selectedAircraft) return;

  // Show processing overlay
  showProcessingOverlay('purchase');

  try {
    const conditionPercent = selectedAircraft.conditionPercentage || (selectedAircraft.condition === 'New' ? 100 : 70);
    const ageYears = selectedAircraft.age || 0;

    // Use variantId for used aircraft, id for new aircraft
    const aircraftId = selectedAircraft.variantId || selectedAircraft.id;

    const response = await fetch('/api/fleet/purchase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        aircraftId: aircraftId,
        category: currentCategory,
        condition: selectedAircraft.condition || 'New',
        conditionPercentage: conditionPercent,
        ageYears: ageYears,
        purchasePrice: selectedAircraft.purchasePrice,
        maintenanceCostPerHour: selectedAircraft.maintenanceCostPerHour,
        fuelBurnPerHour: selectedAircraft.fuelBurnPerHour,
        registration: registration,
        // Check validity for used aircraft
        cCheckRemainingDays: selectedAircraft.cCheckRemainingDays || null,
        dCheckRemainingDays: selectedAircraft.dCheckRemainingDays || null,
        // Auto-schedule preferences (light checks only - C/D scheduled manually)
        autoScheduleDaily: autoSchedulePrefs.autoScheduleDaily || false,
        autoScheduleA: autoSchedulePrefs.autoScheduleA || false,
        autoScheduleB: autoSchedulePrefs.autoScheduleB || false
      })
    });

    const data = await response.json();

    // Hide processing overlay
    hideProcessingOverlay();

    if (response.ok) {
      // Show success message
      showSuccessMessage(`Aircraft purchased successfully! Registration: ${data.aircraft.registration}`, data.newBalance);

      // Reload marketplace info to update balance
      loadMarketplaceInfo();
    } else {
      // Show error message
      const errorMsg = data.details ? `${data.error}: ${data.details}` : data.error;
      showErrorMessage(`Purchase failed: ${errorMsg}`);
    }
  } catch (error) {
    console.error('Error purchasing aircraft:', error);
    hideProcessingOverlay();
    showErrorMessage('Failed to purchase aircraft. Please try again.');
  }
}

// Show confirmation dialog with registration input
function showConfirmationDialog(title, aircraftName, condition, price, actionType, confirmCallback) {
  const overlay = document.createElement('div');
  overlay.id = 'registrationConfirmOverlay';
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
    overflow-y: auto;
    padding: 2rem 0;
  `;

  overlay.innerHTML = `
    <div style="background: var(--surface); border: 1px solid var(--border-color); border-radius: 8px; padding: 2rem; width: 90%; max-width: 550px; margin: auto;">
      <h2 style="margin-bottom: 1.5rem; color: var(--text-primary); text-align: center;">${title}</h2>

      <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--surface-elevated); border-radius: 4px;">
        <h3 style="margin: 0 0 0.75rem 0; color: var(--accent-color); font-size: 1.1rem;">${aircraftName}</h3>
        <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 0.5rem;">
          <span style="color: var(--text-secondary);">Condition:</span>
          <strong>${condition}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
          <span style="color: var(--text-secondary);">Price:</span>
          <strong style="color: var(--success-color);">${price}</strong>
        </div>
      </div>

      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-primary); font-weight: 600;">Aircraft Registration</label>
        <div style="display: flex; align-items: stretch; border: 1px solid var(--border-color); border-radius: 4px; overflow: hidden; background: var(--surface-elevated);">
          <div id="registrationPrefix" style="padding: 0.75rem; background: var(--surface); border-right: 1px solid var(--border-color); color: var(--text-secondary); font-weight: 600; font-size: 1rem; display: flex; align-items: center;">${registrationPrefix}</div>
          <input
            type="text"
            id="registrationSuffix"
            placeholder="${typeof getSuffixPlaceholder === 'function' ? getSuffixPlaceholder(registrationPrefix) : (registrationPrefix === 'N-' ? '12345' : 'ABCD')}"
            maxlength="${typeof getExpectedSuffixLength === 'function' ? getExpectedSuffixLength(registrationPrefix) : 6}"
            style="flex: 1; padding: 0.75rem; background: transparent; border: none; color: var(--text-primary); font-size: 1rem; outline: none; text-transform: uppercase;"
          />
        </div>
        <div id="registrationHint" style="margin-top: 0.25rem; color: var(--text-muted); font-size: 0.8rem;">${typeof getRegistrationHint === 'function' ? getRegistrationHint(registrationPrefix, baseCountry) : `Based on ${baseCountry || 'your base location'}`}</div>
        <div id="registrationError" style="margin-top: 0.5rem; color: var(--warning-color); font-size: 0.85rem; display: none;"></div>
      </div>

      <!-- Maintenance Auto-Scheduling Options -->
      <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--surface-elevated); border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <label style="color: var(--text-primary); font-weight: 600;">Maintenance Scheduling</label>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 0.8rem; color: var(--text-secondary);">Auto All</span>
            <label class="toggle-switch" style="position: relative; display: inline-block; width: 44px; height: 24px;">
              <input type="checkbox" id="autoScheduleAll" style="opacity: 0; width: 0; height: 0;">
              <span class="toggle-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #4b5563; transition: 0.3s; border-radius: 24px;"></span>
            </label>
          </div>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">
          Auto-schedule recurring maintenance checks to keep them valid.
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: var(--surface); border-radius: 4px;">
            <span style="font-size: 0.85rem; color: #FFA500;">Daily</span>
            <label class="toggle-switch" style="position: relative; display: inline-block; width: 36px; height: 20px;">
              <input type="checkbox" id="autoScheduleDaily" style="opacity: 0; width: 0; height: 0;">
              <span class="toggle-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #4b5563; transition: 0.3s; border-radius: 20px;"></span>
            </label>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: var(--surface); border-radius: 4px;">
            <span style="font-size: 0.85rem; color: #3B82F6;">A Check</span>
            <label class="toggle-switch" style="position: relative; display: inline-block; width: 36px; height: 20px;">
              <input type="checkbox" id="autoScheduleA" style="opacity: 0; width: 0; height: 0;">
              <span class="toggle-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #4b5563; transition: 0.3s; border-radius: 20px;"></span>
            </label>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: var(--surface); border-radius: 4px;">
            <span style="font-size: 0.85rem; color: #8B5CF6;">B Check</span>
            <label class="toggle-switch" style="position: relative; display: inline-block; width: 36px; height: 20px;">
              <input type="checkbox" id="autoScheduleB" style="opacity: 0; width: 0; height: 0;">
              <span class="toggle-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #4b5563; transition: 0.3s; border-radius: 20px;"></span>
            </label>
          </div>
        </div>
        <div style="margin-top: 0.75rem; padding: 0.5rem; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 4px;">
          <div style="font-size: 0.75rem; color: #f59e0b;">
            <strong>C &amp; D Checks</strong> are heavy maintenance (14-60 days). Schedule manually when due.
          </div>
        </div>
      </div>

      <div style="display: flex; gap: 1rem;">
        <button id="confirmActionBtn" class="btn btn-primary" style="flex: 1; padding: 0.75rem;">${actionType}</button>
        <button id="cancelActionBtn" class="btn btn-secondary" style="flex: 1; padding: 0.75rem;">Cancel</button>
      </div>
    </div>
    <style>
      .toggle-switch input:checked + .toggle-slider {
        background-color: var(--accent-color);
      }
      .toggle-switch .toggle-slider:before {
        content: "";
        position: absolute;
        height: calc(100% - 4px);
        aspect-ratio: 1;
        left: 2px;
        bottom: 2px;
        background-color: white;
        transition: 0.3s;
        border-radius: 50%;
      }
      .toggle-switch input:checked + .toggle-slider:before {
        transform: translateX(calc(100% - 2px));
      }
    </style>
  `;

  document.body.appendChild(overlay);

  const registrationSuffix = document.getElementById('registrationSuffix');
  const registrationError = document.getElementById('registrationError');
  const confirmBtn = document.getElementById('confirmActionBtn');
  const inputContainer = registrationSuffix.parentElement;

  // Auto-schedule toggle handlers (only for light checks: Daily, A, B)
  // C and D checks are heavy maintenance and scheduled manually when due
  const autoScheduleAll = document.getElementById('autoScheduleAll');
  const autoScheduleDaily = document.getElementById('autoScheduleDaily');
  const autoScheduleA = document.getElementById('autoScheduleA');
  const autoScheduleB = document.getElementById('autoScheduleB');

  const individualToggles = [autoScheduleDaily, autoScheduleA, autoScheduleB];

  // Auto All toggle
  autoScheduleAll.addEventListener('change', () => {
    const checked = autoScheduleAll.checked;
    individualToggles.forEach(toggle => {
      toggle.checked = checked;
    });
  });

  // Individual toggles update Auto All state
  individualToggles.forEach(toggle => {
    toggle.addEventListener('change', () => {
      const allChecked = individualToggles.every(t => t.checked);
      const noneChecked = individualToggles.every(t => !t.checked);
      autoScheduleAll.checked = allChecked;
      autoScheduleAll.indeterminate = !allChecked && !noneChecked;
    });
  });

  // Validate registration suffix and combine with prefix
  function validateRegistration(suffix) {
    const trimmedSuffix = suffix.trim().toUpperCase();

    // Use country-specific validation if available
    if (typeof validateRegistrationSuffix === 'function') {
      const validation = validateRegistrationSuffix(trimmedSuffix, registrationPrefix);
      if (!validation.valid) {
        return validation;
      }
      // Combine prefix and suffix
      return { valid: true, value: registrationPrefix + validation.value };
    }

    // Fallback validation if country-specific rules not available
    if (trimmedSuffix.length < 1) {
      return { valid: false, message: 'Please enter a registration suffix' };
    }

    // Suffix should be alphanumeric (and hyphens for some countries)
    if (!/^[A-Z0-9-]+$/.test(trimmedSuffix)) {
      return { valid: false, message: 'Registration can only contain letters, numbers, and hyphens' };
    }

    // Combine prefix and suffix
    const fullRegistration = registrationPrefix + trimmedSuffix;

    if (fullRegistration.length > 10) {
      return { valid: false, message: 'Registration is too long (max 10 characters)' };
    }

    return { valid: true, value: fullRegistration };
  }

  // Add event listener for confirm button
  confirmBtn.addEventListener('click', () => {
    const suffix = registrationSuffix.value.trim();
    const validation = validateRegistration(suffix);

    if (!validation.valid) {
      registrationError.textContent = validation.message;
      registrationError.style.display = 'block';
      inputContainer.style.borderColor = 'var(--warning-color)';
      return;
    }

    // Collect auto-schedule preferences (only light checks - C/D are heavy maintenance)
    const autoSchedulePrefs = {
      autoScheduleDaily: autoScheduleDaily.checked,
      autoScheduleA: autoScheduleA.checked,
      autoScheduleB: autoScheduleB.checked
    };

    // Remove overlay and call confirm callback with registration and auto-schedule prefs
    document.body.removeChild(overlay);
    confirmCallback(validation.value, autoSchedulePrefs);
  });

  // Add event listener for cancel button
  document.getElementById('cancelActionBtn').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });

  // Clear error on input
  registrationSuffix.addEventListener('input', () => {
    registrationError.style.display = 'none';
    inputContainer.style.borderColor = 'var(--border-color)';
  });

  // Allow Enter key to submit
  registrationSuffix.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      confirmBtn.click();
    }
  });

  // Auto-focus the suffix input
  registrationSuffix.focus();
}

// Show lease confirmation dialog
function processLease() {
  if (!selectedAircraft) return;

  const fullName = selectedAircraft.variant
    ? `${selectedAircraft.manufacturer} ${selectedAircraft.model}-${selectedAircraft.variant}`
    : `${selectedAircraft.manufacturer} ${selectedAircraft.model}`;

  const condition = selectedAircraft.condition || 'New';
  const price = selectedAircraft.leasePrice;

  showConfirmationDialog(
    'CONFIRM LEASE',
    fullName,
    condition,
    `$${formatCurrency(price)}/month`,
    'Lease',
    confirmLease
  );
}

// Actually process the lease after confirmation
async function confirmLease(registration, autoSchedulePrefs = {}) {
  if (!selectedAircraft) return;

  // Show processing overlay
  showProcessingOverlay('lease');

  try {
    const conditionPercent = selectedAircraft.conditionPercentage || (selectedAircraft.condition === 'New' ? 100 : 70);
    const ageYears = selectedAircraft.age || 0;

    // Use variantId for used aircraft, id for new aircraft
    const aircraftId = selectedAircraft.variantId || selectedAircraft.id;

    const response = await fetch('/api/fleet/lease', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        aircraftId: aircraftId,
        category: currentCategory,
        condition: selectedAircraft.condition || 'New',
        conditionPercentage: conditionPercent,
        ageYears: ageYears,
        leaseMonthlyPayment: selectedAircraft.leasePrice,
        leaseDurationMonths: 12,
        maintenanceCostPerHour: selectedAircraft.maintenanceCostPerHour,
        fuelBurnPerHour: selectedAircraft.fuelBurnPerHour,
        purchasePrice: selectedAircraft.purchasePrice, // For reference
        registration: registration,
        // Check validity for used aircraft
        cCheckRemainingDays: selectedAircraft.cCheckRemainingDays || null,
        dCheckRemainingDays: selectedAircraft.dCheckRemainingDays || null,
        // Auto-schedule preferences (light checks only - C/D scheduled manually)
        autoScheduleDaily: autoSchedulePrefs.autoScheduleDaily || false,
        autoScheduleA: autoSchedulePrefs.autoScheduleA || false,
        autoScheduleB: autoSchedulePrefs.autoScheduleB || false
      })
    });

    const data = await response.json();

    // Hide processing overlay
    hideProcessingOverlay();

    if (response.ok) {
      // Show success message
      showSuccessMessage(`Aircraft leased successfully! Registration: ${data.aircraft.registration}`, data.newBalance);

      // Reload marketplace info to update balance
      loadMarketplaceInfo();
    } else {
      // Show error message
      const errorMsg = data.details ? `${data.error}: ${data.details}` : data.error;
      showErrorMessage(`Lease failed: ${errorMsg}`);
    }
  } catch (error) {
    console.error('Error leasing aircraft:', error);
    hideProcessingOverlay();
    showErrorMessage('Failed to lease aircraft. Please try again.');
  }
}

// Show success message
function showSuccessMessage(message, newBalance) {
  const overlay = document.createElement('div');
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
    <div style="background: var(--surface); border: 1px solid var(--success-color); border-radius: 8px; padding: 2rem; width: 90%; max-width: 500px; text-align: center;">
      <div style="font-size: 3rem; color: var(--success-color); margin-bottom: 1rem;">✓</div>
      <h2 style="margin-bottom: 1rem; color: var(--text-primary);">SUCCESS</h2>
      <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">${message}</p>
      <p style="margin-bottom: 2rem; color: var(--text-secondary);">New Balance: <strong style="color: var(--success-color);">$${formatCurrency(newBalance)}</strong></p>
      <button id="viewFleetBtn" class="btn btn-primary" style="width: 100%; margin-bottom: 0.5rem;">View My Fleet</button>
      <button id="continueShoppingBtn" class="btn btn-secondary" style="width: 100%;">Continue Shopping</button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('viewFleetBtn').addEventListener('click', () => {
    window.location.href = '/fleet';
  });

  document.getElementById('continueShoppingBtn').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
}

// Show error message
function showErrorMessage(message) {
  const overlay = document.createElement('div');
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
    <div style="background: var(--surface); border: 1px solid var(--warning-color); border-radius: 8px; padding: 2rem; width: 90%; max-width: 500px; text-align: center;">
      <div style="font-size: 3rem; color: var(--warning-color); margin-bottom: 1rem;">⚠</div>
      <h2 style="margin-bottom: 1rem; color: var(--text-primary);">ERROR</h2>
      <p style="margin-bottom: 2rem; color: var(--text-secondary);">${message}</p>
      <button id="closeErrorBtn" class="btn btn-primary" style="width: 100%;">Close</button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('closeErrorBtn').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
}

// Update active tab based on current category
function updateActiveTab() {
  const usedTab = document.getElementById('usedTab');
  const newTab = document.getElementById('newTab');

  // Reset styles
  usedTab.style.borderBottom = '3px solid transparent';
  usedTab.style.color = 'var(--text-muted)';
  newTab.style.borderBottom = '3px solid transparent';
  newTab.style.color = 'var(--text-muted)';

  // Apply active styles based on current category
  if (currentCategory === 'new') {
    newTab.style.borderBottom = '3px solid var(--primary-color)';
    newTab.style.color = 'var(--primary-color)';
  } else {
    usedTab.style.borderBottom = '3px solid var(--primary-color)';
    usedTab.style.color = 'var(--primary-color)';
  }
}

// Load marketplace-specific info (balance and airline)
async function loadMarketplaceInfo() {
  try {
    const response = await fetch('/api/world/info');
    const data = await response.json();

    if (!data.error) {
      // Update balance display
      const balanceEl = document.getElementById('marketplaceBalance');
      if (balanceEl) {
        const balance = Number(data.balance) || 0;
        balanceEl.textContent = `$${Math.round(balance).toLocaleString('en-US')}`;

        // Color code balance based on value
        if (balance < 0) {
          balanceEl.style.color = 'var(--warning-color)';
        } else if (balance < 100000) {
          balanceEl.style.color = 'var(--text-secondary)';
        } else {
          balanceEl.style.color = 'var(--success-color)';
        }
      }

      // Update airline name
      const airlineEl = document.getElementById('marketplaceAirlineName');
      if (airlineEl) {
        airlineEl.textContent = data.airlineName || '--';
      }
    }
  } catch (error) {
    console.error('Error loading marketplace info:', error);
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  fetchRegistrationPrefix(); // Load registration prefix from world info
  loadAircraft();
  loadMarketplaceInfo();
});