const state = {
  categories: [],
  salaries: [],
  signedOut: localStorage.getItem('salaryManagerSignedOut') === 'true'
};
const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const $ = (selector) => document.querySelector(selector);
const defaultCategoryNames = ['Groceries', 'Rent', 'Utilities', 'Fare', 'Savings'];
const supabaseConfig = window.SUPABASE_CONFIG || {};
const configured = Boolean(
  window.supabase?.createClient
  && supabaseConfig.url
  && supabaseConfig.anonKey
  && !supabaseConfig.url.includes('PASTE_')
  && !supabaseConfig.anonKey.includes('PASTE_')
);
const supabaseClient = configured
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3500);
}

function showSetupMessage(message) {
  const banner = $('#setup-banner');
  if (!banner) return;
  banner.innerHTML = `<strong>Supabase setup needed.</strong> ${escapeHtml(message)}`;
  banner.hidden = false;
}

function hideSetupMessage() {
  const banner = $('#setup-banner');
  if (banner) banner.hidden = true;
}

function openModal(id) { document.getElementById(id).hidden = false; }
function closeModal(id) { document.getElementById(id).hidden = true; }

function formatDate(date) {
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(`${date}T00:00:00`));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function organizeViews() {
  if ($('#view-overview')) return;
  const main = $('.main-content');
  const summary = $('.summary-grid');
  const grid = $('.content-grid');
  const salaryPanel = $('.salary-panel');
  const categoriesPanel = $('.categories-panel');
  if (!main || !summary || !grid || !salaryPanel || !categoriesPanel) return;

  const overview = document.createElement('section');
  overview.className = 'view-screen';
  overview.id = 'view-overview';
  overview.innerHTML = `
    <div class="overview-grid">
      <article class="panel overview-card">
        <p class="eyebrow">WELCOME BACK</p>
        <h2>Make your salary feel intentional.</h2>
        <p class="overview-copy">Use Salary Manager to see what came in, what went out, and what you’re keeping for yourself.</p>
        <button class="primary-button" data-view-jump="salary-history">View salary history</button>
      </article>
      <article class="panel overview-card">
        <div class="panel-heading compact-heading"><div><p class="eyebrow">LATEST PAYCHECKS</p><h2>Recent salary</h2></div><span class="record-count" id="overview-record-count">0 records</span></div>
        <div id="overview-salary-list" class="overview-salary-list"></div>
      </article>
    </div>
  `;
  const salaryView = document.createElement('section');
  salaryView.className = 'view-screen';
  salaryView.id = 'view-salary-history';
  const categoriesView = document.createElement('section');
  categoriesView.className = 'view-screen';
  categoriesView.id = 'view-categories';

  overview.prepend(summary);
  salaryView.append(salaryPanel);
  categoriesView.append(categoriesPanel);
  grid.remove();
  main.insertBefore(overview, main.querySelector('.setup-banner').nextSibling);
  main.append(salaryView, categoriesView);
  salaryPanel.querySelector('.eyebrow').textContent = 'YOUR PAYCHECKS';

  document.querySelectorAll('.nav-links a').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const href = link.getAttribute('href') || '';
      setView(href === '#dashboard' ? 'overview' : href.slice(1));
    });
  });
  document.querySelectorAll('[data-view-jump]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.viewJump));
  });
  setView('overview');
}

function setView(view) {
  const selected = view === 'overview' ? 'overview' : view;
  document.querySelectorAll('.view-screen').forEach((screen) => {
    screen.hidden = screen.id !== `view-${selected}`;
    screen.classList.toggle('active', screen.id === `view-${selected}`);
  });
  document.querySelectorAll('.nav-links a').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const linkView = href === '#dashboard' ? 'overview' : href.slice(1);
    link.classList.toggle('active', linkView === selected);
  });
  history.replaceState(null, '', selected === 'overview' ? '#dashboard' : `#${selected}`);
}

function setupProfileMenu() {
  const profileButton = $('#profile-chip');
  const menu = $('#profile-menu');
  if (!profileButton || !menu) return;
  profileButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    profileButton.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (event) => {
    if (!menu.hidden && !$('#sidebar-account').contains(event.target)) {
      menu.hidden = true;
      profileButton.setAttribute('aria-expanded', 'false');
    }
  });
}

