let allAircraft = [];
let aircraftTypes = [];
let scheduledMaintenance = [];
let gameTimeAvailable = false; // Track if game time has been received from socket

// Check durations in minutes
// Daily: 30-90 mins (avg 60)
// Weekly: 1.5-3 hrs (avg 135 mins)
// A: 6-12 hours (avg 540 mins)
// C: 2-4 weeks (avg 21 days = 30240 mins)
// D: 2-3 months (avg 75 days = 108000 mins)
const CHECK_DURATIONS = {
  daily: 60,           // 1 hour (30-90 mins avg)
  weekly: 135,         // 2.25 hours (1.5-3 hrs avg)
  A: 540,              // 9 hours (6-12 hours avg)
  C: 30240,            // 21 days (2-4 weeks avg)
  D: 108000            // 75 days (2-3 months avg)
};

// Check validity periods
// Daily: 1-2 days
// Weekly: 7-8 days
// A: 800-1000 flight hours
// C: 2 years (730 days)
// D: 5-7 years (1825-2555 days)
const CHECK_VALIDITY = {
  daily: 2,            // days (can stretch to 2 if busy)
  weekly: 8,           // days (normally 7, can stretch to 8)
  A: 900,              // flight hours (800-1000)
  C: 730,              // days (2 years)
  D: 2190              // days (5-7 years, using 6 years as default)
};

// Generate deterministic random interval for A, C, and D checks based on aircraft ID
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

  if (checkType === 'A') {
    // 800-1000 flight hours
    const minHours = 800;
    const maxHours = 1000;
    return minHours + (hash % (maxHours - minHours + 1));
  } else if (checkType === 'C') {
    // 2 years = 730 days (fixed)
    return 730;
  } else if (checkType === 'D') {
    // 5-7 years = 1825-2555 days
    const minDays = 1825;
    const maxDays = 2555;
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

// Format date as YYYY-MM-DD (using UTC to match API)
function formatDateStr(date) {
  return date.toISOString().split('T')[0];
}

// Fetch scheduled maintenance data
async function fetchScheduledMaintenance() {
  try {
    // Get game time - use the global function if available
    const now = getGameTime();

    // Create date range: 90 days back (for long C/D checks) to 7 days forward
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 90);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 7);

    const startDateStr = formatDateStr(startDate);
    const endDateStr = formatDateStr(endDate);

    const response = await fetch(`/api/schedule/maintenance?startDate=${startDateStr}&endDate=${endDateStr}`);
    if (response.ok) {
      const data = await response.json();
      scheduledMaintenance = data.maintenance || [];
    }
  } catch (error) {
    console.error('Error fetching scheduled maintenance:', error);
    scheduledMaintenance = [];
  }
}

// Check if a specific check type is in progress for an aircraft
function isCheckInProgress(aircraftId, checkType) {
  const now = getGameTime();
  const todayStr = now.toISOString().split('T')[0];
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  // Check for direct match first (use == for type coercion)
  const directMatch = scheduledMaintenance.some(m => {
    const maintAircraftId = m.aircraftId || m.aircraft?.id;
    if (maintAircraftId != aircraftId) return false; // Use != for type-coercive comparison
    if (m.checkType !== checkType) return false;

    return isMaintenanceInProgress(m, todayStr, currentMinutes);
  });

  if (directMatch) return true;

  // Check for cascading - if a higher check is in progress, lower checks are covered
  // D covers: C, A, weekly, daily
  // C covers: A, weekly, daily
  // A covers: weekly, daily
  // weekly covers: daily
  const cascadeMap = {
    'C': ['D'],
    'A': ['D', 'C'],
    'weekly': ['D', 'C', 'A'],
    'daily': ['D', 'C', 'A', 'weekly']
  };

  const higherChecks = cascadeMap[checkType] || [];
  for (const higherCheck of higherChecks) {
    const higherInProgress = scheduledMaintenance.some(m => {
      const maintAircraftId = m.aircraftId || m.aircraft?.id;
      if (maintAircraftId != aircraftId) return false; // Use != for type-coercive comparison
      if (m.checkType !== higherCheck) return false;

      return isMaintenanceInProgress(m, todayStr, currentMinutes);
    });

    if (higherInProgress) return true;
  }

  return false;
}

