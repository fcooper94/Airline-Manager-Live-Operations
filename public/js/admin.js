let selectedUserId = null;
let selectedUserData = null;
let selectedPermissionUserId = null;
let selectedPermissionUserData = null;
let allUsers = [];


// Load all users
async function loadUsers() {
  try {
    const response = await fetch('/api/admin/users');
    const users = await response.json();
    allUsers = users; // Store for search functionality

    const tbody = document.getElementById('usersTableBody');

    if (users.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-muted);">No users found</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = users.map(user => {
      const creditColor = user.credits < 0 ? 'var(--warning-color)' :
                         user.credits < 4 ? 'var(--text-secondary)' :
                         'var(--success-color)';

      // Format permissions display
      let permissionStatus = '';
      if (user.isAdmin && user.isContributor) {
        permissionStatus = '<span style="color: var(--success-color); font-weight: bold;">ADMIN & CONTRIBUTOR</span>';
      } else if (user.isAdmin) {
        permissionStatus = '<span style="color: var(--success-color); font-weight: bold;">ADMIN</span>';
      } else if (user.isContributor) {
        permissionStatus = '<span style="color: var(--accent-color); font-weight: bold;">CONTRIBUTOR</span>';
      } else {
        permissionStatus = '<span style="color: var(--text-secondary);">STANDARD</span>';
      }

      return `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 1rem; font-family: 'Courier New', monospace;">${user.vatsimId}</td>
          <td style="padding: 1rem;">${user.firstName} ${user.lastName}</td>
          <td style="padding: 1rem; color: var(--text-secondary);">${user.email || 'N/A'}</td>
          <td style="padding: 1rem; text-align: center; font-family: 'Courier New', monospace;">${user.membershipCount}</td>
          <td style="padding: 1rem; text-align: center; font-family: 'Courier New', monospace; color: ${creditColor}; font-weight: 600;">${user.credits}</td>
          <td style="padding: 1rem; text-align: center;">${permissionStatus}</td>
          <td style="padding: 1rem; text-align: center;">
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              <button class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.8rem;" onclick='openEditModal(${JSON.stringify(user)})'>Edit Credits</button>
              <button class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.8rem;" onclick='openPermissionModal(${JSON.stringify(user)})'>Detailed Permissions</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading users:', error);
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 2rem; text-align: center; color: var(--warning-color);">Error loading users</td>
      </tr>
    `;
  }
}

