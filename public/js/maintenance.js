let allAircraft = [];
let aircraftTypes = [];

// Check durations in minutes
const CHECK_DURATIONS = {
  daily: 60,           // 1 hour
  A: 180,              // 3 hours
  B: 360,              // 6 hours
  C: 20160,            // 14 days (14 * 24 * 60)
  D: 86400             // 60 days (60 * 24 * 60)
};

// Generate deterministic random interval for C and D checks based on aircraft ID
// C check: 18-24 months (548-730 days)
// D check: 6-10 years (2190-3650 days)
function getCheckIntervalForAircraft(aircraftId, checkType) {
  // Create a hash from aircraft ID to get consistent "random" value
  let hash = 0;
  const str = aircraftId + checkType;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  hash = Math.abs(hash);

  if (checkType === 'C') {
    // 18-24 months = 548-730 days
    const minDays = 548;
    const maxDays = 730;
    return minDays + (hash % (maxDays - minDays + 1));
  } else if (checkType === 'D') {
    // 6-10 years = 2190-3650 days
    const minDays = 2190;
    const maxDays = 3650;
    return minDays + (hash % (maxDays - minDays + 1));
  }

  return null;
}

// Engineer names by culture/region
const ENGINEER_NAMES = {
  british: [
    'James Thompson', 'William Harris', 'Oliver Wright', 'George Mitchell', 'Harry Clarke',
    'Thomas Evans', 'Jack Robinson', 'Daniel Hughes', 'Matthew Lewis', 'Samuel Walker',
    'Emma Richards', 'Sophie Turner', 'Charlotte Green', 'Amelia Hall', 'Jessica Wood'
  ],
  american: [
    'Michael Johnson', 'David Williams', 'Robert Brown', 'John Davis', 'Christopher Miller',
    'Daniel Wilson', 'Andrew Moore', 'Joseph Taylor', 'Ryan Anderson', 'Brandon Thomas',
    'Jennifer Martinez', 'Sarah Jackson', 'Ashley White', 'Amanda Garcia', 'Stephanie Lee'
  ],
  german: [
    'Hans Müller', 'Klaus Schmidt', 'Wolfgang Fischer', 'Stefan Weber', 'Thomas Wagner',
    'Michael Becker', 'Andreas Hoffmann', 'Markus Schulz', 'Jürgen Koch', 'Peter Richter',
    'Anna Meyer', 'Sabine Braun', 'Claudia Krause', 'Monika Lange', 'Petra Schwarz'
  ],
  french: [
    'Jean-Pierre Dubois', 'François Martin', 'Michel Bernard', 'Philippe Moreau', 'Laurent Petit',
    'Pierre Durand', 'Jacques Leroy', 'Christophe Roux', 'Nicolas Simon', 'Olivier Laurent',
    'Marie Lefebvre', 'Sophie Girard', 'Isabelle Bonnet', 'Catherine Mercier', 'Nathalie Dupont'
  ],
  spanish: [
    'Carlos García', 'Miguel Rodríguez', 'José Martínez', 'Antonio López', 'Francisco Hernández',
    'Juan González', 'Pedro Sánchez', 'Manuel Romero', 'Luis Torres', 'Javier Ramírez',
    'María Fernández', 'Carmen Ruiz', 'Ana Díaz', 'Laura Moreno', 'Patricia Muñoz'
  ],
  italian: [
    'Marco Rossi', 'Giuseppe Russo', 'Antonio Conti', 'Giovanni Esposito', 'Francesco Romano',
    'Alessandro Ricci', 'Andrea Colombo', 'Luca Ferrari', 'Matteo Greco', 'Davide Bruno',
    'Francesca Marino', 'Chiara Gallo', 'Valentina Costa', 'Sara Fontana', 'Giulia De Luca'
  ],
  dutch: [
    'Jan de Vries', 'Pieter van Dijk', 'Willem Bakker', 'Kees Visser', 'Hans Smit',
    'Jeroen de Boer', 'Maarten Mulder', 'Bas Bos', 'Thijs de Groot', 'Ruben Jansen',
    'Anna van den Berg', 'Sophie Hendriks', 'Emma Dekker', 'Lisa Vermeer', 'Fleur Peters'
  ],
  scandinavian: [
    'Erik Lindqvist', 'Lars Johansson', 'Anders Nilsson', 'Magnus Eriksson', 'Johan Larsson',
    'Henrik Olsen', 'Bjørn Hansen', 'Mikael Andersen', 'Fredrik Petersen', 'Kristian Berg',
    'Ingrid Svensson', 'Astrid Karlsson', 'Sigrid Pedersen', 'Freya Nielsen', 'Liv Dahl'
  ],
  polish: [
    'Piotr Kowalski', 'Tomasz Nowak', 'Krzysztof Wiśniewski', 'Andrzej Wójcik', 'Marcin Kowalczyk',
    'Paweł Kamiński', 'Michał Lewandowski', 'Jakub Zieliński', 'Adam Szymański', 'Łukasz Woźniak',
    'Anna Dąbrowska', 'Magdalena Kozłowska', 'Katarzyna Jankowska', 'Agnieszka Mazur', 'Monika Krawczyk'
  ],
  russian: [
    'Alexei Petrov', 'Dmitri Ivanov', 'Sergei Kuznetsov', 'Mikhail Sokolov', 'Andrei Popov',
    'Viktor Volkov', 'Nikolai Fedorov', 'Ivan Morozov', 'Pavel Novikov', 'Yuri Kozlov',
    'Olga Smirnova', 'Natalia Lebedeva', 'Elena Orlova', 'Anna Pavlova', 'Maria Volkova'
  ],
  japanese: [
    'Takeshi Yamamoto', 'Hiroshi Tanaka', 'Kenji Watanabe', 'Masashi Suzuki', 'Yuki Sato',
    'Kazuki Kobayashi', 'Ryo Nakamura', 'Shota Ito', 'Daiki Yamada', 'Kenta Matsumoto',
    'Yuki Takahashi', 'Sakura Yoshida', 'Haruka Inoue', 'Aoi Kimura', 'Miku Hayashi'
  ],
  chinese: [
    'Wei Zhang', 'Ming Li', 'Jian Wang', 'Lei Chen', 'Feng Liu',
    'Hao Yang', 'Jun Huang', 'Tao Wu', 'Qiang Zhou', 'Bo Xu',
    'Mei Lin', 'Xiu Zhao', 'Yan Sun', 'Hui Ma', 'Na Zhu'
  ],
  indian: [
    'Rajesh Sharma', 'Anil Patel', 'Vikram Singh', 'Suresh Kumar', 'Rahul Gupta',
    'Amit Verma', 'Sanjay Mehta', 'Pradeep Joshi', 'Manoj Reddy', 'Deepak Nair',
    'Priya Iyer', 'Sunita Rao', 'Anjali Desai', 'Kavita Pillai', 'Neha Kapoor'
  ],
  middle_eastern: [
    'Ahmed Al-Hassan', 'Mohammed Al-Rashid', 'Khalid Al-Farsi', 'Omar Al-Qasim', 'Yusuf Al-Mahmoud',
    'Hassan Al-Nasser', 'Ali Al-Saeed', 'Ibrahim Al-Zahrani', 'Tariq Al-Khalil', 'Fahad Al-Dosari',
    'Fatima Al-Ali', 'Aisha Al-Rashidi', 'Mariam Al-Suwaidi', 'Noura Al-Khaled', 'Layla Al-Ahmed'
  ],
  brazilian: [
    'João Silva', 'Pedro Santos', 'Lucas Oliveira', 'Mateus Souza', 'Gabriel Costa',
    'Rafael Pereira', 'Bruno Almeida', 'Thiago Ribeiro', 'Felipe Carvalho', 'Gustavo Lima',
    'Ana Ferreira', 'Juliana Rodrigues', 'Mariana Martins', 'Camila Gomes', 'Fernanda Barbosa'
  ],
  australian: [
    'Jack Mitchell', 'Liam O\'Brien', 'Noah Campbell', 'Ethan Stewart', 'Mason Kelly',
    'Cooper Ross', 'Ryan Murray', 'Jake Morgan', 'Ben Taylor', 'Tom Wilson',
    'Chloe Thompson', 'Emily Brown', 'Mia Davis', 'Olivia Martin', 'Ava Robinson'
  ]
};

