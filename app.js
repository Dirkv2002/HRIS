/* ═══════════════════════════════════════════
   COMMUNICARE HRIS — app.js
   Roles: admin | manager | candidate
═══════════════════════════════════════════ */

const SUPABASE_URL  = 'https://llryoespqzykaqawhwob.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxscnlvZXNwcXp5a2FxYXdod29iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODg3MTcsImV4cCI6MjA5NjA2NDcxN30.P5tL7TA-VB9EkCSThwE2jIExxya8VYvs2SjU9pCrmQY';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ═══════════════════════════════════════════
   GLOBAL STATE
═══════════════════════════════════════════ */
let currentUser       = null;
let currentProfile    = null;
let userRole          = 'candidate';
let slotsData         = [];
let vacanciesData     = [];
let applicationsData  = [];
let uploadedAssessments = [];
let competencyFiles   = {};
let currentVacancyId  = null;
let currentCompJob    = null;
let pendingOnboardingSlotId = null;
let userAnswers       = {};
let applyAnswers      = {};
let applyCVFile       = null;
let allAvailability   = [];
let myAvailability    = new Set();
let teamColours       = [
  '#00aeef','#9a258f','#b2d33e','#faa61a',
  '#ef4444','#8b5cf6','#06b6d4','#f97316'
];

const departmentsData = {
  'Human Capital':                        ['HR Business Partner','Talent Acquisition Specialist','Learning & Development Manager','Compensation & Benefits Analyst','Employee Relations Officer'],
  'Marketing and Communications':         ['Brand Manager','Digital Marketing Specialist','Content Strategist','PR Coordinator','Social Media Manager'],
  'Information Technology':               ['Software Engineer','Systems Administrator','Data Analyst','Cybersecurity Specialist','IT Project Manager','DevOps Engineer'],
  'Asset Management':                     ['Portfolio Manager','Asset Analyst','Risk Officer','Investment Associate','Fund Accountant'],
  'Finance':                              ['Financial Accountant','Management Accountant','Treasury Analyst','Accounts Payable Clerk','Finance Manager'],
  'Property Development and Investments': ['Property Development Manager','Leasing Consultant','Valuations Analyst','Project Manager','Property Administrator'],
  'Facilities Management':                ['Facilities Manager','Maintenance Coordinator','Health & Safety Officer','Cleaning Supervisor','Security Manager']
};

/* ═══════════════════════════════════════════
   BOOT
═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const roleSelect = document.getElementById('signupRole');
  if (roleSelect) {
    roleSelect.addEventListener('change', () => {
      const deptGroup = document.getElementById('signupDeptGroup');
      if (deptGroup) {
        deptGroup.style.display = roleSelect.value === 'manager' ? 'block' : 'none';
      }
    });
  }

  db.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
      currentUser = session.user;
      await loadProfile(currentUser.id);
      showApp();
    } else {
      currentUser    = null;
      currentProfile = null;
      showAuth();
    }
  });
});

/* ═══════════════════════════════════════════
   AUTH SCREENS
═══════════════════════════════════════════ */
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
  renderAssessment();
  renderVacancies();
  renderScreeningDepts();
  showDefaultTab();
}

function switchAuthTab(tab) {
  document.getElementById('loginForm').classList.toggle('hidden',  tab !== 'login');
  document.getElementById('signupForm').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('tabLogin').classList.toggle('active',   tab === 'login');
  document.getElementById('tabSignup').classList.toggle('active',  tab === 'signup');
  clearAuthMessage();
}

/* ═══════════════════════════════════════════
   LOGIN
═══════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════
   SIGN UP
═══════════════════════════════════════════ */
async function handleSignup(e) {
  e.preventDefault();
  const firstName = document.getElementById('signupFirst').value.trim();
  const lastName  = document.getElementById('signupLast').value.trim();
  const email     = document.getElementById('signupEmail').value.trim();
  const password  = document.getElementById('signupPassword').value;
  const role      = document.getElementById('signupRole').value;
  const dept      = document.getElementById('signupDept')?.value || '';
  const btn       = document.getElementById('signupBtn');

  if (password.length < 6) {
    showAuthMessage('Password must be at least 6 characters.', 'error');
    return;
  }
  if (role === 'manager' && !dept) {
    showAuthMessage('Please select your department.', 'error');
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
      id: data.user.id, email,
      first_name: firstName, last_name: lastName,
      role, department: dept,
      status: 'reviewing',
      created_at: new Date().toISOString()
    });
  }

  setButtonLoading(btn, false, '<i class="ti ti-user-plus"></i> Create Account');
  showAuthMessage('Account created! You can now sign in.', 'success');
}

/* ═══════════════════════════════════════════
   LOGOUT / FORGOT PASSWORD
═══════════════════════════════════════════ */
async function handleLogout() {
  await db.auth.signOut();
}

async function showForgotPassword() {
  const email = prompt('Enter your email address:');
  if (!email) return;
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://dirkv2002.github.io/HRIS/'
  });
  alert(error ? 'Error: ' + error.message : 'Reset email sent! Check your inbox.');
}

