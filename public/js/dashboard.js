// WebSocket connection
const socket = io();

// All world data and time management is handled by layout.js

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
  } else if (credits < 4) {
    // Low credits warning (less than 1 month)
    banner.style.display = 'block';
    banner.classList.remove('critical');
    title.textContent = 'LOW CREDITS WARNING';
    message.textContent = `Your credit balance is running low (${credits} credits, less than 1 game month). Credits are consumed at 1 credit per game week. Consider purchasing more credits soon.`;
  } else {
    // Sufficient credits
    banner.style.display = 'none';
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
  loadVatsimStatus();

  // Refresh VATSIM status every 30 seconds
  setInterval(loadVatsimStatus, 30000);

  // World info is managed by layout.js
});
