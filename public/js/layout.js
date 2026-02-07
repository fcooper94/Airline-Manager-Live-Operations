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
      // Public pages that don't require authentication
      const publicPages = ['/', '/auth/login', '/auth/vatsim/callback', '/contact', '/faqs'];
      if (!publicPages.includes(window.location.pathname)) {
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
    // Pages that don't need world info displayed
    const noWorldInfoPages = ['/world-selection', '/admin', '/contact', '/faqs'];
    if (noWorldInfoPages.includes(window.location.pathname)) {
      const worldInfoContainer = document.getElementById('worldInfoContainer');
      if (worldInfoContainer) {
        worldInfoContainer.style.display = 'none';
      }
      // Hide navigation menu on world selection page only
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

      // Check if world is ending within 6 game months - show banner
      const endBanner = document.getElementById('worldEndingBanner');
      const endMessage = document.getElementById('worldEndingMessage');
      if (endBanner && endMessage && worldInfo.endDate) {
        const endDate = new Date(worldInfo.endDate);
        const gameTime = new Date(worldInfo.currentTime);
        const sixMonthsMs = 6 * 30 * 24 * 60 * 60 * 1000;
        const timeRemaining = endDate.getTime() - gameTime.getTime();

        if (timeRemaining <= sixMonthsMs && timeRemaining > 0) {
          const endFormatted = endDate.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          });
          endMessage.textContent = `This world will end at 23:59 on ${endFormatted}`;
          endBanner.style.display = 'flex';
        } else if (timeRemaining <= 0) {
          endMessage.textContent = 'This world has ended';
          endBanner.style.display = 'flex';
        } else {
          endBanner.style.display = 'none';
        }
      } else if (endBanner) {
        endBanner.style.display = 'none';
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
      const isOpening = !parentItem.classList.contains('active');

      // Close all other open submenus
      if (isOpening) {
        document.querySelectorAll('.nav-item.parent.active').forEach(item => {
          if (item !== parentItem) item.classList.remove('active');
        });
      }

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

// Bankruptcy modal functionality
function showBankruptcyModal() {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'bankruptcyOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    z-index: 2000;
    display: flex;
    justify-content: center;
    align-items: center;
  `;

  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: var(--surface);
    border: 2px solid #f85149;
    border-radius: 8px;
    padding: 2rem;
    width: 90%;
    max-width: 500px;
    text-align: center;
  `;

  modalContent.innerHTML = `
    <div style="margin-bottom: 1.5rem;">
      <svg width="64" height="64" viewBox="-1 -1 26 26" fill="none" stroke="#f85149" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 1rem; overflow: visible;">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
        <line x1="12" y1="9" x2="12" y2="13"></line>
        <circle cx="12" cy="17" r="0.5" fill="#f85149"></circle>
      </svg>
      <h2 style="color: #f85149; margin-bottom: 0.5rem; font-size: 1.5rem;">DECLARE BANKRUPTCY</h2>
    </div>

    <div style="background: rgba(248, 81, 73, 0.1); border: 1px solid rgba(248, 81, 73, 0.3); border-radius: 6px; padding: 1rem; margin-bottom: 1.5rem;">
      <p style="color: #ff6b63; font-weight: 600; margin-bottom: 0.5rem;">WARNING: This action is IRREVERSIBLE!</p>
      <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5;">
        Declaring bankruptcy will:
      </p>
      <ul style="color: var(--text-secondary); font-size: 0.9rem; text-align: left; margin: 0.75rem 0 0 1.5rem; line-height: 1.6;">
        <li>Liquidate your entire company</li>
        <li>Sell all aircraft at reduced market value</li>
        <li>Cancel all routes and schedules</li>
        <li>Terminate all staff contracts</li>
        <li>Reset your airline in this world</li>
      </ul>
    </div>

    <p style="color: var(--text-secondary); margin-bottom: 1.5rem; font-size: 0.9rem;">
      Type <strong style="color: #f85149;">BANKRUPT</strong> to confirm:
    </p>

    <input type="text" id="bankruptcyConfirmInput" placeholder="Type BANKRUPT" style="
      width: 100%;
      padding: 0.75rem;
      background: var(--surface-elevated);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 1rem;
      text-align: center;
      text-transform: uppercase;
      margin-bottom: 1.5rem;
      box-sizing: border-box;
    ">

    <div style="display: flex; gap: 1rem; justify-content: center;">
      <button id="cancelBankruptcyBtn" style="
        padding: 0.75rem 1.5rem;
        background: transparent;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      ">Cancel</button>
      <button id="confirmBankruptcyBtn" disabled style="
        padding: 0.75rem 1.5rem;
        background: #f85149;
        border: 1px solid #f85149;
        border-radius: 4px;
        color: white;
        cursor: not-allowed;
        font-size: 0.9rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        opacity: 0.5;
      ">Declare Bankruptcy</button>
    </div>
  `;

  overlay.appendChild(modalContent);
  document.body.appendChild(overlay);

  // Get elements
  const input = document.getElementById('bankruptcyConfirmInput');
  const confirmBtn = document.getElementById('confirmBankruptcyBtn');
  const cancelBtn = document.getElementById('cancelBankruptcyBtn');

  // Enable/disable confirm button based on input
  input.addEventListener('input', function() {
    const isValid = this.value.toUpperCase() === 'BANKRUPT';
    confirmBtn.disabled = !isValid;
    confirmBtn.style.opacity = isValid ? '1' : '0.5';
    confirmBtn.style.cursor = isValid ? 'pointer' : 'not-allowed';
  });

  // Cancel button handler
  cancelBtn.addEventListener('click', function() {
    closeBankruptcyModal();
  });

  // Confirm button handler
  confirmBtn.addEventListener('click', function() {
    if (input.value.toUpperCase() === 'BANKRUPT') {
      executeBankruptcy();
    }
  });

  // Close on overlay click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      closeBankruptcyModal();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      closeBankruptcyModal();
      document.removeEventListener('keydown', escHandler);
    }
  });

  // Focus the input
  input.focus();
}

