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
let currentWorldTime = null;
let worldTimeAcceleration = 60;
let worldClockInterval = null;

// Load world information for navigation bar
async function loadWorldInfo() {
  try {
    // Don't show world info on world selection page
    if (window.location.pathname === '/world-selection') {
      const worldInfoContainer = document.getElementById('worldInfoContainer');
      if (worldInfoContainer) {
        worldInfoContainer.style.display = 'none';
      }
      return;
    }

    // Get world info from the dedicated API endpoint
    const response = await fetch('/api/world/info');
    const worldInfo = await response.json();

    if (response.ok && worldInfo && !worldInfo.error) {
      // Update world information
      const worldNameEl = document.getElementById('worldName');
      if (worldNameEl) {
        worldNameEl.textContent = worldInfo.name || '--';
      }

      // Store current world time and acceleration
      currentWorldTime = new Date(worldInfo.currentTime);
      worldTimeAcceleration = worldInfo.timeAcceleration || 60;

      // Format the world date and time separately
      const worldDateEl = document.getElementById('worldDate');
      const worldTimeEl = document.getElementById('worldTime');
      if (worldDateEl && worldTimeEl) {
        worldDateEl.textContent = currentWorldTime.toLocaleDateString();
        worldTimeEl.textContent = currentWorldTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      }

      // Update era
      const worldEraEl = document.getElementById('worldEra');
      if (worldEraEl) {
        worldEraEl.textContent = worldInfo.era || '--';
      }

      // Update elapsed time
      const worldElapsedEl = document.getElementById('worldElapsed');
      if (worldElapsedEl) {
        worldElapsedEl.textContent = `${worldInfo.elapsedDays || 0} days`;
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

      // Set up real-time clock with correct acceleration
      startRealTimeClock(worldTimeAcceleration);
    }
    // If no world data, just leave placeholder values visible - no need to hide container
  } catch (error) {
    console.error('Error loading world info:', error);
    // On error, just leave placeholder values visible - no need to hide container
  }
}

// Update world time periodically (sync with server every 30 seconds)
function updateWorldTime() {
  loadWorldInfo();
}

// More efficient real-time clock that increments time locally
function startRealTimeClock(accelerationFactor) {
  // Clear any existing interval
  if (worldClockInterval) {
    clearInterval(worldClockInterval);
  }

  // Update the clock every 100ms for smooth progression
  worldClockInterval = setInterval(() => {
    if (currentWorldTime) {
      // Advance game time based on acceleration (100ms real time)
      // If acceleration is 60x: 100ms real = 6000ms game time (6 seconds)
      // If acceleration is 120x: 100ms real = 12000ms game time (12 seconds)
      currentWorldTime = new Date(currentWorldTime.getTime() + (100 * accelerationFactor));

      const worldTimeEl = document.getElementById('worldTime');
      const worldDateEl = document.getElementById('worldDate');

      if (worldTimeEl) {
        worldTimeEl.textContent = currentWorldTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      }

      if (worldDateEl) {
        worldDateEl.textContent = currentWorldTime.toLocaleDateString();
      }
    }
  }, 100); // Update every 100ms
}

// Universal page initialization
function initializeLayout() {
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
document.addEventListener('DOMContentLoaded', initializeLayout);