// Map countries to cultures
const COUNTRY_CULTURE_MAP = {
  'United Kingdom': 'british', 'UK': 'british', 'England': 'british', 'Scotland': 'british', 'Wales': 'british',
  'United States': 'american', 'USA': 'american', 'Canada': 'american',
  'Germany': 'german', 'Austria': 'german', 'Switzerland': 'german',
  'France': 'french', 'Belgium': 'french', 'Luxembourg': 'french',
  'Spain': 'spanish', 'Mexico': 'spanish', 'Argentina': 'spanish', 'Chile': 'spanish', 'Colombia': 'spanish',
  'Italy': 'italian',
  'Netherlands': 'dutch',
  'Sweden': 'scandinavian', 'Norway': 'scandinavian', 'Denmark': 'scandinavian', 'Finland': 'scandinavian', 'Iceland': 'scandinavian',
  'Poland': 'polish', 'Czech Republic': 'polish', 'Slovakia': 'polish',
  'Russia': 'russian', 'Ukraine': 'russian', 'Belarus': 'russian',
  'Japan': 'japanese',
  'China': 'chinese', 'Taiwan': 'chinese', 'Hong Kong': 'chinese', 'Singapore': 'chinese',
  'India': 'indian', 'Pakistan': 'indian', 'Bangladesh': 'indian', 'Sri Lanka': 'indian',
  'UAE': 'middle_eastern', 'Saudi Arabia': 'middle_eastern', 'Qatar': 'middle_eastern', 'Kuwait': 'middle_eastern', 'Bahrain': 'middle_eastern', 'Oman': 'middle_eastern',
  'Brazil': 'brazilian', 'Portugal': 'brazilian',
  'Australia': 'australian', 'New Zealand': 'australian'
};

