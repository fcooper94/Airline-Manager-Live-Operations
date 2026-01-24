let selectedUserId = null;
let selectedUserData = null;

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

// Load all users
async function loadUsers() {
  try {
    const response = await fetch('/api/admin/users');
    const users = await response.json();

    const tbody = document.getElementById('usersTableBody');

    if (users.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 2rem; text-align: center; color: var(--text-muted);">No users found</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = users.map(user => {
      const creditColor = user.credits < 0 ? 'var(--warning-color)' :
                         user.credits < 10 ? 'var(--text-secondary)' :
                         'var(--success-color)';

      return `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 1rem; font-family: 'Courier New', monospace;">${user.vatsimId}</td>
          <td style="padding: 1rem;">${user.firstName} ${user.lastName}</td>
          <td style="padding: 1rem; color: var(--text-secondary);">${user.email || 'N/A'}</td>
          <td style="padding: 1rem; text-align: center; font-family: 'Courier New', monospace;">${user.membershipCount}</td>
          <td style="padding: 1rem; text-align: center; font-family: 'Courier New', monospace; color: ${creditColor}; font-weight: 600;">${user.credits}</td>
          <td style="padding: 1rem; text-align: center;">
            <button class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.8rem;" onclick='openEditModal(${JSON.stringify(user)})'>Edit Credits</button>
          </td>
        </tr>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading users:', error);
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 2rem; text-align: center; color: var(--warning-color);">Error loading users</td>
      </tr>
    `;
  }
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadUserInfo();
  loadUsers();
});
