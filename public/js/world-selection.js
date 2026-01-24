let selectedWorldId = null;
let bankruptcyWorldId = null;

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
    } else {
      window.location.href = '/';
    }
  } catch (error) {
    console.error('Error loading user info:', error);
  }
}

// Load available worlds
async function loadWorlds() {
  try {
    const response = await fetch('/api/worlds/available');
    const worlds = await response.json();

    const worldsList = document.getElementById('worldsList');
    const myWorldsList = document.getElementById('myWorldsList');
    const myWorldsSection = document.getElementById('myWorlds');

    const myWorlds = worlds.filter(w => w.isMember);
    const availableWorlds = worlds.filter(w => !w.isMember);

    // Show my worlds section if user has any
    if (myWorlds.length > 0) {
      myWorldsSection.style.display = 'block';
      myWorldsList.innerHTML = myWorlds.map(world => createWorldCard(world, true)).join('');
    } else {
      myWorldsSection.style.display = 'none';
    }

    // Show available worlds
    worldsList.innerHTML = availableWorlds.length > 0
      ? availableWorlds.map(world => createWorldCard(world, false)).join('')
      : '<div class="empty-message">No available worlds</div>';

  } catch (error) {
    console.error('Error loading worlds:', error);
  }
}

// Create world card HTML
function createWorldCard(world, isMember) {
  const timeDate = new Date(world.currentTime);
  const formattedDate = timeDate.toISOString().split('T')[0];

  return `
    <div class="world-card ${isMember ? 'member' : ''}">
      <div class="world-header" onclick="${isMember ? `enterWorld('${world.id}')` : `openJoinModal('${world.id}', '${world.name}')`}" style="cursor: pointer;">
        <div>
          <div class="world-name">${world.name}</div>
          <div class="world-era">ERA ${world.era}</div>
        </div>
        <div class="world-badge ${isMember ? 'joined' : ''}">
          ${isMember ? 'JOINED' : 'AVAILABLE'}
        </div>
      </div>

      ${isMember && world.airlineName ? `
        <div class="airline-info" onclick="enterWorld('${world.id}')" style="cursor: pointer;">
          <div class="airline-name">${world.airlineName}</div>
          <div class="airline-code">ICAO: ${world.airlineCode}</div>
        </div>
      ` : ''}

      ${world.description ? `
        <div class="world-description">${world.description}</div>
      ` : ''}

      <div class="world-info" onclick="${isMember ? `enterWorld('${world.id}')` : `openJoinModal('${world.id}', '${world.name}')`}" style="cursor: pointer;">
        <div class="info-row">
          <span class="info-label">Current Date</span>
          <span class="info-value">${formattedDate}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Time Sync</span>
          <span class="info-value">${world.timeAcceleration}x</span>
        </div>
        <div class="info-row">
          <span class="info-label">Members</span>
          <span class="info-value">${world.memberCount}/${world.maxPlayers}</span>
        </div>
      </div>

      ${isMember ? `
        <div class="world-actions" style="padding: 1rem; border-top: 1px solid var(--border-color);">
          <button class="btn btn-secondary" style="width: 100%;" onclick="event.stopPropagation(); leaveWorld('${world.id}', '${world.name}')">Declare Bankruptcy</button>
        </div>
      ` : ''}
    </div>
  `;
}

// Update starting capital info based on airline type
function updateStartingInfo() {
  const airlineType = document.getElementById('airlineType').value;
  const capitalEl = document.getElementById('startingCapital');

  const capitals = {
    'regional': '$500,000',
    'medium-haul': '$1,000,000',
    'long-haul': '$2,000,000'
  };

  capitalEl.textContent = airlineType
    ? `Starting Capital: ${capitals[airlineType]}`
    : 'Starting Capital: Select airline type';
}

// Open join modal
function openJoinModal(worldId, worldName) {
  selectedWorldId = worldId;
  document.getElementById('selectedWorldName').textContent = worldName;
  document.getElementById('region').value = '';
  document.getElementById('airlineType').value = '';
  document.getElementById('airlineName').value = '';
  document.getElementById('airlineCode').value = '';
  document.getElementById('joinError').style.display = 'none';
  document.getElementById('startingCapital').textContent = 'Starting Capital: Select airline type';
  document.getElementById('joinModal').style.display = 'flex';
}

// Close join modal
function closeJoinModal() {
  document.getElementById('joinModal').style.display = 'none';
  selectedWorldId = null;
}

// Confirm join
async function confirmJoin() {
  const region = document.getElementById('region').value;
  const airlineType = document.getElementById('airlineType').value;
  const airlineName = document.getElementById('airlineName').value.trim();
  const airlineCode = document.getElementById('airlineCode').value.trim().toUpperCase();
  const errorDiv = document.getElementById('joinError');

  // Validation
  if (!region || !airlineType || !airlineName || !airlineCode) {
    errorDiv.textContent = 'Please fill in all required fields';
    errorDiv.style.display = 'block';
    return;
  }

  if (!/^[A-Z]{3}$/.test(airlineCode)) {
    errorDiv.textContent = 'Airline code must be exactly 3 uppercase letters';
    errorDiv.style.display = 'block';
    return;
  }

  try {
    const response = await fetch('/api/worlds/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        worldId: selectedWorldId,
        region,
        airlineType,
        airlineName,
        airlineCode
      })
    });

    const data = await response.json();

    if (response.ok) {
      // Successfully joined, reload worlds
      closeJoinModal();
      loadWorlds();
    } else {
      errorDiv.textContent = data.error || 'Failed to join world';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Error joining world:', error);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

// Open bankruptcy modal
function leaveWorld(worldId, worldName) {
  bankruptcyWorldId = worldId;
  document.getElementById('bankruptcyWorldName').textContent = worldName;
  document.getElementById('bankruptcyModal').style.display = 'flex';
}

// Close bankruptcy modal
function closeBankruptcyModal() {
  document.getElementById('bankruptcyModal').style.display = 'none';
  bankruptcyWorldId = null;
}

// Confirm bankruptcy
async function confirmBankruptcy() {
  if (!bankruptcyWorldId) {
    return;
  }

  try {
    const response = await fetch('/api/worlds/leave', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ worldId: bankruptcyWorldId })
    });

    if (response.ok) {
      closeBankruptcyModal();
      loadWorlds();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to leave world');
    }
  } catch (error) {
    console.error('Error leaving world:', error);
    alert('Network error. Please try again.');
  }
}

// Enter world (navigate to dashboard with world context)
function enterWorld(worldId) {
  window.location.href = `/dashboard?world=${worldId}`;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadUserInfo();
  loadWorlds();
});