// Get a deterministic "random" engineer name based on aircraft ID and check type
function getEngineerName(aircraftId, checkType, country) {
  // Create a simple hash from the aircraft ID and check type
  const str = aircraftId + checkType;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  hash = Math.abs(hash);

  // Get culture from country, or use hash to pick a random culture
  let culture = COUNTRY_CULTURE_MAP[country];
  if (!culture) {
    // If no country match, use hash to pick a culture for variety
    const cultures = Object.keys(ENGINEER_NAMES);
    culture = cultures[hash % cultures.length];
  }

  const names = ENGINEER_NAMES[culture];
  return names[hash % names.length];
}

// Load maintenance data
async function loadMaintenanceData() {
  try {
    const response = await fetch('/api/fleet/maintenance');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch maintenance data');
    }

    allAircraft = data;

    // Extract unique aircraft types for filter
    const typeSet = new Set();
    data.forEach(ac => {
      if (ac.aircraft) {
        const typeName = `${ac.aircraft.manufacturer} ${ac.aircraft.model}${ac.aircraft.variant ? '-' + ac.aircraft.variant : ''}`;
        typeSet.add(typeName);
      }
    });
    aircraftTypes = Array.from(typeSet).sort();
    populateTypeFilter();

    displayMaintenanceData(data);
  } catch (error) {
    console.error('Error loading maintenance data:', error);
    document.getElementById('maintenanceGrid').innerHTML = `
      <div class="table-empty">
        <div class="empty-message">ERROR LOADING MAINTENANCE DATA</div>
      </div>
    `;
  }
}

// Populate type filter dropdown
function populateTypeFilter() {
  const select = document.getElementById('typeFilter');
  select.innerHTML = '<option value="">All Types</option>';
  aircraftTypes.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    select.appendChild(option);
  });
}

// Get current game time (falls back to real time if not available)
function getGameTime() {
  if (typeof window.getGlobalWorldTime === 'function') {
    const gameTime = window.getGlobalWorldTime();
    if (gameTime) return gameTime;
  }
  return new Date();
}