// Helper to check if a specific maintenance record is in progress
function isMaintenanceInProgress(m, todayStr, currentMinutes) {
  // Skip "ongoing" display blocks - they're copies for multi-day display
  // Only check the primary block (where scheduledDate matches displayDate or isOngoing is false)
  if (m.isOngoing) return false;

  // Get scheduled date
  let scheduledDate = m.scheduledDate;
  if (scheduledDate instanceof Date) {
    scheduledDate = scheduledDate.toISOString().split('T')[0];
  } else if (scheduledDate) {
    scheduledDate = scheduledDate.split('T')[0];
  } else {
    return false;
  }

  // Parse start time
  const startTimeStr = m.startTime || '00:00:00';
  const [startH, startM] = startTimeStr.split(':').map(Number);
  const startMinutes = startH * 60 + startM;

  // Calculate end date/time
  const duration = m.duration || CHECK_DURATIONS[m.checkType] || 60;
  const endMinutes = startMinutes + duration;
  const daysSpanned = Math.floor(endMinutes / 1440);
  const endMinuteOfDay = endMinutes % 1440;

  // Calculate completion date (using UTC)
  const completionDate = new Date(scheduledDate + 'T00:00:00Z');
  completionDate.setUTCDate(completionDate.getUTCDate() + daysSpanned);
  const completionDateStr = completionDate.toISOString().split('T')[0];

  // Check if maintenance has started
  const hasStarted = todayStr > scheduledDate ||
    (todayStr === scheduledDate && currentMinutes >= startMinutes);

  // Check if maintenance has completed
  const hasCompleted = todayStr > completionDateStr ||
    (todayStr === completionDateStr && currentMinutes >= endMinuteOfDay);

  return hasStarted && !hasCompleted;
}

// Check if ANY heavy maintenance (C/D) is scheduled and not yet complete for this aircraft
// If so, all lower checks are covered by cascading
function hasScheduledMaintenance(aircraftId, checkType) {
  const now = getGameTime();
  const todayStr = now.toISOString().split('T')[0];
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  // Find all maintenance for this aircraft that is either in progress or scheduled for the future
  const aircraftMaint = scheduledMaintenance.filter(m => {
    const maintAircraftId = m.aircraftId || m.aircraft?.id;
    if (maintAircraftId != aircraftId) return false;

    // Check if this maintenance is still active (in progress or not yet started)
    return isMaintenanceActiveOrFuture(m, todayStr, currentMinutes);
  });

  if (aircraftMaint.length === 0) return false;

  // Check for direct match
  if (aircraftMaint.some(m => m.checkType === checkType)) return true;

  // Check for cascading from higher checks
  // D covers: C, A, weekly, daily
  // C covers: A, weekly, daily
  const hasD = aircraftMaint.some(m => m.checkType === 'D');
  const hasC = aircraftMaint.some(m => m.checkType === 'C');

  if (hasD) {
    // D check covers everything
    return true;
  }

  if (hasC && ['A', 'weekly', 'daily'].includes(checkType)) {
    // C check covers A, weekly, daily
    return true;
  }

  return false;
}

// Helper to check if maintenance is active (in progress) or scheduled for the future
function isMaintenanceActiveOrFuture(m, todayStr, currentMinutes) {
  // Skip "ongoing" display blocks - they're copies for multi-day display
  // Only check the primary block (where scheduledDate matches displayDate or isOngoing is false)
  if (m.isOngoing) return false;

  // Get scheduled date
  let scheduledDate = m.scheduledDate;
  if (scheduledDate instanceof Date) {
    scheduledDate = scheduledDate.toISOString().split('T')[0];
  } else if (scheduledDate) {
    scheduledDate = scheduledDate.split('T')[0];
  } else {
    return false;
  }

  // Parse start time
  const startTimeStr = m.startTime || '00:00:00';
  const [startH, startM] = startTimeStr.split(':').map(Number);
  const startMinutes = startH * 60 + startM;

  // Calculate end date/time
  const duration = m.duration || CHECK_DURATIONS[m.checkType] || 60;
  const endMinutes = startMinutes + duration;
  const daysSpanned = Math.floor(endMinutes / 1440);
  const endMinuteOfDay = endMinutes % 1440;

  // Calculate completion date (using UTC)
  const completionDate = new Date(scheduledDate + 'T00:00:00Z');
  completionDate.setUTCDate(completionDate.getUTCDate() + daysSpanned);
  const completionDateStr = completionDate.toISOString().split('T')[0];

  // Check if maintenance has completed
  const hasCompleted = todayStr > completionDateStr ||
    (todayStr === completionDateStr && currentMinutes >= endMinuteOfDay);

  // Return true if NOT completed (either in progress or scheduled for future)
  return !hasCompleted;
}

