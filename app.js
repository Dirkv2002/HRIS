/* ===========================================
   COMMUNICARE HRIS — app.js  (v11 - FINAL)
=========================================== */

const SUPABASE_URL  = 'https://llryoespqzykaqawhwob.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxscnlvZXNwcXp5a2FxYXdod29iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODg3MTcsImV4cCI6MjA5NjA2NDcxN30.P5tL7TA-VB9EkCSThwE2jIExxya8VYvs2SjU9pCrmQY';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ===========================================
   GLOBAL STATE
=========================================== */
let currentUser              = null;
let currentProfile           = null;
let userRole                 = 'candidate';
let slotsData                = [];
let vacanciesData            = [];
let competencyFiles          = {};
let currentVacancyId         = null;
let currentCompJob           = null;
let pendingOnboardingSlotId  = null;
let applyAnswers             = {};
let applyCVFile              = null;
let allAvailability          = [];
let myAvailability           = new Set();
let shortlistDraft           = {};
let pendingAssignDocId       = null;
let pendingAdminAssessFile   = null;
let pendingAdminAssessTarget = null;
let currentSignDocId         = null;
let currentSignAssigneeId    = null;
let currentSignDocUrl        = null;
let teamColours              = ['#00aeef','#9a258f','#b2d33e','#faa61a','#ef4444','#8b5cf6','#06b6d4','#f97316'];
let signatureCanvas          = null;
let signatureCtx             = null;
let isDrawing                = false;
let placedSignatures         = [];
let currentSignatureData     = null;
let currentSignatureType     = null;
let statsCurrentPeriod       = 'all';
let currentBookingVacancyId  = null;
let awaitingPlacement        = false;
let isResizing               = false;
let resizeStartSize          = 40;
let resizeStartY             = 0;
let pendingUploadDocFileObj  = null;
let currentSignDocRetrieved  = false;
let currentSignAlreadySigned = false;
let editingAccountId         = null;
let signPollInterval         = null;

const departmentsData = {
  'Human Capital':                        ['HR Business Partner','Talent Acquisition Specialist','Learning & Development Manager','Compensation & Benefits Analyst','Employee Relations Officer'],
  'Marketing and Communications':         ['Brand Manager','Digital Marketing Specialist','Content Strategist','PR Coordinator','Social Media Manager'],
  'Information Technology':               ['Software Engineer','Systems Administrator','Data Analyst','Cybersecurity Specialist','IT Project Manager','DevOps Engineer'],
  'Asset Management':                     ['Portfolio Manager','Asset Analyst','Risk Officer','Investment Associate','Fund Accountant'],
  'Finance':                              ['Financial Accountant','Management Accountant','Treasury Analyst','Accounts Payable Clerk','Finance Manager'],
  'Property Development and Investments': ['Property Development Manager','Leasing Consultant','Valuations Analyst','Project Manager','Property Administrator'],
  'Facilities Management':               ['Facilities Manager','Maintenance Coordinator','Health & Safety Officer','Cleaning Supervisor','Security Manager']
};

/* ===========================================
   BOOT
=========================================== */
document.addEventListener('DOMContentLoaded', () => {
  (async function handlePasswordResetOnLoad() {
    const hash   = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', '?'));
    const type   = params.get('type');
    const token  = params.get('access_token');
    if (type === 'recovery' && token) {
      await db.auth.setSession({ access_token: token, refresh_token: params.get('refresh_token') || '' });
      history.replaceState(null, '', window.location.pathname);
      const modal = document.getElementById('resetPasswordModal');
      if (modal) {
        modal.style.display = 'flex';
        document.getElementById('authScreen').classList.add('hidden');
        document.getElementById('appScreen').classList.add('hidden');
      }
    }
  })();

  db.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
      currentUser = session.user;
      await loadProfile(currentUser.id);
      showApp();
    } else {
      currentUser = null; currentProfile = null;
      showAuth();
    }
  });
});

/* ===========================================
   AUTH
=========================================== */
function showAuth() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('appScreen').classList.add('hidden');
  document.body.className = '';
}

function showApp() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  buildSidebar();
  populateDashboard();
  renderDepts();
  renderVacancies();
  renderScreeningDepts();
  showDefaultTab();
}

function switchAuthTab(tab) {
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('signupForm').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabSignup').classList.toggle('active', tab === 'signup');
  clearAuthMessage();
}

async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn      = document.getElementById('loginBtn');
  setButtonLoading(btn, true);
  await db.auth.signOut();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  setButtonLoading(btn, false, '<i class="ti ti-login"></i> Sign In');
  if (error) { showAuthMessage(error.message, 'error'); return; }
  if (data.user) {
    const { data: profile } = await db.from('profiles').select('role,email').eq('id', data.user.id).single();
    if (profile) console.log(`Logged in: ${profile.email} — Role: ${profile.role}`);
  }
}

function handleRoleChange() {
  const role      = document.getElementById('signupRole')?.value || '';
  const deptGroup = document.getElementById('signupDeptGroup');
  if (!deptGroup) return;
  if (role === 'manager' || role === 'employee' || role === 'admin') {
    deptGroup.classList.remove('hidden');
  } else {
    deptGroup.classList.add('hidden');
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const firstName   = document.getElementById('signupFirst')?.value?.trim()    || '';
  const lastName    = document.getElementById('signupLast')?.value?.trim()     || '';
  const email       = document.getElementById('signupEmail')?.value?.trim()    || '';
  const role        = document.getElementById('signupRole')?.value             || '';
  const password    = document.getElementById('signupPassword')?.value         || '';
  const confirmPw   = document.getElementById('signupConfirmPassword')?.value  || '';
  const deptGroup   = document.getElementById('signupDeptGroup');
  const deptVisible = deptGroup && !deptGroup.classList.contains('hidden');
  const dept        = deptVisible ? (document.getElementById('signupDept')?.value || '') : '';
  const btn         = document.getElementById('signupBtn');

  if (!firstName)             { showAuthMessage('Please enter your first name.', 'error'); return; }
  if (!lastName)              { showAuthMessage('Please enter your last name.', 'error'); return; }
  if (!email)                 { showAuthMessage('Please enter your email address.', 'error'); return; }
  if (!role)                  { showAuthMessage('Please select your role.', 'error'); return; }
  if (password.length < 6)    { showAuthMessage('Password must be at least 6 characters.', 'error'); return; }
  if (password !== confirmPw) { showAuthMessage('Passwords do not match.', 'error'); return; }
  if ((role === 'manager' || role === 'employee' || role === 'admin') && !dept) {
    showAuthMessage('Please select your department.', 'error'); return;
  }

  setButtonLoading(btn, true);
  const { data, error } = await db.auth.signUp({
    email, password,
    options: { data: { first_name: firstName, last_name: lastName, role, department: dept } }
  });

  if (error) {
    setButtonLoading(btn, false, '<i class="ti ti-user-plus"></i> Create Account');
    showAuthMessage(error.message, 'error');
    return;
  }

  if (data.user) {
    await db.from('profiles').upsert({
      id: data.user.id, email, first_name: firstName, last_name: lastName,
      role, department: dept, status: 'reviewing', created_at: new Date().toISOString()
    });
  }

  setButtonLoading(btn, false, '<i class="ti ti-user-plus"></i> Create Account');
  showAuthMessage('Account created! You can now sign in.', 'success');
  document.getElementById('signupFirst').value           = '';
  document.getElementById('signupLast').value            = '';
  document.getElementById('signupEmail').value           = '';
  document.getElementById('signupRole').value            = '';
  document.getElementById('signupPassword').value        = '';
  document.getElementById('signupConfirmPassword').value = '';
  if (deptGroup) deptGroup.classList.add('hidden');
}

async function handleLogout() { await db.auth.signOut(); }

async function showForgotPassword() {
  const email = prompt('Enter your email address:');
  if (!email) return;
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: 'https://dirkv2002.github.io/HRIS/' });
  alert(error ? 'Error: ' + error.message : 'Reset email sent! Check your inbox.');
}

async function submitNewPassword() {
  const newPw     = document.getElementById('newPasswordInput').value;
  const confirmPw = document.getElementById('confirmPasswordInput').value;
  const msg       = document.getElementById('resetPasswordMsg');
  if (newPw.length < 6)    { msg.textContent = 'Password must be at least 6 characters.'; msg.style.display = 'block'; return; }
  if (newPw !== confirmPw) { msg.textContent = 'Passwords do not match.'; msg.style.display = 'block'; return; }
  const { error } = await db.auth.updateUser({ password: newPw });
  if (error) { msg.textContent = 'Error: ' + error.message; msg.style.display = 'block'; return; }
  document.getElementById('resetPasswordModal').style.display = 'none';
  await db.auth.signOut();
  showToast('Password updated! Please sign in.');
}

/* ===========================================
   LOAD PROFILE
=========================================== */
async function loadProfile(userId) {
  const { data, error } = await db.from('profiles').select('*').eq('id', userId).single();
  if (error || !data) {
    const meta = currentUser.user_metadata || {};
    currentProfile = {
      id: userId, email: currentUser.email,
      first_name: meta.first_name || '', last_name: meta.last_name || '',
      role: meta.role || 'candidate', department: meta.department || '', status: 'reviewing'
    };
    await db.from('profiles').upsert({ ...currentProfile, created_at: new Date().toISOString() });
  } else {
    currentProfile = data;
  }
  userRole = currentProfile.role || 'candidate';
  document.body.className = userRole + '-mode';
  updateRoleBadge();
}

async function reloadProfile() {
  const { data } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
  if (data) currentProfile = data;
}