// Calculate check status for an aircraft
// checkType: 'daily', 'A', 'B', 'C', 'D'
function getCheckStatus(ac, checkType) {
  let lastCheckDate;
  let intervalDays;

  // Get the appropriate last check date and interval
  switch (checkType) {
    case 'daily':
      lastCheckDate = ac.lastDailyCheckDate;
      intervalDays = 2; // Valid for 2 calendar days
      break;
    case 'A':
      lastCheckDate = ac.lastACheckDate;
      intervalDays = ac.aCheckIntervalDays || 42; // Default 42 days if not set
      break;
    case 'B':
      lastCheckDate = ac.lastBCheckDate;
      intervalDays = ac.bCheckIntervalDays || 210; // Default ~7 months if not set
      break;
    case 'C':
      lastCheckDate = ac.lastCCheckDate;
      intervalDays = ac.cCheckIntervalDays || getCheckIntervalForAircraft(ac.id, 'C'); // 18-24 months random
      break;
    case 'D':
      lastCheckDate = ac.lastDCheckDate;
      intervalDays = ac.dCheckIntervalDays || getCheckIntervalForAircraft(ac.id, 'D'); // 6-10 years random
      break;
    default:
      return { status: 'none', text: '--', expiryText: '', lastCheckTime: null };
  }

  if (!lastCheckDate) {
    return { status: 'none', text: '--', expiryText: '', lastCheckTime: null };
  }

  const now = getGameTime();
  const lastCheck = new Date(lastCheckDate);
  let expiryDate;

  if (checkType === 'daily') {
    // Daily check - valid for 2 calendar days until midnight UTC
    expiryDate = new Date(lastCheck);
    expiryDate.setUTCDate(expiryDate.getUTCDate() + 2);
    expiryDate.setUTCHours(23, 59, 59, 999);
  } else {
    // Other checks - valid for intervalDays from check date
    expiryDate = new Date(lastCheck);
    expiryDate.setUTCDate(expiryDate.getUTCDate() + intervalDays);
    expiryDate.setUTCHours(23, 59, 59, 999);
  }

  const hoursUntilExpiry = (expiryDate - now) / (1000 * 60 * 60);

  // Warning threshold based on check type
  let warningHours = 24;
  if (checkType === 'C') warningHours = 24 * 7; // 7 days warning for C check
  if (checkType === 'D') warningHours = 24 * 14; // 14 days warning for D check

  if (hoursUntilExpiry < 0) {
    return {
      status: 'expired',
      text: 'EXP',
      expiryText: formatDateTime(expiryDate),
      lastCheckTime: formatDateTime(lastCheck),
      intervalDays: intervalDays
    };
  } else if (hoursUntilExpiry < warningHours) {
    return {
      status: 'warning',
      text: 'DUE',
      expiryText: formatDateTime(expiryDate),
      lastCheckTime: formatDateTime(lastCheck),
      intervalDays: intervalDays
    };
  } else {
    return {
      status: 'valid',
      text: 'Valid',
      expiryText: formatDateTime(expiryDate),
      lastCheckTime: formatDateTime(lastCheck),
      intervalDays: intervalDays
    };
  }
}

// Format date and time for display (UTC)
function formatDateTime(date) {
  const d = new Date(date);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${hours}:${minutes}z`;
}

// Get short expiry text for column display
function getExpiryShort(checkStatus) {
  if (checkStatus.status === 'none') return '--';
  if (checkStatus.status === 'expired') return 'Expired';
  if (!checkStatus.expiryText) return '--';

  // Show just date and time for valid/warning
  const d = new Date(checkStatus.expiryText.replace('z', ' UTC'));
  if (isNaN(d.getTime())) return checkStatus.expiryText;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${hours}:${minutes}z`;
}

// Get aircraft type name
function getTypeName(ac) {
  if (!ac.aircraft) return 'Unknown';
  return `${ac.aircraft.manufacturer} ${ac.aircraft.model}${ac.aircraft.variant ? '-' + ac.aircraft.variant : ''}`;
}

// Get worst status for an aircraft (for filtering)
function getWorstStatus(ac) {
  const dailyCheck = getCheckStatus(ac, 'daily');
  const aCheck = getCheckStatus(ac, 'A');
  const bCheck = getCheckStatus(ac, 'B');
  const cCheck = getCheckStatus(ac, 'C');
  const dCheck = getCheckStatus(ac, 'D');

  const checks = [dailyCheck, aCheck, bCheck, cCheck, dCheck];

  if (checks.some(c => c.status === 'expired')) return 'expired';
  if (checks.some(c => c.status === 'warning')) return 'warning';
  if (checks.some(c => c.status === 'none')) return 'none';
  return 'valid';
}

