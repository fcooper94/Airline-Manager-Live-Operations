console.log('[PRICING] Script loaded successfully');

let globalPricing = {};
let aircraftTypePricing = {};
let routes = [];
let userFleet = [];
let filteredRoutes = [];

// Fetch global pricing defaults
async function fetchGlobalPricing() {
  try {
    console.log('[PRICING] Fetching from /api/pricing/global...');
    const response = await fetch('/api/pricing/global');
    console.log('[PRICING] Response status:', response.status);
    console.log('[PRICING] Response Content-Type:', response.headers.get('content-type'));

    // Check if we got redirected (HTML response instead of JSON)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      console.error('[PRICING] Got HTML response instead of JSON - likely redirected. Are you logged in?');
      alert('Session expired. Please refresh and log in again.');
      return;
    }

    if (response.ok) {
      globalPricing = await response.json();
      console.log('[PRICING] Global pricing loaded:', globalPricing);
      populateGlobalPricing();
    } else {
      console.warn('[PRICING] No global pricing found, using defaults');
      // Initialize with empty defaults
      globalPricing = {
        economyPrice: 0,
        economyPlusPrice: 0,
        businessPrice: 0,
        firstPrice: 0,
        cargoLightRate: 0,
        cargoStandardRate: 0,
        cargoHeavyRate: 0
      };
      populateGlobalPricing();
    }
  } catch (error) {
    console.error('[PRICING] Error fetching global pricing:', error);
    // Still initialize with defaults on error
    globalPricing = {
      economyPrice: 0,
      economyPlusPrice: 0,
      businessPrice: 0,
      firstPrice: 0,
      cargoLightRate: 0,
      cargoStandardRate: 0,
      cargoHeavyRate: 0
    };
    populateGlobalPricing();
  }
}

// Populate global pricing fields
function populateGlobalPricing() {
  document.getElementById('global-economy').value = globalPricing.economyPrice || '';
  document.getElementById('global-economyPlus').value = globalPricing.economyPlusPrice || '';
  document.getElementById('global-business').value = globalPricing.businessPrice || '';
  document.getElementById('global-first').value = globalPricing.firstPrice || '';
  document.getElementById('global-cargoLight').value = globalPricing.cargoLightRate || '';
  document.getElementById('global-cargoStandard').value = globalPricing.cargoStandardRate || '';
  document.getElementById('global-cargoHeavy').value = globalPricing.cargoHeavyRate || '';
}

// Save global pricing
async function saveGlobalPricing() {
  const pricing = {
    economyPrice: parseFloat(document.getElementById('global-economy').value) || 0,
    economyPlusPrice: parseFloat(document.getElementById('global-economyPlus').value) || 0,
    businessPrice: parseFloat(document.getElementById('global-business').value) || 0,
    firstPrice: parseFloat(document.getElementById('global-first').value) || 0,
    cargoLightRate: parseFloat(document.getElementById('global-cargoLight').value) || 0,
    cargoStandardRate: parseFloat(document.getElementById('global-cargoStandard').value) || 0,
    cargoHeavyRate: parseFloat(document.getElementById('global-cargoHeavy').value) || 0
  };

  try {
    const response = await fetch('/api/pricing/global', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pricing)
    });

    if (response.ok) {
      globalPricing = await response.json();
      alert('Global pricing saved successfully');
      // Refresh aircraft type and route displays to show updated defaults
      await fetchAircraftTypes();
      await fetchRoutes();
    } else {
      const error = await response.json();
      alert('Error saving global pricing: ' + error.error);
    }
  } catch (error) {
    console.error('Error saving global pricing:', error);
    alert('Error saving global pricing');
  }
}

// Fetch user's fleet to get aircraft types
async function fetchUserFleet() {
  try {
    console.log('[PRICING] Fetching fleet from /api/fleet...');
    const response = await fetch('/api/fleet');
    console.log('[PRICING] Fleet response status:', response.status);

    // Check for redirect
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      console.error('[PRICING] Fleet API returned HTML - likely redirected');
      alert('Session expired. Please refresh and log in again.');
      throw new Error('Session expired');
    }

    if (response.ok) {
      userFleet = await response.json();
      console.log('[PRICING] Fleet loaded:', userFleet.length, 'aircraft');
    } else {
      console.error('[PRICING] Error response from fleet API:', response.status);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[PRICING] Error details:', errorData);
      throw new Error(errorData.error || 'Failed to fetch fleet');
    }
  } catch (error) {
    console.error('[PRICING] Error fetching fleet:', error);
    throw error;
  }
}

