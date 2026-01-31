// World Map - Live Flight Tracking

let map = null;
let flightMarkers = new Map(); // Map of flight ID to marker
let routeLines = new Map(); // Map of flight ID to polyline
let airportMarkers = new Map(); // Map of airport ID to marker
let selectedFlightId = null;
let updateInterval = null;
let activeFlights = []; // Store flight data for selection
let airlineFilterMode = 'mine'; // 'mine' or 'all'

// Aircraft icon SVG
const aircraftSvg = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`;

// Wind adjustment for realistic flight times
// Jet stream flows west to east at mid-latitudes, making eastbound flights faster
const WIND_ADJUSTMENT_FACTOR = 0.13; // 13% variation for jet stream effect
const ROUTE_VARIATION_FACTOR = 0.035; // ±3.5% for natural-looking times

function getWindAdjustmentMultiplier(depLng, arrLng, depLat = 0, arrLat = 0) {
  // Calculate longitude difference (handling date line crossing)
  let lngDiff = arrLng - depLng;
  if (lngDiff > 180) lngDiff -= 360;
  else if (lngDiff < -180) lngDiff += 360;

  // Scale effect based on latitude (strongest at mid-latitudes 30-60°)
  const avgLat = Math.abs((depLat + arrLat) / 2);
  let latitudeScale = 1.0;
  if (avgLat < 20) latitudeScale = 0.2;
  else if (avgLat < 30) latitudeScale = 0.5;
  else if (avgLat > 60) latitudeScale = 0.6;

  // Only apply wind effect for significant east-west travel
  const totalLngTravel = Math.abs(lngDiff);
  if (totalLngTravel < 10) return 1.0;

  // Eastbound (positive lngDiff) = faster, Westbound = slower
  const direction = lngDiff > 0 ? -1 : 1;
  const eastWestRatio = Math.min(1, totalLngTravel / 90);
  const adjustment = direction * WIND_ADJUSTMENT_FACTOR * latitudeScale * eastWestRatio;

  return 1 + adjustment;
}

// Deterministic route-specific variation for natural-looking times
function getRouteVariation(depLat, depLng, arrLat, arrLng) {
  const coordSum = (depLat * 7.3) + (depLng * 11.7) + (arrLat * 13.1) + (arrLng * 17.9);
  const hash = Math.sin(coordSum) * 10000;
  const normalized = hash - Math.floor(hash);
  const variation = (normalized - 0.5) * 2 * ROUTE_VARIATION_FACTOR;
  return 1 + variation;
}

function calculateFlightDurationMs(distanceNm, depLng, arrLng, depLat, arrLat, cruiseSpeed = 450) {
  const baseHours = distanceNm / cruiseSpeed;
  const windMultiplier = getWindAdjustmentMultiplier(depLng, arrLng, depLat, arrLat);
  const routeVariation = getRouteVariation(depLat, depLng, arrLat, arrLng);
  return baseHours * windMultiplier * routeVariation * 60 * 60 * 1000;
}

// Round time string (HH:MM) to nearest 5 minutes
function roundTimeToNearest5(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const roundedMinutes = Math.round(minutes / 5) * 5;
  const adjustedHours = roundedMinutes === 60 ? (hours + 1) % 24 : hours;
  const finalMinutes = roundedMinutes === 60 ? 0 : roundedMinutes;
  return `${String(adjustedHours).padStart(2, '0')}:${String(finalMinutes).padStart(2, '0')}`;
}

// Dynamically load Leaflet library
function loadLeaflet() {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (typeof L !== 'undefined') {
      console.log('[WorldMap] Leaflet already loaded');
      resolve();
      return;
    }

    console.log('[WorldMap] Loading Leaflet library...');

    // Load CSS first
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    // Load JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      console.log('[WorldMap] Leaflet loaded successfully');
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load Leaflet'));
    };
    document.head.appendChild(script);
  });
}

// Initialize the map
function initMap() {
  console.log('[WorldMap] Initializing map...');

  // Create map centered on world view with world wrapping enabled
  map = L.map('map', {
    center: [30, 0],
    zoom: 3,
    minZoom: 2,
    maxZoom: 18,
    zoomControl: true,
    attributionControl: true,
    worldCopyJump: true  // Enable seamless world wrapping when panning
  });

  // Add dark tile layer (CartoDB Dark Matter) - noWrap: false allows tiles to repeat
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
    noWrap: false  // Allow tiles to wrap for infinite scrolling
  }).addTo(map);

  console.log('[WorldMap] Map initialized with dark theme');

  // Load active flights
  loadActiveFlights();

  // Set up auto-refresh every 10 seconds
  updateInterval = setInterval(loadActiveFlights, 10000);

  // Listen for world time updates to refresh positions
  window.addEventListener('worldTimeUpdated', () => {
    updateFlightPositions();
  });

  // Click on map to deselect flight
  map.on('click', (e) => {
    if (e.originalEvent.target === map.getContainer() || e.originalEvent.target.classList.contains('leaflet-tile')) {
      deselectFlight();
    }
  });

  // Close button handler
  const closeBtn = document.getElementById('closePanelBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      deselectFlight();
    });
  }
}

// Handle airline filter change
function handleAirlineFilterChange() {
  const select = document.getElementById('airlineFilter');
  airlineFilterMode = select.value;

  // Show/hide other airline legend
  const otherLegend = document.querySelector('.other-airline-legend');
  if (otherLegend) {
    otherLegend.style.display = airlineFilterMode === 'all' ? 'flex' : 'none';
  }

  // Clear current flights and reload
  clearMap();
  deselectFlight();
  loadActiveFlights();
}

// Expose handleAirlineFilterChange globally for onclick handlers
window.handleAirlineFilterChange = handleAirlineFilterChange;

// Load active flights from API
async function loadActiveFlights() {
  try {
    console.log('[WorldMap] Fetching active flights...');
    const endpoint = airlineFilterMode === 'all' ? '/api/schedule/active-all' : '/api/schedule/active';
    const response = await fetch(endpoint);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('[WorldMap] Active flights received:', data);

    if (data.flights && Array.isArray(data.flights)) {
      activeFlights = data.flights;
      updateFlightsOnMap(data.flights);
      // Update selected flight info if one is selected
      if (selectedFlightId) {
        const selectedFlight = activeFlights.find(f => f.id === selectedFlightId);
        if (selectedFlight) {
          showFlightInfo(selectedFlight);
        }
      }
    } else {
      activeFlights = [];
      clearMap();
      hideFlightInfo();
    }
  } catch (error) {
    console.error('[WorldMap] Error loading active flights:', error);
  }
}

// Update flights on map (only aircraft markers)
function updateFlightsOnMap(flights) {
  // Track which flights are still active
  const activeFlightIds = new Set(flights.map(f => f.id));

  // Remove markers for flights that are no longer active
  for (const [flightId, markers] of flightMarkers) {
    if (!activeFlightIds.has(flightId)) {
      // Handle both array and single marker (for backwards compatibility)
      if (Array.isArray(markers)) {
        markers.forEach(m => map.removeLayer(m));
      } else {
        map.removeLayer(markers);
      }
      flightMarkers.delete(flightId);

      // Also clean up route/airports if this was selected
      if (flightId === selectedFlightId) {
        clearSelectedFlightElements();
        selectedFlightId = null;
        hideFlightInfo();
      }
    }
  }

  // Add or update markers for active flights
  flights.forEach(flight => {
    const position = calculateFlightPosition(flight);

    // Hide aircraft during turnaround or tech stop (on the ground)
    if (position.phase === 'turnaround' || position.phase === 'techstop') {
      if (flightMarkers.has(flight.id)) {
        // Remove all markers during ground time
        const markers = flightMarkers.get(flight.id);
        if (Array.isArray(markers)) {
          markers.forEach(m => map.removeLayer(m));
        } else {
          map.removeLayer(markers);
        }
        flightMarkers.delete(flight.id);
      }
      return; // Skip to next flight
    }

    if (flightMarkers.has(flight.id)) {
      // Update existing marker positions (on all world copies)
      const markers = flightMarkers.get(flight.id);
      const worldOffsets = [0, 360, -360];
      const bearing = calculateBearing(position.lat, position.lng, position.destLat, position.destLng);

      const markersArray = Array.isArray(markers) ? markers : [markers];
      markersArray.forEach((marker, idx) => {
        const offset = worldOffsets[idx] || 0;
        marker.setLatLng([position.lat, position.lng + offset]);

        // Update rotation
        const iconEl = marker.getElement();
        if (iconEl) {
          const inner = iconEl.querySelector('.aircraft-marker-inner');
          if (inner) {
            inner.style.transform = `rotate(${bearing}deg)`;
          }
        }
      });

      // Update route line if this is the selected flight
      if (flight.id === selectedFlightId && routeLines.has(flight.id)) {
        // Route line doesn't need position update, but we could update progress indicator here
      }
    } else {
      // Create new marker (aircraft only, no route line yet)
      createFlightMarker(flight, position);
    }
  });
}

// Calculate current flight position based on departure time and flight duration
// Handles both outbound and return legs of a round-trip flight
// Includes wind adjustment (eastbound flights faster, westbound slower)
// Supports tech stop routes (DEP → TECH → ARR → TECH → DEP)
function calculateFlightPosition(flight) {
  const currentTime = window.getGlobalWorldTime ? window.getGlobalWorldTime() : new Date();

  if (!currentTime) {
    // Fallback: show at departure
    return {
      lat: parseFloat(flight.departureAirport.latitude),
      lng: parseFloat(flight.departureAirport.longitude),
      phase: 'outbound',
      routeNumber: flight.route.routeNumber
    };
  }

  // Parse departure time
  const departureDateTime = new Date(`${flight.scheduledDate}T${flight.departureTime}`);

  // Airport coordinates
  const depLat = parseFloat(flight.departureAirport.latitude);
  const depLng = parseFloat(flight.departureAirport.longitude);
  const arrLat = parseFloat(flight.arrivalAirport.latitude);
  const arrLng = parseFloat(flight.arrivalAirport.longitude);

  const speedKnots = 450; // Average cruise speed
  const turnaroundMinutes = flight.route.turnaroundTime || 45;
  const turnaroundMs = turnaroundMinutes * 60 * 1000;

  // Calculate total elapsed time
  const elapsedMs = currentTime - departureDateTime;

  let position, progress, phase, routeNumber, destLat, destLng;

  // Check if this is a tech stop route
  const hasTechStop = flight.route?.techStopAirport;

  if (hasTechStop) {
    // Tech stop route: DEP → TECH → ARR → TECH → DEP
    const techLat = parseFloat(flight.route.techStopAirport.latitude);
    const techLng = parseFloat(flight.route.techStopAirport.longitude);

    const distanceNm = parseFloat(flight.route.distance) || 500;
    const leg1Distance = flight.route.legOneDistance || Math.round(distanceNm * 0.4);
    const leg2Distance = flight.route.legTwoDistance || Math.round(distanceNm * 0.6);

    const techStopMs = 30 * 60 * 1000; // 30 min tech stop

    // Calculate each leg duration
    const leg1Ms = calculateFlightDurationMs(leg1Distance, depLng, techLng, depLat, techLat, speedKnots);
    const leg2Ms = calculateFlightDurationMs(leg2Distance, techLng, arrLng, techLat, arrLat, speedKnots);
    const leg3Ms = calculateFlightDurationMs(leg2Distance, arrLng, techLng, arrLat, techLat, speedKnots);
    const leg4Ms = calculateFlightDurationMs(leg1Distance, techLng, depLng, techLat, depLat, speedKnots);

    // Timeline: leg1 → techStop1 → leg2 → turnaround → leg3 → techStop2 → leg4
    const t1 = leg1Ms;
    const t2 = t1 + techStopMs;
    const t3 = t2 + leg2Ms;
    const t4 = t3 + turnaroundMs;
    const t5 = t4 + leg3Ms;
    const t6 = t5 + techStopMs;

    if (elapsedMs < t1) {
      // LEG 1: DEP → TECH
      phase = 'outbound';
      routeNumber = flight.route.routeNumber;
      progress = Math.max(0, Math.min(1, elapsedMs / leg1Ms));
      position = interpolateGreatCircle(depLat, depLng, techLat, techLng, progress);
      destLat = techLat;
      destLng = techLng;
    } else if (elapsedMs < t2) {
      // TECH STOP 1: at tech stop airport
      phase = 'techstop';
      routeNumber = flight.route.routeNumber;
      progress = 0;
      position = { lat: techLat, lng: techLng };
      destLat = arrLat;
      destLng = arrLng;
    } else if (elapsedMs < t3) {
      // LEG 2: TECH → ARR
      phase = 'outbound';
      routeNumber = flight.route.routeNumber;
      const legElapsed = elapsedMs - t2;
      progress = Math.max(0, Math.min(1, legElapsed / leg2Ms));
      position = interpolateGreatCircle(techLat, techLng, arrLat, arrLng, progress);
      destLat = arrLat;
      destLng = arrLng;
    } else if (elapsedMs < t4) {
      // TURNAROUND: at arrival airport
      phase = 'turnaround';
      routeNumber = flight.route.returnRouteNumber || flight.route.routeNumber;
      progress = 1;
      position = { lat: arrLat, lng: arrLng };
      destLat = techLat;
      destLng = techLng;
    } else if (elapsedMs < t5) {
      // LEG 3: ARR → TECH (return)
      phase = 'return';
      routeNumber = flight.route.returnRouteNumber || flight.route.routeNumber;
      const legElapsed = elapsedMs - t4;
      progress = Math.max(0, Math.min(1, legElapsed / leg3Ms));
      position = interpolateGreatCircle(arrLat, arrLng, techLat, techLng, progress);
      destLat = techLat;
      destLng = techLng;
    } else if (elapsedMs < t6) {
      // TECH STOP 2: at tech stop airport (return)
      phase = 'techstop';
      routeNumber = flight.route.returnRouteNumber || flight.route.routeNumber;
      progress = 0;
      position = { lat: techLat, lng: techLng };
      destLat = depLat;
      destLng = depLng;
    } else {
      // LEG 4: TECH → DEP (return home)
      phase = 'return';
      routeNumber = flight.route.returnRouteNumber || flight.route.routeNumber;
      const legElapsed = elapsedMs - t6;
      progress = Math.max(0, Math.min(1, legElapsed / leg4Ms));
      position = interpolateGreatCircle(techLat, techLng, depLat, depLng, progress);
      destLat = depLat;
      destLng = depLng;
    }
  } else {
    // Standard direct route
    const distanceNm = parseFloat(flight.route.distance) || 500;

    // Outbound: departure -> arrival (with wind effect)
    const outboundFlightMs = calculateFlightDurationMs(distanceNm, depLng, arrLng, depLat, arrLat, speedKnots);

    // Return: arrival -> departure (opposite wind effect)
    const returnFlightMs = calculateFlightDurationMs(distanceNm, arrLng, depLng, arrLat, depLat, speedKnots);

    if (elapsedMs < outboundFlightMs) {
      // OUTBOUND LEG: departure → arrival
      phase = 'outbound';
      routeNumber = flight.route.routeNumber;
      progress = Math.max(0, Math.min(1, elapsedMs / outboundFlightMs));
      position = interpolateGreatCircle(depLat, depLng, arrLat, arrLng, progress);
      destLat = arrLat;
      destLng = arrLng;
    } else if (elapsedMs < outboundFlightMs + turnaroundMs) {
      // TURNAROUND: at arrival airport
      phase = 'turnaround';
      routeNumber = flight.route.returnRouteNumber || flight.route.routeNumber;
      progress = 1;
      position = { lat: arrLat, lng: arrLng };
      destLat = depLat;
      destLng = depLng;
    } else {
      // RETURN LEG: arrival → departure
      phase = 'return';
      routeNumber = flight.route.returnRouteNumber || flight.route.routeNumber;
      const returnElapsedMs = elapsedMs - outboundFlightMs - turnaroundMs;
      progress = Math.max(0, Math.min(1, returnElapsedMs / returnFlightMs));
      position = interpolateGreatCircle(arrLat, arrLng, depLat, depLng, progress);
      destLat = depLat;
      destLng = depLng;
    }
  }

  return {
    lat: position.lat,
    lng: position.lng,
    destLat: destLat,
    destLng: destLng,
    progress: progress,
    phase: phase,
    routeNumber: routeNumber
  };
}

// Great circle interpolation
function interpolateGreatCircle(lat1, lng1, lat2, lng2, fraction) {
  const toRad = deg => deg * Math.PI / 180;
  const toDeg = rad => rad * 180 / Math.PI;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const lambda1 = toRad(lng1);
  const lambda2 = toRad(lng2);

  const deltaPhi = phi2 - phi1;
  const deltaLambda = lambda2 - lambda1;

  const a = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const delta = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  if (delta === 0) {
    return { lat: lat1, lng: lng1 };
  }

  const A = Math.sin((1 - fraction) * delta) / Math.sin(delta);
  const B = Math.sin(fraction * delta) / Math.sin(delta);

  const x = A * Math.cos(phi1) * Math.cos(lambda1) + B * Math.cos(phi2) * Math.cos(lambda2);
  const y = A * Math.cos(phi1) * Math.sin(lambda1) + B * Math.cos(phi2) * Math.sin(lambda2);
  const z = A * Math.sin(phi1) + B * Math.sin(phi2);

  const phi = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lambda = Math.atan2(y, x);

  return { lat: toDeg(phi), lng: toDeg(lambda) };
}

// Check if a route segment crosses the International Date Line
function crossesDateLine(lng1, lng2) {
  // If longitude difference is > 180°, route crosses date line
  return Math.abs(lng2 - lng1) > 180;
}

// Generate great circle path points that handle date line crossing
// Returns array of polyline segments (each segment is an array of [lat, lng] points)
function generateGreatCirclePath(lat1, lng1, lat2, lng2, numPoints = 50) {
  const points = [];

  // First, generate all points along the great circle
  for (let i = 0; i <= numPoints; i++) {
    const point = interpolateGreatCircle(lat1, lng1, lat2, lng2, i / numPoints);
    points.push(point);
  }

  // Check if route crosses date line by looking at the raw longitude difference
  const lngDiff = lng2 - lng1;
  const crossesDL = Math.abs(lngDiff) > 180;

  if (!crossesDL) {
    // No date line crossing - return single segment
    return [points.map(p => [p.lat, p.lng])];
  }

  // Route crosses date line - need to split into segments
  // Determine which direction we're crossing (east to west or west to east)
  const goingEast = (lngDiff < -180) || (lngDiff > 0 && lngDiff <= 180);

  const segments = [];
  let currentSegment = [];
  let prevLng = points[0].lng;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    let adjustedLng = point.lng;

    // Detect when we cross the date line (sign change from ~180 to ~-180 or vice versa)
    if (i > 0) {
      const lngJump = point.lng - prevLng;

      if (Math.abs(lngJump) > 180) {
        // We crossed the date line - split here
        // First, calculate where the path intersects the date line
        const prevPoint = points[i - 1];

        // Interpolate to find exact crossing point
        // Using linear interpolation for simplicity at the crossing
        const crossingLat = (prevPoint.lat + point.lat) / 2;

        if (prevPoint.lng > 0) {
          // Crossing from east (positive) to west (negative)
          // End current segment at +180
          currentSegment.push([crossingLat, 180]);
          segments.push(currentSegment);

          // Start new segment at -180
          currentSegment = [[crossingLat, -180]];
        } else {
          // Crossing from west (negative) to east (positive)
          // End current segment at -180
          currentSegment.push([crossingLat, -180]);
          segments.push(currentSegment);

          // Start new segment at +180
          currentSegment = [[crossingLat, 180]];
        }
      }
    }

    currentSegment.push([point.lat, adjustedLng]);
    prevLng = point.lng;
  }

  // Add final segment
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return segments;
}

// Calculate bearing between two points
function calculateBearing(lat1, lng1, lat2, lng2) {
  const toRad = deg => deg * Math.PI / 180;
  const toDeg = rad => rad * 180 / Math.PI;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lng2 - lng1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Create aircraft marker on all world copies for seamless scrolling
function createFlightMarker(flight, position) {
  // Calculate bearing from CURRENT position to destination (follows great circle curve)
  const bearing = calculateBearing(position.lat, position.lng, position.destLat, position.destLng);

  // Get flight info for label
  const flightNumber = position.routeNumber || flight.route?.routeNumber || '';
  const registration = flight.aircraft?.registration || '';
  // Combine model and variant (e.g., "777" + "300ER" = "777-300ER")
  const model = flight.aircraft?.aircraftType?.model || '';
  const variant = flight.aircraft?.aircraftType?.variant || '';
  const aircraftModel = variant ? `${model}-${variant}` : model;

  // Check if this is another airline's flight
  const isOtherAirline = flight.isOwnFlight === false;
  const airlineName = flight.airlineName || '';
  const markerClass = isOtherAirline ? 'aircraft-marker-inner other-airline' : 'aircraft-marker-inner';

  const createIcon = () => L.divIcon({
    className: 'aircraft-marker',
    html: `
      <div class="aircraft-marker-wrapper">
        <div class="${markerClass}" style="transform: rotate(${bearing}deg)">${aircraftSvg}</div>
        <div class="aircraft-label">
          ${flightNumber ? `<div class="flight-number-label">${flightNumber}</div>` : ''}
          ${registration ? `<div>${registration}</div>` : ''}
          ${aircraftModel ? `<div>${aircraftModel}</div>` : ''}
          ${isOtherAirline && airlineName ? `<div class="airline-name-label">${airlineName}</div>` : ''}
        </div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  // Create markers on main world and adjacent copies
  const worldOffsets = [0, 360, -360];
  const markers = [];

  worldOffsets.forEach(offset => {
    const marker = L.marker([position.lat, position.lng + offset], { icon: createIcon() })
      .addTo(map);

    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      selectFlight(flight.id);
    });

    markers.push(marker);
  });

  // Store array of markers for this flight
  flightMarkers.set(flight.id, markers);
}