// Filter aircraft based on current filters
function getFilteredAircraft() {
  const searchTerm = document.getElementById('searchFilter').value.toLowerCase();
  const typeFilter = document.getElementById('typeFilter').value;
  const statusFilter = document.getElementById('statusFilter').value;

  return allAircraft.filter(ac => {
    // Search filter
    if (searchTerm && !ac.registration.toLowerCase().includes(searchTerm)) {
      return false;
    }

    // Type filter
    if (typeFilter && getTypeName(ac) !== typeFilter) {
      return false;
    }

    // Status filter
    if (statusFilter) {
      const worstStatus = getWorstStatus(ac);
      if (statusFilter !== worstStatus) {
        return false;
      }
    }

    return true;
  });
}

// Group aircraft by type
function groupAircraftByType(aircraft) {
  const groups = {};
  aircraft.forEach(ac => {
    const typeName = getTypeName(ac);
    if (!groups[typeName]) {
      groups[typeName] = [];
    }
    groups[typeName].push(ac);
  });
  return Object.keys(groups).sort().reduce((sorted, key) => {
    sorted[key] = groups[key];
    return sorted;
  }, {});
}

// Display maintenance data
function displayMaintenanceData(aircraft) {
  const filtered = aircraft || getFilteredAircraft();
  const container = document.getElementById('maintenanceGrid');

  // Update count
  document.getElementById('aircraftCount').textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="table-empty">
        <div class="empty-message">${allAircraft.length === 0 ? 'NO AIRCRAFT IN FLEET' : 'NO MATCHING AIRCRAFT'}</div>
      </div>
    `;
    return;
  }

  const grouped = groupAircraftByType(filtered);
  let html = '';

  for (const [typeName, aircraftList] of Object.entries(grouped)) {
    html += `
      <div class="aircraft-type-header">
        <h3>${typeName} <span>(${aircraftList.length})</span></h3>
      </div>
      <div class="maintenance-header">
        <span>Reg</span>
        <span>Daily</span>
        <span>A Check</span>
        <span>B Check</span>
        <span>C Check</span>
        <span>D Check</span>
      </div>
    `;

    aircraftList.forEach(ac => {
      const dailyCheck = getCheckStatus(ac, 'daily');
      const aCheck = getCheckStatus(ac, 'A');
      const bCheck = getCheckStatus(ac, 'B');
      const cCheck = getCheckStatus(ac, 'C');
      const dCheck = getCheckStatus(ac, 'D');

      html += `
        <div class="maintenance-row">
          <span class="maintenance-reg">${ac.registration}</span>
          <div class="maintenance-check-cell">
            <span class="check-status check-${dailyCheck.status}"
                  onclick="showCheckDetails('${ac.id}', 'daily')"
                  title="Click for details">
              ${dailyCheck.text}
            </span>
          </div>
          <div class="maintenance-check-cell">
            <span class="check-status check-${aCheck.status}"
                  onclick="showCheckDetails('${ac.id}', 'A')"
                  title="Click for details">
              ${aCheck.text}
            </span>
          </div>
          <div class="maintenance-check-cell">
            <span class="check-status check-${bCheck.status}"
                  onclick="showCheckDetails('${ac.id}', 'B')"
                  title="Click for details">
              ${bCheck.text}
            </span>
          </div>
          <div class="maintenance-check-cell">
            <span class="check-status check-${cCheck.status}"
                  onclick="showCheckDetails('${ac.id}', 'C')"
                  title="Click for details">
              ${cCheck.text}
            </span>
          </div>
          <div class="maintenance-check-cell">
            <span class="check-status check-${dCheck.status}"
                  onclick="showCheckDetails('${ac.id}', 'D')"
                  title="Click for details">
              ${dCheck.text}
            </span>
          </div>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

// Show check details in modal
function showCheckDetails(aircraftId, checkType) {
  const ac = allAircraft.find(a => a.id === aircraftId);
  if (!ac) return;

  const checkStatus = getCheckStatus(ac, checkType);

  const checkNames = {
    'daily': 'Daily Check',
    'A': 'A Check',
    'B': 'B Check',
    'C': 'C Check',
    'D': 'D Check'
  };

  const checkDescriptions = {
    'daily': 'Pre-flight inspection performed daily',
    'A': 'Light maintenance check',
    'B': 'Detailed inspection of components',
    'C': 'Extensive structural inspection',
    'D': 'Heavy maintenance overhaul'
  };

  const durationTexts = {
    'daily': '1 hour',
    'A': '3 hours',
    'B': '6 hours',
    'C': '14 days',
    'D': '60 days'
  };

  const checkName = checkNames[checkType] || `${checkType} Check`;
  const statusText = {
    'valid': 'Valid',
    'warning': 'Due Soon',
    'expired': 'Overdue',
    'none': 'Never Performed'
  }[checkStatus.status] || checkStatus.status;

  document.getElementById('modalTitle').textContent = `${ac.registration} - ${checkName}`;

  let content = `
    <div class="maint-modal-row">
      <span class="maint-modal-label">Status</span>
      <span class="maint-modal-value check-${checkStatus.status}" style="padding: 0.2rem 0.5rem; border-radius: 3px;">${statusText}</span>
    </div>
    <div class="maint-modal-row">
      <span class="maint-modal-label">Description</span>
      <span class="maint-modal-value">${checkDescriptions[checkType]}</span>
    </div>
    <div class="maint-modal-row">
      <span class="maint-modal-label">Duration</span>
      <span class="maint-modal-value">${durationTexts[checkType]}</span>
    </div>
  `;

  if (checkStatus.lastCheckTime) {
    content += `
      <div class="maint-modal-row">
        <span class="maint-modal-label">Last Performed</span>
        <span class="maint-modal-value">${checkStatus.lastCheckTime}</span>
      </div>
    `;
  }

  if (checkStatus.expiryText && checkStatus.status !== 'none') {
    content += `
      <div class="maint-modal-row">
        <span class="maint-modal-label">${checkStatus.status === 'expired' ? 'Expired On' : 'Expires'}</span>
        <span class="maint-modal-value">${checkStatus.expiryText}</span>
      </div>
    `;
  }

  // Show interval for A/B/C/D checks
  if (['A', 'B', 'C', 'D'].includes(checkType)) {
    const intervalField = `${checkType.toLowerCase()}CheckIntervalDays`;
    const interval = ac[intervalField] || checkStatus.intervalDays;
    if (interval) {
      let intervalText;
      if (interval < 60) {
        intervalText = `${interval} days`;
      } else if (interval < 365) {
        intervalText = `${Math.round(interval / 30)} months (~${interval} days)`;
      } else {
        intervalText = `${Math.round(interval / 365)} years (~${interval} days)`;
      }
      content += `
        <div class="maint-modal-row">
          <span class="maint-modal-label">Interval</span>
          <span class="maint-modal-value">${intervalText}</span>
        </div>
      `;
    }
  } else if (checkType === 'daily') {
    content += `
      <div class="maint-modal-row">
        <span class="maint-modal-label">Validity</span>
        <span class="maint-modal-value">2 calendar days until midnight UTC</span>
      </div>
    `;
  }

  // Add engineer name if check has been performed
  if (checkStatus.status !== 'none') {
    const country = ac.homeBaseAirport?.country || ac.homeBase?.country || '';
    const engineer = getEngineerName(aircraftId, checkType, country);
    content += `
      <div class="maint-modal-row">
        <span class="maint-modal-label">Signed Off By</span>
        <span class="maint-modal-value">${engineer}</span>
      </div>
    `;
  }

  document.getElementById('modalContent').innerHTML = content;
  document.getElementById('maintModalOverlay').style.display = 'flex';
}

// Close modal
function closeMaintenanceModal(event) {
  if (!event || event.target.id === 'maintModalOverlay') {
    document.getElementById('maintModalOverlay').style.display = 'none';
  }
}

// Handle filter changes
function onFilterChange() {
  const filtered = getFilteredAircraft();
  displayMaintenanceData(filtered);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadMaintenanceData();

  // Set up filter event listeners
  document.getElementById('searchFilter').addEventListener('input', onFilterChange);
  document.getElementById('typeFilter').addEventListener('change', onFilterChange);
  document.getElementById('statusFilter').addEventListener('change', onFilterChange);

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMaintenanceModal();
    }
  });
});

// Re-render when game time becomes available or updates
let lastGameTimeUpdate = 0;
window.addEventListener('worldTimeUpdated', () => {
  const now = Date.now();
  if (now - lastGameTimeUpdate > 5000 && allAircraft.length > 0) {
    lastGameTimeUpdate = now;
    onFilterChange();
  }
});

// Periodically refresh data from server (every 30 seconds)
setInterval(() => {
  if (document.visibilityState === 'visible') {
    loadMaintenanceData();
  }
}, 30000);