function setProfile(name) {
  const profileName = $('#profile-name');
  const avatar = $('#profile-avatar');
  const menuName = $('#profile-menu-name');
  const menuAvatar = $('#profile-menu-avatar');
  if (!profileName || !avatar || !menuName || !menuAvatar) return;
  profileName.textContent = name;
  menuName.textContent = name;
  const initials = name === 'Guest user' ? 'G' : name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  avatar.textContent = initials;
  menuAvatar.textContent = initials;
}

async function ensureSession() {
  if (state.signedOut) return null;
  const current = await supabaseClient.auth.getSession();
  if (current.error) throw current.error;
  if (current.data.session) return current.data.session;

  const anonymous = await supabaseClient.auth.signInAnonymously();
  if (anonymous.error) {
    throw new Error('Enable Anonymous Sign-Ins in Supabase Auth, then refresh this page.');
  }
  return anonymous.data.session;
}

async function ensureDefaultCategories(userId) {
  const rows = defaultCategoryNames.map((name) => ({ user_id: userId, name, is_default: true }));
  const { error } = await supabaseClient
    .from('categories')
    .upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true });
  if (error) throw error;
}

async function loadCategories() {
  const { data, error } = await supabaseClient
    .from('categories')
    .select('id, name, is_default')
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map((category) => ({ ...category, isDefault: category.is_default }));
}