// Search users
function searchUsers() {
  const searchTerm = document.getElementById('searchUserInput').value.toLowerCase();

  if (!searchTerm) {
    loadUsers();
    return;
  }

  const filteredUsers = allUsers.filter(user =>
    user.vatsimId.toLowerCase().includes(searchTerm) ||
    (user.firstName + ' ' + user.lastName).toLowerCase().includes(searchTerm)
  );

  const tbody = document.getElementById('usersTableBody');

  if (filteredUsers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-muted);">No users found</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredUsers.map(user => {
    const creditColor = user.credits < 0 ? 'var(--warning-color)' :
                       user.credits < 4 ? 'var(--text-secondary)' :
                       'var(--success-color)';

    // Format permissions display
    let permissionStatus = '';
    if (user.isAdmin && user.isContributor) {
      permissionStatus = '<span style="color: var(--success-color); font-weight: bold;">ADMIN & CONTRIBUTOR</span>';
    } else if (user.isAdmin) {
      permissionStatus = '<span style="color: var(--success-color); font-weight: bold;">ADMIN</span>';
    } else if (user.isContributor) {
      permissionStatus = '<span style="color: var(--accent-color); font-weight: bold;">CONTRIBUTOR</span>';
    } else {
      permissionStatus = '<span style="color: var(--text-secondary);">STANDARD</span>';
    }

    return `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 1rem; font-family: 'Courier New', monospace;">${user.vatsimId}</td>
        <td style="padding: 1rem;">${user.firstName} ${user.lastName}</td>
        <td style="padding: 1rem; color: var(--text-secondary);">${user.email || 'N/A'}</td>
        <td style="padding: 1rem; text-align: center; font-family: 'Courier New', monospace;">${user.membershipCount}</td>
        <td style="padding: 1rem; text-align: center; font-family: 'Courier New', monospace; color: ${creditColor}; font-weight: 600;">${user.credits}</td>
        <td style="padding: 1rem; text-align: center;">${permissionStatus}</td>
        <td style="padding: 1rem; text-align: center;">
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <button class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.8rem;" onclick='openEditModal(${JSON.stringify(user)})'>Edit Credits</button>
            <button class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.8rem;" onclick='openPermissionModal(${JSON.stringify(user)})'>Detailed Permissions</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}


// Open edit modal
function openEditModal(user) {
  selectedUserId = user.id;
  selectedUserData = user;
  document.getElementById('editUserName').textContent = `${user.firstName} ${user.lastName} (${user.vatsimId})`;
  document.getElementById('editCurrentCredits').textContent = user.credits;
  document.getElementById('newCredits').value = user.credits;
  document.getElementById('editError').style.display = 'none';
  document.getElementById('editCreditsModal').style.display = 'flex';
}

// Close edit modal
function closeEditModal() {
  document.getElementById('editCreditsModal').style.display = 'none';
  selectedUserId = null;
  selectedUserData = null;
}

// Open permission modal
function openPermissionModal(user) {
  selectedPermissionUserId = user.id;
  selectedPermissionUserData = user;
  document.getElementById('permissionUserName').textContent = `${user.firstName} ${user.lastName} (${user.vatsimId})`;
  document.getElementById('isAdminSelect').value = user.isAdmin.toString();
  document.getElementById('isContributorSelect').value = user.isContributor.toString();
  document.getElementById('permissionError').style.display = 'none';
  document.getElementById('permissionModal').style.display = 'flex';
}

// Close permission modal
function closePermissionModal() {
  document.getElementById('permissionModal').style.display = 'none';
  selectedPermissionUserId = null;
  selectedPermissionUserData = null;
}

// Confirm edit
async function confirmEdit() {
  const newCredits = parseInt(document.getElementById('newCredits').value);
  const errorDiv = document.getElementById('editError');

  if (isNaN(newCredits)) {
    errorDiv.textContent = 'Please enter a valid number';
    errorDiv.style.display = 'block';
    return;
  }

  try {
    const response = await fetch(`/api/admin/users/${selectedUserId}/credits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ credits: newCredits })
    });

    const data = await response.json();

    if (response.ok) {
      closeEditModal();
      loadUsers();
    } else {
      errorDiv.textContent = data.error || 'Failed to update credits';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Error updating credits:', error);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

// Confirm permission update
async function confirmPermissionUpdate() {
  const isAdmin = document.getElementById('isAdminSelect').value === 'true';
  const isContributor = document.getElementById('isContributorSelect').value === 'true';
  const errorDiv = document.getElementById('permissionError');

  try {
    const response = await fetch(`/api/admin/users/${selectedPermissionUserId}/permissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        isAdmin: isAdmin,
        isContributor: isContributor
      })
    });

    const data = await response.json();

    if (response.ok) {
      closePermissionModal();
      loadUsers();
    } else {
      errorDiv.textContent = data.error || 'Failed to update permissions';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Error updating permissions:', error);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

// ==================== AIRCRAFT MANAGEMENT ====================

let allAircraft = [];
let selectedAircraftId = null;
let deleteAircraftId = null;

// Switch between tabs
function switchTab(tab) {
  // Update tab buttons
  const usersTab = document.getElementById('usersTab');
  const aircraftTab = document.getElementById('aircraftTab');
  const airportsTab = document.getElementById('airportsTab');
  const worldsTab = document.getElementById('worldsTab');

  // Remove active state from all tabs
  [usersTab, aircraftTab, airportsTab, worldsTab].forEach(t => {
    if (t) {
      t.classList.remove('active');
      t.style.borderBottom = '3px solid transparent';
      t.style.color = 'var(--text-muted)';
    }
  });

  // Hide all sections
  document.getElementById('usersSection').style.display = 'none';
  document.getElementById('aircraftSection').style.display = 'none';
  document.getElementById('airportsSection').style.display = 'none';
  document.getElementById('worldsSection').style.display = 'none';

  if (tab === 'users') {
    usersTab.classList.add('active');
    usersTab.style.borderBottom = '3px solid var(--primary-color)';
    usersTab.style.color = 'var(--primary-color)';
    document.getElementById('usersSection').style.display = 'block';
  } else if (tab === 'aircraft') {
    aircraftTab.classList.add('active');
    aircraftTab.style.borderBottom = '3px solid var(--primary-color)';
    aircraftTab.style.color = 'var(--primary-color)';
    document.getElementById('aircraftSection').style.display = 'block';

    // Load aircraft if not already loaded
    if (allAircraft.length === 0) {
      loadAircraft();
    }
  } else if (tab === 'airports') {
    airportsTab.classList.add('active');
    airportsTab.style.borderBottom = '3px solid var(--primary-color)';
    airportsTab.style.color = 'var(--primary-color)';
    document.getElementById('airportsSection').style.display = 'block';

    // Load airports if not already loaded
    if (allAirports.length === 0) {
      loadAirports();
    }
  } else if (tab === 'worlds') {
    worldsTab.classList.add('active');
    worldsTab.style.borderBottom = '3px solid var(--primary-color)';
    worldsTab.style.color = 'var(--primary-color)';
    document.getElementById('worldsSection').style.display = 'block';

    // Load worlds if not already loaded
    if (typeof allWorlds === 'undefined' || allWorlds.length === 0) {
      loadWorlds();
    }
  }
}

// Load all aircraft
async function loadAircraft() {
  try {
    const response = await fetch('/api/admin/aircraft');
    const aircraft = await response.json();
    allAircraft = aircraft;

    renderAircraftTable(aircraft);
  } catch (error) {
    console.error('Error loading aircraft:', error);
    const tbody = document.getElementById('aircraftTableBody');
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 2rem; text-align: center; color: var(--warning-color);">Error loading aircraft</td>
      </tr>
    `;
  }
}

// Render aircraft table
function renderAircraftTable(aircraft) {
  const tbody = document.getElementById('aircraftTableBody');

  if (aircraft.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-muted);">No aircraft found</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = aircraft.map(ac => {
    const fullName = ac.variant ? `${ac.manufacturer} ${ac.model}-${ac.variant}` : `${ac.manufacturer} ${ac.model}`;
    const statusColor = ac.isActive ? 'var(--success-color)' : 'var(--text-secondary)';
    const statusText = ac.isActive ? 'ACTIVE' : 'INACTIVE';

    return `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 1rem; font-weight: 600;">${fullName}</td>
        <td style="padding: 1rem; text-align: center;">${ac.type}</td>
        <td style="padding: 1rem; text-align: center;">${ac.rangeCategory}<br><span style="color: var(--text-secondary); font-size: 0.85rem;">${ac.rangeNm} NM</span></td>
        <td style="padding: 1rem; text-align: center;">${ac.passengerCapacity} PAX</td>
        <td style="padding: 1rem; text-align: center; font-family: 'Courier New', monospace;">$${parseInt(ac.purchasePrice).toLocaleString()}</td>
        <td style="padding: 1rem; text-align: center; color: ${statusColor}; font-weight: 600;">${statusText}</td>
        <td style="padding: 1rem; text-align: center;">
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <button class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.8rem;" onclick='openEditAircraftModal(${JSON.stringify(ac).replace(/'/g, "\\'")})'>Edit</button>
            <button class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.8rem; background: var(--warning-color); border-color: var(--warning-color);" onclick='openDeleteAircraftModal("${ac.id}", "${fullName.replace(/'/g, "\\'")}")'>Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Search aircraft
function searchAircraft() {
  const searchTerm = document.getElementById('searchAircraftInput').value.toLowerCase();

  if (!searchTerm) {
    renderAircraftTable(allAircraft);
    return;
  }

  const filteredAircraft = allAircraft.filter(ac => {
    const fullName = `${ac.manufacturer} ${ac.model}`.toLowerCase();
    return fullName.includes(searchTerm) ||
           ac.manufacturer.toLowerCase().includes(searchTerm) ||
           ac.model.toLowerCase().includes(searchTerm);
  });

  renderAircraftTable(filteredAircraft);
}

// Open add aircraft modal
function openAddAircraftModal() {
  selectedAircraftId = null;
  document.getElementById('aircraftModalTitle').textContent = 'ADD AIRCRAFT';
  clearAircraftForm();
  document.getElementById('aircraftModal').style.display = 'flex';
}

// Open edit aircraft modal
function openEditAircraftModal(aircraft) {
  selectedAircraftId = aircraft.id;
  document.getElementById('aircraftModalTitle').textContent = 'EDIT AIRCRAFT';

  // Populate form
  document.getElementById('aircraftManufacturer').value = aircraft.manufacturer || '';
  document.getElementById('aircraftModel').value = aircraft.model || '';
  document.getElementById('aircraftVariant').value = aircraft.variant || '';
  document.getElementById('aircraftType').value = aircraft.type || '';
  document.getElementById('aircraftRangeCategory').value = aircraft.rangeCategory || '';
  document.getElementById('aircraftRangeNm').value = aircraft.rangeNm || '';
  document.getElementById('aircraftCruiseSpeed').value = aircraft.cruiseSpeed || '';
  document.getElementById('aircraftPassengerCapacity').value = aircraft.passengerCapacity || '';
  document.getElementById('aircraftCargoCapacity').value = aircraft.cargoCapacityKg || '';
  document.getElementById('aircraftFuelCapacity').value = aircraft.fuelCapacityLiters || '';
  document.getElementById('aircraftPurchasePrice').value = aircraft.purchasePrice || '';
  document.getElementById('aircraftUsedPrice').value = aircraft.usedPrice || '';
  document.getElementById('aircraftMaintenanceCost').value = aircraft.maintenanceCostPerHour || '';
  document.getElementById('aircraftMaintenanceMonth').value = aircraft.maintenanceCostPerMonth || '';
  document.getElementById('aircraftFuelBurn').value = aircraft.fuelBurnPerHour || '';
  document.getElementById('aircraftFirstIntroduced').value = aircraft.firstIntroduced || '';
  document.getElementById('aircraftAvailableFrom').value = aircraft.availableFrom || '';
  document.getElementById('aircraftAvailableUntil').value = aircraft.availableUntil || '';
  document.getElementById('aircraftRequiredPilots').value = aircraft.requiredPilots !== undefined ? aircraft.requiredPilots : 2;
  document.getElementById('aircraftRequiredCabinCrew').value = aircraft.requiredCabinCrew !== undefined ? aircraft.requiredCabinCrew : 0;
  document.getElementById('aircraftIsActive').value = aircraft.isActive ? 'true' : 'false';
  document.getElementById('aircraftDescription').value = aircraft.description || '';

  document.getElementById('aircraftError').style.display = 'none';
  document.getElementById('aircraftModal').style.display = 'flex';
}

// Close aircraft modal
function closeAircraftModal() {
  document.getElementById('aircraftModal').style.display = 'none';
  selectedAircraftId = null;
  clearAircraftForm();
}

// Clear aircraft form
function clearAircraftForm() {
  document.getElementById('aircraftManufacturer').value = '';
  document.getElementById('aircraftModel').value = '';
  document.getElementById('aircraftVariant').value = '';
  document.getElementById('aircraftType').value = '';
  document.getElementById('aircraftRangeCategory').value = '';
  document.getElementById('aircraftRangeNm').value = '';
  document.getElementById('aircraftCruiseSpeed').value = '';
  document.getElementById('aircraftPassengerCapacity').value = '';
  document.getElementById('aircraftCargoCapacity').value = '';
  document.getElementById('aircraftFuelCapacity').value = '';
  document.getElementById('aircraftPurchasePrice').value = '';
  document.getElementById('aircraftUsedPrice').value = '';
  document.getElementById('aircraftMaintenanceCost').value = '';
  document.getElementById('aircraftMaintenanceMonth').value = '';
  document.getElementById('aircraftFuelBurn').value = '';
  document.getElementById('aircraftFirstIntroduced').value = '';
  document.getElementById('aircraftAvailableFrom').value = '';
  document.getElementById('aircraftAvailableUntil').value = '';
  document.getElementById('aircraftRequiredPilots').value = '2';
  document.getElementById('aircraftRequiredCabinCrew').value = '0';
  document.getElementById('aircraftIsActive').value = 'true';
  document.getElementById('aircraftDescription').value = '';
  document.getElementById('aircraftError').style.display = 'none';
}

// Save aircraft (create or update)
async function saveAircraft() {
  const errorDiv = document.getElementById('aircraftError');

  const aircraftData = {
    manufacturer: document.getElementById('aircraftManufacturer').value.trim(),
    model: document.getElementById('aircraftModel').value.trim(),
    variant: document.getElementById('aircraftVariant').value.trim() || null,
    type: document.getElementById('aircraftType').value,
    rangeCategory: document.getElementById('aircraftRangeCategory').value,
    rangeNm: parseInt(document.getElementById('aircraftRangeNm').value),
    cruiseSpeed: parseInt(document.getElementById('aircraftCruiseSpeed').value),
    passengerCapacity: parseInt(document.getElementById('aircraftPassengerCapacity').value),
    cargoCapacityKg: parseInt(document.getElementById('aircraftCargoCapacity').value) || null,
    fuelCapacityLiters: parseInt(document.getElementById('aircraftFuelCapacity').value),
    purchasePrice: parseFloat(document.getElementById('aircraftPurchasePrice').value),
    usedPrice: parseFloat(document.getElementById('aircraftUsedPrice').value) || null,
    maintenanceCostPerHour: parseFloat(document.getElementById('aircraftMaintenanceCost').value),
    maintenanceCostPerMonth: parseFloat(document.getElementById('aircraftMaintenanceMonth').value) || null,
    fuelBurnPerHour: parseFloat(document.getElementById('aircraftFuelBurn').value),
    firstIntroduced: parseInt(document.getElementById('aircraftFirstIntroduced').value) || null,
    availableFrom: parseInt(document.getElementById('aircraftAvailableFrom').value) || null,
    availableUntil: parseInt(document.getElementById('aircraftAvailableUntil').value) || null,
    requiredPilots: parseInt(document.getElementById('aircraftRequiredPilots').value) || 2,
    requiredCabinCrew: parseInt(document.getElementById('aircraftRequiredCabinCrew').value) || 0,
    isActive: document.getElementById('aircraftIsActive').value === 'true',
    description: document.getElementById('aircraftDescription').value.trim() || null
  };

  // Validate required fields
  if (!aircraftData.manufacturer || !aircraftData.model || !aircraftData.type || !aircraftData.rangeCategory) {
    errorDiv.textContent = 'Please fill in all required fields';
    errorDiv.style.display = 'block';
    return;
  }

  try {
    let response;
    if (selectedAircraftId) {
      // Update existing aircraft
      response = await fetch(`/api/admin/aircraft/${selectedAircraftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aircraftData)
      });
    } else {
      // Create new aircraft
      response = await fetch('/api/admin/aircraft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aircraftData)
      });
    }

    const data = await response.json();

    if (response.ok) {
      closeAircraftModal();
      loadAircraft();
    } else {
      errorDiv.textContent = data.error || 'Failed to save aircraft';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Error saving aircraft:', error);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

// Open delete aircraft modal
function openDeleteAircraftModal(aircraftId, aircraftName) {
  deleteAircraftId = aircraftId;
  document.getElementById('deleteAircraftName').textContent = aircraftName;
  document.getElementById('deleteAircraftModal').style.display = 'flex';
}

// Close delete aircraft modal
function closeDeleteAircraftModal() {
  document.getElementById('deleteAircraftModal').style.display = 'none';
  deleteAircraftId = null;
}

// Confirm delete aircraft
async function confirmDeleteAircraft() {
  if (!deleteAircraftId) return;

  try {
    const response = await fetch(`/api/admin/aircraft/${deleteAircraftId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      closeDeleteAircraftModal();
      loadAircraft();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to delete aircraft');
    }
  } catch (error) {
    console.error('Error deleting aircraft:', error);
    alert('Network error. Please try again.');
  }
}

// ==================== AIRPORTS MANAGEMENT ====================

let allAirports = [];
let selectedAirportId = null;
let deleteAirportId = null;

// ==================== WORLDS MANAGEMENT ====================

let allWorlds = [];
let selectedWorldId = null;
let deleteWorldId = null;

// Load all worlds
async function loadWorlds() {
  try {
    const response = await fetch('/api/admin/worlds');
    const worlds = await response.json();
    allWorlds = worlds;

    renderWorldsTable(worlds);
  } catch (error) {
    console.error('Error loading worlds:', error);
    const tbody = document.getElementById('worldsTableBody');
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 2rem; text-align: center; color: var(--warning-color);">Error loading worlds</td>
      </tr>
    `;
  }
}

// Render worlds table
function renderWorldsTable(worlds) {
  const tbody = document.getElementById('worldsTableBody');

  if (worlds.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-muted);">No worlds found</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = worlds.map(world => {
    const statusColor = world.status === 'active' ? 'var(--success-color)' :
                       world.status === 'paused' ? 'var(--warning-color)' :
                       world.status === 'completed' ? 'var(--text-secondary)' :
                       'var(--accent-color)';
    const statusText = world.status.charAt(0).toUpperCase() + world.status.slice(1);

    // Debug: Log the raw currentTime value
    console.log('World currentTime from API:', world.name, world.currentTime, typeof world.currentTime);

    const currentTime = new Date(world.currentTime);
    console.log('Parsed currentTime as Date:', currentTime.toString());

    const formattedTime = currentTime.toLocaleDateString() + ' ' + currentTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    return `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 1rem; font-weight: 600;">${world.name}</td>
        <td style="padding: 1rem; text-align: center;">${world.era}</td>
        <td style="padding: 1rem; text-align: center;">${formattedTime}</td>
        <td style="padding: 1rem; text-align: center;">${world.memberCount || 0}/${world.maxPlayers || 100}</td>
        <td style="padding: 1rem; text-align: center; color: ${statusColor}; font-weight: 600;">${statusText}</td>
        <td style="padding: 1rem; text-align: center; font-family: 'Courier New', monospace;">${world.timeAcceleration || 60}x</td>
        <td style="padding: 1rem; text-align: center;">
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <button class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.8rem;" onclick='openEditWorldModal(${JSON.stringify(world).replace(/'/g, "\\'")})'>Edit</button>
            <button class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.8rem; background: var(--warning-color); border-color: var(--warning-color);" onclick='openDeleteWorldModal("${world.id}", "${world.name.replace(/'/g, "\\'")}")'>Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Search worlds
function searchWorlds() {
  const searchTerm = document.getElementById('searchWorldInput').value.toLowerCase();

  if (!searchTerm) {
    renderWorldsTable(allWorlds);
    return;
  }

  const filteredWorlds = allWorlds.filter(world => {
    return world.name.toLowerCase().includes(searchTerm) ||
           world.era.toString().includes(searchTerm);
  });

  renderWorldsTable(filteredWorlds);
}

// Open add world modal
function openAddWorldModal() {
  selectedWorldId = null;
  document.getElementById('worldModalTitle').textContent = 'ADD WORLD';
  clearWorldForm();
  document.getElementById('worldModal').style.display = 'flex';

  // Debug: Add event listener to track typing
  const nameInput = document.getElementById('worldNameInput');
  if (nameInput) {
    nameInput.addEventListener('input', function(e) {
      console.log('World Name input changed to:', e.target.value);
    });
    console.log('World Name input element attached, initial value:', nameInput.value);
  } else {
    console.error('World Name input element NOT FOUND when opening modal');
  }
}

// Open edit world modal
function openEditWorldModal(world) {
  selectedWorldId = world.id;
  document.getElementById('worldModalTitle').textContent = 'EDIT WORLD';

  // Populate form
  document.getElementById('worldNameInput').value = world.name || '';
  document.getElementById('worldStartDate').value = world.startDate ? new Date(world.startDate).toISOString().split('T')[0] : '';
  document.getElementById('worldTimeAcceleration').value = world.timeAcceleration || 60;
  document.getElementById('worldMaxPlayers').value = world.maxPlayers || 100;
  document.getElementById('worldStatus').value = world.status || 'setup';
  document.getElementById('worldDescription').value = world.description || '';

  document.getElementById('worldError').style.display = 'none';
  document.getElementById('worldModal').style.display = 'flex';
}

// Close world modal
function closeWorldModal() {
  document.getElementById('worldModal').style.display = 'none';
  selectedWorldId = null;
  clearWorldForm();
}

// Clear world form
function clearWorldForm() {
  document.getElementById('worldNameInput').value = '';
  document.getElementById('worldStartDate').value = new Date().toISOString().split('T')[0]; // Set to today
  document.getElementById('worldTimeAcceleration').value = '60';
  document.getElementById('worldMaxPlayers').value = '100';
  document.getElementById('worldStatus').value = 'setup';
  document.getElementById('worldDescription').value = '';
  document.getElementById('worldError').style.display = 'none';
}

// Save world (create or update)
async function saveWorld() {
  const errorDiv = document.getElementById('worldError');

  // Debug: Log all input elements
  const nameElement = document.getElementById('worldNameInput');
  const startDateElement = document.getElementById('worldStartDate');
  const timeAccelElement = document.getElementById('worldTimeAcceleration');
  const statusElement = document.getElementById('worldStatus');

  console.log('Input elements found:', {
    nameElement: !!nameElement,
    nameValue: nameElement ? nameElement.value : 'ELEMENT NOT FOUND',
    startDateElement: !!startDateElement,
    startDateValue: startDateElement ? startDateElement.value : 'ELEMENT NOT FOUND',
    timeAccelElement: !!timeAccelElement,
    timeAccelValue: timeAccelElement ? timeAccelElement.value : 'ELEMENT NOT FOUND',
    statusElement: !!statusElement,
    statusValue: statusElement ? statusElement.value : 'ELEMENT NOT FOUND'
  });

  const startDate = startDateElement ? startDateElement.value : '';

  const worldData = {
    name: nameElement ? nameElement.value.trim() : '',
    era: startDate ? new Date(startDate).getFullYear() : new Date().getFullYear(), // Calculate era from start date
    startDate: startDate,
    timeAcceleration: timeAccelElement ? parseFloat(timeAccelElement.value) : NaN,
    maxPlayers: parseInt(document.getElementById('worldMaxPlayers').value),
    status: statusElement ? statusElement.value : '',
    description: document.getElementById('worldDescription').value.trim() || null
  };

  console.log('World data built:', worldData);

  // Validate required fields with specific error messages
  const missingFields = [];
  if (!worldData.name) missingFields.push('World Name');
  if (!worldData.startDate) missingFields.push('Start Date');
  if (isNaN(worldData.timeAcceleration)) missingFields.push('Time Acceleration');
  if (!worldData.status) missingFields.push('Status');

  if (missingFields.length > 0) {
    errorDiv.textContent = 'Missing required fields: ' + missingFields.join(', ');
    errorDiv.style.display = 'block';
    console.log('Validation failed. World data:', worldData);
    console.log('Missing fields:', missingFields);
    return;
  }

  // Validate timeAcceleration is positive
  if (worldData.timeAcceleration <= 0) {
    errorDiv.textContent = 'Time acceleration must be greater than 0';
    errorDiv.style.display = 'block';
    return;
  }

  // Set default maxPlayers if not provided
  if (isNaN(worldData.maxPlayers) || worldData.maxPlayers <= 0) {
    worldData.maxPlayers = 100;
  }

  try {
    let response;
    if (selectedWorldId) {
      // Update existing world
      response = await fetch(`/api/admin/worlds/${selectedWorldId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(worldData)
      });
    } else {
      // Create new world
      response = await fetch('/api/admin/worlds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(worldData)
      });
    }

    const data = await response.json();

    if (response.ok) {
      closeWorldModal();
      loadWorlds();
    } else {
      errorDiv.textContent = data.error || 'Failed to save world';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Error saving world:', error);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

// Open delete world modal
function openDeleteWorldModal(worldId, worldName) {
  deleteWorldId = worldId;
  document.getElementById('deleteWorldName').textContent = worldName;
  document.getElementById('deleteWorldModal').style.display = 'flex';
}

// Close delete world modal
function closeDeleteWorldModal() {
  document.getElementById('deleteWorldModal').style.display = 'none';
  deleteWorldId = null;
}

// Confirm delete world
async function confirmDeleteWorld() {
  if (!deleteWorldId) return;

  try {
    const response = await fetch(`/api/admin/worlds/${deleteWorldId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      closeDeleteWorldModal();
      loadWorlds();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to delete world');
    }
  } catch (error) {
    console.error('Error deleting world:', error);
    alert('Network error. Please try again.');
  }
}

// Load all airports
async function loadAirports() {
  try {
    const response = await fetch('/api/admin/airports');
    const airports = await response.json();
    allAirports = airports;

    renderAirportsTable(airports);
  } catch (error) {
    console.error('Error loading airports:', error);
    const tbody = document.getElementById('airportsTableBody');
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 2rem; text-align: center; color: var(--warning-color);">Error loading airports</td>
      </tr>
    `;
  }
}

// Render airports table
function renderAirportsTable(airports) {
  const tbody = document.getElementById('airportsTableBody');

  if (airports.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-muted);">No airports found</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = airports.map(airport => {
    const statusColor = airport.isActive ? 'var(--success-color)' : 'var(--text-secondary)';
    const statusText = airport.isActive ? 'ENABLED' : 'DISABLED';
    const codes = airport.iataCode ? `${airport.icaoCode} / ${airport.iataCode}` : airport.icaoCode;

    // Format operational dates
    let operationalDates = '';
    if (airport.operationalFrom && airport.operationalUntil) {
      operationalDates = `${airport.operationalFrom} - ${airport.operationalUntil}`;
    } else if (airport.operationalFrom) {
      operationalDates = `${airport.operationalFrom} - Present`;
    } else if (airport.operationalUntil) {
      operationalDates = `Unknown - ${airport.operationalUntil}`;
    } else {
      operationalDates = 'All periods';
    }

    return `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 1rem; font-weight: 600;">${airport.name}</td>
        <td style="padding: 1rem; text-align: center; font-family: 'Courier New', monospace;">${codes}</td>
        <td style="padding: 1rem; text-align: center;">${airport.city}<br><span style="color: var(--text-secondary); font-size: 0.85rem;">${airport.country}</span></td>
        <td style="padding: 1rem; text-align: center;">${airport.type}</td>
        <td style="padding: 1rem; text-align: center; font-size: 0.9rem;">${operationalDates}</td>
        <td style="padding: 1rem; text-align: center; color: ${statusColor}; font-weight: 600;">${statusText}</td>
        <td style="padding: 1rem; text-align: center;">
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <button class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.8rem;" onclick='openEditAirportModal(${JSON.stringify(airport).replace(/'/g, "\\'")})'>Edit</button>
            <button class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.8rem; background: var(--warning-color); border-color: var(--warning-color);" onclick='openDeleteAirportModal("${airport.id}", "${airport.name.replace(/'/g, "\\'")}")'>Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Search airports
function searchAirports() {
  const searchTerm = document.getElementById('searchAirportInput').value.toLowerCase();

  if (!searchTerm) {
    renderAirportsTable(allAirports);
    return;
  }

  const filteredAirports = allAirports.filter(airport => {
    return airport.name.toLowerCase().includes(searchTerm) ||
           airport.city.toLowerCase().includes(searchTerm) ||
           airport.country.toLowerCase().includes(searchTerm) ||
           airport.icaoCode.toLowerCase().includes(searchTerm) ||
           (airport.iataCode && airport.iataCode.toLowerCase().includes(searchTerm));
  });

  renderAirportsTable(filteredAirports);
}

// Open add airport modal
function openAddAirportModal() {
  selectedAirportId = null;
  document.getElementById('airportModalTitle').textContent = 'ADD AIRPORT';
  clearAirportForm();
  document.getElementById('airportModal').style.display = 'flex';
}

// Open edit airport modal
function openEditAirportModal(airport) {
  selectedAirportId = airport.id;
  document.getElementById('airportModalTitle').textContent = 'EDIT AIRPORT';

  // Populate form
  document.getElementById('airportIcaoCode').value = airport.icaoCode || '';
  document.getElementById('airportIataCode').value = airport.iataCode || '';
  document.getElementById('airportName').value = airport.name || '';
  document.getElementById('airportCity').value = airport.city || '';
  document.getElementById('airportCountry').value = airport.country || '';
  document.getElementById('airportLatitude').value = airport.latitude || '';
  document.getElementById('airportLongitude').value = airport.longitude || '';
  document.getElementById('airportElevation').value = airport.elevation || '';
  document.getElementById('airportType').value = airport.type || '';
  document.getElementById('airportTimezone').value = airport.timezone || '';
  document.getElementById('airportOperationalFrom').value = airport.operationalFrom || '';
  document.getElementById('airportOperationalUntil').value = airport.operationalUntil || '';
  document.getElementById('airportIsActive').value = airport.isActive ? 'true' : 'false';

  document.getElementById('airportError').style.display = 'none';
  document.getElementById('airportModal').style.display = 'flex';
}

// Close airport modal
function closeAirportModal() {
  document.getElementById('airportModal').style.display = 'none';
  selectedAirportId = null;
  clearAirportForm();
}

// Clear airport form
function clearAirportForm() {
  document.getElementById('airportIcaoCode').value = '';
  document.getElementById('airportIataCode').value = '';
  document.getElementById('airportName').value = '';
  document.getElementById('airportCity').value = '';
  document.getElementById('airportCountry').value = '';
  document.getElementById('airportLatitude').value = '';
  document.getElementById('airportLongitude').value = '';
  document.getElementById('airportElevation').value = '';
  document.getElementById('airportType').value = '';
  document.getElementById('airportTimezone').value = '';
  document.getElementById('airportOperationalFrom').value = '';
  document.getElementById('airportOperationalUntil').value = '';
  document.getElementById('airportIsActive').value = 'true';
  document.getElementById('airportError').style.display = 'none';
}

// Save airport (create or update)
async function saveAirport() {
  const errorDiv = document.getElementById('airportError');

  const airportData = {
    icaoCode: document.getElementById('airportIcaoCode').value.trim().toUpperCase(),
    iataCode: document.getElementById('airportIataCode').value.trim().toUpperCase() || null,
    name: document.getElementById('airportName').value.trim(),
    city: document.getElementById('airportCity').value.trim(),
    country: document.getElementById('airportCountry').value.trim(),
    latitude: parseFloat(document.getElementById('airportLatitude').value),
    longitude: parseFloat(document.getElementById('airportLongitude').value),
    elevation: parseInt(document.getElementById('airportElevation').value) || null,
    type: document.getElementById('airportType').value,
    timezone: document.getElementById('airportTimezone').value.trim() || null,
    operationalFrom: parseInt(document.getElementById('airportOperationalFrom').value) || null,
    operationalUntil: parseInt(document.getElementById('airportOperationalUntil').value) || null,
    isActive: document.getElementById('airportIsActive').value === 'true'
  };

  // Validate required fields
  if (!airportData.icaoCode || !airportData.name || !airportData.city || !airportData.country ||
      isNaN(airportData.latitude) || isNaN(airportData.longitude) || !airportData.type) {
    errorDiv.textContent = 'Please fill in all required fields';
    errorDiv.style.display = 'block';
    return;
  }

  // Validate ICAO code format
  if (!/^[A-Z]{4}$/.test(airportData.icaoCode)) {
    errorDiv.textContent = 'ICAO code must be exactly 4 uppercase letters';
    errorDiv.style.display = 'block';
    return;
  }

  // Validate IATA code if provided
  if (airportData.iataCode && !/^[A-Z]{3}$/.test(airportData.iataCode)) {
    errorDiv.textContent = 'IATA code must be exactly 3 uppercase letters';
    errorDiv.style.display = 'block';
    return;
  }

  try {
    let response;
    if (selectedAirportId) {
      // Update existing airport
      response = await fetch(`/api/admin/airports/${selectedAirportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(airportData)
      });
    } else {
      // Create new airport
      response = await fetch('/api/admin/airports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(airportData)
      });
    }

    const data = await response.json();

    if (response.ok) {
      closeAirportModal();
      loadAirports();
    } else {
      errorDiv.textContent = data.error || 'Failed to save airport';
      errorDiv.style.display = 'block';
    }
  } catch (error) {
    console.error('Error saving airport:', error);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  }
}

// Open delete airport modal
function openDeleteAirportModal(airportId, airportName) {
  deleteAirportId = airportId;
  document.getElementById('deleteAirportName').textContent = airportName;
  document.getElementById('deleteAirportModal').style.display = 'flex';
}

// Close delete airport modal
function closeDeleteAirportModal() {
  document.getElementById('deleteAirportModal').style.display = 'none';
  deleteAirportId = null;
}

// Confirm delete airport
async function confirmDeleteAirport() {
  if (!deleteAirportId) return;

  try {
    const response = await fetch(`/api/admin/airports/${deleteAirportId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      closeDeleteAirportModal();
      loadAirports();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to delete airport');
    }
  } catch (error) {
    console.error('Error deleting airport:', error);
    alert('Network error. Please try again.');
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadUsers();

  // Update world times regularly to keep them ticking
  setInterval(() => {
    if (document.getElementById('worldsSection').style.display !== 'none') {
      loadWorlds(); // Refresh the world list to update times
    }
  }, 10000); // Update every 10 seconds to keep clocks ticking
});
