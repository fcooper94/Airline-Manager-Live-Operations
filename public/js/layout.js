// Common layout functionality for the application

// WebSocket connection for real-time updates
let socket = null;

// Try to connect to Socket.IO with error handling
try {
  if (typeof io !== 'undefined') {
    console.log('[Layout] Initializing Socket.IO client...');
    socket = io({
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      withCredentials: false
    });
    console.log('[Layout] Socket.IO client instance created');
  } else {
    console.error('[Layout] Socket.IO client library not loaded!');
  }
} catch (error) {
  console.error('[Layout] Failed to initialize Socket.IO:', error);
}

// Global variables for world time tracking
let serverReferenceTime = null; // Server's game time at a specific moment
let serverReferenceTimestamp = null; // Real-world timestamp when serverReferenceTime was valid
let worldTimeAcceleration = 60;
let worldClockInterval = null;
let worldInfoFetchInProgress = false; // Prevent concurrent fetches
let worldInfoFetchSequence = 0; // Track request order to ignore stale responses
let lastTimeUpdateSource = 'none'; // Track last update source for debugging
let currentWorldId = null; // Current world ID to filter Socket.IO events

// Helper function to update time reference with validation
function updateTimeReference(newGameTime, source) {
  const now = Date.now();
  const newServerTime = new Date(newGameTime);

  // Validate time is moving forward ONLY if Socket.IO is available
  // If no Socket.IO, always accept API updates (they're the only source)
  const isSocketIO = source === 'socket';
  const hasSocketIO = socket && socket.connected;

  if (serverReferenceTime && !isSocketIO && hasSocketIO) {
    // Only validate if Socket.IO is connected (it's the authority)
    const currentCalculatedTime = calculateCurrentWorldTime();
    if (currentCalculatedTime && newServerTime < currentCalculatedTime) {
      const diff = (currentCalculatedTime - newServerTime) / 1000;
      console.warn(`[Layout] Rejecting ${source} time update - Socket.IO is active and this would go backwards by ${diff.toFixed(1)}s`);
      return false;
    }
  }

  serverReferenceTime = newServerTime;
  serverReferenceTimestamp = now;
  lastTimeUpdateSource = source;

  console.log(`[Layout] Time updated from ${source}:`, {
    gameTime: newServerTime.toLocaleString(),
    acceleration: worldTimeAcceleration
  });

  // Broadcast to other scripts
  window.dispatchEvent(new CustomEvent('worldTimeUpdated', {
    detail: {
      referenceTime: serverReferenceTime,
      referenceTimestamp: serverReferenceTimestamp,
      acceleration: worldTimeAcceleration,
      source: source
    }
  }));

  // Update display immediately
  updateWorldClock();

  return true;
}

// Socket.IO event listeners for server time sync
if (socket) {
  // Connection lifecycle events with verbose logging
  socket.on('connect', () => {
    console.log('[Layout] ✓ Connected to Socket.IO - time sync enabled');
    console.log('[Layout] Socket ID:', socket.id);
    console.log('[Layout] Transport:', socket.io.engine.transport.name);
  });

  socket.on('disconnect', (reason) => {
    console.warn('[Layout] ✗ Disconnected from Socket.IO. Reason:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[Layout] Socket.IO connection error:', error.message);
    console.error('[Layout] Error type:', error.type);
    console.error('[Layout] Error description:', error.description);
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('[Layout] ✓ Reconnected to Socket.IO after', attemptNumber, 'attempts');
  });

  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log('[Layout] Reconnection attempt', attemptNumber);
  });

  socket.on('reconnect_error', (error) => {
    console.error('[Layout] Reconnection error:', error.message);
  });

  socket.on('reconnect_failed', () => {
    console.error('[Layout] Failed to reconnect to Socket.IO after all attempts');
  });

  // Transport events for debugging
  socket.io.engine.on('upgrade', (transport) => {
    console.log('[Layout] Transport upgraded to:', transport.name);
  });

  socket.io.engine.on('upgradeError', (error) => {
    console.error('[Layout] Transport upgrade error:', error);
  });

  // World tick event for time sync
  socket.on('world:tick', (data) => {
    // Filter: only accept tick events for the current world
    if (!currentWorldId || data.worldId !== currentWorldId) {
      // Silently ignore ticks from other worlds
      return;
    }

    console.log('[Layout] Socket.IO world:tick received:', data);

    // Update acceleration
    if (data.timeAcceleration) {
      worldTimeAcceleration = data.timeAcceleration;
    }

    // Socket.IO is authoritative - always accept
    updateTimeReference(data.gameTime, 'socket');
  });

  console.log('[Layout] Socket.IO event listeners registered');
} else {
  console.warn('[Layout] Socket.IO not available - falling back to API-only time sync');
}