// Get the expected completion time for maintenance in progress
function getMaintenanceCompletionTime(aircraftId, checkType) {
  const now = getGameTime();
  const todayStr = now.toISOString().split('T')[0];
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  // Find the highest-level maintenance that's covering this check (only active ones)
  const checkHierarchy = ['D', 'C', 'A', 'weekly', 'daily'];
  let effectiveCheckType = checkType;

  for (const higherCheck of checkHierarchy) {
    const maint = scheduledMaintenance.find(m => {
      const maintAircraftId = m.aircraftId || m.aircraft?.id;
      if (maintAircraftId != aircraftId || m.checkType !== higherCheck) return false;
      // Only consider active maintenance
      return isMaintenanceActiveOrFuture(m, todayStr, currentMinutes);
    });
    if (maint) {
      effectiveCheckType = higherCheck;
      break;
    }
  }

  // Find the maintenance record (only active ones)
  const maint = scheduledMaintenance.find(m => {
    const maintAircraftId = m.aircraftId || m.aircraft?.id;
    if (maintAircraftId != aircraftId || m.checkType !== effectiveCheckType) return false;
    return isMaintenanceActiveOrFuture(m, todayStr, currentMinutes);
  });

  if (!maint) return null;

  // Get scheduled date and start time
  let scheduledDate = maint.scheduledDate;
  if (scheduledDate instanceof Date) {
    scheduledDate = scheduledDate.toISOString().split('T')[0];
  } else if (scheduledDate) {
    scheduledDate = scheduledDate.split('T')[0];
  } else {
    return null;
  }

  const startTimeStr = maint.startTime || '00:00:00';
  const [startH, startM] = startTimeStr.split(':').map(Number);
  const startMinutes = startH * 60 + startM;

  // Calculate completion time
  const duration = maint.duration || CHECK_DURATIONS[effectiveCheckType] || 60;
  const endMinutes = startMinutes + duration;
  const daysSpanned = Math.floor(endMinutes / 1440);
  const endMinuteOfDay = endMinutes % 1440;

  // Calculate completion date/time
  const completionDate = new Date(scheduledDate + 'T00:00:00Z');
  completionDate.setUTCDate(completionDate.getUTCDate() + daysSpanned);
  completionDate.setUTCHours(Math.floor(endMinuteOfDay / 60), endMinuteOfDay % 60, 0, 0);

  return formatDateTime(completionDate);
}

