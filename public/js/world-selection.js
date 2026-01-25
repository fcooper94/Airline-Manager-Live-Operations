let selectedWorldId = null;
let bankruptcyWorldId = null;
let selectedAirportId = null;
let airportSearchTimeout = null;

// Load available worlds
async function loadWorlds() {
  try {
    const response = await fetch('/api/worlds/available');

    if (!response.ok) {
      if (response.status === 401) {
        // Not authenticated, redirect to login
        window.location.href = '/';
        return;
      }
      throw new Error(`Failed to load worlds: ${response.status} ${response.statusText}`);
    }

    const worlds = await response.json();

    const worldsList = document.getElementById('worldsList');
    const myWorldsList = document.getElementById('myWorldsList');
    const myWorldsSection = document.getElementById('myWorlds');

    if (!Array.isArray(worlds)) {
      console.error('Invalid response format:', worlds);
      worldsList.innerHTML = '<div class="empty-message">Error loading worlds. Please refresh the page.</div>';
      return;
    }

    const myWorlds = worlds.filter(w => w.isMember);
    const availableWorlds = worlds.filter(w => !w.isMember);

    // Show my worlds section if user has any
    if (myWorlds.length > 0) {
      myWorldsSection.style.display = 'block';
      myWorldsList.innerHTML = '';
      myWorlds.forEach(world => {
        const cardElement = createWorldCard(world, true);
        myWorldsList.appendChild(cardElement);
      });
    } else {
      myWorldsSection.style.display = 'none';
    }

    // Show available worlds
    worldsList.innerHTML = '';
    if (availableWorlds.length > 0) {
      availableWorlds.forEach(world => {
        const cardElement = createWorldCard(world, false);
        worldsList.appendChild(cardElement);
      });
    } else if (myWorlds.length === 0) {
      worldsList.innerHTML = '<div class="empty-message">No worlds available. Please contact an administrator.</div>';
    } else {
      worldsList.innerHTML = '<div class="empty-message">No other worlds available.</div>';
    }

  } catch (error) {
    console.error('Error loading worlds:', error);
    const worldsList = document.getElementById('worldsList');
    if (worldsList) {
      worldsList.innerHTML = '<div class="empty-message">Error loading worlds. Please refresh the page.</div>';
    }
  }
}

// Create world card element (returns DOM element)
function createWorldCard(world, isMember) {
  const timeDate = new Date(world.currentTime);
  const formattedDate = timeDate.toLocaleDateString('en-GB');
  const formattedTime = timeDate.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const card = document.createElement('div');
  card.className = `world-card ${isMember ? 'member' : ''}`;
  card.innerHTML = `
    <div class="world-header" style="cursor: pointer;">
      <div>
        <div class="world-name">${world.name || 'Unnamed World'}</div>
        <div class="world-era">ERA ${world.era || 2010}</div>
      </div>
      <div class="world-badge ${isMember ? 'joined' : ''}">
        ${isMember ? 'JOINED' : 'AVAILABLE'}
      </div>
    </div>

    ${isMember && world.airlineName ? `
      <div class="airline-info" style="cursor: pointer;">
        <div class="airline-name">${world.airlineName}</div>
        <div class="airline-code">ICAO: ${world.airlineCode}</div>
      </div>
    ` : ''}

    ${world.description ? `
      <div class="world-description">${world.description}</div>
    ` : ''}

    <div class="world-info" style="cursor: pointer;">
      <div class="info-row">
        <span class="info-label">Current Date</span>
        <span class="info-value">${formattedDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Current Time</span>
        <span class="info-value world-current-time">${formattedTime}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Time Sync</span>
        <span class="info-value">${world.timeAcceleration || 60}x</span>
      </div>
      <div class="info-row">
        <span class="info-label">Members</span>
        <span class="info-value">${world.memberCount || 0}/${world.maxPlayers || 100}</span>
      </div>
    </div>

    ${isMember ? `
      <div class="world-actions" style="padding: 1rem; border-top: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 0.5rem;">
        <button class="btn btn-primary continue-game-btn" style="width: 100%;">Continue Game</button>
        <button class="btn btn-secondary bankruptcy-btn" style="width: 100%;">Declare Bankruptcy</button>
      </div>
    ` : ''}
  `;

  // Add event listeners programmatically to avoid injection issues
  const header = card.querySelector('.world-header');
  const worldInfo = card.querySelector('.world-info');
  const airlineInfo = card.querySelector('.airline-info');
  const continueGameBtn = card.querySelector('.continue-game-btn');
  const bankruptcyBtn = card.querySelector('.bankruptcy-btn');

  if (header) {
    header.addEventListener('click', () => {
      if (isMember) {
        enterWorld(world.id);
      } else {
        openJoinModal(world.id, world.name);
      }
    });
  }

  if (worldInfo) {
    worldInfo.addEventListener('click', () => {
      if (isMember) {
        enterWorld(world.id);
      } else {
        openJoinModal(world.id, world.name);
      }
    });
  }

  if (airlineInfo) {
    airlineInfo.addEventListener('click', () => {
      enterWorld(world.id);
    });
  }

  if (continueGameBtn) {
    continueGameBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      enterWorld(world.id);
    });
  }

  if (bankruptcyBtn) {
    bankruptcyBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      leaveWorld(world.id, world.name);
    });
  }

  return card;
}

// Update starting capital info based on airline type
function updateStartingInfo() {
  const airlineType = document.getElementById('airlineType').value;
  const capitalEl = document.getElementById('startingCapital');

  const capitals = {
    'regional': 'USD $500,000',
    'medium-haul': 'USD $1,000,000',
    'long-haul': 'USD $2,000,000'
  };

  capitalEl.textContent = airlineType
    ? `Starting Capital: ${capitals[airlineType]}`
    : 'Starting Capital: Select airline type';
}

