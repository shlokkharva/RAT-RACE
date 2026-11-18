const CATEGORIES = [
  { id: 'all', label: 'All Roles', color: '#2563eb' },
  { id: 'data-analyst', label: 'Data Analyst', color: '#0891b2' },
  { id: 'ui-ux', label: 'UI/UX Design', color: '#db2777' },
  { id: 'mern', label: 'MERN Stack', color: '#059669' },
  { id: 'fullstack', label: 'Full-Stack', color: '#7c3aed' },
  { id: 'python', label: 'Python', color: '#d97706' },
];

const SELECTABLE_ROLES = CATEGORIES.filter((c) => c.id !== 'all');
const PAGE_SIZE = 18;

const WORK_MODE_LABELS = {
  all: 'Vadodara + Remote',
  vadodara: 'Vadodara Only',
  remote: 'Remote Only',
};

const QUICK_PORTALS = [
  {
    name: 'LinkedIn — Vadodara Freshers',
    desc: 'Entry-level IT & Internship roles (Past 7 days)',
    url: 'https://www.linkedin.com/jobs/search/?keywords=Data%20Analyst%20OR%20UI%20UX%20OR%20MERN%20OR%20Full%20Stack%20OR%20Python&location=Vadodara%2C%20Gujarat%2C%20India&f_E=1%2C2&f_TPR=r604800&sortBy=DD',
  },
  {
    name: 'Naukri — Vadodara IT Freshers',
    desc: '0–1 yrs Software, Python, MERN, Data & UI/UX',
    url: 'https://www.naukri.com/python-mern-full-stack-data-analyst-ui-ux-jobs-in-vadodara?experience=0',
  },
  {
    name: 'Internshala — Vadodara Jobs',
    desc: 'Fresher jobs in Web, Python, Data & UI/UX',
    url: 'https://internshala.com/jobs/web-development,full-stack-development,python-django,data-analytics,ui-ux-design-jobs-in-vadodara/',
  },
  {
    name: 'Indeed India — Vadodara',
    desc: 'Latest fresher IT developer & analyst listings',
    url: 'https://in.indeed.com/jobs?q=fresher+(python+OR+mern+OR+%22full+stack%22+OR+%22data+analyst%22+OR+%22ui+ux%22)&l=Vadodara%2C+Gujarat&sort=date',
  },
  {
    name: 'LinkedIn — Remote India Freshers',
    desc: 'Work-from-home entry-level IT & Internship roles',
    url: 'https://www.linkedin.com/jobs/search/?keywords=Data%20Analyst%20OR%20UI%20UX%20OR%20MERN%20OR%20Full%20Stack%20OR%20Python&location=India&f_WT=2&f_E=1%2C2&f_TPR=r604800&sortBy=DD',
  },
  {
    name: 'Internshala — Work From Home',
    desc: 'Remote fresher IT jobs & internships across India',
    url: 'https://internshala.com/jobs/work-from-home/web-development,full-stack-development,python-django,data-analytics,ui-ux-design-jobs/',
  },
  {
    name: 'Foundit — Vadodara Freshers',
    desc: 'Entry-level tech roles in Vadodara / Baroda',
    url: 'https://www.foundit.in/srp/results?query=fresher+python+full+stack+data+analyst+ui+ux&locations=Vadodara',
  },
];

const STORAGE_KEY = 'ratracerbdq_user_state_v1';
const SUBSCRIBER_KEY = 'ratracerbdq_subscriber_v1';
const SKIPPED_KEY = 'ratracerbdq_modal_skipped_v1';

const API_BASE = window.RATRACERBDQ_API_URL || '';

const state = {
  jobs: [],
  meta: {},
  sync: null,
  companies: [],
  companySearch: '',
  companyArea: 'all',
  companyTier: 'all',
  companyLimit: 12,
  hasBackendApi: false,
  isLoading: true,
  visibleLimit: PAGE_SIZE,
  selectedCategory: 'all',
  workMode: 'all',
  search: '',
  jobType: 'all',
  source: 'all',
  status: 'active',
  sort: 'newest',
  userMarks: loadJson(STORAGE_KEY, {}),
  subscriber: loadJson(SUBSCRIBER_KEY, null),
};

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveUserMarks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.userMarks));
  } catch {
    // Ignore storage quota errors
  }
}