// Load user information for navigation bar
async function loadUserInfo() {
  try {
    const response = await fetch('/auth/status');
    const data = await response.json();

    if (data.authenticated) {
      // Update user info in navigation
      const userNameElement = document.getElementById('userName');
      if (userNameElement) {
        userNameElement.textContent = data.user.name;
      }

      const creditsEl = document.getElementById('userCredits');
      if (creditsEl) {
        creditsEl.textContent = data.user.credits;
        // Color code credits based on value
        if (data.user.credits < 0) {
          creditsEl.style.color = 'var(--warning-color)';
        } else if (data.user.credits < 4) {
          creditsEl.style.color = 'var(--text-secondary)';
        } else {
          creditsEl.style.color = 'var(--success-color)';
        }
      }

      // Show admin link in sidebar if user is admin
      const sidebarAdminLink = document.getElementById('sidebarAdminLink');
      if (sidebarAdminLink && data.user.isAdmin) {
        sidebarAdminLink.style.display = 'flex';
        sidebarAdminLink.style.alignItems = 'center';
        sidebarAdminLink.style.justifyContent = 'space-between';
      }

      // Load world information if user is in an active world
      loadWorldInfo();
    } else {
      // Redirect to login if not authenticated (only on protected pages)
      if (window.location.pathname !== '/' &&
          window.location.pathname !== '/auth/login' &&
          window.location.pathname !== '/auth/vatsim/callback') {
        window.location.href = '/';
      }
    }
  } catch (error) {
    console.error('Error loading user info:', error);
  }
}

// Load world information for navigation bar
async function loadWorldInfo() {
  // Prevent concurrent fetches to avoid race conditions
  if (worldInfoFetchInProgress) {
    return;
  }

  try {
    // Don't show world info on world selection or admin pages
    if (window.location.pathname === '/world-selection' || window.location.pathname === '/admin') {
      const worldInfoContainer = document.getElementById('worldInfoContainer');
      if (worldInfoContainer) {
        worldInfoContainer.style.display = 'none';
      }
      // Hide navigation menu on world selection page
      if (window.location.pathname === '/world-selection') {
        const navMenu = document.querySelector('.nav-menu');
        if (navMenu) {
          navMenu.style.display = 'none';
        }
      }
      return;
    }

    worldInfoFetchInProgress = true;
    const currentSequence = ++worldInfoFetchSequence;

    console.log('[Layout] Fetching world info from API...');

    // Get world info from the dedicated API endpoint
    const response = await fetch('/api/world/info');
    const worldInfo = await response.json();

    // Ignore this response if a newer request has been made
    if (currentSequence !== worldInfoFetchSequence) {
      console.log('[Layout] Ignoring stale world info response');
      return;
    }

    if (response.ok && worldInfo && !worldInfo.error) {
      console.log('[Layout] World info received:', {
        id: worldInfo.id,
        name: worldInfo.name,
        currentTime: worldInfo.currentTime,
        acceleration: worldInfo.timeAcceleration,
        balance: worldInfo.balance
      });

      // Store current world ID for filtering Socket.IO events
      currentWorldId = worldInfo.id;
      console.log('[Layout] Current world ID set to:', currentWorldId);

      // Update world information
      const worldNameEl = document.getElementById('worldName');
      if (worldNameEl) {
        worldNameEl.textContent = worldInfo.name || '--';
      }

      // Update time acceleration (always accept this)
      worldTimeAcceleration = worldInfo.timeAcceleration || 60;

      // Update time reference with validation (Socket.IO takes precedence)
      updateTimeReference(worldInfo.currentTime, 'api');

      // Update balance
      const worldBalanceEl = document.getElementById('worldBalance');
      if (worldBalanceEl) {
        const balance = Number(worldInfo.balance) || 0;
        worldBalanceEl.textContent = `$${Math.round(balance).toLocaleString('en-US')}`;

        // Color code balance based on value
        if (balance < 0) {
          worldBalanceEl.style.color = 'var(--warning-color)';
        } else if (balance < 100000) {
          worldBalanceEl.style.color = 'var(--text-secondary)';
        } else {
          worldBalanceEl.style.color = 'var(--success-color)';
        }
      }

      // Update airline information in sidebar
      const airlineInfoEl = document.getElementById('airlineInfo');
      const airlineNameEl = document.getElementById('airlineName');
      const airlineCodeEl = document.getElementById('airlineCode');

      if (airlineInfoEl && worldInfo.airlineName) {
        airlineInfoEl.style.display = 'block';

        if (airlineNameEl) {
          airlineNameEl.textContent = worldInfo.airlineName;
        }

        if (airlineCodeEl) {
          const codes = [];
          if (worldInfo.iataCode) codes.push(worldInfo.iataCode);
          if (worldInfo.airlineCode) codes.push(worldInfo.airlineCode);
          airlineCodeEl.textContent = codes.length > 0 ? codes.join(' / ') : '--';
        }
      }

      // Set up real-time clock if not already running
      if (!worldClockInterval) {
        startRealTimeClock();
      }

      // Show navigation menu when world is active
      const navMenu = document.querySelector('.nav-menu');
      if (navMenu) {
        navMenu.style.display = 'block';
      }
    } else {
      console.warn('[Layout] No world data received or error:', worldInfo);

      // Hide navigation menu when no world is selected
      const navMenu = document.querySelector('.nav-menu');
      if (navMenu) {
        navMenu.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('[Layout] Error loading world info:', error);
  } finally {
    worldInfoFetchInProgress = false;
  }
}

// Update world clock display
function updateWorldClock() {
  const currentWorldTime = calculateCurrentWorldTime();
  const worldDateEl = document.getElementById('worldDate');
  const worldTimeEl = document.getElementById('worldTime');
  const worldDayEl = document.getElementById('worldDay');

  if (worldDateEl && worldTimeEl && currentWorldTime) {
    worldDateEl.textContent = currentWorldTime.toLocaleDateString('en-GB');
    worldTimeEl.textContent = currentWorldTime.toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});

    // Update day of week
    if (worldDayEl) {
      const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      worldDayEl.textContent = dayNames[currentWorldTime.getDay()];
    }
  }
}