// Load maintenance data
async function loadMaintenanceData() {
  try {
    // Fetch both aircraft data and scheduled maintenance in parallel
    const [fleetResponse] = await Promise.all([
      fetch('/api/fleet/maintenance'),
      fetchScheduledMaintenance()
    ]);

    const data = await fleetResponse.json();

    if (!fleetResponse.ok) {
      throw new Error(data.error || 'Failed to fetch maintenance data');
    }

    allAircraft = data;

    // Extract unique aircraft types for filter
    const typeSet = new Set();
    data.forEach(ac => {
      if (ac.aircraft) {
        const typeName = `${ac.aircraft.manufacturer} ${ac.aircraft.model}${ac.aircraft.variant ? (ac.aircraft.variant.startsWith('-') ? ac.aircraft.variant : '-' + ac.aircraft.variant) : ''}`;
        typeSet.add(typeName);
      }
    });
    aircraftTypes = Array.from(typeSet).sort();
    populateTypeFilter();

    // If game time is already available, re-fetch scheduled maintenance with correct dates
    // so WIP detection uses game time instead of real time
    if (typeof window.getGlobalWorldTime === 'function' && window.getGlobalWorldTime()) {
      gameTimeAvailable = true;
      if (!hasRefetchedWithGameTime) {
        hasRefetchedWithGameTime = true;
        await fetchScheduledMaintenance();
      }
    }

    displayMaintenanceData(data);
    updateSummaryStats();
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
// checkType: 'daily', 'weekly', 'A', 'C', 'D'
function getCheckStatus(ac, checkType) {
  // First check if this check is currently in progress
  if (isCheckInProgress(ac.id, checkType)) {
    return {
      status: 'inprogress',
      text: 'WIP',
      expiryText: 'Check in progress',
      lastCheckTime: null
    };
  }

  // Also check if any heavy maintenance (C/D) is scheduled - treat as WIP
  // This handles cases where the check hasn't technically "started" yet but is scheduled
  if (hasScheduledMaintenance(ac.id, checkType)) {
    return {
      status: 'inprogress',
      text: 'WIP',
      expiryText: 'Maintenance scheduled',
      lastCheckTime: null
    };
  }

  let lastCheckDate;
  let intervalDays;
  let intervalHours; // For A check which is hours-based

  // Get the appropriate last check date and interval
  switch (checkType) {
    case 'daily':
      lastCheckDate = ac.lastDailyCheckDate;
      intervalDays = 2; // Valid for 1-2 calendar days
      break;
    case 'weekly':
      lastCheckDate = ac.lastWeeklyCheckDate;
      intervalDays = 8; // Valid for 7-8 days
      break;
    case 'A':
      lastCheckDate = ac.lastACheckDate;
      intervalHours = ac.aCheckIntervalHours || getCheckIntervalForAircraft(ac.id, 'A'); // 800-1000 flight hours
      break;
    case 'C':
      lastCheckDate = ac.lastCCheckDate;
      intervalDays = ac.cCheckIntervalDays || 730; // 2 years
      break;
    case 'D':
      lastCheckDate = ac.lastDCheckDate;
      intervalDays = ac.dCheckIntervalDays || getCheckIntervalForAircraft(ac.id, 'D'); // 5-7 years
      break;
    default:
      return { status: 'none', text: '--', expiryText: '', lastCheckTime: null };
  }

  if (!lastCheckDate) {
    // Never performed = expired (aircraft can't fly without current checks)
    return { status: 'expired', text: 'EXP', expiryText: 'Never performed', lastCheckTime: 'Never' };
  }

  const now = getGameTime();
  const lastCheck = new Date(lastCheckDate);

  // A check is hours-based, not date-based
  if (checkType === 'A') {
    const lastACheckHours = parseFloat(ac.lastACheckHours) || 0;
    const currentFlightHours = parseFloat(ac.totalFlightHours) || 0;
    const hoursSinceCheck = currentFlightHours - lastACheckHours;
    const hoursUntilDue = intervalHours - hoursSinceCheck;

    // Warning at 100 hours before due
    const warningThreshold = 100;

    if (hoursUntilDue < 0) {
      return {
        status: 'expired',
        text: 'EXP',
        expiryText: `Due at ${lastACheckHours + intervalHours} hrs`,
        lastCheckTime: `${lastACheckHours.toFixed(0)} hrs`,
        intervalHours: intervalHours,
        hoursRemaining: hoursUntilDue
      };
    } else if (hoursUntilDue < warningThreshold) {
      return {
        status: 'warning',
        text: 'DUE',
        expiryText: `${hoursUntilDue.toFixed(0)} hrs left`,
        lastCheckTime: `${lastACheckHours.toFixed(0)} hrs`,
        intervalHours: intervalHours,
        hoursRemaining: hoursUntilDue
      };
    } else {
      return {
        status: 'valid',
        text: 'Valid',
        expiryText: `${hoursUntilDue.toFixed(0)} hrs left`,
        lastCheckTime: `${lastACheckHours.toFixed(0)} hrs`,
        intervalHours: intervalHours,
        hoursRemaining: hoursUntilDue
      };
    }
  }

  // Date-based checks (daily, weekly, C, D)
  let expiryDate;

  if (checkType === 'daily') {
    // Daily check - valid for 2 calendar days until midnight UTC
    expiryDate = new Date(lastCheck);
    expiryDate.setUTCDate(expiryDate.getUTCDate() + 2);
    expiryDate.setUTCHours(23, 59, 59, 999);
  } else if (checkType === 'weekly') {
    // Weekly check - valid for 8 days until midnight UTC
    expiryDate = new Date(lastCheck);
    expiryDate.setUTCDate(expiryDate.getUTCDate() + 8);
    expiryDate.setUTCHours(23, 59, 59, 999);
  } else {
    // C/D checks - valid for intervalDays from check date
    expiryDate = new Date(lastCheck);
    expiryDate.setUTCDate(expiryDate.getUTCDate() + intervalDays);
    expiryDate.setUTCHours(23, 59, 59, 999);
  }

  const hoursUntilExpiry = (expiryDate - now) / (1000 * 60 * 60);

  // Warning threshold based on check type
  let warningHours = 24;
  if (checkType === 'weekly') warningHours = 24 * 2; // 2 days warning for weekly check
  if (checkType === 'C') warningHours = 24 * 30; // 30 days warning for C check
  if (checkType === 'D') warningHours = 24 * 60; // 60 days warning for D check

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
  return `${ac.aircraft.manufacturer} ${ac.aircraft.model}${ac.aircraft.variant ? (ac.aircraft.variant.startsWith('-') ? ac.aircraft.variant : '-' + ac.aircraft.variant) : ''}`;
}

// Get worst status for an aircraft (for filtering)
function getWorstStatus(ac) {
  const dailyCheck = getCheckStatus(ac, 'daily');
  const weeklyCheck = getCheckStatus(ac, 'weekly');
  const aCheck = getCheckStatus(ac, 'A');
  const cCheck = getCheckStatus(ac, 'C');
  const dCheck = getCheckStatus(ac, 'D');

  const checks = [dailyCheck, weeklyCheck, aCheck, cCheck, dCheck];

  // expired includes never-performed checks
  if (checks.some(c => c.status === 'expired')) return 'expired';
  if (checks.some(c => c.status === 'warning')) return 'warning';
  if (checks.some(c => c.status === 'inprogress')) return 'inprogress';
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

// Update summary stat boxes
function updateSummaryStats() {
  let overdueCount = 0;
  let allClearCount = 0;
  const hangarItems = []; // { reg, checks: ['Daily','A'] }
  const heavyItems = []; // { reg, check: 'C-Check', status: 'warning'|'expired', detail: '28 days' }

  allAircraft.forEach(ac => {
    const checks = ['daily', 'weekly', 'A', 'C', 'D'];
    let hasOverdue = false;
    let hasAnyIssue = false;
    const wipChecks = [];

    checks.forEach(type => {
      const s = getCheckStatus(ac, type);
      if (s.status === 'inprogress') {
        wipChecks.push(type === 'daily' ? 'Daily' : type === 'weekly' ? 'Weekly' : type + ' Check');
        hasAnyIssue = true;
      }
      if (s.status === 'expired') { hasOverdue = true; hasAnyIssue = true; }
      if (s.status === 'warning') { hasAnyIssue = true; }
    });

    // Collect hangar items
    if (wipChecks.length > 0) {
      hangarItems.push({ reg: ac.registration, checks: wipChecks });
    }

    // Heavy checks: C or D that are warning or expired
    const cStatus = getCheckStatus(ac, 'C');
    const dStatus = getCheckStatus(ac, 'D');
    if (['warning', 'expired'].includes(cStatus.status)) {
      heavyItems.push({
        reg: ac.registration,
        check: 'C-Check',
        status: cStatus.status,
        detail: cStatus.status === 'expired' ? 'overdue' : cStatus.expiryText || ''
      });
    }
    if (['warning', 'expired'].includes(dStatus.status)) {
      heavyItems.push({
        reg: ac.registration,
        check: 'D-Check',
        status: dStatus.status,
        detail: dStatus.status === 'expired' ? 'overdue' : dStatus.expiryText || ''
      });
    }

    if (hasOverdue) overdueCount++;
    if (!hasAnyIssue) allClearCount++;
  });

  // In the Hangar list
  document.getElementById('statInHangar').textContent = hangarItems.length;
  const hangarList = document.getElementById('hangarList');
  if (hangarItems.length === 0) {
    hangarList.innerHTML = '<li class="maint-list-empty">No aircraft in maintenance</li>';
  } else {
    hangarList.innerHTML = hangarItems.map(item =>
      `<li><span class="maint-list-reg">${item.reg}</span><span class="maint-list-check">${item.checks.join(', ')}</span></li>`
    ).join('');
  }

  // Upcoming Heavy Checks list
  document.getElementById('statHeavyChecks').textContent = heavyItems.length;
  const heavyList = document.getElementById('heavyChecksList');
  if (heavyItems.length === 0) {
    heavyList.innerHTML = '<li class="maint-list-empty">None due</li>';
  } else {
    heavyList.innerHTML = heavyItems.map(item => {
      const badge = item.status === 'expired'
        ? '<span style="color:#ef4444;font-weight:600;">OVERDUE</span>'
        : '<span style="color:#d97706;">due soon</span>';
      return `<li><span class="maint-list-reg">${item.reg}</span><span class="maint-list-check">${item.check} &middot; ${badge}</span></li>`;
    }).join('');
  }

  // Counters
  document.getElementById('statOverdue').textContent = overdueCount;
  document.getElementById('statOverdueSub').textContent = overdueCount === 1 ? 'aircraft' : 'aircraft';
  document.getElementById('statAllClear').textContent = allClearCount;
  document.getElementById('statAllClearSub').textContent = `of ${allAircraft.length}`;
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
        <span>Weekly</span>
        <span>A Check</span>
        <span>C Check</span>
        <span>D Check</span>
      </div>
    `;

    aircraftList.forEach(ac => {
      const dailyCheck = getCheckStatus(ac, 'daily');
      const weeklyCheck = getCheckStatus(ac, 'weekly');
      const aCheck = getCheckStatus(ac, 'A');
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
            <span class="check-status check-${weeklyCheck.status}"
                  onclick="showCheckDetails('${ac.id}', 'weekly')"
                  title="Click for details">
              ${weeklyCheck.text}
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
    'weekly': 'Weekly Check',
    'A': 'A Check',
    'C': 'C Check',
    'D': 'D Check'
  };

  const checkDescriptions = {
    'daily': 'Pre-flight inspection performed daily (valid 1-2 days)',
    'weekly': 'Weekly systems and components check (valid 7-8 days)',
    'A': 'Light maintenance check (every 800-1000 flight hours)',
    'C': 'Extensive structural inspection (every 2 years)',
    'D': 'Heavy maintenance overhaul (every 5-7 years)'
  };

  const durationTexts = {
    'daily': '30-90 minutes',
    'weekly': '1.5-3 hours',
    'A': '6-12 hours',
    'C': '2-4 weeks',
    'D': '2-3 months'
  };

  const checkName = checkNames[checkType] || `${checkType} Check`;
  const statusText = {
    'valid': 'Valid',
    'warning': 'Due Soon',
    'expired': 'Overdue',
    'inprogress': 'In Progress',
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

  // If in progress, show expected completion time
  if (checkStatus.status === 'inprogress') {
    const completionInfo = getMaintenanceCompletionTime(aircraftId, checkType);
    if (completionInfo) {
      content += `
        <div class="maint-modal-row">
          <span class="maint-modal-label">Completes</span>
          <span class="maint-modal-value">${completionInfo}</span>
        </div>
      `;
    }
  }

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

  // Show interval/validity info
  if (checkType === 'A') {
    // A check is hours-based
    const interval = checkStatus.intervalHours || ac.aCheckIntervalHours || getCheckIntervalForAircraft(ac.id, 'A');
    content += `
      <div class="maint-modal-row">
        <span class="maint-modal-label">Interval</span>
        <span class="maint-modal-value">${interval} flight hours</span>
      </div>
    `;
  } else if (['C', 'D'].includes(checkType)) {
    // C and D checks are days-based
    const intervalField = `${checkType.toLowerCase()}CheckIntervalDays`;
    const interval = ac[intervalField] || checkStatus.intervalDays;
    if (interval) {
      let intervalText;
      if (interval < 365) {
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
  } else if (checkType === 'weekly') {
    content += `
      <div class="maint-modal-row">
        <span class="maint-modal-label">Validity</span>
        <span class="maint-modal-value">7-8 days until midnight UTC</span>
      </div>
    `;
  } else if (checkType === 'daily') {
    content += `
      <div class="maint-modal-row">
        <span class="maint-modal-label">Validity</span>
        <span class="maint-modal-value">1-2 days until midnight UTC</span>
      </div>
    `;
  }

  // Add engineer name if check has been performed or is in progress
  if (checkStatus.status !== 'none') {
    const country = ac.homeBaseAirport?.country || ac.homeBase?.country || '';

    // If this check is WIP due to a higher check, use that check's engineer name
    let effectiveCheckType = checkType;
    if (checkStatus.status === 'inprogress') {
      // Find the highest level check that's actually being performed
      // Check hierarchy: D > C > A > weekly > daily
      const checkHierarchy = ['D', 'C', 'A', 'weekly', 'daily'];
      for (const higherCheck of checkHierarchy) {
        if (isCheckInProgress(aircraftId, higherCheck) || hasScheduledMaintenance(aircraftId, higherCheck)) {
          // This is the actual check being performed
          effectiveCheckType = higherCheck;
          break;
        }
      }
    }

    const engineer = getEngineerName(aircraftId, effectiveCheckType, country);
    const label = checkStatus.status === 'inprogress' ? 'Lead Engineer' : 'Signed Off By';
    content += `
      <div class="maint-modal-row">
        <span class="maint-modal-label">${label}</span>
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

  // Refresh All button
  const refreshAllBtn = document.getElementById('refreshAllBtn');
  if (refreshAllBtn) {
    refreshAllBtn.addEventListener('click', async () => {
      refreshAllBtn.disabled = true;
      refreshAllBtn.textContent = 'Refreshing...';

      try {
        const response = await fetch('/api/fleet/refresh-all-maintenance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();

        if (response.ok) {
          refreshAllBtn.textContent = `Done! (${data.success} updated)`;
          // Reload maintenance data to show new schedules
          await loadMaintenanceData();
          setTimeout(() => {
            refreshAllBtn.textContent = 'Refresh All Schedules';
            refreshAllBtn.disabled = false;
          }, 2000);
        } else {
          refreshAllBtn.textContent = 'Error';
          console.error('Refresh error:', data.error);
          setTimeout(() => {
            refreshAllBtn.textContent = 'Refresh All Schedules';
            refreshAllBtn.disabled = false;
          }, 2000);
        }
      } catch (err) {
        console.error('Refresh failed:', err);
        refreshAllBtn.textContent = 'Failed';
        setTimeout(() => {
          refreshAllBtn.textContent = 'Refresh All Schedules';
          refreshAllBtn.disabled = false;
        }, 2000);
      }
    });
  }

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMaintenanceModal();
    }
  });
});

// Re-render when game time becomes available or updates
let lastGameTimeUpdate = 0;
let hasRefetchedWithGameTime = false;
window.addEventListener('worldTimeUpdated', async () => {
  const now = Date.now();
  if (now - lastGameTimeUpdate > 5000 && allAircraft.length > 0) {
    lastGameTimeUpdate = now;

    // Re-fetch scheduled maintenance once when game time becomes available
    // This ensures we use the correct date range
    if (!hasRefetchedWithGameTime) {
      hasRefetchedWithGameTime = true;
      await fetchScheduledMaintenance();
      gameTimeAvailable = true; // Mark game time as available
    }

    updateSummaryStats();
    onFilterChange();
  }
});

// Periodically refresh data from server (every 30 seconds)
setInterval(() => {
  if (document.visibilityState === 'visible') {
    loadMaintenanceData();
  }
}, 30000);