function saveSubscriberLocally(sub) {
  state.subscriber = sub;
  try {
    if (sub) {
      localStorage.setItem(SUBSCRIBER_KEY, JSON.stringify(sub));
      localStorage.removeItem(SKIPPED_KEY);
    } else {
      localStorage.removeItem(SUBSCRIBER_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

function getJobMark(id) {
  return state.userMarks[id] || { saved: false, applied: false, hidden: false };
}

function toggleJobMark(id, field) {
  const current = getJobMark(id);
  const nextVal = !current[field];
  state.userMarks[id] = { ...current, [field]: nextVal };
  saveUserMarks();
  renderAll();
  if (field === 'saved') {
    showToast(nextVal ? 'Saved to your shortlist.' : 'Removed from Saved.', 'info');
  } else if (field === 'applied') {
    showToast(nextVal ? 'Marked as Applied!' : 'Removed Applied mark.', nextVal ? 'success' : 'info');
  } else if (field === 'hidden') {
    showToast(nextVal ? 'Job hidden. Switch status to "Show All" to restore.' : 'Job restored.', 'info');
  }
}

function isWithin24Hours(isoDate) {
  if (!isoDate) return false;
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= 24 * 60 * 60 * 1000;
}

function formatIST(isoDate) {
  if (!isoDate) return 'Pending first run';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return (
    d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' IST'
  );
}

function formatRelativeTime(isoDate) {
  if (!isoDate) return 'Recently';
  const diffMs = Date.now() - Date.parse(isoDate);
  if (Number.isNaN(diffMs) || diffMs < 0) return 'Just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(url = '') {
  const trimmed = String(url || '').trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : '#';
}

function getGlassdoorInfo(job) {
  const gd = job.glassdoor || {};
  const fallbackUrl = `https://www.glassdoor.co.in/Search/results.htm?keyword=${encodeURIComponent(
    job.company || ''
  )}`;
  const url = safeHref(gd.url || fallbackUrl);
  const websiteUrl = gd.websiteUrl ? safeHref(gd.websiteUrl) : null;
  const verified = Boolean(gd.verified);
  const verifiedVia = gd.verifiedVia || (verified ? 'glassdoor' : null);
  const rating = typeof gd.rating === 'number' && !Number.isNaN(gd.rating) ? gd.rating.toFixed(1) : null;
  const count = gd.reviewCount
    ? gd.reviewCount >= 1000
      ? `${(gd.reviewCount / 1000).toFixed(1)}k`
      : String(gd.reviewCount)
    : null;
  return { url, websiteUrl, verified, verifiedVia, rating, count };
}

let toastTimer = null;
function showToast(message, type = 'info') {
  const el = document.getElementById('toast-banner');
  el.textContent = message;
  el.className = `toast-banner ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('hidden');
  }, 4500);
}

async function copyApplyLink(url) {
  const cleanUrl = safeHref(url);
  if (cleanUrl === '#') return;
  try {
    await navigator.clipboard.writeText(cleanUrl);
    showToast('Application link copied to clipboard!', 'success');
  } catch {
    showToast('Could not copy automatically — click Apply Now to open the link.', 'info');
  }
}

async function reportExpiredJob(id, title, company) {
  state.jobs = state.jobs.filter((j) => j.id !== id);
  renderAll();
  try {
    const res = await fetch(`${API_BASE}/api/report-expired`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title, company }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      showToast(`Removed expired job (${company}) permanently.`, 'info');
      return;
    }
  } catch {
    // Fallback on static hosting: hide locally
  }
  const current = getJobMark(id);
  state.userMarks[id] = { ...current, hidden: true };
  saveUserMarks();
  showToast(`Removed expired job (${company}).`, 'info');
}

/* ======================== Optional Gmail Alerts Modal & API ======================== */

function renderModalRoleChecks(selectedIds = SELECTABLE_ROLES.map((r) => r.id)) {
  const container = document.getElementById('modal-role-checks');
  const selectedSet = new Set(selectedIds);
  container.innerHTML = SELECTABLE_ROLES.map((role) => {
    const checked = selectedSet.has(role.id);
    return `
      <label class="role-check-pill ${checked ? 'checked' : ''}">
        <input type="checkbox" name="roles" value="${role.id}" ${checked ? 'checked' : ''} />
        <span>${escapeHtml(role.label)}</span>
      </label>
    `;
  }).join('');

  container.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', () => {
      input.closest('.role-check-pill').classList.toggle('checked', input.checked);
    });
  });
}

function setModalFeedback(message, type = 'error') {
  const box = document.getElementById('modal-feedback');
  if (!message) {
    box.classList.add('hidden');
    box.textContent = '';
    return;
  }
  box.textContent = message;
  box.className = `modal-feedback ${type}`;
}

function openGmailModal() {
  const modal = document.getElementById('gmail-modal');
  const emailInput = document.getElementById('sub-email');
  const nameInput = document.getElementById('sub-name');
  const modeSelect = document.getElementById('sub-workmode');
  const activeCheckbox = document.getElementById('sub-active-checkbox');
  const unsubBtn = document.getElementById('modal-unsub-btn');

  setModalFeedback('');
  if (state.subscriber) {
    emailInput.value = state.subscriber.email || '';
    nameInput.value = state.subscriber.name || '';
    modeSelect.value = state.subscriber.workMode || 'all';
    activeCheckbox.checked = state.subscriber.active !== false;
    renderModalRoleChecks(state.subscriber.roles);
    unsubBtn.classList.remove('hidden');
  } else {
    emailInput.value = '';
    nameInput.value = '';
    modeSelect.value = 'all';
    activeCheckbox.checked = true;
    renderModalRoleChecks(SELECTABLE_ROLES.map((r) => r.id));
    unsubBtn.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => emailInput.focus(), 50);
}

function closeGmailModal() {
  const modal = document.getElementById('gmail-modal');
  if (modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function renderSubscriberBar() {
  const strip = document.getElementById('subscriber-strip');
  const banner = document.getElementById('optin-banner');
  const ctaBtn = document.getElementById('open-gmail-modal-btn');
  const bannerDismissed = localStorage.getItem(SKIPPED_KEY) === '1';

  if (state.subscriber && state.subscriber.email) {
    const isActive = state.subscriber.active !== false;
    strip.classList.remove('hidden');
    strip.classList.toggle('is-paused', !isActive);
    banner.classList.add('hidden');
    ctaBtn.classList.add('hidden');

    document.getElementById('sub-dot').classList.toggle('paused', !isActive);
    document.getElementById('sub-strip-prefix').textContent = isActive
      ? 'Email updates ON for'
      : 'Email updates PAUSED for';
    document.getElementById('sub-strip-email').textContent = state.subscriber.email;
    document.getElementById('toggle-updates-btn').textContent = isActive
      ? 'Pause Updates'
      : 'Turn On Updates';
    document.getElementById('send-now-btn').classList.toggle('hidden', !isActive);

    const roleLookup = new Map(SELECTABLE_ROLES.map((r) => [r.id, r.label]));
    const labels = (state.subscriber.roles || []).map((id) => roleLookup.get(id)).filter(Boolean);
    const roleText =
      labels.length === SELECTABLE_ROLES.length ? 'All 5 IT roles' : labels.join(', ');
    const modeText = WORK_MODE_LABELS[state.subscriber.workMode || 'all'] || 'Vadodara + Remote';
    document.getElementById('sub-strip-roles').textContent = `(${roleText} • ${modeText})`;
  } else {
    strip.classList.add('hidden');
    ctaBtn.classList.remove('hidden');
    banner.classList.toggle('hidden', bannerDismissed);
  }
}

async function handleSubscribeSubmit(event) {
  event.preventDefault();
  setModalFeedback('');

  const email = document.getElementById('sub-email').value.trim().toLowerCase();
  const name = document.getElementById('sub-name').value.trim();
  const workMode = document.getElementById('sub-workmode').value || 'all';
  const active = document.getElementById('sub-active-checkbox').checked;
  const checkedRoles = Array.from(
    document.querySelectorAll('#modal-role-checks input[type="checkbox"]:checked')
  ).map((el) => el.value);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
    setModalFeedback('Please enter a valid Gmail or email address (e.g., yourname@gmail.com).', 'error');
    return;
  }

  if (checkedRoles.length === 0) {
    setModalFeedback('Please select at least one IT role category.', 'error');
    return;
  }

  const submitBtn = document.getElementById('sub-submit-btn');
  const prevText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving preferences...';

  try {
    const res = await fetch(`${API_BASE}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, roles: checkedRoles, workMode, active }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Could not save your Gmail preferences.');
    }

    saveSubscriberLocally({
      email: data.subscriber.email,
      name: data.subscriber.name,
      roles: data.subscriber.roles,
      workMode: data.subscriber.workMode || 'all',
      active: data.subscriber.active !== false,
    });
    renderSubscriberBar();
    closeGmailModal();
    showToast(data.message || `Preferences saved for ${email}!`, data.emailSent ? 'success' : 'info');
  } catch (err) {
    if (err.name === 'TypeError' || /Unexpected token|Failed to fetch/i.test(err.message)) {
      saveSubscriberLocally({ email, name, roles: checkedRoles, workMode, active });
      renderSubscriberBar();
      closeGmailModal();
      showToast(
        active
          ? `Saved ${email} locally. Run "npm run serve" (or host on Render) with Gmail SMTP configured to send automatic emails.`
          : `Email updates paused for ${email}.`,
        'info'
      );
    } else {
      setModalFeedback(err.message, 'error');
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = prevText;
  }
}

async function handleToggleUpdates() {
  if (!state.subscriber?.email) return;
  const nextActive = state.subscriber.active === false;
  const btn = document.getElementById('toggle-updates-btn');
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: state.subscriber.email,
        name: state.subscriber.name || '',
        roles: state.subscriber.roles,
        workMode: state.subscriber.workMode || 'all',
        active: nextActive,
        sendWelcome: false,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Could not update email preference.');
    }
    saveSubscriberLocally({ ...state.subscriber, active: nextActive });
    renderSubscriberBar();
    showToast(
      nextActive
        ? `Email updates turned ON for ${state.subscriber.email}.`
        : `Email updates paused for ${state.subscriber.email}. No emails will be sent until you turn them back on.`,
      nextActive ? 'success' : 'info'
    );
  } catch {
    saveSubscriberLocally({ ...state.subscriber, active: nextActive });
    renderSubscriberBar();
    showToast(
      nextActive
        ? `Email updates turned ON for ${state.subscriber.email}.`
        : `Email updates paused for ${state.subscriber.email}.`,
      'info'
    );
  } finally {
    btn.disabled = false;
  }
}

