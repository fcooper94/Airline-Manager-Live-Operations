// Common layout functionality for the application

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

      // Show admin link if user is admin
      const adminLink = document.getElementById('adminLink');
      if (adminLink && data.user.isAdmin) {
        adminLink.style.display = 'inline-block';
        // Ensure proper CSS classes are applied
        if (!adminLink.classList.contains('btn')) {
          adminLink.classList.add('btn');
        }
        if (!adminLink.classList.contains('btn-secondary')) {
          adminLink.classList.add('btn-secondary');
        }
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

// Global variables for world time tracking
let serverReferenceTime = null; // Server's game time at a specific moment
let serverReferenceTimestamp = null; // Real-world timestamp when serverReferenceTime was valid
let worldTimeAcceleration = 60;
let worldClockInterval = null;
let worldInfoFetchInProgress = false; // Prevent concurrent fetches
let worldInfoFetchSequence = 0; // Track request order to ignore stale responses

// Load world information for navigation bar
async function loadWorldInfo() {
  // Prevent concurrent fetches to avoid race conditions
  if (worldInfoFetchInProgress) {
    return;
  }

  try {
    // Don't show world info on world selection page
    if (window.location.pathname === '/world-selection') {
      const worldInfoContainer = document.getElementById('worldInfoContainer');
      if (worldInfoContainer) {
        worldInfoContainer.style.display = 'none';
      }
      return;
    }

    worldInfoFetchInProgress = true;
    const currentSequence = ++worldInfoFetchSequence;

    // Get world info from the dedicated API endpoint
    const response = await fetch('/api/world/info');
    const worldInfo = await response.json();

    // Ignore this response if a newer request has been made
    if (currentSequence !== worldInfoFetchSequence) {
      return;
    }

    if (response.ok && worldInfo && !worldInfo.error) {
      // Update world information
      const worldNameEl = document.getElementById('worldName');
      if (worldNameEl) {
        worldNameEl.textContent = worldInfo.name || '--';
      }

      // Store server reference time and acceleration
      // Always use client-side time to avoid clock skew issues
      const clientReceiveTime = Date.now();
      serverReferenceTime = new Date(worldInfo.currentTime);
      serverReferenceTimestamp = clientReceiveTime;
      worldTimeAcceleration = worldInfo.timeAcceleration || 60;

      // console.log('[Layout] Time reference updated:', {
      //   serverTime: serverReferenceTime.toLocaleTimeString(),
      //   clientTimestamp: new Date(serverReferenceTimestamp).toLocaleTimeString(),
      //   acceleration: worldTimeAcceleration,
      //   source: worldInfo.timeSource || 'unknown'
      // });

      // Broadcast time update event for other scripts to sync
      window.dispatchEvent(new CustomEvent('worldTimeUpdated', {
        detail: {
          referenceTime: serverReferenceTime,
          referenceTimestamp: serverReferenceTimestamp,
          acceleration: worldTimeAcceleration,
          source: worldInfo.timeSource
        }
      }));

      // console.log('[Layout] worldTimeUpdated event broadcast');

      // Calculate and display current world time
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

      // Set up real-time clock
      startRealTimeClock();
    }
    // If no world data, just leave placeholder values visible - no need to hide container
  } catch (error) {
    console.error('Error loading world info:', error);
    // On error, just leave placeholder values visible - no need to hide container
  } finally {
    worldInfoFetchInProgress = false;
  }
}

// Update world time periodically (sync with server every 30 seconds)
function updateWorldTime() {
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

  // Update the clock every 100ms for smooth progression
  worldClockInterval = setInterval(() => {
    const currentWorldTime = calculateCurrentWorldTime();

    if (currentWorldTime) {
      const worldTimeEl = document.getElementById('worldTime');
      const worldDateEl = document.getElementById('worldDate');
      const worldDayEl = document.getElementById('worldDay');

      if (worldTimeEl) {
        worldTimeEl.textContent = currentWorldTime.toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});
      }

      if (worldDateEl) {
        worldDateEl.textContent = currentWorldTime.toLocaleDateString('en-GB');
      }

      if (worldDayEl) {
        const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        worldDayEl.textContent = dayNames[currentWorldTime.getDay()];
      }
    }
  }, 100); // Update every 100ms
}

// Universal page initialization
function initializeLayout() {
  // console.log('[Layout] Initializing layout.js...');
  // console.log('[Layout] Starting loadUserInfo()...');
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

  // console.log('[Layout] ✓ Layout initialization complete');
}

// Initialize common components across all pages
function initializeCommonComponents() {
  // Add any other common functionality that should be available on all pages
  // For example, common modals, tooltips, etc.

  // Ensure admin link visibility is handled consistently across all pages
  ensureAdminLinkVisibility();

  // Add other universal functionality here
}

// Ensure admin link visibility is consistent across all pages
function ensureAdminLinkVisibility() {
  // Check if user is authenticated and has admin rights
  fetch('/auth/status')
    .then(response => response.json())
    .then(data => {
      if (data.authenticated && data.user.isAdmin) {
        const adminLink = document.getElementById('adminLink');
        if (adminLink) {
          adminLink.style.display = 'inline-block';
          // Ensure proper CSS classes are applied
          if (!adminLink.classList.contains('btn')) {
            adminLink.classList.add('btn');
          }
          if (!adminLink.classList.contains('btn-secondary')) {
            adminLink.classList.add('btn-secondary');
          }
          // Ensure no conflicting styles are applied
          adminLink.style.marginRight = '1rem';
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

// Call initialize function when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // console.log('[Layout] DOMContentLoaded event fired');
  initializeLayout();
});