async function loadSalaries() {
  const salariesQuery = await supabaseClient
    .from('salary_records')
    .select('id, amount, pay_date, notes, created_at')
    .order('pay_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (salariesQuery.error) throw salariesQuery.error;

  const deductionsQuery = await supabaseClient
    .from('deductions')
    .select('salary_record_id, amount');
  if (deductionsQuery.error) throw deductionsQuery.error;

  const totals = new Map();
  (deductionsQuery.data || []).forEach((deduction) => {
    const current = totals.get(deduction.salary_record_id) || 0;
    totals.set(deduction.salary_record_id, current + Number(deduction.amount));
  });

  return (salariesQuery.data || []).map((salary) => {
    const amount = Number(salary.amount);
    const totalDeductions = totals.get(salary.id) || 0;
    return {
      id: salary.id,
      amount,
      payDate: salary.pay_date,
      notes: salary.notes,
      totalDeductions,
      remaining: amount - totalDeductions
    };
  });
}

async function loadSalaryDetail(salaryId) {
  const salaryQuery = await supabaseClient
    .from('salary_records')
    .select('id, amount, pay_date, notes')
    .eq('id', salaryId)
    .single();
  if (salaryQuery.error) throw salaryQuery.error;

  const deductionsQuery = await supabaseClient
    .from('deductions')
    .select('id, amount, description, category_id, created_at')
    .eq('salary_record_id', salaryId)
    .order('created_at', { ascending: false });
  if (deductionsQuery.error) throw deductionsQuery.error;

  const categoriesById = new Map(state.categories.map((category) => [category.id, category.name]));
  return {
    ...salaryQuery.data,
    payDate: salaryQuery.data.pay_date,
    deductions: (deductionsQuery.data || []).map((deduction) => ({
      ...deduction,
      categoryName: categoriesById.get(deduction.category_id) || 'Uncategorized'
    }))
  };
}

async function refresh() {
  if (!configured) {
    showSetupMessage('Add your Supabase URL and publishable key to public/supabase-config.js.');
    renderSummary();
    renderSalaries();
    renderCategories();
    populateCategorySelect();
    return;
  }

  try {
    hideSetupMessage();
    if (state.signedOut) {
      state.categories = [];
      state.salaries = [];
      await updateAccountStatus();
      renderSummary();
      renderSalaries();
      renderCategories();
      populateCategorySelect();
      return;
    }
    const session = await ensureSession();
    if (!session) return;
    await ensureDefaultCategories(session.user.id);
    state.categories = await loadCategories();
    state.salaries = await loadSalaries();
    await updateAccountStatus();
    renderSummary();
    renderSalaries();
    renderCategories();
    populateCategorySelect();
  } catch (error) {
    showSetupMessage(error.message || 'Check your Supabase project setup and refresh the page.');
    showToast(error.message || 'Unable to connect to Supabase.');
  }
}

async function updateAccountStatus() {
  const status = $('#account-status');
  const button = $('#google-login-button');
  const logoutButton = $('#logout-button');
  if (!supabaseClient || !status || !button || !logoutButton) return;
  if (state.signedOut) {
    setProfile('Guest user');
    status.textContent = 'Signed out';
    button.hidden = false;
    button.innerHTML = '<span>G</span> Sign in with Google';
    logoutButton.hidden = true;
    return;
  }
  const { data, error } = await supabaseClient.auth.getUser();
  if (error || !data.user) return;
  if (data.user.is_anonymous) {
    setProfile('Guest user');
    status.textContent = 'Guest mode';
    button.hidden = false;
    button.innerHTML = '<span>G</span> Save with Google';
    logoutButton.hidden = true;
  } else {
    const name = data.user.user_metadata?.full_name || data.user.email || 'Google account';
    setProfile(name);
    status.textContent = 'Google connected';
    button.hidden = true;
    logoutButton.hidden = false;
  }
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
  const overviewCount = $('#overview-record-count');
  if (overviewCount) overviewCount.textContent = `${state.salaries.length} record${state.salaries.length === 1 ? '' : 's'}`;
  renderOverview();
}

function renderOverview() {
  const list = $('#overview-salary-list');
  if (!list) return;
  const recent = state.salaries.slice(0, 3);
  list.innerHTML = recent.length ? recent.map((salary) => `
    <div class="overview-salary-row">
      <div><span>${formatDate(salary.payDate)}</span><strong>${money.format(salary.amount)}</strong></div>
      <div><strong>${money.format(salary.remaining)}</strong><span>available</span></div>
    </div>
  `).join('') : '<div class="history-empty">No salary records yet.</div>';
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
    button.addEventListener('click', () => openDeductionModal(button.dataset.salaryId));
  });
  document.querySelectorAll('[data-history-id]').forEach((button) => {
    button.addEventListener('click', () => toggleExpenseHistory(button.dataset.historyId, button));
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
    const salary = await loadSalaryDetail(salaryId);
    history.innerHTML = `
      <div class="history-heading"><strong>Expense history</strong><span>${salary.deductions.length} item${salary.deductions.length === 1 ? '' : 's'}</span></div>
      ${salary.deductions.length ? salary.deductions.map((deduction) => `
        <div class="expense-row">
          <div><strong>${escapeHtml(deduction.categoryName)}</strong><span>${escapeHtml(deduction.description || 'No note added')}</span></div>
          <strong class="expense-amount">${money.format(Number(deduction.amount))}</strong>
          <button class="delete-expense" data-deduction-id="${deduction.id}" aria-label="Delete expense">×</button>
        </div>
      `).join('') : '<div class="history-empty">No expenses added to this salary yet.</div>'}
    `;
    history.hidden = false;
    button.textContent = 'Hide history';
    history.querySelectorAll('[data-deduction-id]').forEach((deleteButton) => {
      deleteButton.addEventListener('click', () => removeDeduction(deleteButton.dataset.deductionId, salaryId));
    });
  } catch (error) { showToast(error.message); }
}