async function handleSendNow() {
  if (!state.subscriber?.email) {
    openGmailModal();
    return;
  }
  const btn = document.getElementById('send-now-btn');
  const prevText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Sending email...';

  try {
    const res = await fetch(`${API_BASE}/api/send-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: state.subscriber.email,
        name: state.subscriber.name || '',
        roles: state.subscriber.roles,
        workMode: state.subscriber.workMode || 'all',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      showToast(data.error || 'Could not send email right now.', 'error');
    } else {
      showToast(data.message, data.emailSent ? 'success' : 'info');
    }
  } catch {
    showToast('Start the server with "npm run serve" (or host on Render) to trigger live emails.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = prevText;
  }
}

async function handleUnsubscribe() {
  if (!state.subscriber?.email) return;
  const email = state.subscriber.email;
  try {
    await fetch(`${API_BASE}/api/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  } catch {
    // Still clear locally
  }
  saveSubscriberLocally(null);
  localStorage.setItem(SKIPPED_KEY, '1');
  renderSubscriberBar();
  closeGmailModal();
  showToast(`Removed ${email} from email alerts.`, 'info');
}

/* ======================== Filtering & Rendering ======================== */

function getWorkModeScopedJobs(jobs) {
  if (state.workMode === 'vadodara') return jobs.filter((j) => j.isVadodara);
  if (state.workMode === 'remote') return jobs.filter((j) => j.isRemote);
  return jobs;
}

function getFilteredJobs() {
  const query = state.search.trim().toLowerCase();

  return state.jobs
    .filter((job) => {
      const mark = getJobMark(job.id);
      if (state.status === 'active' && mark.hidden) return false;
      if (state.status === 'saved' && !mark.saved) return false;
      if (state.status === 'applied' && !mark.applied) return false;
      if (state.status === 'new24' && (mark.hidden || !isWithin24Hours(job.discoveredAt))) return false;

      if (state.selectedCategory !== 'all' && !(job.categories || []).includes(state.selectedCategory)) {
        return false;
      }

      if (state.workMode === 'vadodara' && !job.isVadodara) return false;
      if (state.workMode === 'remote' && !job.isRemote) return false;

      if (state.jobType !== 'all' && job.jobType !== state.jobType) return false;
      if (state.source !== 'all' && job.source !== state.source) return false;

      if (query) {
        const hay =
          `${job.title} ${job.company} ${job.location} ${job.snippet || ''} ${(job.categories || []).join(' ')}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (state.sort === 'score') {
        return (b.fresherScore || 0) - (a.fresherScore || 0);
      }
      return Date.parse(b.discoveredAt || 0) - Date.parse(a.discoveredAt || 0);
    });
}

function renderStats() {
  const visibleJobs = state.jobs.filter((j) => !getJobMark(j.id).hidden);
  const vadodaraCount = visibleJobs.filter((j) => j.isVadodara).length;
  const remoteCount = visibleJobs.filter((j) => j.isRemote).length;
  const savedCount = state.jobs.filter((j) => getJobMark(j.id).saved).length;
  const appliedCount = state.jobs.filter((j) => getJobMark(j.id).applied).length;

  document.getElementById('stat-total').textContent = visibleJobs.length;
  document.getElementById('stat-vadodara').textContent = vadodaraCount;
  document.getElementById('stat-remote').textContent = remoteCount;
  document.getElementById('stat-saved').textContent = savedCount;
  document.getElementById('stat-applied').textContent = appliedCount;
  document.getElementById('last-updated-pill').textContent = `Last scan: ${formatIST(state.meta.lastUpdated)}`;

  // Highlight active stat shortcut
  document.querySelectorAll('.stat-card[data-stat-filter]').forEach((card) => {
    const f = card.dataset.statFilter;
    const isSelected =
      (f === 'all' && state.workMode === 'all' && state.status === 'active') ||
      (f === 'vadodara' && state.workMode === 'vadodara' && state.status === 'active') ||
      (f === 'remote' && state.workMode === 'remote' && state.status === 'active') ||
      (f === 'saved' && state.status === 'saved') ||
      (f === 'applied' && state.status === 'applied');
    card.classList.toggle('is-selected', isSelected);
  });
}

function renderWorkModePills() {
  document.querySelectorAll('#workmode-pills .mode-pill').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === state.workMode);
  });
}

function renderCategoryTabs() {
  const container = document.getElementById('category-tabs');
  // Scope counts to active work mode so numbers always match what's visible
  const activeJobs = getWorkModeScopedJobs(state.jobs.filter((j) => !getJobMark(j.id).hidden));

  container.innerHTML = CATEGORIES.map((cat) => {
    const count =
      cat.id === 'all'
        ? activeJobs.length
        : activeJobs.filter((j) => (j.categories || []).includes(cat.id)).length;
    const isActive = state.selectedCategory === cat.id;
    return `
      <button
        class="cat-tab ${isActive ? 'active' : ''}"
        data-category="${cat.id}"
        role="tab"
        aria-selected="${isActive ? 'true' : 'false'}"
        type="button"
      >
        <span>${escapeHtml(cat.label)}</span>
        <span class="cat-count">${count}</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.cat-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedCategory = btn.dataset.category;
      state.visibleLimit = PAGE_SIZE;
      renderAll();
    });
  });
}

