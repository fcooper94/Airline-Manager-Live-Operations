// Load financial data
async function loadFinancialData() {
  try {
    const weekOffset = parseInt(document.getElementById('weekSelector').value) || 0;
    const response = await fetch(`/api/finances?weekOffset=${weekOffset}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load financial data');
    }

    displayFinancialData(data);
  } catch (error) {
    console.error('Error loading financial data:', error);
    document.getElementById('financialTable').innerHTML = `
      <tr><td colspan="5" style="padding: 2rem; text-align: center; color: var(--warning-color);">Error loading financial data</td></tr>
    `;
  }
}

// Display financial data
function displayFinancialData(data) {
  const table = document.getElementById('financialTable');

  let rows = '';

  // Operating Revenues Section
  rows += createSectionHeader('OPERATING REVENUES');
  rows += createDataRow('Sold tickets (economy)', data.weeks.map(w => w.revenues.economy));
  rows += createDataRow('Sold tickets (business)', data.weeks.map(w => w.revenues.business));
  rows += createDataRow('Sold tickets (first)', data.weeks.map(w => w.revenues.first));
  rows += createDataRow('Transported cargo (light)', data.weeks.map(w => w.revenues.cargoLight));
  rows += createDataRow('Transported cargo (standard)', data.weeks.map(w => w.revenues.cargoStandard));
  rows += createDataRow('Transported cargo (heavy)', data.weeks.map(w => w.revenues.cargoHeavy));
  rows += createTotalRow('Total operating revenues', data.weeks.map(w => w.revenues.total), true);
  rows += createSpacer();

  // Operating Expenses Section
  rows += createSectionHeader('OPERATING EXPENSES');
  rows += createDataRow('Staff salaries', data.weeks.map(w => w.expenses.staffSalaries), true);
  rows += createDataRow('Staff training', data.weeks.map(w => w.expenses.staffTraining), true);
  rows += createDataRow('Fuel', data.weeks.map(w => w.expenses.fuel), true);
  rows += createDataRow('Fuel contract and hedge fees', data.weeks.map(w => w.expenses.fuelFees), true);
  rows += createDataRow('Aircraft maintenance', data.weeks.map(w => w.expenses.maintenance), true);
  rows += createDataRow('Aircraft leases', data.weeks.map(w => w.expenses.leases), true);
  rows += createDataRow('Aircraft insurance', data.weeks.map(w => w.expenses.insurance), true);
  rows += createDataRow('Aircraft parking', data.weeks.map(w => w.expenses.parking), true);
  rows += createDataRow('Passenger fees', data.weeks.map(w => w.expenses.passengerFees), true);
  rows += createDataRow('Navigation fees', data.weeks.map(w => w.expenses.navigationFees), true);
  rows += createDataRow('Landing fees', data.weeks.map(w => w.expenses.landingFees), true);
  rows += createDataRow('Ground handling', data.weeks.map(w => w.expenses.groundHandling), true);
  rows += createDataRow('Ground handling (cargo)', data.weeks.map(w => w.expenses.groundHandlingCargo), true);
  rows += createDataRow('Depreciation', data.weeks.map(w => w.expenses.depreciation), true);
  rows += createDataRow('Marketing', data.weeks.map(w => w.expenses.marketing), true);
  rows += createDataRow('Office rent', data.weeks.map(w => w.expenses.officeRent), true);
  rows += createDataRow('Fines', data.weeks.map(w => w.expenses.fines), true);
  rows += createDataRow('Alliance fees', data.weeks.map(w => w.expenses.allianceFees), true);
  rows += createTotalRow('Total operating expenses', data.weeks.map(w => w.expenses.total), true);
  rows += createSpacer();

  // Operating Profit
  rows += createTotalRow('Operating profit / loss', data.weeks.map(w => w.operatingProfit), false, 'bold');
  rows += createMarginRow('Operating profit margin', data.weeks.map(w => w.operatingMargin));
  rows += createSpacer();

  // Other Revenues/Expenses
  rows += createSectionHeader('OTHER REVENUES / EXPENSES');
  rows += createDataRow('Aircraft lease fees', data.weeks.map(w => w.other.leaseFees), true);
  rows += createDataRow('Aircraft lease income', data.weeks.map(w => w.other.leaseIncome));
  rows += createDataRow('Profit on sold aircraft', data.weeks.map(w => w.other.profitOnSales));
  rows += createDataRow('Loss on sold aircraft', data.weeks.map(w => w.other.lossOnSales), true);
  rows += createDataRow('Airport slot fees', data.weeks.map(w => w.other.slotFees), true);
  rows += createDataRow('Bank fees', data.weeks.map(w => w.other.bankFees), true);
  rows += createDataRow('Interest', data.weeks.map(w => w.other.interest), true);
  rows += createTotalRow('Total other revenues / expenses', data.weeks.map(w => w.other.total), false);
  rows += createSpacer();

  // Net Profit
  rows += createTotalRow('Profit / loss before taxes', data.weeks.map(w => w.profitBeforeTaxes), false, 'bold');
  rows += createDataRow('Income taxes', data.weeks.map(w => w.taxes), true);
  rows += createTotalRow('Net profit / loss', data.weeks.map(w => w.netProfit), false, 'large');
  rows += createMarginRow('Net profit margin', data.weeks.map(w => w.netMargin));

  table.innerHTML = rows;
}

// Helper functions to create table rows
function createSectionHeader(title) {
  return `
    <tr style="background: var(--surface-elevated);">
      <td colspan="5" style="padding: 1rem; font-weight: 700; color: var(--accent-color); text-transform: uppercase; font-size: 0.875rem; letter-spacing: 1px; border-top: 2px solid var(--border-color);">${title}</td>
    </tr>
  `;
}

function createDataRow(label, values, isNegative = false) {
  return `
    <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
      <td style="padding: 0.75rem 1rem; color: var(--text-secondary);">${label}</td>
      ${values.map((val, index) => {
        const amount = val || 0;
        const displayValue = formatCurrency(Math.abs(amount));
        const prefix = (isNegative && amount !== 0) ? '-' : '';
        const color = amount === 0 ? 'var(--text-muted)' : (index === 0 ? 'var(--text-primary)' : 'var(--text-secondary)');
        return `<td style="padding: 0.75rem 1rem; text-align: right; color: ${color}; font-family: 'Courier New', monospace;">${prefix}$${displayValue}</td>`;
      }).join('')}
    </tr>
  `;
}

function createTotalRow(label, values, isNegative = false, weight = 'normal') {
  const fontSize = weight === 'large' ? '1.1rem' : '0.875rem';
  const fontWeight = (weight === 'bold' || weight === 'large') ? '700' : '600';

  return `
    <tr style="background: rgba(255, 255, 255, 0.02); border-top: 2px solid var(--border-color); border-bottom: 2px solid var(--border-color);">
      <td style="padding: 1rem; font-weight: ${fontWeight}; color: var(--text-primary); font-size: ${fontSize};">${label}</td>
      ${values.map((val, index) => {
        const amount = val || 0;
        const displayValue = formatCurrency(Math.abs(amount));
        const prefix = (isNegative && amount !== 0) ? '-' : '';
        let color;
        if (amount > 0) color = 'var(--success-color)';
        else if (amount < 0) color = 'var(--warning-color)';
        else color = 'var(--text-muted)';

        return `<td style="padding: 1rem; text-align: right; color: ${color}; font-weight: ${fontWeight}; font-size: ${fontSize}; font-family: 'Courier New', monospace;">${prefix}$${displayValue}</td>`;
      }).join('')}
    </tr>
  `;
}

function createMarginRow(label, values) {
  return `
    <tr style="background: rgba(255, 255, 255, 0.01);">
      <td style="padding: 0.5rem 1rem 1rem 2rem; color: var(--text-muted); font-size: 0.875rem; font-style: italic;">${label}</td>
      ${values.map((val, index) => {
        const margin = val || 0;
        const color = index === 0 ? 'var(--text-secondary)' : 'var(--text-muted)';
        return `<td style="padding: 0.5rem 1rem 1rem; text-align: right; color: ${color}; font-size: 0.875rem; font-style: italic;">${margin}%</td>`;
      }).join('')}
    </tr>
  `;
}

function createSpacer() {
  return `<tr style="height: 1rem;"><td colspan="5"></td></tr>`;
}

// Format currency
function formatCurrency(amount) {
  const numAmount = Number(amount) || 0;
  return Math.round(numAmount).toLocaleString('en-US');
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadFinancialData();
});