// Fetch aircraft type pricing
async function fetchAircraftTypes() {
  try {
    await fetchUserFleet();

    // Group aircraft by type
    const aircraftTypes = {};
    userFleet.forEach(aircraft => {
      const typeKey = `${aircraft.aircraft.manufacturer}_${aircraft.aircraft.model}_${aircraft.aircraft.variant || 'default'}`;
      const displayName = `${aircraft.aircraft.manufacturer} ${aircraft.aircraft.model}${aircraft.aircraft.variant ? '-' + aircraft.aircraft.variant : ''}`;

      if (!aircraftTypes[typeKey]) {
        aircraftTypes[typeKey] = {
          key: typeKey,
          displayName: displayName,
          aircraft: aircraft.aircraft,
          count: 0
        };
      }
      aircraftTypes[typeKey].count++;
    });

    // Fetch aircraft type pricing from server
    try {
      const response = await fetch('/api/pricing/aircraft-types');
      if (response.ok) {
        aircraftTypePricing = await response.json();
      } else {
        console.error('Error response from aircraft-types API:', response.status);
      }
    } catch (error) {
      console.error('Error fetching aircraft type pricing:', error);
    }

    displayAircraftTypePricing(aircraftTypes);
  } catch (error) {
    console.error('Error in fetchAircraftTypes:', error);
    const container = document.getElementById('aircraftTypePricingList');
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: var(--warning-color);">
        Error loading aircraft types: ${error.message}
      </div>
    `;
  }
}

// Display aircraft type pricing
function displayAircraftTypePricing(aircraftTypes) {
  const container = document.getElementById('aircraftTypePricingList');

  if (Object.keys(aircraftTypes).length === 0) {
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
        No aircraft in your fleet
      </div>
    `;
    return;
  }

  let html = '';

  Object.keys(aircraftTypes).sort().forEach(typeKey => {
    const type = aircraftTypes[typeKey];
    const pricing = aircraftTypePricing[typeKey] || {};

    html += `
      <div class="pricing-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div>
            <h3 style="color: var(--text-primary); margin: 0; font-size: 1.1rem; font-weight: 600;">
              ${type.displayName}
            </h3>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin: 0.25rem 0 0 0;">
              ${type.count} aircraft in fleet
            </p>
          </div>
          <button onclick="saveAircraftTypePricing('${typeKey}')" class="btn btn-primary btn-sm">
            SAVE
          </button>
        </div>

        <div style="margin-bottom: 1.5rem;">
          <h4 style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.75rem; font-weight: 600;">PASSENGER CLASSES</h4>
          <div class="pricing-grid">
            <div class="price-input-group">
              <label>Economy</label>
              <div class="price-input-wrapper">
                <input
                  type="number"
                  id="aircraft-${typeKey}-economy"
                  value="${pricing.economyPrice || ''}"
                  placeholder="${globalPricing.economyPrice || '0'}"
                  min="0"
                  step="1"
                />
              </div>
              ${pricing.economyPrice ? '<div class="override-status"><span class="overridden">Overriding global</span></div>' : '<div class="override-status">Using global default</div>'}
            </div>
            <div class="price-input-group">
              <label>Economy Plus</label>
              <div class="price-input-wrapper">
                <input
                  type="number"
                  id="aircraft-${typeKey}-economyPlus"
                  value="${pricing.economyPlusPrice || ''}"
                  placeholder="${globalPricing.economyPlusPrice || '0'}"
                  min="0"
                  step="1"
                />
              </div>
              ${pricing.economyPlusPrice ? '<div class="override-status"><span class="overridden">Overriding global</span></div>' : '<div class="override-status">Using global default</div>'}
            </div>
            <div class="price-input-group">
              <label>Business</label>
              <div class="price-input-wrapper">
                <input
                  type="number"
                  id="aircraft-${typeKey}-business"
                  value="${pricing.businessPrice || ''}"
                  placeholder="${globalPricing.businessPrice || '0'}"
                  min="0"
                  step="1"
                />
              </div>
              ${pricing.businessPrice ? '<div class="override-status"><span class="overridden">Overriding global</span></div>' : '<div class="override-status">Using global default</div>'}
            </div>
            <div class="price-input-group">
              <label>First</label>
              <div class="price-input-wrapper">
                <input
                  type="number"
                  id="aircraft-${typeKey}-first"
                  value="${pricing.firstPrice || ''}"
                  placeholder="${globalPricing.firstPrice || '0'}"
                  min="0"
                  step="1"
                />
              </div>
              ${pricing.firstPrice ? '<div class="override-status"><span class="overridden">Overriding global</span></div>' : '<div class="override-status">Using global default</div>'}
            </div>
          </div>
        </div>

        <div>
          <h4 style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.75rem; font-weight: 600;">CARGO RATES (per ton)</h4>
          <div class="pricing-grid">
            <div class="price-input-group">
              <label>Light Cargo</label>
              <div class="price-input-wrapper">
                <input
                  type="number"
                  id="aircraft-${typeKey}-cargoLight"
                  value="${pricing.cargoLightRate || ''}"
                  placeholder="${globalPricing.cargoLightRate || '0'}"
                  min="0"
                  step="10"
                />
              </div>
              ${pricing.cargoLightRate ? '<div class="override-status"><span class="overridden">Overriding global</span></div>' : '<div class="override-status">Using global default</div>'}
            </div>
            <div class="price-input-group">
              <label>Standard Cargo</label>
              <div class="price-input-wrapper">
                <input
                  type="number"
                  id="aircraft-${typeKey}-cargoStandard"
                  value="${pricing.cargoStandardRate || ''}"
                  placeholder="${globalPricing.cargoStandardRate || '0'}"
                  min="0"
                  step="10"
                />
              </div>
              ${pricing.cargoStandardRate ? '<div class="override-status"><span class="overridden">Overriding global</span></div>' : '<div class="override-status">Using global default</div>'}
            </div>
            <div class="price-input-group">
              <label>Heavy Cargo</label>
              <div class="price-input-wrapper">
                <input
                  type="number"
                  id="aircraft-${typeKey}-cargoHeavy"
                  value="${pricing.cargoHeavyRate || ''}"
                  placeholder="${globalPricing.cargoHeavyRate || '0'}"
                  min="0"
                  step="10"
                />
              </div>
              ${pricing.cargoHeavyRate ? '<div class="override-status"><span class="overridden">Overriding global</span></div>' : '<div class="override-status">Using global default</div>'}
            </div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Save aircraft type pricing
async function saveAircraftTypePricing(typeKey) {
  const getValue = (id) => {
    const value = document.getElementById(id).value;
    return value ? parseFloat(value) : null;
  };

  const pricing = {
    aircraftTypeKey: typeKey,
    economyPrice: getValue(`aircraft-${typeKey}-economy`),
    economyPlusPrice: getValue(`aircraft-${typeKey}-economyPlus`),
    businessPrice: getValue(`aircraft-${typeKey}-business`),
    firstPrice: getValue(`aircraft-${typeKey}-first`),
    cargoLightRate: getValue(`aircraft-${typeKey}-cargoLight`),
    cargoStandardRate: getValue(`aircraft-${typeKey}-cargoStandard`),
    cargoHeavyRate: getValue(`aircraft-${typeKey}-cargoHeavy`)
  };

  try {
    const response = await fetch('/api/pricing/aircraft-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pricing)
    });

    if (response.ok) {
      alert('Aircraft type pricing saved successfully');
      await fetchAircraftTypes();
      await fetchRoutes();
    } else {
      const error = await response.json();
      alert('Error saving pricing: ' + error.error);
    }
  } catch (error) {
    console.error('Error saving aircraft type pricing:', error);
    alert('Error saving pricing');
  }
}

// Fetch routes
async function fetchRoutes() {
  try {
    console.log('[PRICING] Fetching routes from /api/routes...');
    const response = await fetch('/api/routes');
    console.log('[PRICING] Routes response status:', response.status);

    // Check for redirect
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      console.error('[PRICING] Routes API returned HTML - likely redirected');
      const container = document.getElementById('routePricingList');
      container.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--error-color);">
          Session expired. Please refresh the page and log in again.
        </div>
      `;
      return;
    }

    if (response.ok) {
      routes = await response.json();
      filteredRoutes = [...routes];
      console.log('[PRICING] Routes loaded:', routes.length);
      displayRoutes();
    } else {
      console.error('[PRICING] Error response from routes API:', response.status);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[PRICING] Error details:', errorData);

      const container = document.getElementById('routePricingList');
      container.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--warning-color);">
          Error loading routes: ${errorData.error || 'Failed to fetch routes'}
        </div>
      `;
    }
  } catch (error) {
    console.error('[PRICING] Error fetching routes:', error);
    const container = document.getElementById('routePricingList');
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: var(--warning-color);">
        Error loading routes: ${error.message}
      </div>
    `;
  }
}

