// Dashboard - loads stats and notifications from API

const NOTIFICATION_ICONS = {
  plane: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"></path></svg>',
  wrench: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>',
  dollar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
  chart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>',
  route: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="19" r="3"></circle><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"></path><circle cx="18" cy="5" r="3"></circle></svg>',
  alert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
};

const TYPE_COLORS = {
  maintenance: 'var(--warning-color)',
  'maintenance-progress': 'var(--accent-color)',
  finance: '#f59e0b',
  operations: 'var(--accent-color)',
  info: 'var(--text-secondary)',
  aircraft_sold: 'var(--success-color)',
  aircraft_leased_out: 'var(--accent-color)',
  lease_expired: 'var(--warning-color)'
};

function formatBalance(amount) {
  const num = parseFloat(amount) || 0;
  if (Math.abs(num) >= 1000000) {
    return '$' + (num / 1000000).toFixed(1) + 'M';
  } else if (Math.abs(num) >= 1000) {
    return '$' + (num / 1000).toFixed(0) + 'K';
  }
  return '$' + num.toLocaleString();
}

async function loadDashboardStats() {
  try {
    const [worldRes, fleetRes, routesRes] = await Promise.all([
      fetch('/api/world/info'),
      fetch('/api/fleet'),
      fetch('/api/routes')
    ]);

    if (worldRes.ok) {
      const world = await worldRes.json();
      const balanceEl = document.getElementById('statBalance');
      const repEl = document.getElementById('statReputation');
      if (balanceEl) {
        balanceEl.textContent = formatBalance(world.balance);
        const bal = parseFloat(world.balance) || 0;
        if (bal < 0) balanceEl.style.color = '#f85149';
        else if (bal < 50000) balanceEl.style.color = 'var(--warning-color)';
      }
      if (repEl) {
        repEl.textContent = (world.reputation || 0) + '/100';
      }
    }

    if (fleetRes.ok) {
      const fleet = await fleetRes.json();
      const fleetEl = document.getElementById('statFleet');
      if (fleetEl) {
        const count = Array.isArray(fleet) ? fleet.length : 0;
        fleetEl.textContent = count + ' A/C';
      }
    }

    if (routesRes.ok) {
      const routes = await routesRes.json();
      const routesEl = document.getElementById('statRoutes');
      if (routesEl) {
        const count = Array.isArray(routes) ? routes.length : 0;
        routesEl.textContent = count + ' Active';
      }
    }
  } catch (error) {
    console.error('Error loading dashboard stats:', error);
  }
}

async function loadPerformanceStats() {
  try {
    const [financesRes, summaryRes] = await Promise.all([
      fetch('/api/finances'),
      fetch('/api/routes/summary')
    ]);

    // Weekly profit from finances
    if (financesRes.ok) {
      const data = await financesRes.json();
      const weeks = data.weeks || [];
      const weeklyEl = document.getElementById('statWeeklyProfit');
      const lastWeekEl = document.getElementById('statLastWeekProfit');

      if (weeks.length > 0 && weeklyEl) {
        const thisWeek = weeks[0];
        const profit = (thisWeek.netProfit !== undefined) ? thisWeek.netProfit : (thisWeek.revenues?.total || 0) + (thisWeek.expenses?.total || 0);
        weeklyEl.textContent = formatBalance(profit);
        if (profit < 0) weeklyEl.style.color = '#f85149';
        else if (profit > 0) weeklyEl.style.color = 'var(--success-color)';
      }

      if (weeks.length > 1 && lastWeekEl) {
        const lastWeek = weeks[1];
        const profit = (lastWeek.netProfit !== undefined) ? lastWeek.netProfit : (lastWeek.revenues?.total || 0) + (lastWeek.expenses?.total || 0);
        lastWeekEl.textContent = formatBalance(profit);
        if (profit < 0) lastWeekEl.style.color = '#f85149';
        else if (profit > 0) lastWeekEl.style.color = 'var(--success-color)';
      }
    }

    // Best/worst routes
    if (summaryRes.ok) {
      const summary = await summaryRes.json();
      const bestEl = document.getElementById('statBestRoute');
      const worstEl = document.getElementById('statWorstRoute');

      if (bestEl) {
        if (summary.bestRoutes && summary.bestRoutes.length > 0) {
          const best = summary.bestRoutes[0];
          const dep = best.departureAirport?.iataCode || best.departureAirport?.icaoCode || '???';
          const arr = best.arrivalAirport?.iataCode || best.arrivalAirport?.icaoCode || '???';
          bestEl.textContent = `${dep}-${arr}`;
          bestEl.title = `Profit: ${formatBalance(best.profit)}`;
          if (best.profit > 0) bestEl.style.color = 'var(--success-color)';
        } else {
          bestEl.textContent = 'No data';
          bestEl.style.color = 'var(--text-muted)';
        }
      }

      if (worstEl) {
        if (summary.worstRoutes && summary.worstRoutes.length > 0) {
          const worst = summary.worstRoutes[0];
          const dep = worst.departureAirport?.iataCode || worst.departureAirport?.icaoCode || '???';
          const arr = worst.arrivalAirport?.iataCode || worst.arrivalAirport?.icaoCode || '???';
          worstEl.textContent = `${dep}-${arr}`;
          worstEl.title = `Profit: ${formatBalance(worst.profit)}`;
          if (worst.profit < 0) worstEl.style.color = '#f85149';
        } else {
          worstEl.textContent = 'No data';
          worstEl.style.color = 'var(--text-muted)';
        }
      }
    }
  } catch (error) {
    console.error('Error loading performance stats:', error);
  }
}