// Update world time periodically (sync with server every 30 seconds)
function updateWorldTime() {
  console.log('[Layout] Periodic world info refresh');
  loadWorldInfo();
}

// Calculate current world time based on server reference
function calculateCurrentWorldTime() {
  if (!serverReferenceTime || !serverReferenceTimestamp) {
    return null;
  }

  // Calculate real-world time elapsed since we got the reference
  const realElapsedMs = Date.now() - serverReferenceTimestamp;

  // Calculate game time advancement (accelerated)
  const gameElapsedMs = realElapsedMs * worldTimeAcceleration;

  // Calculate current game time
  return new Date(serverReferenceTime.getTime() + gameElapsedMs);
}

// Export world time functions and reference times globally for other pages to use
window.getGlobalWorldTime = calculateCurrentWorldTime;
window.getWorldTimeAcceleration = () => worldTimeAcceleration;
// Also export the raw reference times so other pages can sync exactly
Object.defineProperty(window, 'serverReferenceTime', {
  get: () => serverReferenceTime
});
Object.defineProperty(window, 'serverReferenceTimestamp', {
  get: () => serverReferenceTimestamp
});

// More efficient real-time clock that calculates time rather than incrementing
function startRealTimeClock() {
  // Clear any existing interval
  if (worldClockInterval) {
    clearInterval(worldClockInterval);
  }

  console.log('[Layout] Starting real-time clock');

  // Update the clock every 100ms for smooth progression
  worldClockInterval = setInterval(() => {
    updateWorldClock();
  }, 100); // Update every 100ms
}

// Universal page initialization
function initializeLayout() {
  console.log('[Layout] Initializing layout.js...');
  loadUserInfo();

  // Sync world time with server every 30 seconds to avoid drift
  setInterval(updateWorldTime, 30000);

  // Use event delegation to handle clicks on "Add to Fleet" button
  document.addEventListener('click', function(event) {
    // Check if the clicked element is the "Add to Fleet" button
    let target = event.target;

    // Traverse up the DOM to find if any parent element is the "Add to Fleet" button
    while (target && target !== document) {
      if (target.classList.contains('btn-action')) {
        // Check if the button text contains "Add to Fleet" (case-insensitive)
        const buttonText = target.textContent ? target.textContent.trim().toUpperCase() : '';
        if (buttonText.includes('ADD TO FLEET')) {
          event.preventDefault();
          showAircraftMarketplaceOptions();
          return; // Exit early to avoid multiple triggers
        }
      }
      target = target.parentElement;
    }
  });

  // Add common functionality that should be available on all pages
  initializeCommonComponents();

  console.log('[Layout] ✓ Layout initialization complete');
}

// Initialize common components across all pages
function initializeCommonComponents() {
  // Add any other common functionality that should be available on all pages
  // For example, common modals, tooltips, etc.

  // Ensure admin link visibility is handled consistently across all pages
  ensureAdminLinkVisibility();

  // Initialize submenu toggle functionality
  initializeSubmenuToggle();

  // Add other universal functionality here
}