function populateSourceDropdown() {
  const select = document.getElementById('source-filter');
  const sources = Array.from(new Set(state.jobs.map((j) => j.source).filter(Boolean))).sort();
  if (state.source !== 'all' && !sources.includes(state.source)) {
    state.source = 'all';
  }
  select.innerHTML =
    '<option value="all">All Sources</option>' +
    sources.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  select.value = state.source;
}

function renderSourcesHealth() {
  // Keep the main filter panel clean and noise-free (no raw 0-fetched/skipped debug chips)
  const container = document.getElementById('sources-health');
  if (container) container.innerHTML = '';
}

function resetAllFilters() {
  state.selectedCategory = 'all';
  state.workMode = 'all';
  state.search = '';
  state.jobType = 'all';
  state.source = 'all';
  state.status = 'active';
  state.sort = 'newest';
  state.visibleLimit = PAGE_SIZE;

  document.getElementById('search-input').value = '';
  document.getElementById('search-clear-btn').classList.add('hidden');
  document.getElementById('type-filter').value = 'all';
  document.getElementById('source-filter').value = 'all';
  document.getElementById('status-filter').value = 'active';
  document.getElementById('sort-select').value = 'newest';
  renderAll();
}

function renderJobs() {
  const skeleton = document.getElementById('loading-skeleton');
  const grid = document.getElementById('jobs-grid');
  const empty = document.getElementById('empty-state');
  const emptyResetBtn = document.getElementById('empty-reset-btn');
  const countEl = document.getElementById('results-count');
  const resetBtn = document.getElementById('reset-filters-btn');
  const loadMoreWrap = document.getElementById('load-more-wrap');
  const loadMoreBtn = document.getElementById('load-more-btn');

  skeleton.classList.toggle('hidden', !state.isLoading);
  if (state.isLoading) {
    grid.innerHTML = '';
    empty.classList.add('hidden');
    loadMoreWrap.classList.add('hidden');
    return;
  }

  const filtered = getFilteredJobs();
  const hasFilters =
    state.selectedCategory !== 'all' ||
    state.workMode !== 'all' ||
    state.search.trim() !== '' ||
    state.jobType !== 'all' ||
    state.source !== 'all' ||
    state.status !== 'active';

  resetBtn.classList.toggle('hidden', !hasFilters);

  const visibleSlice = filtered.slice(0, state.visibleLimit);
  countEl.textContent =
    filtered.length > visibleSlice.length
      ? `Showing ${visibleSlice.length} of ${filtered.length} matching jobs (${state.jobs.length} total tracked)`
      : `Showing ${filtered.length} of ${state.jobs.length} tracked Vadodara & Remote IT fresher jobs`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    loadMoreWrap.classList.add('hidden');
    empty.classList.remove('hidden');
    if (state.jobs.length > 0 && hasFilters) {
      document.getElementById('empty-title').textContent = 'No jobs match your current filters';
      document.getElementById('empty-desc').textContent =
        'Try clearing your search, switching back to "All Locations", or selecting "All Roles".';
      emptyResetBtn.classList.remove('hidden');
    } else {
      document.getElementById('empty-title').textContent = 'No jobs fetched yet';
      document.getElementById('empty-desc').innerHTML =
        'Click <strong>↻ Refresh Now</strong> or run <code>npm run fetch</code> to pull live Vadodara &amp; Remote IT fresher listings.';
      emptyResetBtn.classList.add('hidden');
    }
    return;
  }

  empty.classList.add('hidden');

  const catLookup = new Map(CATEGORIES.map((c) => [c.id, c]));

  grid.innerHTML = visibleSlice
    .map((job) => {
      const mark = getJobMark(job.id);
      const isNew = isWithin24Hours(job.discoveredAt);
      const href = safeHref(job.applyUrl);
      const badges = (job.categories || [])
        .map((id) => {
          const cat = catLookup.get(id);
          const color = cat ? cat.color : '#2563eb';
          const label = cat ? cat.label : id;
          return `<span class="role-badge" style="background:${color}14;color:${color};border-color:${color}38;">${escapeHtml(label)}</span>`;
        })
        .join('');

      const gd = getGlassdoorInfo(job);
      const gdLabel = gd.rating
        ? `${gd.rating}${gd.count ? ` (${gd.count})` : ''} Glassdoor`
        : gd.verifiedVia === 'glassdoor'
          ? 'Verified on Glassdoor'
          : 'Glassdoor Reviews';

      const websiteBadge =
        gd.verifiedVia === 'website' && gd.websiteUrl && gd.websiteUrl !== '#'
          ? `<a
               class="website-verified-pill"
               href="${escapeHtml(gd.websiteUrl)}"
               target="_blank"
               rel="noopener noreferrer"
               title="Verified live official company website &amp; physical office address"
             >✓ Live Site &amp; Address ↗</a>`
          : '';

      return `
        <article class="job-card ${mark.applied ? 'is-applied' : ''}">
          <div class="job-card-top">
            <div class="badges-wrap">
              ${badges}
              ${job.isRemote ? '<span class="remote-badge">🌍 Remote</span>' : ''}
            </div>
            ${isNew ? '<span class="new-badge">NEW</span>' : ''}
          </div>
          <h3 class="job-title">${escapeHtml(job.title)}</h3>
          <div class="job-company-row">
            <div class="job-company">${escapeHtml(job.company)}</div>
            <div class="company-badges">
              ${websiteBadge}
              <a
                class="glassdoor-pill"
                href="${escapeHtml(gd.url)}"
                target="_blank"
                rel="noopener noreferrer"
                title="Read ${escapeHtml(job.company)} reviews, ratings &amp; interview questions on Glassdoor"
              >
                <span class="glassdoor-star" aria-hidden="true">★</span>
                <span>${escapeHtml(gdLabel)} ↗</span>
              </a>
            </div>
          </div>
          <div class="job-meta">
            <span>📍 ${escapeHtml(job.location || 'Vadodara, Gujarat')}</span>
            <span>🎓 ${escapeHtml(job.experience || 'Entry Level')}</span>
            ${job.salary ? `<span>💰 ${escapeHtml(job.salary)}</span>` : ''}
            <span>🌐 ${escapeHtml(job.source)}</span>
            <span>🕒 ${escapeHtml(formatRelativeTime(job.discoveredAt))}</span>
          </div>
          ${job.snippet ? `<p class="job-snippet">${escapeHtml(job.snippet)}</p>` : ''}
          <div class="job-actions">
            <a class="apply-btn" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
              Apply Now ↗
            </a>
            <div class="action-group">
              <button class="mini-btn" data-copy="${escapeHtml(href)}" type="button" title="Copy application link">
                🔗
              </button>
              <button class="mini-btn ${mark.saved ? 'active-save' : ''}" data-action="saved" data-id="${escapeHtml(job.id)}" type="button">
                ${mark.saved ? '★ Saved' : '☆ Save'}
              </button>
              <button class="mini-btn ${mark.applied ? 'active-applied' : ''}" data-action="applied" data-id="${escapeHtml(job.id)}" type="button">
                ${mark.applied ? '✓ Applied' : 'Applied'}
              </button>
              <button class="mini-btn" data-expired="${escapeHtml(job.id)}" data-title="${escapeHtml(job.title)}" data-company="${escapeHtml(job.company)}" type="button" title="Remove permanently if not accepting applications">
                🚫 Expired
              </button>
              <button class="mini-btn" data-action="hidden" data-id="${escapeHtml(job.id)}" type="button" title="${mark.hidden ? 'Restore job' : 'Hide job'}">
                ${mark.hidden ? 'Unhide' : '✕'}
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  grid.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleJobMark(btn.dataset.id, btn.dataset.action);
    });
  });

  grid.querySelectorAll('button[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      copyApplyLink(btn.dataset.copy);
    });
  });

  grid.querySelectorAll('button[data-expired]').forEach((btn) => {
    btn.addEventListener('click', () => {
      reportExpiredJob(btn.dataset.expired, btn.dataset.title, btn.dataset.company);
    });
  });

  const remaining = filtered.length - visibleSlice.length;
  if (remaining > 0) {
    loadMoreWrap.classList.remove('hidden');
    loadMoreBtn.textContent = `Show More Jobs (${remaining} remaining)`;
  } else {
    loadMoreWrap.classList.add('hidden');
  }
}

function renderPortalsAndCompanies() {
  document.getElementById('quick-portals').innerHTML = QUICK_PORTALS.map(
    (p) => `
      <a class="portal-link" href="${escapeHtml(safeHref(p.url))}" target="_blank" rel="noopener noreferrer">
        <strong>${escapeHtml(p.name)} ↗</strong>
        <span>${escapeHtml(p.desc)}</span>
      </a>
    `
  ).join('');
}

const AREA_MATCHERS = {
  alkapuri: /alkapuri|race course|jetalpur|genda circle|dinesh mill/i,
  gotri: /gotri|sevasi/i,
  vasna: /vasna|bhayli/i,
  akota: /akota|subhanpura|ellora park/i,
  manjalpur: /manjalpur/i,
  waghodia: /waghodia|bapod|vip road/i,
  makarpura: /makarpura|maneja/i,
  atladara: /atladara|vadsar/i,
  karelibaug: /karelibaug|nizampura/i,
  fatehgunj: /fatehgunj|sayajigunj/i,
  gorwa: /gorwa|sarabhai|alembic/i,
};

function getFilteredCompanies() {
  const q = state.companySearch.trim().toLowerCase();
  const areaRx = state.companyArea !== 'all' ? AREA_MATCHERS[state.companyArea] : null;
  return state.companies.filter((c) => {
    if (state.companyTier !== 'all' && c.tier !== state.companyTier) return false;
    if (areaRx && !areaRx.test(`${c.area || ''} ${c.address || ''}`)) return false;
    if (q) {
      const hay = `${c.name} ${c.area} ${c.address} ${c.focus} ${c.fresherRoles} ${(c.techStack || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderVadodaraDirectory() {
  const grid = document.getElementById('vadodara-directory-grid');
  const countEl = document.getElementById('directory-count');
  const badgeEl = document.getElementById('directory-total-badge');
  const navCountEl = document.getElementById('nav-companies-count');
  const moreWrap = document.getElementById('directory-more-wrap');
  const moreBtn = document.getElementById('directory-more-btn');

  badgeEl.textContent = `${state.companies.length} Companies`;
  if (navCountEl) navCountEl.textContent = String(state.companies.length);
  document.querySelectorAll('#company-tier-pills .tier-pill').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tier === state.companyTier);
  });

  const filtered = getFilteredCompanies();
  const visible = filtered.slice(0, state.companyLimit);

  countEl.textContent =
    filtered.length > visible.length
      ? `Showing ${visible.length} of ${filtered.length} matching Vadodara IT companies (${state.companies.length} total)`
      : `Showing ${filtered.length} of ${state.companies.length} Vadodara IT companies`;

  if (filtered.length === 0) {
    grid.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1;"><p>No Vadodara IT companies match that search. Try searching "Alkapuri", "Gotri", "Python", "MERN", or "Numerator".</p></div>';
    moreWrap.classList.add('hidden');
    return;
  }

  grid.innerHTML = visible
    .map((c) => {
      const tierCls =
        c.tier === 'MNC / Enterprise' ? 'mnc' : c.tier === 'Mid-Size IT' ? 'mid' : 'small';
      const gdUrl = `https://www.glassdoor.co.in/Search/results.htm?keyword=${encodeURIComponent(c.name)}`;
      const liUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(c.name)}&location=Vadodara%2C%20Gujarat%2C%20India&f_E=1%2C2`;
      const stacksHtml = (c.techStack || [])
        .map((s) => `<span class="stack-chip">${escapeHtml(s)}</span>`)
        .join('');

      return `
        <article class="company-dir-card">
          <div class="dir-card-header">
            <h3 class="dir-company-name">${escapeHtml(c.name)}</h3>
            <span class="tier-badge ${tierCls}">${escapeHtml(c.tier)}</span>
          </div>
          <p class="dir-focus">${escapeHtml(c.focus)}</p>
          <div class="dir-meta">
            <span>📍 ${escapeHtml(c.address || c.area)}</span>
          </div>
          <div class="dir-fresher-roles">
            <strong>🎓 Fresher / Intern Roles:</strong> ${escapeHtml(c.fresherRoles)}
          </div>
          <div class="dir-stacks">${stacksHtml}</div>
          <div class="dir-actions">
            <a class="dir-careers-btn" href="${escapeHtml(safeHref(c.careersUrl))}" target="_blank" rel="noopener noreferrer">
              Careers Page ↗
            </a>
            <a class="dir-secondary-link" href="${escapeHtml(gdUrl)}" target="_blank" rel="noopener noreferrer">
              ★ Glassdoor ↗
            </a>
            <a class="dir-secondary-link" href="${escapeHtml(liUrl)}" target="_blank" rel="noopener noreferrer">
              LinkedIn Jobs ↗
            </a>
          </div>
        </article>
      `;
    })
    .join('');

  const remaining = filtered.length - visible.length;
  if (remaining > 0) {
    moreWrap.classList.remove('hidden');
    moreBtn.textContent = `Show More Companies (${remaining} more)`;
  } else {
    moreWrap.classList.add('hidden');
  }
}

async function fetchVadodaraDirectory() {
  try {
    const res = await fetch(`./data/vadodara-companies.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.companies = Array.isArray(data.companies) ? data.companies : [];
  } catch (err) {
    console.error('Failed to load vadodara-companies.json:', err);
    state.companies = [];
  }
  renderVadodaraDirectory();
}

function renderAll() {
  renderSubscriberBar();
  renderStats();
  renderCategoryTabs();
  renderWorkModePills();
  renderSourcesHealth();
  renderJobs();
}

/* ======================== Dynamic Live Sync (60s + SSE) ======================== */

function renderLiveSyncIndicator() {
  const pill = document.getElementById('live-sync-pill');
  const textEl = document.getElementById('live-sync-text');
  const refreshBtn = document.getElementById('refresh-now-btn');

  if (!state.sync) {
    pill.classList.remove('scanning');
    textEl.textContent = 'Auto-refresh: 60s';
    refreshBtn.disabled = false;
    refreshBtn.textContent = '↻ Refresh Now';
    return;
  }

  if (state.sync.isFetching) {
    pill.classList.add('scanning');
    textEl.textContent = 'Scanning live jobs...';
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Scanning...';
    return;
  }

  pill.classList.remove('scanning');
  refreshBtn.disabled = false;
  refreshBtn.textContent = '↻ Refresh Now';

  if (state.sync.nextFetchAt) {
    const secs = Math.max(0, Math.ceil((Date.parse(state.sync.nextFetchAt) - Date.now()) / 1000));
    textEl.textContent = secs > 0 ? `Live • Next scan in ${secs}s` : 'Live • Scanning soon...';
  } else {
    textEl.textContent = 'Live • Auto-sync ready';
  }
}

async function fetchLatestData({ silent = true } = {}) {
  try {
    let res = await fetch(`${API_BASE}/api/jobs?t=${Date.now()}`);
    let isApi = res.ok;
    if (!isApi) {
      res = await fetch(`./data/jobs.json?t=${Date.now()}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const prevIds = new Set(state.jobs.map((j) => j.id));
    state.hasBackendApi = isApi;
    state.isLoading = false;
    state.jobs = Array.isArray(data.jobs) ? data.jobs : [];
    state.meta = data.meta || {};
    if (data.sync) state.sync = data.sync;

    populateSourceDropdown();
    renderAll();
    renderLiveSyncIndicator();

    const newlyArrived = state.jobs.filter((j) => !prevIds.has(j.id)).length;
    if (!silent && prevIds.size > 0 && newlyArrived > 0) {
      showToast(`Found ${newlyArrived} new IT fresher job${newlyArrived === 1 ? '' : 's'}!`, 'success');
    }
    return isApi;
  } catch (err) {
    state.isLoading = false;
    renderAll();
    console.error('Failed to load jobs:', err);
    return false;
  }
}

async function handleManualRefresh() {
  const btn = document.getElementById('refresh-now-btn');
  btn.disabled = true;
  btn.textContent = 'Scanning...';

  try {
    const res = await fetch(`${API_BASE}/api/refresh`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Could not start live scan.');
    }
    if (Array.isArray(data.jobs)) {
      state.jobs = data.jobs;
      if (data.meta) state.meta = data.meta;
      populateSourceDropdown();
      renderAll();
      btn.disabled = false;
      btn.textContent = '↻ Refresh Now';
    }
    if (data.sync) state.sync = data.sync;
    renderLiveSyncIndicator();
    showToast(data.message || 'Scanning for fresh Vadodara & Remote IT jobs...', data.newCount > 0 ? 'success' : 'info');
  } catch {
    await fetchLatestData({ silent: false });
    btn.disabled = false;
    btn.textContent = '↻ Refresh Now';
  }
}

function connectLiveStream() {
  setInterval(renderLiveSyncIndicator, 1000);

  if (state.hasBackendApi && state.sync?.platform !== 'vercel' && typeof EventSource !== 'undefined') {
    const es = new EventSource(`${API_BASE}/api/events`);

    es.addEventListener('sync-status', (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        if (payload.sync) {
          state.sync = payload.sync;
          renderLiveSyncIndicator();
        }
      } catch {
        // ignore malformed event
      }
    });

    es.addEventListener('jobs-updated', (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        state.isLoading = false;
        state.jobs = Array.isArray(payload.jobs) ? payload.jobs : state.jobs;
        state.meta = payload.meta || state.meta;
        state.sync = payload.sync || state.sync;
        populateSourceDropdown();
        renderAll();
        renderLiveSyncIndicator();
        if (payload.newCount > 0) {
          showToast(
            `${payload.newCount} brand-new Vadodara/Remote IT fresher job${payload.newCount === 1 ? '' : 's'} arrived!`,
            'success'
          );
        }
      } catch {
        // ignore malformed event
      }
    });
  }

  // Backup 60-second poll so static hosting & waking tabs always stay synced
  setInterval(() => {
    fetchLatestData({ silent: false });
  }, 60000);
}

function bindEvents() {
  document.getElementById('refresh-now-btn').addEventListener('click', handleManualRefresh);
  document.getElementById('gmail-form').addEventListener('submit', handleSubscribeSubmit);
  document.getElementById('open-gmail-modal-btn').addEventListener('click', openGmailModal);
  document.getElementById('banner-enable-btn').addEventListener('click', openGmailModal);
  document.getElementById('banner-dismiss-btn').addEventListener('click', () => {
    localStorage.setItem(SKIPPED_KEY, '1');
    renderSubscriberBar();
  });
  document.getElementById('edit-sub-btn').addEventListener('click', openGmailModal);
  document.getElementById('toggle-updates-btn').addEventListener('click', handleToggleUpdates);
  document.getElementById('send-now-btn').addEventListener('click', handleSendNow);
  document.getElementById('modal-unsub-btn').addEventListener('click', handleUnsubscribe);
  document.getElementById('modal-close-x').addEventListener('click', closeGmailModal);
  document.getElementById('modal-skip-btn').addEventListener('click', () => {
    localStorage.setItem(SKIPPED_KEY, '1');
    closeGmailModal();
    renderSubscriberBar();
  });
  document.getElementById('gmail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'gmail-modal') closeGmailModal();
  });

  // Keyboard shortcuts: Escape closes modal, '/' focuses search
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeGmailModal();
      return;
    }
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (e.key === '/' && tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
      e.preventDefault();
      document.getElementById('search-input').focus();
    }
  });

  // Clickable stat cards as instant filter shortcuts
  document.querySelectorAll('.stat-card[data-stat-filter]').forEach((card) => {
    card.addEventListener('click', () => {
      const f = card.dataset.statFilter;
      state.visibleLimit = PAGE_SIZE;
      if (f === 'all') {
        state.workMode = 'all';
        state.status = 'active';
      } else if (f === 'vadodara') {
        state.workMode = 'vadodara';
        state.status = 'active';
      } else if (f === 'remote') {
        state.workMode = 'remote';
        state.status = 'active';
      } else if (f === 'saved') {
        state.workMode = 'all';
        state.status = 'saved';
      } else if (f === 'applied') {
        state.workMode = 'all';
        state.status = 'applied';
      }
      document.getElementById('status-filter').value = state.status;
      renderAll();
    });
  });

  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    state.visibleLimit = PAGE_SIZE;
    clearBtn.classList.toggle('hidden', state.search.length === 0);
    renderJobs();
  });
  clearBtn.addEventListener('click', () => {
    state.search = '';
    searchInput.value = '';
    clearBtn.classList.add('hidden');
    state.visibleLimit = PAGE_SIZE;
    renderJobs();
    searchInput.focus();
  });

  document.getElementById('type-filter').addEventListener('change', (e) => {
    state.jobType = e.target.value;
    state.visibleLimit = PAGE_SIZE;
    renderJobs();
  });
  document.getElementById('source-filter').addEventListener('change', (e) => {
    state.source = e.target.value;
    state.visibleLimit = PAGE_SIZE;
    renderJobs();
  });
  document.getElementById('status-filter').addEventListener('change', (e) => {
    state.status = e.target.value;
    state.visibleLimit = PAGE_SIZE;
    renderAll();
  });
  document.getElementById('sort-select').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderJobs();
  });

  document.querySelectorAll('#workmode-pills .mode-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.workMode = btn.dataset.mode;
      state.visibleLimit = PAGE_SIZE;
      renderAll();
    });
  });

  document.getElementById('reset-filters-btn').addEventListener('click', resetAllFilters);
  document.getElementById('empty-reset-btn').addEventListener('click', resetAllFilters);
  document.getElementById('load-more-btn').addEventListener('click', () => {
    state.visibleLimit += PAGE_SIZE;
    renderJobs();
  });

  // Vadodara IT Companies Directory controls
  document.getElementById('company-search-input').addEventListener('input', (e) => {
    state.companySearch = e.target.value;
    state.companyLimit = 12;
    renderVadodaraDirectory();
  });
  document.getElementById('company-area-filter').addEventListener('change', (e) => {
    state.companyArea = e.target.value;
    state.companyLimit = 12;
    renderVadodaraDirectory();
  });
  document.querySelectorAll('#company-tier-pills .tier-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.companyTier = btn.dataset.tier;
      state.companyLimit = 12;
      renderVadodaraDirectory();
    });
  });
  document.getElementById('directory-more-btn').addEventListener('click', () => {
    state.companyLimit += 24;
    renderVadodaraDirectory();
  });

  // Back to top button visibility
  const topBtn = document.getElementById('back-to-top');
  window.addEventListener(
    'scroll',
    () => {
      topBtn.classList.toggle('hidden', window.scrollY < 420);
    },
    { passive: true }
  );
  topBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

async function init() {
  bindEvents();
  renderPortalsAndCompanies();

  await Promise.all([fetchLatestData({ silent: true }), fetchVadodaraDirectory()]);
  connectLiveStream();
}

init();