function populateCategorySelect() {
  $('#category-select').innerHTML = state.categories.map((category) => `<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('');
}

function renderCategories() {
  $('#category-list').innerHTML = state.categories.map((category) => `
    <div class="category-row">
      <div class="category-name"><span class="category-dot"></span>${escapeHtml(category.name)}</div>
      ${category.isDefault ? '<span class="category-badge">default</span>' : `<button class="remove-category" title="Remove category" data-category-id="${category.id}">×</button>`}
    </div>
  `).join('');
  document.querySelectorAll('[data-category-id]').forEach((button) => {
    button.addEventListener('click', () => removeCategory(button.dataset.categoryId));
  });
}

function openDeductionModal(salaryId) {
  const salary = state.salaries.find((item) => item.id === salaryId);
  if (!salary) return;
  $('#deduction-form').reset();
  $('#deduction-form [name="salaryId"]').value = salaryId;
  $('#deduction-salary-context').textContent = `${formatDate(salary.payDate)} salary · ${money.format(salary.remaining)} currently available`;
  openModal('deduction-modal');
}

async function removeDeduction(deductionId, salaryId) {
  if (!confirm('Remove this expense?')) return;
  try {
    const { error } = await supabaseClient.from('deductions').delete().eq('id', deductionId);
    if (error) throw error;
    await refresh();
    const button = document.querySelector(`[data-history-id="${salaryId}"]`);
    if (button) await toggleExpenseHistory(salaryId, button);
    showToast('Expense removed.');
  } catch (error) { showToast(error.message); }
}

async function removeCategory(categoryId) {
  if (!confirm('Remove this custom category?')) return;
  try {
    const { error } = await supabaseClient.from('categories').delete().eq('id', categoryId).eq('is_default', false);
    if (error) throw error;
    await refresh();
    showToast('Category removed.');
  } catch (error) {
    showToast('This category may already be used by an expense.');
  }
}

$('#open-salary-modal').addEventListener('click', () => {
  $('#salary-form').reset();
  $('#salary-form [name="payDate"]').value = new Date().toISOString().slice(0, 10);
  openModal('salary-modal');
});
$('#open-category-modal').addEventListener('click', () => { $('#category-form').reset(); openModal('category-modal'); });
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.close)));
document.querySelectorAll('.modal-backdrop').forEach((backdrop) => backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(backdrop.id); }));

$('#google-login-button').addEventListener('click', async () => {
  if (!supabaseClient) {
    showSetupMessage('Configure Supabase before connecting Google.');
    return;
  }
  try {
    if (state.signedOut) {
      state.signedOut = false;
      localStorage.removeItem('salaryManagerSignedOut');
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
      if (error) throw error;
      return;
    }
    const session = await ensureSession();
    if (!session.user.is_anonymous) return;
    const { error } = await supabaseClient.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (error) throw error;
  } catch (error) {
    showToast(error.message || 'Google sign-in could not start.');
  }
});

$('#logout-button').addEventListener('click', async () => {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    state.signedOut = true;
    localStorage.setItem('salaryManagerSignedOut', 'true');
    await refresh();
    showToast('You have been logged out.');
  } catch (error) {
    showToast(error.message || 'Unable to log out.');
  }
});

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.body.classList.toggle('dark-mode', dark);
  $('#theme-toggle').setAttribute('aria-pressed', String(dark));
  $('#theme-icon').textContent = dark ? '☀' : '☾';
  $('#theme-label').textContent = dark ? 'Light mode' : 'Dark mode';
}

organizeViews();
setupProfileMenu();

const savedTheme = localStorage.getItem('salaryManagerTheme');
applyTheme(savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#theme-toggle').addEventListener('click', () => {
  const nextTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
  localStorage.setItem('salaryManagerTheme', nextTheme);
  applyTheme(nextTheme);
});

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') {
      state.signedOut = false;
      localStorage.removeItem('salaryManagerSignedOut');
      refresh();
    } else {
      updateAccountStatus();
    }
  });
}

$('#salary-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.target));
  try {
    const { error } = await supabaseClient.from('salary_records').insert({
      amount: Number(form.amount),
      pay_date: form.payDate,
      notes: form.notes.trim()
    });
    if (error) throw error;
    closeModal('salary-modal'); await refresh(); showToast('Salary saved. Now add your expenses.');
  } catch (error) { showToast(error.message); }
});

$('#deduction-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.target));
  try {
    const { error } = await supabaseClient.from('deductions').insert({
      salary_record_id: form.salaryId,
      category_id: form.categoryId,
      amount: Number(form.amount),
      description: form.description.trim()
    });
    if (error) throw error;
    closeModal('deduction-modal'); await refresh(); showToast('Expense added to this salary.');
  } catch (error) { showToast(error.message); }
});

$('#category-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.target));
  try {
    const { error } = await supabaseClient.from('categories').insert({ name: form.name.trim(), is_default: false });
    if (error) throw error;
    closeModal('category-modal'); await refresh(); showToast('Custom category added.');
  } catch (error) {
    showToast(error.code === '23505' ? 'That category already exists.' : error.message);
  }
});

refresh();