/* ═══════════════════════════════════════════
   LOAD PROFILE
═══════════════════════════════════════════ */
async function loadProfile(userId) {
  const { data, error } = await db
    .from('profiles').select('*').eq('id', userId).single();

  if (error || !data) {
    const meta = currentUser.user_metadata || {};
    currentProfile = {
      id: userId, email: currentUser.email,
      first_name: meta.first_name || '',
      last_name:  meta.last_name  || '',
      role:       meta.role       || 'candidate',
      department: meta.department || '',
      status:     'reviewing'
    };
    await db.from('profiles').upsert({
      ...currentProfile,
      created_at: new Date().toISOString()
    });
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

/* ═══════════════════════════════════════════
   SIDEBAR — BUILD PER ROLE
═══════════════════════════════════════════ */
const navConfig = {
  admin: [
    { section: 'Main' },
    { id: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
    { section: 'Recruitment' },
    { id: 'manage',    icon: 'ti-settings',          label: 'Manage Vacancies' },
    { id: 'screening', icon: 'ti-clipboard-list',    label: 'Screening' },
    { id: 'competency',icon: 'ti-folder-open',       label: 'Competency' },
    { id: 'progress',  icon: 'ti-timeline',          label: 'Progress' },
    { id: 'bookings',  icon: 'ti-calendar-event',    label: 'Bookings' },
    { section: 'Insights' },
    { id: 'stats',     icon: 'ti-chart-bar',         label: 'Stats' }
  ],
  manager: [
    { section: 'Main' },
    { id: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard' },
    { section: 'HR Tools' },
    { id: 'screening', icon: 'ti-clipboard-list',   label: 'Screening' },
    { id: 'competency',icon: 'ti-folder-open',      label: 'Competency' },
    { section: 'Bookings' },
    { id: 'bookings',  icon: 'ti-calendar-event',   label: 'Bookings' }
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
      sec.className   = 'nav-section';
      sec.textContent = item.section;
      nav.appendChild(sec);
    } else {
      const el = document.createElement('div');
      el.className = 'nav-item';
      el.id        = 'nav-' + item.id;
      el.innerHTML = `<i class="ti ${item.icon}"></i> ${item.label}`;
      el.addEventListener('click', function () {
        showTab(item.id, el);
      });
      nav.appendChild(el);
    }
  });
}

function showDefaultTab() {
  const first = (navConfig[userRole] || navConfig.candidate).find(i => i.id);
  if (first) {
    const el = document.getElementById('nav-' + first.id);
    if (el) showTab(first.id, el);
  }
}

/* ═══════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════ */
function showTab(id, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const tab = document.getElementById('tab-' + id);
  if (tab) tab.classList.add('active');
  if (el)  el.classList.add('active');

  if (id === 'bookings')   renderBookingTabs();
  if (id === 'competency') renderDepts();
  if (id === 'apply')      renderVacancies();
  if (id === 'stats')      renderStats();
  if (id === 'progress')   renderProgress();
  if (id === 'manage')     renderAdminVacancies();
  if (id === 'screening')  renderScreeningDepts();
}

/* ═══════════════════════════════════════════
   ROLE BADGE
═══════════════════════════════════════════ */
function updateRoleBadge() {
  const badge  = document.getElementById('roleBadge');
  const labels = { admin: 'ADMIN', manager: 'MANAGER', candidate: 'CANDIDATE' };
  badge.textContent = labels[userRole] || 'CANDIDATE';
  badge.className   = 'role-badge ' + userRole;
}

/* ═══════════════════════════════════════════
   DASHBOARD — POPULATE
═══════════════════════════════════════════ */
function populateDashboard() {
  if (!currentProfile) return;

  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim() || currentProfile.email;
  const initials = getInitials(fullName);
  const status   = currentProfile.status || 'reviewing';

  document.getElementById('sidebarName').textContent       = fullName;
  document.getElementById('sidebarEmail').textContent      = currentProfile.email || '';
  document.getElementById('sidebarAvatarText').textContent = initials;
  document.getElementById('profileName').textContent       = fullName;
  document.getElementById('avatarCircle').textContent      = initials;
  document.getElementById('profileSub').textContent        =
    `${userRole === 'admin' ? 'HR Administrator' : userRole === 'manager' ? 'Manager' : 'Candidate'} · ${currentProfile.email}`;

  document.getElementById('infoName').textContent        = fullName;
  document.getElementById('infoEmail').textContent       = currentProfile.email       || '—';
  document.getElementById('infoPhone').textContent       = currentProfile.phone       || '—';
  document.getElementById('infoId').textContent          = currentProfile.id_number   || '—';
  document.getElementById('infoLocation').textContent    = currentProfile.location    || '—';
  document.getElementById('infoNationality').textContent = currentProfile.nationality || '—';
  document.getElementById('infoJobTitle').textContent    = currentProfile.job_title        || '—';
  document.getElementById('infoJobDept').textContent     = currentProfile.department       || '—';
  document.getElementById('infoJobRef').textContent      = currentProfile.job_ref          || '—';
  document.getElementById('infoJobDesc').textContent     = currentProfile.job_description  || '—';
  document.getElementById('infoJobDate').textContent     = currentProfile.created_at
    ? new Date(currentProfile.created_at).toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric' })
    : '—';

  const jobEditSection = document.getElementById('jobEditSection');
  const cvSection      = document.getElementById('cvUploadSection');
  if (jobEditSection) jobEditSection.style.display = userRole === 'admin' ? 'block' : 'none';
  if (cvSection)      cvSection.style.display      = userRole === 'candidate' ? 'block' : 'none';

  const statusBadgeWrap = document.getElementById('dashStatusBadge');
  if (statusBadgeWrap) {
    if (userRole === 'candidate') {
      statusBadgeWrap.style.display = '';
      applyStatus(status);
    } else {
      statusBadgeWrap.style.display = 'none';
    }
  }

  if (currentProfile.avatar_url) setAvatarImage(currentProfile.avatar_url);

  const stepDate0 = document.getElementById('stepDate0');
  if (stepDate0 && currentProfile.created_at) {
    stepDate0.textContent = new Date(currentProfile.created_at)
      .toLocaleDateString('en-ZA', { day:'numeric', month:'short' });
  }
}

/* ═══════════════════════════════════════════
   PERSONAL INFO — EDIT & SAVE
═══════════════════════════════════════════ */
function toggleEditPersonal() {
  const form   = document.getElementById('editPersonalForm');
  const hidden = form.classList.contains('hidden');
  form.classList.toggle('hidden');
  if (hidden) {
    document.getElementById('editPhone').value       = currentProfile.phone        || '';
    document.getElementById('editIdNum').value       = currentProfile.id_number    || '';
    document.getElementById('editLocation').value    = currentProfile.location     || '';
    document.getElementById('editNationality').value = currentProfile.nationality  || '';
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
  await reloadProfile();
  populateDashboard();
  document.getElementById('editPersonalForm').classList.add('hidden');
  showToast('Personal information updated.');
}

/* ═══════════════════════════════════════════
   JOB INFO — EDIT & SAVE (Admin)
═══════════════════════════════════════════ */
function toggleEditJob() {
  const form = document.getElementById('editJobForm');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) {
    document.getElementById('editJobTitle').value = currentProfile.job_title       || '';
    document.getElementById('editJobRef').value   = currentProfile.job_ref         || '';
    document.getElementById('editJobDesc').value  = currentProfile.job_description || '';
  }
}

async function saveJobInfo() {
  const updates = {
    job_title:       document.getElementById('editJobTitle').value.trim(),
    department:      document.getElementById('editJobDept').value,
    job_ref:         document.getElementById('editJobRef').value.trim(),
    job_description: document.getElementById('editJobDesc').value.trim()
  };
  const { error } = await db.from('profiles').update(updates).eq('id', currentUser.id);
  if (error) { alert('Could not save: ' + error.message); return; }
  await reloadProfile();
  populateDashboard();
  document.getElementById('editJobForm').classList.add('hidden');
  showToast('Job information updated.');
}

/* ═══════════════════════════════════════════
   AVATAR & CV UPLOAD
═══════════════════════════════════════════ */
async function uploadAvatar(e) {
  const file = e.target.files[0];
  if (!file) return;
  const ext  = file.name.split('.').pop();
  const path = `avatars/${currentUser.id}.${ext}`;
  const { error } = await db.storage.from('avatars').upload(path, file, { upsert: true });
  if (error) {
    const reader = new FileReader();
    reader.onload = ev => setAvatarImage(ev.target.result);
    reader.readAsDataURL(file);
    return;
  }
  const { data } = db.storage.from('avatars').getPublicUrl(path);
  if (data?.publicUrl) {
    setAvatarImage(data.publicUrl);
    await db.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', currentUser.id);
    showToast('Profile photo updated.');
  }
}

function setAvatarImage(src) {
  const c = document.getElementById('avatarCircle');
  if (c) c.innerHTML = `<img src="${src}" alt="Profile"/>`;
}

async function uploadCV(e) {
  const file = e.target.files[0];
  if (!file) return;
  const ext  = file.name.split('.').pop();
  const path = `cvs/${currentUser.id}.${ext}`;
  const { error } = await db.storage.from('cvs').upload(path, file, { upsert: true });
  if (!error) {
    const { data } = db.storage.from('cvs').getPublicUrl(path);
    if (data?.publicUrl) {
      await db.from('profiles').update({ cv_url: data.publicUrl }).eq('id', currentUser.id);
    }
  }
  document.getElementById('cvLabel').textContent = `✓ ${file.name} uploaded`;
  showToast('CV uploaded.');
}

function handleApplyCVUpload(e) {
  applyCVFile = e.target.files[0];
  if (applyCVFile) {
    document.getElementById('applyCVLabel').textContent = `✓ ${applyCVFile.name}`;
  }
}

/* ═══════════════════════════════════════════
   STATUS CONFIG (7 stages)
═══════════════════════════════════════════ */
const statusConfig = {
  received:   { label:'Application Received', cls:'received',   fill:'0%',   stage:0 },
  reviewing:  { label:'Reviewing',            cls:'reviewing',  fill:'16%',  stage:1 },
  interview1: { label:'1st Interview',        cls:'interview1', fill:'33%',  stage:2 },
  assessment: { label:'Assessment',           cls:'assessment', fill:'50%',  stage:3 },
  interview2: { label:'2nd Interview',        cls:'interview2', fill:'66%',  stage:4 },
  final:      { label:'Final Assessment',     cls:'final',      fill:'82%',  stage:5 },
  offered:    { label:'Offer Made',           cls:'offered',    fill:'100%', stage:6 },
  rejected:   { label:'Rejected',             cls:'rejected',   fill:'82%',  stage:5 },
  applied:    { label:'Applied',              cls:'applied',    fill:'5%',   stage:0 }
};

const stepIcons = [
  'ti-inbox','ti-eye','ti-video',
  'ti-brain','ti-video','ti-writing','ti-file-check'
];

function applyStatus(s) {
  const cfg = statusConfig[s] || statusConfig.reviewing;

  const badge = document.getElementById('dashStatusBadge');
  if (badge) {
    badge.style.display = '';
    badge.className     = 'status-badge ' + cfg.cls;
    badge.innerHTML     = `<i class="ti ti-circle-dot"></i>&nbsp;${cfg.label}`;
  }

  const txt = document.getElementById('dashStatusText');
  if (txt) txt.textContent = cfg.label;

  const stageLabel = document.getElementById('currentStageLabel');
  if (stageLabel) stageLabel.textContent = cfg.label;

  const fill = document.getElementById('progressFill');
  if (fill) fill.style.width = cfg.fill;

  document.querySelectorAll('#progressCandidateView .step-node').forEach((node, i) => {
    const circle = node.querySelector('.step-circle');
    const label  = node.querySelector('.step-label');
    if (!circle || !label) return;
    circle.className = 'step-circle';
    label.className  = 'step-label';
    if (i < cfg.stage) {
      circle.classList.add('done');
      label.classList.add('done');
      circle.innerHTML = '<i class="ti ti-check"></i>';
    } else if (i === cfg.stage) {
      circle.classList.add('current');
      label.classList.add('current');
      circle.innerHTML = `<i class="ti ${stepIcons[i] || 'ti-circle'}"></i>`;
    } else {
      circle.classList.add('pending');
      circle.innerHTML = `<i class="ti ${stepIcons[i] || 'ti-circle'}"></i>`;
    }
  });
}

/* ═══════════════════════════════════════════
   PROGRESS TAB
═══════════════════════════════════════════ */
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
  const el = document.getElementById('progressVacancyList');
  if (!el) return;

  const { data: vacs } = await db.from('vacancies').select('*').order('created_at', { ascending: false });
  const vacList = (vacs && vacs.length > 0) ? vacs : getDemoVacancies();

  const { data: apps } = await db.from('applications').select('*').order('submitted_at', { ascending: false });
  const appList = apps || [];

  el.innerHTML = '';

  for (const vac of vacList) {
    const vacApps = appList.filter(a => a.vacancy_id === String(vac.id));
    const block   = document.createElement('div');
    block.className = 'progress-vacancy-block';

    const appRows = vacApps.length === 0
      ? '<div style="padding:16px 0;font-size:13px;color:var(--text-muted)">No applicants yet.</div>'
      : vacApps.map(app => {
          const initials = getInitials(app.candidate_name || 'CA');
          const cfg      = statusConfig[app.status] || statusConfig.reviewing;
          return `
            <div class="applicant-row">
              <div class="applicant-row-check">
                <input type="checkbox" data-appid="${app.id}" class="bulk-check"/>
              </div>
              <div class="applicant-row-info" style="cursor:pointer"
                onclick="openCandidateProfile('${app.id}')">
                <div class="applicant-avatar">${initials}</div>
                <div>
                  <div class="applicant-row-name">${app.candidate_name || 'Candidate'}</div>
                  <div class="applicant-row-email">${app.candidate_email || ''}</div>
                </div>
              </div>
              <div class="applicant-row-actions">
                <span class="status-badge ${cfg.cls}" style="margin:0;font-size:10px">${cfg.label}</span>
                <button class="btn btn-secondary" style="font-size:11px;padding:4px 10px"
                  onclick="openCandidateProfile('${app.id}')">
                  <i class="ti ti-eye"></i> View
                </button>
                <button class="btn btn-primary" style="font-size:11px;padding:4px 10px"
                  onclick="promptStatusChange('${app.id}','${escapeHtml(app.candidate_name || '')}','${app.status}')">
                  <i class="ti ti-arrow-right"></i> Update
                </button>
              </div>
            </div>`;
        }).join('');

    block.innerHTML = `
      <div class="progress-vacancy-header" onclick="toggleProgressVacancy(this)">
        <div>
          <div class="progress-vacancy-title">${vac.title}</div>
          <div class="progress-vacancy-meta">
            ${vac.department || ''} · ${vacApps.length} applicant${vacApps.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-danger" style="font-size:11px;padding:5px 10px"
            onclick="event.stopPropagation();bulkRejectVacancy('${vac.id}')">
            <i class="ti ti-x"></i> Reject Unselected
          </button>
          <button class="btn btn-primary" style="font-size:11px;padding:5px 10px"
            onclick="event.stopPropagation();bulkAdvanceVacancy('${vac.id}')">
            <i class="ti ti-arrow-right"></i> Advance Selected
          </button>
          <i class="ti ti-chevron-down chevron"></i>
        </div>
      </div>
      <div class="progress-applicant-list">${appRows}</div>`;

    el.appendChild(block);
  }
}

function toggleProgressVacancy(header) {
  const list = header.nextElementSibling;
  const icon = header.querySelector('.chevron');
  list.classList.toggle('open');
  if (icon) icon.classList.toggle('open');
}

/* ── CANDIDATE PROFILE MODAL ── */
async function openCandidateProfile(appId) {
  const modal   = document.getElementById('candidateProfileModal');
  const content = document.getElementById('cpModalContent');
  const nameEl  = document.getElementById('cpModalName');

  content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Loading...</div>';
  modal.classList.add('open');

  const { data: app } = await db.from('applications').select('*').eq('id', appId).single();
  if (!app) { content.innerHTML = '<p>Could not load application.</p>'; return; }

  const { data: profile } = await db.from('profiles').select('*').eq('email', app.candidate_email).single();
  nameEl.textContent = app.candidate_name || 'Candidate';

  const answers   = safeParseJSON(app.answers, {});
  const vac       = vacanciesData.find(v => String(v.id) === String(app.vacancy_id));
  const questions = vac?.screening_questions || [];

  const answersHtml = questions.length > 0
    ? questions.map((q, qi) => {
        const chosen  = answers[qi] !== undefined ? q.opts?.[answers[qi]] : '—';
        const correct = answers[qi] === q.correct;
        return `
          <div style="padding:8px 0;border-bottom:1px solid var(--border)">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:3px">
              Q${qi+1}: ${escapeHtml(q.q)}
            </div>
            <div style="font-size:13px;color:${correct ? 'var(--success)' : 'var(--danger)'};font-weight:500">
              <i class="ti ${correct ? 'ti-check' : 'ti-x'}"></i> ${escapeHtml(chosen || '—')}
            </div>
          </div>`;
      }).join('')
    : '<p style="font-size:13px;color:var(--text-muted)">No screening questions for this vacancy.</p>';

  const cfg = statusConfig[app.status] || statusConfig.reviewing;

  content.innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:20px">
      <div class="applicant-avatar" style="width:52px;height:52px;font-size:18px">
        ${getInitials(app.candidate_name || 'CA')}
      </div>
      <div>
        <div style="font-size:15px;font-weight:600">${app.candidate_name || '—'}</div>
        <div style="font-size:12px;color:var(--text-muted)">${app.candidate_email || '—'}</div>
        <span class="status-badge ${cfg.cls}" style="margin-top:6px">${cfg.label}</span>
      </div>
    </div>

    ${profile ? `
    <div class="card" style="margin-bottom:16px;padding:16px">
      <div class="card-title"><i class="ti ti-user"></i> Profile Details</div>
      <div class="info-row"><span class="key">Phone</span><span class="val">${profile.phone || '—'}</span></div>
      <div class="info-row"><span class="key">ID Number</span><span class="val">${profile.id_number || '—'}</span></div>
      <div class="info-row"><span class="key">Location</span><span class="val">${profile.location || '—'}</span></div>
      <div class="info-row"><span class="key">Nationality</span><span class="val">${profile.nationality || '—'}</span></div>
      ${profile.cv_url || app.cv_url ? `
        <div style="margin-top:12px">
          <a href="${profile.cv_url || app.cv_url}" target="_blank" class="btn btn-secondary" style="font-size:12px">
            <i class="ti ti-file-cv"></i> View CV
          </a>
        </div>` : ''}
    </div>` : ''}

    <div class="card" style="margin-bottom:16px;padding:16px">
      <div class="card-title"><i class="ti ti-help-circle"></i> Screening Answers</div>
      <div style="margin-bottom:8px">
        <span class="status-pill ${app.score >= 70 ? 'green' : app.score >= 40 ? 'yellow' : 'brand'}">
          Score: ${app.score}%
        </span>
      </div>
      ${answersHtml}
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-primary"
        onclick="closeModal('candidateProfileModal');
                 promptStatusChange('${app.id}','${escapeHtml(app.candidate_name || '')}','${app.status}')">
        <i class="ti ti-arrow-right"></i> Update Status
      </button>
    </div>`;
}

/* ── STATUS CHANGE WITH CONFIRM ── */
const nextStatusMap = {
  applied:    'reviewing',
  reviewing:  'interview1',
  interview1: 'assessment',
  assessment: 'interview2',
  interview2: 'final',
  final:      'offered',
  offered:    'offered'
};

function promptStatusChange(appId, candidateName, currentStatus) {
  const next = nextStatusMap[currentStatus] || 'reviewing';
  const cfg  = statusConfig[next] || statusConfig.reviewing;

  document.getElementById('confirmStatusText').innerHTML =
    `Are you sure you want to change <strong>${escapeHtml(candidateName)}'s</strong>
     application status to <strong>${cfg.label}</strong>?`;

  const yesBtn = document.getElementById('confirmStatusYes');
  yesBtn.onclick = async () => {
    closeModal('confirmStatusModal');
    await updateApplicationStatus(appId, next, candidateName);
  };

  document.getElementById('confirmStatusModal').classList.add('open');
}

async function updateApplicationStatus(appId, newStatus, candidateName) {
  const { error } = await db.from('applications').update({ status: newStatus }).eq('id', appId);
  if (error) { alert('Could not update status: ' + error.message); return; }

  const { data: app } = await db.from('applications').select('*').eq('id', appId).single();
  if (app) {
    await db.from('profiles').update({ status: newStatus }).eq('email', app.candidate_email);
    if (newStatus === 'rejected') {
      await sendRejectionEmail(app.candidate_email, app.candidate_name, app.vacancy_title);
    } else {
      const cfg = statusConfig[newStatus] || statusConfig.reviewing;
      await sendStatusUpdateEmail(app.candidate_email, app.candidate_name, app.vacancy_title, cfg.label);
    }
  }

  showToast(`${candidateName}'s status updated.`);
  await renderProgressAdmin();
}

/* ── BULK ACTIONS ── */
async function bulkAdvanceVacancy(vacId) {
  const checked = document.querySelectorAll('.bulk-check:checked');
  if (checked.length === 0) { alert('Please select at least one candidate to advance.'); return; }
  if (!confirm(`Advance ${checked.length} selected candidate(s) to the next stage?`)) return;
  for (const cb of checked) {
    const appId = cb.dataset.appid;
    const { data: app } = await db.from('applications').select('*').eq('id', appId).single();
    if (app) {
      const next = nextStatusMap[app.status] || 'reviewing';
      await updateApplicationStatus(appId, next, app.candidate_name);
    }
  }
  showToast('Selected candidates advanced.');
}

async function bulkRejectVacancy(vacId) {
  const allChecks  = document.querySelectorAll('.bulk-check');
  const checked    = document.querySelectorAll('.bulk-check:checked');
  const checkedIds = new Set([...checked].map(c => c.dataset.appid));
  const toReject   = [...allChecks].filter(c => !checkedIds.has(c.dataset.appid));
  if (toReject.length === 0) { alert('No candidates to reject.'); return; }
  if (!confirm(`Reject ${toReject.length} unselected candidate(s)? They will receive a rejection email.`)) return;
  for (const cb of toReject) {
    const appId = cb.dataset.appid;
    const { data: app } = await db.from('applications').select('*').eq('id', appId).single();
    if (app) await updateApplicationStatus(appId, 'rejected', app.candidate_name);
  }
  showToast('Unselected candidates rejected and notified.');
}

/* ═══════════════════════════════════════════
   EMAIL NOTIFICATIONS
═══════════════════════════════════════════ */
async function sendStatusUpdateEmail(toEmail, candidateName, vacancyTitle, newStatus) {
  const subject = `Your application status has been updated — ${vacancyTitle}`;
  const body    = `Dear ${candidateName},\n\nYour application for ${vacancyTitle} at Communicare has been updated to: ${newStatus}.\n\nWe will be in touch with further details soon.\n\nKind regards,\nCommunicare Human Capital Team`;
  await db.from('email_notifications').insert({ to_email: toEmail, subject, body }).catch(() => {});
}

async function sendRejectionEmail(toEmail, candidateName, vacancyTitle) {
  const subject = `Your application for ${vacancyTitle} — Communicare`;
  const body    = `Dear ${candidateName},\n\nThank you for applying for ${vacancyTitle} at Communicare. After careful consideration, we will not be moving forward with your application at this time.\n\nWe appreciate the time and effort you invested and wish you every success in your career journey.\n\nWith warm regards,\nCommunicare Human Capital Team`;
  await db.from('email_notifications').insert({ to_email: toEmail, subject, body }).catch(() => {});
}

async function sendInterviewConfirmationEmail(toEmail, candidateName, date, time) {
  const subject = `Interview Booking Confirmation — Communicare`;
  const body    = `Dear ${candidateName},\n\nYour interview has been booked for ${date} at ${time} (30 minutes).\n\nPlease ensure you are available and prepared at the scheduled time.\n\nKind regards,\nCommunicare Human Capital Team`;
  await db.from('email_notifications').insert({ to_email: toEmail, subject, body }).catch(() => {});
}

async function sendInterviewCancellationEmail(toEmail, candidateName, date, time) {
  const subject = `Interview Cancellation — Communicare`;
  const body    = `Dear ${candidateName},\n\nYour interview booking for ${date} at ${time} has been cancelled.\n\nPlease visit the portal to rebook.\n\nKind regards,\nCommunicare Human Capital Team`;
  await db.from('email_notifications').insert({ to_email: toEmail, subject, body }).catch(() => {});
}

/* ═══════════════════════════════════════════
   SCREENING — SAVE & RENDER
═══════════════════════════════════════════ */
async function saveScreening() {
  const payload = {
    job_title:       document.getElementById('sc_title').value.trim(),
    department:      document.getElementById('sc_dept').value,
    qualifications:  document.getElementById('sc_qual').value.trim(),
    experience:      document.getElementById('sc_exp').value.trim(),
    budget:          document.getElementById('sc_budget').value.trim(),
    job_description: document.getElementById('sc_jd').value.trim(),
    green_flags:     document.getElementById('sc_green').value.trim(),
    red_flags:       document.getElementById('sc_red').value.trim(),
    created_by:      currentUser.id,
    creator_name:    `${currentProfile.first_name} ${currentProfile.last_name}`.trim(),
    created_at:      new Date().toISOString(),
    updated_at:      new Date().toISOString()
  };

  if (!payload.job_title) { alert('Please enter a job title.'); return; }

  const { error } = await db.from('screening_strategies').insert(payload);
  if (error) { alert('Could not save: ' + error.message); return; }

  ['sc_title','sc_qual','sc_exp','sc_budget','sc_jd','sc_green','sc_red'].forEach(id => {
    document.getElementById(id).value = '';
  });

  showToast('Screening strategy saved.');
  await renderScreeningDepts();
}

async function renderScreeningDepts() {
  const el = document.getElementById('screeningDeptList');
  if (!el) return;

  let query = db.from('screening_strategies').select('*').order('created_at', { ascending: false });
  if (userRole === 'manager' && currentProfile.department) {
    query = query.eq('department', currentProfile.department);
  }

  const { data, error } = await query;
  const strategies = data || [];

  if (strategies.length === 0) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No strategies saved yet.</p>';
    return;
  }

  const byDept = {};
  strategies.forEach(s => {
    if (!byDept[s.department]) byDept[s.department] = [];
    byDept[s.department].push(s);
  });

  el.innerHTML = Object.entries(byDept).map(([dept, items]) => `
    <div class="screening-dept-block">
      <div class="screening-dept-header" onclick="toggleScreeningDept(this)">
        <h4>
          <i class="ti ti-building" style="color:var(--accent-green)"></i>
          ${dept}
          <span class="dept-count">${items.length} strateg${items.length !== 1 ? 'ies' : 'y'}</span>
        </h4>
        <i class="ti ti-chevron-down chevron"></i>
      </div>
      <div class="screening-dept-body">
        ${items.map(s => `
          <div class="strategy-item">
            <div class="strategy-item-header">
              <div>
                <div class="strategy-item-title">${escapeHtml(s.job_title)}</div>
                <div class="strategy-item-meta">
                  Created by ${escapeHtml(s.creator_name || 'HR')} ·
                  ${new Date(s.created_at).toLocaleDateString('en-ZA', { day:'numeric', month:'short', year:'numeric' })}
                </div>
              </div>
              ${(userRole === 'admin' || s.created_by === currentUser.id)
                ? `<button class="btn btn-danger" style="font-size:11px;padding:4px 10px"
                    onclick="deleteStrategy('${s.id}')">
                    <i class="ti ti-trash"></i>
                  </button>` : ''}
            </div>
            <div class="grid-2" style="margin-bottom:12px">
              <div>
                <div class="report-label">Qualifications</div>
                <div style="font-size:13px">${escapeHtml(s.qualifications || '—')}</div>
              </div>
              <div>
                <div class="report-label">Experience</div>
                <div style="font-size:13px">${escapeHtml(s.experience || '—')}</div>
              </div>
              <div>
                <div class="report-label">Budget</div>
                <div style="font-size:13px;color:var(--success);font-weight:600">${escapeHtml(s.budget || '—')}</div>
              </div>
            </div>
            <div style="margin-bottom:10px">
              <div class="report-label" style="margin-bottom:4px">Job Description</div>
              <div style="font-size:13px;color:var(--text-secondary);line-height:1.6">
                ${escapeHtml(s.job_description || '—')}
              </div>
            </div>
            <div class="grid-2">
              <div>
                <div class="report-label" style="margin-bottom:6px">Green Flags</div>
                ${(s.green_flags || '').split('\n').filter(Boolean)
                  .map(g => `<span class="tag green">✓ ${escapeHtml(g.trim())}</span>`).join('')}
              </div>
              <div>
                <div class="report-label" style="margin-bottom:6px">Red Flags</div>
                ${(s.red_flags || '').split('\n').filter(Boolean)
                  .map(r => `<span class="tag red">✕ ${escapeHtml(r.trim())}</span>`).join('')}
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function toggleScreeningDept(header) {
  const body = header.nextElementSibling;
  const icon = header.querySelector('.chevron');
  body.classList.toggle('open');
  if (icon) icon.classList.toggle('open');
}

async function deleteStrategy(id) {
  if (!confirm('Delete this screening strategy?')) return;
  await db.from('screening_strategies').delete().eq('id', id);
  await renderScreeningDepts();
  showToast('Strategy deleted.');
}

/* ═══════════════════════════════════════════
   COMPETENCY — RENDER
═══════════════════════════════════════════ */
function renderDepts() {
  const el = document.getElementById('deptList');
  if (!el) return;
  el.innerHTML = '';

  const addBtn = document.getElementById('addJobBtn');
  if (addBtn) addBtn.style.display = userRole === 'admin' ? 'flex' : 'none';

  const depts = userRole === 'manager' && currentProfile.department
    ? { [currentProfile.department]: departmentsData[currentProfile.department] || [] }
    : departmentsData;

  for (const [dept, jobs] of Object.entries(depts)) {
    const block = document.createElement('div');
    block.className = 'dept-block';

    const jobRows = (jobs || []).map(j => {
      const key   = `${dept}|${j}`;
      const files = competencyFiles[key] || {};
      const safeD = dept.replace(/'/g, "\\'");
      const safeJ = j.replace(/'/g, "\\'");

      const pdfBadges = [
        files.framework ? `<a class="pdf-badge" href="${files.framework}" target="_blank"><i class="ti ti-file-text"></i> Framework</a>` : '',
        files.jd        ? `<a class="pdf-badge" href="${files.jd}"        target="_blank"><i class="ti ti-file-description"></i> JD</a>`  : ''
      ].join('');

      const adminBtns = userRole === 'admin' ? `
        <div class="job-actions">
          <button class="job-btn pdf" onclick="openCompPdfModal('${safeD}','${safeJ}')">
            <i class="ti ti-upload"></i> Docs
          </button>
          <button class="job-btn" onclick="editJob('${safeD}','${safeJ}')">
            <i class="ti ti-edit"></i> Edit
          </button>
          <button class="job-btn del" onclick="deleteJob('${safeD}','${safeJ}')">
            <i class="ti ti-trash"></i>
          </button>
        </div>` : '';

      return `
        <div class="job-item">
          <span class="job-name">
            <i class="ti ti-point-filled"></i>${j} ${pdfBadges}
          </span>
          ${adminBtns}
        </div>`;
    }).join('');

    block.innerHTML = `
      <div class="dept-header" onclick="toggleDept(this)">
        <h4>
          <i class="ti ti-building"></i>${dept}
          <span class="dept-count">${(jobs||[]).length} roles</span>
        </h4>
        <i class="ti ti-chevron-down chevron"></i>
      </div>
      <div class="job-list">${jobRows}</div>`;

    el.appendChild(block);
  }
}

function toggleDept(header) {
  const list = header.nextElementSibling;
  const icon = header.querySelector('.chevron');
  list.classList.toggle('open');
  if (icon) icon.classList.toggle('open');
}

function openAddJobModal() {
  document.getElementById('newJobTitle').value = '';
  document.getElementById('addJobModal').classList.add('open');
}

function addJob() {
  const dept  = document.getElementById('newJobDept').value;
  const title = document.getElementById('newJobTitle').value.trim();
  if (!title) { alert('Please enter a job title.'); return; }
  if (!departmentsData[dept]) departmentsData[dept] = [];
  departmentsData[dept].push(title);
  renderDepts();
  closeModal('addJobModal');
  showToast('Job added.');
}

function deleteJob(dept, job) {
  if (!confirm(`Remove "${job}" from ${dept}?`)) return;
  departmentsData[dept] = departmentsData[dept].filter(j => j !== job);
  renderDepts();
}

function editJob(dept, job) {
  const n = prompt('Edit job title:', job);
  if (n && n.trim()) {
    const idx = departmentsData[dept].indexOf(job);
    if (idx !== -1) { departmentsData[dept][idx] = n.trim(); renderDepts(); }
  }
}

function openCompPdfModal(dept, job) {
  currentCompJob = { dept, job };
  document.getElementById('compPdfJobTitle').textContent    = job;
  document.getElementById('compFrameworkLabel').textContent = 'Click to upload competency framework';
  document.getElementById('compJdLabel').textContent        = 'Click to upload job description';
  const key   = `${dept}|${job}`;
  const files = competencyFiles[key] || {};
  const wrap  = document.getElementById('compUploadedFiles');
  wrap.innerHTML = '';
  if (files.framework) wrap.innerHTML += `<a class="pdf-badge" href="${files.framework}" target="_blank"><i class="ti ti-file-text"></i> Framework</a>`;
  if (files.jd)        wrap.innerHTML += `<a class="pdf-badge" href="${files.jd}"        target="_blank"><i class="ti ti-file-description"></i> JD</a>`;
  document.getElementById('compPdfModal').classList.add('open');
}

async function handleCompPdfUpload(e, type) {
  const file = e.target.files[0];
  if (!file || !currentCompJob) return;
  const { dept, job } = currentCompJob;
  const key      = `${dept}|${job}`;
  const safeName = `${dept}_${job}_${type}`.replace(/[^a-zA-Z0-9_]/g, '_');
  const filePath = `competency/${safeName}.pdf`;
  const { error } = await db.storage.from('competency').upload(filePath, file, { upsert: true });
  let url = '';
  if (!error) {
    const { data } = db.storage.from('competency').getPublicUrl(filePath);
    url = data?.publicUrl || '';
  } else {
    url = URL.createObjectURL(file);
  }
  if (!competencyFiles[key]) competencyFiles[key] = {};
  competencyFiles[key][type] = url;
  const label = type === 'framework' ? 'compFrameworkLabel' : 'compJdLabel';
  document.getElementById(label).textContent = `✓ ${file.name}`;
  renderDepts();
  showToast('Document uploaded.');
}

/* ═══════════════════════════════════════════
   ASSESSMENTS
═══════════════════════════════════════════ */
const assessmentQuestions = [
  { q:'Which best describes RESTful API design?', opts:['Stateful communication','Stateless communication using HTTP methods','Requires WebSocket','Only works with JSON'], correct:1 },
  { q:'What does SOLID stand for in software engineering?', opts:['Object-oriented design principles','A database framework','A language specification','A testing methodology'], correct:0 },
  { q:'What is the purpose of a sprint retrospective?', opts:['Plan next sprint','Review and improve team processes','Demo to stakeholders','Assign tasks'], correct:1 },
  { q:'Which version control practice supports code review best?', opts:['Committing to main','Feature branches with pull requests','Deleting branches after commits','Single shared branch'], correct:1 },
  { q:'Main advantage of containerisation (e.g. Docker)?', opts:['No need for testing','Consistent environments across dev and production','Writes code automatically','Replaces version control'], correct:1 }
];

function renderAssessment() {
  const panel = document.getElementById('questionsPanel');
  const title = document.getElementById('assessTitle');
  if (!panel) return;
  if (title) title.textContent = 'General Competency Assessment';

  panel.innerHTML = assessmentQuestions.map((item, qi) => `
    <div class="q-card">
      <div class="q-num">Question ${qi+1} of ${assessmentQuestions.length}</div>
      <div class="q-text">${item.q}</div>
      <div class="q-options">
        ${item.opts.map((opt, oi) => `
          <label class="q-opt" id="opt_${qi}_${oi}">
            <input type="radio" name="q${qi}" value="${oi}"
              onchange="selectOpt(this,${qi},${oi})"/>
            ${opt}
          </label>`).join('')}
      </div>
    </div>`).join('') + `
    <button class="btn btn-primary btn-full"
      style="padding:13px;font-size:14px;justify-content:center;margin-top:4px"
      onclick="submitAssessment()">
      <i class="ti ti-check"></i> Submit Assessment
    </button>`;
}

function selectOpt(input, qi, oi) {
  assessmentQuestions[qi].opts.forEach((_, i) => {
    const el = document.getElementById(`opt_${qi}_${i}`);
    if (el) el.classList.remove('selected');
  });
  const sel = document.getElementById(`opt_${qi}_${oi}`);
  if (sel) sel.classList.add('selected');
  userAnswers[qi] = oi;
  const badge = document.getElementById('assessBadge');
  if (badge) { badge.textContent = 'In Progress'; badge.className = 'status-pill purple'; }
}

async function submitAssessment() {
  if (Object.keys(userAnswers).length < assessmentQuestions.length) {
    alert('Please answer all questions before submitting.');
    return;
  }
  let correct = 0;
  assessmentQuestions.forEach((item, qi) => { if (userAnswers[qi] === item.correct) correct++; });
  const score    = Math.round((correct / assessmentQuestions.length) * 100);
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();

  await db.from('assessment_results').upsert({
    user_id: currentUser.id, candidate_name: fullName,
    score, correct, total: assessmentQuestions.length,
    answers: JSON.stringify(userAnswers),
    assessment_name: 'General Competency Assessment',
    submitted_at: new Date().toISOString()
  });

  document.getElementById('questionsPanel').innerHTML = `
    <div class="card" style="text-align:center;padding:40px">
      <i class="ti ti-circle-check" style="font-size:52px;color:var(--success);display:block;margin-bottom:14px"></i>
      <div style="font-size:20px;font-weight:600">Assessment Submitted</div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:8px;line-height:1.6">
        Your results are being reviewed by the hiring team.<br>
        <strong style="color:var(--brand)">Your score: ${score}%</strong>
      </div>
    </div>`;

  const badge = document.getElementById('assessBadge');
  if (badge) { badge.textContent = 'Completed'; badge.className = 'status-pill green'; }
}

/* ═══════════════════════════════════════════
   VACANCIES
═══════════════════════════════════════════ */
async function renderVacancies() {
  const { data, error } = await db.from('vacancies').select('*').order('created_at', { ascending: false });
  vacanciesData = (error || !data || data.length === 0)
    ? getDemoVacancies()
    : data.map(v => ({ ...v, screening_questions: safeParseJSON(v.screening_questions, []) }));

  if (userRole === 'candidate') renderCandidateVacancies();
}

function getDemoVacancies() {
  return [
    { id:'demo1', title:'Financial Accountant', department:'Finance', location:'Cape Town', type:'Full-time',
      description:'Manage financial records, prepare reports and ensure compliance.', closing_date:'2025-08-15', posted:true,
      screening_questions:[{ q:'Do you have a BCom Accounting degree?', opts:['Yes','No'], correct:0 },{ q:'Years of accounting experience?', opts:['< 1 year','1–3 years','3–5 years','5+ years'], correct:2 }] },
    { id:'demo2', title:'HR Business Partner', department:'Human Capital', location:'Cape Town', type:'Full-time',
      description:'Partner with business units to deliver strategic HR solutions.', closing_date:'2025-08-30', posted:true,
      screening_questions:[{ q:'Do you have an HR degree?', opts:['Yes','No'], correct:0 }] }
  ];
}

function renderCandidateVacancies() {
  const grid = document.getElementById('vacancyList');
  if (!grid) return;
  const posted = vacanciesData.filter(v => v.posted);
  if (posted.length === 0) {
    grid.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">
      <i class="ti ti-search" style="font-size:32px;display:block;margin-bottom:10px"></i>
      No vacancies available at the moment.</div>`;
    return;
  }
  grid.innerHTML = posted.map(v => `
    <div class="vacancy-card">
      <div class="vacancy-title">${v.title}</div>
      <div class="vacancy-dept">${v.department}</div>
      <div class="vacancy-meta">
        <span><i class="ti ti-map-pin"></i> ${v.location || 'Cape Town'}</span>
        <span><i class="ti ti-clock"></i> ${v.type || 'Full-time'}</span>
        <span><i class="ti ti-calendar"></i> Closes ${formatDate(v.closing_date)}</span>
      </div>
      <div class="vacancy-desc">${v.description || ''}</div>
      <div class="vacancy-footer">
        <span></span>
        <button class="btn btn-primary" onclick="openApplyModal('${v.id}')">
          <i class="ti ti-send"></i> Apply Now
        </button>
      </div>
    </div>`).join('');
}

/* ═══════════════════════════════════════════
   MANAGE VACANCIES (Admin)
═══════════════════════════════════════════ */
async function renderAdminVacancies() {
  const el = document.getElementById('adminVacancyList');
  if (!el) return;
  await renderVacancies();
  if (vacanciesData.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No vacancies yet.</div>';
    return;
  }
  el.innerHTML = vacanciesData.map(v => `
    <div class="admin-vacancy-block">
      <div class="admin-vacancy-header">
        <div>
          <div class="admin-vacancy-title">${v.title}</div>
          <div class="admin-vacancy-dept">${v.department} · ${v.location || 'Cape Town'} · ${v.type || 'Full-time'}</div>
        </div>
        <div class="admin-vacancy-actions">
          <label class="posted-toggle" onclick="togglePosted('${v.id}')">
            <div class="toggle-switch ${v.posted ? 'on' : ''}" id="toggle_${v.id}"></div>
            <span id="toggleLabel_${v.id}">${v.posted ? 'Posted' : 'Draft'}</span>
          </label>
          <button class="btn btn-secondary" style="font-size:12px"
            onclick="openScreeningQModal('${v.id}')">
            <i class="ti ti-help-circle"></i> Questions
          </button>
          <button class="btn btn-purple" style="font-size:12px"
            onclick="openApplicantListModal('${v.id}')">
            <i class="ti ti-users"></i> Applicants
          </button>
          <button class="btn btn-danger" style="font-size:12px;padding:6px 10px"
            onclick="deleteVacancy('${v.id}')">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>
    </div>`).join('');
}

async function togglePosted(vacId) {
  const vac = vacanciesData.find(v => String(v.id) === String(vacId));
  if (!vac) return;
  vac.posted = !vac.posted;
  const t = document.getElementById(`toggle_${vacId}`);
  const l = document.getElementById(`toggleLabel_${vacId}`);
  if (t) t.classList.toggle('on', vac.posted);
  if (l) l.textContent = vac.posted ? 'Posted' : 'Draft';
  if (!String(vacId).startsWith('demo')) {
    await db.from('vacancies').update({ posted: vac.posted }).eq('id', vacId);
  }
  showToast(vac.posted ? 'Vacancy posted.' : 'Set to draft.');
}

function openAddVacancyModal() {
  document.getElementById('addVacancyModal').classList.add('open');
}

async function addVacancy() {
  const title   = document.getElementById('vacTitle').value.trim();
  const dept    = document.getElementById('vacDept').value;
  const loc     = document.getElementById('vacLocation').value.trim();
  const type    = document.getElementById('vacType').value;
  const desc    = document.getElementById('vacDesc').value.trim();
  const closing = document.getElementById('vacClosing').value;
  if (!title) { alert('Please enter a job title.'); return; }

  const { data, error } = await db.from('vacancies').insert({
    title, department: dept, location: loc, type,
    description: desc, closing_date: closing,
    posted: false, screening_questions: JSON.stringify([]),
    created_by: currentUser.id, created_at: new Date().toISOString()
  }).select().single();

  const newVac = {
    id: data?.id || 'local_' + Date.now(),
    title, department: dept, location: loc, type,
    description: desc, closing_date: closing,
    posted: false, screening_questions: []
  };

  vacanciesData.unshift(newVac);
  closeModal('addVacancyModal');
  ['vacTitle','vacLocation','vacDesc','vacClosing'].forEach(id => {
    document.getElementById(id).value = '';
  });
  await renderAdminVacancies();
  showToast('Vacancy created. Now add screening questions.');
}

async function deleteVacancy(vacId) {
  if (!confirm('Delete this vacancy?')) return;
  vacanciesData = vacanciesData.filter(v => String(v.id) !== String(vacId));
  if (!String(vacId).startsWith('demo') && !String(vacId).startsWith('local')) {
    await db.from('vacancies').delete().eq('id', vacId);
  }
  await renderAdminVacancies();
}

/* ═══════════════════════════════════════════
   SCREENING QUESTIONS MODAL
═══════════════════════════════════════════ */
function openScreeningQModal(vacId) {
  currentVacancyId = vacId;
  const vac = vacanciesData.find(v => String(v.id) === String(vacId));
  if (!vac) { alert('Vacancy not found. Please refresh the page.'); return; }
  document.getElementById('sqJobTitle').textContent = vac.title;
  renderSQList(vac.screening_questions || []);
  document.getElementById('screeningQModal').classList.add('open');
}

function renderSQList(questions) {
  const el = document.getElementById('sqList');
  if (!el) return;
  el.innerHTML = questions.map((q, qi) => `
    <div class="sq-item">
      <div class="sq-num">Question ${qi+1}</div>
      <div class="form-group" style="margin-bottom:10px">
        <input type="text" value="${escapeHtml(q.q||'')}" placeholder="Enter question..."
          onchange="updateSQQuestion(${qi},this.value)"/>
      </div>
      <div class="sq-options-builder">
        ${(q.opts||['','']).map((opt,oi) => `
          <div class="sq-option-row">
            <input type="radio" name="sqCorrect_${qi}" value="${oi}" class="sq-correct-radio"
              ${q.correct===oi?'checked':''} onchange="updateSQCorrect(${qi},${oi})"
              title="Mark as correct answer"/>
            <span class="sq-correct-label">Correct</span>
            <input type="text" value="${escapeHtml(opt)}" placeholder="Option ${oi+1}..."
              onchange="updateSQOption(${qi},${oi},this.value)"/>
            ${q.opts.length>2
              ? `<button class="job-btn del" onclick="removeSQOption(${qi},${oi})">
                   <i class="ti ti-x"></i>
                 </button>` : ''}
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-secondary" style="font-size:11px;padding:4px 10px"
          onclick="addSQOption(${qi})">
          <i class="ti ti-plus"></i> Add Option
        </button>
        <button class="btn btn-danger" style="font-size:11px;padding:4px 10px"
          onclick="removeSQQuestion(${qi})">
          <i class="ti ti-trash"></i> Remove
        </button>
      </div>
    </div>`).join('');
}

function getCurrentSQQuestions() {
  const vac = vacanciesData.find(v => String(v.id) === String(currentVacancyId));
  return vac ? (vac.screening_questions || []) : [];
}

function addScreeningQuestion() {
  const vac = vacanciesData.find(v => String(v.id) === String(currentVacancyId));
  if (!vac) return;
  if (!vac.screening_questions) vac.screening_questions = [];
  vac.screening_questions.push({ q:'', opts:['',''], correct:0 });
  renderSQList(vac.screening_questions);
}

function updateSQQuestion(qi, val) { const qs = getCurrentSQQuestions(); if (qs[qi]) qs[qi].q = val; }
function updateSQOption(qi, oi, val) { const qs = getCurrentSQQuestions(); if (qs[qi]?.opts) qs[qi].opts[oi] = val; }
function updateSQCorrect(qi, oi) { const qs = getCurrentSQQuestions(); if (qs[qi]) qs[qi].correct = oi; }

function addSQOption(qi) {
  const qs = getCurrentSQQuestions();
  if (qs[qi] && qs[qi].opts.length < 5) { qs[qi].opts.push(''); renderSQList(qs); }
}

function removeSQOption(qi, oi) {
  const qs = getCurrentSQQuestions();
  if (qs[qi] && qs[qi].opts.length > 2) {
    qs[qi].opts.splice(oi, 1);
    if (qs[qi].correct >= qs[qi].opts.length) qs[qi].correct = 0;
    renderSQList(qs);
  }
}

function removeSQQuestion(qi) {
  const vac = vacanciesData.find(v => String(v.id) === String(currentVacancyId));
  if (vac?.screening_questions) {
    vac.screening_questions.splice(qi, 1);
    renderSQList(vac.screening_questions);
  }
}

async function saveScreeningQuestions() {
  const vac = vacanciesData.find(v => String(v.id) === String(currentVacancyId));
  if (!vac) return;
  const id = String(currentVacancyId);
  if (!id.startsWith('demo') && !id.startsWith('local')) {
    const { error } = await db.from('vacancies')
      .update({ screening_questions: JSON.stringify(vac.screening_questions) })
      .eq('id', currentVacancyId);
    if (error) { alert('Could not save questions: ' + error.message); return; }
  }
  closeModal('screeningQModal');
  showToast('Screening questions saved.');
}

/* ═══════════════════════════════════════════
   APPLY MODAL (Candidate)
═══════════════════════════════════════════ */
function openApplyModal(vacId) {
  currentVacancyId = vacId;
  applyAnswers     = {};
  applyCVFile      = null;
  document.getElementById('applyCVLabel').textContent = 'Click to upload your CV (PDF, Word)';

  const vac = vacanciesData.find(v => String(v.id) === String(vacId));
  if (!vac) return;
  document.getElementById('applyJobTitle').textContent = vac.title;

  const questions = vac.screening_questions || [];
  const el        = document.getElementById('applyQuestionsList');

  el.innerHTML = questions.length === 0
    ? `<div class="notice"><i class="ti ti-info-circle"></i>
        <span>No screening questions for this role. Just upload your CV and submit.</span></div>`
    : questions.map((q, qi) => `
        <div class="q-card">
          <div class="q-num">Question ${qi+1} of ${questions.length}</div>
          <div class="q-text">${escapeHtml(q.q)}</div>
          <div class="q-options">
            ${q.opts.map((opt, oi) => `
              <label class="q-opt" id="applyOpt_${qi}_${oi}">
                <input type="radio" name="applyQ${qi}" value="${oi}"
                  onchange="selectApplyOpt(${qi},${oi})"/>
                ${escapeHtml(opt)}
              </label>`).join('')}
          </div>
        </div>`).join('');

  document.getElementById('applyModal').classList.add('open');
}

function selectApplyOpt(qi, oi) {
  const vac = vacanciesData.find(v => String(v.id) === String(currentVacancyId));
  if (!vac) return;
  (vac.screening_questions || [])[qi]?.opts.forEach((_, i) => {
    const el = document.getElementById(`applyOpt_${qi}_${i}`);
    if (el) el.classList.remove('selected');
  });
  const sel = document.getElementById(`applyOpt_${qi}_${oi}`);
  if (sel) sel.classList.add('selected');
  applyAnswers[qi] = oi;
}

async function submitApplication() {
  const vac = vacanciesData.find(v => String(v.id) === String(currentVacancyId));
  if (!vac) return;

  const questions = vac.screening_questions || [];
  if (questions.length > 0 && Object.keys(applyAnswers).length < questions.length) {
    alert('Please answer all questions before submitting.');
    return;
  }

  let correct = 0;
  questions.forEach((q, qi) => { if (applyAnswers[qi] === q.correct) correct++; });
  const score    = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 100;
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();

  let cvUrl = '';
  if (applyCVFile) {
    const ext  = applyCVFile.name.split('.').pop();
    const path = `cvs/applications/${currentUser.id}_${Date.now()}.${ext}`;
    const { error: uploadErr } = await db.storage.from('cvs').upload(path, applyCVFile, { upsert: true });
    if (!uploadErr) {
      const { data } = db.storage.from('cvs').getPublicUrl(path);
      cvUrl = data?.publicUrl || '';
    }
  }

  const { error } = await db.from('applications').upsert({
    vacancy_id:      currentVacancyId,
    vacancy_title:   vac.title,
    user_id:         currentUser.id,
    candidate_name:  fullName,
    candidate_email: currentUser.email,
    answers:         JSON.stringify(applyAnswers),
    score, cv_url:   cvUrl,
    status:          'applied',
    submitted_at:    new Date().toISOString()
  });

  if (error) { alert('Could not submit: ' + error.message); return; }

  await db.from('profiles').update({ status: 'reviewing' }).eq('id', currentUser.id);
  currentProfile.status = 'reviewing';

  applyAnswers = {};
  applyCVFile  = null;
  closeModal('applyModal');
  applyStatus('reviewing');
  showToast(`Application submitted! Fit score: ${score >= 70 ? '🟢 Good' : score >= 40 ? '🟡 Moderate' : '🔴 Under review'}`);
}

/* ═══════════════════════════════════════════
   APPLICANTS MODAL (Admin)
═══════════════════════════════════════════ */
async function openApplicantListModal(vacId) {
  currentVacancyId = vacId;
  const vac = vacanciesData.find(v => String(v.id) === String(vacId));
  if (!vac) return;
  document.getElementById('alJobTitle').textContent = vac.title;

  const { data, error } = await db.from('applications').select('*')
    .eq('vacancy_id', vacId).order('score', { ascending: false });
  const apps = (error || !data) ? [] : data;

  const good     = apps.filter(a => a.score >= 70);
  const moderate = apps.filter(a => a.score >= 40 && a.score < 70);
  const poor     = apps.filter(a => a.score < 40);

  const renderChips = arr => arr.length === 0
    ? '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">No candidates</div>'
    : arr.map(a => `
        <div class="applicant-chip" onclick="openCandidateProfile('${a.id}')">
          <div>
            <div style="font-weight:500">${a.candidate_name || 'Candidate'}</div>
            <div style="font-size:10px;color:var(--text-muted)">${a.candidate_email || ''}</div>
          </div>
          <span class="applicant-score">${a.score}%</span>
        </div>`).join('');

  document.getElementById('colGood').innerHTML     = renderChips(good);
  document.getElementById('colModerate').innerHTML = renderChips(moderate);
  document.getElementById('colPoor').innerHTML     = renderChips(poor);
  document.getElementById('applicantListModal').classList.add('open');
}

function bulkAdvance() { bulkAdvanceVacancy(currentVacancyId); }
function bulkReject()  { bulkRejectVacancy(currentVacancyId); }

/* ═══════════════════════════════════════════
   BOOKINGS — TAB RENDERING
═══════════════════════════════════════════ */
function renderBookingTabs() {
  const bar = document.getElementById('bookingTabBar');
  if (!bar) return;

  const tabs = {
    admin:     ['availability','interview','onboarding'],
    manager:   ['availability','onboarding'],
    candidate: ['interview']
  };

  const labels = {
    availability: { icon:'ti-calendar-stats', label:'Book Interview Slots' },
    interview:    { icon:'ti-video',           label:'Book an Interview' },
    onboarding:   { icon:'ti-presentation',    label:'Onboarding Slots' }
  };

  const myTabs = tabs[userRole] || ['interview'];

  bar.innerHTML = '';
  myTabs.forEach((t, i) => {
    const btn = document.createElement('button');
    btn.className = 'booking-tab-btn' + (i === 0 ? ' active' : '');
    btn.id        = 'bookingTabBtn_' + t;
    btn.innerHTML = `<i class="ti ${labels[t].icon}"></i> ${labels[t].label}`;
    btn.addEventListener('click', () => switchBookingTab(t));
    bar.appendChild(btn);
  });

  const addInterviewBtn  = document.getElementById('addInterviewSlotBtn');
  const addOnboardingBtn = document.getElementById('addOnboardingSlotBtn');
  if (addInterviewBtn)  addInterviewBtn.style.display  = userRole === 'admin' ? 'block' : 'none';
  if (addOnboardingBtn) addOnboardingBtn.style.display = userRole === 'admin' ? 'block' : 'none';

  switchBookingTab(myTabs[0]);
}

function switchBookingTab(panel) {
  document.querySelectorAll('.booking-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.booking-tab-btn').forEach(b => b.classList.remove('active'));

  const panelEl = document.getElementById(`bookingPanel-${panel}`);
  const btnEl   = document.getElementById(`bookingTabBtn_${panel}`);
  if (panelEl) panelEl.classList.add('active');
  if (btnEl)   btnEl.classList.add('active');

  if (panel === 'interview')    renderSlots();
  if (panel === 'availability') renderAvailabilityCalendar();
  if (panel === 'onboarding')   renderOnboardingSlots();
}

/* ═══════════════════════════════════════════
   BOOKINGS — INTERVIEW SLOTS
═══════════════════════════════════════════ */
async function renderSlots() {
  const grid = document.getElementById('slotsGrid');
  if (!grid) return;

  const { data, error } = await db.from('bookings').select('*')
    .order('slot_date', { ascending: true })
    .order('slot_time', { ascending: true });
  slotsData = (error || !data || data.length === 0) ? getDemoSlots() : data;

  const myBooking = slotsData.find(s => s.booked_by_email === currentUser?.email);

  // Remove any previous notice
  const oldNotice = grid.parentElement.querySelector('.booking-notice');
  if (oldNotice) oldNotice.remove();

  if (myBooking && userRole === 'candidate') {
    const notice = document.createElement('div');
    notice.className = 'notice booking-notice';
    notice.style.marginBottom = '16px';
    notice.innerHTML = `<i class="ti ti-info-circle"></i>
      <span>You already have a booking. Cancel your existing slot to book a different one.</span>`;
    grid.parentElement.insertBefore(notice, grid);
  }

  grid.innerHTML = '';
  slotsData.forEach(slot => {
    const dateObj     = new Date(`${slot.slot_date}T${slot.slot_time}`);
    const dateStr     = dateObj.toLocaleDateString('en-ZA', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
    const isMyBooking = slot.booked_by_email === currentUser?.email;
    const isOther     = slot.booked_by_email && !isMyBooking;

    let cls        = 'slot-card available';
    let statusHtml = '<span class="slot-status available">Available</span>';
    let extraHtml  = '';
    let actionHtml = '';

    if (isMyBooking) {
      cls        = 'slot-card booked-mine';
      statusHtml = '<span class="slot-status mine">Your Booking</span>';
      actionHtml = `<div style="margin-top:10px">
        <button class="btn btn-danger"
          style="width:100%;font-size:11px;padding:5px;justify-content:center"
          onclick="confirmCancelInterview('${slot.id}','${slot.slot_date}','${slot.slot_time.slice(0,5)}')">
          <i class="ti ti-x"></i> Cancel
        </button></div>`;
    } else if (isOther && userRole === 'admin') {
      cls        = 'slot-card booked-admin';
      statusHtml = '<span class="slot-status admin-view">Booked</span>';
      extraHtml  = `<div class="slot-candidate">
        <i class="ti ti-user" style="font-size:11px"></i>
        ${slot.booked_by_name || slot.booked_by_email}
      </div>`;
    } else if (isOther) {
      cls        = 'slot-card booked-other';
      statusHtml = '<span class="slot-status booked">Booked</span>';
    }

    if (!slot.booked_by_email && userRole !== 'admin' && !myBooking) {
      actionHtml = `<div style="margin-top:10px">
        <button class="btn btn-primary"
          style="width:100%;font-size:11px;padding:5px;justify-content:center"
          onclick="bookSlot('${slot.id}','${slot.slot_date}','${slot.slot_time.slice(0,5)}')">
          <i class="ti ti-calendar-plus"></i> Book
        </button></div>`;
    }

    grid.innerHTML += `
      <div class="${cls}">
        <div class="slot-date">${dateStr}</div>
        <div class="slot-time">${slot.slot_time.slice(0,5)}</div>
        <div class="slot-duration">30 min session</div>
        ${statusHtml}${extraHtml}${actionHtml}
      </div>`;
  });
}

function getDemoSlots() {
  const slots = [];
  const times  = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00'];
  const dates  = ['2025-07-07','2025-07-08','2025-07-09'];
  dates.forEach(d => {
    times.forEach(t => {
      slots.push({ id:`ds_${d}_${t}`, slot_date:d, slot_time:t+':00', booked_by_email:null });
    });
  });
  return slots;
}

async function bookSlot(slotId, date, time) {
  if (!currentUser) return;
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();

  if (String(slotId).startsWith('ds_')) {
    const slot = slotsData.find(s => s.id === slotId);
    if (slot) { slot.booked_by_email = currentUser.email; slot.booked_by_name = fullName; }
    await sendInterviewConfirmationEmail(currentUser.email, fullName, date, time);
    renderSlots();
    showToast('Interview booked! Confirmation email sent.');
    return;
  }

  const { error } = await db.from('bookings').update({
    booked_by_email: currentUser.email,
    booked_by_name:  fullName,
    booked_at:       new Date().toISOString()
  }).eq('id', slotId).is('booked_by_email', null);

  if (error) { alert('Could not book: ' + error.message); return; }

  await sendInterviewConfirmationEmail(currentUser.email, fullName, date, time);
  renderSlots();
  showToast('Interview booked! Confirmation email sent.');
}

function confirmCancelInterview(slotId, date, time) {
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();
  document.getElementById('cancelInterviewText').innerHTML =
    `Are you sure you want to cancel the interview for <strong>${escapeHtml(fullName)}</strong>
     on <strong>${date} at ${time}</strong>?`;

  const yesBtn = document.getElementById('cancelInterviewYes');
  yesBtn.onclick = async () => {
    closeModal('cancelInterviewModal');
    await cancelSlot(slotId, date, time);
  };
  document.getElementById('cancelInterviewModal').classList.add('open');
}

async function cancelSlot(slotId, date, time) {
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();

  if (String(slotId).startsWith('ds_')) {
    const slot = slotsData.find(s => s.id === slotId);
    if (slot) { slot.booked_by_email = null; slot.booked_by_name = null; }
    await sendInterviewCancellationEmail(currentUser.email, fullName, date, time);
    renderSlots();
    showToast('Booking cancelled.');
    return;
  }

  await db.from('bookings').update({
    booked_by_email: null, booked_by_name: null, booked_at: null
  }).eq('id', slotId).eq('booked_by_email', currentUser.email);

  await sendInterviewCancellationEmail(currentUser.email, fullName, date, time);
  renderSlots();
  showToast('Booking cancelled. Notification sent.');
}

function openAddSlotModal() {
  document.getElementById('newSlotDate').value = '';
  document.getElementById('newSlotTime').value = '';
  document.getElementById('addSlotModal').classList.add('open');
}

async function addSlot() {
  const date = document.getElementById('newSlotDate').value;
  const time = document.getElementById('newSlotTime').value;
  if (!date || !time) { alert('Please select date and time.'); return; }
  const { error } = await db.from('bookings').insert({
    slot_date: date, slot_time: time + ':00',
    booked_by_email: null, booked_by_name: null,
    created_by: currentUser.id, created_at: new Date().toISOString()
  });
  if (error) {
    slotsData.push({ id:'ds_'+Date.now(), slot_date:date, slot_time:time+':00', booked_by_email:null });
  }
  closeModal('addSlotModal');
  renderSlots();
  showToast('Interview slot added.');
}

/* ═══════════════════════════════════════════
   BOOKINGS — TEAM AVAILABILITY CALENDAR
═══════════════════════════════════════════ */
async function renderAvailabilityCalendar() {
  const wrap = document.getElementById('availabilityCalendar');
  if (!wrap) return;

  const { data } = await db.from('team_availability').select('*');
  allAvailability = data || [];

  const userColourMap = {};
  let colourIdx = 0;
  allAvailability.forEach(row => {
    if (!userColourMap[row.user_id]) {
      userColourMap[row.user_id] = teamColours[colourIdx % teamColours.length];
      colourIdx++;
    }
  });
  if (!userColourMap[currentUser.id]) {
    userColourMap[currentUser.id] = teamColours[colourIdx % teamColours.length];
  }

  myAvailability = new Set(
    allAvailability
      .filter(r => r.user_id === currentUser.id)
      .map(r => `${r.slot_date}|${r.slot_time}`)
  );

  const usersInData = [...new Set(allAvailability.map(r => r.user_id))];
  const legend      = document.getElementById('availabilityLegend');
  if (legend) {
    legend.innerHTML = usersInData.map(uid => {
      const row  = allAvailability.find(r => r.user_id === uid);
      const name = row?.user_name || (uid === currentUser.id
        ? `${currentProfile.first_name} ${currentProfile.last_name}`.trim()
        : 'Team Member');
      const col  = userColourMap[uid] || '#ccc';
      return `<span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary)">
        <span class="avail-legend-dot" style="background:${col}"></span>${name}
      </span>`;
    }).join('') + `<span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--success)">
      <span class="avail-legend-dot" style="background:var(--success)"></span> Recommended (all free)
    </span>`;
  }

  const days = [];
  let d = new Date();
  while (days.length < 5) {
    d = new Date(d); d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      days.push(d.toISOString().slice(0,10));
    }
  }

  const times = [];
  for (let h = 9; h < 15; h++) {
    times.push(`${String(h).padStart(2,'0')}:00`);
    times.push(`${String(h).padStart(2,'0')}:30`);
  }

  const totalUsers = Math.max(usersInData.length, 1);

  let html = `<div class="availability-calendar-wrap">
    <table class="availability-table">
    <thead><tr>
      <th style="width:60px">Time</th>
      ${days.map(day => {
        const dt = new Date(day + 'T12:00:00');
        return `<th>${dt.toLocaleDateString('en-ZA',{weekday:'short',day:'numeric',month:'short'})}</th>`;
      }).join('')}
    </tr></thead>
    <tbody>`;

  times.forEach(time => {
    html += `<tr><td class="avail-time-label">${time}</td>`;
    days.forEach(day => {
      const key      = `${day}|${time}:00`;
      const selectors = allAvailability.filter(r =>
        r.slot_date === day && r.slot_time.slice(0,5) === time
      );
      const count        = selectors.length;
      const isMine       = myAvailability.has(key);
      const isRecommended = count > 0 && count >= totalUsers;

      const dots = selectors.map(r =>
        `<span class="avail-dot" style="background:${userColourMap[r.user_id]||'#ccc'}"></span>`
      ).join('');

      let slotClass = 'avail-slot';
      let slotStyle = '';
      if (isMine) {
        slotClass += ' selected-mine';
        slotStyle  = `background:${userColourMap[currentUser.id]}33;border-color:${userColourMap[currentUser.id]}`;
      }
      if (count >= 2) slotClass += ' multi-selected';
      if (isRecommended) slotClass += ' recommended';

      html += `<td>
        <div class="${slotClass}" style="${slotStyle}"
          onclick="toggleAvailability('${day}','${time}:00','${userColourMap[currentUser.id]||'#00aeef'}')">
          ${dots}
          ${count >= 2 ? `<span class="avail-count">${count}</span>` : ''}
        </div>
      </td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  wrap.innerHTML = html;
  renderRecommendedSlots(days, times, totalUsers);
}

function renderRecommendedSlots(days, times, totalUsers) {
  const el = document.getElementById('recommendedSlots');
  if (!el) return;
  const recommended = [];
  days.forEach(day => {
    times.forEach(time => {
      const selectors = allAvailability.filter(r =>
        r.slot_date === day && r.slot_time.slice(0,5) === time
      );
      if (selectors.length >= totalUsers && totalUsers > 0) {
        const dt = new Date(day + 'T12:00:00');
        recommended.push({
          day, time,
          dateStr: dt.toLocaleDateString('en-ZA',{ weekday:'short', day:'numeric', month:'short' })
        });
      }
    });
  });
  el.innerHTML = recommended.length === 0
    ? '<p style="font-size:13px;color:var(--text-muted)">No slots where all members are available yet.</p>'
    : recommended.map(r =>
        `<span class="recommended-slot-chip">
          <i class="ti ti-star"></i> ${r.dateStr} at ${r.time}
        </span>`).join('');
}

async function toggleAvailability(date, time, colour) {
  const key      = `${date}|${time}`;
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();

  if (myAvailability.has(key)) {
    myAvailability.delete(key);
    await db.from('team_availability').delete()
      .eq('user_id', currentUser.id)
      .eq('slot_date', date)
      .eq('slot_time', time);
  } else {
    myAvailability.add(key);
    await db.from('team_availability').upsert({
      user_id:     currentUser.id,
      user_name:   fullName,
      user_colour: colour,
      slot_date:   date,
      slot_time:   time,
      created_at:  new Date().toISOString()
    });
  }
  await renderAvailabilityCalendar();
}

/* ═══════════════════════════════════════════
   BOOKINGS — ONBOARDING SLOTS
═══════════════════════════════════════════ */
async function renderOnboardingSlots() {
  const grid = document.getElementById('onboardingGrid');
  if (!grid) return;

  const { data, error } = await db.from('onboarding_slots').select('*')
    .order('slot_date', { ascending: true })
    .order('slot_time', { ascending: true });
  const slots = (error || !data || data.length === 0) ? [] : data;

  if (slots.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-muted)">
      No onboarding slots available yet.
      ${userRole === 'admin' ? 'Click "Add Slot" to create one.' : ''}
    </div>`;
    return;
  }

  grid.innerHTML = '';
  slots.forEach(slot => {
    const dateObj  = new Date(`${slot.slot_date}T${slot.slot_time}`);
    const dateStr  = dateObj.toLocaleDateString('en-ZA',{ weekday:'short', day:'numeric', month:'short', year:'numeric' });
    const isMine   = slot.booked_by_id === currentUser?.id;
    const isOther  = slot.booked_by_id && !isMine;

    let cls        = 'slot-card available';
    let statusHtml = '<span class="slot-status available">Available</span>';
    let extraHtml  = '';
    let actionHtml = '';

    if (isMine) {
      cls        = 'slot-card booked-mine';
      statusHtml = '<span class="slot-status mine">Your Session</span>';
      if (slot.topic) extraHtml = `<div class="slot-topic">${escapeHtml(slot.topic)}</div>`;
      actionHtml = `<div style="margin-top:10px">
        <button class="btn btn-danger"
          style="width:100%;font-size:11px;padding:5px;justify-content:center"
          onclick="confirmCancelOnboarding('${slot.id}','${escapeHtml(slot.booked_by_name||'')}','${slot.slot_date}','${slot.slot_time.slice(0,5)}')">
          <i class="ti ti-x"></i> Cancel
        </button></div>`;
    } else if (isOther && userRole === 'admin') {
      cls        = 'slot-card booked-admin';
      statusHtml = '<span class="slot-status onboarding-booked">Booked</span>';
      extraHtml  = `<div class="slot-candidate">${escapeHtml(slot.booked_by_name||'')}</div>`;
      if (slot.topic) extraHtml += `<div class="slot-topic">${escapeHtml(slot.topic)}</div>`;
      actionHtml = `<div style="margin-top:10px">
        <button class="btn btn-danger"
          style="width:100%;font-size:11px;padding:5px;justify-content:center"
          onclick="confirmCancelOnboarding('${slot.id}','${escapeHtml(slot.booked_by_name||'')}','${slot.slot_date}','${slot.slot_time.slice(0,5)}')">
          <i class="ti ti-x"></i> Cancel
        </button></div>`;
    } else if (isOther) {
      cls        = 'slot-card booked-other';
      statusHtml = '<span class="slot-status booked">Booked</span>';
    }

    if (!slot.booked_by_id) {
      actionHtml = `<div style="margin-top:10px">
        <button class="btn btn-primary"
          style="width:100%;font-size:11px;padding:5px;justify-content:center"
          onclick="openOnboardingTopicModal('${slot.id}')">
          <i class="ti ti-calendar-plus"></i> Book Session
        </button></div>`;
    }

    grid.innerHTML += `
      <div class="${cls}">
        <div class="slot-date">${dateStr}</div>
        <div class="slot-time">${slot.slot_time.slice(0,5)}</div>
        ${statusHtml}${extraHtml}${actionHtml}
      </div>`;
  });
}

function openOnboardingTopicModal(slotId) {
  pendingOnboardingSlotId = slotId;
  document.getElementById('onboardingTopic').value = '';
  document.getElementById('onboardingTopicModal').classList.add('open');
}

async function confirmOnboardingBook() {
  const topic = document.getElementById('onboardingTopic').value.trim();
  if (!topic) { alert('Please enter a topic.'); return; }
  if (!pendingOnboardingSlotId) return;

  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();

  const { error } = await db.from('onboarding_slots').update({
    booked_by_id:    currentUser.id,
    booked_by_name:  fullName,
    booked_by_email: currentUser.email,
    topic,
    booked_at: new Date().toISOString()
  }).eq('id', pendingOnboardingSlotId).is('booked_by_id', null);

  if (error) { alert('Could not book: ' + error.message); return; }

  closeModal('onboardingTopicModal');
  pendingOnboardingSlotId = null;
  await renderOnboardingSlots();
  showToast('Onboarding session booked.');
}

function openAddOnboardingSlotModal() {
  document.getElementById('newOnboardingDate').value = '';
  document.getElementById('newOnboardingTime').value = '';
  document.getElementById('addOnboardingSlotModal').classList.add('open');
}

async function addOnboardingSlot() {
  const date = document.getElementById('newOnboardingDate').value;
  const time = document.getElementById('newOnboardingTime').value;
  if (!date || !time) { alert('Please select date and time.'); return; }
  const { error } = await db.from('onboarding_slots').insert({
    slot_date: date, slot_time: time + ':00',
    created_by: currentUser.id, created_at: new Date().toISOString()
  });
  if (error) { alert('Could not add slot: ' + error.message); return; }
  closeModal('addOnboardingSlotModal');
  await renderOnboardingSlots();
  showToast('Onboarding slot added.');
}

function confirmCancelOnboarding(slotId, name, date, time) {
  document.getElementById('cancelOnboardingText').innerHTML =
    `Are you sure you want to cancel the session for <strong>${escapeHtml(name)}</strong>
     on <strong>${date} at ${time}</strong>?`;

  const yesBtn = document.getElementById('cancelOnboardingYes');
  yesBtn.onclick = async () => {
    closeModal('cancelOnboardingModal');
    await cancelOnboardingSlot(slotId);
  };
  document.getElementById('cancelOnboardingModal').classList.add('open');
}

async function cancelOnboardingSlot(slotId) {
  const { error } = await db.from('onboarding_slots').update({
    booked_by_id: null, booked_by_name: null,
    booked_by_email: null, topic: null, booked_at: null
  }).eq('id', slotId);
  if (error) { alert('Could not cancel: ' + error.message); return; }
  await renderOnboardingSlots();
  showToast('Session cancelled.');
}

/* ═══════════════════════════════════════════
   STATS
═══════════════════════════════════════════ */
async function renderStats() {
  const el = document.getElementById('statsPanel');
  if (!el) return;

  const [profRes, vacRes, appRes, bookRes] = await Promise.all([
    db.from('profiles').select('id, status, created_at, role'),
    db.from('vacancies').select('id, posted, created_at'),
    db.from('applications').select('id, score, status, submitted_at'),
    db.from('bookings').select('id, booked_by_email, slot_date')
  ]);

  const profiles  = profRes.data || [];
  const vacancies = vacRes.data  || [];
  const apps      = appRes.data  || [];
  const bookings  = bookRes.data || [];

  const candidates  = profiles.filter(p => p.role !== 'admin' && p.role !== 'manager');
  const postedJobs  = vacancies.filter(v => v.posted);
  const bookedSlots = bookings.filter(b => b.booked_by_email);

  const stageCounts = {};
  Object.keys(statusConfig).forEach(k => { stageCounts[k] = 0; });
  apps.forEach(a => { if (stageCounts[a.status] !== undefined) stageCounts[a.status]++; });

  const goodFit     = apps.filter(a => a.score >= 70).length;
  const moderateFit = apps.filter(a => a.score >= 40 && a.score < 70).length;
  const poorFit     = apps.filter(a => a.score < 40).length;

  const stageLabels = ['Applied','Reviewing','1st Int.','Assessment','2nd Int.','Final','Offered'];
  const stageKeys   = ['applied','reviewing','interview1','assessment','interview2','final','offered'];
  const stageVals   = stageKeys.map(k => stageCounts[k] || 0);
  const maxVal      = Math.max(...stageVals, 1);
  const barColors   = [
    'var(--brand)','var(--accent-purple)','var(--success)',
    'var(--accent-yellow)','var(--success)','var(--accent-green)','var(--warning)'
  ];

  el.innerHTML = `
    <div class="stats-grid" id="statsDownloadTarget">
      <div class="stat-card brand-accent">
        <i class="ti ti-users s-icon"></i>
        <div class="s-label">Total Applicants</div>
        <div class="s-value">${apps.length || candidates.length}</div>
        <div class="s-sub">Total applications received</div>
      </div>
      <div class="stat-card purple-accent">
        <i class="ti ti-briefcase s-icon"></i>
        <div class="s-label">Active Vacancies</div>
        <div class="s-value">${postedJobs.length}</div>
        <div class="s-sub">Currently posted</div>
      </div>
      <div class="stat-card yellow-accent">
        <i class="ti ti-calendar-check s-icon"></i>
        <div class="s-label">Interviews Booked</div>
        <div class="s-value">${bookedSlots.length}</div>
        <div class="s-sub">Confirmed slots</div>
      </div>
      <div class="stat-card green-accent">
        <i class="ti ti-circle-check s-icon"></i>
        <div class="s-label">Good Fit</div>
        <div class="s-value">${goodFit}</div>
        <div class="s-sub">Score ≥ 70%</div>
      </div>
    </div>

    <div class="stats-chart-row">
      <div class="chart-card">
        <h4><i class="ti ti-chart-bar" style="color:var(--brand);margin-right:6px"></i>Recruitment Pipeline</h4>
        <div class="bar-chart">
          ${stageVals.map((val,i) => `
            <div class="bar-col">
              <div class="bar-val">${val}</div>
              <div class="bar" style="height:${Math.round((val/maxVal)*100)}%;background:${barColors[i]}"></div>
              <div class="bar-label">${stageLabels[i]}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="chart-card">
        <h4><i class="ti ti-chart-pie" style="color:var(--accent-purple);margin-right:6px"></i>Fit Distribution</h4>
        <div class="donut-wrap">
          <svg width="110" height="110" viewBox="0 0 110 110">
            ${buildDonutPaths(goodFit, moderateFit, poorFit)}
          </svg>
          <div class="donut-legend">
            <div class="legend-item">
              <div class="legend-dot" style="background:var(--success)"></div>Good — <strong>${goodFit}</strong>
            </div>
            <div class="legend-item">
              <div class="legend-dot" style="background:var(--accent-yellow)"></div>Moderate — <strong>${moderateFit}</strong>
            </div>
            <div class="legend-item">
              <div class="legend-dot" style="background:var(--danger)"></div>Not a Fit — <strong>${poorFit}</strong>
            </div>
            <div class="legend-item" style="margin-top:4px;border-top:1px solid var(--border);padding-top:6px">
              <div class="legend-dot" style="background:var(--text-muted)"></div>Total — <strong>${apps.length}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="chart-card">
      <h4><i class="ti ti-table" style="color:var(--brand-dark);margin-right:6px"></i>Stage Breakdown</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:2px solid var(--border)">
            <th style="text-align:left;padding:8px 0;color:var(--text-muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Stage</th>
            <th style="text-align:right;padding:8px 0;color:var(--text-muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Count</th>
            <th style="text-align:right;padding:8px 0;color:var(--text-muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px">%</th>
          </tr>
        </thead>
        <tbody>
          ${stageKeys.map((k,i) => `
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:9px 0;display:flex;align-items:center;gap:8px">
                <div style="width:10px;height:10px;border-radius:50%;background:${barColors[i]};flex-shrink:0"></div>
                ${stageLabels[i]}
              </td>
              <td style="text-align:right;font-weight:600">${stageCounts[k]||0}</td>
              <td style="text-align:right;color:var(--text-muted)">
                ${apps.length > 0 ? Math.round(((stageCounts[k]||0)/apps.length)*100) : 0}%
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function buildDonutPaths(good, moderate, poor) {
  const total = good + moderate + poor;
  if (total === 0) return `
    <circle cx="55" cy="55" r="40" fill="none" stroke="var(--border)" stroke-width="18"/>
    <text x="55" y="60" text-anchor="middle" font-size="12" fill="var(--text-muted)">0</text>`;
  const cx = 55, cy = 55, r = 40, circ = 2 * Math.PI * r;
  let offset = 0;
  const segs = [
    { count:good,     color:'var(--success)' },
    { count:moderate, color:'var(--accent-yellow)' },
    { count:poor,     color:'var(--danger)' }
  ].filter(s => s.count > 0);
  const paths = segs.map(seg => {
    const dash = (seg.count/total)*circ;
    const gap  = circ - dash;
    const path = `<circle cx="${cx}" cy="${cy}" r="${r}"
      fill="none" stroke="${seg.color}" stroke-width="18"
      stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${-offset}"
      style="transform-origin:${cx}px ${cy}px;transform:rotate(-90deg)"/>`;
    offset += dash;
    return path;
  }).join('');
  return paths + `<text x="${cx}" y="${cy+5}" text-anchor="middle"
    font-size="14" font-weight="700" fill="var(--text-primary)">${total}</text>`;
}

async function downloadStatsImage() {
  const el = document.getElementById('statsDownloadTarget') || document.getElementById('statsPanel');
  if (!el) return;
  try {
    if (typeof html2canvas !== 'undefined') {
      const canvas = await html2canvas(el, { backgroundColor:'#f4f8fc', scale:2 });
      const link   = document.createElement('a');
      link.download = `Communicare_Stats_${new Date().toISOString().slice(0,10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } else {
      alert('Add to your HTML <head>:\n<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>');
    }
  } catch (err) { alert('Download failed: ' + err.message); }
}

/* ═══════════════════════════════════════════
   MODALS
═══════════════════════════════════════════ */
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA',{ day:'numeric', month:'short', year:'numeric' });
}

function safeParseJSON(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

function showAuthMessage(msg, type) {
  const el = document.getElementById('authMessage');
  if (!el) return;
  el.textContent = msg;
  el.className   = `auth-message ${type}`;
  el.classList.remove('hidden');
}

function clearAuthMessage() {
  const el = document.getElementById('authMessage');
  if (el) { el.classList.add('hidden'); el.textContent = ''; }
}

function setButtonLoading(btn, loading, originalHTML = '') {
  if (loading) {
    btn.disabled  = true;
    btn.innerHTML = '<span class="loading-spinner"></span> Please wait...';
  } else {
    btn.disabled  = false;
    if (originalHTML) btn.innerHTML = originalHTML;
  }
}

function showToast(message, type = 'success') {
  const existing = document.getElementById('saveToast');
  if (existing) existing.remove();
  const colours = { success:'#16a34a', error:'#dc2626', info:'#007aa6' };
  const icons   = { success:'ti-circle-check', error:'ti-circle-x', info:'ti-info-circle' };
  const toast   = document.createElement('div');
  toast.id = 'saveToast';
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;
    background:${colours[type]||colours.success};
    color:white;padding:12px 20px;border-radius:8px;
    font-size:13px;font-weight:500;
    box-shadow:0 4px 12px rgba(0,0,0,0.15);
    z-index:9999;display:flex;align-items:center;gap:8px;
    max-width:360px;line-height:1.4;`;
  toast.innerHTML = `<i class="ti ${icons[type]||icons.success}"></i> ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity    = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}