// Filter routes
function filterRoutes() {
  const searchTerm = document.getElementById('routeSearchInput').value.toLowerCase();

  if (!searchTerm) {
    filteredRoutes = [...routes];
  } else {
    filteredRoutes = routes.filter(route => {
      return (
        route.routeNumber.toLowerCase().includes(searchTerm) ||
        route.returnRouteNumber.toLowerCase().includes(searchTerm) ||
        route.departureAirport.icaoCode.toLowerCase().includes(searchTerm) ||
        route.departureAirport.name.toLowerCase().includes(searchTerm) ||
        route.arrivalAirport.icaoCode.toLowerCase().includes(searchTerm) ||
        route.arrivalAirport.name.toLowerCase().includes(searchTerm)
      );
    });
  }

  displayRoutes();
}

// Display routes
function displayRoutes() {
  const container = document.getElementById('routePricingList');

  if (filteredRoutes.length === 0) {
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
        No routes found
      </div>
    `;
    return;
  }

  let html = '';

  filteredRoutes.forEach(route => {
    const depAirport = route.departureAirport;
    const arrAirport = route.arrivalAirport;

    // Determine effective pricing level
    let pricingLevel = 'global';
    let pricingSource = 'Global defaults';

    if (route.economyPrice > 0) {
      pricingLevel = 'route';
      pricingSource = 'Route-specific pricing';
    } else if (route.assignedAircraft) {
      const typeKey = `${route.assignedAircraft.aircraft.manufacturer}_${route.assignedAircraft.aircraft.model}_${route.assignedAircraft.aircraft.variant || 'default'}`;
      if (aircraftTypePricing[typeKey] && aircraftTypePricing[typeKey].economyPrice) {
        pricingLevel = 'aircraft';
        pricingSource = 'Aircraft type pricing';
      }
    }

    html += `
      <div class="pricing-card" style="cursor: pointer;" onclick="toggleRoutePricing('${route.id}')">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
              <h3 style="color: var(--text-primary); margin: 0; font-size: 1.1rem; font-weight: 600;">
                ${route.routeNumber} / ${route.returnRouteNumber}
              </h3>
              <span class="pricing-level-badge ${pricingLevel}">${pricingLevel.toUpperCase()}</span>
            </div>
            <p style="color: var(--text-secondary); margin: 0; font-size: 0.9rem;">
              ${depAirport.icaoCode} (${depAirport.city}) → ${arrAirport.icaoCode} (${arrAirport.city})
            </p>
            <p style="color: var(--text-muted); margin: 0.25rem 0 0 0; font-size: 0.85rem;">
              ${pricingSource}
            </p>
          </div>
          <button onclick="event.stopPropagation(); toggleRoutePricing('${route.id}')" class="btn btn-secondary btn-sm">
            MANAGE
          </button>
        </div>

        <div id="route-pricing-${route.id}" style="display: none; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color);">
          <div style="margin-bottom: 1.5rem;">
            <h4 style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.75rem; font-weight: 600;">PASSENGER CLASSES</h4>
            <div class="pricing-grid">
              <div class="price-input-group">
                <label>Economy</label>
                <div class="price-input-wrapper">
                  <input
                    type="number"
                    id="route-${route.id}-economy"
                    value="${route.economyPrice || ''}"
                    placeholder="Default"
                    min="0"
                    step="1"
                  />
                </div>
              </div>
              <div class="price-input-group">
                <label>Economy Plus</label>
                <div class="price-input-wrapper">
                  <input
                    type="number"
                    id="route-${route.id}-economyPlus"
                    value="${route.economyPlusPrice || ''}"
                    placeholder="Default"
                    min="0"
                    step="1"
                  />
                </div>
              </div>
              <div class="price-input-group">
                <label>Business</label>
                <div class="price-input-wrapper">
                  <input
                    type="number"
                    id="route-${route.id}-business"
                    value="${route.businessPrice || ''}"
                    placeholder="Default"
                    min="0"
                    step="1"
                  />
                </div>
              </div>
              <div class="price-input-group">
                <label>First</label>
                <div class="price-input-wrapper">
                  <input
                    type="number"
                    id="route-${route.id}-first"
                    value="${route.firstPrice || ''}"
                    placeholder="Default"
                    min="0"
                    step="1"
                  />
                </div>
              </div>
            </div>
          </div>

          <div style="margin-bottom: 1.5rem;">
            <h4 style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.75rem; font-weight: 600;">CARGO RATES (per ton)</h4>
            <div class="pricing-grid">
              <div class="price-input-group">
                <label>Light Cargo</label>
                <div class="price-input-wrapper">
                  <input
                    type="number"
                    id="route-${route.id}-cargoLight"
                    value="${route.cargoLightRate || ''}"
                    placeholder="Default"
                    min="0"
                    step="10"
                  />
                </div>
              </div>
              <div class="price-input-group">
                <label>Standard Cargo</label>
                <div class="price-input-wrapper">
                  <input
                    type="number"
                    id="route-${route.id}-cargoStandard"
                    value="${route.cargoStandardRate || ''}"
                    placeholder="Default"
                    min="0"
                    step="10"
                  />
                </div>
              </div>
              <div class="price-input-group">
                <label>Heavy Cargo</label>
                <div class="price-input-wrapper">
                  <input
                    type="number"
                    id="route-${route.id}-cargoHeavy"
                    value="${route.cargoHeavyRate || ''}"
                    placeholder="Default"
                    min="0"
                    step="10"
                  />
                </div>
              </div>
            </div>
          </div>

          <div style="display: flex; gap: 1rem; justify-content: flex-end;">
            <button onclick="event.stopPropagation(); clearRoutePricing('${route.id}')" class="btn btn-secondary btn-sm">
              CLEAR OVERRIDES
            </button>
            <button onclick="event.stopPropagation(); saveRoutePricing('${route.id}')" class="btn btn-primary btn-sm">
              SAVE ROUTE PRICING
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Toggle route pricing editor
function toggleRoutePricing(routeId) {
  const editor = document.getElementById(`route-pricing-${routeId}`);
  if (editor.style.display === 'none') {
    editor.style.display = 'block';
  } else {
    editor.style.display = 'none';
  }
}

// Save route pricing
async function saveRoutePricing(routeId) {
  const getValue = (id) => {
    const value = document.getElementById(id).value;
    return value ? parseFloat(value) : 0;
  };

  const pricing = {
    economyPrice: getValue(`route-${routeId}-economy`),
    economyPlusPrice: getValue(`route-${routeId}-economyPlus`),
    businessPrice: getValue(`route-${routeId}-business`),
    firstPrice: getValue(`route-${routeId}-first`),
    cargoLightRate: getValue(`route-${routeId}-cargoLight`),
    cargoStandardRate: getValue(`route-${routeId}-cargoStandard`),
    cargoHeavyRate: getValue(`route-${routeId}-cargoHeavy`)
  };

  try {
    const response = await fetch(`/api/routes/${routeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pricing)
    });

    if (response.ok) {
      alert('Route pricing saved successfully');
      await fetchRoutes();
    } else {
      const error = await response.json();
      alert('Error saving route pricing: ' + error.error);
    }
  } catch (error) {
    console.error('Error saving route pricing:', error);
    alert('Error saving route pricing');
  }
}

// Clear route pricing overrides
async function clearRoutePricing(routeId) {
  if (!confirm('Are you sure you want to clear all pricing overrides for this route?')) {
    return;
  }

  const pricing = {
    economyPrice: 0,
    economyPlusPrice: 0,
    businessPrice: 0,
    firstPrice: 0,
    cargoLightRate: 0,
    cargoStandardRate: 0,
    cargoHeavyRate: 0
  };

  try {
    const response = await fetch(`/api/routes/${routeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pricing)
    });

    if (response.ok) {
      alert('Route pricing cleared successfully');
      await fetchRoutes();
    } else {
      const error = await response.json();
      alert('Error clearing route pricing: ' + error.error);
    }
  } catch (error) {
    console.error('Error clearing route pricing:', error);
    alert('Error clearing route pricing');
  }
}

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[PRICING] DOMContentLoaded event fired');
  console.log('[PRICING] Pricing page initializing...');
  try {
    console.log('[PRICING] Fetching global pricing...');
    await fetchGlobalPricing();
    console.log('[PRICING] ✓ Global pricing complete');

    console.log('[PRICING] Fetching aircraft types...');
    await fetchAircraftTypes();
    console.log('[PRICING] ✓ Aircraft types complete');

    console.log('[PRICING] Fetching routes...');
    await fetchRoutes();
    console.log('[PRICING] ✓ Routes complete');

    console.log('[PRICING] ✓✓✓ Pricing page initialized successfully ✓✓✓');
  } catch (error) {
    console.error('[PRICING] ✗✗✗ Error initializing pricing page:', error);
    console.error('[PRICING] Error stack:', error.stack);
  }
});