// Initialize submenu toggle functionality
function initializeSubmenuToggle() {
  const parentItems = document.querySelectorAll('.nav-item.parent > a');

  parentItems.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const parentItem = this.parentElement;
      parentItem.classList.toggle('active');
    });
  });
}

// Ensure admin link visibility is consistent across all pages
function ensureAdminLinkVisibility() {
  // Check if user is authenticated and has admin rights
  fetch('/auth/status')
    .then(response => response.json())
    .then(data => {
      if (data.authenticated && data.user.isAdmin) {
        const sidebarAdminLink = document.getElementById('sidebarAdminLink');
        if (sidebarAdminLink) {
          sidebarAdminLink.style.display = 'flex';
          sidebarAdminLink.style.alignItems = 'center';
          sidebarAdminLink.style.justifyContent = 'space-between';
        }
      }
    })
    .catch(error => {
      console.error('Error checking admin status:', error);
    });
}

// Function to show aircraft marketplace options
function showAircraftMarketplaceOptions() {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'marketplaceOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 1000;
    display: flex;
    justify-content: center;
    align-items: center;
  `;

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: var(--surface);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 2rem;
    width: 90%;
    max-width: 600px;
    text-align: center;
  `;

  modalContent.innerHTML = `
    <h2 style="margin-bottom: 2rem; color: var(--text-primary);">AIRCRAFT MARKETPLACE</h2>
    <p style="margin-bottom: 2rem; color: var(--text-secondary);">Choose an option to expand your fleet</p>

    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <button id="usedAircraftBtn" class="btn btn-primary" style="padding: 1.5rem; font-size: 1.1rem;">
        Used Aircraft Market
      </button>
      <button id="newAircraftBtn" class="btn btn-secondary" style="padding: 1.5rem; font-size: 1.1rem;">
        Purchase Aircraft New from Manufacturer
      </button>
      <button id="closeMarketplaceBtn" class="btn btn-logout" style="padding: 0.75rem; margin-top: 1rem;">
        Close
      </button>
    </div>
  `;

  overlay.appendChild(modalContent);
  document.body.appendChild(overlay);

  // Add event listeners to buttons
  document.getElementById('usedAircraftBtn').addEventListener('click', function() {
    window.location.href = '/aircraft-marketplace?category=used';
  });

  document.getElementById('newAircraftBtn').addEventListener('click', function() {
    window.location.href = '/aircraft-marketplace?category=new';
  });

  document.getElementById('closeMarketplaceBtn').addEventListener('click', function() {
    document.body.removeChild(overlay);
  });
}

// Sidebar toggle functionality
function initSidebarToggle() {
  const toggleBtn = document.getElementById('sidebarToggle');
  const dashboardContainer = document.querySelector('.dashboard-container');
  const sidebar = document.querySelector('.sidebar');

  // Check if sidebar is disabled/hidden from admin panel
  const sidebarEnabled = localStorage.getItem('sidebarEnabled') !== 'false';

  // Hide sidebar and burger menu on admin page
  const isAdminPage = window.location.pathname === '/admin';

  if (isAdminPage) {
    // Hide burger menu on admin page
    if (toggleBtn) {
      toggleBtn.style.display = 'none';
    }
    // Hide sidebar on admin page
    if (sidebar) {
      sidebar.style.display = 'none';
    }
    // Remove sidebar spacing from container on admin page
    if (dashboardContainer) {
      dashboardContainer.classList.add('sidebar-collapsed');
    }
    return;
  }

  if (toggleBtn) {
    if (!sidebarEnabled || !sidebar) {
      // Hide burger menu if sidebar is disabled or doesn't exist
      toggleBtn.style.display = 'none';
    } else {
      // Show burger menu
      toggleBtn.style.display = 'flex';

      // Check localStorage for saved collapsed state
      const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
      if (sidebarCollapsed && dashboardContainer) {
        dashboardContainer.classList.add('sidebar-collapsed');
      }

      // Add click handler for toggle
      toggleBtn.addEventListener('click', () => {
        if (dashboardContainer) {
          dashboardContainer.classList.toggle('sidebar-collapsed');
          const isCollapsed = dashboardContainer.classList.contains('sidebar-collapsed');
          localStorage.setItem('sidebarCollapsed', isCollapsed);
        }
      });
    }
  }
}

// Call initialize function when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Layout] DOMContentLoaded event fired');
  initializeLayout();
  initSidebarToggle();

  // Measure and set navbar height for fixed sidebar positioning
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    const setNavbarHeight = () => {
      const height = navbar.offsetHeight;
      document.documentElement.style.setProperty('--navbar-height', `${height}px`);
    };

    // Set initially
    setNavbarHeight();

    // Update on window resize
    window.addEventListener('resize', setNavbarHeight);
  }
});
