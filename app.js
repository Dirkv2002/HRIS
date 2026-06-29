text

/* ═══════════════════════════════════════════
   COMMUNICARE HRIS — app.js  (v2)
═══════════════════════════════════════════ */

const SUPABASE_URL  = 'https://llryoespqzykaqawhwob.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxscnlvZXNwcXp5a2FxYXdod29iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODg3MTcsImV4cCI6MjA5NjA2NDcxN30.P5tL7TA-VB9EkCSThwE2jIExxya8VYvs2SjU9pCrmQY';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ── ROLE PREFIX RULES ──
   Order matters: check longer prefixes first so 1357911 is matched before 123456 */
const ROLE_PREFIXES = [
  { prefix: '246810',  role: 'admin'     },
  { prefix: '654321',  role: 'manager'   },
  { prefix: '1357911', role: 'employee'  },
  { prefix: '123456',  role: 'candidate' },
];

function detectRoleFromPassword(password) {
  for (const { prefix, role } of ROLE_PREFIXES) {
    if (password.startsWith(prefix)) return role;
  }
  return null;
}

/* ── GLOBAL STATE ── */
let currentUser              = null;
let currentProfile           = null;
let userRole                 = 'candidate';
let slotsData                = [];
let vacanciesData            = [];
let competencyFiles          = {};
let currentVacancyId         = null;
let currentCompJob           = null;
let pendingOnboardingSlotId  = null;
let userAnswers              = {};
let applyAnswers             = {};
let applyCVFile              = null;
let allAvailability          = [];
let myAvailability           = new Set();
let shortlistDraft           = {};
let pendingUploadDocFile     = null;
let pendingAssignDocId       = null;
let pendingAdminAssessFile   = null;
let pendingAdminAssessTarget = null;
let currentSignDocId         = null;
let currentSignAssigneeId    = null;
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
/* For drag/resize of placed signatures */
let activeSigId              = null;
let dragOffset               = { x: 0, y: 0 };
let isResizing               = false;
let resizeSigId              = null;
let resizeStartSize          = 40;
let resizeStartY             = 0;
/* Auto-save timer for signing */
let signAutoSaveTimer        = null;

const departmentsData = {
  'Human Capital':                        ['HR Business Partner','Talent Acquisition Specialist','Learning & Development Manager','Compensation & Benefits Analyst','Employee Relations Officer'],
  'Marketing and Communications':         ['Brand Manager','Digital Marketing Specialist','Content Strategist','PR Coordinator','Social Media Manager'],
  'Information Technology':               ['Software Engineer','Systems Administrator','Data Analyst','Cybersecurity Specialist','IT Project Manager','DevOps Engineer'],
  'Asset Management':                     ['Portfolio Manager','Asset Analyst','Risk Officer','Investment Associate','Fund Accountant'],
  'Finance':                              ['Financial Accountant','Management Accountant','Treasury Analyst','Accounts Payable Clerk','Finance Manager'],
  'Property Development and Investments': ['Property Development Manager','Leasing Consultant','Valuations Analyst','Project Manager','Property Administrator'],
  'Facilities Management':               ['Facilities Manager','Maintenance Coordinator','Health & Safety Officer','Cleaning Supervisor','Security Manager']
};

/* ══════════════════════════════════════════
   BOOT
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const pwInput = document.getElementById('signupPassword');
  if (pwInput) {
    pwInput.addEventListener('input', () => {
      const role = detectRoleFromPassword(pwInput.value);
      const preview     = document.getElementById('signupRolePreview');
      const badge       = document.getElementById('signupRoleBadge');
      const mgrDept     = document.getElementById('signupDeptGroupManager');
      const adminDept   = document.getElementById('signupDeptGroupAdmin');
      const empDept     = document.getElementById('signupDeptGroupEmployee');
      if (role) {
        preview.style.display = 'block';
        badge.textContent = role.toUpperCase();
        badge.className = 'role-badge ' + role;
        if (mgrDept)   mgrDept.style.display   = role === 'manager'  ? 'block' : 'none';
        if (adminDept) adminDept.style.display  = role === 'admin'    ? 'block' : 'none';
        if (empDept)   empDept.style.display    = role === 'employee' ? 'block' : 'none';
      } else {
        preview.style.display = 'none';
        if (mgrDept)   mgrDept.style.display   = 'none';
        if (adminDept) adminDept.style.display  = 'none';
        if (empDept)   empDept.style.display    = 'none';
      }
    });
  }

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

/* ══════════════════════════════════════════
   AUTH
══════════════════════════════════════════ */
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
  const { error } = await db.auth.signInWithPassword({ email, password });
  setButtonLoading(btn, false, '<i class="ti ti-login"></i> Sign In');
  if (error) showAuthMessage(error.message, 'error');
}

async function handleSignup(e) {
  e.preventDefault();
  const firstName = document.getElementById('signupFirst').value.trim();
  const lastName  = document.getElementById('signupLast').value.trim();
  const email     = document.getElementById('signupEmail').value.trim();
  const password  = document.getElementById('signupPassword').value;
  const btn       = document.getElementById('signupBtn');

  if (password.length < 6) { showAuthMessage('Password must be at least 6 characters.','error'); return; }

  const role = detectRoleFromPassword(password);
  if (!role) {
    showAuthMessage('Your password prefix does not match any role. Use 246810=Admin, 654321=Manager, 1357911=Employee, 123456=Candidate.','error');
    return;
  }

  let dept = '';
  if (role === 'manager')  dept = document.getElementById('signupDept')?.value || '';
  if (role === 'admin')    dept = document.getElementById('signupDeptAdmin')?.value || '';
  if (role === 'employee') dept = document.getElementById('signupDeptEmployee')?.value || '';

  if ((role === 'manager' || role === 'admin' || role === 'employee') && !dept) {
    showAuthMessage('Please select your department.','error');
    return;
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
}

async function handleLogout() { await db.auth.signOut(); }

async function showForgotPassword() {
  const email = prompt('Enter your email address:');
  if (!email) return;
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: 'https://dirkv2002.github.io/HRIS/' });
  alert(error ? 'Error: ' + error.message : 'Reset email sent! Check your inbox.');
}

/* ══════════════════════════════════════════
   LOAD PROFILE
══════════════════════════════════════════ */
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

/* ══════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════ */
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
    { id: 'dashboard',  icon: 'ti-layout-dashboard', label: 'Dashboard' },
    { section: 'Bookings' },
    { id: 'bookings',   icon: 'ti-calendar-event',   label: 'Bookings' },
    { section: 'Documents' },
    { id: 'sign',       icon: 'ti-signature',        label: 'Sign' }
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
  const nav = document.getElementById('sidebarNav');
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

/* ══════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════ */
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
  const badge = document.getElementById('roleBadge');
  const labels = { admin:'ADMIN', manager:'MANAGER', candidate:'CANDIDATE', employee:'EMPLOYEE' };
  badge.textContent = labels[userRole] || 'CANDIDATE';
  badge.className   = 'role-badge ' + userRole;
}

/* ══════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════ */
function populateDashboard() {
  if (!currentProfile) return;
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim() || currentProfile.email;
  const initials = getInitials(fullName);
  const status   = currentProfile.status || 'reviewing';

  document.getElementById('sidebarName').textContent  = fullName;
  document.getElementById('sidebarEmail').textContent = currentProfile.email || '';
  document.getElementById('profileName').textContent  = fullName;

  const roleLabel = { admin:'HR Administrator', manager:'Manager', employee:'Employee', candidate:'Candidate' }[userRole] || 'User';
  document.getElementById('profileSub').textContent = `${roleLabel} · ${currentProfile.email}`;

  document.getElementById('infoName').textContent        = fullName;
  document.getElementById('infoEmail').textContent       = currentProfile.email || '—';
  document.getElementById('infoPhone').textContent       = currentProfile.phone || '—';
  document.getElementById('infoId').textContent          = currentProfile.id_number || '—';
  document.getElementById('infoLocation').textContent    = currentProfile.location || '—';
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

  const stepDate0 = document.getElementById('stepDate0');
  if (stepDate0 && currentProfile.created_at) {
    stepDate0.textContent = new Date(currentProfile.created_at)
      .toLocaleDateString('en-ZA', { day:'numeric', month:'short' });
  }

  renderDashboardRightCard();
}