function closeBankruptcyModal() {
  const overlay = document.getElementById('bankruptcyOverlay');
  if (overlay) {
    document.body.removeChild(overlay);
  }
}

async function executeBankruptcy() {
  const confirmBtn = document.getElementById('confirmBankruptcyBtn');
  if (confirmBtn) {
    confirmBtn.textContent = 'Processing...';
    confirmBtn.disabled = true;
  }

  try {
    const response = await fetch('/api/world/bankruptcy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok) {
      // Update modal to show success state
      const modalContent = document.querySelector('#bankruptcyOverlay > div');
      if (modalContent) {
        const liquidationValue = data.summary?.liquidationValue || 0;
        const aircraftCount = data.summary?.aircraftSold || 0;
        const routesCount = data.summary?.routesCancelled || 0;

        modalContent.innerHTML = `
          <div style="margin-bottom: 1.5rem;">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 1rem;">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M8 12l3 3 5-6"></path>
            </svg>
            <h2 style="color: #22c55e; margin-bottom: 0.5rem; font-size: 1.5rem;">BANKRUPTCY COMPLETE</h2>
          </div>

          <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 6px; padding: 1rem; margin-bottom: 1.5rem;">
            <p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6; margin-bottom: 0.75rem;">
              Your airline has been liquidated.
            </p>
            <div style="text-align: left; color: var(--text-secondary); font-size: 0.9rem;">
              <div style="display: flex; justify-content: space-between; padding: 0.25rem 0; border-bottom: 1px solid var(--border-color);">
                <span>Aircraft sold:</span>
                <span style="color: var(--text-primary);">${aircraftCount}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 0.25rem 0; border-bottom: 1px solid var(--border-color);">
                <span>Routes cancelled:</span>
                <span style="color: var(--text-primary);">${routesCount}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; font-weight: 600;">
                <span>Liquidation value:</span>
                <span style="color: #22c55e;">$${liquidationValue.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <p style="color: var(--text-muted); margin-bottom: 1.5rem; font-size: 0.85rem;">
            You can start a new airline by joining a world.
          </p>

          <button id="bankruptcyDoneBtn" style="
            padding: 0.75rem 2rem;
            background: #22c55e;
            border: 1px solid #22c55e;
            border-radius: 4px;
            color: white;
            cursor: pointer;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          ">Continue</button>
        `;

        document.getElementById('bankruptcyDoneBtn').addEventListener('click', function() {
          window.location.href = '/world-selection';
        });
      }
    } else {
      alert(data.error || 'Failed to declare bankruptcy. Please try again.');
      if (confirmBtn) {
        confirmBtn.textContent = 'Declare Bankruptcy';
        confirmBtn.disabled = false;
      }
    }
  } catch (error) {
    console.error('Bankruptcy error:', error);
    alert('An error occurred. Please try again.');
    if (confirmBtn) {
      confirmBtn.textContent = 'Declare Bankruptcy';
      confirmBtn.disabled = false;
    }
  }
}

// Make bankruptcy modal available globally
window.showBankruptcyModal = showBankruptcyModal;

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
    document.body.classList.add('sidebar-collapsed');
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
        document.body.classList.add('sidebar-collapsed');
      }

      // Add click handler for toggle
      toggleBtn.addEventListener('click', () => {
        if (dashboardContainer) {
          dashboardContainer.classList.toggle('sidebar-collapsed');
          const isCollapsed = dashboardContainer.classList.contains('sidebar-collapsed');
          document.body.classList.toggle('sidebar-collapsed', isCollapsed);
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
