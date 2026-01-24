// WebSocket connection
const socket = io();

// Game time state
let currentGameTime = null;
let localClockInterval = null;

// Format date and time
function formatGameTime(dateString) {
  const date = new Date(dateString);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatGameDate(dateString) {
  const date = new Date(dateString);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

// Update game time display
function updateGameTimeDisplay(gameTime) {
  if (!gameTime) return;

  currentGameTime = new Date(gameTime);

  document.getElementById('gameTime').textContent = formatGameTime(gameTime);
  document.getElementById('gameDate').textContent = formatGameDate(gameTime);
}

// Start local clock that advances the time client-side
function startLocalClock(accelerationFactor) {
  if (localClockInterval) {
    clearInterval(localClockInterval);
  }

  // Update display every 100ms for smooth progression
  localClockInterval = setInterval(() => {
    if (currentGameTime) {
      // Advance game time based on acceleration (100ms real time)
      currentGameTime = new Date(currentGameTime.getTime() + (100 * accelerationFactor));
      document.getElementById('gameTime').textContent = formatGameTime(currentGameTime);
      document.getElementById('gameDate').textContent = formatGameDate(currentGameTime);
    }
  }, 100);
}

// Load world information
async function loadWorldInfo() {
  try {
    const response = await fetch('/api/world/info');
    const data = await response.json();

    if (data.error) {
      console.warn('No active world:', data.message);
      document.getElementById('worldName').textContent = 'No World';
      document.getElementById('gameTime').textContent = '--:--';
      document.getElementById('gameDate').textContent = 'Create a world';
      return;
    }

    // Update world info
    document.getElementById('worldName').textContent = data.name;
    document.getElementById('timeAcceleration').textContent = `${data.timeAcceleration}x`;
    document.getElementById('elapsedDays').textContent = data.elapsedDays;
    document.getElementById('worldEra').textContent = data.era;

    // Update game time
    updateGameTimeDisplay(data.currentTime);

    // Start local clock
    startLocalClock(data.timeAcceleration);

  } catch (error) {
    console.error('Error loading world info:', error);
  }
}

// Update credit warning banner
function updateCreditWarningBanner(credits) {
  const banner = document.getElementById('creditWarningBanner');
  const title = document.getElementById('warningTitle');
  const message = document.getElementById('warningMessage');

  if (credits <= -4) {
    // Critical: In administration
    banner.style.display = 'block';
    banner.classList.add('critical');
    title.textContent = 'COMPANY IN ADMINISTRATION';
    message.textContent = 'Your company has entered administration. All assets will be sold to cover debts. Purchase credits immediately to continue operations.';
  } else if (credits < 0) {
    // Warning: Negative credits
    const weeksRemaining = 4 + credits; // e.g., -2 credits = 2 weeks remaining
    banner.style.display = 'block';
    banner.classList.remove('critical');
    title.textContent = 'CRITICAL CREDIT WARNING';
    message.textContent = `Your credit balance is negative (${credits} credits). You have ${weeksRemaining} game week${weeksRemaining !== 1 ? 's' : ''} remaining before your company enters administration and assets are sold.`;
  } else if (credits < 10) {
    // Low credits warning
    banner.style.display = 'block';
    banner.classList.remove('critical');
    title.textContent = 'LOW CREDITS WARNING';
    message.textContent = `Your credit balance is running low (${credits} credits). Credits are consumed at 1 credit per game week. Consider purchasing more credits soon.`;
  } else {
    // Sufficient credits
    banner.style.display = 'none';
  }
}

// Load user information
async function loadUserInfo() {
  try {
    const response = await fetch('/auth/status');
    const data = await response.json();

    if (data.authenticated) {
      document.getElementById('userName').textContent = data.user.name;
      const creditsEl = document.getElementById('userCredits');
      creditsEl.textContent = data.user.credits;
      // Color code credits based on value
      if (data.user.credits < 0) {
        creditsEl.style.color = 'var(--warning-color)';
      } else if (data.user.credits < 10) {
        creditsEl.style.color = 'var(--text-secondary)';
      } else {
        creditsEl.style.color = 'var(--success-color)';
      }

      // Show warning banner if credits are low
      updateCreditWarningBanner(data.user.credits);
    } else {
      // Redirect to login if not authenticated
      window.location.href = '/';
    }
  } catch (error) {
    console.error('Error loading user info:', error);
  }
}

// Load VATSIM status
async function loadVatsimStatus() {
  const statusDiv = document.getElementById('vatsimStatus');
  try {
    const response = await fetch('/api/health');
    const data = await response.json();

    if (data.status === 'healthy') {
      statusDiv.innerHTML = `
        <div style="color: var(--success-color);">
          ✓ Connected to VATSIM network<br>
          <small style="color: var(--text-secondary);">System operational</small>
        </div>
      `;
    }
  } catch (error) {
    statusDiv.innerHTML = `
      <div style="color: var(--text-secondary);">
        ⚠ Unable to connect to VATSIM network
      </div>
    `;
  }
}

// Socket.IO event listeners
socket.on('world:tick', (data) => {
  // Sync with server time periodically
  currentGameTime = new Date(data.gameTime);
});

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  loadUserInfo();
  loadWorldInfo();
  loadVatsimStatus();

  // Refresh world info every 30 seconds to stay in sync
  setInterval(loadWorldInfo, 30000);

  // Refresh VATSIM status every 30 seconds
  setInterval(loadVatsimStatus, 30000);
});
