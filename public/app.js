const state = { categories: [], salaries: [] };
const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const $ = (selector) => document.querySelector(selector);

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || 'Something went wrong.');
  return data;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function openModal(id) { document.getElementById(id).hidden = false; }
function closeModal(id) { document.getElementById(id).hidden = true; }

function formatDate(date) {
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(`${date}T00:00:00`));
}

function renderSummary() {
  const totalSalary = state.salaries.reduce((sum, item) => sum + item.amount, 0);
  const totalDeductions = state.salaries.reduce((sum, item) => sum + item.totalDeductions, 0);
  const remaining = totalSalary - totalDeductions;
  $('#total-salary').textContent = money.format(totalSalary);
  $('#total-deductions').textContent = money.format(totalDeductions);
  $('#total-remaining').textContent = money.format(remaining);
  $('#salary-count').textContent = `${state.salaries.length} salary record${state.salaries.length === 1 ? '' : 's'}`;
  $('#deduction-rate').textContent = totalSalary ? `${Math.round((totalDeductions / totalSalary) * 100)}% allocated so far` : 'Start by adding a salary';
  $('#balance-caption').textContent = state.salaries.length ? 'Across all tracked salaries' : 'Your tracked take-home balance';
  $('#record-count').textContent = `${state.salaries.length} record${state.salaries.length === 1 ? '' : 's'}`;
}

function renderSalaries() {
  const list = $('#salary-list');
  if (!state.salaries.length) {
    list.innerHTML = '<div class="empty-state"><strong>Your salary story starts here.</strong>Add your first salary to begin tracking deductions.</div>';
    return;
  }
  list.innerHTML = state.salaries.map((salary) => `
    <div class="salary-entry">
      <div class="salary-item">
        <div><div class="salary-date">${formatDate(salary.payDate)}</div><div class="salary-amount">${money.format(salary.amount)}</div></div>
        <div class="salary-breakdown"><strong>${money.format(salary.remaining)}</strong><span>${money.format(salary.totalDeductions)} deducted</span></div>
        <button class="history-button" data-history-id="${salary.id}">History</button>
        <button class="add-deduction" data-salary-id="${salary.id}">＋ Expense</button>
      </div>
      <div class="expense-history" id="history-${salary.id}" hidden></div>
    </div>
  `).join('');
  document.querySelectorAll('[data-salary-id]').forEach((button) => {
    button.addEventListener('click', () => openDeductionModal(Number(button.dataset.salaryId)));
  });
  document.querySelectorAll('[data-history-id]').forEach((button) => {
    button.addEventListener('click', () => toggleExpenseHistory(Number(button.dataset.historyId), button));
  });
}

async function toggleExpenseHistory(salaryId, button) {
  const history = document.querySelector(`#history-${salaryId}`);
  if (!history.hidden) {
    history.hidden = true;
    button.textContent = 'History';
    return;
  }
  try {
    const salary = await api(`/api/salaries/${salaryId}`);
    history.innerHTML = `
      <div class="history-heading"><strong>Expense history</strong><span>${salary.deductions.length} item${salary.deductions.length === 1 ? '' : 's'}</span></div>
      ${salary.deductions.length ? salary.deductions.map((deduction) => `
        <div class="expense-row">
          <div><strong>${escapeHtml(deduction.categoryName)}</strong><span>${escapeHtml(deduction.description || 'No note added')}</span></div>
          <strong class="expense-amount">${money.format(deduction.amount)}</strong>
          <button class="delete-expense" data-deduction-id="${deduction.id}" aria-label="Delete expense">×</button>
        </div>
      `).join('') : '<div class="history-empty">No expenses added to this salary yet.</div>'}
    `;
    history.hidden = false;
    button.textContent = 'Hide history';
    history.querySelectorAll('[data-deduction-id]').forEach((deleteButton) => {
      deleteButton.addEventListener('click', () => removeDeduction(Number(deleteButton.dataset.deductionId), salaryId));
    });
  } catch (error) { showToast(error.message); }
}

async function removeDeduction(deductionId, salaryId) {
  if (!confirm('Remove this expense?')) return;
  try {
    await api(`/api/deductions/${deductionId}`, { method: 'DELETE' });
    await refresh();
    const button = document.querySelector(`[data-history-id="${salaryId}"]`);
    if (button) await toggleExpenseHistory(salaryId, button);
    showToast('Expense removed.');
  } catch (error) { showToast(error.message); }
}

function renderCategories() {
  $('#category-list').innerHTML = state.categories.map((category) => `
    <div class="category-row">
      <div class="category-name"><span class="category-dot"></span>${escapeHtml(category.name)}</div>
      ${category.isDefault ? '<span class="category-badge">default</span>' : `<button class="remove-category" title="Remove category" data-category-id="${category.id}">×</button>`}
    </div>
  `).join('');
  document.querySelectorAll('[data-category-id]').forEach((button) => {
    button.addEventListener('click', () => removeCategory(Number(button.dataset.categoryId)));
  });
}

function populateCategorySelect() {
  $('#category-select').innerHTML = state.categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

async function refresh() {
  const data = await api('/api/bootstrap');
  state.categories = data.categories;
  state.salaries = data.salaries;
  renderSummary();
  renderSalaries();
  renderCategories();
  populateCategorySelect();
}

function openDeductionModal(salaryId) {
  const salary = state.salaries.find((item) => item.id === salaryId);
  if (!salary) return;
  $('#deduction-form').reset();
  $('#deduction-form [name="salaryId"]').value = salaryId;
  $('#deduction-salary-context').textContent = `${formatDate(salary.payDate)} salary · ${money.format(salary.remaining)} currently available`;
  openModal('deduction-modal');
}

async function removeCategory(id) {
  if (!confirm('Remove this custom category?')) return;
  try { await api(`/api/categories/${id}`, { method: 'DELETE' }); await refresh(); showToast('Category removed.'); }
  catch (error) { showToast(error.message); }
}

$('#open-salary-modal').addEventListener('click', () => {
  $('#salary-form').reset();
  $('#salary-form [name="payDate"]').value = new Date().toISOString().slice(0, 10);
  openModal('salary-modal');
});
$('#open-category-modal').addEventListener('click', () => { $('#category-form').reset(); openModal('category-modal'); });
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.close)));
document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(backdrop.id); }));

$('#salary-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api('/api/salaries', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
    closeModal('salary-modal'); await refresh(); showToast('Salary saved. Now add your expenses.');
  } catch (error) { showToast(error.message); }
});

$('#deduction-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  const values = Object.fromEntries(form);
  const salaryId = values.salaryId;
  delete values.salaryId;
  try {
    await api(`/api/salaries/${salaryId}/deductions`, { method: 'POST', body: JSON.stringify(values) });
    closeModal('deduction-modal'); await refresh(); showToast('Expense added to this salary.');
  } catch (error) { showToast(error.message); }
});

$('#category-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api('/api/categories', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
    closeModal('category-modal'); await refresh(); showToast('Custom category added.');
  } catch (error) { showToast(error.message); }
});

refresh().catch((error) => showToast(error.message));
