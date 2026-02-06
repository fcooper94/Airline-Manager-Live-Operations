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

// Display aircraft in card grid format
function displayAircraft(aircraftArray) {
  const grid = document.getElementById('aircraftGrid');

  if (aircraftArray.length === 0) {
    grid.innerHTML = `
      <div class="empty-message">No aircraft found matching your criteria</div>
    `;
    return;
  }

  // Group aircraft by manufacturer + model (type key)
  const groupedAircraft = {};
  aircraftArray.forEach(aircraft => {
    const typeKey = `${aircraft.manufacturer} ${aircraft.model}`;
    if (!groupedAircraft[typeKey]) {
      groupedAircraft[typeKey] = {
        manufacturer: aircraft.manufacturer,
        model: aircraft.model,
        type: aircraft.type,
        passengerCapacity: aircraft.passengerCapacity,
        rangeNm: aircraft.rangeNm,
        icaoCodes: new Set(),
        variants: []
      };
    }
    if (aircraft.icaoCode) {
      groupedAircraft[typeKey].icaoCodes.add(aircraft.icaoCode);
    }
    groupedAircraft[typeKey].variants.push(aircraft);
  });

  // Get condition class
  function getConditionClass(conditionPercent) {
    if (conditionPercent >= 90) return 'cond-excellent';
    if (conditionPercent >= 70) return 'cond-good';
    if (conditionPercent >= 50) return 'cond-fair';
    return 'cond-poor';
  }

  // Convert condition to percentage
  function conditionToPercentage(condition) {
    switch(condition) {
      case 'New': return 100;
      case 'Excellent': return 90;
      case 'Very Good': return 80;
      case 'Good': return 70;
      case 'Fair': return 60;
      case 'Poor': return 40;
      default: return 50;
    }
  }

  // Generate HTML - wrap in 2-column grid
  let html = '<div class="market-grid-wrapper">';
  const sortedTypes = Object.keys(groupedAircraft).sort();

  sortedTypes.forEach((typeKey) => {
    const typeData = groupedAircraft[typeKey];
    const variantCount = typeData.variants.length;

    // Start type group container
    html += `<div class="market-type-group">`;

    // Type header
    const icaoCodesStr = typeData.icaoCodes.size > 0 ? Array.from(typeData.icaoCodes).join('/') : '';
    html += `
      <div class="market-type-header">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <h3>${typeKey}</h3>
          ${icaoCodesStr ? `<span style="font-size: 0.7rem; color: var(--text-muted); font-family: monospace;">${icaoCodesStr}</span>` : ''}
        </div>
        <span class="type-badge">${typeData.type}</span>
      </div>
    `;

    // Specs bar
    html += `
      <div class="market-specs">
        <span><strong>${typeData.passengerCapacity || 'N/A'}</strong> pax</span>
        <span><strong>${typeData.rangeNm || 'N/A'}</strong> nm</span>
        <span style="margin-left: auto; color: var(--text-secondary);">${variantCount} variant${variantCount !== 1 ? 's' : ''}</span>
      </div>
    `;

    // Column headers
    html += `
      <div class="market-header">
        <span>VARIANT</span>
        <span>AGE</span>
        <span>COND</span>
        <span>PURCHASE</span>
        <span>LEASE/MO</span>
        <span></span>
      </div>
    `;

    // Aircraft rows
    typeData.variants.forEach(aircraft => {
      const ageDisplay = aircraft.age !== undefined ? `${aircraft.age}y` : 'New';
      const conditionPercent = aircraft.conditionPercentage || conditionToPercentage(aircraft.condition || 'New');
      const variantName = aircraft.variant || 'Base';
      const icaoCode = aircraft.icaoCode || '';
      const lessorName = aircraft.lessor?.shortName || '';

      html += `
        <div class="market-row" onclick="showAircraftDetails('${aircraft.id}')">
          <div class="market-cell market-variant" style="flex-direction: column; align-items: flex-start;">
            <div>
              ${variantName}
              ${icaoCode ? `<span style="font-size: 0.65rem; color: var(--text-muted); margin-left: 0.25rem; font-family: monospace;">${icaoCode}</span>` : ''}
            </div>
            ${lessorName ? `<div style="font-size: 0.55rem; color: var(--accent-color); margin-top: 0.1rem;">Lease: ${lessorName}</div>` : ''}
          </div>
          <div class="market-cell">${ageDisplay}</div>
          <div class="market-cell">
            <span class="status-badge ${getConditionClass(conditionPercent)}">${conditionPercent}%</span>
          </div>
          <div class="market-cell" style="color: var(--success-color); font-weight: 600;">$${formatCurrencyShort(aircraft.purchasePrice || 0)}</div>
          <div class="market-cell" style="color: var(--accent-color); font-weight: 600;">$${formatCurrencyShort(aircraft.leasePrice || 0)}<span style="font-size: 0.6rem; color: var(--text-muted); font-weight: 400;">/mo</span></div>
          <div class="market-cell">
            <button class="btn btn-primary" style="padding: 0.2rem 0.4rem; font-size: 0.65rem;" onclick="event.stopPropagation(); showAircraftDetails('${aircraft.id}')">VIEW</button>
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

// Format currency short (e.g., 125M, 2.5M, 850K)
function formatCurrencyShort(amount) {
  const numAmount = Number(amount) || 0;
  if (numAmount >= 1000000000) {
    return (numAmount / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
  }
  if (numAmount >= 1000000) {
    return (numAmount / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (numAmount >= 1000) {
    return (numAmount / 1000).toFixed(0) + 'K';
  }
  return numAmount.toString();
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
    (aircraft.variant && aircraft.variant.toLowerCase().includes(searchTerm)) ||
    (aircraft.icaoCode && aircraft.icaoCode.toLowerCase().includes(searchTerm)) ||
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

  const conditionPercent = aircraft.conditionPercentage || (aircraft.condition === 'New' ? 100 : 70);
  const ageYears = aircraft.age !== undefined ? aircraft.age : 0;
  const isNew = currentCategory === 'new';

  const detailContent = document.getElementById('aircraftDetailContent');
  detailContent.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
      <!-- Left Column: Aircraft Info -->
      <div>
        <!-- Type Badges -->
        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
          <span style="background: rgba(59, 130, 246, 0.15); color: var(--accent-color); padding: 0.25rem 0.6rem; border-radius: 3px; font-size: 0.7rem; font-weight: 600;">${aircraft.type}</span>
          <span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 0.25rem 0.6rem; border-radius: 3px; font-size: 0.7rem; font-weight: 600;">${aircraft.rangeCategory}</span>
          ${aircraft.icaoCode ? `<span style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6; padding: 0.25rem 0.6rem; border-radius: 3px; font-size: 0.7rem; font-weight: 600; font-family: monospace;">${aircraft.icaoCode}</span>` : ''}
        </div>

        <!-- Specifications Grid -->
        <div style="background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.6rem;">
          <h4 style="margin: 0 0 0.5rem 0; color: var(--text-muted); font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.5px;">Specifications</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.35rem;">
            <div style="padding: 0.35rem; background: var(--surface); border-radius: 3px;">
              <div style="color: var(--text-muted); font-size: 0.55rem; text-transform: uppercase;">Pax</div>
              <div style="color: var(--text-primary); font-weight: 700; font-size: 0.9rem;">${aircraft.passengerCapacity || 'N/A'}</div>
            </div>
            <div style="padding: 0.35rem; background: var(--surface); border-radius: 3px;">
              <div style="color: var(--text-muted); font-size: 0.55rem; text-transform: uppercase;">Range</div>
              <div style="color: var(--text-primary); font-weight: 700; font-size: 0.9rem;">${aircraft.rangeNm || 'N/A'}<span style="font-size: 0.55rem; font-weight: 400;">nm</span></div>
            </div>
            <div style="padding: 0.35rem; background: var(--surface); border-radius: 3px;">
              <div style="color: var(--text-muted); font-size: 0.55rem; text-transform: uppercase;">Speed</div>
              <div style="color: var(--text-primary); font-weight: 700; font-size: 0.9rem;">${aircraft.cruiseSpeed || 'N/A'}<span style="font-size: 0.55rem; font-weight: 400;">kts</span></div>
            </div>
            <div style="padding: 0.35rem; background: var(--surface); border-radius: 3px;">
              <div style="color: var(--text-muted); font-size: 0.55rem; text-transform: uppercase;">Fuel</div>
              <div style="color: var(--text-primary); font-weight: 700; font-size: 0.9rem;">${aircraft.fuelBurnPerHour || 'N/A'}<span style="font-size: 0.55rem; font-weight: 400;">L/h</span></div>
            </div>
            <div style="padding: 0.35rem; background: var(--surface); border-radius: 3px;">
              <div style="color: var(--text-muted); font-size: 0.55rem; text-transform: uppercase;">Cargo</div>
              <div style="color: var(--text-primary); font-weight: 700; font-size: 0.9rem;">${aircraft.cargoCapacityKg ? (aircraft.cargoCapacityKg / 1000).toFixed(1) : 'N/A'}<span style="font-size: 0.55rem; font-weight: 400;">t</span></div>
            </div>
            <div style="padding: 0.35rem; background: var(--surface); border-radius: 3px;">
              <div style="color: var(--text-muted); font-size: 0.55rem; text-transform: uppercase;">Maint</div>
              <div style="color: var(--text-primary); font-weight: 700; font-size: 0.9rem;">$${Math.round(aircraft.maintenanceCostPerHour || 0)}<span style="font-size: 0.55rem; font-weight: 400;">/h</span></div>
            </div>
          </div>
        </div>

        <!-- Condition & Checks (for used aircraft) -->
        ${!isNew ? `
        <div style="background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.6rem; margin-top: 0.75rem;">
          <h4 style="margin: 0 0 0.4rem 0; color: var(--text-muted); font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.5px;">Condition</h4>
          <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
            <div style="flex: 1; text-align: center; padding: 0.4rem; background: var(--surface); border-radius: 3px;">
              <div style="color: var(--text-muted); font-size: 0.55rem; text-transform: uppercase;">Age</div>
              <div style="color: var(--text-primary); font-weight: 700; font-size: 1rem;">${ageYears}<span style="font-size: 0.65rem; font-weight: 400;">y</span></div>
            </div>
            <div style="flex: 1; text-align: center; padding: 0.4rem; background: var(--surface); border-radius: 3px;">
              <div style="color: var(--text-muted); font-size: 0.55rem; text-transform: uppercase;">Condition</div>
              <div style="color: ${conditionPercent >= 80 ? '#10b981' : conditionPercent >= 60 ? '#f59e0b' : '#ef4444'}; font-weight: 700; font-size: 1rem;">${conditionPercent}%</div>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem;">
            <div style="padding: 0.35rem; background: rgba(220, 38, 38, 0.1); border: 1px solid rgba(220, 38, 38, 0.3); border-radius: 3px;">
              <div style="color: #DC2626; font-size: 0.55rem; font-weight: 600;">C CHECK</div>
              <div style="color: ${aircraft.cCheckRemainingDays < 180 ? '#DC2626' : 'var(--text-primary)'}; font-weight: 600; font-size: 0.8rem;">${aircraft.cCheckRemaining || 'Full'}</div>
            </div>
            <div style="padding: 0.35rem; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 3px;">
              <div style="color: #10B981; font-size: 0.55rem; font-weight: 600;">D CHECK</div>
              <div style="color: ${aircraft.dCheckRemainingDays < 365 ? '#FFA500' : 'var(--text-primary)'}; font-weight: 600; font-size: 0.8rem;">${aircraft.dCheckRemaining || 'Full'}</div>
            </div>
          </div>
        </div>
        ` : ''}
      </div>

      <!-- Right Column: Acquisition Options -->
      <div>
        <!-- Purchase Option -->
        <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%); border: 2px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 0.75rem; margin-bottom: 0.6rem; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.borderColor='#10b981'; this.style.transform='translateY(-1px)'" onmouseout="this.style.borderColor='rgba(16, 185, 129, 0.3)'; this.style.transform='none'" onclick="closeAircraftDetailModal(); processPurchase()">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
            <div>
              <div style="color: #10b981; font-weight: 700; font-size: 0.85rem;">PURCHASE</div>
              <div style="color: var(--text-muted); font-size: 0.65rem;">Own outright</div>
            </div>
            <div style="text-align: right;">
              <div style="color: #10b981; font-weight: 700; font-size: 1.1rem;">$${formatCurrencyShort(aircraft.purchasePrice || 0)}</div>
            </div>
          </div>
          <div style="font-size: 0.65rem; color: var(--text-secondary);">
            ✓ Full ownership &nbsp; ✓ No monthly fees &nbsp; ✓ Sell anytime
          </div>
        </div>

        <!-- Lease Option -->
        <div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 6px; padding: 0.75rem; margin-bottom: 0.6rem; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.borderColor='#3b82f6'; this.style.transform='translateY(-1px)'" onmouseout="this.style.borderColor='rgba(59, 130, 246, 0.3)'; this.style.transform='none'" onclick="closeAircraftDetailModal(); processLease()">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
            <div>
              <div style="color: #3b82f6; font-weight: 700; font-size: 0.85rem;">LEASE</div>
              <div style="color: var(--text-muted); font-size: 0.65rem;">12 month minimum</div>
            </div>
            <div style="text-align: right;">
              <div style="color: #3b82f6; font-weight: 700; font-size: 1.1rem;">$${formatCurrencyShort(aircraft.leasePrice || 0)}<span style="font-size: 0.7rem; font-weight: 400;">/mo</span></div>
            </div>
          </div>
          ${aircraft.lessor ? `
          <div style="font-size: 0.65rem; color: var(--text-muted); margin-bottom: 0.3rem; padding: 0.25rem 0.4rem; background: rgba(0,0,0,0.2); border-radius: 3px; display: inline-block;">
            <span style="color: var(--text-secondary);">Lessor:</span> <strong style="color: var(--text-primary);">${aircraft.lessor.shortName}</strong>
            <span style="color: var(--text-muted); font-size: 0.55rem;">${aircraft.lessor.country}</span>
          </div>
          ` : ''}
          <div style="font-size: 0.65rem; color: var(--text-secondary);">
            ✓ Lower upfront &nbsp; ✓ Flexible &nbsp; ✓ Maint included
          </div>
        </div>

        <!-- Maintenance Auto-Schedule Info -->
        <div style="background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.6rem;">
          <h4 style="margin: 0 0 0.4rem 0; color: var(--text-muted); font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.5px;">Maintenance Scheduling</h4>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.35rem;">
            <div style="padding: 0.3rem; background: var(--surface); border-radius: 3px; text-align: center;">
              <div style="color: #FFA500; font-size: 0.6rem; font-weight: 600;">Daily</div>
              <div style="color: var(--text-muted); font-size: 0.5rem;">Walk-around</div>
            </div>
            <div style="padding: 0.3rem; background: var(--surface); border-radius: 3px; text-align: center;">
              <div style="color: #8B5CF6; font-size: 0.6rem; font-weight: 600;">Weekly</div>
              <div style="color: var(--text-muted); font-size: 0.5rem;">7-8 days</div>
            </div>
            <div style="padding: 0.3rem; background: var(--surface); border-radius: 3px; text-align: center;">
              <div style="color: #3B82F6; font-size: 0.6rem; font-weight: 600;">A Check</div>
              <div style="color: var(--text-muted); font-size: 0.5rem;">800-1000h</div>
            </div>
          </div>
          <div style="margin-top: 0.4rem; padding: 0.3rem; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 3px;">
            <div style="font-size: 0.55rem; color: #f59e0b;">
              <strong>C & D checks</strong> require manual scheduling
            </div>
          </div>
        </div>

        <!-- Description -->
        ${aircraft.description ? `
        <div style="background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.6rem; margin-top: 0.6rem;">
          <h4 style="margin: 0 0 0.3rem 0; color: var(--text-muted); font-size: 0.6rem; text-transform: uppercase;">About</h4>
          <div style="font-size: 0.7rem; color: var(--text-secondary); line-height: 1.3;">${aircraft.description}</div>
        </div>
        ` : ''}
      </div>
    </div>
  `;

  const fullName = `${aircraft.manufacturer} ${aircraft.model}${aircraft.variant ? ' ' + aircraft.variant : ''}`;
  document.getElementById('detailModalTitle').textContent = fullName;
  document.getElementById('aircraftDetailModal').style.display = 'flex';

  // Hide the default purchase button since we have inline buttons now
  const purchaseBtn = document.getElementById('purchaseAircraftBtn');
  if (purchaseBtn) {
    purchaseBtn.style.display = 'none';
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
        <h3 style="margin: 0 0 1rem 0; color: var(--accent-color);">${selectedAircraft.manufacturer} ${selectedAircraft.model}${selectedAircraft.variant ? (selectedAircraft.variant.startsWith('-') ? selectedAircraft.variant : '-' + selectedAircraft.variant) : ''}</h3>
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
    ? `${selectedAircraft.manufacturer} ${selectedAircraft.model}${selectedAircraft.variant.startsWith('-') ? selectedAircraft.variant : '-' + selectedAircraft.variant}`
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
        autoScheduleWeekly: autoSchedulePrefs.autoScheduleWeekly || false,
        autoScheduleA: autoSchedulePrefs.autoScheduleA || false
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
              <input type="checkbox" id="autoScheduleAll" checked style="opacity: 0; width: 0; height: 0;">
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
              <input type="checkbox" id="autoScheduleDaily" checked style="opacity: 0; width: 0; height: 0;">
              <span class="toggle-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #4b5563; transition: 0.3s; border-radius: 20px;"></span>
            </label>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: var(--surface); border-radius: 4px;">
            <span style="font-size: 0.85rem; color: #8B5CF6;">Weekly</span>
            <label class="toggle-switch" style="position: relative; display: inline-block; width: 36px; height: 20px;">
              <input type="checkbox" id="autoScheduleWeekly" checked style="opacity: 0; width: 0; height: 0;">
              <span class="toggle-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #4b5563; transition: 0.3s; border-radius: 20px;"></span>
            </label>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; background: var(--surface); border-radius: 4px;">
            <span style="font-size: 0.85rem; color: #3B82F6;">A Check</span>
            <label class="toggle-switch" style="position: relative; display: inline-block; width: 36px; height: 20px;">
              <input type="checkbox" id="autoScheduleA" checked style="opacity: 0; width: 0; height: 0;">
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

  // Auto-schedule toggle handlers (only for light checks: Daily, Weekly, A)
  // C and D checks are heavy maintenance and scheduled manually when due
  const autoScheduleAll = document.getElementById('autoScheduleAll');
  const autoScheduleDaily = document.getElementById('autoScheduleDaily');
  const autoScheduleWeekly = document.getElementById('autoScheduleWeekly');
  const autoScheduleA = document.getElementById('autoScheduleA');

  const individualToggles = [autoScheduleDaily, autoScheduleWeekly, autoScheduleA];

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
      autoScheduleWeekly: autoScheduleWeekly.checked,
      autoScheduleA: autoScheduleA.checked
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
  showLeaseConfirmationDialog();
}

// Dedicated lease confirmation dialog with lessor info, check dates, and duration
function showLeaseConfirmationDialog() {
  if (!selectedAircraft) return;

  const fullName = selectedAircraft.variant
    ? `${selectedAircraft.manufacturer} ${selectedAircraft.model}${selectedAircraft.variant.startsWith('-') ? selectedAircraft.variant : '-' + selectedAircraft.variant}`
    : `${selectedAircraft.manufacturer} ${selectedAircraft.model}`;

  const conditionPercent = selectedAircraft.conditionPercentage || (selectedAircraft.condition === 'New' ? 100 : 70);
  const isNew = currentCategory === 'new';
  const lessor = selectedAircraft.lessor;

  const overlay = document.createElement('div');
  overlay.id = 'leaseConfirmOverlay';
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
    <div style="background: var(--surface); border: 1px solid var(--accent-color); border-radius: 8px; padding: 1.5rem; width: 95%; max-width: 950px; margin: auto;">
      <h2 style="margin-bottom: 1rem; color: var(--accent-color); text-align: center; font-size: 1.2rem;">CONFIRM LEASE</h2>

      <!-- Two Column Layout -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
        <!-- Left Column -->
        <div>
          <!-- Lessor Info -->
          ${lessor ? `
          <div style="margin-bottom: 1rem; padding: 0.75rem; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="color: var(--text-muted); font-size: 0.65rem; text-transform: uppercase; margin-bottom: 0.2rem;">Lessor</div>
                <div style="color: var(--text-primary); font-weight: 700; font-size: 1rem;">${lessor.name}</div>
                <div style="color: var(--text-muted); font-size: 0.75rem;">${lessor.country}</div>
              </div>
              <div style="text-align: right;">
                <div style="color: var(--text-muted); font-size: 0.6rem;">Professional Lessor</div>
              </div>
            </div>
          </div>
          ` : ''}

          <!-- Aircraft Info -->
          <div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--surface-elevated); border-radius: 6px;">
            <h3 style="margin: 0 0 0.5rem 0; color: var(--text-primary); font-size: 0.95rem;">${fullName}</h3>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; font-size: 0.8rem;">
              <div>
                <span style="color: var(--text-muted);">Cond:</span>
                <strong style="color: ${conditionPercent >= 80 ? '#10b981' : conditionPercent >= 60 ? '#f59e0b' : '#ef4444'};">${conditionPercent}%</strong>
              </div>
              <div>
                <span style="color: var(--text-muted);">Pax:</span>
                <strong>${selectedAircraft.passengerCapacity}</strong>
              </div>
              <div>
                <span style="color: var(--text-muted);">Range:</span>
                <strong>${selectedAircraft.rangeNm}nm</strong>
              </div>
            </div>
          </div>

          <!-- Check Status (for used aircraft) -->
          ${!isNew ? `
          <div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--surface-elevated); border-radius: 6px;">
            <h4 style="margin: 0 0 0.5rem 0; color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase;">Maintenance Status</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
              <div style="padding: 0.5rem; background: rgba(220, 38, 38, 0.1); border: 1px solid rgba(220, 38, 38, 0.3); border-radius: 4px;">
                <div style="color: #DC2626; font-size: 0.65rem; font-weight: 600;">C CHECK DUE</div>
                <div style="color: ${selectedAircraft.cCheckRemainingDays < 180 ? '#DC2626' : 'var(--text-primary)'}; font-weight: 700; font-size: 0.9rem;">${selectedAircraft.cCheckRemaining || 'Full'}</div>
                <div style="color: var(--text-muted); font-size: 0.6rem;">${selectedAircraft.cCheckRemainingDays || 0} days</div>
              </div>
              <div style="padding: 0.5rem; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 4px;">
                <div style="color: #10B981; font-size: 0.65rem; font-weight: 600;">D CHECK DUE</div>
                <div style="color: ${selectedAircraft.dCheckRemainingDays < 365 ? '#FFA500' : 'var(--text-primary)'}; font-weight: 700; font-size: 0.9rem;">${selectedAircraft.dCheckRemaining || 'Full'}</div>
                <div style="color: var(--text-muted); font-size: 0.6rem;">${selectedAircraft.dCheckRemainingDays || 0} days</div>
              </div>
            </div>
          </div>
          ` : ''}

          <!-- Lease Duration Selection -->
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.4rem; color: var(--text-primary); font-weight: 600; font-size: 0.85rem;">Lease Duration</label>
            <div style="display: flex; gap: 1rem; align-items: center;">
              <!-- Years Spinner -->
              <div style="flex: 1; display: flex; align-items: center; background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.25rem;">
                <button type="button" id="leaseYearsDown" style="width: 36px; height: 36px; background: var(--surface); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); cursor: pointer; font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; justify-content: center;">−</button>
                <div style="flex: 1; text-align: center;">
                  <div id="leaseYearsValue" style="font-weight: 700; font-size: 1.4rem; color: var(--accent-color);">1</div>
                  <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: -2px;">years</div>
                </div>
                <button type="button" id="leaseYearsUp" style="width: 36px; height: 36px; background: var(--surface); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); cursor: pointer; font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; justify-content: center;">+</button>
              </div>
              <!-- Months Spinner -->
              <div style="flex: 1; display: flex; align-items: center; background: var(--surface-elevated); border: 1px solid var(--border-color); border-radius: 6px; padding: 0.25rem;">
                <button type="button" id="leaseMonthsDown" style="width: 36px; height: 36px; background: var(--surface); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); cursor: pointer; font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; justify-content: center;">−</button>
                <div style="flex: 1; text-align: center;">
                  <div id="leaseMonthsValue" style="font-weight: 700; font-size: 1.4rem; color: var(--accent-color);">0</div>
                  <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: -2px;">months</div>
                </div>
                <button type="button" id="leaseMonthsUp" style="width: 36px; height: 36px; background: var(--surface); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); cursor: pointer; font-size: 1.2rem; font-weight: 700; display: flex; align-items: center; justify-content: center;">+</button>
              </div>
            </div>
            <div style="margin-top: 0.4rem; text-align: center; font-size: 0.75rem; color: var(--text-muted);">
              Total: <span id="leaseDurationTotal" style="color: var(--text-primary); font-weight: 600;">12 months</span> (min 6 months, max 10 years)
            </div>
          </div>

          <!-- Pricing Summary -->
          <div style="padding: 0.75rem; background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="color: var(--text-muted); font-size: 0.65rem;">Monthly Payment</div>
                <div style="color: var(--accent-color); font-weight: 700; font-size: 1.2rem;" id="leaseMonthlyDisplay">$${formatCurrency(selectedAircraft.leasePrice || 0)}</div>
              </div>
              <div style="text-align: right;">
                <div style="color: var(--text-muted); font-size: 0.65rem;">Total Commitment</div>
                <div style="color: var(--text-secondary); font-weight: 600; font-size: 0.95rem;" id="leaseTotalDisplay">$${formatCurrency((selectedAircraft.leasePrice || 0) * 12)}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column -->
        <div>
          <!-- Registration Input -->
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.4rem; color: var(--text-primary); font-weight: 600; font-size: 0.85rem;">Aircraft Registration</label>
            <div style="display: flex; align-items: stretch; border: 1px solid var(--border-color); border-radius: 4px; overflow: hidden; background: var(--surface-elevated);">
              <div id="leaseRegistrationPrefix" style="padding: 0.6rem; background: var(--surface); border-right: 1px solid var(--border-color); color: var(--text-secondary); font-weight: 600; font-size: 0.95rem; display: flex; align-items: center;">${registrationPrefix}</div>
              <input
                type="text"
                id="leaseRegistrationSuffix"
                placeholder="${typeof getSuffixPlaceholder === 'function' ? getSuffixPlaceholder(registrationPrefix) : (registrationPrefix === 'N-' ? '12345' : 'ABCD')}"
                maxlength="${typeof getExpectedSuffixLength === 'function' ? getExpectedSuffixLength(registrationPrefix) : 6}"
                style="flex: 1; padding: 0.6rem; background: transparent; border: none; color: var(--text-primary); font-size: 0.95rem; outline: none; text-transform: uppercase;"
              />
            </div>
            <div id="leaseRegistrationError" style="margin-top: 0.4rem; color: var(--warning-color); font-size: 0.8rem; display: none;"></div>
          </div>

          <!-- Maintenance Auto-Scheduling -->
          <div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--surface-elevated); border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
              <label style="color: var(--text-primary); font-weight: 600; font-size: 0.85rem;">Maintenance Scheduling</label>
              <div style="display: flex; align-items: center; gap: 0.4rem;">
                <span style="font-size: 0.75rem; color: var(--text-secondary);">Auto All</span>
                <label class="toggle-switch" style="position: relative; display: inline-block; width: 40px; height: 22px;">
                  <input type="checkbox" id="leaseAutoScheduleAll" checked style="opacity: 0; width: 0; height: 0;">
                  <span class="toggle-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #4b5563; transition: 0.3s; border-radius: 22px;"></span>
                </label>
              </div>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem;">
              Auto-schedule recurring maintenance checks.
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem; background: var(--surface); border-radius: 4px;">
                <span style="font-size: 0.8rem; color: #FFA500;">Daily</span>
                <label class="toggle-switch" style="position: relative; display: inline-block; width: 32px; height: 18px;">
                  <input type="checkbox" id="leaseAutoScheduleDaily" checked style="opacity: 0; width: 0; height: 0;">
                  <span class="toggle-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #4b5563; transition: 0.3s; border-radius: 18px;"></span>
                </label>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem; background: var(--surface); border-radius: 4px;">
                <span style="font-size: 0.8rem; color: #8B5CF6;">Weekly</span>
                <label class="toggle-switch" style="position: relative; display: inline-block; width: 32px; height: 18px;">
                  <input type="checkbox" id="leaseAutoScheduleWeekly" checked style="opacity: 0; width: 0; height: 0;">
                  <span class="toggle-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #4b5563; transition: 0.3s; border-radius: 18px;"></span>
                </label>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem; background: var(--surface); border-radius: 4px;">
                <span style="font-size: 0.8rem; color: #3B82F6;">A Check</span>
                <label class="toggle-switch" style="position: relative; display: inline-block; width: 32px; height: 18px;">
                  <input type="checkbox" id="leaseAutoScheduleA" checked style="opacity: 0; width: 0; height: 0;">
                  <span class="toggle-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #4b5563; transition: 0.3s; border-radius: 18px;"></span>
                </label>
              </div>
            </div>
            <div style="margin-top: 0.5rem; padding: 0.4rem; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 4px;">
              <div style="font-size: 0.7rem; color: #f59e0b;">
                <strong>C & D Checks</strong> are heavy maintenance. Schedule manually when due.
              </div>
            </div>
          </div>

          <!-- Lease Terms Note -->
          <div style="margin-bottom: 1rem; padding: 0.75rem; background: var(--surface-elevated); border-radius: 6px;">
            <h4 style="margin: 0 0 0.5rem 0; color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase;">Lease Terms</h4>
            <ul style="margin: 0; padding-left: 1rem; font-size: 0.75rem; color: var(--text-secondary);">
              <li>Maintenance included in lease rate</li>
              <li>Early termination fees may apply</li>
              <li>Aircraft must be returned in good condition</li>
              <li>Longer terms may qualify for better rates</li>
            </ul>
          </div>

          <!-- Action Buttons -->
          <div style="display: flex; gap: 0.75rem;">
            <button id="confirmLeaseBtn" class="btn btn-primary" style="flex: 1; padding: 0.7rem; font-size: 0.9rem;">Sign Lease Agreement</button>
            <button id="cancelLeaseBtn" class="btn btn-secondary" style="flex: 1; padding: 0.7rem; font-size: 0.9rem;">Cancel</button>
          </div>
        </div>
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

  // Duration spinner logic
  let leaseYears = 1;
  let leaseMonths = 0;
  const minTotalMonths = 6;
  const maxTotalMonths = 120; // 10 years

  const yearsValueEl = document.getElementById('leaseYearsValue');
  const monthsValueEl = document.getElementById('leaseMonthsValue');
  const totalDisplayEl = document.getElementById('leaseDurationTotal');
  const totalCommitmentEl = document.getElementById('leaseTotalDisplay');

  function getTotalMonths() {
    return leaseYears * 12 + leaseMonths;
  }

  function updateDurationDisplay() {
    yearsValueEl.textContent = leaseYears;
    monthsValueEl.textContent = leaseMonths;
    const total = getTotalMonths();
    totalDisplayEl.textContent = `${total} months`;

    // Update total commitment price
    const monthlyPrice = selectedAircraft.leasePrice || 0;
    totalCommitmentEl.textContent = '$' + formatCurrency(monthlyPrice * total);
  }

  function adjustYears(delta) {
    const newYears = leaseYears + delta;
    const newTotal = newYears * 12 + leaseMonths;

    // Check bounds
    if (newYears < 0 || newYears > 10) return;
    if (newTotal < minTotalMonths || newTotal > maxTotalMonths) return;

    leaseYears = newYears;
    updateDurationDisplay();
  }

  function adjustMonths(delta) {
    let newMonths = leaseMonths + delta;
    let newYears = leaseYears;

    // Handle wraparound
    if (newMonths < 0) {
      if (newYears > 0) {
        newYears--;
        newMonths = 11;
      } else {
        return; // Can't go below 0
      }
    } else if (newMonths > 11) {
      if (newYears < 10) {
        newYears++;
        newMonths = 0;
      } else {
        return; // Can't exceed 10 years
      }
    }

    const newTotal = newYears * 12 + newMonths;
    if (newTotal < minTotalMonths || newTotal > maxTotalMonths) return;

    leaseYears = newYears;
    leaseMonths = newMonths;
    updateDurationDisplay();
  }

  // Spinner button event listeners
  document.getElementById('leaseYearsDown').addEventListener('click', () => adjustYears(-1));
  document.getElementById('leaseYearsUp').addEventListener('click', () => adjustYears(1));
  document.getElementById('leaseMonthsDown').addEventListener('click', () => adjustMonths(-1));
  document.getElementById('leaseMonthsUp').addEventListener('click', () => adjustMonths(1));

  // Initialize display
  updateDurationDisplay();

  // Auto-schedule toggle handlers
  const autoScheduleAll = document.getElementById('leaseAutoScheduleAll');
  const autoScheduleDaily = document.getElementById('leaseAutoScheduleDaily');
  const autoScheduleWeekly = document.getElementById('leaseAutoScheduleWeekly');
  const autoScheduleA = document.getElementById('leaseAutoScheduleA');
  const individualToggles = [autoScheduleDaily, autoScheduleWeekly, autoScheduleA];

  autoScheduleAll.addEventListener('change', () => {
    const checked = autoScheduleAll.checked;
    individualToggles.forEach(toggle => { toggle.checked = checked; });
  });

  individualToggles.forEach(toggle => {
    toggle.addEventListener('change', () => {
      const allChecked = individualToggles.every(t => t.checked);
      const noneChecked = individualToggles.every(t => !t.checked);
      autoScheduleAll.checked = allChecked;
      autoScheduleAll.indeterminate = !allChecked && !noneChecked;
    });
  });

  // Registration validation
  const registrationSuffix = document.getElementById('leaseRegistrationSuffix');
  const registrationError = document.getElementById('leaseRegistrationError');

  function validateLeaseRegistration(suffix) {
    const trimmedSuffix = suffix.trim().toUpperCase();
    if (typeof validateRegistrationSuffix === 'function') {
      const validation = validateRegistrationSuffix(trimmedSuffix, registrationPrefix);
      if (!validation.valid) return validation;
      return { valid: true, value: registrationPrefix + validation.value };
    }
    if (trimmedSuffix.length < 1) {
      return { valid: false, message: 'Please enter a registration suffix' };
    }
    if (!/^[A-Z0-9-]+$/.test(trimmedSuffix)) {
      return { valid: false, message: 'Registration can only contain letters, numbers, and hyphens' };
    }
    return { valid: true, value: registrationPrefix + trimmedSuffix };
  }

  // Confirm button
  document.getElementById('confirmLeaseBtn').addEventListener('click', () => {
    const suffix = registrationSuffix.value.trim();
    const validation = validateLeaseRegistration(suffix);

    if (!validation.valid) {
      registrationError.textContent = validation.message;
      registrationError.style.display = 'block';
      return;
    }

    // Collect auto-schedule preferences
    const autoSchedulePrefs = {
      autoScheduleDaily: autoScheduleDaily.checked,
      autoScheduleWeekly: autoScheduleWeekly.checked,
      autoScheduleA: autoScheduleA.checked
    };

    document.body.removeChild(overlay);
    confirmLease(validation.value, autoSchedulePrefs, getTotalMonths());
  });

  // Cancel button
  document.getElementById('cancelLeaseBtn').addEventListener('click', () => {
    document.body.removeChild(overlay);
  });

  // Clear error on input
  registrationSuffix.addEventListener('input', () => {
    registrationError.style.display = 'none';
  });

  // Focus registration input
  registrationSuffix.focus();
}

// Actually process the lease after confirmation
async function confirmLease(registration, autoSchedulePrefs = {}, leaseDurationMonths = 12) {
  if (!selectedAircraft) return;

  // Show processing overlay
  showProcessingOverlay('lease');

  try {
    const conditionPercent = selectedAircraft.conditionPercentage || (selectedAircraft.condition === 'New' ? 100 : 70);
    const ageYears = selectedAircraft.age || 0;

    // Use variantId for used aircraft, id for new aircraft
    const aircraftId = selectedAircraft.variantId || selectedAircraft.id;

    // Get lessor info
    const lessor = selectedAircraft.lessor;

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
        leaseDurationMonths: leaseDurationMonths,
        lessorName: lessor?.name || null,
        lessorShortName: lessor?.shortName || null,
        lessorCountry: lessor?.country || null,
        maintenanceCostPerHour: selectedAircraft.maintenanceCostPerHour,
        fuelBurnPerHour: selectedAircraft.fuelBurnPerHour,
        purchasePrice: selectedAircraft.purchasePrice, // For reference
        registration: registration,
        // Check validity for used aircraft
        cCheckRemainingDays: selectedAircraft.cCheckRemainingDays || null,
        dCheckRemainingDays: selectedAircraft.dCheckRemainingDays || null,
        // Auto-schedule preferences (light checks only - C/D scheduled manually)
        autoScheduleDaily: autoSchedulePrefs.autoScheduleDaily || false,
        autoScheduleWeekly: autoSchedulePrefs.autoScheduleWeekly || false,
        autoScheduleA: autoSchedulePrefs.autoScheduleA || false
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