// Create route line for selected flight
// Draws on main world and adjacent copies for seamless scrolling
function createRouteLine(flight) {
  const depLat = parseFloat(flight.departureAirport.latitude);
  const depLng = parseFloat(flight.departureAirport.longitude);
  const arrLat = parseFloat(flight.arrivalAirport.latitude);
  const arrLng = parseFloat(flight.arrivalAirport.longitude);

  // Check if there's a tech stop
  const hasTechStop = flight.route?.techStopAirport;

  const lineStyle = {
    color: '#58a6ff',
    weight: 2,
    opacity: 0.6,
    dashArray: '5, 10',
    className: 'route-path'
  };

  const allPolylines = [];

  // Draw route on main world and adjacent copies (for seamless scrolling)
  const worldOffsets = [0, 360, -360];

  // Helper to add polyline with longitude offset
  const addPolylineWithOffset = (segment, offset) => {
    const offsetSegment = segment.map(([lat, lng]) => [lat, lng + offset]);
    const polyline = L.polyline(offsetSegment, lineStyle).addTo(map);
    allPolylines.push(polyline);
  };

  if (hasTechStop) {
    // Draw two great circle segments: DEP → TECH → ARR
    const techLat = parseFloat(flight.route.techStopAirport.latitude);
    const techLng = parseFloat(flight.route.techStopAirport.longitude);

    // First segment: DEP → TECH (with date line handling)
    const segments1 = generateGreatCirclePath(depLat, depLng, techLat, techLng, 30);

    // Second segment: TECH → ARR (with date line handling)
    const segments2 = generateGreatCirclePath(techLat, techLng, arrLat, arrLng, 30);

    // Draw on all world copies
    worldOffsets.forEach(offset => {
      segments1.forEach(segment => addPolylineWithOffset(segment, offset));
      segments2.forEach(segment => addPolylineWithOffset(segment, offset));
    });
  } else {
    // Direct route: generate great circle path with date line handling
    const segments = generateGreatCirclePath(depLat, depLng, arrLat, arrLng, 50);

    // Draw on all world copies
    worldOffsets.forEach(offset => {
      segments.forEach(segment => addPolylineWithOffset(segment, offset));
    });
  }

  // Store all polylines (may be multiple if crossing date line or multiple world copies)
  routeLines.set(flight.id, allPolylines);
}