async function loadNotifications() {
  const body = document.getElementById('notificationsBody');
  const countEl = document.getElementById('notificationCount');
  if (!body) return;

  try {
    const res = await fetch('/api/dashboard/notifications');
    if (!res.ok) throw new Error('Failed to load');

    const notifications = await res.json();

    if (notifications.length === 0) {
      body.innerHTML = '<div class="panel-empty">No notifications. Your airline is running smoothly!</div>';
      if (countEl) countEl.style.display = 'none';
      return;
    }

    if (countEl) {
      countEl.textContent = notifications.length;
      countEl.style.display = 'inline-flex';
    }

    body.innerHTML = notifications.map(n => {
      const icon = NOTIFICATION_ICONS[n.icon] || NOTIFICATION_ICONS.alert;
      const color = TYPE_COLORS[n.type] || TYPE_COLORS.info;
      const linkAttr = n.link ? ` onclick="window.location.href='${n.link}'" style="cursor: pointer;"` : '';
      const dismissBtn = n.persistent && n.id
        ? `<button class="notification-dismiss" onclick="event.stopPropagation(); dismissNotification('${n.id}', this)" title="Dismiss">&times;</button>`
        : '';

      return `
        <div class="notification-item"${linkAttr}>
          <div class="notification-icon" style="color: ${color};">${icon}</div>
          <div class="notification-content">
            <div class="notification-title">${n.title}</div>
            <div class="notification-message">${n.message}</div>
          </div>
          ${dismissBtn}
          ${!dismissBtn && n.link ? '<svg class="notification-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>' : ''}
        </div>`;
    }).join('');
  } catch (error) {
    console.error('Error loading notifications:', error);
    body.innerHTML = '<div class="panel-empty">Unable to load notifications.</div>';
  }
}

async function dismissNotification(id, btnEl) {
  try {
    await fetch(`/api/dashboard/notifications/${id}/read`, { method: 'POST' });
    const item = btnEl.closest('.notification-item');
    if (item) {
      item.style.transition = 'opacity 0.3s ease';
      item.style.opacity = '0';
      setTimeout(() => { item.remove(); loadNotifications(); }, 300);
    }
  } catch (error) {
    console.error('Error dismissing notification:', error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadDashboardStats();
  loadPerformanceStats();
  loadNotifications();

  // Measure and set navbar height for fixed sidebar positioning
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    const setNavbarHeight = () => {
      const height = navbar.offsetHeight;
      document.documentElement.style.setProperty('--navbar-height', `${height}px`);
    };
    setNavbarHeight();
    window.addEventListener('resize', setNavbarHeight);
  }
});