async function renderDashboardRightCard() {
  const card = document.getElementById('dashboardRightCard');
  if (!card) return;

  if (userRole === 'candidate') {
    const { data: apps } = await db.from('applications').select('*')
      .eq('user_id', currentUser.id).order('submitted_at', { ascending: false });
    const list = apps || [];
    card.innerHTML = `
      <div class="card-title accent-blue"><i class="ti ti-history"></i> Application History</div>
      ${list.length === 0
        ? `<div class="app-history-empty"><i class="ti ti-inbox"></i>No applications yet. Head to the Apply tab to get started.</div>`
        : list.map(a => {
            const cfg = statusConfig[a.status] || statusConfig.reviewing;
            return `<div class="app-history-item">
              <div>
                <div class="app-history-title">${escapeHtml(a.vacancy_title||'—')}</div>
                <div class="app-history-meta">${a.submitted_at ? new Date(a.submitted_at).toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'}) : '—'} · Score: ${a.score}%</div>
              </div>
              <span class="status-badge ${cfg.cls}" style="font-size:10px;margin:0">${cfg.label}</span>
            </div>`;
          }).join('')
      }`;
    return;
  }

  // Admin / Manager / Employee: job info card
  const allJobs = getAllJobTitles();
  const deptJobs = currentProfile.department ? (departmentsData[currentProfile.department] || []) : allJobs;
  card.innerHTML = `
    <div class="card-title accent-blue"><i class="ti ti-briefcase"></i> Job Information</div>
    <div class="info-row"><span class="key">Job Title</span><span class="val">${escapeHtml(currentProfile.job_title||'—')}</span></div>
    <div class="info-row"><span class="key">Department</span><span class="val">${escapeHtml(currentProfile.department||'—')}</span></div>
    <div class="info-row"><span class="key">Reference No.</span><span class="val">${escapeHtml(currentProfile.job_ref||'—')}</span></div>
    <div class="info-row"><span class="key">Date Joined</span><span class="val">${currentProfile.created_at ? new Date(currentProfile.created_at).toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'}) : '—'}</span></div>
    <div style="margin-top:10px"><div class="info-label" style="margin-bottom:6px">Job Description</div>
    <div style="font-size:13px;color:var(--text-secondary);line-height:1.7">${escapeHtml(currentProfile.job_description||'—')}</div></div>
    <div style="margin-top:14px">
      <button class="btn btn-secondary" onclick="toggleEditJob()"><i class="ti ti-edit"></i> Edit Job Info</button>
      <div id="editJobForm" class="hidden" style="margin-top:16px">
        <div class="grid-2">
          <div class="form-group">
            <label>Department</label>
            <select id="editJobDept" onchange="updateJobTitleDropdown()">
              <option value="">— Select Department —</option>
              ${Object.keys(departmentsData).map(d=>`<option ${currentProfile.department===d?'selected':''}>${escapeHtml(d)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Job Title</label>
            <select id="editJobTitle">
              <option value="">— Select Job Title —</option>
              ${deptJobs.map(j=>`<option ${currentProfile.job_title===j?'selected':''}>${escapeHtml(j)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Reference No.</label><input type="text" id="editJobRef" value="${escapeHtml(currentProfile.job_ref||'')}"/></div>
        </div>
        <div class="form-group"><label>Job Description</label><textarea id="editJobDesc" rows="3">${escapeHtml(currentProfile.job_description||'')}</textarea></div>
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
    jobs.map(j => `<option ${currentProfile.job_title===j?'selected':''}>${escapeHtml(j)}</option>`).join('');
}

/* ══════════════════════════════════════════
   PERSONAL INFO
══════════════════════════════════════════ */
function toggleEditPersonal() {
  const form = document.getElementById('editPersonalForm');
  const hidden = form.classList.contains('hidden');
  form.classList.toggle('hidden');
  if (hidden) {
    document.getElementById('editPhone').value       = currentProfile.phone || '';
    document.getElementById('editIdNum').value       = currentProfile.id_number || '';
    document.getElementById('editLocation').value    = currentProfile.location || '';
    document.getElementById('editNationality').value = currentProfile.nationality || '';
  }
}

async function savePersonalInfo() {
  const updates = {
    phone: document.getElementById('editPhone').value.trim(),
    id_number: document.getElementById('editIdNum').value.trim(),
    location: document.getElementById('editLocation').value.trim(),
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
  const dept  = document.getElementById('editJobDept')?.value || '';
  const title = document.getElementById('editJobTitle')?.value || '';
  const ref   = document.getElementById('editJobRef')?.value.trim() || '';
  const desc  = document.getElementById('editJobDesc')?.value.trim() || '';
  const { error } = await db.from('profiles').update({
    department: dept, job_title: title, job_ref: ref, job_description: desc
  }).eq('id', currentUser.id);
  if (error) { alert('Could not save: ' + error.message); return; }
  await reloadProfile(); renderDashboardRightCard(); toggleEditJob();
  showToast('Job information updated.');
}

/* ══════════════════════════════════════════
   AVATAR & CV
══════════════════════════════════════════ */
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

/* ══════════════════════════════════════════
   STATUS CONFIG
══════════════════════════════════════════ */
const statusConfig = {
  received:    { label:'Application Received', cls:'received',    fill:'0%',   stage:0 },
  reviewing:   { label:'Reviewing',            cls:'reviewing',   fill:'16%',  stage:1 },
  interview1:  { label:'1st Interview',        cls:'interview1',  fill:'33%',  stage:2 },
  assessment:  { label:'Assessment',           cls:'assessment',  fill:'50%',  stage:3 },
  interview2:  { label:'2nd Interview',        cls:'interview2',  fill:'66%',  stage:4 },
  final:       { label:'Final Assessment',     cls:'final',       fill:'82%',  stage:5 },
  offered:     { label:'Offer Made',           cls:'offered',     fill:'100%', stage:6 },
  rejected:    { label:'Rejected',             cls:'rejected',    fill:'0%',   stage:0 },
  applied:     { label:'Applied',              cls:'applied',     fill:'5%',   stage:0 },
  shortlisted: { label:'Shortlisted',          cls:'shortlisted', fill:'40%',  stage:1 },
  longlist:    { label:'Long List',            cls:'longlist',    fill:'25%',  stage:1 }
};

const stepIcons = ['ti-inbox','ti-eye','ti-video','ti-brain','ti-video','ti-writing','ti-file-check'];

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
  const cfg = statusConfig[s] || statusConfig.reviewing;
  const badge = document.getElementById('dashStatusBadge');
  if (badge) { badge.style.display=''; badge.className='status-badge '+cfg.cls; badge.innerHTML=`<i class="ti ti-circle-dot"></i>&nbsp;${cfg.label}`; }
  const txt = document.getElementById('dashStatusText'); if (txt) txt.textContent = cfg.label;
  const sl  = document.getElementById('currentStageLabel'); if (sl) sl.textContent = cfg.label;
  const fill = document.getElementById('progressFill'); if (fill) fill.style.width = cfg.fill;
  document.querySelectorAll('#progressCandidateView .step-node').forEach((node, i) => {
    const circle = node.querySelector('.step-circle'); const label = node.querySelector('.step-label');
    if (!circle||!label) return;
    circle.className='step-circle'; label.className='step-label';
    if (i < cfg.stage)       { circle.classList.add('done');    label.classList.add('done');    circle.innerHTML='<i class="ti ti-check"></i>'; }
    else if (i===cfg.stage)  { circle.classList.add('current'); label.classList.add('current'); circle.innerHTML=`<i class="ti ${stepIcons[i]||'ti-circle'}"></i>`; }
    else                     { circle.classList.add('pending'); circle.innerHTML=`<i class="ti ${stepIcons[i]||'ti-circle'}"></i>`; }
  });
}

function checkForStatusChangeNotification(currentStatus) {
  try {
    const key = 'lastSeenStatus_' + currentUser.id;
    const lastSeen = localStorage.getItem(key);
    if (lastSeen && lastSeen !== currentStatus && stageMessages[currentStatus]) showCongratsPopup(currentStatus);
    localStorage.setItem(key, currentStatus);
  } catch(e) {}
}

function showCongratsPopup(newStatus) {
  const msg = stageMessages[newStatus]; if (!msg) return;
  document.getElementById('congratsTitle').textContent = newStatus==='rejected'?'Application Update':'Congratulations!';
  document.getElementById('congratsText').textContent  = msg;
  document.getElementById('congratsModal').classList.add('open');
}

/* ══════════════════════════════════════════
   EMAIL HELPERS
══════════════════════════════════════════ */
const FROM_EMAIL = 'dvermeulen@communicare.org.za';

async function sendEmail(toEmail, subject, body) {
  await db.from('email_notifications').insert({
    to_email: toEmail, subject, body, from_email: FROM_EMAIL, sent: false, created_at: new Date().toISOString()
  }).catch(()=>{});
}

async function sendRejectionEmail(toEmail, candidateName, vacancyTitle) {
  await sendEmail(toEmail, `Your application for ${vacancyTitle} — Communicare`,
    `Dear ${candidateName},\n\nThank you for applying for ${vacancyTitle} at Communicare. After careful consideration, we will not be moving forward with your application at this time.\n\nWe wish you every success in your career journey.\n\nWith warm regards,\nCommunicare Human Capital Team\n${FROM_EMAIL}`);
}

async function sendStatusUpdateEmail(toEmail, candidateName, vacancyTitle, newStatus) {
  await sendEmail(toEmail, `Application update — ${vacancyTitle}`,
    `Dear ${candidateName},\n\nYour application for ${vacancyTitle} has been updated to: ${newStatus}.\n\nKind regards,\nCommunicare Human Capital Team\n${FROM_EMAIL}`);
}

async function sendInterviewConfirmationEmail(toEmail, candidateName, date, time) {
  await sendEmail(toEmail, `Interview Booking Confirmed — Communicare`,
    `Dear ${candidateName},\n\nYour interview has been booked for ${date} at ${time} (30 minutes).\n\nKind regards,\nCommunicare Human Capital Team\n${FROM_EMAIL}`);
}

async function sendInterviewCancellationEmail(toEmail, candidateName, date, time) {
  await sendEmail(toEmail, `Interview Cancelled — Communicare`,
    `Dear ${candidateName},\n\nYour interview for ${date} at ${time} has been cancelled.\n\nKind regards,\nCommunicare Human Capital Team\n${FROM_EMAIL}`);
}

async function sendManagerShortlistEmail(managerEmail, managerName, vacancyTitle) {
  await sendEmail(managerEmail, `Shortlist ready for review — ${vacancyTitle}`,
    `Dear ${managerName},\n\nA shortlist of candidates for "${vacancyTitle}" has been submitted for your review.\n\nKind regards,\nCommunicare Human Capital Team\n${FROM_EMAIL}`);
}

async function sendManagerDocumentEmail(managerEmail, managerName, docTitle) {
  await sendEmail(managerEmail, `Document awaiting your signature — ${docTitle}`,
    `Dear ${managerName},\n\nA document has been assigned to you for electronic signing: "${docTitle}".\n\nKind regards,\nCommunicare Human Capital Team\n${FROM_EMAIL}`);
}

async function sendCandidateInterviewInviteEmail(toEmail, candidateName, vacancyTitle) {
  await sendEmail(toEmail, `Interview invitation — ${vacancyTitle}`,
    `Dear ${candidateName},\n\nCongratulations! You have been shortlisted for "${vacancyTitle}". Please log in and navigate to the Bookings tab to select your preferred interview slot.\n\nKind regards,\nCommunicare Human Capital Team\n${FROM_EMAIL}`);
}

/* ══════════════════════════════════════════
   SCREENING
══════════════════════════════════════════ */
async function saveScreening() {
  const payload = {
    job_title: document.getElementById('sc_title').value.trim(),
    department: document.getElementById('sc_dept').value,
    qualifications: document.getElementById('sc_qual').value.trim(),
    experience: document.getElementById('sc_exp').value.trim(),
    budget: document.getElementById('sc_budget').value.trim(),
    job_description: document.getElementById('sc_jd').value.trim(),
    green_flags: document.getElementById('sc_green').value.trim(),
    red_flags: document.getElementById('sc_red').value.trim(),
    created_by: currentUser.id,
    creator_name: `${currentProfile.first_name} ${currentProfile.last_name}`.trim(),
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  if (!payload.job_title) { alert('Please enter a job title.'); return; }
  const { error } = await db.from('screening_strategies').insert(payload);
  if (error) { alert('Could not save: ' + error.message); return; }
  ['sc_title','sc_qual','sc_exp','sc_budget','sc_jd','sc_green','sc_red'].forEach(id=>{document.getElementById(id).value='';});
  showToast('Screening strategy saved.');
  await renderScreeningDepts();
}

async function renderScreeningDepts() {
  const el = document.getElementById('screeningDeptList'); if (!el) return;
  let query = db.from('screening_strategies').select('*').order('created_at',{ascending:false});
  if (userRole==='manager' && currentProfile.department) query = query.eq('department', currentProfile.department);
  const { data } = await query;
  const strategies = data || [];
  if (strategies.length===0) { el.innerHTML='<p style="font-size:13px;color:var(--text-muted)">No strategies saved yet.</p>'; return; }
  const byDept = {};
  strategies.forEach(s=>{ if(!byDept[s.department]) byDept[s.department]=[]; byDept[s.department].push(s); });
  el.innerHTML = Object.entries(byDept).map(([dept,items])=>`
    <div class="screening-dept-block">
      <div class="screening-dept-header" onclick="toggleScreeningDept(this)">
        <h4><i class="ti ti-building" style="color:var(--accent-green)"></i>${escapeHtml(dept)}<span class="dept-count">${items.length} strateg${items.length!==1?'ies':'y'}</span></h4>
        <i class="ti ti-chevron-down chevron"></i>
      </div>
      <div class="screening-dept-body">
        ${items.map(s=>`
          <div class="strategy-item">
            <div class="strategy-item-header">
              <div><div class="strategy-item-title">${escapeHtml(s.job_title)}</div><div class="strategy-item-meta">Created by ${escapeHtml(s.creator_name||'HR')} · ${new Date(s.created_at).toLocaleDateString('en-ZA')}</div></div>
              ${(userRole==='admin'||s.created_by===currentUser.id)?`<button class="btn btn-danger btn-sm" onclick="deleteStrategy('${s.id}')"><i class="ti ti-trash"></i></button>`:''}
            </div>
            <div class="grid-2" style="margin-bottom:12px">
              <div><div class="report-label">Qualifications</div><div style="font-size:13px">${escapeHtml(s.qualifications||'—')}</div></div>
              <div><div class="report-label">Experience</div><div style="font-size:13px">${escapeHtml(s.experience||'—')}</div></div>
              <div><div class="report-label">Budget</div><div style="font-size:13px;color:var(--success);font-weight:600">${escapeHtml(s.budget||'—')}</div></div>
            </div>
            <div style="margin-bottom:10px"><div class="report-label" style="margin-bottom:4px">Job Description</div><div style="font-size:13px;color:var(--text-secondary);line-height:1.6">${escapeHtml(s.job_description||'—')}</div></div>
            <div class="grid-2">
              <div><div class="report-label" style="margin-bottom:6px">Green Flags</div>${(s.green_flags||'').split('\n').filter(Boolean).map(g=>`<span class="tag green">✓ ${escapeHtml(g.trim())}</span>`).join('')}</div>
              <div><div class="report-label" style="margin-bottom:6px">Red Flags</div>${(s.red_flags||'').split('\n').filter(Boolean).map(r=>`<span class="tag red">✕ ${escapeHtml(r.trim())}</span>`).join('')}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function toggleScreeningDept(header) { const body=header.nextElementSibling; const icon=header.querySelector('.chevron'); body.classList.toggle('open'); if(icon) icon.classList.toggle('open'); }
async function deleteStrategy(id) { if(!confirm('Delete this strategy?')) return; await db.from('screening_strategies').delete().eq('id',id); await renderScreeningDepts(); showToast('Strategy deleted.'); }

/* ══════════════════════════════════════════
   COMPETENCY
══════════════════════════════════════════ */
function renderDepts() {
  const el = document.getElementById('deptList'); if (!el) return;
  el.innerHTML='';
  const addBtn = document.getElementById('addJobBtn');
  if (addBtn) addBtn.style.display = userRole==='admin'?'flex':'none';
  const depts = userRole==='manager' && currentProfile.department
    ? { [currentProfile.department]: departmentsData[currentProfile.department]||[] }
    : departmentsData;
  for (const [dept, jobs] of Object.entries(depts)) {
    const block = document.createElement('div'); block.className='dept-block';
    const jobRows = (jobs||[]).map(j => {
      const key=`${dept}|${j}`; const files=competencyFiles[key]||{};
      const safeD=dept.replace(/'/g,"\\'"); const safeJ=j.replace(/'/g,"\\'");
      const pdfBadges=[
        files.framework?`<a class="pdf-badge" href="${files.framework}" target="_blank"><i class="ti ti-file-text"></i> Framework</a>`:'',
        files.jd?`<a class="pdf-badge" href="${files.jd}" target="_blank"><i class="ti ti-file-description"></i> JD</a>`:''
      ].join('');
      const adminBtns = userRole==='admin'?`<div class="job-actions">
        <button class="job-btn pdf" onclick="openCompPdfModal('${safeD}','${safeJ}')"><i class="ti ti-upload"></i> Docs</button>
        <button class="job-btn" onclick="editJob('${safeD}','${safeJ}')"><i class="ti ti-edit"></i> Edit</button>
        <button class="job-btn del" onclick="deleteJob('${safeD}','${safeJ}')"><i class="ti ti-trash"></i></button>
      </div>`:'';
      return `<div class="job-item"><span class="job-name"><i class="ti ti-point-filled"></i>${escapeHtml(j)} ${pdfBadges}</span>${adminBtns}</div>`;
    }).join('');
    block.innerHTML=`<div class="dept-header" onclick="toggleDept(this)"><h4><i class="ti ti-building"></i>${escapeHtml(dept)}<span class="dept-count">${(jobs||[]).length} roles</span></h4><i class="ti ti-chevron-down chevron"></i></div><div class="job-list">${jobRows}</div>`;
    el.appendChild(block);
  }
}

function toggleDept(header) { const list=header.nextElementSibling; const icon=header.querySelector('.chevron'); list.classList.toggle('open'); if(icon) icon.classList.toggle('open'); }
function openAddJobModal() { document.getElementById('newJobTitle').value=''; document.getElementById('addJobModal').classList.add('open'); }

function addJob() {
  const dept=document.getElementById('newJobDept').value; const title=document.getElementById('newJobTitle').value.trim();
  if (!title) { alert('Please enter a job title.'); return; }
  if (!departmentsData[dept]) departmentsData[dept]=[];
  departmentsData[dept].push(title);
  renderDepts(); closeModal('addJobModal'); showToast('Job added.');
}

function deleteJob(dept,job) { if(!confirm(`Remove "${job}" from ${dept}?`)) return; departmentsData[dept]=departmentsData[dept].filter(j=>j!==job); renderDepts(); }
function editJob(dept,job) { const n=prompt('Edit job title:',job); if(n&&n.trim()) { const idx=departmentsData[dept].indexOf(job); if(idx!==-1){departmentsData[dept][idx]=n.trim();renderDepts();} } }

function openCompPdfModal(dept,job) {
  currentCompJob={dept,job};
  document.getElementById('compPdfJobTitle').textContent=job;
  document.getElementById('compFrameworkLabel').textContent='Click to upload';
  document.getElementById('compJdLabel').textContent='Click to upload';
  const key=`${dept}|${job}`; const files=competencyFiles[key]||{};
  const wrap=document.getElementById('compUploadedFiles'); wrap.innerHTML='';
  if(files.framework) wrap.innerHTML+=`<a class="pdf-badge" href="${files.framework}" target="_blank"><i class="ti ti-file-text"></i> Framework</a>`;
  if(files.jd)        wrap.innerHTML+=`<a class="pdf-badge" href="${files.jd}" target="_blank"><i class="ti ti-file-description"></i> JD</a>`;
  document.getElementById('compPdfModal').classList.add('open');
}

async function handleCompPdfUpload(e,type) {
  const file=e.target.files[0]; if(!file||!currentCompJob) return;
  const {dept,job}=currentCompJob; const key=`${dept}|${job}`;
  const safeName=`${dept}_${job}_${type}`.replace(/[^a-zA-Z0-9_]/g,'_');
  const filePath=`competency/${safeName}.pdf`;
  const {error}=await db.storage.from('competency').upload(filePath,file,{upsert:true});
  let url=error?URL.createObjectURL(file):(db.storage.from('competency').getPublicUrl(filePath).data?.publicUrl||'');
  if(!competencyFiles[key]) competencyFiles[key]={};
  competencyFiles[key][type]=url;
  document.getElementById(type==='framework'?'compFrameworkLabel':'compJdLabel').textContent=`✓ ${file.name}`;
  renderDepts(); showToast('Document uploaded.');
}

/* ══════════════════════════════════════════
   ASSESSMENTS TAB
   - Admin: can upload & assign to specific candidates
   - Candidate: only see assessments assigned to THEM; no default quiz shown unless assigned
   - Manager/Employee: no access
══════════════════════════════════════════ */
async function renderAssessmentsTab() {
  const adminView     = document.getElementById('adminAssessmentsView');
  const candidateView = document.getElementById('candidateAssessmentsView');

  if (userRole === 'admin') {
    if (adminView)     adminView.style.display     = 'block';
    if (candidateView) candidateView.style.display = 'none';
    document.getElementById('assessmentsSubtitle').textContent = 'Upload HTML assessments and assign them to specific candidates';
    await renderAdminAssessmentsList();
  } else if (userRole === 'candidate') {
    if (adminView)     adminView.style.display     = 'none';
    if (candidateView) candidateView.style.display = 'block';
    document.getElementById('assessmentsSubtitle').textContent = 'Your assigned assessments';
    await renderCandidateUploadedAssessments();
    // Hide the general quiz section — candidates only see assigned assessments
    const assessStatusCard = document.getElementById('assessStatusCard');
    const questionsPanel   = document.getElementById('questionsPanel');
    if (assessStatusCard) assessStatusCard.style.display = 'none';
    if (questionsPanel)   questionsPanel.innerHTML = '';
  } else {
    // Manager / Employee — should not reach this tab but guard anyway
    if (adminView)     adminView.style.display     = 'none';
    if (candidateView) candidateView.style.display = 'none';
    document.getElementById('assessmentsSubtitle').textContent = 'No assessments available for your role.';
  }
}

async function renderAdminAssessmentsList() {
  const el = document.getElementById('adminCandidateAssessmentList'); if (!el) return;
  const { data: candidates } = await db.from('profiles').select('*').eq('role','candidate').order('first_name');
  if (!candidates || candidates.length === 0) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No candidates have signed up yet.</p>';
    return;
  }
  el.innerHTML = '';
  for (const c of candidates) {
    const fullName = `${c.first_name} ${c.last_name}`.trim() || c.email;
    const { data: assessments } = await db.from('candidate_assessments').select('*').eq('candidate_id', c.id);
    const count = (assessments||[]).length;
    el.innerHTML += `
      <div class="candidate-assess-row">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="applicant-avatar">${getInitials(fullName)}</div>
          <div>
            <div style="font-size:13px;font-weight:600">${escapeHtml(fullName)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(c.email)}</div>
            <div style="font-size:11px;color:var(--brand);margin-top:2px">${count} assessment${count!==1?'s':''} assigned</div>
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm" onclick="viewCandidateAssessments('${c.id}','${escapeHtml(fullName)}')">
            <i class="ti ti-list"></i> View
          </button>
          <button class="btn btn-primary btn-sm" onclick="openAdminAssessmentModal('${c.id}','${escapeHtml(fullName)}','${escapeHtml(c.email)}')">
            <i class="ti ti-upload"></i> Upload
          </button>
        </div>
      </div>`;
  }
}

async function viewCandidateAssessments(candidateId, candidateName) {
  const { data } = await db.from('candidate_assessments').select('*').eq('candidate_id', candidateId).order('created_at',{ascending:false});
  const items = data || [];
  const modal   = document.getElementById('candidateProfileModal');
  const content = document.getElementById('cpModalContent');
  const nameEl  = document.getElementById('cpModalName');
  nameEl.textContent = candidateName + ' — Assessments';
  content.innerHTML = items.length === 0
    ? '<p style="font-size:13px;color:var(--text-muted)">No assessments assigned yet.</p>'
    : items.map(a=>`
        <div class="uploaded-assess-card">
          <div>
            <div class="uploaded-assess-title">${escapeHtml(a.title)}</div>
            <div class="uploaded-assess-desc">${escapeHtml(a.description||'')}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${new Date(a.created_at).toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'})}</div>
          </div>
          <div style="display:flex;gap:6px">
            <a href="${a.file_url}" target="_blank" class="btn btn-primary btn-sm"><i class="ti ti-external-link"></i> Open</a>
            <button class="btn btn-danger btn-sm" onclick="deleteAdminAssessment('${a.id}','${candidateId}','${escapeHtml(candidateName)}')"><i class="ti ti-trash"></i></button>
          </div>
        </div>`).join('');
  modal.classList.add('open');
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
  const file = e.target.files[0];
  if (!file) return;
  if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
    alert('Please upload an HTML file only (.html or .htm).');
    e.target.value = '';
    return;
  }
  pendingAdminAssessFile = file;
  document.getElementById('adminAssessFileLabel').textContent = `✓ ${file.name}`;
}

async function saveAdminAssessment() {
  const title = document.getElementById('adminAssessTitle').value.trim();
  const desc  = document.getElementById('adminAssessDesc').value.trim();
  if (!title)               { alert('Please enter a title.'); return; }
  if (!pendingAdminAssessFile) { alert('Please upload an HTML file.'); return; }
  if (!pendingAdminAssessTarget) return;

  const path = `assessments/${pendingAdminAssessTarget.id}_${Date.now()}.html`;
  const { error: uploadErr } = await db.storage.from('cvs').upload(path, pendingAdminAssessFile, { upsert: true, contentType: 'text/html' });
  if (uploadErr) { alert('Upload failed: ' + uploadErr.message); return; }
  const { data: urlData } = db.storage.from('cvs').getPublicUrl(path);

  const { error } = await db.from('candidate_assessments').insert({
    candidate_id:    pendingAdminAssessTarget.id,
    candidate_email: pendingAdminAssessTarget.email,
    candidate_name:  pendingAdminAssessTarget.name,
    title, description: desc,
    file_url:  urlData?.publicUrl || '',
    file_name: pendingAdminAssessFile.name,
    uploaded_by: currentUser.id,
    created_at: new Date().toISOString()
  });

  if (error) { alert('Could not save: ' + error.message); return; }
  closeModal('adminAssessmentModal');
  showToast('Assessment uploaded and assigned to candidate.');
  await renderAdminAssessmentsList();
}

async function renderCandidateUploadedAssessments() {
  const el = document.getElementById('uploadedAssessmentsSection'); if (!el) return;
  const { data } = await db.from('candidate_assessments').select('*').eq('candidate_id', currentUser.id).order('created_at',{ascending:false});
  const items = data || [];
  if (items.length === 0) {
    el.innerHTML = `
      <div class="card" style="text-align:center;padding:40px">
        <i class="ti ti-file-off" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:12px"></i>
        <div style="font-size:14px;color:var(--text-muted)">No assessments have been assigned to you yet.</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px">Check back after your application has been reviewed.</div>
      </div>`;
    return;
  }
  el.innerHTML = `
    <div class="card">
      <div class="card-title"><i class="ti ti-file-upload"></i> Your Assessments</div>
      ${items.map(a=>`
        <div class="uploaded-assess-card">
          <div>
            <div class="uploaded-assess-title">${escapeHtml(a.title)}</div>
            <div class="uploaded-assess-desc">${escapeHtml(a.description||'')}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${new Date(a.created_at).toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'})}</div>
          </div>
          <a href="${a.file_url}" target="_blank" class="btn btn-primary btn-sm"><i class="ti ti-external-link"></i> Open Assessment</a>
        </div>`).join('')}
    </div>`;
}

/* ══════════════════════════════════════════
   PROGRESS TAB
══════════════════════════════════════════ */
async function renderProgress() {
  if (userRole==='candidate') {
    document.getElementById('progressCandidateView').style.display='block';
    document.getElementById('progressAdminView').style.display='none';
    applyStatus(currentProfile.status||'reviewing');
  } else {
    document.getElementById('progressCandidateView').style.display='none';
    document.getElementById('progressAdminView').style.display='block';
    await renderProgressAdmin();
  }
}

async function renderProgressAdmin() {
  const el=document.getElementById('progressVacancyList'); if(!el) return;
  const {data:vacs}=await db.from('vacancies').select('*').order('created_at',{ascending:false});
  const {data:apps}=await db.from('applications').select('*').order('submitted_at',{ascending:false});
  const vacList=(vacs&&vacs.length>0)?vacs:getDemoVacancies();
  const appList=apps||[];
  el.innerHTML='';
  for (const vac of vacList) {
    const vacApps=appList.filter(a=>String(a.vacancy_id)===String(vac.id));
    const block=document.createElement('div'); block.className='progress-vacancy-block';
    const appRows=vacApps.length===0
      ? '<div style="padding:16px 0;font-size:13px;color:var(--text-muted)">No applicants yet.</div>'
      : vacApps.map(app=>{
          const cfg=statusConfig[app.status]||statusConfig.reviewing;
          return `<div class="applicant-row">
            <div class="applicant-row-info" style="cursor:pointer" onclick="openCandidateProfile('${app.id}')">
              <div class="applicant-avatar">${getInitials(app.candidate_name||'CA')}</div>
              <div><div class="applicant-row-name">${escapeHtml(app.candidate_name||'Candidate')}</div><div class="applicant-row-email">${escapeHtml(app.candidate_email||'')}</div></div>
            </div>
            <div class="applicant-row-actions">
              <span class="status-badge ${cfg.cls}" style="margin:0;font-size:10px">${cfg.label}</span>
              <button class="btn btn-secondary btn-sm" onclick="openCandidateProfile('${app.id}')"><i class="ti ti-eye"></i> View</button>
              <select class="stats-period-select" style="font-size:11px;padding:4px 8px" onchange="updateApplicantStatus('${app.id}','${app.candidate_email}',this.value,'${escapeHtml(app.candidate_name||'')}','${escapeHtml(app.vacancy_title||'')}')">
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
    block.innerHTML=`
      <div class="progress-vacancy-header" onclick="toggleProgressVacancy(this)">
        <div><div class="progress-vacancy-title">${escapeHtml(vac.title)}</div><div class="progress-vacancy-meta">${escapeHtml(vac.department||'')} · ${vacApps.length} applicant${vacApps.length!==1?'s':''}</div></div>
        <i class="ti ti-chevron-down chevron"></i>
      </div>
      <div class="progress-applicant-list">${appRows}</div>`;
    el.appendChild(block);
  }
}

async function updateApplicantStatus(appId, email, newStatus, name, vacTitle) {
  if (!newStatus) return;
  await db.from('applications').update({status:newStatus}).eq('id',appId);
  await db.from('profiles').update({status:newStatus}).eq('email',email);
  if (newStatus==='rejected') await sendRejectionEmail(email, name, vacTitle);
  else await sendStatusUpdateEmail(email, name, vacTitle, newStatus);
  showToast('Status updated.');
  await renderProgressAdmin();
}

function toggleProgressVacancy(header) { const list=header.nextElementSibling; const icon=header.querySelector('.chevron'); list.classList.toggle('open'); if(icon) icon.classList.toggle('open'); }

/* ── CANDIDATE PROFILE MODAL ── */
async function openCandidateProfile(appId) {
  const modal=document.getElementById('candidateProfileModal');
  const content=document.getElementById('cpModalContent');
  const nameEl=document.getElementById('cpModalName');
  content.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted)">Loading...</div>';
  modal.classList.add('open');

  const {data:app}=await db.from('applications').select('*').eq('id',appId).single();
  if (!app) { content.innerHTML='<p style="color:var(--danger)">Could not load application.</p>'; return; }
  const {data:profile}=await db.from('profiles').select('*').eq('email',app.candidate_email).single();
  nameEl.textContent=app.candidate_name||'Candidate';

  const answers=safeParseJSON(app.answers,{});
  const vac=vacanciesData.find(v=>String(v.id)===String(app.vacancy_id));
  const questions=vac?.screening_questions||[];
  const cfg=statusConfig[app.status]||statusConfig.reviewing;
  const cvUrl=profile?.cv_url||app.cv_url||'';

  const answersHtml=questions.length>0
    ? questions.map((q,qi)=>{
        const chosen=answers[qi]!==undefined?q.opts?.[answers[qi]]:'—';
        const correct=answers[qi]===q.correct;
        return `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:3px">Q${qi+1}: ${escapeHtml(q.q)}</div>
          <div style="font-size:13px;color:${correct?'var(--success)':'var(--danger)'};font-weight:500"><i class="ti ${correct?'ti-check':'ti-x'}"></i> ${escapeHtml(chosen||'—')}</div>
        </div>`;
      }).join('')
    : '<p style="font-size:13px;color:var(--text-muted)">No screening questions for this vacancy.</p>';

  content.innerHTML=`
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px">
      <div class="applicant-avatar" style="width:52px;height:52px;font-size:18px">${getInitials(app.candidate_name||'CA')}</div>
      <div>
        <div style="font-size:15px;font-weight:600">${escapeHtml(app.candidate_name||'—')}</div>
        <div style="font-size:12px;color:var(--text-muted)">${escapeHtml(app.candidate_email||'—')}</div>
        <span class="status-badge ${cfg.cls}" style="margin-top:6px">${cfg.label}</span>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px;padding:16px">
      <div class="card-title"><i class="ti ti-user"></i> Profile Details</div>
      <div class="info-row"><span class="key">Phone</span><span class="val">${escapeHtml(profile?.phone||'—')}</span></div>
      <div class="info-row"><span class="key">ID Number</span><span class="val">${escapeHtml(profile?.id_number||'—')}</span></div>
      <div class="info-row"><span class="key">Location</span><span class="val">${escapeHtml(profile?.location||'—')}</span></div>
      <div class="info-row"><span class="key">Nationality</span><span class="val">${escapeHtml(profile?.nationality||'—')}</span></div>
      <div style="margin-top:12px">
        ${cvUrl?`<a href="${cvUrl}" target="_blank" class="btn btn-secondary btn-sm"><i class="ti ti-file-cv"></i> View CV / Documents</a>`:'<span style="font-size:12px;color:var(--text-muted)">No CV uploaded.</span>'}
      </div>
    </div>
    <div class="card" style="padding:16px">
      <div class="card-title"><i class="ti ti-help-circle"></i> Screening Answers</div>
      <div style="margin-bottom:8px"><span class="status-pill ${app.score>=70?'green':app.score>=40?'yellow':'brand'}">Score: ${app.score}%</span></div>
      ${answersHtml}
    </div>`;
}

async function openCandidateProfileByEmail(email) {
  if (!email) return;
  const modal=document.getElementById('candidateProfileModal');
  const content=document.getElementById('cpModalContent');
  const nameEl=document.getElementById('cpModalName');
  content.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted)">Loading...</div>';
  modal.classList.add('open');
  const {data:profile}=await db.from('profiles').select('*').eq('email',email).single();
  const {data:apps}=await db.from('applications').select('*').eq('candidate_email',email).order('submitted_at',{ascending:false});
  const app=apps?.[0];
  const fullName=profile?`${profile.first_name} ${profile.last_name}`.trim():email;
  nameEl.textContent=fullName;
  const cvUrl=profile?.cv_url||app?.cv_url||'';
  content.innerHTML=`
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px">
      <div class="applicant-avatar" style="width:52px;height:52px;font-size:18px">${getInitials(fullName)}</div>
      <div><div style="font-size:15px;font-weight:600">${escapeHtml(fullName)}</div><div style="font-size:12px;color:var(--text-muted)">${escapeHtml(email)}</div></div>
    </div>
    ${profile?`<div class="card" style="margin-bottom:16px;padding:16px">
      <div class="card-title"><i class="ti ti-user"></i> Profile Details</div>
      <div class="info-row"><span class="key">Phone</span><span class="val">${escapeHtml(profile.phone||'—')}</span></div>
      <div class="info-row"><span class="key">Location</span><span class="val">${escapeHtml(profile.location||'—')}</span></div>
      <div style="margin-top:12px">${cvUrl?`<a href="${cvUrl}" target="_blank" class="btn btn-secondary btn-sm"><i class="ti ti-file-cv"></i> View CV</a>`:'<span style="font-size:12px;color:var(--text-muted)">No CV uploaded.</span>'}</div>
    </div>`:''}`;
}

/* ══════════════════════════════════════════
   VACANCIES
══════════════════════════════════════════ */
async function renderVacancies() {
  const {data,error}=await db.from('vacancies').select('*').order('created_at',{ascending:false});
  vacanciesData=(error||!data||data.length===0)?getDemoVacancies():data.map(v=>({...v,screening_questions:safeParseJSON(v.screening_questions,[])}));
  if (userRole==='candidate') renderCandidateVacancies();
}

function getDemoVacancies() {
  return [
    {id:'demo1',title:'Financial Accountant',department:'Finance',location:'Cape Town',type:'Full-time',description:'Manage financial records, prepare reports and ensure compliance.',closing_date:'2025-08-15',posted:true,screening_questions:[{q:'Do you have a BCom Accounting degree?',opts:['Yes','No'],correct:0}]},
    {id:'demo2',title:'HR Business Partner',department:'Human Capital',location:'Cape Town',type:'Full-time',description:'Partner with business units to deliver strategic HR solutions.',closing_date:'2025-08-30',posted:true,screening_questions:[{q:'Do you have an HR degree?',opts:['Yes','No'],correct:0}]}
  ];
}

function renderCandidateVacancies() {
  const grid=document.getElementById('vacancyList'); if(!grid) return;
  const posted=vacanciesData.filter(v=>v.posted);
  if (posted.length===0) { grid.innerHTML=`<div style="text-align:center;padding:40px;color:var(--text-muted)"><i class="ti ti-search" style="font-size:32px;display:block;margin-bottom:10px"></i>No vacancies available at the moment.</div>`; return; }
  grid.innerHTML=posted.map(v=>`
    <div class="vacancy-card">
      <div class="vacancy-title">${escapeHtml(v.title)}</div>
      <div class="vacancy-dept">${escapeHtml(v.department)}</div>
      <div class="vacancy-meta">
        <span><i class="ti ti-map-pin"></i> ${escapeHtml(v.location||'Cape Town')}</span>
        <span><i class="ti ti-clock"></i> ${escapeHtml(v.type||'Full-time')}</span>
        <span><i class="ti ti-calendar"></i> Closes ${formatDate(v.closing_date)}</span>
      </div>
      <div class="vacancy-desc">${escapeHtml(v.description||'')}</div>
      <div class="vacancy-footer"><span></span>
        <button class="btn btn-primary" onclick="checkAndOpenApply('${v.id}')"><i class="ti ti-send"></i> Apply Now</button>
      </div>
    </div>`).join('');
}

/* ══════════════════════════════════════════
   MANAGE VACANCIES (Admin)
══════════════════════════════════════════ */
async function renderAdminVacancies() {
  const el=document.getElementById('adminVacancyList'); if(!el) return;
  await renderVacancies();
  if (vacanciesData.length===0) { el.innerHTML='<div style="text-align:center;padding:40px;color:var(--text-muted)">No vacancies yet.</div>'; return; }
  el.innerHTML=vacanciesData.map(v=>`
    <div class="admin-vacancy-block">
      <div class="admin-vacancy-header">
        <div><div class="admin-vacancy-title">${escapeHtml(v.title)}</div><div class="admin-vacancy-dept">${escapeHtml(v.department)} · ${escapeHtml(v.location||'Cape Town')} · ${escapeHtml(v.type||'Full-time')}</div></div>
        <div class="admin-vacancy-actions">
          <label class="posted-toggle" onclick="togglePosted('${v.id}')">
            <div class="toggle-switch ${v.posted?'on':''}" id="toggle_${v.id}"></div>
            <span id="toggleLabel_${v.id}">${v.posted?'Posted':'Draft'}</span>
          </label>
          <button class="btn btn-secondary btn-sm" onclick="openScreeningQModal('${v.id}')"><i class="ti ti-help-circle"></i> Questions</button>
          <button class="btn btn-purple btn-sm" onclick="openApplicantListModal('${v.id}')"><i class="ti ti-users"></i> Applicants</button>
          <button class="btn btn-danger btn-sm" onclick="deleteVacancy('${v.id}')"><i class="ti ti-trash"></i></button>
        </div>
      </div>
    </div>`).join('');
}

async function togglePosted(vacId) {
  const vac=vacanciesData.find(v=>String(v.id)===String(vacId)); if(!vac) return;
  vac.posted=!vac.posted;
  const t=document.getElementById(`toggle_${vacId}`); const l=document.getElementById(`toggleLabel_${vacId}`);
  if(t) t.classList.toggle('on',vac.posted); if(l) l.textContent=vac.posted?'Posted':'Draft';
  if(!String(vacId).startsWith('demo')) await db.from('vacancies').update({posted:vac.posted}).eq('id',vacId);
  showToast(vac.posted?'Vacancy posted.':'Set to draft.');
}

function openAddVacancyModal() { document.getElementById('addVacancyModal').classList.add('open'); }

async function addVacancy() {
  const title=document.getElementById('vacTitle').value.trim(); const dept=document.getElementById('vacDept').value;
  const loc=document.getElementById('vacLocation').value.trim(); const type=document.getElementById('vacType').value;
  const desc=document.getElementById('vacDesc').value.trim(); const closing=document.getElementById('vacClosing').value;
  if (!title) { alert('Please enter a job title.'); return; }
  const {data}=await db.from('vacancies').insert({title,department:dept,location:loc,type,description:desc,closing_date:closing,posted:false,screening_questions:JSON.stringify([]),created_by:currentUser.id,created_at:new Date().toISOString()}).select().single();
  vacanciesData.unshift({id:data?.id||'local_'+Date.now(),title,department:dept,location:loc,type,description:desc,closing_date:closing,posted:false,screening_questions:[]});
  closeModal('addVacancyModal');
  ['vacTitle','vacLocation','vacDesc','vacClosing'].forEach(id=>{document.getElementById(id).value='';});
  await renderAdminVacancies(); showToast('Vacancy created.');
}

async function deleteVacancy(vacId) {
  if(!confirm('Delete this vacancy?')) return;
  vacanciesData=vacanciesData.filter(v=>String(v.id)!==String(vacId));
  if(!String(vacId).startsWith('demo')&&!String(vacId).startsWith('local')) await db.from('vacancies').delete().eq('id',vacId);
  await renderAdminVacancies();
}

/* ══════════════════════════════════════════
   SCREENING QUESTIONS
══════════════════════════════════════════ */
function openScreeningQModal(vacId) {
  currentVacancyId=vacId;
  const vac=vacanciesData.find(v=>String(v.id)===String(vacId));
  if(!vac) { alert('Vacancy not found.'); return; }
  document.getElementById('sqJobTitle').textContent=vac.title;
  renderSQList(vac.screening_questions||[]);
  document.getElementById('screeningQModal').classList.add('open');
}

function renderSQList(questions) {
  const el=document.getElementById('sqList'); if(!el) return;
  el.innerHTML=questions.map((q,qi)=>`
    <div class="sq-item">
      <div class="sq-num">Question ${qi+1}</div>
      <div class="form-group" style="margin-bottom:10px"><input type="text" value="${escapeHtml(q.q||'')}" placeholder="Enter question..." onchange="updateSQQuestion(${qi},this.value)"/></div>
      <div class="sq-options-builder">
        ${(q.opts||['','']).map((opt,oi)=>`
          <div class="sq-option-row">
            <input type="radio" name="sqCorrect_${qi}" value="${oi}" class="sq-correct-radio" ${q.correct===oi?'checked':''} onchange="updateSQCorrect(${qi},${oi})" title="Mark as correct"/>
            <span class="sq-correct-label">Correct</span>
            <input type="text" value="${escapeHtml(opt)}" placeholder="Option ${oi+1}..." onchange="updateSQOption(${qi},${oi},this.value)"/>
            ${q.opts.length>2?`<button class="job-btn del" onclick="removeSQOption(${qi},${oi})"><i class="ti ti-x"></i></button>`:''}
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-secondary btn-sm" onclick="addSQOption(${qi})"><i class="ti ti-plus"></i> Add Option</button>
        <button class="btn btn-danger btn-sm" onclick="removeSQQuestion(${qi})"><i class="ti ti-trash"></i> Remove</button>
      </div>
    </div>`).join('');
}

function getCurrentSQQuestions() { const vac=vacanciesData.find(v=>String(v.id)===String(currentVacancyId)); return vac?(vac.screening_questions||[]): []; }
function addScreeningQuestion() { const vac=vacanciesData.find(v=>String(v.id)===String(currentVacancyId)); if(!vac) return; if(!vac.screening_questions) vac.screening_questions=[]; vac.screening_questions.push({q:'',opts:['',''],correct:0}); renderSQList(vac.screening_questions); }
function updateSQQuestion(qi,val) { const qs=getCurrentSQQuestions(); if(qs[qi]) qs[qi].q=val; }
function updateSQOption(qi,oi,val) { const qs=getCurrentSQQuestions(); if(qs[qi]?.opts) qs[qi].opts[oi]=val; }
function updateSQCorrect(qi,oi) { const qs=getCurrentSQQuestions(); if(qs[qi]) qs[qi].correct=oi; }
function addSQOption(qi) { const qs=getCurrentSQQuestions(); if(qs[qi]&&qs[qi].opts.length<5){qs[qi].opts.push('');renderSQList(qs);} }
function removeSQOption(qi,oi) { const qs=getCurrentSQQuestions(); if(qs[qi]&&qs[qi].opts.length>2){qs[qi].opts.splice(oi,1);if(qs[qi].correct>=qs[qi].opts.length) qs[qi].correct=0;renderSQList(qs);} }
function removeSQQuestion(qi) { const vac=vacanciesData.find(v=>String(v.id)===String(currentVacancyId)); if(vac?.screening_questions){vac.screening_questions.splice(qi,1);renderSQList(vac.screening_questions);} }

async function saveScreeningQuestions() {
  const vac=vacanciesData.find(v=>String(v.id)===String(currentVacancyId)); if(!vac) return;
  const id=String(currentVacancyId);
  if(!id.startsWith('demo')&&!id.startsWith('local')) {
    const {error}=await db.from('vacancies').update({screening_questions:JSON.stringify(vac.screening_questions)}).eq('id',currentVacancyId);
    if(error){alert('Could not save: '+error.message);return;}
  }
  closeModal('screeningQModal'); showToast('Screening questions saved.');
}

/* ══════════════════════════════════════════
   APPLY FLOW
══════════════════════════════════════════ */
async function checkAndOpenApply(vacId) {
  try {
    const {data:existing}=await db.from('applications').select('id').eq('user_id',currentUser.id).eq('vacancy_id',String(vacId));
    if (existing&&existing.length>0) {
      document.getElementById('replaceAppYes').onclick=()=>{closeModal('replaceAppModal');openApplyModal(vacId);};
      document.getElementById('replaceAppModal').classList.add('open');
    } else { openApplyModal(vacId); }
  } catch(err) { openApplyModal(vacId); }
}

function openApplyModal(vacId) {
  currentVacancyId=vacId; applyAnswers={}; applyCVFile=null;
  document.getElementById('applyCVLabel').textContent='Click to upload your CV (PDF, Word)';
  const vac=vacanciesData.find(v=>String(v.id)===String(vacId)); if(!vac) return;
  document.getElementById('applyJobTitle').textContent=vac.title;
  const questions=vac.screening_questions||[];
  const el=document.getElementById('applyQuestionsList');
  el.innerHTML=questions.length===0
    ?`<div class="notice"><i class="ti ti-info-circle"></i><span>No screening questions for this role. Upload your CV and submit.</span></div>`
    :questions.map((q,qi)=>`
        <div class="q-card">
          <div class="q-num">Question ${qi+1} of ${questions.length}</div>
          <div class="q-text">${escapeHtml(q.q)}</div>
          <div class="q-options">
            ${q.opts.map((opt,oi)=>`
              <label class="q-opt" id="applyOpt_${qi}_${oi}">
                <input type="radio" name="applyQ${qi}" value="${oi}" onchange="selectApplyOpt(${qi},${oi})"/> ${escapeHtml(opt)}
              </label>`).join('')}
          </div>
        </div>`).join('');
  document.getElementById('applyModal').classList.add('open');
}

function selectApplyOpt(qi,oi) {
  const vac=vacanciesData.find(v=>String(v.id)===String(currentVacancyId)); if(!vac) return;
  (vac.screening_questions||[])[qi]?.opts.forEach((_,i)=>{const el=document.getElementById(`applyOpt_${qi}_${i}`);if(el) el.classList.remove('selected');});
  const sel=document.getElementById(`applyOpt_${qi}_${oi}`); if(sel) sel.classList.add('selected');
  applyAnswers[qi]=oi;
}

async function submitApplication() {
  const vac=vacanciesData.find(v=>String(v.id)===String(currentVacancyId)); if(!vac) return;
  const questions=vac.screening_questions||[];
  if(questions.length>0&&Object.keys(applyAnswers).length<questions.length){alert('Please answer all questions before submitting.');return;}
  let correct=0; questions.forEach((q,qi)=>{if(applyAnswers[qi]===q.correct) correct++;});
  const score=questions.length>0?Math.round((correct/questions.length)*100):100;
  const fullName=`${currentProfile.first_name} ${currentProfile.last_name}`.trim();
  let cvUrl=currentProfile.cv_url||'';
  if (applyCVFile) {
    const ext=applyCVFile.name.split('.').pop();
    const path=`cvs/applications/${currentUser.id}_${Date.now()}.${ext}`;
    const {error:uploadErr}=await db.storage.from('cvs').upload(path,applyCVFile,{upsert:true});
    if(!uploadErr){const{data}=db.storage.from('cvs').getPublicUrl(path);cvUrl=data?.publicUrl||cvUrl;}
  }
  const {data:existing}=await db.from('applications').select('id').eq('user_id',currentUser.id).eq('vacancy_id',String(currentVacancyId));
  if(existing&&existing.length>0) { for(const old of existing){await db.from('shortlists').delete().eq('application_id',old.id);await db.from('applications').delete().eq('id',old.id);} }
  const {error}=await db.from('applications').insert({vacancy_id:String(currentVacancyId),vacancy_title:vac.title,user_id:currentUser.id,candidate_name:fullName,candidate_email:currentUser.email,answers:JSON.stringify(applyAnswers),score,cv_url:cvUrl,status:'applied',submitted_at:new Date().toISOString()});
  if(error){alert('Could not submit: '+error.message);return;}
  await db.from('profiles').update({status:'reviewing'}).eq('id',currentUser.id);
  currentProfile.status='reviewing';
  applyAnswers={}; applyCVFile=null;
  closeModal('applyModal'); applyStatus('reviewing');
  showToast(`Application submitted! Fit score: ${score>=70?'🟢 Good':score>=40?'🟡 Moderate':'🔴 Under review'}`);
}

/* ══════════════════════════════════════════
   APPLICANTS MODAL — SHORTLIST WORKFLOW
══════════════════════════════════════════ */
async function openApplicantListModal(vacId) {
  currentVacancyId=vacId;
  const vac=vacanciesData.find(v=>String(v.id)===String(vacId));
  document.getElementById('alJobTitle').textContent=vac?vac.title:vacId;

  const {data,error}=await db.from('applications').select('*').eq('vacancy_id',String(vacId)).order('score',{ascending:false});
  if(error) console.error('Applicants error:',error);
  const apps=data||[];

  const {data:existingShortlist}=await db.from('shortlists').select('*').eq('vacancy_id',String(vacId));
  const shortlistMap={};
  (existingShortlist||[]).forEach(s=>{shortlistMap[s.application_id]=s.list_type;});

  shortlistDraft={};
  const activeApps = apps.filter(a => a.status !== 'rejected' || !shortlistMap[a.id]);
  activeApps.forEach(a=>{shortlistDraft[a.id]=shortlistMap[a.id]||'pending';});
  window._currentApplicantApps=activeApps;

  renderApplicantColumns(activeApps);

  const hasShortlistInDB=(existingShortlist||[]).some(s=>s.list_type==='shortlist');
  if (hasShortlistInDB) await renderManagerApprovalsSection(vacId, activeApps);
  renderShortlistActionButton(activeApps, hasShortlistInDB);
  document.getElementById('applicantListModal').classList.add('open');
}

function renderShortlistActionButton(apps, shortlistSentToManager) {
  const wrap=document.getElementById('shortlistActionWrap'); if(!wrap) return;
  const pending=apps.filter(a=>shortlistDraft[a.id]==='pending');
  if (shortlistSentToManager) {
    wrap.innerHTML=`<button class="btn btn-primary" style="padding:12px 28px;font-size:14px" onclick="finaliseApplicationStatuses()"><i class="ti ti-check"></i> Update Application Status for All</button>`;
  } else if (pending.length===0 && apps.length>0) {
    wrap.innerHTML=`<button class="btn btn-purple" style="padding:12px 28px;font-size:14px" onclick="informManagerOfShortlist()"><i class="ti ti-send"></i> Inform Manager of Shortlist</button>`;
  } else {
    wrap.innerHTML='';
  }
}

async function renderManagerApprovalsSection(vacId, apps) {
  const section=document.getElementById('managerApprovalsSection'); if(!section) return;
  const {data:reviews}=await db.from('manager_reviews').select('*').eq('vacancy_id',String(vacId));
  const reviewMap={};
  (reviews||[]).forEach(r=>{reviewMap[r.application_id]={decision:r.decision,reason:r.reason||''};});
  const shortlisted=apps.filter(a=>shortlistDraft[a.id]==='shortlist');
  if(shortlisted.length===0){section.style.display='none';return;}
  section.style.display='block';
  const listEl=document.getElementById('managerApprovalsList'); if(!listEl) return;
  listEl.innerHTML=shortlisted.map(a=>{
    const review=reviewMap[a.id]; const decision=review?.decision; const reason=review?.reason||'';
    const badge=decision==='continue'
      ? `<div><span class="approval-decision continue"><i class="ti ti-check"></i> Continue</span></div>`
      : decision==='no-continue'
      ? `<div><span class="approval-decision no-continue"><i class="ti ti-x"></i> Don't Continue</span>${reason?`<div style="font-size:11px;color:var(--danger);margin-top:4px;font-style:italic">"${escapeHtml(reason)}"</div>`:''}</div>`
      : `<span class="approval-decision pending"><i class="ti ti-clock"></i> Pending</span>`;
    return `<div class="approval-row">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="applicant-avatar">${getInitials(a.candidate_name||'CA')}</div>
        <div><div style="font-size:13px;font-weight:500">${escapeHtml(a.candidate_name||'Candidate')}</div>
        <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(a.candidate_email||'')}</div></div>
      </div>
      ${badge}
    </div>`;
  }).join('');
}

async function informManagerOfShortlist() {
  const apps=window._currentApplicantApps||[];
  const shortlisted=apps.filter(a=>shortlistDraft[a.id]==='shortlist');
  if(shortlisted.length===0){alert('No candidates in the shortlist.');return;}
  if(!confirm(`Inform manager of ${shortlisted.length} shortlisted candidate(s)?`)) return;
  const vac=vacanciesData.find(v=>String(v.id)===String(currentVacancyId));
  for(const app of shortlisted) {
    const {data:existing}=await db.from('shortlists').select('id').eq('application_id',app.id).maybeSingle();
    if(existing) { await db.from('shortlists').update({list_type:'shortlist',updated_at:new Date().toISOString()}).eq('id',existing.id); }
    else { await db.from('shortlists').insert({vacancy_id:String(currentVacancyId),vacancy_title:vac?.title||'',application_id:app.id,candidate_name:app.candidate_name,candidate_email:app.candidate_email,list_type:'shortlist',score:app.score,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}); }
  }
  const deptManagers=await db.from('profiles').select('email,first_name,last_name').eq('role','manager').eq('department',vac?.department||'');
  for(const mgr of (deptManagers.data||[])) {
    await sendManagerShortlistEmail(mgr.email, `${mgr.first_name} ${mgr.last_name}`.trim(), vac?.title||'the vacancy');
  }
  showToast('Shortlist sent to manager for review.');
  await openApplicantListModal(currentVacancyId);
}

async function finaliseApplicationStatuses() {
  const apps=window._currentApplicantApps||[];
  if(apps.length===0) return;
  const {data:reviews}=await db.from('manager_reviews').select('*').eq('vacancy_id',String(currentVacancyId));
  const reviewMap={};
  (reviews||[]).forEach(r=>{reviewMap[r.application_id]=r.decision;});
  const shortlisted=apps.filter(a=>shortlistDraft[a.id]==='shortlist');
  const blockers=shortlisted.filter(a=>reviewMap[a.id]==='no-continue');
  if(blockers.length>0) { alert(`${blockers.length} shortlisted candidate(s) have been marked "Don't Continue". Please move them before updating.`); return; }
  if(!confirm('Update application statuses for all candidates?')) return;
  const vac=vacanciesData.find(v=>String(v.id)===String(currentVacancyId));
  for(const app of apps) {
    const listType=shortlistDraft[app.id];
    if(listType==='rejected') {
      if(app.status==='rejected') continue;
      await db.from('applications').update({status:'rejected'}).eq('id',app.id);
      await db.from('profiles').update({status:'rejected'}).eq('email',app.candidate_email);
      await sendRejectionEmail(app.candidate_email,app.candidate_name,app.vacancy_title);
      await db.from('shortlists').delete().eq('application_id',app.id);
    } else if(listType==='longlist') {
      await db.from('applications').update({status:'reviewing'}).eq('id',app.id);
      await db.from('profiles').update({status:'reviewing'}).eq('email',app.candidate_email);
      await db.from('shortlists').delete().eq('application_id',app.id);
    } else if(listType==='shortlist') {
      await db.from('applications').update({status:'interview1'}).eq('id',app.id);
      await db.from('profiles').update({status:'interview1'}).eq('email',app.candidate_email);
      await sendStatusUpdateEmail(app.candidate_email,app.candidate_name,app.vacancy_title,'1st Interview');
      await sendCandidateInterviewInviteEmail(app.candidate_email,app.candidate_name,app.vacancy_title);
    }
  }
  showToast('All statuses updated successfully.');
  closeModal('applicantListModal');
  await renderProgressAdmin();
}

function renderApplicantColumns(apps) {
  const pending  =apps.filter(a=>shortlistDraft[a.id]==='pending');
  const shortlist=apps.filter(a=>shortlistDraft[a.id]==='shortlist');
  const longlist =apps.filter(a=>shortlistDraft[a.id]==='longlist');
  const rejected =apps.filter(a=>shortlistDraft[a.id]==='rejected');
  const scoreClass=s=>s>=70?'good':s>=40?'moderate':'poor';

  const renderChip=a=>`
    <div class="applicant-chip" draggable="true" data-appid="${a.id}"
      ondragstart="dragStart(event,'${a.id}')" ondragend="dragEnd(event)"
      onclick="openCandidateProfile('${a.id}')">
      <div style="display:flex;align-items:center;gap:8px">
        <i class="ti ti-grip-vertical chip-drag-handle"></i>
        <div style="flex:1;min-width:0">
          <div class="applicant-chip-name">${escapeHtml(a.candidate_name||'Candidate')}</div>
          <div style="font-size:10px;color:var(--text-muted)">${escapeHtml(a.candidate_email||'')}</div>
        </div>
        <span class="chip-score-badge ${scoreClass(a.score)}">${a.score}%</span>
      </div>
    </div>`;

  const renderCol=arr=>arr.length===0
    ?'<div style="font-size:12px;color:var(--text-muted);padding:8px 0;text-align:center">Drop here</div>'
    :arr.map(a=>renderChip(a)).join('');

  document.getElementById('colPending').innerHTML  =renderCol(pending);
  document.getElementById('colShortlist').innerHTML=renderCol(shortlist);
  document.getElementById('colLonglist').innerHTML =renderCol(longlist);
  document.getElementById('colRejected').innerHTML =renderCol(rejected);
}

function dragStart(event,appId) { event.dataTransfer.setData('appId',appId); event.target.classList.add('dragging'); }
function dragEnd(event) { event.target.classList.remove('dragging'); document.querySelectorAll('.applicant-col').forEach(c=>c.classList.remove('drag-over')); }

async function dropApplicant(event,newList) {
  event.preventDefault();
  const appId=event.dataTransfer.getData('appId'); if(!appId) return;
  event.currentTarget.classList.remove('drag-over');
  shortlistDraft[appId]=newList;
  const apps=window._currentApplicantApps||[];
  const app=apps.find(a=>a.id===appId);
  if(app) {
    const vac=vacanciesData.find(v=>String(v.id)===String(currentVacancyId));
    if(newList==='shortlist') {
      const {data:existing}=await db.from('shortlists').select('id').eq('application_id',appId).maybeSingle();
      if(existing) { await db.from('shortlists').update({list_type:'shortlist',updated_at:new Date().toISOString()}).eq('id',existing.id); }
      else { await db.from('shortlists').insert({vacancy_id:String(currentVacancyId),vacancy_title:vac?.title||'',application_id:appId,candidate_name:app.candidate_name,candidate_email:app.candidate_email,list_type:'shortlist',score:app.score,created_at:new Date().toISOString(),updated_at:new Date().toISOString()}); }
    } else {
      await db.from('shortlists').delete().eq('application_id',appId);
    }
  }
  renderApplicantColumns(apps);
  showToast('Candidate moved.','info');
}

/* ══════════════════════════════════════════
   MANAGER SHORTLIST VIEW
══════════════════════════════════════════ */
async function renderManagerShortlists() {
  const el=document.getElementById('managerShortlistView'); if(!el) return;
  const myDept=currentProfile.department;
  if(!myDept){el.innerHTML='<p style="font-size:13px;color:var(--text-muted)">No department assigned.</p>';return;}
  const {data:vacs}=await db.from('vacancies').select('*').eq('department',myDept);
  const vacIds=(vacs||[]).map(v=>String(v.id));
  if(vacIds.length===0){el.innerHTML='<p style="font-size:13px;color:var(--text-muted)">No vacancies for your department.</p>';return;}
  const {data:shortlists}=await db.from('shortlists').select('*').in('vacancy_id',vacIds).eq('list_type','shortlist');
  const {data:reviews}=await db.from('manager_reviews').select('*');
  const reviewMap={};
  (reviews||[]).forEach(r=>{reviewMap[r.application_id]={decision:r.decision,reason:r.reason||''};});
  const byVac={};
  (shortlists||[]).forEach(s=>{if(!byVac[s.vacancy_id]) byVac[s.vacancy_id]=[]; byVac[s.vacancy_id].push(s);});
  if(Object.keys(byVac).length===0){el.innerHTML='<p style="font-size:13px;color:var(--text-muted)">No shortlisted candidates yet.</p>';return;}
  el.innerHTML=Object.entries(byVac).map(([vacId,candidates])=>{
    const vac=(vacs||[]).find(v=>String(v.id)===String(vacId));
    return `<div class="manager-job-block">
      <div class="manager-job-header" onclick="toggleManagerJob(this)">
        <h4 style="font-size:13.5px;font-weight:500;display:flex;align-items:center;gap:10px">
          <i class="ti ti-briefcase" style="color:var(--accent-purple)"></i>
          ${escapeHtml(vac?.title||'Vacancy')}
          <span class="dept-count">${candidates.length} shortlisted</span>
        </h4>
        <i class="ti ti-chevron-down chevron"></i>
      </div>
      <div class="manager-job-body">
        ${candidates.map(c=>{
          const review=reviewMap[c.application_id]; const decision=review?.decision;
          const icon=decision==='continue'?'<i class="ti ti-check manager-decision-icon continue"></i>':decision==='no-continue'?'<i class="ti ti-x manager-decision-icon no-continue"></i>':'<i class="ti ti-clock" style="color:var(--text-muted);font-size:14px"></i>';
          return `<div class="manager-candidate-row" onclick="openManagerCandidateModal('${c.application_id}')">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="applicant-avatar">${getInitials(c.candidate_name||'CA')}</div>
              <div><div class="applicant-row-name">${escapeHtml(c.candidate_name||'Candidate')}</div><div class="applicant-row-email">${escapeHtml(c.candidate_email||'')}</div></div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">${icon}<i class="ti ti-chevron-right" style="color:var(--text-muted)"></i></div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

function toggleManagerJob(header){const body=header.nextElementSibling;const icon=header.querySelector('.chevron');body.classList.toggle('open');if(icon)icon.classList.toggle('open');}

async function openManagerCandidateModal(appId) {
  const modal=document.getElementById('managerCandidateModal');
  const content=document.getElementById('mcModalContent');
  const nameEl=document.getElementById('mcModalName');
  content.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-muted)">Loading...</div>';
  modal.classList.add('open');
  const {data:app}=await db.from('applications').select('*').eq('id',appId).single();
  if(!app){content.innerHTML='<p>Could not load application.</p>';return;}
  const {data:profile}=await db.from('profiles').select('*').eq('email',app.candidate_email).single();
  nameEl.textContent=app.candidate_name||'Candidate';
  const answers=safeParseJSON(app.answers,{});
  const vac=vacanciesData.find(v=>String(v.id)===String(app.vacancy_id));
  const questions=vac?.screening_questions||[];
  const answersHtml=questions.length>0
    ?questions.map((q,qi)=>{
        const chosen=answers[qi]!==undefined?q.opts?.[answers[qi]]:'—';
        const correct=answers[qi]===q.correct;
        return `<div style="padding:8px 0;border-bottom:1px solid var(--border)"><div style="font-size:12px;color:var(--text-muted);margin-bottom:3px">Q${qi+1}: ${escapeHtml(q.q)}</div><div style="font-size:13px;color:${correct?'var(--success)':'var(--danger)'};font-weight:500"><i class="ti ${correct?'ti-check':'ti-x'}"></i> ${escapeHtml(chosen||'—')}</div></div>`;
      }).join('')
    :'<p style="font-size:13px;color:var(--text-muted)">No screening questions.</p>';
  const {data:existingReview}=await db.from('manager_reviews').select('*').eq('application_id',appId).maybeSingle();
  const currentDecision=existingReview?.decision; const currentReason=existingReview?.reason||'';
  const cvUrl=profile?.cv_url||app.cv_url||'';
  const reasonId=`reason_${appId}`;
  content.innerHTML=`
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px">
      <div class="applicant-avatar" style="width:52px;height:52px;font-size:18px">${getInitials(app.candidate_name||'CA')}</div>
      <div><div style="font-size:15px;font-weight:600">${escapeHtml(app.candidate_name||'—')}</div><div style="font-size:12px;color:var(--text-muted)">${escapeHtml(app.candidate_email||'—')}</div></div>
    </div>
    <div class="card" style="margin-bottom:16px;padding:16px">
      <div class="card-title"><i class="ti ti-user"></i> Profile Details</div>
      <div class="info-row"><span class="key">Phone</span><span class="val">${escapeHtml(profile?.phone||'—')}</span></div>
      <div class="info-row"><span class="key">Location</span><span class="val">${escapeHtml(profile?.location||'—')}</span></div>
      <div style="margin-top:12px">${cvUrl?`<a href="${cvUrl}" target="_blank" class="btn btn-secondary btn-sm"><i class="ti ti-file-cv"></i> View CV</a>`:'<span style="font-size:12px;color:var(--text-muted)">No CV uploaded.</span>'}</div>
    </div>
    <div class="card" style="margin-bottom:16px;padding:16px">
      <div class="card-title"><i class="ti ti-help-circle"></i> Screening Answers</div>
      <div style="margin-bottom:8px"><span class="status-pill ${app.score>=70?'green':app.score>=40?'yellow':'brand'}">Score: ${app.score}%</span></div>
      ${answersHtml}
    </div>
    <div class="card" style="padding:16px">
      <div class="card-title"><i class="ti ti-gavel"></i> Your Decision</div>
      <div class="form-group" id="noReasonGroup_${appId}" style="${currentDecision==='no-continue'?'':'display:none'}">
        <label>Reason for not continuing</label>
        <textarea id="${reasonId}" rows="2">${escapeHtml(currentReason)}</textarea>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
        <button class="btn ${currentDecision==='continue'?'btn-success':'btn-secondary'}" onclick="setManagerDecision('${appId}','continue')"><i class="ti ti-check"></i> Continue</button>
        <button class="btn ${currentDecision==='no-continue'?'btn-danger':'btn-secondary'}" onclick="showNoContinueReason('${appId}')"><i class="ti ti-x"></i> Don't Continue</button>
      </div>
      <div id="noContinueConfirm_${appId}" style="${currentDecision==='no-continue'?'':'display:none'};margin-top:10px">
        <button class="btn btn-danger" onclick="setManagerDecision('${appId}','no-continue')"><i class="ti ti-x"></i> Confirm: Don't Continue</button>
      </div>
    </div>`;
}

function showNoContinueReason(appId) {
  const group=document.getElementById(`noReasonGroup_${appId}`); const confirm=document.getElementById(`noContinueConfirm_${appId}`);
  if(group) group.style.display='block'; if(confirm) confirm.style.display='block';
}

async function setManagerDecision(appId, decision) {
  const fullName=`${currentProfile.first_name} ${currentProfile.last_name}`.trim();
  const {data:app}=await db.from('applications').select('vacancy_id,candidate_name').eq('id',appId).single();
  const reason=decision==='no-continue'?(document.getElementById(`reason_${appId}`)?.value?.trim()||''):'';
  const {data:existing}=await db.from('manager_reviews').select('id').eq('application_id',appId).maybeSingle();
  if(existing){await db.from('manager_reviews').update({decision,reason,reviewed_at:new Date().toISOString()}).eq('id',existing.id);}
  else{await db.from('manager_reviews').insert({vacancy_id:app?.vacancy_id,application_id:appId,candidate_name:app?.candidate_name,manager_id:currentUser.id,manager_name:fullName,decision,reason,department:currentProfile.department,reviewed_at:new Date().toISOString()});}
  showToast(decision==='continue'?'Marked: Continue.':'Marked: Do not continue.');
  closeModal('managerCandidateModal');
  await renderManagerShortlists();
}

/* ══════════════════════════════════════════
   BOOKINGS — TABS
   Admin:    Availability, Interview, Onboarding
   Manager:  Only vacancies they're INVITED to (Availability) + Onboarding
   Employee: Onboarding + Team Availability (only invited vacancies)
   Candidate: Only their interview slots (no tabs, no availability)
══════════════════════════════════════════ */
function renderBookingTabs() {
  const bar = document.getElementById('bookingTabBar'); if (!bar) return;

  if (userRole === 'candidate') {
    bar.style.display = 'none';
    document.querySelectorAll('.booking-panel').forEach(p => p.style.display = 'none');
    document.getElementById('bookingPanel-interview').style.display = 'block';
    document.getElementById('candidateBookingSection').style.display = 'block';
    document.getElementById('adminBookingSection').style.display    = 'none';
    renderCandidateBookingSlots();
    return;
  }

  bar.style.display = '';
  const tabDefs = {
    admin:    [
      { id: 'availability', icon: 'ti-calendar-stats', label: 'Team Availability' },
      { id: 'interview',    icon: 'ti-video',           label: 'Interview Slots' },
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
    btn.id = 'bookingTabBtn_' + t.id;
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

/* ══════════════════════════════════════════
   BOOKINGS — CANDIDATE INTERVIEW SLOTS
   Only shown if admin has explicitly invited this candidate
══════════════════════════════════════════ */
async function renderCandidateBookingSlots() {
  const grid    = document.getElementById('slotsGrid');
  const myBookDiv = document.getElementById('myCurrentBooking');
  const availSection = document.getElementById('availableSlotsSection');

  // Check if candidate has been invited (status = interview1 on any application)
  const { data: myApps } = await db.from('applications')
    .select('*').eq('user_id', currentUser.id).eq('status', 'interview1');

  if (!myApps || myApps.length === 0) {
    if (myBookDiv) myBookDiv.classList.add('hidden');
    if (availSection) availSection.style.display = 'block';
    if (grid) grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">
        <i class="ti ti-lock" style="font-size:32px;display:block;margin-bottom:12px"></i>
        <div style="font-size:14px;font-weight:500">Interview slots are not yet available</div>
        <div style="font-size:12px;margin-top:6px">You will be able to book a slot once you have been shortlisted for an interview.</div>
      </div>`;
    return;
  }

  // Fetch all bookings and find the candidate's
  const { data: allSlots } = await db.from('bookings')
    .select('*').order('slot_date', {ascending:true}).order('slot_time', {ascending:true});
  slotsData = allSlots || [];

  const myBooking = slotsData.find(s => s.booked_by_email === currentUser?.email);

  if (myBooking) {
    if (myBookDiv) myBookDiv.classList.remove('hidden');
    if (availSection) availSection.style.display = 'none';
    const dateStr = new Date(`${myBooking.slot_date}T${myBooking.slot_time}`)
      .toLocaleDateString('en-ZA',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const timeStr = myBooking.slot_time.slice(0,5);
    myBookDiv.innerHTML = `
      <div class="my-booking-card">
        <div class="my-booking-info">
          <div class="my-booking-label"><i class="ti ti-calendar-check"></i> Your Interview Slot</div>
          <div class="my-booking-time">${timeStr}</div>
          <div class="my-booking-date">${dateStr}</div>
        </div>
        <button class="btn btn-danger" onclick="confirmCancelInterview('${myBooking.id}','${myBooking.slot_date}','${timeStr}')">
          <i class="ti ti-x"></i> Cancel Booking
        </button>
      </div>`;
  } else {
    if (myBookDiv) myBookDiv.classList.add('hidden');
    if (availSection) availSection.style.display = 'block';
    const available = slotsData.filter(s => !s.booked_by_email);
    if (!grid) return;
    if (available.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-muted)"><i class="ti ti-calendar-off" style="font-size:32px;display:block;margin-bottom:10px"></i>No interview slots available yet. Check back soon.</div>`;
      return;
    }
    grid.innerHTML = '';
    available.forEach(slot => {
      const dateStr = new Date(`${slot.slot_date}T${slot.slot_time}`)
        .toLocaleDateString('en-ZA',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
      grid.innerHTML += `
        <div class="slot-card available">
          <div class="slot-date">${dateStr}</div>
          <div class="slot-time">${slot.slot_time.slice(0,5)}</div>
          <div class="slot-duration">30 min session</div>
          <span class="slot-status available">Available</span>
          <div style="margin-top:10px">
            <button class="btn btn-primary btn-full btn-sm" onclick="bookSlot('${slot.id}','${slot.slot_date}','${slot.slot_time.slice(0,5)}')">
              <i class="ti ti-calendar-plus"></i> Book This Slot
            </button>
          </div>
        </div>`;
    });
  }
}

async function bookSlot(slotId, date, time) {
  if (!currentUser) return;
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();
  const { error } = await db.from('bookings').update({booked_by_email:currentUser.email,booked_by_name:fullName,booked_at:new Date().toISOString()}).eq('id',slotId).is('booked_by_email',null);
  if (error) { alert('Could not book slot: '+error.message); return; }
  await sendInterviewConfirmationEmail(currentUser.email, fullName, date, time);
  await renderCandidateBookingSlots();
  showToast('Interview booked successfully!');
}

function confirmCancelInterview(slotId, date, time) {
  document.getElementById('cancelInterviewText').innerHTML = `Are you sure you want to cancel your interview on <strong>${date} at ${time}</strong>?`;
  document.getElementById('cancelInterviewYes').onclick = async () => { closeModal('cancelInterviewModal'); await cancelSlot(slotId,date,time); };
  document.getElementById('cancelInterviewModal').classList.add('open');
}

async function cancelSlot(slotId, date, time) {
  const full