/* ===========================================
   SIDEBAR
=========================================== */
const navConfig = {
  admin: [
    { section: 'Main' },
    { id: 'dashboard',   icon: 'ti-layout-dashboard', label: 'Dashboard' },
    { section: 'Recruitment' },
    { id: 'manage',      icon: 'ti-settings',          label: 'Manage Vacancies' },
    { id: 'screening',   icon: 'ti-clipboard-list',    label: 'Screening' },
    { id: 'competency',  icon: 'ti-folder-open',       label: 'Competency' },
    { id: 'assessments', icon: 'ti-brain',             label: 'Assessments' },
    { id: 'progress',    icon: 'ti-timeline',          label: 'Progress' },
    { id: 'bookings',    icon: 'ti-calendar-event',    label: 'Bookings' },
    { section: 'Documents' },
    { id: 'sign',        icon: 'ti-signature',         label: 'Sign' },
    { section: 'Insights' },
    { id: 'stats',       icon: 'ti-chart-bar',         label: 'Stats' }
  ],
  manager: [
    { section: 'Main' },
    { id: 'dashboard',     icon: 'ti-layout-dashboard', label: 'Dashboard' },
    { section: 'HR Tools' },
    { id: 'manager-apply', icon: 'ti-star',             label: 'Shortlists' },
    { id: 'screening',     icon: 'ti-clipboard-list',   label: 'Screening' },
    { id: 'competency',    icon: 'ti-folder-open',      label: 'Competency' },
    { section: 'Bookings' },
    { id: 'bookings',      icon: 'ti-calendar-event',   label: 'Bookings' },
    { section: 'Documents' },
    { id: 'sign',          icon: 'ti-signature',        label: 'Sign' }
  ],
  employee: [
    { section: 'Main' },
    { id: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
    { section: 'Bookings' },
    { id: 'bookings',  icon: 'ti-calendar-event',   label: 'Bookings' },
    { section: 'Documents' },
    { id: 'sign',      icon: 'ti-signature',        label: 'Sign' }
  ],
  candidate: [
    { section: 'Main' },
    { id: 'dashboard',   icon: 'ti-layout-dashboard', label: 'Dashboard' },
    { section: 'Recruitment' },
    { id: 'apply',       icon: 'ti-send',             label: 'Apply' },
    { id: 'assessments', icon: 'ti-brain',            label: 'Assessments' },
    { id: 'progress',    icon: 'ti-timeline',         label: 'Progress' },
    { id: 'bookings',    icon: 'ti-calendar-event',   label: 'Bookings' }
  ]
};

function buildSidebar() {
  const nav   = document.getElementById('sidebarNav');
  const items = navConfig[userRole] || navConfig.candidate;
  nav.innerHTML = '';
  items.forEach(item => {
    if (item.section) {
      const sec = document.createElement('div');
      sec.className = 'nav-section'; sec.textContent = item.section;
      nav.appendChild(sec);
    } else {
      const el = document.createElement('div');
      el.className = 'nav-item'; el.id = 'nav-' + item.id;
      el.innerHTML = `<i class="ti ${item.icon}"></i> ${item.label}`;
      el.addEventListener('click', () => showTab(item.id, el));
      nav.appendChild(el);
    }
  });
}

function showDefaultTab() {
  const first = (navConfig[userRole] || navConfig.candidate).find(i => i.id);
  if (first) { const el = document.getElementById('nav-' + first.id); if (el) showTab(first.id, el); }
}

function showTab(id, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const tab = document.getElementById('tab-' + id);
  if (tab) tab.classList.add('active');
  if (el)  el.classList.add('active');
  if (id === 'dashboard')     populateDashboard();
  if (id === 'bookings')      renderBookingTabs();
  if (id === 'competency')    renderDepts();
  if (id === 'apply')         renderVacancies();
  if (id === 'manager-apply') renderManagerShortlists();
  if (id === 'stats')         renderStats();
  if (id === 'progress')      renderProgress();
  if (id === 'manage')        renderAdminVacancies();
  if (id === 'screening')     renderScreeningDepts();
  if (id === 'sign')          renderSignTab();
  if (id === 'assessments')   renderAssessmentsTab();
}

function updateRoleBadge() {
  const badge  = document.getElementById('roleBadge');
  const labels = { admin: 'ADMIN', manager: 'MANAGER', candidate: 'CANDIDATE', employee: 'EMPLOYEE' };
  badge.textContent = labels[userRole] || 'CANDIDATE';
  badge.className   = 'role-badge ' + userRole;
}

/* ===========================================
   DASHBOARD
=========================================== */
function populateDashboard() {
  if (!currentProfile) return;
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim() || currentProfile.email;
  const initials = getInitials(fullName);
  const status   = currentProfile.status || 'reviewing';

  document.getElementById('sidebarName').textContent  = fullName;
  document.getElementById('sidebarEmail').textContent = currentProfile.email || '';
  document.getElementById('profileName').textContent  = fullName;

  const roleLabel = { admin: 'HR Administrator', manager: 'Manager', employee: 'Employee', candidate: 'Candidate' }[userRole] || 'User';
  document.getElementById('profileSub').textContent = `${roleLabel} · ${currentProfile.email}`;

  document.getElementById('infoName').textContent        = fullName;
  document.getElementById('infoEmail').textContent       = currentProfile.email       || '—';
  document.getElementById('infoPhone').textContent       = currentProfile.phone       || '—';
  document.getElementById('infoId').textContent          = currentProfile.id_number   || '—';
  document.getElementById('infoLocation').textContent    = currentProfile.location    || '—';
  document.getElementById('infoNationality').textContent = currentProfile.nationality || '—';

  if (currentProfile.avatar_url) {
    setAvatarImage(currentProfile.avatar_url + '?t=' + Date.now());
  } else {
    const c = document.getElementById('avatarCircle');
    const s = document.getElementById('sidebarAvatarText');
    if (c) c.textContent = initials;
    if (s) s.textContent = initials;
  }

  const statusWrap = document.getElementById('dashStatusBadge');
  if (statusWrap) {
    if (userRole === 'candidate') {
      statusWrap.style.display = '';
      applyStatus(status);
      checkForStatusChangeNotification(status);
    } else {
      statusWrap.style.display = 'none';
    }
  }

  const cvSection = document.getElementById('cvUploadSection');
  if (cvSection) cvSection.style.display = userRole === 'candidate' ? 'block' : 'none';

  // FIX: Account Management only for admin
  const acctSection = document.getElementById('accountManagementSection');
  if (acctSection) acctSection.style.display = userRole === 'admin' ? 'block' : 'none';

  const stepDate0 = document.getElementById('stepDate0');
  if (stepDate0 && currentProfile.created_at) {
    stepDate0.textContent = new Date(currentProfile.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  }

  renderDashboardRightCard();
  if (userRole === 'admin') renderAccountManagement();
}

async function renderDashboardRightCard() {
  const card = document.getElementById('dashboardRightCard');
  if (!card) return;

  if (userRole === 'candidate') {
    const { data: apps } = await db.from('applications').select('*').eq('user_id', currentUser.id).order('submitted_at', { ascending: false });
    const list = apps || [];
    card.innerHTML = `
      <div class="card-title accent-blue"><i class="ti ti-history"></i> Application History</div>
      ${list.length === 0
        ? `<div class="app-history-empty"><i class="ti ti-inbox"></i>No applications yet.</div>`
        : list.map(a => {
            const cfg = statusConfig[a.status] || statusConfig.reviewing;
            return `<div class="app-history-item">
              <div>
                <div class="app-history-title">${escapeHtml(a.vacancy_title || '—')}</div>
                <div class="app-history-meta">${a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} · Score: ${a.score}%</div>
              </div>
              <span class="status-badge ${cfg.cls}" style="font-size:10px;margin:0">${cfg.label}</span>
            </div>`;
          }).join('')
      }`;
    return;
  }

  const deptJobs = currentProfile.department ? (departmentsData[currentProfile.department] || []) : getAllJobTitles();
  card.innerHTML = `
    <div class="card-title accent-blue"><i class="ti ti-briefcase"></i> Job Information</div>
    <div class="info-row"><span class="key">Job Title</span><span class="val">${escapeHtml(currentProfile.job_title || '—')}</span></div>
    <div class="info-row"><span class="key">Department</span><span class="val">${escapeHtml(currentProfile.department || '—')}</span></div>
    <div class="info-row"><span class="key">Reference No.</span><span class="val">${escapeHtml(currentProfile.job_ref || '—')}</span></div>
    <div class="info-row"><span class="key">Date Joined</span><span class="val">${currentProfile.created_at ? new Date(currentProfile.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</span></div>
    <div style="margin-top:10px">
      <div class="info-label" style="margin-bottom:6px">Job Description</div>
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.7">${escapeHtml(currentProfile.job_description || '—')}</div>
    </div>
    <div style="margin-top:14px">
      <button class="btn btn-secondary" onclick="toggleEditJob()"><i class="ti ti-edit"></i> Edit Job Info</button>
      <div id="editJobForm" class="hidden" style="margin-top:16px">
        <div class="grid-2">
          <div class="form-group">
            <label>Department</label>
            <select id="editJobDept" onchange="updateJobTitleDropdown()">
              <option value="">— Select Department —</option>
              ${Object.keys(departmentsData).map(d => `<option ${currentProfile.department === d ? 'selected' : ''}>${escapeHtml(d)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Job Title</label>
            <select id="editJobTitle">
              <option value="">— Select Job Title —</option>
              ${deptJobs.map(j => `<option ${currentProfile.job_title === j ? 'selected' : ''}>${escapeHtml(j)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Reference No.</label><input type="text" id="editJobRef" value="${escapeHtml(currentProfile.job_ref || '')}"/></div>
        </div>
        <div class="form-group"><label>Job Description</label><textarea id="editJobDesc" rows="3">${escapeHtml(currentProfile.job_description || '')}</textarea></div>
        <button class="btn btn-primary" onclick="saveJobInfo()"><i class="ti ti-check"></i> Save</button>
        <button class="btn btn-secondary" onclick="toggleEditJob()" style="margin-left:8px">Cancel</button>
      </div>
    </div>`;
}

function getAllJobTitles() {
  const all = [];
  Object.values(departmentsData).forEach(jobs => all.push(...jobs));
  return all;
}

function updateJobTitleDropdown() {
  const dept = document.getElementById('editJobDept')?.value;
  const sel  = document.getElementById('editJobTitle');
  if (!sel) return;
  const jobs = dept ? (departmentsData[dept] || []) : getAllJobTitles();
  sel.innerHTML = '<option value="">— Select Job Title —</option>' +
    jobs.map(j => `<option ${currentProfile.job_title === j ? 'selected' : ''}>${escapeHtml(j)}</option>`).join('');
}

function toggleEditPersonal() {
  const form   = document.getElementById('editPersonalForm');
  const hidden = form.classList.contains('hidden');
  form.classList.toggle('hidden');
  if (hidden) {
    document.getElementById('editPhone').value       = currentProfile.phone       || '';
    document.getElementById('editIdNum').value       = currentProfile.id_number   || '';
    document.getElementById('editLocation').value    = currentProfile.location    || '';
    document.getElementById('editNationality').value = currentProfile.nationality || '';
  }
}

async function savePersonalInfo() {
  const updates = {
    phone:       document.getElementById('editPhone').value.trim(),
    id_number:   document.getElementById('editIdNum').value.trim(),
    location:    document.getElementById('editLocation').value.trim(),
    nationality: document.getElementById('editNationality').value.trim()
  };
  const { error } = await db.from('profiles').update(updates).eq('id', currentUser.id);
  if (error) { alert('Could not save: ' + error.message); return; }
  await reloadProfile(); populateDashboard();
  document.getElementById('editPersonalForm').classList.add('hidden');
  showToast('Personal information updated.');
}

function toggleEditJob() {
  const form = document.getElementById('editJobForm');
  if (form) form.classList.toggle('hidden');
}

async function saveJobInfo() {
  const dept  = document.getElementById('editJobDept')?.value  || '';
  const title = document.getElementById('editJobTitle')?.value || '';
  const ref   = document.getElementById('editJobRef')?.value.trim()  || '';
  const desc  = document.getElementById('editJobDesc')?.value.trim() || '';
  const { error } = await db.from('profiles').update({ department: dept, job_title: title, job_ref: ref, job_description: desc }).eq('id', currentUser.id);
  if (error) { alert('Could not save: ' + error.message); return; }
  await reloadProfile(); renderDashboardRightCard(); toggleEditJob();
  showToast('Job information updated.');
}

/* ===========================================
   ACCOUNT MANAGEMENT (Admin only)
=========================================== */
async function renderAccountManagement() {
  const section = document.getElementById('accountManagementSection');
  const list    = document.getElementById('accountManagementList');
  if (!section || !list) return;
  if (userRole !== 'admin') { section.style.display = 'none'; return; }
  section.style.display = 'block';

  const { data: profiles } = await db.from('profiles').select('*').order('role').order('first_name');
  if (!profiles || profiles.length === 0) { list.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No accounts found.</p>'; return; }

  const roleColour = { admin: 'var(--brand)', manager: 'var(--accent-yellow)', employee: 'var(--accent-purple)', candidate: 'var(--accent-green)' };

  list.innerHTML = profiles.map(p => {
    const fullName = `${p.first_name} ${p.last_name}`.trim() || p.email;
    const isSelf   = p.id === currentUser.id;
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);gap:12px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="applicant-avatar" style="background:${roleColour[p.role] || 'var(--brand)'}20;color:${roleColour[p.role] || 'var(--brand)'}">
            ${getInitials(fullName)}
          </div>
          <div>
            <div style="font-size:13px;font-weight:600">${escapeHtml(fullName)} ${isSelf ? '<span style="font-size:10px;color:var(--text-muted)">(you)</span>' : ''}</div>
            <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(p.email)}</div>
            <div style="font-size:11px;color:${roleColour[p.role] || 'var(--brand)'};font-weight:600;margin-top:2px">${(p.role || '').toUpperCase()}${p.department ? ' · ' + p.department : ''}</div>
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="openEditAccount('${p.id}')"><i class="ti ti-edit"></i> Edit</button>
          ${!isSelf ? `<button class="btn btn-danger btn-sm" onclick="deleteAccount('${p.id}','${escapeHtml(fullName)}')"><i class="ti ti-trash"></i> Delete</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

async function openEditAccount(profileId) {
  const { data: p } = await db.from('profiles').select('*').eq('id', profileId).single();
  if (!p) return;
  editingAccountId = profileId;
  document.getElementById('editAccFirst').value = p.first_name || '';
  document.getElementById('editAccLast').value  = p.last_name  || '';
  document.getElementById('editAccRole').value  = p.role       || 'candidate';
  document.getElementById('editAccDept').value  = p.department || '';
  document.getElementById('editAccountModal').classList.add('open');
}

async function saveEditAccount() {
  if (!editingAccountId) return;
  const first = document.getElementById('editAccFirst').value.trim();
  const last  = document.getElementById('editAccLast').value.trim();
  const role  = document.getElementById('editAccRole').value;
  const dept  = document.getElementById('editAccDept').value;
  const { error } = await db.from('profiles').update({ first_name: first, last_name: last, role, department: dept }).eq('id', editingAccountId);
  if (error) { alert('Could not save: ' + error.message); return; }
  closeModal('editAccountModal');
  showToast('Account updated.');
  await renderAccountManagement();
}

async function deleteAccount(profileId, fullName) {
  if (!confirm(`Permanently delete the account for ${fullName}? This cannot be undone.`)) return;
  const { error } = await db.rpc('delete_user_account', { user_id: profileId });
  if (error) {
    const { data: prof } = await db.from('profiles').select('email').eq('id', profileId).single();
    const email = prof?.email || '';
    await Promise.all([
      db.from('candidate_assessments').delete().eq('candidate_id', profileId),
      db.from('document_signatures').delete().eq('signer_id', profileId),
      db.from('document_assignees').delete().eq('manager_id', profileId),
      db.from('team_availability').delete().eq('user_id', profileId),
      db.from('manager_reviews').delete().eq('manager_id', profileId),
      db.from('applications').delete().eq('user_id', profileId),
      db.from('applications').delete().eq('candidate_email', email),
      db.from('shortlists').delete().eq('candidate_email', email),
    ]);
    await db.from('profiles').delete().eq('id', profileId);
    showToast(`${fullName} removed.`, 'info');
  } else {
    showToast(`${fullName} fully deleted.`);
  }
  setTimeout(async () => { await renderAccountManagement(); }, 600);
}

/* ===========================================
   AVATAR & CV
=========================================== */
async function uploadAvatar(e) {
  const file = e.target.files[0]; if (!file) return;
  const ext  = file.name.split('.').pop();
  const path = `avatars/${currentUser.id}.${ext}`;
  const { error } = await db.storage.from('avatars').upload(path, file, { upsert: true });
  if (error) { showToast('Upload failed: ' + error.message, 'error'); return; }
  const { data } = db.storage.from('avatars').getPublicUrl(path);
  if (data?.publicUrl) {
    await db.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', currentUser.id);
    currentProfile.avatar_url = data.publicUrl;
    setAvatarImage(data.publicUrl + '?t=' + Date.now());
    showToast('Profile photo updated.');
  }
}

function setAvatarImage(src) {
  const c = document.getElementById('avatarCircle');
  const s = document.getElementById('sidebarAvatarText');
  if (c) c.innerHTML = `<img src="${src}" alt="Profile"/>`;
  if (s) s.innerHTML = `<img src="${src}" alt="Profile"/>`;
}

async function uploadCV(e) {
  const file = e.target.files[0]; if (!file) return;
  const ext  = file.name.split('.').pop();
  const path = `cvs/${currentUser.id}.${ext}`;
  const { error } = await db.storage.from('cvs').upload(path, file, { upsert: true });
  if (!error) {
    const { data } = db.storage.from('cvs').getPublicUrl(path);
    if (data?.publicUrl) {
      await db.from('profiles').update({ cv_url: data.publicUrl }).eq('id', currentUser.id);
      currentProfile.cv_url = data.publicUrl;
    }
  }
  showToast('CV uploaded.');
}

function handleApplyCVUpload(e) {
  applyCVFile = e.target.files[0];
  if (applyCVFile) document.getElementById('applyCVLabel').textContent = `✓ ${applyCVFile.name}`;
}

/* ===========================================
   STATUS CONFIG
=========================================== */
const statusConfig = {
  received:    { label: 'Application Received', cls: 'received',    fill: '0%',   stage: 0 },
  reviewing:   { label: 'Reviewing',            cls: 'reviewing',   fill: '16%',  stage: 1 },
  interview1:  { label: '1st Interview',        cls: 'interview1',  fill: '33%',  stage: 2 },
  assessment:  { label: 'Assessment',           cls: 'assessment',  fill: '50%',  stage: 3 },
  interview2:  { label: '2nd Interview',        cls: 'interview2',  fill: '66%',  stage: 4 },
  final:       { label: 'Final Assessment',     cls: 'final',       fill: '82%',  stage: 5 },
  offered:     { label: 'Offer Made',           cls: 'offered',     fill: '100%', stage: 6 },
  rejected:    { label: 'Rejected',             cls: 'rejected',    fill: '0%',   stage: 0 },
  applied:     { label: 'Applied',              cls: 'applied',     fill: '5%',   stage: 0 },
  shortlisted: { label: 'Shortlisted',          cls: 'shortlisted', fill: '40%',  stage: 1 },
  longlist:    { label: 'Long List',            cls: 'longlist',    fill: '25%',  stage: 1 }
};

const stepIcons     = ['ti-inbox','ti-eye','ti-video','ti-brain','ti-video','ti-writing','ti-file-check'];
const stageMessages = {
  reviewing:  'Your CV has passed the baseline criteria and the HC team is currently reviewing your profile.',
  interview1: 'You have been chosen for a 1st Interview! Please head to the Bookings tab to schedule your slot.',
  assessment: 'You have been selected for the Assessment stage. Please complete your assessment in the Assessments tab.',
  interview2: 'You have progressed to the 2nd Interview stage! The HC team will be in touch.',
  final:      'You have progressed to the Final Assessment stage. You are among the top candidates.',
  offered:    'Your application has reached the Offer stage! The HC team will contact you.',
  rejected:   'Your application status has been updated. Please check your email for further details.'
};

function applyStatus(s) {
  const cfg   = statusConfig[s] || statusConfig.reviewing;
  const badge = document.getElementById('dashStatusBadge');
  if (badge) { badge.style.display = ''; badge.className = 'status-badge ' + cfg.cls; badge.innerHTML = `<i class="ti ti-circle-dot"></i>&nbsp;${cfg.label}`; }
  const txt  = document.getElementById('dashStatusText');    if (txt)  txt.textContent = cfg.label;
  const sl   = document.getElementById('currentStageLabel'); if (sl)   sl.textContent  = cfg.label;
  const fill = document.getElementById('progressFill');      if (fill) fill.style.width = cfg.fill;
  document.querySelectorAll('#progressCandidateView .step-node').forEach((node, i) => {
    const circle = node.querySelector('.step-circle');
    const label  = node.querySelector('.step-label');
    if (!circle || !label) return;
    circle.className = 'step-circle'; label.className = 'step-label';
    if (i < cfg.stage)       { circle.classList.add('done');    label.classList.add('done');    circle.innerHTML = '<i class="ti ti-check"></i>'; }
    else if (i === cfg.stage){ circle.classList.add('current'); label.classList.add('current'); circle.innerHTML = `<i class="ti ${stepIcons[i] || 'ti-circle'}"></i>`; }
    else                     { circle.classList.add('pending');                                 circle.innerHTML = `<i class="ti ${stepIcons[i] || 'ti-circle'}"></i>`; }
  });
}

function checkForStatusChangeNotification(currentStatus) {
  try {
    const key      = 'lastSeenStatus_' + currentUser.id;
    const lastSeen = localStorage.getItem(key);
    if (lastSeen && lastSeen !== currentStatus && stageMessages[currentStatus]) showCongratsPopup(currentStatus);
    localStorage.setItem(key, currentStatus);
  } catch(e) {}
}

function showCongratsPopup(newStatus) {
  const msg = stageMessages[newStatus]; if (!msg) return;
  document.getElementById('congratsTitle').textContent = newStatus === 'rejected' ? 'Application Update' : 'Congratulations!';
  document.getElementById('congratsText').textContent  = msg;
  document.getElementById('congratsModal').classList.add('open');
}

/* ===========================================
   EMAIL — fire and forget
=========================================== */
const FROM_EMAIL = 'dvermeulen@communicare.org.za';

function sendEmail(toEmail, subject, body) {
  db.from('email_notifications').insert({
    to_email: toEmail, subject, body, from_email: FROM_EMAIL,
    sent: false, created_at: new Date().toISOString()
  }).catch(() => {});
}
function sendRejectionEmail(toEmail, n, t)               { sendEmail(toEmail, `Your application for ${t} — Communicare`, `Dear ${n},\n\nThank you for applying for ${t}. After careful consideration we will not be moving forward at this time.\n\nKind regards,\nCommunicare Human Capital Team`); }
function sendStatusUpdateEmail(toEmail, n, t, s)         { sendEmail(toEmail, `Application update — ${t}`, `Dear ${n},\n\nYour application for ${t} has been updated to: ${s}.\n\nKind regards,\nCommunicare Human Capital Team`); }
function sendInterviewConfirmationEmail(toEmail, n, d, t){ sendEmail(toEmail, `Interview Confirmed — Communicare`, `Dear ${n},\n\nYour interview has been booked for ${d} at ${t}.\n\nKind regards,\nCommunicare Human Capital Team`); }
function sendInterviewCancellationEmail(toEmail, n, d, t){ sendEmail(toEmail, `Interview Cancelled — Communicare`, `Dear ${n},\n\nYour interview for ${d} at ${t} has been cancelled.\n\nKind regards,\nCommunicare Human Capital Team`); }
function sendManagerShortlistEmail(email, n, t)          { sendEmail(email, `Shortlist ready — ${t}`, `Dear ${n},\n\nA shortlist for "${t}" is ready for your review.\n\nKind regards,\nCommunicare Human Capital Team`); }
function sendManagerDocumentEmail(email, n, t)           { sendEmail(email, `Document to sign — ${t}`, `Dear ${n},\n\nDocument "${t}" has been assigned for your signature. Log in and go to the Sign tab.\n\nKind regards,\nCommunicare Human Capital Team`); }
function sendCandidateInterviewInviteEmail(email, n, t)  { sendEmail(email, `Interview invitation — ${t}`, `Dear ${n},\n\nYou have been shortlisted for "${t}". Please log in and book your interview slot.\n\nKind regards,\nCommunicare Human Capital Team`); }

/* ===========================================
   SCREENING
=========================================== */
async function saveScreening() {
  const payload = {
    job_title: document.getElementById('sc_title').value.trim(), department: document.getElementById('sc_dept').value,
    qualifications: document.getElementById('sc_qual').value.trim(), experience: document.getElementById('sc_exp').value.trim(),
    budget: document.getElementById('sc_budget').value.trim(), job_description: document.getElementById('sc_jd').value.trim(),
    green_flags: document.getElementById('sc_green').value.trim(), red_flags: document.getElementById('sc_red').value.trim(),
    created_by: currentUser.id, creator_name: `${currentProfile.first_name} ${currentProfile.last_name}`.trim(),
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  if (!payload.job_title) { alert('Please enter a job title.'); return; }
  const { error } = await db.from('screening_strategies').insert(payload);
  if (error) { alert('Could not save: ' + error.message); return; }
  ['sc_title','sc_qual','sc_exp','sc_budget','sc_jd','sc_green','sc_red'].forEach(id => { document.getElementById(id).value = ''; });
  showToast('Screening strategy saved.');
  await renderScreeningDepts();
}

async function renderScreeningDepts() {
  const el = document.getElementById('screeningDeptList'); if (!el) return;
  let query = db.from('screening_strategies').select('*').order('created_at', { ascending: false });
  if (userRole === 'manager' && currentProfile.department) query = query.eq('department', currentProfile.department);
  const { data } = await query;
  const strategies = data || [];
  if (strategies.length === 0) { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No strategies saved yet.</p>'; return; }
  const byDept = {};
  strategies.forEach(s => { if (!byDept[s.department]) byDept[s.department] = []; byDept[s.department].push(s); });
  el.innerHTML = Object.entries(byDept).map(([dept, items]) => `
    <div class="screening-dept-block">
      <div class="screening-dept-header" onclick="toggleScreeningDept(this)">
        <h4><i class="ti ti-building" style="color:var(--accent-green)"></i>${escapeHtml(dept)}<span class="dept-count">${items.length} strateg${items.length !== 1 ? 'ies' : 'y'}</span></h4>
        <i class="ti ti-chevron-down chevron"></i>
      </div>
      <div class="screening-dept-body">
        ${items.map(s => `
          <div class="strategy-item">
            <div class="strategy-item-header">
              <div><div class="strategy-item-title">${escapeHtml(s.job_title)}</div><div class="strategy-item-meta">Created by ${escapeHtml(s.creator_name || 'HR')} · ${new Date(s.created_at).toLocaleDateString('en-ZA')}</div></div>
              ${(userRole === 'admin' || s.created_by === currentUser.id) ? `<button class="btn btn-danger btn-sm" onclick="deleteStrategy('${s.id}')"><i class="ti ti-trash"></i></button>` : ''}
            </div>
            <div class="grid-2" style="margin-bottom:12px">
              <div><div class="report-label">Qualifications</div><div style="font-size:13px">${escapeHtml(s.qualifications || '—')}</div></div>
              <div><div class="report-label">Experience</div><div style="font-size:13px">${escapeHtml(s.experience || '—')}</div></div>
              <div><div class="report-label">Budget</div><div style="font-size:13px;color:var(--success);font-weight:600">${escapeHtml(s.budget || '—')}</div></div>
            </div>
            <div style="margin-bottom:10px"><div class="report-label" style="margin-bottom:4px">Job Description</div><div style="font-size:13px;color:var(--text-secondary);line-height:1.6">${escapeHtml(s.job_description || '—')}</div></div>
            <div class="grid-2">
              <div><div class="report-label" style="margin-bottom:6px">Green Flags</div>${(s.green_flags || '').split('\n').filter(Boolean).map(g => `<span class="tag green">✓ ${escapeHtml(g.trim())}</span>`).join('')}</div>
              <div><div class="report-label" style="margin-bottom:6px">Red Flags</div>${(s.red_flags || '').split('\n').filter(Boolean).map(r => `<span class="tag red">✕ ${escapeHtml(r.trim())}</span>`).join('')}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function toggleScreeningDept(header) { const body = header.nextElementSibling; const icon = header.querySelector('.chevron'); body.classList.toggle('open'); if (icon) icon.classList.toggle('open'); }
async function deleteStrategy(id) { if (!confirm('Delete this strategy?')) return; await db.from('screening_strategies').delete().eq('id', id); await renderScreeningDepts(); showToast('Strategy deleted.'); }

/* ===========================================
   COMPETENCY
=========================================== */
function renderDepts() {
  const el = document.getElementById('deptList'); if (!el) return;
  el.innerHTML = '';
  const addBtn = document.getElementById('addJobBtn');
  if (addBtn) addBtn.style.display = userRole === 'admin' ? 'flex' : 'none';
  const depts = (userRole === 'manager' && currentProfile.department)
    ? { [currentProfile.department]: departmentsData[currentProfile.department] || [] }
    : departmentsData;
  for (const [dept, jobs] of Object.entries(depts)) {
    const block   = document.createElement('div'); block.className = 'dept-block';
    const jobRows = (jobs || []).map(j => {
      const key   = `${dept}|${j}`; const files = competencyFiles[key] || {};
      const safeD = dept.replace(/'/g, "\\'"); const safeJ = j.replace(/'/g, "\\'");
      const pdfBadges = [
        files.framework ? `<a class="pdf-badge" href="${files.framework}" target="_blank"><i class="ti ti-file-text"></i> Framework</a>` : '',
        files.jd        ? `<a class="pdf-badge" href="${files.jd}"        target="_blank"><i class="ti ti-file-description"></i> JD</a>`  : ''
      ].join('');
      const adminBtns = userRole === 'admin' ? `
        <div class="job-actions">
          <button class="job-btn pdf" onclick="openCompPdfModal('${safeD}','${safeJ}')"><i class="ti ti-upload"></i> Docs</button>
          <button class="job-btn"     onclick="editJob('${safeD}','${safeJ}')"><i class="ti ti-edit"></i> Edit</button>
          <button class="job-btn del" onclick="deleteJob('${safeD}','${safeJ}')"><i class="ti ti-trash"></i></button>
        </div>` : '';
      return `<div class="job-item"><span class="job-name"><i class="ti ti-point-filled"></i>${escapeHtml(j)} ${pdfBadges}</span>${adminBtns}</div>`;
    }).join('');
    block.innerHTML = `<div class="dept-header" onclick="toggleDept(this)"><h4><i class="ti ti-building"></i>${escapeHtml(dept)}<span class="dept-count">${(jobs || []).length} roles</span></h4><i class="ti ti-chevron-down chevron"></i></div><div class="job-list">${jobRows}</div>`;
    el.appendChild(block);
  }
}

function toggleDept(header) { const list = header.nextElementSibling; const icon = header.querySelector('.chevron'); list.classList.toggle('open'); if (icon) icon.classList.toggle('open'); }
function openAddJobModal() { document.getElementById('newJobTitle').value = ''; document.getElementById('addJobModal').classList.add('open'); }
function addJob() {
  const dept = document.getElementById('newJobDept').value; const title = document.getElementById('newJobTitle').value.trim();
  if (!title) { alert('Please enter a job title.'); return; }
  if (!departmentsData[dept]) departmentsData[dept] = [];
  departmentsData[dept].push(title);
  renderDepts(); closeModal('addJobModal'); showToast('Job added.');
}
function deleteJob(dept, job) { if (!confirm(`Remove "${job}" from ${dept}?`)) return; departmentsData[dept] = departmentsData[dept].filter(j => j !== job); renderDepts(); }
function editJob(dept, job)   { const n = prompt('Edit job title:', job); if (n && n.trim()) { const idx = departmentsData[dept].indexOf(job); if (idx !== -1) { departmentsData[dept][idx] = n.trim(); renderDepts(); } } }

function openCompPdfModal(dept, job) {
  currentCompJob = { dept, job };
  document.getElementById('compPdfJobTitle').textContent    = job;
  document.getElementById('compFrameworkLabel').textContent = 'Click to upload';
  document.getElementById('compJdLabel').textContent        = 'Click to upload';
  const key = `${dept}|${job}`; const files = competencyFiles[key] || {};
  const wrap = document.getElementById('compUploadedFiles'); wrap.innerHTML = '';
  if (files.framework) wrap.innerHTML += `<a class="pdf-badge" href="${files.framework}" target="_blank"><i class="ti ti-file-text"></i> Framework</a>`;
  if (files.jd)        wrap.innerHTML += `<a class="pdf-badge" href="${files.jd}"        target="_blank"><i class="ti ti-file-description"></i> JD</a>`;
  document.getElementById('compPdfModal').classList.add('open');
}

async function handleCompPdfUpload(e, type) {
  const file = e.target.files[0]; if (!file || !currentCompJob) return;
  const { dept, job } = currentCompJob; const key = `${dept}|${job}`;
  const safeName = `${dept}_${job}_${type}`.replace(/[^a-zA-Z0-9_]/g, '_');
  const filePath = `competency/${safeName}.pdf`;
  const { error } = await db.storage.from('competency').upload(filePath, file, { upsert: true });
  const url = error ? URL.createObjectURL(file) : (db.storage.from('competency').getPublicUrl(filePath).data?.publicUrl || '');
  if (!competencyFiles[key]) competencyFiles[key] = {};
  competencyFiles[key][type] = url;
  document.getElementById(type === 'framework' ? 'compFrameworkLabel' : 'compJdLabel').textContent = `✓ ${file.name}`;
  renderDepts(); showToast('Document uploaded.');
}

/* ===========================================
   ASSESSMENTS TAB
=========================================== */
async function renderAssessmentsTab() {
  const adminView     = document.getElementById('adminAssessmentsView');
  const candidateView = document.getElementById('candidateAssessmentsView');
  if (userRole === 'admin') {
    if (adminView)     adminView.style.display     = 'block';
    if (candidateView) candidateView.style.display = 'none';
    document.getElementById('assessmentsSubtitle').textContent = 'Upload HTML assessments and assign to candidates';
    await renderAdminAssessmentsList();
  } else if (userRole === 'candidate') {
    if (adminView)     adminView.style.display     = 'none';
    if (candidateView) candidateView.style.display = 'block';
    document.getElementById('assessmentsSubtitle').textContent = 'Your assigned assessments';
    await renderCandidateUploadedAssessments();
    const assessStatusCard = document.getElementById('assessStatusCard');
    const questionsPanel   = document.getElementById('questionsPanel');
    if (assessStatusCard) assessStatusCard.style.display = 'none';
    if (questionsPanel)   questionsPanel.innerHTML = '';
  } else {
    if (adminView)     adminView.style.display     = 'none';
    if (candidateView) candidateView.style.display = 'none';
    document.getElementById('assessmentsSubtitle').textContent = 'No assessments for your role.';
  }
}

async function renderAdminAssessmentsList() {
  const el = document.getElementById('adminCandidateAssessmentList'); if (!el) return;
  const { data: candidates } = await db.from('profiles').select('*').eq('role', 'candidate').order('first_name');
  if (!candidates || candidates.length === 0) { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No candidates yet.</p>'; return; }
  el.innerHTML = '';
  for (const c of candidates) {
    const fullName = `${c.first_name} ${c.last_name}`.trim() || c.email;
    const { data: assessments } = await db.from('candidate_assessments').select('*').eq('candidate_id', c.id);
    const count = (assessments || []).length;
    el.innerHTML += `
      <div class="candidate-assess-row">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="applicant-avatar">${getInitials(fullName)}</div>
          <div>
            <div style="font-size:13px;font-weight:600">${escapeHtml(fullName)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(c.email)}</div>
            <div style="font-size:11px;color:var(--brand);margin-top:2px">${count} assessment${count !== 1 ? 's' : ''} assigned</div>
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="viewCandidateAssessments('${c.id}','${escapeHtml(fullName)}')"><i class="ti ti-list"></i> View</button>
          <button class="btn btn-primary btn-sm"   onclick="openAdminAssessmentModal('${c.id}','${escapeHtml(fullName)}','${escapeHtml(c.email)}')"><i class="ti ti-upload"></i> Upload</button>
        </div>
      </div>`;
  }
}

async function viewCandidateAssessments(candidateId, candidateName) {
  const { data } = await db.from('candidate_assessments').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false });
  const items = data || [];
  document.getElementById('cpModalName').textContent  = candidateName + ' — Assessments';
  document.getElementById('cpModalContent').innerHTML = items.length === 0
    ? '<p style="font-size:13px;color:var(--text-muted)">No assessments assigned yet.</p>'
    : items.map(a => `
        <div class="uploaded-assess-card">
          <div>
            <div class="uploaded-assess-title">${escapeHtml(a.title)}</div>
            <div class="uploaded-assess-desc">${escapeHtml(a.description || '')}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${new Date(a.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          </div>
          <div style="display:flex;gap:6px">
            <a href="${a.file_url}" target="_blank" class="btn btn-primary btn-sm"><i class="ti ti-external-link"></i> Open</a>
            <button class="btn btn-danger btn-sm" onclick="deleteAdminAssessment('${a.id}','${candidateId}','${escapeHtml(candidateName)}')"><i class="ti ti-trash"></i></button>
          </div>
        </div>`).join('');
  document.getElementById('candidateProfileModal').classList.add('open');
}

async function deleteAdminAssessment(assessId, candidateId, candidateName) {
  if (!confirm('Delete this assessment?')) return;
  await db.from('candidate_assessments').delete().eq('id', assessId);
  showToast('Assessment deleted.');
  await viewCandidateAssessments(candidateId, candidateName);
  await renderAdminAssessmentsList();
}

function openAdminAssessmentModal(candidateId, candidateName, candidateEmail) {
  pendingAdminAssessTarget = { id: candidateId, name: candidateName, email: candidateEmail };
  pendingAdminAssessFile   = null;
  document.getElementById('adminAssessTargetName').textContent = candidateName;
  document.getElementById('adminAssessTitle').value            = '';
  document.getElementById('adminAssessDesc').value             = '';
  document.getElementById('adminAssessFileLabel').textContent  = 'Click to upload HTML file';
  document.getElementById('adminAssessmentModal').classList.add('open');
}

function handleAdminAssessFileUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) { alert('Please upload an HTML file only.'); e.target.value = ''; return; }
  pendingAdminAssessFile = file;
  document.getElementById('adminAssessFileLabel').textContent = `✓ ${file.name}`;
}

async function saveAdminAssessment() {
  const title = document.getElementById('adminAssessTitle').value.trim();
  const desc  = document.getElementById('adminAssessDesc').value.trim();
  if (!title)                  { alert('Please enter a title.'); return; }
  if (!pendingAdminAssessFile)   { alert('Please upload an HTML file.'); return; }
  if (!pendingAdminAssessTarget) return;
  const path = `assessments/${pendingAdminAssessTarget.id}_${Date.now()}.html`;
  const { error: uploadErr } = await db.storage.from('cvs').upload(path, pendingAdminAssessFile, { upsert: true, contentType: 'text/html' });
  if (uploadErr) { alert('Upload failed: ' + uploadErr.message); return; }
  const { data: urlData } = db.storage.from('cvs').getPublicUrl(path);
  const { error } = await db.from('candidate_assessments').insert({
    candidate_id: pendingAdminAssessTarget.id, candidate_email: pendingAdminAssessTarget.email,
    candidate_name: pendingAdminAssessTarget.name, title, description: desc,
    file_url: urlData?.publicUrl || '', file_name: pendingAdminAssessFile.name,
    uploaded_by: currentUser.id, created_at: new Date().toISOString()
  });
  if (error) { alert('Could not save: ' + error.message); return; }
  closeModal('adminAssessmentModal');
  showToast('Assessment uploaded.');
  await renderAdminAssessmentsList();
}

async function renderCandidateUploadedAssessments() {
  const el = document.getElementById('uploadedAssessmentsSection'); if (!el) return;
  const { data } = await db.from('candidate_assessments').select('*').eq('candidate_id', currentUser.id).order('created_at', { ascending: false });
  const items = data || [];
  if (items.length === 0) {
    el.innerHTML = `<div class="card" style="text-align:center;padding:40px">
      <i class="ti ti-file-off" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:12px"></i>
      <div style="font-size:14px;color:var(--text-muted)">No assessments assigned yet.</div>
    </div>`;
    return;
  }
  el.innerHTML = `
    <div class="card">
      <div class="card-title"><i class="ti ti-file-upload"></i> Your Assessments</div>
      ${items.map(a => `
        <div class="uploaded-assess-card">
          <div>
            <div class="uploaded-assess-title">${escapeHtml(a.title)}</div>
            <div class="uploaded-assess-desc">${escapeHtml(a.description || '')}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${new Date(a.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          </div>
          <a href="${a.file_url}" target="_blank" class="btn btn-primary btn-sm"><i class="ti ti-external-link"></i> Open</a>
        </div>`).join('')}
    </div>`;
}

/* ===========================================
   PROGRESS TAB
=========================================== */
async function renderProgress() {
  if (userRole === 'candidate') {
    document.getElementById('progressCandidateView').style.display = 'block';
    document.getElementById('progressAdminView').style.display     = 'none';
    applyStatus(currentProfile.status || 'reviewing');
  } else {
    document.getElementById('progressCandidateView').style.display = 'none';
    document.getElementById('progressAdminView').style.display     = 'block';
    await renderProgressAdmin();
  }
}

async function renderProgressAdmin() {
  const el = document.getElementById('progressVacancyList'); if (!el) return;
  const { data: vacs } = await db.from('vacancies').select('*').order('created_at', { ascending: false });
  const { data: apps } = await db.from('applications').select('*').order('submitted_at', { ascending: false });
  const vacList = (vacs && vacs.length > 0) ? vacs : getDemoVacancies();
  const appList = apps || [];
  el.innerHTML  = '';
  for (const vac of vacList) {
    const vacApps = appList.filter(a => String(a.vacancy_id) === String(vac.id));
    const block   = document.createElement('div'); block.className = 'progress-vacancy-block';
    const appRows = vacApps.length === 0
      ? '<div style="padding:16px 0;font-size:13px;color:var(--text-muted)">No applicants yet.</div>'
      : vacApps.map(app => {
          const cfg = statusConfig[app.status] || statusConfig.reviewing;
          return `<div class="applicant-row">
            <div class="applicant-row-info" style="cursor:pointer" onclick="openCandidateProfile('${app.id}')">
              <div class="applicant-avatar">${getInitials(app.candidate_name || 'CA')}</div>
              <div><div class="applicant-row-name">${escapeHtml(app.candidate_name || 'Candidate')}</div><div class="applicant-row-email">${escapeHtml(app.candidate_email || '')}</div></div>
            </div>
            <div class="applicant-row-actions">
              <span class="status-badge ${cfg.cls}" style="margin:0;font-size:10px">${cfg.label}</span>
              <button class="btn btn-secondary btn-sm" onclick="openCandidateProfile('${app.id}')"><i class="ti ti-eye"></i> View</button>
              <select class="stats-period-select" style="font-size:11px;padding:4px 8px" onchange="updateApplicantStatus('${app.id}','${app.candidate_email}',this.value,'${escapeHtml(app.candidate_name || '')}','${escapeHtml(app.vacancy_title || '')}')">
                <option value="">Update status…</option>
                <option value="reviewing">Reviewing</option>
                <option value="interview1">1st Interview</option>
                <option value="assessment">Assessment</option>
                <option value="interview2">2nd Interview</option>
                <option value="final">Final Assessment</option>
                <option value="offered">Offer Made</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>`;
        }).join('');
    block.innerHTML = `
      <div class="progress-vacancy-header" onclick="toggleProgressVacancy(this)">
        <div><div class="progress-vacancy-title">${escapeHtml(vac.title)}</div><div class="progress-vacancy-meta">${escapeHtml(vac.department || '')} · ${vacApps.length} applicant${vacApps.length !== 1 ? 's' : ''}</div></div>
        <i class="ti ti-chevron-down chevron"></i>
      </div>
      <div class="progress-applicant-list">${appRows}</div>`;
    el.appendChild(block);
  }
}

async function updateApplicantStatus(appId, email, newStatus, name, vacTitle) {
  if (!newStatus) return;
  await db.from('applications').update({ status: newStatus }).eq('id', appId);
  await db.from('profiles').update({ status: newStatus }).eq('email', email);
  if (newStatus === 'rejected') sendRejectionEmail(email, name, vacTitle);
  else sendStatusUpdateEmail(email, name, vacTitle, newStatus);
  showToast('Status updated.');
  await renderProgressAdmin();
}

function toggleProgressVacancy(header) { const list = header.nextElementSibling; const icon = header.querySelector('.chevron'); list.classList.toggle('open'); if (icon) icon.classList.toggle('open'); }

async function openCandidateProfile(appId) {
  const modal   = document.getElementById('candidateProfileModal');
  const content = document.getElementById('cpModalContent');
  const nameEl  = document.getElementById('cpModalName');
  content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Loading...</div>';
  modal.classList.add('open');
  const { data: app } = await db.from('applications').select('*').eq('id', appId).single();
  if (!app) { content.innerHTML = '<p style="color:var(--danger)">Could not load.</p>'; return; }
  const { data: profile } = await db.from('profiles').select('*').eq('email', app.candidate_email).single();
  nameEl.textContent = app.candidate_name || 'Candidate';
  const answers   = safeParseJSON(app.answers, {});
  const vac       = vacanciesData.find(v => String(v.id) === String(app.vacancy_id));
  const questions = vac?.screening_questions || [];
  const cfg       = statusConfig[app.status] || statusConfig.reviewing;
  const cvUrl     = profile?.cv_url || app.cv_url || '';
  const answersHtml = questions.length > 0
    ? questions.map((q, qi) => {
        const chosen  = answers[qi] !== undefined ? q.opts?.[answers[qi]] : '—';
        const correct = answers[qi] === q.correct;
        return `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:3px">Q${qi+1}: ${escapeHtml(q.q)}</div>
          <div style="font-size:13px;color:${correct ? 'var(--success)' : 'var(--danger)'};font-weight:500"><i class="ti ${correct ? 'ti-check' : 'ti-x'}"></i> ${escapeHtml(chosen || '—')}</div>
        </div>`;
      }).join('')
    : '<p style="font-size:13px;color:var(--text-muted)">No screening questions.</p>';
  content.innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px">
      <div class="applicant-avatar" style="width:52px;height:52px;font-size:18px">${getInitials(app.candidate_name || 'CA')}</div>
      <div>
        <div style="font-size:15px;font-weight:600">${escapeHtml(app.candidate_name || '—')}</div>
        <div style="font-size:12px;color:var(--text-muted)">${escapeHtml(app.candidate_email || '—')}</div>
        <span class="status-badge ${cfg.cls}" style="margin-top:6px">${cfg.label}</span>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px;padding:16px">
      <div class="card-title"><i class="ti ti-user"></i> Profile</div>
      <div class="info-row"><span class="key">Phone</span><span class="val">${escapeHtml(profile?.phone || '—')}</span></div>
      <div class="info-row"><span class="key">ID</span><span class="val">${escapeHtml(profile?.id_number || '—')}</span></div>
      <div class="info-row"><span class="key">Location</span><span class="val">${escapeHtml(profile?.location || '—')}</span></div>
      <div class="info-row"><span class="key">Nationality</span><span class="val">${escapeHtml(profile?.nationality || '—')}</span></div>
      <div style="margin-top:12px">${cvUrl ? `<a href="${cvUrl}" target="_blank" class="btn btn-secondary btn-sm"><i class="ti ti-file-cv"></i> View CV</a>` : '<span style="font-size:12px;color:var(--text-muted)">No CV.</span>'}</div>
    </div>
    <div class="card" style="padding:16px">
      <div class="card-title"><i class="ti ti-help-circle"></i> Screening Answers</div>
      <div style="margin-bottom:8px"><span class="status-pill ${app.score >= 70 ? 'green' : app.score >= 40 ? 'yellow' : 'brand'}">Score: ${app.score}%</span></div>
      ${answersHtml}
    </div>`;
}

async function openCandidateProfileByEmail(email) {
  if (!email) return;
  const modal   = document.getElementById('candidateProfileModal');
  const content = document.getElementById('cpModalContent');
  content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Loading...</div>';
  modal.classList.add('open');
  const { data: profile } = await db.from('profiles').select('*').eq('email', email).single();
  const { data: apps }    = await db.from('applications').select('*').eq('candidate_email', email).order('submitted_at', { ascending: false });
  const fullName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : email;
  document.getElementById('cpModalName').textContent = fullName;
  const cvUrl = profile?.cv_url || apps?.[0]?.cv_url || '';
  content.innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px">
      <div class="applicant-avatar" style="width:52px;height:52px;font-size:18px">${getInitials(fullName)}</div>
      <div><div style="font-size:15px;font-weight:600">${escapeHtml(fullName)}</div><div style="font-size:12px;color:var(--text-muted)">${escapeHtml(email)}</div></div>
    </div>
    ${profile ? `<div class="card" style="padding:16px">
      <div class="card-title"><i class="ti ti-user"></i> Profile</div>
      <div class="info-row"><span class="key">Phone</span><span class="val">${escapeHtml(profile.phone || '—')}</span></div>
      <div class="info-row"><span class="key">Location</span><span class="val">${escapeHtml(profile.location || '—')}</span></div>
      <div style="margin-top:12px">${cvUrl ? `<a href="${cvUrl}" target="_blank" class="btn btn-secondary btn-sm"><i class="ti ti-file-cv"></i> View CV</a>` : '<span style="font-size:12px;color:var(--text-muted)">No CV.</span>'}</div>
    </div>` : ''}`;
}

/* ===========================================
   VACANCIES
=========================================== */
async function renderVacancies() {
  const { data, error } = await db.from('vacancies').select('*').order('created_at', { ascending: false });
  vacanciesData = (error || !data || data.length === 0) ? getDemoVacancies() : data.map(v => ({ ...v, screening_questions: safeParseJSON(v.screening_questions, []) }));
  if (userRole === 'candidate') renderCandidateVacancies();
}

function getDemoVacancies() {
  return [
    { id: 'demo1', title: 'Financial Accountant', department: 'Finance', location: 'Cape Town', type: 'Full-time', description: 'Manage financial records.', closing_date: '2025-08-15', posted: true, screening_questions: [{ q: 'Do you have a BCom Accounting degree?', opts: ['Yes','No'], correct: 0 }] },
    { id: 'demo2', title: 'HR Business Partner', department: 'Human Capital', location: 'Cape Town', type: 'Full-time', description: 'Strategic HR solutions.', closing_date: '2025-08-30', posted: true, screening_questions: [{ q: 'Do you have an HR degree?', opts: ['Yes','No'], correct: 0 }] }
  ];
}

function renderCandidateVacancies() {
  const grid   = document.getElementById('vacancyList'); if (!grid) return;
  const posted = vacanciesData.filter(v => v.posted);
  if (posted.length === 0) { grid.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)"><i class="ti ti-search" style="font-size:32px;display:block;margin-bottom:10px"></i>No vacancies available.</div>`; return; }
  grid.innerHTML = posted.map(v => `
    <div class="vacancy-card">
      <div class="vacancy-title">${escapeHtml(v.title)}</div>
      <div class="vacancy-dept">${escapeHtml(v.department)}</div>
      <div class="vacancy-meta">
        <span><i class="ti ti-map-pin"></i> ${escapeHtml(v.location || 'Cape Town')}</span>
        <span><i class="ti ti-clock"></i> ${escapeHtml(v.type || 'Full-time')}</span>
        <span><i class="ti ti-calendar"></i> Closes ${formatDate(v.closing_date)}</span>
      </div>
      <div class="vacancy-desc">${escapeHtml(v.description || '')}</div>
      <div class="vacancy-footer"><span></span>
        <button class="btn btn-primary" onclick="checkAndOpenApply('${v.id}')"><i class="ti ti-send"></i> Apply Now</button>
      </div>
    </div>`).join('');
}

async function renderAdminVacancies() {
  const el = document.getElementById('adminVacancyList'); if (!el) return;
  await renderVacancies();
  if (vacanciesData.length === 0) { el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No vacancies yet.</div>'; return; }
  el.innerHTML = vacanciesData.map(v => `
    <div class="admin-vacancy-block">
      <div class="admin-vacancy-header">
        <div><div class="admin-vacancy-title">${escapeHtml(v.title)}</div><div class="admin-vacancy-dept">${escapeHtml(v.department)} · ${escapeHtml(v.location || 'Cape Town')} · ${escapeHtml(v.type || 'Full-time')}</div></div>
        <div class="admin-vacancy-actions">
          <label class="posted-toggle" onclick="togglePosted('${v.id}')">
            <div class="toggle-switch ${v.posted ? 'on' : ''}" id="toggle_${v.id}"></div>
            <span id="toggleLabel_${v.id}">${v.posted ? 'Posted' : 'Draft'}</span>
          </label>
          <button class="btn btn-secondary btn-sm" onclick="openScreeningQModal('${v.id}')"><i class="ti ti-help-circle"></i> Questions</button>
          <button class="btn btn-purple btn-sm"    onclick="openApplicantListModal('${v.id}')"><i class="ti ti-users"></i> Applicants</button>
          <button class="btn btn-danger btn-sm"    onclick="deleteVacancy('${v.id}')"><i class="ti ti-trash"></i></button>
        </div>
      </div>
    </div>`).join('');
}

async function togglePosted(vacId) {
  const vac = vacanciesData.find(v => String(v.id) === String(vacId)); if (!vac) return;
  vac.posted = !vac.posted;
  const t = document.getElementById(`toggle_${vacId}`); const l = document.getElementById(`toggleLabel_${vacId}`);
  if (t) t.classList.toggle('on', vac.posted); if (l) l.textContent = vac.posted ? 'Posted' : 'Draft';
  if (!String(vacId).startsWith('demo')) await db.from('vacancies').update({ posted: vac.posted }).eq('id', vacId);
  showToast(vac.posted ? 'Vacancy posted.' : 'Set to draft.');
}

function openAddVacancyModal() { document.getElementById('addVacancyModal').classList.add('open'); }

async function addVacancy() {
  const title = document.getElementById('vacTitle').value.trim(); const dept = document.getElementById('vacDept').value;
  const loc   = document.getElementById('vacLocation').value.trim(); const type = document.getElementById('vacType').value;
  const desc  = document.getElementById('vacDesc').value.trim(); const closing = document.getElementById('vacClosing').value;
  if (!title) { alert('Please enter a job title.'); return; }
  const { data } = await db.from('vacancies').insert({ title, department: dept, location: loc, type, description: desc, closing_date: closing, posted: false, screening_questions: JSON.stringify([]), created_by: currentUser.id, created_at: new Date().toISOString() }).select().single();
  vacanciesData.unshift({ id: data?.id || 'local_' + Date.now(), title, department: dept, location: loc, type, description: desc, closing_date: closing, posted: false, screening_questions: [] });
  closeModal('addVacancyModal');
  ['vacTitle','vacLocation','vacDesc','vacClosing'].forEach(id => { document.getElementById(id).value = ''; });
  await renderAdminVacancies(); showToast('Vacancy created.');
}

async function deleteVacancy(vacId) {
  if (!confirm('Delete this vacancy?')) return;
  vacanciesData = vacanciesData.filter(v => String(v.id) !== String(vacId));
  if (!String(vacId).startsWith('demo') && !String(vacId).startsWith('local')) await db.from('vacancies').delete().eq('id', vacId);
  await renderAdminVacancies();
}

/* ===========================================
   SCREENING QUESTIONS
=========================================== */
function openScreeningQModal(vacId) {
  currentVacancyId = vacId;
  const vac = vacanciesData.find(v => String(v.id) === String(vacId));
  if (!vac) { alert('Vacancy not found.'); return; }
  document.getElementById('sqJobTitle').textContent = vac.title;
  renderSQList(vac.screening_questions || []);
  document.getElementById('screeningQModal').classList.add('open');
}

function renderSQList(questions) {
  const el = document.getElementById('sqList'); if (!el) return;
  el.innerHTML = questions.map((q, qi) => `
    <div class="sq-item">
      <div class="sq-num">Question ${qi+1}</div>
      <div class="form-group" style="margin-bottom:10px"><input type="text" value="${escapeHtml(q.q || '')}" placeholder="Enter question..." onchange="updateSQQuestion(${qi},this.value)"/></div>
      <div class="sq-options-builder">
        ${(q.opts || ['','']).map((opt, oi) => `
          <div class="sq-option-row">
            <input type="radio" name="sqCorrect_${qi}" value="${oi}" class="sq-correct-radio" ${q.correct === oi ? 'checked' : ''} onchange="updateSQCorrect(${qi},${oi})" title="Mark as correct"/>
            <span class="sq-correct-label">Correct</span>
            <input type="text" value="${escapeHtml(opt)}" placeholder="Option ${oi+1}..." onchange="updateSQOption(${qi},${oi},this.value)"/>
            ${q.opts.length > 2 ? `<button class="job-btn del" onclick="removeSQOption(${qi},${oi})"><i class="ti ti-x"></i></button>` : ''}
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-secondary btn-sm" onclick="addSQOption(${qi})"><i class="ti ti-plus"></i> Add Option</button>
        <button class="btn btn-danger btn-sm"    onclick="removeSQQuestion(${qi})"><i class="ti ti-trash"></i> Remove</button>
      </div>
    </div>`).join('');
}

function getCurrentSQQuestions() { const vac = vacanciesData.find(v => String(v.id) === String(currentVacancyId)); return vac ? (vac.screening_questions || []) : []; }
function addScreeningQuestion()  { const vac = vacanciesData.find(v => String(v.id) === String(currentVacancyId)); if (!vac) return; if (!vac.screening_questions) vac.screening_questions = []; vac.screening_questions.push({ q: '', opts: ['',''], correct: 0 }); renderSQList(vac.screening_questions); }
function updateSQQuestion(qi,v)  { const qs = getCurrentSQQuestions(); if (qs[qi]) qs[qi].q = v; }
function updateSQOption(qi,oi,v) { const qs = getCurrentSQQuestions(); if (qs[qi]?.opts) qs[qi].opts[oi] = v; }
function updateSQCorrect(qi,oi)  { const qs = getCurrentSQQuestions(); if (qs[qi]) qs[qi].correct = oi; }
function addSQOption(qi)         { const qs = getCurrentSQQuestions(); if (qs[qi] && qs[qi].opts.length < 5) { qs[qi].opts.push(''); renderSQList(qs); } }
function removeSQOption(qi,oi)   { const qs = getCurrentSQQuestions(); if (qs[qi] && qs[qi].opts.length > 2) { qs[qi].opts.splice(oi,1); if (qs[qi].correct >= qs[qi].opts.length) qs[qi].correct = 0; renderSQList(qs); } }
function removeSQQuestion(qi)    { const vac = vacanciesData.find(v => String(v.id) === String(currentVacancyId)); if (vac?.screening_questions) { vac.screening_questions.splice(qi,1); renderSQList(vac.screening_questions); } }

async function saveScreeningQuestions() {
  const vac = vacanciesData.find(v => String(v.id) === String(currentVacancyId)); if (!vac) return;
  const id  = String(currentVacancyId);
  if (!id.startsWith('demo') && !id.startsWith('local')) {
    const { error } = await db.from('vacancies').update({ screening_questions: JSON.stringify(vac.screening_questions) }).eq('id', currentVacancyId);
    if (error) { alert('Could not save: ' + error.message); return; }
  }
  closeModal('screeningQModal'); showToast('Questions saved.');
}

/* ===========================================
   APPLY FLOW
=========================================== */
async function checkAndOpenApply(vacId) {
  try {
    const { data: existing } = await db.from('applications').select('id').eq('user_id', currentUser.id).eq('vacancy_id', String(vacId));
    if (existing && existing.length > 0) {
      document.getElementById('replaceAppYes').onclick = () => { closeModal('replaceAppModal'); openApplyModal(vacId); };
      document.getElementById('replaceAppModal').classList.add('open');
    } else { openApplyModal(vacId); }
  } catch(err) { openApplyModal(vacId); }
}

function openApplyModal(vacId) {
  currentVacancyId = vacId; applyAnswers = {}; applyCVFile = null;
  document.getElementById('applyCVLabel').textContent = 'Click to upload your CV (PDF, Word)';
  const vac = vacanciesData.find(v => String(v.id) === String(vacId)); if (!vac) return;
  document.getElementById('applyJobTitle').textContent = vac.title;
  const questions = vac.screening_questions || [];
  const el = document.getElementById('applyQuestionsList');
  el.innerHTML = questions.length === 0
    ? `<div class="notice"><i class="ti ti-info-circle"></i><span>No screening questions. Upload your CV and submit.</span></div>`
    : questions.map((q, qi) => `
        <div class="q-card">
          <div class="q-num">Question ${qi+1} of ${questions.length}</div>
          <div class="q-text">${escapeHtml(q.q)}</div>
          <div class="q-options">
            ${q.opts.map((opt, oi) => `
              <label class="q-opt" id="applyOpt_${qi}_${oi}">
                <input type="radio" name="applyQ${qi}" value="${oi}" onchange="selectApplyOpt(${qi},${oi})"/> ${escapeHtml(opt)}
              </label>`).join('')}
          </div>
        </div>`).join('');
  document.getElementById('applyModal').classList.add('open');
}

function selectApplyOpt(qi, oi) {
  const vac = vacanciesData.find(v => String(v.id) === String(currentVacancyId)); if (!vac) return;
  (vac.screening_questions || [])[qi]?.opts.forEach((_, i) => { const el = document.getElementById(`applyOpt_${qi}_${i}`); if (el) el.classList.remove('selected'); });
  const sel = document.getElementById(`applyOpt_${qi}_${oi}`); if (sel) sel.classList.add('selected');
  applyAnswers[qi] = oi;
}

async function submitApplication() {
  const vac = vacanciesData.find(v => String(v.id) === String(currentVacancyId)); if (!vac) return;
  const questions = vac.screening_questions || [];
  if (questions.length > 0 && Object.keys(applyAnswers).length < questions.length) { alert('Please answer all questions.'); return; }
  let correct = 0; questions.forEach((q, qi) => { if (applyAnswers[qi] === q.correct) correct++; });
  const score    = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 100;
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();
  let cvUrl      = currentProfile.cv_url || '';
  if (applyCVFile) {
    const ext = applyCVFile.name.split('.').pop();
    const path = `cvs/applications/${currentUser.id}_${Date.now()}.${ext}`;
    const { error: uploadErr } = await db.storage.from('cvs').upload(path, applyCVFile, { upsert: true });
    if (!uploadErr) { const { data } = db.storage.from('cvs').getPublicUrl(path); cvUrl = data?.publicUrl || cvUrl; }
  }
  const { data: existing } = await db.from('applications').select('id').eq('user_id', currentUser.id).eq('vacancy_id', String(currentVacancyId));
  if (existing && existing.length > 0) { for (const old of existing) { await db.from('shortlists').delete().eq('application_id', old.id); await db.from('applications').delete().eq('id', old.id); } }
  const { error } = await db.from('applications').insert({ vacancy_id: String(currentVacancyId), vacancy_title: vac.title, user_id: currentUser.id, candidate_name: fullName, candidate_email: currentUser.email, answers: JSON.stringify(applyAnswers), score, cv_url: cvUrl, status: 'applied', submitted_at: new Date().toISOString() });
  if (error) { alert('Could not submit: ' + error.message); return; }
  await db.from('profiles').update({ status: 'reviewing' }).eq('id', currentUser.id);
  currentProfile.status = 'reviewing';
  applyAnswers = {}; applyCVFile = null;
  closeModal('applyModal'); applyStatus('reviewing');
  showToast(`Application submitted! Score: ${score >= 70 ? '🟢 Good' : score >= 40 ? '🟡 Moderate' : '🔴 Under review'}`);
}

/* ===========================================
   APPLICANTS MODAL
=========================================== */
async function openApplicantListModal(vacId) {
  currentVacancyId = vacId;
  const vac = vacanciesData.find(v => String(v.id) === String(vacId));
  document.getElementById('alJobTitle').textContent = vac ? vac.title : vacId;
  const { data: apps }              = await db.from('applications').select('*').eq('vacancy_id', String(vacId)).order('score', { ascending: false });
  const { data: existingShortlist } = await db.from('shortlists').select('*').eq('vacancy_id', String(vacId));
  const shortlistMap = {};
  (existingShortlist || []).forEach(s => { shortlistMap[s.application_id] = s.list_type; });
  shortlistDraft = {};
  const activeApps = (apps || []).filter(a => a.status !== 'rejected' || !shortlistMap[a.id]);
  activeApps.forEach(a => { shortlistDraft[a.id] = shortlistMap[a.id] || 'pending'; });
  window._currentApplicantApps = activeApps;
  renderApplicantColumns(activeApps);
  const hasShortlistInDB = (existingShortlist || []).some(s => s.list_type === 'shortlist');
  if (hasShortlistInDB) await renderManagerApprovalsSection(vacId, activeApps);
  renderShortlistActionButton(activeApps, hasShortlistInDB);
  document.getElementById('applicantListModal').classList.add('open');
}

function renderShortlistActionButton(apps, shortlistSentToManager) {
  const wrap    = document.getElementById('shortlistActionWrap'); if (!wrap) return;
  const pending = apps.filter(a => shortlistDraft[a.id] === 'pending');
  if (shortlistSentToManager) {
    wrap.innerHTML = `<button class="btn btn-primary" style="padding:12px 28px;font-size:14px" onclick="finaliseApplicationStatuses()"><i class="ti ti-check"></i> Update Statuses</button>`;
  } else if (pending.length === 0 && apps.length > 0) {
    wrap.innerHTML = `<button class="btn btn-purple" style="padding:12px 28px;font-size:14px" onclick="informManagerOfShortlist()"><i class="ti ti-send"></i> Inform Manager</button>`;
  } else { wrap.innerHTML = ''; }
}

async function renderManagerApprovalsSection(vacId, apps) {
  const section = document.getElementById('managerApprovalsSection'); if (!section) return;
  const { data: reviews } = await db.from('manager_reviews').select('*').eq('vacancy_id', String(vacId));
  const shortlisted = apps.filter(a => shortlistDraft[a.id] === 'shortlist');
  if (shortlisted.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  const listEl = document.getElementById('managerApprovalsList'); if (!listEl) return;
  listEl.innerHTML = shortlisted.map(a => {
    const appReviews    = (reviews || []).filter(r => r.application_id === a.id);
    const anyNoContinue = appReviews.some(r => r.decision === 'no-continue');
    const allContinue   = appReviews.length > 0 && appReviews.every(r => r.decision === 'continue');
    const overallBadge  = appReviews.length === 0
      ? `<span class="approval-decision pending"><i class="ti ti-clock"></i> Awaiting</span>`
      : anyNoContinue
      ? `<span class="approval-decision no-continue"><i class="ti ti-x"></i> Blocked</span>`
      : allContinue
      ? `<span class="approval-decision continue"><i class="ti ti-check"></i> All Continue</span>`
      : `<span class="approval-decision pending"><i class="ti ti-clock"></i> Partial</span>`;
    const reviewDetails = appReviews.map(r => `
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
        <b>${escapeHtml(r.manager_name || 'Manager')}:</b>
        <span style="color:${r.decision === 'continue' ? 'var(--success)' : 'var(--danger)'}">${r.decision === 'continue' ? '✓ Continue' : '✗ Don\'t Continue'}</span>
        ${r.reason ? `<em> — "${escapeHtml(r.reason)}"</em>` : ''}
      </div>`).join('');
    return `<div class="approval-row">
      <div style="display:flex;align-items:flex-start;gap:10px;flex:1">
        <div class="applicant-avatar">${getInitials(a.candidate_name || 'CA')}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500">${escapeHtml(a.candidate_name || 'Candidate')}</div>
          <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(a.candidate_email || '')}</div>
          ${reviewDetails}
        </div>
      </div>
      ${overallBadge}
    </div>`;
  }).join('');
}

async function informManagerOfShortlist() {
  const apps        = window._currentApplicantApps || [];
  const shortlisted = apps.filter(a => shortlistDraft[a.id] === 'shortlist');
  if (shortlisted.length === 0) { alert('No candidates in the shortlist.'); return; }
  if (!confirm(`Inform manager of ${shortlisted.length} shortlisted candidate(s)?`)) return;
  const vac = vacanciesData.find(v => String(v.id) === String(currentVacancyId));
  await db.from('shortlists').delete().eq('vacancy_id', String(currentVacancyId)).eq('list_type', 'shortlist');
  await db.from('shortlists').insert(shortlisted.map(app => ({
    vacancy_id: String(currentVacancyId), vacancy_title: vac?.title || '',
    application_id: app.id, candidate_name: app.candidate_name,
    candidate_email: app.candidate_email, list_type: 'shortlist',
    score: app.score, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  })));
  db.from('profiles').select('email,first_name,last_name').eq('role', 'manager').eq('department', vac?.department || '').then(({ data: mgrs }) => {
    (mgrs || []).forEach(m => sendManagerShortlistEmail(m.email, `${m.first_name} ${m.last_name}`.trim(), vac?.title || ''));
  });
  showToast('Shortlist saved. Manager notified.');
  await openApplicantListModal(currentVacancyId);
}

async function finaliseApplicationStatuses() {
  const apps = window._currentApplicantApps || []; if (apps.length === 0) return;
  const { data: reviews } = await db.from('manager_reviews').select('*').eq('vacancy_id', String(currentVacancyId));
  const shortlisted = apps.filter(a => shortlistDraft[a.id] === 'shortlist');
  const blockers    = shortlisted.filter(a => (reviews || []).some(r => r.application_id === a.id && r.decision === 'no-continue'));
  if (blockers.length > 0) { alert(`${blockers.length} candidate(s) marked "Don't Continue" by a manager.`); return; }
  if (!confirm('Update statuses for all candidates?')) return;
  await Promise.all(apps.map(async app => {
    const listType = shortlistDraft[app.id];
    if (listType === 'rejected') {
      if (app.status === 'rejected') return;
      await Promise.all([db.from('applications').update({ status: 'rejected' }).eq('id', app.id), db.from('profiles').update({ status: 'rejected' }).eq('email', app.candidate_email), db.from('shortlists').delete().eq('application_id', app.id)]);
      sendRejectionEmail(app.candidate_email, app.candidate_name, app.vacancy_title);
    } else if (listType === 'longlist') {
      await Promise.all([db.from('applications').update({ status: 'reviewing' }).eq('id', app.id), db.from('profiles').update({ status: 'reviewing' }).eq('email', app.candidate_email), db.from('shortlists').delete().eq('application_id', app.id)]);
    } else if (listType === 'shortlist') {
      await Promise.all([db.from('applications').update({ status: 'interview1' }).eq('id', app.id), db.from('profiles').update({ status: 'interview1' }).eq('email', app.candidate_email)]);
      sendStatusUpdateEmail(app.candidate_email, app.candidate_name, app.vacancy_title, '1st Interview');
      sendCandidateInterviewInviteEmail(app.candidate_email, app.candidate_name, app.vacancy_title);
    }
  }));
  showToast('All statuses updated.');
  closeModal('applicantListModal');
  await renderProgressAdmin();
}

function renderApplicantColumns(apps) {
  const pending   = apps.filter(a => shortlistDraft[a.id] === 'pending');
  const shortlist = apps.filter(a => shortlistDraft[a.id] === 'shortlist');
  const longlist  = apps.filter(a => shortlistDraft[a.id] === 'longlist');
  const rejected  = apps.filter(a => shortlistDraft[a.id] === 'rejected');
  const scoreClass = s => s >= 70 ? 'good' : s >= 40 ? 'moderate' : 'poor';
  const renderChip = a => `
    <div class="applicant-chip" draggable="true" data-appid="${a.id}"
      ondragstart="dragStart(event,'${a.id}')" ondragend="dragEnd(event)"
      onclick="openCandidateProfile('${a.id}')">
      <div style="display:flex;align-items:center;gap:8px">
        <i class="ti ti-grip-vertical chip-drag-handle"></i>
        <div style="flex:1;min-width:0">
          <div class="applicant-chip-name">${escapeHtml(a.candidate_name || 'Candidate')}</div>
          <div style="font-size:10px;color:var(--text-muted)">${escapeHtml(a.candidate_email || '')}</div>
        </div>
        <span class="chip-score-badge ${scoreClass(a.score)}">${a.score}%</span>
      </div>
    </div>`;
  const renderCol = arr => arr.length === 0
    ? '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;text-align:center">Drop here</div>'
    : arr.map(a => renderChip(a)).join('');
  document.getElementById('colPending').innerHTML   = renderCol(pending);
  document.getElementById('colShortlist').innerHTML = renderCol(shortlist);
  document.getElementById('colLonglist').innerHTML  = renderCol(longlist);
  document.getElementById('colRejected').innerHTML  = renderCol(rejected);
}

function dragStart(event, appId) { event.dataTransfer.setData('appId', appId); event.target.classList.add('dragging'); }
function dragEnd(event) { event.target.classList.remove('dragging'); document.querySelectorAll('.applicant-col').forEach(c => c.classList.remove('drag-over')); }

async function dropApplicant(event, newList) {
  event.preventDefault();
  const appId = event.dataTransfer.getData('appId'); if (!appId) return;
  event.currentTarget.classList.remove('drag-over');
  shortlistDraft[appId] = newList;
  const apps = window._currentApplicantApps || [];
  const app  = apps.find(a => a.id === appId);
  if (app) {
    const vac = vacanciesData.find(v => String(v.id) === String(currentVacancyId));
    if (newList === 'shortlist') {
      const { data: existing } = await db.from('shortlists').select('id').eq('application_id', appId).maybeSingle();
      if (existing) { await db.from('shortlists').update({ list_type: 'shortlist', updated_at: new Date().toISOString() }).eq('id', existing.id); }
      else { await db.from('shortlists').insert({ vacancy_id: String(currentVacancyId), vacancy_title: vac?.title || '', application_id: appId, candidate_name: app.candidate_name, candidate_email: app.candidate_email, list_type: 'shortlist', score: app.score, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); }
    } else { await db.from('shortlists').delete().eq('application_id', appId); }
  }
  renderApplicantColumns(apps);
  showToast('Candidate moved.', 'info');
}

/* ===========================================
   MANAGER SHORTLIST VIEW
=========================================== */
async function renderManagerShortlists() {
  const el     = document.getElementById('managerShortlistView'); if (!el) return;
  const myDept = currentProfile.department;
  if (!myDept) { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No department assigned.</p>'; return; }
  const { data: vacs }       = await db.from('vacancies').select('*').eq('department', myDept);
  const vacIds               = (vacs || []).map(v => String(v.id));
  if (vacIds.length === 0)   { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No vacancies for your department.</p>'; return; }
  const { data: shortlists } = await db.from('shortlists').select('*').in('vacancy_id', vacIds).eq('list_type', 'shortlist');
  const { data: reviews }    = await db.from('manager_reviews').select('*');
  const byVac = {};
  (shortlists || []).forEach(s => { if (!byVac[s.vacancy_id]) byVac[s.vacancy_id] = []; byVac[s.vacancy_id].push(s); });
  if (Object.keys(byVac).length === 0) { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No shortlisted candidates yet.</p>'; return; }
  el.innerHTML = Object.entries(byVac).map(([vacId, candidates]) => {
    const vac = (vacs || []).find(v => String(v.id) === String(vacId));
    return `<div class="manager-job-block">
      <div class="manager-job-header" onclick="toggleManagerJob(this)">
        <h4 style="font-size:13.5px;font-weight:500;display:flex;align-items:center;gap:10px">
          <i class="ti ti-briefcase" style="color:var(--accent-purple)"></i>
          ${escapeHtml(vac?.title || 'Vacancy')}
          <span class="dept-count">${candidates.length} shortlisted</span>
        </h4>
        <i class="ti ti-chevron-down chevron"></i>
      </div>
      <div class="manager-job-body">
        ${candidates.map(c => {
          const myReview = (reviews || []).find(r => r.application_id === c.application_id && r.manager_id === currentUser.id);
          const decision = myReview?.decision;
          const icon     = decision === 'continue'    ? '<i class="ti ti-check manager-decision-icon continue"></i>'
                         : decision === 'no-continue' ? '<i class="ti ti-x manager-decision-icon no-continue"></i>'
                         : '<i class="ti ti-clock" style="color:var(--text-muted);font-size:14px"></i>';
          return `<div class="manager-candidate-row" onclick="openManagerCandidateModal('${c.application_id}')">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="applicant-avatar">${getInitials(c.candidate_name || 'CA')}</div>
              <div><div class="applicant-row-name">${escapeHtml(c.candidate_name || 'Candidate')}</div><div class="applicant-row-email">${escapeHtml(c.candidate_email || '')}</div></div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">${icon}<i class="ti ti-chevron-right" style="color:var(--text-muted)"></i></div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

function toggleManagerJob(header) { const body = header.nextElementSibling; const icon = header.querySelector('.chevron'); body.classList.toggle('open'); if (icon) icon.classList.toggle('open'); }

async function openManagerCandidateModal(appId) {
  const modal   = document.getElementById('managerCandidateModal');
  const content = document.getElementById('mcModalContent');
  const nameEl  = document.getElementById('mcModalName');
  content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Loading...</div>';
  modal.classList.add('open');
  const { data: app }     = await db.from('applications').select('*').eq('id', appId).single();
  if (!app) { content.innerHTML = '<p>Could not load.</p>'; return; }
  const { data: profile } = await db.from('profiles').select('*').eq('email', app.candidate_email).single();
  nameEl.textContent = app.candidate_name || 'Candidate';
  const answers   = safeParseJSON(app.answers, {});
  const vac       = vacanciesData.find(v => String(v.id) === String(app.vacancy_id));
  const questions = vac?.screening_questions || [];
  const answersHtml = questions.length > 0
    ? questions.map((q, qi) => {
        const chosen  = answers[qi] !== undefined ? q.opts?.[answers[qi]] : '—';
        const correct = answers[qi] === q.correct;
        return `<div style="padding:8px 0;border-bottom:1px solid var(--border)"><div style="font-size:12px;color:var(--text-muted);margin-bottom:3px">Q${qi+1}: ${escapeHtml(q.q)}</div><div style="font-size:13px;color:${correct ? 'var(--success)' : 'var(--danger)'};font-weight:500"><i class="ti ${correct ? 'ti-check' : 'ti-x'}"></i> ${escapeHtml(chosen || '—')}</div></div>`;
      }).join('')
    : '<p style="font-size:13px;color:var(--text-muted)">No questions.</p>';
  const { data: existingReview } = await db.from('manager_reviews').select('*').eq('application_id', appId).eq('manager_id', currentUser.id).maybeSingle();
  const currentDecision = existingReview?.decision; const currentReason = existingReview?.reason || '';
  const cvUrl   = profile?.cv_url || app.cv_url || '';
  const reasonId = `reason_${appId}`;
  content.innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px">
      <div class="applicant-avatar" style="width:52px;height:52px;font-size:18px">${getInitials(app.candidate_name || 'CA')}</div>
      <div><div style="font-size:15px;font-weight:600">${escapeHtml(app.candidate_name || '—')}</div><div style="font-size:12px;color:var(--text-muted)">${escapeHtml(app.candidate_email || '—')}</div></div>
    </div>
    <div class="card" style="margin-bottom:16px;padding:16px">
      <div class="card-title"><i class="ti ti-user"></i> Profile</div>
      <div class="info-row"><span class="key">Phone</span><span class="val">${escapeHtml(profile?.phone || '—')}</span></div>
      <div class="info-row"><span class="key">Location</span><span class="val">${escapeHtml(profile?.location || '—')}</span></div>
      <div style="margin-top:12px">${cvUrl ? `<a href="${cvUrl}" target="_blank" class="btn btn-secondary btn-sm"><i class="ti ti-file-cv"></i> View CV</a>` : '<span style="font-size:12px;color:var(--text-muted)">No CV.</span>'}</div>
    </div>
    <div class="card" style="margin-bottom:16px;padding:16px">
      <div class="card-title"><i class="ti ti-help-circle"></i> Answers</div>
      <div style="margin-bottom:8px"><span class="status-pill ${app.score >= 70 ? 'green' : app.score >= 40 ? 'yellow' : 'brand'}">Score: ${app.score}%</span></div>
      ${answersHtml}
    </div>
    <div class="card" style="padding:16px">
      <div class="card-title"><i class="ti ti-gavel"></i> My Decision</div>
      <div class="form-group" id="noReasonGroup_${appId}" style="${currentDecision === 'no-continue' ? '' : 'display:none'}">
        <label>Reason</label>
        <textarea id="${reasonId}" rows="2">${escapeHtml(currentReason)}</textarea>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
        <button class="btn ${currentDecision === 'continue' ? 'btn-success' : 'btn-secondary'}" onclick="setManagerDecision('${appId}','continue')"><i class="ti ti-check"></i> Continue</button>
        <button class="btn ${currentDecision === 'no-continue' ? 'btn-danger' : 'btn-secondary'}" onclick="showNoContinueReason('${appId}')"><i class="ti ti-x"></i> Don't Continue</button>
      </div>
      <div id="noContinueConfirm_${appId}" style="${currentDecision === 'no-continue' ? '' : 'display:none'};margin-top:10px">
        <button class="btn btn-danger" onclick="setManagerDecision('${appId}','no-continue')"><i class="ti ti-x"></i> Confirm</button>
      </div>
    </div>`;
}

function showNoContinueReason(appId) {
  const group     = document.getElementById(`noReasonGroup_${appId}`);
  const confirmEl = document.getElementById(`noContinueConfirm_${appId}`);
  if (group)     group.style.display     = 'block';
  if (confirmEl) confirmEl.style.display = 'block';
}

async function setManagerDecision(appId, decision) {
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();
  const { data: app }      = await db.from('applications').select('vacancy_id,candidate_name').eq('id', appId).single();
  const reason             = decision === 'no-continue' ? (document.getElementById(`reason_${appId}`)?.value?.trim() || '') : '';
  const { data: existing } = await db.from('manager_reviews').select('id').eq('application_id', appId).eq('manager_id', currentUser.id).maybeSingle();
  if (existing) { await db.from('manager_reviews').update({ decision, reason, reviewed_at: new Date().toISOString() }).eq('id', existing.id); }
  else { await db.from('manager_reviews').insert({ vacancy_id: app?.vacancy_id, application_id: appId, candidate_name: app?.candidate_name, manager_id: currentUser.id, manager_name: fullName, decision, reason, department: currentProfile.department, reviewed_at: new Date().toISOString() }); }
  showToast(decision === 'continue' ? 'Marked: Continue.' : 'Marked: Do not continue.');
  closeModal('managerCandidateModal');
  await renderManagerShortlists();
}

/* ===========================================
   BOOKINGS — TABS
=========================================== */
function renderBookingTabs() {
  const bar = document.getElementById('bookingTabBar'); if (!bar) return;

  if (userRole === 'candidate') {
    bar.style.display = 'none';
    document.querySelectorAll('.booking-panel').forEach(p => p.style.display = 'none');
    document.getElementById('bookingPanel-interview').style.display  = 'block';
    document.getElementById('candidateBookingSection').style.display = 'block';
    document.getElementById('adminBookingSection').style.display     = 'none';
    renderCandidateBookingSlots();
    return;
  }

  bar.style.display = '';
  const tabDefs = {
    admin:    [
      { id: 'availability', icon: 'ti-calendar-stats', label: 'Team Availability' },
      { id: 'interview',    icon: 'ti-video',           label: 'Interview Slots'  },
      { id: 'onboarding',   icon: 'ti-presentation',    label: 'Onboarding Slots' }
    ],
    manager:  [
      { id: 'availability', icon: 'ti-calendar-stats', label: 'Team Availability' },
      { id: 'onboarding',   icon: 'ti-presentation',    label: 'Onboarding Slots' }
    ],
    employee: [
      { id: 'availability', icon: 'ti-calendar-stats', label: 'Team Availability' },
      { id: 'onboarding',   icon: 'ti-presentation',    label: 'Onboarding Slots' }
    ]
  };

  const tabs = tabDefs[userRole] || [];
  bar.innerHTML = '';
  tabs.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'booking-tab-btn' + (i === 0 ? ' active' : '');
    btn.id        = 'bookingTabBtn_' + t.id;
    btn.innerHTML = `<i class="ti ${t.icon}"></i> ${t.label}`;
    btn.addEventListener('click', () => switchBookingTab(t.id));
    bar.appendChild(btn);
  });

  document.getElementById('candidateBookingSection').style.display = 'none';
  document.getElementById('adminBookingSection').style.display     = userRole === 'admin' ? 'block' : 'none';

  if (tabs.length > 0) switchBookingTab(tabs[0].id);
}

function switchBookingTab(panel) {
  document.querySelectorAll('.booking-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.booking-tab-btn').forEach(b => b.classList.remove('active'));
  const panelEl = document.getElementById(`bookingPanel-${panel}`);
  const btnEl   = document.getElementById(`bookingTabBtn_${panel}`);
  if (panelEl) panelEl.style.display = 'block';
  if (btnEl)   btnEl.classList.add('active');
  if (panel === 'interview')    renderAdminInterviewVacancies();
  if (panel === 'availability') renderAvailabilityVacancies();
  if (panel === 'onboarding')   renderOnboardingSlots();
}

/* ===========================================
   CANDIDATE BOOKING — vacancy-specific slots
=========================================== */
async function renderCandidateBookingSlots() {
  const grid         = document.getElementById('slotsGrid');
  const myBookDiv    = document.getElementById('myCurrentBooking');
  const availSection = document.getElementById('availableSlotsSection');

  const { data: myApps } = await db.from('applications').select('*').eq('user_id', currentUser.id).eq('status', 'interview1');

  if (!myApps || myApps.length === 0) {
    if (myBookDiv)    myBookDiv.classList.add('hidden');
    if (availSection) availSection.style.display = 'block';
    if (grid) grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">
        <i class="ti ti-lock" style="font-size:32px;display:block;margin-bottom:12px"></i>
        <div style="font-size:14px;font-weight:500">Interview slots not yet available</div>
        <div style="font-size:12px;margin-top:6px">You will see slots once shortlisted for an interview.</div>
      </div>`;
    return;
  }

  const myVacancyIds = myApps.map(a => String(a.vacancy_id));

  const { data: allSlots } = await db.from('bookings')
    .select('*')
    .in('vacancy_id', myVacancyIds)
    .order('slot_date', { ascending: true })
    .order('slot_time', { ascending: true });

  slotsData = allSlots || [];
  const myBooking = slotsData.find(s => s.booked_by_email === currentUser?.email);

  if (myBooking) {
    if (myBookDiv)    myBookDiv.classList.remove('hidden');
    if (availSection) availSection.style.display = 'none';
    const dateStr   = new Date(`${myBooking.slot_date}T${myBooking.slot_time}`).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr   = myBooking.slot_time.slice(0,5);
    const myApp     = myApps.find(a => String(a.vacancy_id) === String(myBooking.vacancy_id));
    myBookDiv.innerHTML = `
      <div class="my-booking-card">
        <div class="my-booking-info">
          <div class="my-booking-label"><i class="ti ti-calendar-check"></i> Your Interview${myApp ? ` — ${escapeHtml(myApp.vacancy_title || '')}` : ''}</div>
          <div class="my-booking-time">${timeStr}</div>
          <div class="my-booking-date">${dateStr}</div>
        </div>
        <button class="btn btn-danger" onclick="confirmCancelInterview('${myBooking.id}','${myBooking.slot_date}','${timeStr}')">
          <i class="ti ti-x"></i> Cancel
        </button>
      </div>`;
  } else {
    if (myBookDiv)    myBookDiv.classList.add('hidden');
    if (availSection) availSection.style.display = 'block';
    const available = slotsData.filter(s => !s.booked_by_email);
    if (!grid) return;
    if (available.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-muted)">No slots available yet. The administrator will add interview slots shortly.</div>`;
      return;
    }
    grid.innerHTML = '';
    available.forEach(slot => {
      const matchingApp = myApps.find(a => String(a.vacancy_id) === String(slot.vacancy_id));
      const vacTitle    = matchingApp?.vacancy_title || '';
      const dateStr = new Date(`${slot.slot_date}T${slot.slot_time}`).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      grid.innerHTML += `
        <div class="slot-card available">
          ${vacTitle ? `<div style="font-size:10px;color:var(--brand);font-weight:600;margin-bottom:4px">${escapeHtml(vacTitle)}</div>` : ''}
          <div class="slot-date">${dateStr}</div>
          <div class="slot-time">${slot.slot_time.slice(0,5)}</div>
          <div class="slot-duration">30 min</div>
          <span class="slot-status available">Available</span>
          <div style="margin-top:10px">
            <button class="btn btn-primary btn-full btn-sm" onclick="bookSlot('${slot.id}','${slot.slot_date}','${slot.slot_time.slice(0,5)}')">
              <i class="ti ti-calendar-plus"></i> Book
            </button>
          </div>
        </div>`;
    });
  }
}

async function bookSlot(slotId, date, time) {
  if (!currentUser) return;
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();
  const { error } = await db.from('bookings').update({ booked_by_email: currentUser.email, booked_by_name: fullName, booked_at: new Date().toISOString() }).eq('id', slotId).is('booked_by_email', null);
  if (error) { alert('Could not book: ' + error.message); return; }
  sendInterviewConfirmationEmail(currentUser.email, fullName, date, time);
  await renderCandidateBookingSlots();
  showToast('Interview booked!');
}

function confirmCancelInterview(slotId, date, time) {
  document.getElementById('cancelInterviewText').innerHTML = `Cancel your interview on <strong>${date} at ${time}</strong>?`;
  document.getElementById('cancelInterviewYes').onclick   = async () => { closeModal('cancelInterviewModal'); await cancelSlot(slotId, date, time); };
  document.getElementById('cancelInterviewModal').classList.add('open');
}

async function cancelSlot(slotId, date, time) {
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();
  const { error } = await db.from('bookings').update({ booked_by_email: null, booked_by_name: null, booked_at: null }).eq('id', slotId);
  if (error) { alert('Could not cancel: ' + error.message); return; }
  sendInterviewCancellationEmail(currentUser.email, fullName, date, time);
  await renderCandidateBookingSlots();
  showToast('Booking cancelled.');
}

/* ===========================================
   AVAILABILITY — invite-gated
=========================================== */
async function renderAvailabilityVacancies() {
  const panel = document.getElementById('bookingPanel-availability'); if (!panel) return;
  const { data: allVacs } = await db.from('vacancies').select('*').order('created_at', { ascending: false });
  let list = allVacs || [];

  if (userRole !== 'admin') {
    const { data: inviteRows } = await db.from('calendar_invites').select('vacancy_id,invitee_id');
    const myVacIds = new Set();
    (inviteRows || []).forEach(row => {
      const ids = safeParseJSON(row.invitee_id, []);
      if (ids.includes(currentUser.id)) myVacIds.add(String(row.vacancy_id));
    });
    list = list.filter(v => myVacIds.has(String(v.id)));
  }

  let html = `
    <div class="page-header" style="padding-top:16px">
      <h1 style="font-size:20px">Team Availability</h1>
      <p>${userRole === 'admin' ? 'Manage team availability and invite members.' : 'Mark your availability for panels you have been invited to.'}</p>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">`;

  if (list.length === 0) {
    html += `<div class="card" style="text-align:center;padding:40px">
      <i class="ti ti-lock" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:12px"></i>
      <div style="font-size:14px;color:var(--text-muted)">${userRole === 'admin' ? 'No vacancies yet.' : 'You have not been invited to any availability calendars yet.'}</div>
    </div>`;
  } else {
    html += list.map(v => `
      <div class="admin-vacancy-block" style="cursor:pointer" onclick="openAvailabilityForVacancy('${v.id}','${escapeHtml(v.title)}')">
        <div class="admin-vacancy-header">
          <div><div class="admin-vacancy-title">${escapeHtml(v.title)}</div><div class="admin-vacancy-dept">${escapeHtml(v.department || '')}</div></div>
          <i class="ti ti-chevron-right" style="color:var(--text-muted)"></i>
        </div>
      </div>`).join('');
  }
  html += `</div><div id="availabilityVacancyDetail" style="display:none"></div>`;
  panel.innerHTML = html;
}

async function openAvailabilityForVacancy(vacId, vacTitle) {
  currentBookingVacancyId = vacId;
  const detail = document.getElementById('availabilityVacancyDetail'); if (!detail) return;
  detail.style.display = 'block';
  detail.innerHTML = `
    <div class="card">
      <div class="card-title" style="font-size:14px;font-weight:600;margin-bottom:4px">
        <i class="ti ti-calendar-stats"></i> Availability: ${escapeHtml(vacTitle)}
      </div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Click slots to mark your availability.</p>
      <div id="availabilityLegend_${vacId}" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px"></div>
      <div id="availabilityCalendar_${vacId}"></div>
      <div style="margin-top:20px">
        <div class="card-title"><i class="ti ti-star"></i> Recommended Slots</div>
        <div id="recommendedSlots_${vacId}"></div>
      </div>
      ${userRole === 'admin' ? `
      <div style="margin-top:20px">
        <div class="card-title"><i class="ti ti-user-plus"></i> Invite Team Members</div>
        <div id="availInviteList_${vacId}"></div>
      </div>` : ''}
    </div>`;
  detail.scrollIntoView({ behavior: 'smooth' });
  await renderAvailabilityCalendarForVacancy(vacId);
  if (userRole === 'admin') await renderAvailInviteList(vacId);
}

async function renderAvailabilityCalendarForVacancy(vacId) {
  const wrap = document.getElementById(`availabilityCalendar_${vacId}`); if (!wrap) return;
  const { data } = await db.from('team_availability').select('*').eq('vacancy_id', vacId);
  allAvailability = data || [];

  const userColourMap = {}; let colourIdx = 0;
  allAvailability.forEach(row => { if (!userColourMap[row.user_id]) { userColourMap[row.user_id] = teamColours[colourIdx % teamColours.length]; colourIdx++; } });
  if (!userColourMap[currentUser.id]) userColourMap[currentUser.id] = teamColours[colourIdx % teamColours.length];
  myAvailability = new Set(allAvailability.filter(r => r.user_id === currentUser.id).map(r => `${r.slot_date}|${r.slot_time}`));

  const usersInData = [...new Set(allAvailability.map(r => r.user_id))];
  const legend      = document.getElementById(`availabilityLegend_${vacId}`);
  if (legend) {
    legend.innerHTML = usersInData.map(uid => {
      const row  = allAvailability.find(r => r.user_id === uid);
      const name = row?.user_name || (uid === currentUser.id ? `${currentProfile.first_name} ${currentProfile.last_name}`.trim() : 'Team Member');
      return `<span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary)"><span class="avail-legend-dot" style="background:${userColourMap[uid] || '#ccc'}"></span>${escapeHtml(name)}</span>`;
    }).join('') + `<span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--success)"><span class="avail-legend-dot" style="background:var(--success)"></span> Recommended</span>`;
  }

  const days = []; let d = new Date();
  while (days.length < 5) { d = new Date(d); d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) days.push(d.toISOString().slice(0,10)); }
  const times = [];
  for (let h = 9; h < 15; h++) { times.push(`${String(h).padStart(2,'0')}:00`); times.push(`${String(h).padStart(2,'0')}:30`); }
  const totalUsers = Math.max(usersInData.length, 1);

  let html = `<div class="availability-calendar-wrap"><table class="availability-table"><thead><tr><th style="width:60px">Time</th>${days.map(day => { const dt = new Date(day + 'T12:00:00'); return `<th>${dt.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}</th>`; }).join('')}</tr></thead><tbody>`;

  times.forEach(time => {
    html += `<tr><td class="avail-time-label">${time}</td>`;
    days.forEach(day => {
      const key       = `${day}|${time}:00`;
      const selectors = allAvailability.filter(r => r.slot_date === day && r.slot_time.slice(0,5) === time);
      const count     = selectors.length; const isMine = myAvailability.has(key); const isRec = count > 0 && count >= totalUsers;
      const dots      = selectors.map(r => `<span class="avail-dot" style="background:${userColourMap[r.user_id] || '#ccc'}"></span>`).join('');
      let slotClass   = 'avail-slot'; let slotStyle = '';
      if (isMine)    { slotClass += ' selected-mine'; slotStyle = `background:${userColourMap[currentUser.id]}33;border-color:${userColourMap[currentUser.id]}`; }
      if (count >= 2)  slotClass += ' multi-selected';
      if (isRec)       slotClass += ' recommended';
      html += `<td><div class="${slotClass}" style="${slotStyle}" onclick="toggleAvailabilityForVacancy('${vacId}','${day}','${time}:00','${userColourMap[currentUser.id] || '#00aeef'}')">${dots}${count >= 2 ? `<span class="avail-count">${count}</span>` : ''}</div></td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  wrap.innerHTML = html;

  const recEl = document.getElementById(`recommendedSlots_${vacId}`); if (!recEl) return;
  const recs  = [];
  days.forEach(day => { times.forEach(time => { const s = allAvailability.filter(r => r.slot_date === day && r.slot_time.slice(0,5) === time); if (s.length >= totalUsers && totalUsers > 0) { const dt = new Date(day + 'T12:00:00'); recs.push({ dateStr: dt.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' }), time }); } }); });
  recEl.innerHTML = recs.length === 0 ? '<p style="font-size:13px;color:var(--text-muted)">No slots where all members are available yet.</p>' : recs.map(r => `<span class="recommended-slot-chip"><i class="ti ti-star"></i> ${r.dateStr} at ${r.time}</span>`).join('');
}

async function toggleAvailabilityForVacancy(vacId, date, time, colour) {
  const key = `${date}|${time}`; const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();
  if (myAvailability.has(key)) {
    myAvailability.delete(key);
    await db.from('team_availability').delete().eq('user_id', currentUser.id).eq('slot_date', date).eq('slot_time', time).eq('vacancy_id', vacId);
  } else {
    myAvailability.add(key);
    await db.from('team_availability').upsert({
      user_id: currentUser.id, user_name: fullName, user_colour: colour,
      slot_date: date, slot_time: time, vacancy_id: vacId,
      created_at: new Date().toISOString()
    }, { onConflict: 'user_id,slot_date,slot_time,vacancy_id' });
  }
  await renderAvailabilityCalendarForVacancy(vacId);
}

async function renderAvailInviteList(vacId) {
  const el = document.getElementById(`availInviteList_${vacId}`); if (!el) return;
  const { data: members } = await db.from('profiles').select('*').in('role', ['admin','manager','employee']).order('first_name');
  if (!members || members.length === 0) { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No team members found.</p>'; return; }
  const { data: inviteRow } = await db.from('calendar_invites').select('*').eq('vacancy_id', vacId).maybeSingle();
  const invitedIds = new Set(safeParseJSON(inviteRow?.invitee_id, []));
  el.innerHTML = members.map(m => {
    const fullName = `${m.first_name} ${m.last_name}`.trim() || m.email;
    const checked  = invitedIds.has(m.id) || m.id === currentUser.id;
    return `<label class="manager-select-row ${checked ? 'selected' : ''}">
      <div><div class="manager-select-name">${escapeHtml(fullName)}</div><div class="manager-select-dept">${escapeHtml(m.email)} · ${m.role}</div></div>
      <input type="checkbox" value="${m.id}" ${checked ? 'checked' : ''} ${m.id === currentUser.id ? 'disabled' : ''} onchange="this.closest('.manager-select-row').classList.toggle('selected',this.checked)"/>
    </label>`;
  }).join('') + `
    <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="saveAvailInvites('${vacId}')">
      <i class="ti ti-send"></i> Save Invites
    </button>
    <div id="inviteSaveMsg_${vacId}" style="font-size:12px;color:var(--success);margin-top:6px;display:none"><i class="ti ti-circle-check"></i> Saved!</div>`;
}

async function saveAvailInvites(vacId) {
  const checkboxes = document.querySelectorAll(`#availInviteList_${vacId} input[type="checkbox"]:checked`);
  const ids = [...checkboxes].map(c => c.value);
  const { error } = await db.from('calendar_invites').upsert(
    { vacancy_id: vacId, invitee_id: JSON.stringify(ids), updated_at: new Date().toISOString() },
    { onConflict: 'vacancy_id' }
  );
  if (error) {
    await db.from('calendar_invites').delete().eq('vacancy_id', vacId);
    await db.from('calendar_invites').insert({ vacancy_id: vacId, invitee_id: JSON.stringify(ids), updated_at: new Date().toISOString() });
  }
  const msg = document.getElementById(`inviteSaveMsg_${vacId}`);
  if (msg) { msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 3000); }
  showToast('Invites saved — selected members can now see this calendar.');
}

/* ===========================================
   ADMIN INTERVIEW SLOTS
=========================================== */
async function renderAdminInterviewVacancies() {
  const panel = document.getElementById('bookingPanel-interview'); if (!panel) return;
  const { data: vacs } = await db.from('vacancies').select('*').order('created_at', { ascending: false });
  const list = vacs || [];
  let html = `
    <div class="page-header" style="padding-top:16px">
      <h1 style="font-size:20px">Interview Slots</h1>
      <p>Create interview slots per vacancy. Shortlisted candidates will see and book these slots.</p>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">`;
  if (list.length === 0) { html += '<p style="font-size:13px;color:var(--text-muted)">No vacancies yet.</p>'; }
  else { html += list.map(v => `
      <div class="admin-vacancy-block" style="cursor:pointer" onclick="openInterviewSlotsForVacancy('${v.id}','${escapeHtml(v.title)}')">
        <div class="admin-vacancy-header">
          <div><div class="admin-vacancy-title">${escapeHtml(v.title)}</div><div class="admin-vacancy-dept">${escapeHtml(v.department || '')}</div></div>
          <i class="ti ti-chevron-right" style="color:var(--text-muted)"></i>
        </div>
      </div>`).join(''); }
  html += `</div><div id="interviewVacancyDetail" style="display:none"></div>`;
  panel.innerHTML = html;
}

async function openInterviewSlotsForVacancy(vacId, vacTitle) {
  currentBookingVacancyId = vacId;
  const detail = document.getElementById('interviewVacancyDetail'); if (!detail) return;
  const { data: slots }       = await db.from('bookings').select('*').eq('vacancy_id', vacId).order('slot_date', { ascending: true }).order('slot_time', { ascending: true });
  const { data: shortlisted } = await db.from('applications').select('*').eq('vacancy_id', vacId).eq('status', 'interview1');
  detail.style.display = 'block';
  detail.innerHTML = `
    <div class="card flex-between" style="margin-bottom:16px">
      <div>
        <div class="card-title" style="font-size:14px;font-weight:600"><i class="ti ti-video"></i> ${escapeHtml(vacTitle)} — Interview Slots</div>
        <div style="font-size:12px;color:var(--text-muted)">Candidates with status "1st Interview" can see and book these slots.</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openAddSlotForVacancy('${vacId}')"><i class="ti ti-plus"></i> Add Slot</button>
    </div>
    ${(shortlisted || []).length > 0 ? `
    <div class="card" style="margin-bottom:16px">
      <div class="card-title"><i class="ti ti-user-check"></i> Shortlisted Candidates</div>
      ${(shortlisted || []).map(a => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="applicant-avatar">${getInitials(a.candidate_name || 'CA')}</div>
            <div>
              <div style="font-size:13px;font-weight:500">${escapeHtml(a.candidate_name || '—')}</div>
              <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(a.candidate_email)}</div>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="inviteCandidateToBookSlot('${a.candidate_email}','${escapeHtml(a.candidate_name || '')}','${escapeHtml(vacTitle)}')">
            <i class="ti ti-mail"></i> Send Reminder
          </button>
        </div>`).join('')}
    </div>` : ''}
    <button class="btn btn-secondary btn-sm" style="margin-bottom:12px" onclick="openInterviewSlotsForVacancy('${vacId}','${escapeHtml(vacTitle)}')">
      <i class="ti ti-refresh"></i> Refresh
    </button>
    <div id="adminSlotsGrid_${vacId}">${renderAdminSlotCards(slots || [], vacId)}</div>`;
  detail.scrollIntoView({ behavior: 'smooth' });
}

function renderAdminSlotCards(slots, vacId) {
  if (slots.length === 0) return `
    <div style="text-align:center;padding:30px;color:var(--text-muted)">
      <i class="ti ti-calendar-off" style="font-size:32px;display:block;margin-bottom:10px"></i>
      No slots yet — click "Add Slot" to create interview slots.
    </div>`;
  return `<div class="slots-grid">` + slots.map(slot => {
    const dateStr  = new Date(`${slot.slot_date}T${slot.slot_time}`).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr  = slot.slot_time.slice(0,5);
    const isBooked = !!slot.booked_by_email;
    return `<div class="admin-slot-card ${isBooked ? 'booked' : 'available'}">
      <div><div class="admin-slot-time">${timeStr}</div><div class="admin-slot-date">${dateStr}</div></div>
      ${isBooked
        ? `<div class="admin-slot-candidate">
              <div class="admin-slot-candidate-name"><i class="ti ti-user" style="color:var(--accent-purple)"></i> ${escapeHtml(slot.booked_by_name || 'Candidate')}</div>
              <div class="admin-slot-candidate-email">${escapeHtml(slot.booked_by_email || '')}</div>
           </div>
           <span style="background:var(--success-light);color:var(--success);border-radius:20px;padding:3px 10px;font-size:10px;font-weight:600">Booked</span>
           <button class="btn btn-secondary btn-sm" onclick="openCandidateProfileByEmail('${escapeHtml(slot.booked_by_email || '')}')"><i class="ti ti-eye"></i> Profile</button>`
        : `<span class="slot-status available" style="display:inline-block;margin:4px 0">Available</span>`}
      <button class="btn btn-danger btn-sm" style="margin-top:6px" onclick="adminDeleteSlotForVacancy('${slot.id}','${vacId}')"><i class="ti ti-trash"></i></button>
    </div>`;
  }).join('') + `</div>`;
}

function openAddSlotForVacancy(vacId) {
  currentBookingVacancyId = vacId;
  document.getElementById('newSlotDate').value = '';
  document.getElementById('newSlotTime').value = '';
  document.getElementById('addSlotModal').classList.add('open');
}

async function addSlot() {
  const date = document.getElementById('newSlotDate').value;
  const time = document.getElementById('newSlotTime').value;
  if (!date || !time) { alert('Please select date and time.'); return; }
  if (!currentBookingVacancyId) { alert('No vacancy selected.'); return; }
  const { error } = await db.from('bookings').insert({
    slot_date: date, slot_time: time.length === 5 ? time + ':00' : time,
    vacancy_id: currentBookingVacancyId, booked_by_email: null, booked_by_name: null,
    created_by: currentUser.id, created_at: new Date().toISOString()
  });
  if (error) { alert('Could not add slot: ' + error.message); return; }
  closeModal('addSlotModal');
  const vac = vacanciesData.find(v => String(v.id) === String(currentBookingVacancyId));
  await openInterviewSlotsForVacancy(currentBookingVacancyId, vac?.title || '');
  showToast('Slot added. Shortlisted candidates can now see and book it.');
}

async function adminDeleteSlotForVacancy(slotId, vacId) {
  if (!confirm('Delete this slot?')) return;
  await db.from('bookings').delete().eq('id', slotId);
  const vac = vacanciesData.find(v => String(v.id) === String(vacId));
  await openInterviewSlotsForVacancy(vacId, vac?.title || '');
  showToast('Slot deleted.');
}

function inviteCandidateToBookSlot(email, name, vacTitle) {
  sendCandidateInterviewInviteEmail(email, name, vacTitle);
  showToast(`Reminder sent to ${name}.`);
}

/* ===========================================
   ONBOARDING SLOTS — no vacancy_id column
=========================================== */
async function renderOnboardingSlots() {
  const panel = document.getElementById('bookingPanel-onboarding'); if (!panel) return;
  const { data, error } = await db.from('onboarding_slots').select('*').order('slot_date', { ascending: true }).order('slot_time', { ascending: true });
  const slots = (!error && data) ? data : [];

  let html = `
    <div class="page-header" style="padding-top:16px">
      <h1 style="font-size:20px">Onboarding Slots</h1>
      <p>Book onboarding presentation sessions.</p>
    </div>`;

  if (userRole === 'admin') {
    html += `<div style="margin-bottom:16px"><button class="btn btn-primary btn-sm" onclick="openAddOnboardingSlot()"><i class="ti ti-plus"></i> Add Slot</button></div>`;
  }

  if (slots.length === 0) {
    html += `<div class="card" style="text-align:center;padding:40px">
      <i class="ti ti-calendar-off" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:12px"></i>
      <div style="font-size:14px;color:var(--text-muted)">${userRole === 'admin' ? 'No onboarding slots yet.' : 'No onboarding slots available yet.'}</div>
    </div>`;
  } else {
    html += '<div class="slots-grid">';
    slots.forEach(slot => {
      const dateStr = new Date(`${slot.slot_date}T${slot.slot_time}`).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      const isMine  = slot.booked_by_id === currentUser?.id;
      const isOther = slot.booked_by_id && !isMine;
      let cls = 'slot-card available', statusHtml = '<span class="slot-status available">Available</span>', extraHtml = '', actionHtml = '';
      if (isMine) {
        cls = 'slot-card booked-mine'; statusHtml = '<span class="slot-status mine">Your Session</span>';
        if (slot.booked_by_name) extraHtml  = `<div class="slot-presenter">${escapeHtml(slot.booked_by_name)}</div>`;
        if (slot.topic)          extraHtml += `<div class="slot-topic">${escapeHtml(slot.topic)}</div>`;
        actionHtml = `<div style="margin-top:10px"><button class="btn btn-danger btn-full btn-sm" onclick="cancelOnboardingSlot('${slot.id}')"><i class="ti ti-x"></i> Cancel</button></div>`;
      } else if (isOther) {
        cls = 'slot-card booked-admin'; statusHtml = '<span class="slot-status onboarding-booked">Booked</span>';
        if (slot.booked_by_name) extraHtml  = `<div class="slot-presenter">${escapeHtml(slot.booked_by_name)}</div>`;
        if (slot.topic)          extraHtml += `<div class="slot-topic">${escapeHtml(slot.topic)}</div>`;
        if (userRole === 'admin') actionHtml = `<div style="margin-top:10px"><button class="btn btn-danger btn-full btn-sm" onclick="cancelOnboardingSlot('${slot.id}')"><i class="ti ti-x"></i> Cancel</button></div>`;
      } else {
        actionHtml = `<div style="margin-top:10px"><button class="btn btn-primary btn-full btn-sm" onclick="openOnboardingBookModal('${slot.id}')"><i class="ti ti-calendar-plus"></i> Book</button></div>`;
      }
      html += `<div class="${cls}"><div class="slot-date">${dateStr}</div><div class="slot-time">${slot.slot_time.slice(0,5)}</div>${statusHtml}${extraHtml}${actionHtml}</div>`;
    });
    html += '</div>';
  }
  panel.innerHTML = html;
}

function openAddOnboardingSlot() {
  document.getElementById('newOnboardingDate').value = '';
  document.getElementById('newOnboardingTime').value = '';
  document.getElementById('addOnboardingSlotModal').classList.add('open');
}

async function addOnboardingSlot() {
  const date = document.getElementById('newOnboardingDate').value;
  const time = document.getElementById('newOnboardingTime').value;
  if (!date || !time) { alert('Please select date and time.'); return; }
  // No vacancy_id — column does not exist in this table
  const { error } = await db.from('onboarding_slots').insert({
    slot_date: date, slot_time: time.length === 5 ? time + ':00' : time,
    created_by: currentUser.id, created_at: new Date().toISOString()
  });
  if (error) { alert('Could not add slot: ' + error.message); return; }
  closeModal('addOnboardingSlotModal');
  await renderOnboardingSlots();
  showToast('Onboarding slot added.');
}

function openOnboardingBookModal(slotId) {
  pendingOnboardingSlotId = slotId;
  document.getElementById('onboardingTopic').value         = '';
  document.getElementById('onboardingPresenterName').value = '';
  document.getElementById('onboardingTopicModal').classList.add('open');
}

async function confirmOnboardingBook() {
  const topic     = document.getElementById('onboardingTopic').value.trim();
  const presenter = document.getElementById('onboardingPresenterName').value.trim();
  if (!presenter) { alert('Please enter your name.'); return; }
  if (!topic)     { alert('Please enter a topic.'); return; }
  const slotId = pendingOnboardingSlotId; if (!slotId) return;
  const { error } = await db.from('onboarding_slots').update({
    booked_by_id: currentUser.id, booked_by_name: presenter,
    booked_by_email: currentUser.email, topic, booked_at: new Date().toISOString()
  }).eq('id', slotId).is('booked_by_id', null);
  if (error) { alert('Could not book: ' + error.message); return; }
  closeModal('onboardingTopicModal');
  pendingOnboardingSlotId = null;
  await renderOnboardingSlots();
  showToast('Session booked.');
}

async function cancelOnboardingSlot(slotId) {
  if (!confirm('Cancel this session?')) return;
  const { error } = await db.from('onboarding_slots').update({
    booked_by_id: null, booked_by_name: null, booked_by_email: null, topic: null, booked_at: null
  }).eq('id', slotId);
  if (error) { alert('Could not cancel: ' + error.message); return; }
  await renderOnboardingSlots();
  showToast('Session cancelled.');
}

/* ===========================================
   STATS
=========================================== */
async function renderStats() {
  const el = document.getElementById('statsPanel'); if (!el) return;
  let periodBar = document.getElementById('statsPeriodBar');
  if (!periodBar) {
    const tab = document.getElementById('tab-stats');
    const bar = document.createElement('div');
    bar.id = 'statsPeriodBar';
    bar.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:20px;padding-top:28px';
    bar.innerHTML = `
      <span style="font-size:12px;color:var(--text-muted);font-weight:600">Period:</span>
      <button class="btn btn-sm ${statsCurrentPeriod === 'all'   ? 'btn-primary' : 'btn-secondary'}" onclick="setStatsPeriod('all')">All Time</button>
      <button class="btn btn-sm ${statsCurrentPeriod === 'year'  ? 'btn-primary' : 'btn-secondary'}" onclick="setStatsPeriod('year')">This Year</button>
      <button class="btn btn-sm ${statsCurrentPeriod === 'month' ? 'btn-primary' : 'btn-secondary'}" onclick="setStatsPeriod('month')">This Month</button>`;
    tab.insertBefore(bar, el);
  }

  const now        = new Date();
  const yearStart  = new Date(now.getFullYear(), 0, 1).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  function filterByPeriod(rows, dateField) {
    if (statsCurrentPeriod === 'all') return rows;
    const cutoff = statsCurrentPeriod === 'year' ? yearStart : monthStart;
    return rows.filter(r => r[dateField] && r[dateField] >= cutoff);
  }

  const [vacRes, appRes, bookRes] = await Promise.all([
    db.from('vacancies').select('id,posted,created_at'),
    db.from('applications').select('id,score,status,submitted_at'),
    db.from('bookings').select('id,booked_by_email,created_at')
  ]);

  const apps      = filterByPeriod(appRes.data  || [], 'submitted_at');
  const vacancies = filterByPeriod(vacRes.data  || [], 'created_at');
  const bookings  = filterByPeriod(bookRes.data || [], 'created_at');

  const postedJobs  = vacancies.filter(v => v.posted);
  const bookedSlots = bookings.filter(b => b.booked_by_email);
  const stageCounts = {}; Object.keys(statusConfig).forEach(k => { stageCounts[k] = 0; });
  apps.forEach(a => { if (stageCounts[a.status] !== undefined) stageCounts[a.status]++; });
  const goodFit     = apps.filter(a => a.score >= 70).length;
  const moderateFit = apps.filter(a => a.score >= 40 && a.score < 70).length;
  const poorFit     = apps.filter(a => a.score < 40).length;
  const stageLabels = ['Applied','Reviewing','1st Int.','Assessment','2nd Int.','Final','Offered'];
  const stageKeys   = ['applied','reviewing','interview1','assessment','interview2','final','offered'];
  const stageVals   = stageKeys.map(k => stageCounts[k] || 0);
  const maxVal      = Math.max(...stageVals, 1);
  const barColors   = ['var(--brand)','var(--accent-purple)','var(--success)','var(--accent-yellow)','var(--success)','var(--accent-green)','var(--warning)'];
  const periodLabel = statsCurrentPeriod === 'all' ? 'All Time' : statsCurrentPeriod === 'year' ? `${now.getFullYear()}` : `${now.toLocaleString('en-ZA', { month: 'long' })} ${now.getFullYear()}`;

  el.innerHTML = `
    <div id="statsDownloadTarget">
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Showing: <strong>${periodLabel}</strong></p>
      <div class="stats-grid">
        <div class="stat-card brand-accent"><i class="ti ti-users s-icon"></i><div class="s-label">Applications</div><div class="s-value">${apps.length}</div><div class="s-sub">In period</div></div>
        <div class="stat-card purple-accent"><i class="ti ti-briefcase s-icon"></i><div class="s-label">Vacancies</div><div class="s-value">${postedJobs.length}</div><div class="s-sub">Posted</div></div>
        <div class="stat-card yellow-accent"><i class="ti ti-calendar-check s-icon"></i><div class="s-label">Interviews</div><div class="s-value">${bookedSlots.length}</div><div class="s-sub">Booked</div></div>
        <div class="stat-card green-accent"><i class="ti ti-circle-check s-icon"></i><div class="s-label">Good Fit</div><div class="s-value">${goodFit}</div><div class="s-sub">Score 70%+</div></div>
      </div>
      <div class="stats-chart-row">
        <div class="chart-card">
          <h4><i class="ti ti-chart-bar" style="color:var(--brand);margin-right:6px"></i>Pipeline</h4>
          <div class="bar-chart">${stageVals.map((val, i) => `<div class="bar-col"><div class="bar-val">${val}</div><div class="bar" style="height:${Math.round((val/maxVal)*100)}%;background:${barColors[i]}"></div><div class="bar-label">${stageLabels[i]}</div></div>`).join('')}</div>
        </div>
        <div class="chart-card">
          <h4><i class="ti ti-chart-pie" style="color:var(--accent-purple);margin-right:6px"></i>Fit Distribution</h4>
          <div class="donut-wrap">
            <svg width="110" height="110" viewBox="0 0 110 110">${buildDonutPaths(goodFit, moderateFit, poorFit)}</svg>
            <div class="donut-legend">
              <div class="legend-item"><div class="legend-dot" style="background:var(--success)"></div>Good — <strong>${goodFit}</strong></div>
              <div class="legend-item"><div class="legend-dot" style="background:var(--accent-yellow)"></div>Moderate — <strong>${moderateFit}</strong></div>
              <div class="legend-item"><div class="legend-dot" style="background:var(--danger)"></div>Not a Fit — <strong>${poorFit}</strong></div>
              <div class="legend-item" style="margin-top:4px;border-top:1px solid var(--border);padding-top:6px"><div class="legend-dot" style="background:var(--text-muted)"></div>Total — <strong>${apps.length}</strong></div>
            </div>
          </div>
        </div>
      </div>
      <div class="chart-card">
        <h4><i class="ti ti-table" style="color:var(--brand-dark);margin-right:6px"></i>Stage Breakdown</h4>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="border-bottom:2px solid var(--border)">
            <th style="text-align:left;padding:8px 0;color:var(--text-muted);font-weight:600;font-size:11px;text-transform:uppercase">Stage</th>
            <th style="text-align:right;padding:8px 0;color:var(--text-muted);font-weight:600;font-size:11px;text-transform:uppercase">Count</th>
            <th style="text-align:right;padding:8px 0;color:var(--text-muted);font-weight:600;font-size:11px;text-transform:uppercase">%</th>
          </tr></thead>
          <tbody>${stageKeys.map((k, i) => `<tr style="border-bottom:1px solid var(--border)"><td style="padding:9px 0;display:flex;align-items:center;gap:8px"><div style="width:10px;height:10px;border-radius:50%;background:${barColors[i]};flex-shrink:0"></div>${stageLabels[i]}</td><td style="text-align:right;font-weight:600">${stageCounts[k] || 0}</td><td style="text-align:right;color:var(--text-muted)">${apps.length > 0 ? Math.round(((stageCounts[k] || 0) / apps.length) * 100) : 0}%</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

function setStatsPeriod(period) { statsCurrentPeriod = period; renderStats(); }

function buildDonutPaths(good, moderate, poor) {
  const total = good + moderate + poor;
  if (total === 0) return `<circle cx="55" cy="55" r="40" fill="none" stroke="var(--border)" stroke-width="18"/><text x="55" y="60" text-anchor="middle" font-size="12" fill="var(--text-muted)">0</text>`;
  const cx = 55, cy = 55, r = 40, circ = 2 * Math.PI * r; let offset = 0;
  const segs  = [{ count: good, color: 'var(--success)' },{ count: moderate, color: 'var(--accent-yellow)' },{ count: poor, color: 'var(--danger)' }].filter(s => s.count > 0);
  const paths = segs.map(seg => { const dash = (seg.count / total) * circ; const gap = circ - dash; const path = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="18" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${-offset}" style="transform-origin:${cx}px ${cy}px;transform:rotate(-90deg)"/>`; offset += dash; return path; }).join('');
  return paths + `<text x="${cx}" y="${cy+5}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--text-primary)">${total}</text>`;
}

function downloadStatsImage() {
  const target = document.getElementById('statsDownloadTarget');
  if (!target) { alert('Stats not loaded yet.'); return; }
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`<!DOCTYPE html><html><head><title>Communicare Stats</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
    <style>body{font-family:'DM Sans',sans-serif;padding:24px;background:#f4f8fc}*{box-sizing:border-box}</style>
    </head><body>${target.outerHTML}<script>window.onload=function(){window.print();}<\/script></body></html>`);
  printWindow.document.close();
}

/* ===========================================
   SIGN TAB
=========================================== */
async function renderSignTab() {
  if (userRole === 'admin') {
    document.getElementById('signAdminView').style.display   = 'block';
    document.getElementById('signManagerView').style.display = 'none';
    await renderSignAdminView();
  } else if (userRole === 'manager' || userRole === 'employee') {
    document.getElementById('signAdminView').style.display   = 'none';
    document.getElementById('signManagerView').style.display = 'block';
    await renderSignManagerView();
  }
}

async function renderSignAdminView() {
  await renderAllDocsList();
  await renderManagerSignStatus();
}

async function renderAllDocsList() {
  const el = document.getElementById('signAllDocsList'); if (!el) return;
  const { data: docs } = await db.from('sign_documents').select('*').order('created_at', { ascending: false });
  if (!docs || docs.length === 0) { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No documents uploaded yet.</p>'; return; }
  el.innerHTML = '';
  for (const doc of docs) {
    const [assigneesRes, sigsRes] = await Promise.all([
      db.from('document_assignees').select('*').eq('document_id', doc.id),
      db.from('document_signatures').select('*').eq('document_id', doc.id)
    ]);
    const assignees   = assigneesRes.data || [];
    const sigs        = sigsRes.data || [];
    const signedCount = assignees.filter(a => a.signed).length;
    const totalCount  = assignees.length;
    const allSigned   = totalCount > 0 && signedCount === totalCount;
    const sigCount    = sigs.length;
    el.innerHTML += `
      <div class="sign-doc-card">
        <div class="flex-between">
          <div>
            <div class="sign-doc-title">${escapeHtml(doc.title)}</div>
            <div class="sign-doc-meta">${escapeHtml(doc.description || '')}</div>
            <div class="sign-doc-meta ${allSigned ? 'sign-status-signed' : 'sign-status-pending'}">
              <i class="ti ${allSigned ? 'ti-circle-check' : 'ti-clock'}"></i>
              ${signedCount}/${totalCount} signed · ${sigCount} placement${sigCount !== 1 ? 's' : ''}
            </div>
            ${doc.retrieved ? `<div class="sign-doc-meta" style="color:var(--warning)"><i class="ti ti-lock"></i> Retrieved</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" onclick="openAssignDocModal('${doc.id}','${escapeHtml(doc.title)}')"><i class="ti ti-user-plus"></i> Assign</button>
            <button class="btn btn-primary btn-sm"   onclick="openSigningModal('${doc.id}',null,false,${!!doc.retrieved})"><i class="ti ti-eye"></i> View</button>
            <button class="btn btn-success btn-sm"   onclick="retrieveDocument('${doc.id}')"><i class="ti ti-download"></i> Download</button>
            <button class="btn btn-danger btn-sm"    onclick="deleteSignDocument('${doc.id}')"><i class="ti ti-trash"></i></button>
          </div>
        </div>
      </div>`;
  }
}

async function renderManagerSignStatus() {
  const el = document.getElementById('signManagerStatusList'); if (!el) return;
  const { data: assignees } = await db.from('document_assignees').select('*').order('created_at', { ascending: false });
  const { data: docs }      = await db.from('sign_documents').select('id,title,retrieved').order('created_at', { ascending: false });
  if (!assignees || assignees.length === 0) { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No documents assigned yet.</p>'; return; }
  const docMap = {}; (docs || []).forEach(d => { docMap[d.id] = d; });
  el.innerHTML = '';
  for (const a of assignees) {
    const { data: sigs } = await db.from('document_signatures').select('id').eq('document_id', a.document_id).eq('signer_id', a.manager_id);
    const sigCount = (sigs || []).length;
    el.innerHTML += `
      <div class="sign-doc-card">
        <div class="flex-between">
          <div>
            <div class="sign-doc-title">${escapeHtml(docMap[a.document_id]?.title || 'Document')}</div>
            <div class="sign-doc-meta"><i class="ti ti-user"></i> ${escapeHtml(a.manager_name || a.manager_email || '—')}</div>
            <div class="sign-doc-meta ${a.signed ? 'sign-status-signed' : 'sign-status-pending'}">
              <i class="ti ${a.signed ? 'ti-circle-check' : 'ti-clock'}"></i>
              ${a.signed ? 'Signed' : 'Awaiting'}${sigCount > 0 ? ` · ${sigCount} placements` : ''}
            </div>
          </div>
        </div>
      </div>`;
  }
}

/* ===========================================
   RETRIEVE + DOWNLOAD SIGNED PDF
   Uses pdf-lib to embed signatures directly
   into the original PDF bytes — real document,
   real signatures, no blank page.
=========================================== */
async function retrieveDocument(docId) {
  const { data: doc } = await db.from('sign_documents').select('*').eq('id', docId).single();
  if (!doc) { alert('Document not found.'); return; }

  const [assigneesRes, sigsRes] = await Promise.all([
    db.from('document_assignees').select('*').eq('document_id', docId),
    db.from('document_signatures').select('*').eq('document_id', docId)
  ]);
  const signedCount = (assigneesRes.data || []).filter(a => a.signed).length;
  const totalCount  = (assigneesRes.data || []).length;
  const sigs        = sigsRes.data || [];

  if (!confirm(`${doc.title}\n\n${signedCount}/${totalCount} signed · ${sigs.length} signature placement${sigs.length !== 1 ? 's' : ''}\n\nDownload this PDF with all signatures permanently embedded?`)) return;

  await downloadSignedPDF(doc, sigs);

  await db.from('sign_documents').update({ retrieved: true, retrieved_at: new Date().toISOString() }).eq('id', docId);
  await renderSignAdminView();
}

async function downloadSignedPDF(doc, sigs) {
  if (typeof PDFLib === 'undefined') {
    alert('pdf-lib not loaded!\n\nAdd to your index.html <head>:\n<script src="https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js"><\/script>');
    return;
  }

  showToast('Generating signed PDF…', 'info');

  try {
    // Fetch the original PDF
    const response = await fetch(doc.file_url);
    if (!response.ok) throw new Error(`Cannot fetch PDF: ${response.status}`);
    const pdfBytes = await response.arrayBuffer();

    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const pdfDoc  = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages   = pdfDoc.getPages();
    const page    = pages[0];
    const { width: pageW, height: pageH } = page.getSize();

    for (const sig of sigs) {
      // Position: sig.position_x and position_y are 0-100% of the viewing area
      // PDF coordinate origin is bottom-left, Y increases upward
      const xPct = (sig.position_x || 0) / 100;
      const yPct = (sig.position_y || 0) / 100;
      const sigH = Math.max(20, sig.size || 40);
      const sigW = sigH * 2.5;
      const xPos = xPct * pageW;
      // Flip Y: PDF 0 is bottom, browser 0 is top
      const yPos = pageH - (yPct * pageH) - sigH;

      if (sig.signature_type === 'draw') {
        try {
          const base64 = sig.signature_data.replace(/^data:image\/png;base64,/, '');
          const pngBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          const pngImg   = await pdfDoc.embedPng(pngBytes);
          page.drawImage(pngImg, {
            x: Math.max(0, Math.min(xPos, pageW - sigW)),
            y: Math.max(sigH, Math.min(yPos, pageH - sigH)),
            width: sigW, height: sigH, opacity: 1
          });
        } catch(imgErr) { console.warn('PNG embed failed:', imgErr); }
      } else {
        // Typed signature — italic text
        const font     = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
        const fontSize = Math.max(14, sigH * 0.55);
        const text     = sig.signature_data || '';
        page.drawText(text, {
          x:     Math.max(0, Math.min(xPos, pageW - 200)),
          y:     Math.max(fontSize, Math.min(yPos + 6, pageH - fontSize)),
          size:  fontSize, font, color: rgb(0,0,0), opacity: 1
        });
      }

      // Thin underline beneath signature
      const lineY = Math.max(2, yPos - 2);
      page.drawLine({
        start: { x: Math.max(0, xPos), y: lineY },
        end:   { x: Math.min(pageW, xPos + sigW), y: lineY },
        thickness: 0.5, color: rgb(0.4, 0.4, 0.4), opacity: 0.6
      });

      // Signer name label
      try {
        const labelFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        page.drawText(sig.signer_name || 'Signed', {
          x: Math.max(0, xPos), y: Math.max(2, lineY - 10),
          size: 7, font: labelFont, color: rgb(0.5, 0.5, 0.5), opacity: 0.9
        });
      } catch(e) {}
    }

    const output   = await pdfDoc.save();
    const blob     = new Blob([output], { type: 'application/pdf' });
    const url      = URL.createObjectURL(blob);
    const link     = document.createElement('a');
    const safeName = (doc.file_name || doc.title || 'document').replace('.pdf','').replace(/[^a-zA-Z0-9_\- ]/g,'_');
    link.href = url; link.download = safeName + '_signed.pdf';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    showToast('✓ Signed PDF downloaded — signatures permanently embedded in the real document!');

  } catch (err) {
    console.error('PDF signing error:', err);
    // Fallback: just download the original
    alert('Could not embed signatures: ' + err.message + '\n\nMake sure your Supabase signdocs bucket is set to Public so the PDF can be fetched.\n\nFalling back to downloading the original unsigned PDF.');
    const link = document.createElement('a');
    link.href = doc.file_url; link.target = '_blank'; link.download = doc.file_name || 'document.pdf';
    link.click();
  }
}

async function deleteSignDocument(docId) {
  if (!confirm('Delete this document and all signature data?')) return;
  await Promise.all([
    db.from('document_assignees').delete().eq('document_id', docId),
    db.from('document_signatures').delete().eq('document_id', docId)
  ]);
  await db.from('sign_documents').delete().eq('id', docId);
  showToast('Document deleted.');
  await renderSignAdminView();
}

/* ===========================================
   MANAGER SIGNING VIEW
=========================================== */
async function renderSignManagerView() {
  const el = document.getElementById('signMyDocsList'); if (!el) return;
  const { data: assignees } = await db.from('document_assignees').select('*').eq('manager_id', currentUser.id);
  if (!assignees || assignees.length === 0) {
    el.innerHTML = `<div class="card" style="text-align:center;padding:40px"><i class="ti ti-file-off" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:10px"></i><div style="font-size:14px;color:var(--text-muted)">No documents require your signature.</div></div>`;
    return;
  }
  el.innerHTML = '';
  for (const assignee of assignees) {
    const { data: doc } = await db.from('sign_documents').select('*').eq('id', assignee.document_id).single();
    if (!doc) continue;
    el.innerHTML += `
      <div class="sign-doc-card">
        <div class="flex-between">
          <div>
            <div class="sign-doc-title">${escapeHtml(doc.title)}</div>
            <div class="sign-doc-meta">${escapeHtml(doc.description || '')}</div>
            <div class="sign-doc-meta ${assignee.signed ? 'sign-status-signed' : 'sign-status-pending'}">
              <i class="ti ${assignee.signed ? 'ti-circle-check' : 'ti-clock'}"></i>
              ${assignee.signed ? 'Signed' : 'Awaiting your signature'}
            </div>
            ${doc.retrieved ? `<div class="sign-doc-meta" style="color:var(--warning)"><i class="ti ti-lock"></i> Retrieved — read only</div>` : ''}
          </div>
          <button class="btn ${assignee.signed ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="openSigningModal('${doc.id}','${assignee.id}',${assignee.signed},${!!doc.retrieved})">
            <i class="ti ${assignee.signed ? 'ti-eye' : 'ti-pen'}"></i> ${assignee.signed ? 'View' : 'Open & Sign'}
          </button>
        </div>
      </div>`;
  }
}

/* ===========================================
   SIGNING MODAL — Adobe style
   - Live 3-second poll
   - Scrollable dark panel, document fills right
   - Drag: pure % delta (no grey block)
=========================================== */
async function openSigningModal(docId, assigneeId, alreadySigned, isRetrieved) {
  currentSignDocId         = docId;
  currentSignAssigneeId    = assigneeId;
  currentSignDocRetrieved  = isRetrieved;
  currentSignAlreadySigned = alreadySigned;

  stopSignPoll();

  const { data: doc } = await db.from('sign_documents').select('*').eq('id', docId).single();
  if (!doc) return;
  currentSignDocUrl = doc.file_url;

  await reloadAllSignatures(docId);

  document.getElementById('signDocTitle').textContent = doc.title;
  const isAdmin  = userRole === 'admin';
  const canEdit  = !isRetrieved && !isAdmin && assigneeId !== null;
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();

  document.getElementById('signDocContent').innerHTML = `
    <div class="sign-layout">
      <div class="sign-left-panel">
        <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">
          <i class="ti ti-pen"></i> Signatures
        </div>

        ${canEdit ? `
        <div id="savedSigPreview" style="display:none;border:2px solid var(--border);border-radius:8px;padding:8px;text-align:center;background:var(--surface-2)">
          <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Your Signature</div>
          <div id="savedSigDisplay"></div>
          <button class="btn btn-secondary btn-sm" style="margin-top:6px;width:100%" onclick="clearSavedSignature()"><i class="ti ti-refresh"></i> Change</button>
          <button class="btn btn-primary btn-sm"   style="margin-top:4px;width:100%" onclick="activatePlacement()"><i class="ti ti-cursor-text"></i> Place on Document</button>
        </div>
        <div id="createSigPanel">
          <div style="display:flex;gap:4px;margin-bottom:8px">
            <button class="btn btn-sm btn-secondary" id="sigModeDrawBtn" onclick="switchSigMode('draw')" style="flex:1">Draw</button>
            <button class="btn btn-sm btn-secondary" id="sigModeTypeBtn" onclick="switchSigMode('type')" style="flex:1">Type</button>
          </div>
          <div id="drawSigPanel">
            <canvas id="signatureCanvas" width="180" height="70"
              style="border:2px solid var(--border);border-radius:6px;background:white;touch-action:none;cursor:crosshair;width:100%;display:block"></canvas>
            <div style="display:flex;gap:4px;margin-top:4px">
              <button class="btn btn-sm btn-secondary" style="flex:1" onclick="clearCanvas()"><i class="ti ti-eraser"></i> Clear</button>
              <button class="btn btn-sm btn-primary"   style="flex:1" onclick="saveDrawnSignature()"><i class="ti ti-check"></i> Use</button>
            </div>
          </div>
          <div id="typeSigPanel" style="display:none">
            <input type="text" id="typedSigInput" placeholder="Type your name"
              style="width:100%;border:1px solid var(--border-strong);border-radius:6px;padding:8px;font-family:'Dancing Script',cursive;font-size:18px;color:#000;text-align:center"/>
            <div id="typedSigPreview"
              style="font-family:'Dancing Script',cursive;font-size:22px;color:#000;text-align:center;padding:8px;border:1px dashed var(--border);border-radius:6px;margin-top:6px;min-height:40px"></div>
            <button class="btn btn-primary btn-sm" style="width:100%;margin-top:6px" onclick="saveTypedSignature()"><i class="ti ti-check"></i> Use Signature</button>
          </div>
        </div>` : ''}

        <div>
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase">Live Signatures</div>
          <div id="placedSigList" style="font-size:11px;color:var(--text-muted)">Loading…</div>
        </div>

        <div style="font-size:10px;color:var(--text-muted);background:var(--surface-2);padding:8px;border-radius:6px;line-height:1.5;margin-top:4px">
          <i class="ti ti-refresh"></i> Updates every 3 seconds for all viewers.
        </div>

        ${canEdit ? `
        <div style="padding-top:10px;border-top:1px solid var(--border);margin-top:auto">
          <button class="btn btn-primary btn-full" style="justify-content:center" onclick="submitDocumentSignature()">
            <i class="ti ti-pen"></i> Submit &amp; Mark Signed
          </button>
        </div>` : `
        <div style="font-size:11px;color:var(--text-muted);text-align:center;padding-top:8px">
          ${isAdmin ? 'Admin view — all signatures shown.' : 'Read only.'}
        </div>`}
      </div>

      <!-- RIGHT PANEL: scrollable dark background, white document inside -->
      <div class="sign-right-panel">
        <div class="sign-doc-frame-wrap" id="signFrameWrap">
          <iframe id="signDocFrame"
            src="${doc.file_url}#toolbar=0&navpanes=0&scrollbar=1"
            style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;display:block;z-index:1">
          </iframe>
          <div id="signatureOverlay"
            style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:5;pointer-events:none"
            onclick="handleDocClick(event)">
            <div id="placedSigsContainer" style="position:absolute;top:0;left:0;width:100%;height:100%"></div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('signDocModal').classList.add('open');

  if (canEdit) {
    const savedSig  = localStorage.getItem(`sig_${currentUser.id}`);
    const savedType = localStorage.getItem(`sigType_${currentUser.id}`);
    if (savedSig) {
      currentSignatureData = savedSig; currentSignatureType = savedType || 'type';
      showSavedSignature(savedSig, savedType || 'type');
    } else {
      switchSigMode('draw'); initSignatureCanvas();
      const typedInput = document.getElementById('typedSigInput');
      if (typedInput) {
        typedInput.value = fullName;
        typedInput.addEventListener('input', () => { const p = document.getElementById('typedSigPreview'); if (p) p.textContent = typedInput.value; });
        const p = document.getElementById('typedSigPreview'); if (p) p.textContent = fullName;
      }
    }
    setupDragResize();
  }

  renderPlacedSignatures();
  updatePlacedSigList();
  startSignPoll(docId);
}

function startSignPoll(docId) {
  stopSignPoll();
  signPollInterval = setInterval(async () => {
    const modal = document.getElementById('signDocModal');
    if (!modal || !modal.classList.contains('open')) { stopSignPoll(); return; }
    await reloadAllSignatures(docId);
    renderPlacedSignatures();
    updatePlacedSigList();
  }, 3000);
}

function stopSignPoll() {
  if (signPollInterval) { clearInterval(signPollInterval); signPollInterval = null; }
}

async function reloadAllSignatures(docId) {
  const { data: sigData } = await db.from('document_signatures').select('*').eq('document_id', docId);
  const localUnsaved = placedSignatures.filter(s => !s.saved);
  const fromDB = (sigData || []).map(s => ({
    id: s.id, x: s.position_x, y: s.position_y,
    type: s.signature_type, data: s.signature_data, size: s.size || 40,
    signerId: s.signer_id, signerName: s.signer_name || 'Unknown', saved: true
  }));
  const dbIds = new Set(fromDB.map(s => s.id));
  placedSignatures = [...fromDB, ...localUnsaved.filter(s => !dbIds.has(s.id))];
}

function switchSigMode(mode) {
  currentSignatureType = mode;
  const drawPanel = document.getElementById('drawSigPanel'); const typePanel = document.getElementById('typeSigPanel');
  const drawBtn   = document.getElementById('sigModeDrawBtn'); const typeBtn   = document.getElementById('sigModeTypeBtn');
  if (drawPanel) drawPanel.style.display = mode === 'draw' ? 'block' : 'none';
  if (typePanel) typePanel.style.display = mode === 'type' ? 'block' : 'none';
  if (drawBtn)   drawBtn.className = `btn btn-sm ${mode === 'draw' ? 'btn-primary' : 'btn-secondary'}`;
  if (typeBtn)   typeBtn.className = `btn btn-sm ${mode === 'type' ? 'btn-primary' : 'btn-secondary'}`;
  if (mode === 'draw') setTimeout(initSignatureCanvas, 50);
}

function initSignatureCanvas() {
  const canvas = document.getElementById('signatureCanvas'); if (!canvas) return;
  signatureCanvas = canvas; signatureCtx = canvas.getContext('2d');
  signatureCtx.strokeStyle = '#000'; signatureCtx.lineWidth = 2.5; signatureCtx.lineCap = 'round'; signatureCtx.lineJoin = 'round';
  const getPos = e => {
    const rect = canvas.getBoundingClientRect(); const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };
  canvas.onmousedown  = e => { isDrawing = true;  const p = getPos(e); signatureCtx.beginPath(); signatureCtx.moveTo(p.x, p.y); };
  canvas.onmousemove  = e => { if (!isDrawing) return; const p = getPos(e); signatureCtx.lineTo(p.x, p.y); signatureCtx.stroke(); };
  canvas.onmouseup    = () => { isDrawing = false; };
  canvas.onmouseleave = () => { isDrawing = false; };
  canvas.ontouchstart = e => { e.preventDefault(); isDrawing = true;  const p = getPos(e); signatureCtx.beginPath(); signatureCtx.moveTo(p.x, p.y); };
  canvas.ontouchmove  = e => { e.preventDefault(); if (!isDrawing) return; const p = getPos(e); signatureCtx.lineTo(p.x, p.y); signatureCtx.stroke(); };
  canvas.ontouchend   = () => { isDrawing = false; };
}

function clearCanvas() { if (signatureCanvas && signatureCtx) signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height); }

function saveDrawnSignature() {
  if (!signatureCanvas) return;
  const data = signatureCanvas.toDataURL('image/png');
  const blank = document.createElement('canvas'); blank.width = signatureCanvas.width; blank.height = signatureCanvas.height;
  if (data === blank.toDataURL()) { alert('Please draw your signature first.'); return; }
  currentSignatureData = data; currentSignatureType = 'draw';
  localStorage.setItem(`sig_${currentUser.id}`, data); localStorage.setItem(`sigType_${currentUser.id}`, 'draw');
  showSavedSignature(data, 'draw');
  showToast('Signature ready. Click "Place on Document".');
}

function saveTypedSignature() {
  const val = document.getElementById('typedSigInput')?.value?.trim();
  if (!val) { alert('Please type your name.'); return; }
  currentSignatureData = val; currentSignatureType = 'type';
  localStorage.setItem(`sig_${currentUser.id}`, val); localStorage.setItem(`sigType_${currentUser.id}`, 'type');
  showSavedSignature(val, 'type');
  showToast('Signature ready. Click "Place on Document".');
}

function showSavedSignature(data, type) {
  const preview = document.getElementById('savedSigPreview'); const display = document.getElementById('savedSigDisplay'); const createPanel = document.getElementById('createSigPanel');
  if (!preview || !display) return;
  display.innerHTML = type === 'draw'
    ? `<img src="${data}" style="max-width:100%;max-height:48px;object-fit:contain;filter:brightness(0)"/>`
    : `<span style="font-family:'Dancing Script',cursive;font-size:22px;color:#000">${escapeHtml(data)}</span>`;
  preview.style.display = 'block';
  if (createPanel) createPanel.style.display = 'none';
}

function clearSavedSignature() {
  currentSignatureData = null; currentSignatureType = null;
  localStorage.removeItem(`sig_${currentUser.id}`); localStorage.removeItem(`sigType_${currentUser.id}`);
  const preview = document.getElementById('savedSigPreview'); const createPanel = document.getElementById('createSigPanel');
  if (preview)     preview.style.display     = 'none';
  if (createPanel) createPanel.style.display = 'block';
  switchSigMode('draw');
}

function activatePlacement() {
  if (!currentSignatureData) { alert('Please create a signature first.'); return; }
  awaitingPlacement = true;
  const overlay = document.getElementById('signatureOverlay');
  if (overlay) { overlay.style.cursor = 'crosshair'; overlay.style.pointerEvents = 'auto'; }
  showToast('Click anywhere on the document to place your signature.', 'info');
}

function handleDocClick(event) {
  if (!awaitingPlacement) return;
  awaitingPlacement = false;
  const overlay = document.getElementById('signatureOverlay');
  if (overlay) { overlay.style.cursor = 'default'; overlay.style.pointerEvents = 'none'; }

  const wrap = document.getElementById('signFrameWrap'); if (!wrap) return;
  const rect  = wrap.getBoundingClientRect();
  const x = parseFloat(((event.clientX - rect.left) / rect.width  * 100).toFixed(2));
  const y = parseFloat(((event.clientY - rect.top)  / rect.height * 100).toFixed(2));

  const tempId = 'temp_' + Date.now();
  const sig = {
    id: tempId, x, y,
    type: currentSignatureType, data: currentSignatureData, size: 40,
    signerId:   currentUser.id,
    signerName: `${currentProfile.first_name} ${currentProfile.last_name}`.trim(),
    saved: false
  };
  placedSignatures.push(sig);
  renderPlacedSignatures();
  updatePlacedSigList();
  autoSaveSig(sig);
}

async function autoSaveSig(sig) {
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();
  const { data, error } = await db.from('document_signatures').insert({
    document_id:    currentSignDocId,
    signer_id:      currentUser.id,
    signer_name:    fullName,
    signer_email:   currentUser.email,
    signature_type: sig.type,
    signature_data: sig.data,
    position_x:     sig.x,
    position_y:     sig.y,
    size:           sig.size || 40,
    signed_at:      new Date().toISOString()
  }).select().single();
  if (!error && data) { sig.id = data.id; sig.saved = true; }
}

async function removeSig(sigId) {
  if (currentSignDocRetrieved) { alert('Document retrieved — signatures are locked.'); return; }
  const sig = placedSignatures.find(s => s.id === sigId); if (!sig) return;
  if (sig.signerId !== currentUser.id) { alert('You can only remove your own signatures.'); return; }
  placedSignatures = placedSignatures.filter(s => s.id !== sigId);
  if (sig.saved && !String(sigId).startsWith('temp_')) { await db.from('document_signatures').delete().eq('id', sigId); }
  renderPlacedSignatures();
  updatePlacedSigList();
}

function renderPlacedSignatures() {
  const container = document.getElementById('placedSigsContainer'); if (!container) return;
  container.innerHTML = '';
  const isAdmin  = userRole === 'admin';
  const canEdit  = !currentSignDocRetrieved && !isAdmin && currentSignAssigneeId !== null;

  placedSignatures.forEach(sig => {
    const div     = document.createElement('div');
    div.className = 'placed-sig-el';
    div.id        = 'sigEl_' + sig.id;
    div.style.cssText = `position:absolute;left:${sig.x}%;top:${sig.y}%;pointer-events:${canEdit && sig.signerId === currentUser.id ? 'auto' : 'none'};cursor:${canEdit && sig.signerId === currentUser.id ? 'move' : 'default'};user-select:none;z-index:20;`;

    const fontSize = (sig.size || 40) * 0.6;
    const isOwn    = sig.signerId === currentUser.id;

    const content = sig.type === 'draw'
      ? `<img src="${sig.data}" style="height:${sig.size || 40}px;object-fit:contain;display:block;filter:brightness(0)" />`
      : `<span style="font-family:'Dancing Script','Lucida Handwriting',cursive;font-size:${fontSize}px;color:#000;display:block;white-space:nowrap;line-height:1.2">${escapeHtml(sig.data)}</span>`;

    div.innerHTML = content
      + (isOwn && canEdit ? `<button class="sig-remove-btn" onclick="event.stopPropagation();removeSig('${sig.id}')">×</button>` : '')
      + (isOwn && canEdit ? `<div class="sig-resize-handle" data-sigid="${sig.id}"></div>` : '');

    if (canEdit && isOwn) div.addEventListener('mousedown', sigDragStart);
    container.appendChild(div);
  });
}

/* Pure percentage delta drag — no grey box issue */
function sigDragStart(e) {
  if (e.target.classList.contains('sig-resize-handle') || e.target.classList.contains('sig-remove-btn')) return;
  e.preventDefault(); e.stopPropagation();

  const sigId = e.currentTarget.id.replace('sigEl_', '');
  const sig   = placedSignatures.find(s => String(s.id) === String(sigId));
  if (!sig) return;

  const wrap = document.getElementById('signFrameWrap'); if (!wrap) return;
  const wrapRect = wrap.getBoundingClientRect();

  const mouseStartPctX = (e.clientX - wrapRect.left) / wrapRect.width  * 100;
  const mouseStartPctY = (e.clientY - wrapRect.top)  / wrapRect.height * 100;
  const sigStartX = sig.x;
  const sigStartY = sig.y;
  const el = document.getElementById('sigEl_' + sigId);

  const onMove = ev => {
    const curPctX = (ev.clientX - wrapRect.left) / wrapRect.width  * 100;
    const curPctY = (ev.clientY - wrapRect.top)  / wrapRect.height * 100;
    const newX = Math.max(0, Math.min(96, sigStartX + (curPctX - mouseStartPctX)));
    const newY = Math.max(0, Math.min(96, sigStartY + (curPctY - mouseStartPctY)));
    if (el) { el.style.left = newX + '%'; el.style.top = newY + '%'; }
  };

  const onUp = async ev => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    const curPctX = (ev.clientX - wrapRect.left) / wrapRect.width  * 100;
    const curPctY = (ev.clientY - wrapRect.top)  / wrapRect.height * 100;
    sig.x = parseFloat(Math.max(0, Math.min(96, sigStartX + (curPctX - mouseStartPctX))).toFixed(2));
    sig.y = parseFloat(Math.max(0, Math.min(96, sigStartY + (curPctY - mouseStartPctY))).toFixed(2));
    if (sig.saved && !String(sig.id).startsWith('temp_')) {
      await db.from('document_signatures').update({ position_x: sig.x, position_y: sig.y }).eq('id', sig.id);
    }
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

function setupDragResize() {
  const handler = async e => {
    if (!e.target.classList.contains('sig-resize-handle')) return;
    const sigId = e.target.dataset.sigid;
    const sig   = placedSignatures.find(s => String(s.id) === String(sigId));
    if (!sig) return;
    isResizing = true; resizeStartSize = sig.size || 40; resizeStartY = e.clientY;
    e.preventDefault(); e.stopPropagation();
    const onMove = ev => {
      const newSize = Math.max(20, Math.min(150, resizeStartSize + (ev.clientY - resizeStartY)));
      sig.size = newSize;
      const el   = document.getElementById('sigEl_' + sigId); if (!el) return;
      const img  = el.querySelector('img');  if (img)  img.style.height    = newSize + 'px';
      const span = el.querySelector('span'); if (span) span.style.fontSize = (newSize * 0.6) + 'px';
    };
    const onUp = async () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      if (sig.saved && !String(sig.id).startsWith('temp_')) {
        await db.from('document_signatures').update({ size: sig.size }).eq('id', sig.id);
      }
      isResizing = false;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  };
  document.removeEventListener('mousedown', window._sigResizeHandler);
  window._sigResizeHandler = handler;
  document.addEventListener('mousedown', handler);
}

function updatePlacedSigList() {
  const el = document.getElementById('placedSigList'); if (!el) return;
  if (placedSignatures.length === 0) { el.innerHTML = '<div style="font-style:italic">None yet.</div>'; return; }
  const bySigner = {};
  placedSignatures.forEach(sig => { if (!bySigner[sig.signerName]) bySigner[sig.signerName] = 0; bySigner[sig.signerName]++; });
  el.innerHTML = Object.entries(bySigner).map(([name, count]) => `
    <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border)">
      <span>${escapeHtml(name)}</span>
      <span style="color:var(--text-muted)">${count} sig${count !== 1 ? 's' : ''}</span>
    </div>`).join('');
}

async function submitDocumentSignature() {
  if (currentSignDocRetrieved) { alert('Document already retrieved.'); return; }
  const ownSigs = placedSignatures.filter(s => s.signerId === currentUser.id);
  if (ownSigs.length === 0) { alert('Please place at least one signature first.'); return; }
  await db.from('document_assignees').update({ signed: true, updated_at: new Date().toISOString() }).eq('id', currentSignAssigneeId);
  showToast('Document marked as signed!');
  closeModal('signDocModal');
  await renderSignManagerView();
}

/* ===========================================
   ASSIGN DOCUMENT
=========================================== */
async function openAssignDocModal(docId, docTitle) {
  pendingAssignDocId = docId;
  document.getElementById('assignDocTitleLabel').textContent = docTitle;
  const { data: members }  = await db.from('profiles').select('*').in('role', ['manager','employee']).order('department');
  const { data: existing } = await db.from('document_assignees').select('manager_id').eq('document_id', docId);
  const assignedIds        = new Set((existing || []).map(a => a.manager_id));
  const listEl             = document.getElementById('managerSelectList');
  if (!members || members.length === 0) { listEl.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No managers or employees found.</p>'; document.getElementById('assignDocModal').classList.add('open'); return; }
  const byDept = {};
  members.forEach(m => { const d = m.department || 'No Department'; if (!byDept[d]) byDept[d] = []; byDept[d].push(m); });
  listEl.innerHTML = Object.entries(byDept).map(([dept, mgrs]) => `
    <div style="margin-bottom:14px">
      <div class="info-label" style="margin-bottom:8px">${escapeHtml(dept)}</div>
      ${mgrs.map(m => {
        const fullName = `${m.first_name} ${m.last_name}`.trim() || m.email;
        const checked  = assignedIds.has(m.id);
        return `<label class="manager-select-row ${checked ? 'selected' : ''}">
          <div><div class="manager-select-name">${escapeHtml(fullName)}</div><div class="manager-select-dept">${escapeHtml(m.email)} · ${m.role}</div></div>
          <input type="checkbox" value="${m.id}" data-name="${escapeHtml(fullName)}" data-email="${escapeHtml(m.email)}" ${checked ? 'checked' : ''} onchange="this.closest('.manager-select-row').classList.toggle('selected',this.checked)"/>
        </label>`;
      }).join('')}
    </div>`).join('');
  document.getElementById('assignDocModal').classList.add('open');
}

async function confirmAssignDocument() {
  if (!pendingAssignDocId) return;
  const checkboxes = document.querySelectorAll('#managerSelectList input[type="checkbox"]:checked');
  if (checkboxes.length === 0) { alert('Please select at least one person.'); return; }

  const { data: existing } = await db.from('document_assignees').select('manager_id').eq('document_id', pendingAssignDocId);
  const alreadyAssigned    = new Set((existing || []).map(a => a.manager_id));

  await db.from('document_assignees').delete().eq('document_id', pendingAssignDocId);
  const { data: doc } = await db.from('sign_documents').select('title').eq('id', pendingAssignDocId).single();

  await db.from('document_assignees').insert([...checkboxes].map(cb => ({
    document_id:   pendingAssignDocId,
    manager_id:    cb.value,
    manager_name:  cb.dataset.name,
    manager_email: cb.dataset.email,
    signed:        false,
    created_at:    new Date().toISOString()
  })));

  [...checkboxes].forEach(cb => {
    if (!alreadyAssigned.has(cb.value)) {
      sendManagerDocumentEmail(cb.dataset.email, cb.dataset.name, doc?.title || 'Document');
    }
  });

  closeModal('assignDocModal');
  showToast(`Document assigned to ${checkboxes.length} person(s).`);
  await renderSignAdminView();
}

function openUploadDocModal() {
  pendingUploadDocFileObj = null;
  document.getElementById('uploadDocTitle').value           = '';
  document.getElementById('uploadDocDesc').value            = '';
  document.getElementById('uploadDocFileLabel').textContent = 'Click to upload PDF';
  document.getElementById('uploadDocModal').classList.add('open');
}

function handleUploadDocFile(e) {
  pendingUploadDocFileObj = e.target.files[0];
  if (pendingUploadDocFileObj) document.getElementById('uploadDocFileLabel').textContent = `✓ ${pendingUploadDocFileObj.name}`;
}

async function saveUploadedDocument() {
  const title = document.getElementById('uploadDocTitle').value.trim();
  const desc  = document.getElementById('uploadDocDesc').value.trim();
  if (!title)                   { alert('Please enter a document title.'); return; }
  if (!pendingUploadDocFileObj) { alert('Please upload a PDF.'); return; }
  const safeName = title.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path     = `signdocs/${currentUser.id}_${Date.now()}_${safeName}.pdf`;
  const { error: uploadErr } = await db.storage.from('signdocs').upload(path, pendingUploadDocFileObj, { upsert: true });
  if (uploadErr) { alert('Upload failed: ' + uploadErr.message); return; }
  const { data: urlData } = db.storage.from('signdocs').getPublicUrl(path);
  const { error } = await db.from('sign_documents').insert({
    title, description: desc, file_url: urlData?.publicUrl || '',
    file_name: pendingUploadDocFileObj.name, uploaded_by: currentUser.id,
    status: 'pending', created_at: new Date().toISOString()
  });
  if (error) { alert('Could not save: ' + error.message); return; }
  closeModal('uploadDocModal');
  showToast('Document uploaded.');
  await renderSignAdminView();
}

/* ===========================================
   MODALS
=========================================== */
function closeModal(id) {
  const el = document.getElementById(id); if (!el) return;
  el.classList.remove('open');
  if (id === 'signDocModal') { stopSignPoll(); }
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay') && e.target.id !== 'signDocModal') {
    closeModal(e.target.id);
  }
});

/* ===========================================
   HELPERS
=========================================== */
function getInitials(name) { if (!name) return '?'; return name.split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join(''); }
function escapeHtml(str)   { if (!str) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function formatDate(d)     { if (!d) return '—'; return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }); }
function safeParseJSON(str, fallback) { if (!str) return fallback; if (typeof str === 'object') return str; try { return JSON.parse(str); } catch { return fallback; } }
function showAuthMessage(msg, type)   { const el = document.getElementById('authMessage'); if (!el) return; el.textContent = msg; el.className = `auth-message ${type}`; el.classList.remove('hidden'); }
function clearAuthMessage()           { const el = document.getElementById('authMessage'); if (el) { el.classList.add('hidden'); el.textContent = ''; } }
function setButtonLoading(btn, loading, originalHTML = '') {
  if (loading) { btn.disabled = true; btn.innerHTML = '<span class="loading-spinner"></span> Please wait…'; }
  else { btn.disabled = false; if (originalHTML) btn.innerHTML = originalHTML; }
}

function showToast(message, type = 'success') {
  const existing = document.getElementById('saveToast'); if (existing) existing.remove();
  const colours  = { success: '#16a34a', error: '#dc2626', info: '#007aa6' };
  const icons    = { success: 'ti-circle-check', error: 'ti-circle-x', info: 'ti-info-circle' };
  const toast    = document.createElement('div'); toast.id = 'saveToast';
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:${colours[type] || colours.success};color:white;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:9999;display:flex;align-items:center;gap:8px;max-width:360px;line-height:1.4;`;
  toast.innerHTML = `<i class="ti ${icons[type] || icons.success}"></i> ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 4000);
}