// Search airports
async function searchAirports(query) {
  if (!query || query.length < 2) {
    document.getElementById('airportResults').style.display = 'none';
    return;
  }

  try {
    // Pass the selected world ID to filter airports by operational dates
    const worldParam = selectedWorldId ? `&worldId=${selectedWorldId}` : '';
    const response = await fetch(`/api/world/airports?search=${encodeURIComponent(query)}${worldParam}`);
    const airports = await response.json();

    const resultsDiv = document.getElementById('airportResults');

    if (airports.length === 0) {
      resultsDiv.innerHTML = '<div style="padding: 1rem; color: var(--text-secondary);">No airports found</div>';
      resultsDiv.style.display = 'block';
      return;
    }

    resultsDiv.innerHTML = airports.slice(0, 10).map(airport => `
      <div class="airport-result-item" onclick="selectAirport('${airport.id}', '${airport.name.replace(/'/g, "\\'")}', '${airport.city}', '${airport.country}', '${airport.icaoCode}')" style="
        padding: 0.75rem 1rem;
        cursor: pointer;
        border-bottom: 1px solid var(--border-color);
      " onmouseover="this.style.background='var(--surface)'" onmouseout="this.style.background='var(--surface-elevated)'">
        <div style="font-weight: 600; color: var(--text-primary);">${airport.name} (${airport.icaoCode})</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary);">${airport.city}, ${airport.country} • ${airport.type}</div>
      </div>
    `).join('');

    resultsDiv.style.display = 'block';
  } catch (error) {
    console.error('Error searching airports:', error);
  }
}

// Select airport
function selectAirport(id, name, city, country, icao) {
  selectedAirportId = id;
  document.getElementById('baseAirport').value = id;
  document.getElementById('selectedAirportName').textContent = `${name} (${icao})`;
  document.getElementById('selectedAirportLocation').textContent = `${city}, ${country}`;
  document.getElementById('selectedAirportDisplay').style.display = 'block';
  document.getElementById('airportSearch').style.display = 'none';
  document.getElementById('airportResults').style.display = 'none';
  document.getElementById('joinError').style.display = 'none';
}

// Clear selected airport
function clearSelectedAirport() {
  selectedAirportId = null;
  document.getElementById('baseAirport').value = '';
  document.getElementById('airportSearch').value = '';
  document.getElementById('airportSearch').style.display = 'block';
  document.getElementById('selectedAirportDisplay').style.display = 'none';
  document.getElementById('airportResults').style.display = 'none';
}

// Open join modal
function openJoinModal(worldId, worldName) {
  selectedWorldId = worldId;
  selectedAirportId = null;
  document.getElementById('selectedWorldName').textContent = worldName;
  document.getElementById('region').value = '';
  document.getElementById('airlineType').value = '';
  document.getElementById('airlineName').value = '';
  document.getElementById('airlineCode').value = '';
  document.getElementById('baseAirport').value = '';
  document.getElementById('airportSearch').value = '';
  document.getElementById('airportSearch').style.display = 'block';
  document.getElementById('selectedAirportDisplay').style.display = 'none';
  document.getElementById('airportResults').style.display = 'none';
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
  const baseAirportId = document.getElementById('baseAirport').value;
  const errorDiv = document.getElementById('joinError');

  // Validation
  if (!region || !airlineType || !airlineName || !airlineCode) {
    errorDiv.textContent = 'Please fill in all required fields';
    errorDiv.style.display = 'block';
    return;
  }

  if (!baseAirportId) {
    errorDiv.textContent = 'Please select a base airport';
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
        airlineCode,
        baseAirportId
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
      showErrorMessage(data.error || 'Failed to leave world');
    }
  } catch (error) {
    console.error('Error leaving world:', error);
    showErrorMessage('Network error. Please try again.');
  }
}

// Enter world (navigate to dashboard with world context)
async function enterWorld(worldId) {
  try {
    // Set the active world in the session
    const response = await fetch('/api/worlds/set-active', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ worldId })
    });

    if (response.ok) {
      // Navigate to dashboard
      window.location.href = '/dashboard';
    } else {
      const data = await response.json();
      showErrorMessage(data.error || 'Failed to enter world');
    }
  } catch (error) {
    console.error('Error entering world:', error);
    showErrorMessage('Network error. Please try again.');
  }
}

// Update world times for each world card
async function updateWorldTimes() {
  try {
    const response = await fetch('/api/worlds/available');

    if (!response.ok) {
      return;
    }

    const worlds = await response.json();

    // Update each world card with current time
    worlds.forEach(world => {
      const worldCards = document.querySelectorAll('.world-card');
      worldCards.forEach(card => {
        const cardWorldName = card.querySelector('.world-name')?.textContent;
        if (cardWorldName === world.name) {
          const timeElement = card.querySelector('.world-current-time');
          if (timeElement && world.currentTime) {
            const currentTime = new Date(world.currentTime);
            const timeStr = currentTime.toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit'
            });
            timeElement.textContent = timeStr;
          }
        }
      });
    });
  } catch (error) {
    console.error('Error updating world times:', error);
  }
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadWorlds();

  // Update world times every 10 seconds
  setInterval(updateWorldTimes, 10000);

  // Add airport search listener
  const airportSearchInput = document.getElementById('airportSearch');
  if (airportSearchInput) {
    airportSearchInput.addEventListener('input', (e) => {
      clearTimeout(airportSearchTimeout);
      airportSearchTimeout = setTimeout(() => {
        searchAirports(e.target.value);
      }, 300);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!airportSearchInput.contains(e.target) && !document.getElementById('airportResults').contains(e.target)) {
        document.getElementById('airportResults').style.display = 'none';
      }
    });
  }
});