// Create airport markers for selected flight
// Creates markers on main world and adjacent copies for seamless scrolling
function createAirportMarkers(flight) {
  const worldOffsets = [0, 360, -360];

  // Helper to create markers on all world copies
  const createMarkerOnAllCopies = (lat, lng, icon, popupContent, keyPrefix) => {
    const markers = [];
    worldOffsets.forEach((offset, idx) => {
      const marker = L.marker([lat, lng + offset], { icon })
        .addTo(map)
        .bindPopup(popupContent);
      markers.push(marker);
      airportMarkers.set(`${keyPrefix}-${flight.id}-${idx}`, marker);
    });
    return markers;
  };

  // Departure airport (hub style - green)
  const depIcon = L.divIcon({
    className: 'airport-marker',
    html: `<div class="airport-marker-inner hub"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });

  createMarkerOnAllCopies(
    parseFloat(flight.departureAirport.latitude),
    parseFloat(flight.departureAirport.longitude),
    depIcon,
    `<div class="popup-title">${flight.departureAirport.iataCode || flight.departureAirport.icaoCode}</div>
     <div class="popup-info">
       <span>${flight.departureAirport.name}</span>
       <span>${flight.departureAirport.city}, ${flight.departureAirport.country}</span>
     </div>`,
    'dep'
  );

  // Tech stop airport (yellow) - if exists
  if (flight.route?.techStopAirport) {
    const techIcon = L.divIcon({
      className: 'airport-marker',
      html: `<div class="airport-marker-inner techstop"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    createMarkerOnAllCopies(
      parseFloat(flight.route.techStopAirport.latitude),
      parseFloat(flight.route.techStopAirport.longitude),
      techIcon,
      `<div class="popup-title">${flight.route.techStopAirport.iataCode || flight.route.techStopAirport.icaoCode}</div>
       <div class="popup-info">
         <span>${flight.route.techStopAirport.name}</span>
         <span>${flight.route.techStopAirport.city}, ${flight.route.techStopAirport.country}</span>
         <span style="color: #d29922; font-weight: 600;">Tech Stop</span>
       </div>`,
      'tech'
    );
  }

  // Arrival airport (green)
  const arrIcon = L.divIcon({
    className: 'airport-marker',
    html: `<div class="airport-marker-inner"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });

  createMarkerOnAllCopies(
    parseFloat(flight.arrivalAirport.latitude),
    parseFloat(flight.arrivalAirport.longitude),
    arrIcon,
    `<div class="popup-title">${flight.arrivalAirport.iataCode || flight.arrivalAirport.icaoCode}</div>
     <div class="popup-info">
       <span>${flight.arrivalAirport.name}</span>
       <span>${flight.arrivalAirport.city}, ${flight.arrivalAirport.country}</span>
     </div>`,
    'arr'
  );
}

// Show flight info panel for selected flight
function showFlightInfo(flight) {
  const flightList = document.getElementById('flightList');
  const panel = document.getElementById('flightInfoPanel');
  if (!flightList || !panel) return;

  // Show the panel
  panel.style.display = 'flex';

  const position = calculateFlightPosition(flight);
  const phase = position.phase || 'outbound';

  // Aircraft info
  const registration = flight.aircraft?.registration || 'N/A';
  const model = flight.aircraft?.aircraftType?.model || '';
  const variant = flight.aircraft?.aircraftType?.variant || '';
  const aircraftModel = variant ? `${model}-${variant}` : (model || 'Unknown');
  const manufacturer = flight.aircraft?.aircraftType?.manufacturer || '';
  const fullAircraftName = manufacturer ? `${manufacturer} ${aircraftModel}` : aircraftModel;
  const passengerCapacity = flight.aircraft?.passengerCapacity || flight.aircraft?.aircraftType?.passengerCapacity || 0;

  // Route info
  const distance = Math.round(parseFloat(flight.route.distance) || 0);
  const turnaroundTime = flight.route.turnaroundTime || 45;
  const loadFactor = flight.route.averageLoadFactor || 0;

  // Airport coordinates
  const depLat = parseFloat(flight.departureAirport.latitude);
  const depLng = parseFloat(flight.departureAirport.longitude);
  const arrLat = parseFloat(flight.arrivalAirport.latitude);
  const arrLng = parseFloat(flight.arrivalAirport.longitude);

  // Check for tech stop
  const hasTechStop = flight.route?.techStopAirport;
  const techCode = hasTechStop ? (flight.route.techStopAirport.iataCode || flight.route.techStopAirport.icaoCode) : null;
  const techLat = hasTechStop ? parseFloat(flight.route.techStopAirport.latitude) : null;
  const techLng = hasTechStop ? parseFloat(flight.route.techStopAirport.longitude) : null;

  const speedKnots = 450;

  // Route numbers
  const outboundRouteNum = flight.route.routeNumber || '--';
  const returnRouteNum = flight.route.returnRouteNumber || outboundRouteNum;

  // Airport codes
  const depCode = flight.departureAirport.iataCode || flight.departureAirport.icaoCode;
  const arrCode = flight.arrivalAirport.iataCode || flight.arrivalAirport.icaoCode;

  // Calculate times for both sectors (rounded to nearest 5 minutes)
  const depTime = roundTimeToNearest5(flight.departureTime?.substring(0, 5) || '00:00');
  const depDateTime = new Date(`${flight.scheduledDate}T${flight.departureTime}`);

  // Current phase status
  let phaseStatus = '';
  let progressPercent = 0;
  if (phase === 'outbound') {
    phaseStatus = 'OUTBOUND';
    progressPercent = Math.round((position.progress || 0) * 100);
  } else if (phase === 'turnaround') {
    phaseStatus = 'TURNAROUND';
    progressPercent = 100;
  } else {
    phaseStatus = 'RETURN';
    progressPercent = Math.round((position.progress || 0) * 100);
  }

  let sectorsHtml = '';

  if (hasTechStop) {
    // Tech stop route: DEP → TECH → ARR → TECH → DEP
    // Calculate leg distances (approximate - half each way through tech stop)
    const leg1Distance = flight.route.legOneDistance || Math.round(distance * 0.4);
    const leg2Distance = flight.route.legTwoDistance || Math.round(distance * 0.6);

    // Leg 1: DEP → TECH
    const leg1Ms = calculateFlightDurationMs(leg1Distance, depLng, techLng, depLat, techLat, speedKnots);
    const leg1Minutes = Math.round(leg1Ms / 60000 / 5) * 5;
    const leg1DurationStr = `${Math.floor(leg1Minutes / 60)}h ${String(leg1Minutes % 60).padStart(2, '0')}m`;
    const leg1Arrival = new Date(depDateTime.getTime() + leg1Ms);
    const leg1ArrivalTime = roundTimeToNearest5(leg1Arrival.toTimeString().substring(0, 5));

    // Tech stop ground time (shorter than turnaround - just refuel)
    const techStopMinutes = 30;

    // Leg 2: TECH → ARR
    const leg2Dep = new Date(leg1Arrival.getTime() + techStopMinutes * 60000);
    const leg2DepTime = roundTimeToNearest5(leg2Dep.toTimeString().substring(0, 5));
    const leg2Ms = calculateFlightDurationMs(leg2Distance, techLng, arrLng, techLat, arrLat, speedKnots);
    const leg2Minutes = Math.round(leg2Ms / 60000 / 5) * 5;
    const leg2DurationStr = `${Math.floor(leg2Minutes / 60)}h ${String(leg2Minutes % 60).padStart(2, '0')}m`;
    const leg2Arrival = new Date(leg2Dep.getTime() + leg2Ms);
    const leg2ArrivalTime = roundTimeToNearest5(leg2Arrival.toTimeString().substring(0, 5));

    // Turnaround at destination
    const returnDep = new Date(leg2Arrival.getTime() + turnaroundTime * 60000);
    const returnDepTime = roundTimeToNearest5(returnDep.toTimeString().substring(0, 5));

    // Leg 3: ARR → TECH (return)
    const leg3Ms = calculateFlightDurationMs(leg2Distance, arrLng, techLng, arrLat, techLat, speedKnots);
    const leg3Minutes = Math.round(leg3Ms / 60000 / 5) * 5;
    const leg3DurationStr = `${Math.floor(leg3Minutes / 60)}h ${String(leg3Minutes % 60).padStart(2, '0')}m`;
    const leg3Arrival = new Date(returnDep.getTime() + leg3Ms);
    const leg3ArrivalTime = roundTimeToNearest5(leg3Arrival.toTimeString().substring(0, 5));

    // Tech stop on return
    const leg4Dep = new Date(leg3Arrival.getTime() + techStopMinutes * 60000);
    const leg4DepTime = roundTimeToNearest5(leg4Dep.toTimeString().substring(0, 5));

    // Leg 4: TECH → DEP (return home)
    const leg4Ms = calculateFlightDurationMs(leg1Distance, techLng, depLng, techLat, depLat, speedKnots);
    const leg4Minutes = Math.round(leg4Ms / 60000 / 5) * 5;
    const leg4DurationStr = `${Math.floor(leg4Minutes / 60)}h ${String(leg4Minutes % 60).padStart(2, '0')}m`;
    const leg4Arrival = new Date(leg4Dep.getTime() + leg4Ms);
    const leg4ArrivalTime = roundTimeToNearest5(leg4Arrival.toTimeString().substring(0, 5));

    // Total outbound/return durations
    const totalOutboundMin = leg1Minutes + techStopMinutes + leg2Minutes;
    const totalOutboundStr = `${Math.floor(totalOutboundMin / 60)}h ${String(totalOutboundMin % 60).padStart(2, '0')}m`;
    const totalReturnMin = leg3Minutes + techStopMinutes + leg4Minutes;
    const totalReturnStr = `${Math.floor(totalReturnMin / 60)}h ${String(totalReturnMin % 60).padStart(2, '0')}m`;

    sectorsHtml = `
      <!-- Outbound Sector with Tech Stop -->
      <div class="sector-card ${phase === 'outbound' ? 'active' : phase === 'turnaround' || phase === 'return' ? 'completed' : ''}">
        <div class="sector-header">
          <span class="sector-flight-num">${outboundRouteNum}</span>
          <span class="sector-label">OUTBOUND</span>
          <span class="sector-total-time">${totalOutboundStr}</span>
        </div>
        <div class="sector-route tech-stop-route">
          <div class="sector-airport">
            <div class="airport-code">${depCode}</div>
            <div class="airport-time">${depTime}</div>
          </div>
          <div class="sector-arrow small">
            <div class="arrow-line"></div>
            <div class="flight-duration">${leg1DurationStr}</div>
          </div>
          <div class="sector-airport techstop">
            <div class="airport-code" style="color: #d29922;">${techCode}</div>
            <div class="airport-time">${leg1ArrivalTime}</div>
            <div class="tech-label">TECH</div>
          </div>
          <div class="sector-arrow small">
            <div class="arrow-line"></div>
            <div class="flight-duration">${leg2DurationStr}</div>
          </div>
          <div class="sector-airport">
            <div class="airport-code">${arrCode}</div>
            <div class="airport-time">${leg2ArrivalTime}</div>
          </div>
        </div>
      </div>

      <!-- Turnaround -->
      <div class="turnaround-indicator ${phase === 'turnaround' ? 'active' : phase === 'return' ? 'completed' : ''}">
        <span class="turnaround-icon">⟳</span>
        <span class="turnaround-text">${turnaroundTime} min turnaround at ${arrCode}</span>
      </div>

      <!-- Return Sector with Tech Stop -->
      <div class="sector-card ${phase === 'return' ? 'active' : ''}">
        <div class="sector-header">
          <span class="sector-flight-num">${returnRouteNum}</span>
          <span class="sector-label">RETURN</span>
          <span class="sector-total-time">${totalReturnStr}</span>
        </div>
        <div class="sector-route tech-stop-route">
          <div class="sector-airport">
            <div class="airport-code">${arrCode}</div>
            <div class="airport-time">${returnDepTime}</div>
          </div>
          <div class="sector-arrow small">
            <div class="arrow-line"></div>
            <div class="flight-duration">${leg3DurationStr}</div>
          </div>
          <div class="sector-airport techstop">
            <div class="airport-code" style="color: #d29922;">${techCode}</div>
            <div class="airport-time">${leg3ArrivalTime}</div>
            <div class="tech-label">TECH</div>
          </div>
          <div class="sector-arrow small">
            <div class="arrow-line"></div>
            <div class="flight-duration">${leg4DurationStr}</div>
          </div>
          <div class="sector-airport">
            <div class="airport-code">${depCode}</div>
            <div class="airport-time">${leg4ArrivalTime}</div>
          </div>
        </div>
      </div>
    `;
  } else {
    // Standard route without tech stop
    // Outbound duration (with wind effect, rounded to nearest 5 minutes)
    const outboundFlightMs = calculateFlightDurationMs(distance, depLng, arrLng, depLat, arrLat, speedKnots);
    const outboundMinutes = Math.round(outboundFlightMs / 60000 / 5) * 5;
    const outboundDurationStr = `${Math.floor(outboundMinutes / 60)}h ${String(outboundMinutes % 60).padStart(2, '0')}m`;

    // Return duration (opposite wind effect, rounded to nearest 5 minutes)
    const returnFlightMs = calculateFlightDurationMs(distance, arrLng, depLng, arrLat, depLat, speedKnots);
    const returnMinutes = Math.round(returnFlightMs / 60000 / 5) * 5;
    const returnDurationStr = `${Math.floor(returnMinutes / 60)}h ${String(returnMinutes % 60).padStart(2, '0')}m`;

    // Outbound arrival time
    const outboundArrival = new Date(depDateTime.getTime() + outboundFlightMs);
    const outboundArrivalTime = roundTimeToNearest5(outboundArrival.toTimeString().substring(0, 5));

    // Return departure time (after turnaround)
    const returnDep = new Date(outboundArrival.getTime() + (turnaroundTime * 60 * 1000));
    const returnDepTime = roundTimeToNearest5(returnDep.toTimeString().substring(0, 5));

    // Return arrival time
    const returnArrival = new Date(returnDep.getTime() + returnFlightMs);
    const returnArrivalTime = roundTimeToNearest5(returnArrival.toTimeString().substring(0, 5));

    sectorsHtml = `
      <!-- Outbound Sector -->
      <div class="sector-card ${phase === 'outbound' ? 'active' : phase === 'turnaround' || phase === 'return' ? 'completed' : ''}">
        <div class="sector-header">
          <span class="sector-flight-num">${outboundRouteNum}</span>
          <span class="sector-label">OUTBOUND</span>
        </div>
        <div class="sector-route">
          <div class="sector-airport">
            <div class="airport-code">${depCode}</div>
            <div class="airport-time">${depTime}</div>
          </div>
          <div class="sector-arrow">
            <div class="arrow-line"></div>
            <div class="flight-duration">${outboundDurationStr}</div>
          </div>
          <div class="sector-airport">
            <div class="airport-code">${arrCode}</div>
            <div class="airport-time">${outboundArrivalTime}</div>
          </div>
        </div>
      </div>

      <!-- Turnaround -->
      <div class="turnaround-indicator ${phase === 'turnaround' ? 'active' : phase === 'return' ? 'completed' : ''}">
        <span class="turnaround-icon">⟳</span>
        <span class="turnaround-text">${turnaroundTime} min turnaround at ${arrCode}</span>
      </div>

      <!-- Return Sector -->
      <div class="sector-card ${phase === 'return' ? 'active' : ''}">
        <div class="sector-header">
          <span class="sector-flight-num">${returnRouteNum}</span>
          <span class="sector-label">RETURN</span>
        </div>
        <div class="sector-route">
          <div class="sector-airport">
            <div class="airport-code">${arrCode}</div>
            <div class="airport-time">${returnDepTime}</div>
          </div>
          <div class="sector-arrow">
            <div class="arrow-line"></div>
            <div class="flight-duration">${returnDurationStr}</div>
          </div>
          <div class="sector-airport">
            <div class="airport-code">${depCode}</div>
            <div class="airport-time">${returnArrivalTime}</div>
          </div>
        </div>
      </div>
    `;
  }

  // Check if this is another airline's flight
  const isOtherAirline = flight.isOwnFlight === false;
  const airlineName = flight.airlineName || '';
  const airlineCode = flight.airlineCode || '';

  flightList.innerHTML = `
    <div class="flight-detail-panel">
      ${isOtherAirline ? `
      <!-- Airline Info for other airlines -->
      <div class="airline-header" style="background: rgba(249, 115, 22, 0.15); border: 1px solid #f97316; border-radius: 6px; padding: 0.5rem 0.75rem; margin-bottom: 0.75rem; text-align: center;">
        <div style="font-size: 0.7rem; color: #f97316; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Other Airline</div>
        <div style="font-size: 1rem; font-weight: 700; color: #f97316;">${airlineName}</div>
        ${airlineCode ? `<div style="font-size: 0.8rem; color: var(--text-secondary); font-family: 'Courier New', monospace;">${airlineCode}</div>` : ''}
      </div>
      ` : ''}

      <!-- Aircraft Header -->
      <div class="aircraft-header">
        <div class="aircraft-reg">${registration}</div>
        <div class="aircraft-type">${fullAircraftName}</div>
      </div>

      <!-- Current Status -->
      <div class="current-status">
        <span class="status-badge ${phase}">${phaseStatus}</span>
        <span class="progress-text">${progressPercent}% complete</span>
      </div>

      ${sectorsHtml}

      <!-- Flight Stats -->
      <div class="flight-stats">
        <div class="stat-row">
          <span class="stat-label">Distance</span>
          <span class="stat-value">${distance} nm${hasTechStop ? ' (via ' + techCode + ')' : ''}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Capacity</span>
          <span class="stat-value">${passengerCapacity} pax</span>
        </div>
        ${!isOtherAirline ? `
        <div class="stat-row">
          <span class="stat-label">Load Factor</span>
          <span class="stat-value ${loadFactor >= 80 ? 'high' : loadFactor >= 50 ? 'medium' : 'low'}">${loadFactor.toFixed(1)}%</span>
        </div>
        ` : ''}
      </div>
    </div>
  `;

  // Shift dropdown when panel is shown
  const dropdown = document.querySelector('.map-filter-dropdown');
  if (dropdown) dropdown.classList.add('shifted');
}

// Hide flight info panel
function hideFlightInfo() {
  const panel = document.getElementById('flightInfoPanel');
  if (panel) {
    panel.style.display = 'none';
  }

  // Unshift dropdown when panel is hidden
  const dropdown = document.querySelector('.map-filter-dropdown');
  if (dropdown) dropdown.classList.remove('shifted');
}

// Clear route line and airport markers for previously selected flight
function clearSelectedFlightElements() {
  // Remove route lines (handle both single lines and arrays for tech stop routes)
  routeLines.forEach((line) => {
    if (Array.isArray(line)) {
      line.forEach(l => map.removeLayer(l));
    } else {
      map.removeLayer(line);
    }
  });
  routeLines.clear();

  // Remove airport markers
  airportMarkers.forEach((marker) => map.removeLayer(marker));
  airportMarkers.clear();
}

// Select a flight
function selectFlight(flightId) {
  // If clicking the same flight, deselect
  if (selectedFlightId === flightId) {
    deselectFlight();
    return;
  }

  // Clear previous selection
  clearSelectedFlightElements();

  selectedFlightId = flightId;

  // Find the flight data
  const flight = activeFlights.find(f => f.id === flightId);
  if (!flight) return;

  // Create route line and airport markers for selected flight
  createRouteLine(flight);
  createAirportMarkers(flight);

  // Show flight info
  showFlightInfo(flight);

  // Center map on the flight route
  const marker = flightMarkers.get(flightId);
  if (marker) {
    // Get bounds of the route
    const depLat = parseFloat(flight.departureAirport.latitude);
    const depLng = parseFloat(flight.departureAirport.longitude);
    const arrLat = parseFloat(flight.arrivalAirport.latitude);
    const arrLng = parseFloat(flight.arrivalAirport.longitude);

    const bounds = L.latLngBounds(
      [depLat, depLng],
      [arrLat, arrLng]
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 6 });
  }
}

// Deselect flight
function deselectFlight() {
  clearSelectedFlightElements();
  selectedFlightId = null;
  hideFlightInfo();
}

// Update flight positions (called on world time update)
function updateFlightPositions() {
  // Recalculate positions for all flights
  activeFlights.forEach(flight => {
    const position = calculateFlightPosition(flight);
    const markers = flightMarkers.get(flight.id);

    // Hide aircraft during turnaround or tech stop (on the ground)
    if (position.phase === 'turnaround' || position.phase === 'techstop') {
      if (markers) {
        if (Array.isArray(markers)) {
          markers.forEach(m => map.removeLayer(m));
        } else {
          map.removeLayer(markers);
        }
        flightMarkers.delete(flight.id);
      }
      return; // Skip to next flight
    }

    // If markers don't exist (e.g., returning from turnaround), create them
    if (!markers) {
      createFlightMarker(flight, position);
      return;
    }

    // Update existing marker positions (on all world copies)
    const worldOffsets = [0, 360, -360];
    const bearing = calculateBearing(position.lat, position.lng, position.destLat, position.destLng);
    const markersArray = Array.isArray(markers) ? markers : [markers];

    markersArray.forEach((marker, idx) => {
      const offset = worldOffsets[idx] || 0;
      marker.setLatLng([position.lat, position.lng + offset]);

      // Update rotation
      const iconEl = marker.getElement();
      if (iconEl) {
        const inner = iconEl.querySelector('.aircraft-marker-inner');
        if (inner) {
          inner.style.transform = `rotate(${bearing}deg)`;
        }
      }
    });
  });

  // Update info panel if a flight is selected
  if (selectedFlightId) {
    const flight = activeFlights.find(f => f.id === selectedFlightId);
    if (flight) {
      showFlightInfo(flight);
    }
  }
}

// Clear all map elements
function clearMap() {
  flightMarkers.forEach((markers) => {
    if (Array.isArray(markers)) {
      markers.forEach(m => map.removeLayer(m));
    } else {
      map.removeLayer(markers);
    }
  });
  flightMarkers.clear();

  clearSelectedFlightElements();
}

// Expose selectFlight globally for onclick handlers
window.selectFlight = selectFlight;

// Initialize the world map
async function initializeWorldMap() {
  console.log('[WorldMap] Initializing...');

  try {
    // Load Leaflet library first
    await loadLeaflet();

    // Wait a moment for the map container to be properly sized
    setTimeout(initMap, 100);
  } catch (error) {
    console.error('[WorldMap] Failed to initialize:', error);
  }
}

// Initialize when DOM is ready, or immediately if already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeWorldMap);
} else {
  // DOM already loaded (script loaded dynamically)
  initializeWorldMap();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
});
