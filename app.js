/* ═══════════════════════════════════════════
   COMMUNICARE HRIS — app.js
   Full Supabase-connected recruitment portal
═══════════════════════════════════════════ */

// ── SUPABASE INIT ──
const SUPABASE_URL  = 'https://llryoespqzykaqawhwob.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxscnlvZXNwcXp5a2FxYXdod29iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODg3MTcsImV4cCI6MjA5NjA2NDcxN30.P5tL7TA-VB9EkCSThwE2jIExxya8VYvs2SjU9pCrmQY';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ═══════════════════════════════════════════
   GLOBAL STATE
═══════════════════════════════════════════ */
let currentUser     = null;
let currentProfile  = null;
let isAdmin         = false;
let slotsData       = [];
let vacanciesData   = [];
let applicationsData = [];
let uploadedAssessments = [];
let competencyFiles = {};   // { "Dept|JobTitle": { framework: url, jd: url } }
let currentVacancyId = null; // for modals
let currentCompJob   = null; // for PDF upload modal

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
document.addEventListener('DOMContentLoaded', async () => {
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
  document.body.classList.remove('admin-mode');
}

function showApp() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');
  populateDashboard();
  renderDepts();
  renderSlots();
  renderAssessment();
  renderVacancies();
  renderStats();
}

function switchAuthTab(tab) {
  document.getElementById('loginForm').classList.toggle('hidden',  tab !== 'login');
  document.getElementById('signupForm').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('tabLogin').classList.toggle('active',   tab === 'login');
  document.getElementById('tabSignup').classList.toggle('active',  tab === 'signup');
  clearAuthMessage();
}

/* ═══════════════════════════════════════════
   AUTH — LOGIN
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
   AUTH — SIGN UP
═══════════════════════════════════════════ */
async function handleSignup(e) {
  e.preventDefault();
  const firstName = document.getElementById('signupFirst').value.trim();
  const lastName  = document.getElementById('signupLast').value.trim();
  const email     = document.getElementById('signupEmail').value.trim();
  const password  = document.getElementById('signupPassword').value;
  const role      = document.getElementById('signupRole').value;
  const btn       = document.getElementById('signupBtn');

  if (password.length < 6) {
    showAuthMessage('Password must be at least 6 characters.', 'error');
    return;
  }

  setButtonLoading(btn, true);

  const { data, error } = await db.auth.signUp({
    email, password,
    options: { data: { first_name: firstName, last_name: lastName, role } }
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
      role, status: 'reviewing',
      created_at: new Date().toISOString()
    });
  }

  setButtonLoading(btn, false, '<i class="ti ti-user-plus"></i> Create Account');
  showAuthMessage('Account created! Check your email to confirm, then sign in.', 'success');
}

/* ═══════════════════════════════════════════
   AUTH — LOGOUT / FORGOT PASSWORD
═══════════════════════════════════════════ */
async function handleLogout() {
  await db.auth.signOut();
}

async function showForgotPassword() {
  const email = prompt('Enter your email address:');
  if (!email) return;
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  alert(error ? 'Error: ' + error.message : 'Reset email sent! Check your inbox.');
}

/* ═══════════════════════════════════════════
   PROFILE — LOAD
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
      status:     'reviewing'
    };
  } else {
    currentProfile = data;
  }

  isAdmin = currentProfile.role === 'admin';
  document.body.classList.toggle('admin-mode', isAdmin);
  updateRoleBadge();
}

/* ═══════════════════════════════════════════
   DASHBOARD — POPULATE
═══════════════════════════════════════════ */
function populateDashboard() {
  if (!currentProfile) return;

  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim() || currentProfile.email;
  const initials = getInitials(fullName);
  const status   = currentProfile.status || 'reviewing';

  // Sidebar
  document.getElementById('sidebarName').textContent        = fullName;
  document.getElementById('sidebarEmail').textContent       = currentProfile.email || '';
  document.getElementById('sidebarAvatarText').textContent  = initials;

  // Profile header
  document.getElementById('profileName').textContent  = fullName;
  document.getElementById('avatarCircle').textContent = initials;
  document.getElementById('profileSub').textContent   =
    `${isAdmin ? 'HR Administrator' : 'Candidate'} · ${currentProfile.email}`;

  // Personal info
  document.getElementById('infoName').textContent        = fullName;
  document.getElementById('infoEmail').textContent       = currentProfile.email       || '—';
  document.getElementById('infoPhone').textContent       = currentProfile.phone       || '—';
  document.getElementById('infoId').textContent          = currentProfile.id_number   || '—';
  document.getElementById('infoLocation').textContent    = currentProfile.location    || '—';
  document.getElementById('infoNationality').textContent = currentProfile.nationality || '—';

  // Job info
  document.getElementById('infoJobTitle').textContent = currentProfile.job_title        || '—';
  document.getElementById('infoJobDept').textContent  = currentProfile.department       || '—';
  document.getElementById('infoJobRef').textContent   = currentProfile.job_ref          || '—';
  document.getElementById('infoJobDesc').textContent  = currentProfile.job_description  || '—';
  document.getElementById('infoJobDate').textContent  = currentProfile.created_at
    ? new Date(currentProfile.created_at).toLocaleDateString('en-ZA', { day:'numeric', month:'long', year:'numeric' })
    : '—';

  // Progress dates
  if (currentProfile.created_at) {
    const d = new Date(currentProfile.created_at)
      .toLocaleDateString('en-ZA', { day:'numeric', month:'short' });
    const el = document.getElementById('stepDate0');
    if (el) el.textContent = d;
  }

  applyStatus(status);
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
  Object.assign(currentProfile, updates);
  populateDashboard();
  document.getElementById('editPersonalForm').classList.add('hidden');
}

/* ═══════════════════════════════════════════
   JOB INFO — EDIT & SAVE (Admin)
═══════════════════════════════════════════ */
function toggleEditJob() {
  const form   = document.getElementById('editJobForm');
  const hidden = form.classList.contains('hidden');
  form.classList.toggle('hidden');
  if (hidden) {
    document.getElementById('editJobTitle').value = currentProfile.job_title       || '';
    document.getElementById('editJobRef').value   = currentProfile.job_ref         || '';
    document.getElementById('editJobDesc').value  = currentProfile.job_description || '';
    const deptEl = document.getElementById('editJobDept');
    if (currentProfile.department) {
      Array.from(deptEl.options).forEach(o => {
        o.selected = o.value === currentProfile.department;
      });
    }
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
  Object.assign(currentProfile, updates);
  populateDashboard();
  document.getElementById('editJobForm').classList.add('hidden');
}

/* ═══════════════════════════════════════════
   AVATAR & CV UPLOAD
═══════════════════════════════════════════ */
async function uploadAvatar(e) {
  const file = e.target.files[0];
  if (!file) return;
  const ext      = file.name.split('.').pop();
  const filePath = `avatars/${currentUser.id}.${ext}`;
  const { error } = await db.storage.from('avatars').upload(filePath, file, { upsert: true });
  if (error) {
    // Show locally
    const reader = new FileReader();
    reader.onload = ev => setAvatarImage(ev.target.result);
    reader.readAsDataURL(file);
    return;
  }
  const { data } = db.storage.from('avatars').getPublicUrl(filePath);
  if (data?.publicUrl) {
    setAvatarImage(data.publicUrl);
    await db.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', currentUser.id);
  }
}

function setAvatarImage(src) {
  document.getElementById('avatarCircle').innerHTML = `<img src="${src}" alt="Profile photo"/>`;
}

async function uploadCV(e) {
  const file = e.target.files[0];
  if (!file) return;
  const ext      = file.name.split('.').pop();
  const filePath = `cvs/${currentUser.id}.${ext}`;
  const { error } = await db.storage.from('cvs').upload(filePath, file, { upsert: true });
  if (!error) {
    const { data } = db.storage.from('cvs').getPublicUrl(filePath);
    if (data?.publicUrl) {
      await db.from('profiles').update({ cv_url: data.publicUrl }).eq('id', currentUser.id);
    }
  }
  document.getElementById('cvLabel').textContent = `✓ ${file.name} uploaded`;
}

/* ═══════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════ */
function showTab(id, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  if (el) el.classList.add('active');

  // Refresh on open
  if (id === 'bookings')   renderSlots();
  if (id === 'competency') renderDepts();
  if (id === 'apply')      renderVacancies();
  if (id === 'stats')      renderStats();
}

/* ═══════════════════════════════════════════
   ROLE BADGE
═══════════════════════════════════════════ */
function updateRoleBadge() {
  const badge = document.getElementById('roleBadge');
  badge.textContent = isAdmin ? 'ADMIN' : 'CANDIDATE';
  badge.className   = 'role-badge ' + (isAdmin ? 'admin' : 'candidate');
}

/* ═══════════════════════════════════════════
   STATUS CONFIG (7 stages)
═══════════════════════════════════════════ */
const statusConfig = {
  received:   { label: 'Application Received', cls: 'received',   fill: '0%',    stage: 0 },
  reviewing:  { label: 'Reviewing',            cls: 'reviewing',  fill: '16%',   stage: 1 },
  interview1: { label: '1st Interview',        cls: 'interview1', fill: '33%',   stage: 2 },
  assessment: { label: 'Assessment',           cls: 'assessment', fill: '50%',   stage: 3 },
  interview2: { label: '2nd Interview',        cls: 'interview2', fill: '66%',   stage: 4 },
  final:      { label: 'Final Assessment',     cls: 'final',      fill: '82%',   stage: 5 },
  offered:    { label: 'Offer Made',           cls: 'offered',    fill: '100%',  stage: 6 },
  rejected:   { label: 'Rejected',             cls: 'rejected',   fill: '82%',   stage: 5 }
};

const stepIcons = [
  'ti-inbox', 'ti-eye', 'ti-video',
  'ti-brain', 'ti-video', 'ti-writing', 'ti-file-check'
];

function applyStatus(s) {
  const cfg = statusConfig[s] || statusConfig.reviewing;

  // Dashboard badge
  const badge = document.getElementById('dashStatusBadge');
  if (badge) {
    badge.className = 'status-badge ' + cfg.cls;
    badge.innerHTML = `<i class="ti ti-circle-dot"></i>&nbsp;${cfg.label}`;
  }
  const txt = document.getElementById('dashStatusText');
  if (txt) txt.textContent = cfg.label;

  // Progress tab
  const stageLabel = document.getElementById('currentStageLabel');
  if (stageLabel) stageLabel.textContent = cfg.label;
  const fill = document.getElementById('progressFill');
  if (fill) fill.style.width = cfg.fill;

  document.querySelectorAll('.step-node').forEach((node, i) => {
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

async function setStatus(s) {
  applyStatus(s);
  if (!currentProfile) return;
  const { error } = await db.from('profiles').update({ status: s }).eq('id', currentProfile.id);
  if (error) alert('Could not update status: ' + error.message);
  else currentProfile.status = s;
}

/* ═══════════════════════════════════════════
   SCREENING — SAVE REPORT
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
    created_at:      new Date().toISOString()
  };

  const { error } = await db.from('screening').upsert(payload);
  if (error) { alert('Could not save: ' + error.message); return; }

  document.getElementById('rpt_title').textContent  = payload.job_title;
  document.getElementById('rpt_dept').textContent   = payload.department;
  document.getElementById('rpt_budget').textContent = payload.budget;
  document.getElementById('rpt_green').innerHTML    = payload.green_flags
    .split('\n').filter(Boolean).map(g => `<span class="tag green">✓ ${g.trim()}</span>`).join('');
  document.getElementById('rpt_red').innerHTML      = payload.red_flags
    .split('\n').filter(Boolean).map(r => `<span class="tag red">✕ ${r.trim()}</span>`).join('');
  document.getElementById('screeningReport').classList.remove('hidden');
}

/* ═══════════════════════════════════════════
   COMPETENCY — RENDER DEPARTMENTS
═══════════════════════════════════════════ */
function renderDepts() {
  const el = document.getElementById('deptList');
  if (!el) return;
  el.innerHTML = '';

  for (const [dept, jobs] of Object.entries(departmentsData)) {
    const block = document.createElement('div');
    block.className = 'dept-block';

    const jobRows = jobs.map(j => {
      const key      = `${dept}|${j}`;
      const files    = competencyFiles[key] || {};
      const safeD    = dept.replace(/'/g, "\\'");
      const safeJ    = j.replace(/'/g, "\\'");
      const pdfBadges = [
        files.framework
          ? `<a class="pdf-badge" href="${files.framework}" target="_blank"><i class="ti ti-file-text"></i> Framework</a>`
          : '',
        files.jd
          ? `<a class="pdf-badge" href="${files.jd}" target="_blank"><i class="ti ti-file-description"></i> JD</a>`
          : ''
      ].join('');

      const adminBtns = `
        <div class="job-actions admin-only">
          <button class="job-btn pdf" onclick="openCompPdfModal('${safeD}','${safeJ}')">
            <i class="ti ti-upload"></i> Docs
          </button>
          <button class="job-btn" onclick="editJob('${safeD}','${safeJ}')">
            <i class="ti ti-edit"></i> Edit
          </button>
          <button class="job-btn del" onclick="deleteJob('${safeD}','${safeJ}')">
            <i class="ti ti-trash"></i>
          </button>
        </div>`;

      return `
        <div class="job-item">
          <span class="job-name">
            <i class="ti ti-point-filled"></i>${j}
            ${pdfBadges}
          </span>
          ${adminBtns}
        </div>`;
    }).join('');

    block.innerHTML = `
      <div class="dept-header" onclick="toggleDept(this)">
        <h4>
          <i class="ti ti-building"></i>
          ${dept}
          <span class="dept-count">${jobs.length} roles</span>
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
  icon.classList.toggle('open');
}

/* ── ADD / EDIT / DELETE JOB ── */
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
}

function deleteJob(dept, job) {
  if (!confirm(`Remove "${job}" from ${dept}?`)) return;
  departmentsData[dept] = departmentsData[dept].filter(j => j !== job);
  renderDepts();
}

function editJob(dept, job) {
  const newName = prompt('Edit job title:', job);
  if (newName && newName.trim()) {
    const idx = departmentsData[dept].indexOf(job);
    if (idx !== -1) { departmentsData[dept][idx] = newName.trim(); renderDepts(); }
  }
}

/* ── COMPETENCY PDF UPLOAD ── */
function openCompPdfModal(dept, job) {
  currentCompJob = { dept, job };
  document.getElementById('compPdfJobTitle').textContent = job;
  document.getElementById('compFrameworkLabel').textContent = 'Click to upload competency framework';
  document.getElementById('compJdLabel').textContent        = 'Click to upload job description';

  const key   = `${dept}|${job}`;
  const files = competencyFiles[key] || {};
  const wrap  = document.getElementById('compUploadedFiles');
  wrap.innerHTML = '';
  if (files.framework) wrap.innerHTML += `<a class="pdf-badge" href="${files.framework}" target="_blank"><i class="ti ti-file-text"></i> Framework uploaded</a>`;
  if (files.jd)        wrap.innerHTML += `<a class="pdf-badge" href="${files.jd}" target="_blank"><i class="ti ti-file-description"></i> JD uploaded</a>`;

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
    // Local object URL fallback
    url = URL.createObjectURL(file);
  }

  if (!competencyFiles[key]) competencyFiles[key] = {};
  competencyFiles[key][type] = url;

  const labelId = type === 'framework' ? 'compFrameworkLabel' : 'compJdLabel';
  document.getElementById(labelId).textContent = `✓ ${file.name} uploaded`;

  const wrap = document.getElementById('compUploadedFiles');
  const label = type === 'framework' ? 'Framework' : 'JD';
  const icon  = type === 'framework' ? 'ti-file-text' : 'ti-file-description';
  wrap.innerHTML += `<a class="pdf-badge" href="${url}" target="_blank"><i class="ti ${icon}"></i> ${label} uploaded</a>`;

  renderDepts();
}

/* ═══════════════════════════════════════════
   ASSESSMENTS — BUILT-IN QUESTIONS
═══════════════════════════════════════════ */
const assessmentQuestions = [
  {
    q: 'Which of the following best describes RESTful API design principles?',
    opts: ['Stateful client-server communication','Stateless communication using standard HTTP methods','Requires WebSocket connections for all requests','Only works with JSON data formats'],
    correct: 1
  },
  {
    q: 'What does SOLID stand for in software engineering?',
    opts: ['A set of object-oriented design principles','A database management framework','A programming language specification','A testing methodology for agile teams'],
    correct: 0
  },
  {
    q: 'In agile development, what is the primary purpose of a sprint retrospective?',
    opts: ['To plan the next sprint backlog items','To review and improve team processes','To demo completed features to stakeholders','To assign tasks to individual developers'],
    correct: 1
  },
  {
    q: 'Which version control practice best supports code review and collaboration?',
    opts: ['Committing directly to the main branch','Using feature branches with pull requests','Deleting branches after each commit','Working in a single shared branch'],
    correct: 1
  },
  {
    q: 'What is the main advantage of containerisation (e.g. Docker)?',
    opts: ['Eliminates the need for unit testing','Consistent environments across development and production','Automatically writes and deploys code','Replaces version control systems entirely'],
    correct: 1
  }
];

let userAnswers = {};

function renderAssessment() {
  const panel = document.getElementById('questionsPanel');
  const title = document.getElementById('assessTitle');
  if (!panel) return;

  // Show uploaded assessments if any, otherwise built-in
  if (uploadedAssessments.length > 0 && !isAdmin) {
    const latest = uploadedAssessments[uploadedAssessments.length - 1];
    if (title) title.textContent = latest.name;
    panel.innerHTML = `
      <div class="card" style="text-align:center;padding:30px">
        <i class="ti ti-external-link" style="font-size:40px;color:var(--brand);display:block;margin-bottom:12px"></i>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:8px">${latest.name}</div>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Click below to open your assessment in a new tab. Once complete, your results will be submitted.</p>
        <a href="${latest.url}" target="_blank" class="btn btn-primary" style="display:inline-flex">
          <i class="ti ti-external-link"></i> Open Assessment
        </a>
      </div>`;
    return;
  }

  if (title) title.textContent = 'General Competency Assessment';
  panel.innerHTML = assessmentQuestions.map((item, qi) => `
    <div class="q-card">
      <div class="q-num">Question ${qi + 1} of ${assessmentQuestions.length}</div>
      <div class="q-text">${item.q}</div>
      <div class="q-options">
        ${item.opts.map((opt, oi) => `
          <label class="q-opt" id="opt_${qi}_${oi}">
            <input type="radio" name="q${qi}" value="${oi}" onchange="selectOpt(this,${qi},${oi})"/>
            ${opt}
          </label>`).join('')}
      </div>
    </div>`).join('') + `
    <button class="btn btn-primary btn-full" style="padding:13px;font-size:14px;justify-content:center;margin-top:4px"
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
  const score = Math.round((correct / assessmentQuestions.length) * 100);

  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();

  await db.from('assessment_results').upsert({
    user_id:      currentUser.id,
    candidate_name: fullName,
    score, correct,
    total:        assessmentQuestions.length,
    answers:      JSON.stringify(userAnswers),
    assessment_name: 'General Competency Assessment',
    submitted_at: new Date().toISOString()
  });

  document.getElementById('questionsPanel').innerHTML = `
    <div class="card" style="text-align:center;padding:40px">
      <i class="ti ti-circle-check" style="font-size:52px;color:var(--success);display:block;margin-bottom:14px"></i>
      <div style="font-size:20px;font-weight:600;color:var(--text-primary)">Assessment Submitted</div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:8px;line-height:1.6">
        Thank you. Your results are being reviewed by the hiring team.<br>
        <strong style="color:var(--brand)">Your score: ${score}%</strong>
      </div>
    </div>`;

  const badge = document.getElementById('assessBadge');
  if (badge) { badge.textContent = 'Completed'; badge.className = 'status-pill green'; }

  await loadAdminResults();
}

/* ── UPLOAD ASSESSMENT FILE (Admin) ── */
async function uploadAssessmentFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async ev => {
    const content = ev.target.result;
    const blob    = new Blob([content], { type: 'text/html' });
    const url     = URL.createObjectURL(blob);

    uploadedAssessments.push({ name: file.name.replace('.html',''), url, content });

    document.getElementById('assessUploadLabel').textContent = `✓ ${file.name} uploaded`;
    renderUploadedAssessmentsList();

    // Store reference in Supabase
    await db.from('uploaded_assessments').upsert({
      name:        file.name.replace('.html',''),
      uploaded_by: currentUser.id,
      uploaded_at: new Date().toISOString()
    }).catch(() => {});
  };
  reader.readAsText(file);
}

function renderUploadedAssessmentsList() {
  const el = document.getElementById('uploadedAssessmentsList');
  if (!el) return;
  if (uploadedAssessments.length === 0) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No assessments uploaded yet.</p>';
    return;
  }
  el.innerHTML = uploadedAssessments.map((a, i) => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:13px;color:var(--text-primary);display:flex;align-items:center;gap:8px">
        <i class="ti ti-file-code" style="color:var(--brand)"></i> ${a.name}
      </span>
      <div style="display:flex;gap:8px">
        <a href="${a.url}" target="_blank" class="btn btn-secondary" style="font-size:11px;padding:4px 10px">
          <i class="ti ti-external-link"></i> Preview
        </a>
        <button class="btn btn-danger" style="font-size:11px;padding:4px 10px"
          onclick="removeAssessment(${i})">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    </div>`).join('');
}

function removeAssessment(index) {
  uploadedAssessments.splice(index, 1);
  renderUploadedAssessmentsList();
}

/* ── ADMIN RESULTS PANEL ── */
async function loadAdminResults() {
  const el = document.getElementById('adminResultsList');
  if (!el) return;

  const { data, error } = await db
    .from('assessment_results')
    .select('*')
    .order('submitted_at', { ascending: false });

  if (error || !data || data.length === 0) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No results yet.</p>';
    return;
  }

  el.innerHTML = data.map(r => `
    <div class="card" style="margin-bottom:12px;padding:16px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--text-primary)">${r.candidate_name || 'Candidate'}</div>
          <div style="font-size:11px;color:var(--text-muted)">${r.assessment_name || 'Assessment'} · ${new Date(r.submitted_at).toLocaleDateString('en-ZA')}</div>
        </div>
        <div style="font-size:22px;font-weight:700;color:${r.score >= 70 ? 'var(--success)' : r.score >= 50 ? 'var(--warning)' : 'var(--danger)'}">${r.score}%</div>
      </div>
      <div class="score-bar"><div class="score-fill" style="width:${r.score}%"></div></div>
      <div style="margin-top:8px;font-size:12px;color:var(--text-muted)">${r.correct} / ${r.total} correct · ${getRecommendation(r.score)}</div>
    </div>`).join('');
}

function getRecommendation(score) {
  if (score >= 80) return '<span style="color:var(--success);font-weight:600">Strong candidate — recommend progressing</span>';
  if (score >= 60) return '<span style="color:var(--warning);font-weight:600">Moderate — recommend screening call</span>';
  return '<span style="color:var(--danger);font-weight:600">Below benchmark — review carefully</span>';
}

/* ═══════════════════════════════════════════
   APPLY TAB — VACANCIES
═══════════════════════════════════════════ */
async function renderVacancies() {
  // Load from Supabase
  const { data, error } = await db
    .from('vacancies')
    .select('*')
    .order('created_at', { ascending: false });

  vacanciesData = (error || !data) ? getDemoVacancies() : data;

  if (isAdmin) renderAdminVacancies();
  else         renderCandidateVacancies();
}

function getDemoVacancies() {
  return [
    {
      id: 'demo1', title: 'Financial Accountant', department: 'Finance',
      location: 'Cape Town', type: 'Full-time',
      description: 'Responsible for managing financial records, preparing reports, and ensuring compliance with accounting standards.',
      closing_date: '2025-08-15', posted: true,
      screening_questions: [
        { q: 'Do you have a BCom Accounting degree?', opts: ['Yes','No'], correct: 0 },
        { q: 'Years of experience in accounting?', opts: ['Less than 1','1–3 years','3–5 years','5+ years'], correct: 2 },
        { q: 'Are you proficient in Microsoft Excel?', opts: ['Yes','No'], correct: 0 }
      ]
    },
    {
      id: 'demo2', title: 'HR Business Partner', department: 'Human Capital',
      location: 'Cape Town', type: 'Full-time',
      description: 'Partner with business units to deliver strategic HR solutions including talent management, employee relations and performance management.',
      closing_date: '2025-08-30', posted: true,
      screening_questions: [
        { q: 'Do you have a degree in HR or related field?', opts: ['Yes','No'], correct: 0 },
        { q: 'Have you worked as an HRBP before?', opts: ['Yes, 3+ years','Yes, less than 3 years','No'], correct: 0 },
        { q: 'Are you familiar with the Labour Relations Act?', opts: ['Yes','Somewhat','No'], correct: 0 }
      ]
    }
  ];
}

/* ── CANDIDATE: vacancy cards ── */
function renderCandidateVacancies() {
  const grid = document.getElementById('vacancyList');
  if (!grid) return;

  const posted = vacanciesData.filter(v => v.posted);
  if (posted.length === 0) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:14px"><i class="ti ti-search" style="font-size:32px;display:block;margin-bottom:10px"></i>No vacancies available at the moment. Check back soon.</div>';
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
        <span class="vacancy-closing"></span>
        <button class="btn btn-primary" onclick="openApplyModal('${v.id}')">
          <i class="ti ti-send"></i> Apply Now
        </button>
      </div>
    </div>`).join('');
}

/* ── ADMIN: manage vacancies ── */
function renderAdminVacancies() {
  const el = document.getElementById('adminVacancyList');
  if (!el) return;

  if (vacanciesData.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No vacancies yet. Click "Add Vacancy" to create one.</div>';
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
          <!-- Posted toggle -->
          <label class="posted-toggle" onclick="togglePosted('${v.id}')">
            <div class="toggle-switch ${v.posted ? 'on' : ''}" id="toggle_${v.id}"></div>
            <span id="toggleLabel_${v.id}">${v.posted ? 'Posted' : 'Draft'}</span>
          </label>
          <button class="btn btn-secondary" style="font-size:12px" onclick="openScreeningQModal('${v.id}')">
            <i class="ti ti-help-circle"></i> Questions
          </button>
          <button class="btn btn-purple" style="font-size:12px" onclick="openApplicantListModal('${v.id}')">
            <i class="ti ti-users"></i> Lists
          </button>
          <button class="btn btn-danger" style="font-size:12px;padding:6px 10px" onclick="deleteVacancy('${v.id}')">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </div>
    </div>`).join('');
}

/* ── POSTED TOGGLE ── */
async function togglePosted(vacId) {
  const vac = vacanciesData.find(v => v.id === vacId);
  if (!vac) return;
  vac.posted = !vac.posted;

  const toggle = document.getElementById(`toggle_${vacId}`);
  const label  = document.getElementById(`toggleLabel_${vacId}`);
  if (toggle) toggle.classList.toggle('on', vac.posted);
  if (label)  label.textContent = vac.posted ? 'Posted' : 'Draft';

  if (!String(vacId).startsWith('demo')) {
    await db.from('vacancies').update({ posted: vac.posted }).eq('id', vacId);
  }
}

/* ── ADD VACANCY ── */
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

  const newVac = {
    id:           'local_' + Date.now(),
    title, department: dept,
    location:     loc, type, description: desc,
    closing_date: closing, posted: false,
    screening_questions: [],
    created_by:   currentUser.id,
    created_at:   new Date().toISOString()
  };

  // Save to Supabase
  const { data, error } = await db.from('vacancies').insert({
    title, department: dept, location: loc, type,
    description: desc, closing_date: closing,
    posted: false, screening_questions: JSON.stringify([]),
    created_by: currentUser.id, created_at: newVac.created_at
  }).select().single();

  if (!error && data) newVac.id = data.id;

  vacanciesData.unshift(newVac);
  renderAdminVacancies();
  closeModal('addVacancyModal');

  ['vacTitle','vacLocation','vacDesc','vacClosing'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

/* ── DELETE VACANCY ── */
async function deleteVacancy(vacId) {
  if (!confirm('Delete this vacancy?')) return;
  vacanciesData = vacanciesData.filter(v => v.id !== vacId);
  if (!String(vacId).startsWith('demo') && !String(vacId).startsWith('local')) {
    await db.from('vacancies').delete().eq('id', vacId);
  }
  renderAdminVacancies();
}

/* ═══════════════════════════════════════════
   SCREENING QUESTIONS MODAL
═══════════════════════════════════════════ */
function openScreeningQModal(vacId) {
  currentVacancyId = vacId;
  const vac = vacanciesData.find(v => v.id === vacId);
  if (!vac) return;
  document.getElementById('sqJobTitle').textContent = vac.title;
  renderSQList(vac.screening_questions || []);
  document.getElementById('screeningQModal').classList.add('open');
}

function renderSQList(questions) {
  const el = document.getElementById('sqList');
  el.innerHTML = questions.map((q, qi) => `
    <div class="sq-item" id="sqItem_${qi}">
      <div class="sq-num">Question ${qi + 1}</div>
      <div class="form-group" style="margin-bottom:10px">
        <input type="text" value="${escapeHtml(q.q || '')}" placeholder="Enter question..."
          onchange="updateSQQuestion(${qi}, this.value)" style="font-size:13px"/>
      </div>
      <div class="sq-options-builder" id="sqOpts_${qi}">
        ${(q.opts || ['','']).map((opt, oi) => `
          <div class="sq-option-row">
            <input type="radio" name="sqCorrect_${qi}" value="${oi}" class="sq-correct-radio"
              ${q.correct === oi ? 'checked' : ''}
              onchange="updateSQCorrect(${qi}, ${oi})"
              title="Mark as correct answer"/>
            <span class="sq-correct-label" style="width:50px">Correct</span>
            <input type="text" value="${escapeHtml(opt)}" placeholder="Option ${oi + 1}..."
              onchange="updateSQOption(${qi}, ${oi}, this.value)"/>
            ${q.opts.length > 2
              ? `<button class="job-btn del" onclick="removeSQOption(${qi},${oi})" style="padding:4px 8px"><i class="ti ti-x"></i></button>`
              : ''}
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-secondary" style="font-size:11px;padding:4px 10px"
          onclick="addSQOption(${qi})"><i class="ti ti-plus"></i> Add Option</button>
        <button class="btn btn-danger" style="font-size:11px;padding:4px 10px"
          onclick="removeSQQuestion(${qi})"><i class="ti ti-trash"></i> Remove</button>
      </div>
    </div>`).join('');
}

function getCurrentSQQuestions() {
  const vac = vacanciesData.find(v => v.id === currentVacancyId);
  return vac ? (vac.screening_questions || []) : [];
}

function addScreeningQuestion() {
  const vac = vacanciesData.find(v => v.id === currentVacancyId);
  if (!vac) return;
  if (!vac.screening_questions) vac.screening_questions = [];
  vac.screening_questions.push({ q: '', opts: ['', ''], correct: 0 });
  renderSQList(vac.screening_questions);
}

function updateSQQuestion(qi, val) {
  const qs = getCurrentSQQuestions();
  if (qs[qi]) qs[qi].q = val;
}

function updateSQOption(qi, oi, val) {
  const qs = getCurrentSQQuestions();
  if (qs[qi] && qs[qi].opts) qs[qi].opts[oi] = val;
}

function updateSQCorrect(qi, oi) {
  const qs = getCurrentSQQuestions();
  if (qs[qi]) qs[qi].correct = oi;
}

function addSQOption(qi) {
  const qs = getCurrentSQQuestions();
  if (qs[qi] && qs[qi].opts.length < 5) {
    qs[qi].opts.push('');
    renderSQList(qs);
  }
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
  const vac = vacanciesData.find(v => v.id === currentVacancyId);
  if (vac && vac.screening_questions) {
    vac.screening_questions.splice(qi, 1);
    renderSQList(vac.screening_questions);
  }
}

async function saveScreeningQuestions() {
  const vac = vacanciesData.find(v => v.id === currentVacancyId);
  if (!vac) return;

  if (!String(currentVacancyId).startsWith('demo') && !String(currentVacancyId).startsWith('local')) {
    await db.from('vacancies')
      .update({ screening_questions: JSON.stringify(vac.screening_questions) })
      .eq('id', currentVacancyId);
  }

  closeModal('screeningQModal');
  alert('Screening questions saved successfully.');
}

/* ═══════════════════════════════════════════
   APPLY MODAL (Candidate submits application)
═══════════════════════════════════════════ */
function openApplyModal(vacId) {
  currentVacancyId = vacId;
  const vac = vacanciesData.find(v => v.id === vacId);
  if (!vac) return;

  document.getElementById('applyJobTitle').textContent = vac.title;
  const questions = vac.screening_questions || [];
  const el = document.getElementById('applyQuestionsList');

  if (questions.length === 0) {
    el.innerHTML = `
      <div class="notice">
        <i class="ti ti-info-circle"></i>
        <span>No screening questions for this role. Click Submit to register your interest.</span>
      </div>`;
  } else {
    el.innerHTML = questions.map((q, qi) => `
      <div class="q-card">
        <div class="q-num">Question ${qi + 1} of ${questions.length}</div>
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
  }

  document.getElementById('applyModal').classList.add('open');
}

// Track candidate answers for apply
let applyAnswers = {};

function selectApplyOpt(qi, oi) {
  const vac = vacanciesData.find(v => v.id === currentVacancyId);
  if (!vac) return;
  const questions = vac.screening_questions || [];
  questions[qi]?.opts.forEach((_, i) => {
    const el = document.getElementById(`applyOpt_${qi}_${i}`);
    if (el) el.classList.remove('selected');
  });
  const sel = document.getElementById(`applyOpt_${qi}_${oi}`);
  if (sel) sel.classList.add('selected');
  applyAnswers[qi] = oi;
}

async function submitApplication() {
  const vac = vacanciesData.find(v => v.id === currentVacancyId);
  if (!vac) return;

  const questions = vac.screening_questions || [];
  if (questions.length > 0 && Object.keys(applyAnswers).length < questions.length) {
    alert('Please answer all questions before submitting.');
    return;
  }

  // Calculate fit score
  let correct = 0;
  questions.forEach((q, qi) => {
    if (applyAnswers[qi] === q.correct) correct++;
  });

  const score    = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 100;
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();

  const appData = {
    vacancy_id:     currentVacancyId,
    vacancy_title:  vac.title,
    user_id:        currentUser.id,
    candidate_name: fullName,
    candidate_email: currentUser.email,
    answers:        JSON.stringify(applyAnswers),
    score,
    submitted_at:   new Date().toISOString()
  };

  const { error } = await db.from('applications').upsert(appData);
  if (error) console.warn('Application save error:', error.message);

  applicationsData.push(appData);
  applyAnswers = {};
  closeModal('applyModal');

  alert(`Application submitted successfully!\nYour fit score: ${score >= 70 ? 'Good Fit 🟢' : score >= 40 ? 'Moderate Fit 🟡' : 'Under Review 🔴'}`);
}

/* ═══════════════════════════════════════════
   APPLICANT LISTS MODAL (Admin)
═══════════════════════════════════════════ */
async function openApplicantListModal(vacId) {
  currentVacancyId = vacId;
  const vac = vacanciesData.find(v => v.id === vacId);
  if (!vac) return;

  document.getElementById('alJobTitle').textContent = vac.title;

  // Load applications from Supabase
  let apps = [];
  const { data, error } = await db
    .from('applications')
    .select('*')
    .eq('vacancy_id', vacId)
    .order('score', { ascending: false });

  apps = (error || !data) ? applicationsData.filter(a => a.vacancy_id === vacId) : data;

  const good     = apps.filter(a => a.score >= 70);
  const moderate = apps.filter(a => a.score >= 40 && a.score < 70);
  const poor     = apps.filter(a => a.score < 40);

  const renderChips = arr => arr.length === 0
    ? '<div style="font-size:12px;color:var(--text-muted);padding:8px 0">No candidates yet</div>'
    : arr.map(a => `
      <div class="applicant-chip">
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

/* ═══════════════════════════════════════════
   BOOKINGS
═══════════════════════════════════════════ */
async function renderSlots() {
  const grid = document.getElementById('slotsGrid');
  if (!grid) return;

  const { data, error } = await db
    .from('bookings').select('*')
    .order('slot_date', { ascending: true })
    .order('slot_time', { ascending: true });

  slotsData = (error || !data || data.length === 0) ? getDemoSlots() : data;

  grid.innerHTML = '';

  slotsData.forEach(slot => {
    const dateObj      = new Date(`${slot.slot_date}T${slot.slot_time}`);
    const dateStr      = dateObj.toLocaleDateString('en-ZA', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
    const myEmail      = currentUser?.email;
    const isMyBooking  = slot.booked_by_email === myEmail;
    const isOther      = slot.booked_by_email && !isMyBooking;

    let cls        = 'slot-card available';
    let statusHtml = '<span class="slot-status available">Available</span>';
    let extraHtml  = '';
    let actionHtml = '';

    if (isMyBooking) {
      cls        = 'slot-card booked-mine';
      statusHtml = '<span class="slot-status mine">Your Booking</span>';
      actionHtml = `<div style="margin-top:10px">
        <button class="btn btn-danger" style="width:100%;font-size:11px;padding:5px;justify-content:center"
          onclick="cancelSlot('${slot.id}')"><i class="ti ti-x"></i> Cancel</button></div>`;
    } else if (isOther && isAdmin) {
      cls        = 'slot-card booked-admin';
      statusHtml = '<span class="slot-status admin-view">Booked</span>';
      extraHtml  = `<div class="slot-candidate"><i class="ti ti-user" style="font-size:11px"></i> ${slot.booked_by_name || slot.booked_by_email}</div>`;
    } else if (isOther) {
      cls        = 'slot-card booked-other';
      statusHtml = '<span class="slot-status booked">Booked</span>';
    }

    if (!slot.booked_by_email && !isAdmin) {
      actionHtml = `<div style="margin-top:10px">
        <button class="btn btn-primary" style="width:100%;font-size:11px;padding:5px;justify-content:center"
          onclick="bookSlot('${slot.id}')"><i class="ti ti-calendar-plus"></i> Book</button></div>`;
    }

    grid.innerHTML += `
      <div class="${cls}">
        <div class="slot-date">${dateStr}</div>
        <div class="slot-time">${slot.slot_time.slice(0,5)}</div>
        ${statusHtml}${extraHtml}${actionHtml}
      </div>`;
  });
}

function getDemoSlots() {
  return [
    { id:'ds1', slot_date:'2025-07-07', slot_time:'09:00:00', booked_by_email:null },
    { id:'ds2', slot_date:'2025-07-07', slot_time:'10:00:00', booked_by_email:null },
    { id:'ds3', slot_date:'2025-07-07', slot_time:'11:00:00', booked_by_email:null },
    { id:'ds4', slot_date:'2025-07-08', slot_time:'09:00:00', booked_by_email:null },
    { id:'ds5', slot_date:'2025-07-08', slot_time:'10:30:00', booked_by_email:null },
    { id:'ds6', slot_date:'2025-07-08', slot_time:'14:00:00', booked_by_email:null },
    { id:'ds7', slot_date:'2025-07-09', slot_time:'09:30:00', booked_by_email:null },
    { id:'ds8', slot_date:'2025-07-09', slot_time:'11:00:00', booked_by_email:null },
    { id:'ds9', slot_date:'2025-07-09', slot_time:'15:00:00', booked_by_email:null }
  ];
}

async function bookSlot(slotId) {
  if (!currentUser) return;
  const fullName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();

  if (String(slotId).startsWith('ds')) {
    const slot = slotsData.find(s => s.id === slotId);
    if (slot) { slot.booked_by_email = currentUser.email; slot.booked_by_name = fullName; }
    renderSlots(); return;
  }
  await db.from('bookings').update({
    booked_by_email: currentUser.email,
    booked_by_name:  fullName,
    booked_at:       new Date().toISOString()
  }).eq('id', slotId).is('booked_by_email', null);
  renderSlots();
}

async function cancelSlot(slotId) {
  if (String(slotId).startsWith('ds')) {
    const slot = slotsData.find(s => s.id === slotId);
    if (slot) { slot.booked_by_email = null; slot.booked_by_name = null; }
    renderSlots(); return;
  }
  await db.from('bookings').update({
    booked_by_email: null, booked_by_name: null, booked_at: null
  }).eq('id', slotId).eq('booked_by_email', currentUser.email);
  renderSlots();
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
    slotsData.push({ id: 'ds' + Date.now(), slot_date: date, slot_time: time + ':00', booked_by_email: null });
    slotsData.sort((a,b) => (a.slot_date + a.slot_time).localeCompare(b.slot_date + b.slot_time));
  }

  closeModal('addSlotModal');
  renderSlots();
}

/* ═══════════════════════════════════════════
   STATS TAB
═══════════════════════════════════════════ */
async function renderStats() {
  const el = document.getElementById('statsPanel');
  if (!el) return;

  // Load real data
  const [profRes, vacRes, appRes, bookRes] = await Promise.all([
    db.from('profiles').select('id, status, created_at, role'),
    db.from('vacancies').select('id, posted, created_at'),
    db.from('applications').select('id, score, submitted_at'),
    db.from('bookings').select('id, booked_by_email, slot_date')
  ]);

  const profiles  = profRes.data  || [];
  const vacancies = vacRes.data   || [];
  const apps      = appRes.data   || [];
  const bookings  = bookRes.data  || [];

  const candidates   = profiles.filter(p => p.role !== 'admin');
  const postedJobs   = vacancies.filter(v => v.posted);
  const bookedSlots  = bookings.filter(b => b.booked_by_email);

  // Stage counts
  const stageCounts = {};
  Object.keys(statusConfig).forEach(k => { stageCounts[k] = 0; });
  candidates.forEach(c => { if (stageCounts[c.status] !== undefined) stageCounts[c.status]++; });

  // Fit distribution
  const goodFit     = apps.filter(a => a.score >= 70).length;
  const moderateFit = apps.filter(a => a.score >= 40 && a.score < 70).length;
  const poorFit     = apps.filter(a => a.score < 40).length;

  // Bar data for pipeline
  const stageLabels = ['Received','Reviewing','1st Int.','Assessment','2nd Int.','Final','Offered'];
  const stageKeys   = ['received','reviewing','interview1','assessment','interview2','final','offered'];
  const stageVals   = stageKeys.map(k => stageCounts[k] || 0);
  const maxVal      = Math.max(...stageVals, 1);

  const barColors = [
    'var(--brand)', 'var(--accent-purple)', 'var(--success)',
    'var(--accent-yellow)', 'var(--success)', 'var(--accent-green)', 'var(--warning)'
  ];

  el.innerHTML = `
    <!-- KPI Cards -->
    <div class="stats-grid" id="statsDownloadTarget">
      <div class="stat-card brand-accent">
        <i class="ti ti-users s-icon"></i>
        <div class="s-label">Total Applicants</div>
        <div class="s-value">${candidates.length || apps.length || 0}</div>
        <div class="s-sub">Registered candidates</div>
      </div>
      <div class="stat-card purple-accent">
        <i class="ti ti-briefcase s-icon"></i>
        <div class="s-label">Active Vacancies</div>
        <div class="s-value">${postedJobs.length || getDemoVacancies().filter(v=>v.posted).length}</div>
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
        <div class="s-label">Good Fit Applicants</div>
        <div class="s-value">${goodFit}</div>
        <div class="s-sub">Score ≥ 70%</div>
      </div>
    </div>

    <!-- Charts row -->
    <div class="stats-chart-row">

      <!-- Pipeline bar chart -->
      <div class="chart-card">
        <h4><i class="ti ti-chart-bar" style="color:var(--brand);margin-right:6px"></i>Recruitment Pipeline</h4>
        <div class="bar-chart">
          ${stageVals.map((val, i) => `
            <div class="bar-col">
              <div class="bar-val">${val}</div>
              <div class="bar" style="height:${Math.round((val/maxVal)*100)}%;background:${barColors[i]}"></div>
              <div class="bar-label">${stageLabels[i]}</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Fit distribution -->
      <div class="chart-card">
        <h4><i class="ti ti-chart-pie" style="color:var(--accent-purple);margin-right:6px"></i>Applicant Fit Distribution</h4>
        <div class="donut-wrap">
          <svg width="110" height="110" viewBox="0 0 110 110">
            ${buildDonutPaths(goodFit, moderateFit, poorFit)}
          </svg>
          <div class="donut-legend">
            <div class="legend-item">
              <div class="legend-dot" style="background:var(--success)"></div>
              Good Fit — <strong>${goodFit}</strong>
            </div>
            <div class="legend-item">
              <div class="legend-dot" style="background:var(--accent-yellow)"></div>
              Moderate — <strong>${moderateFit}</strong>
            </div>
            <div class="legend-item">
              <div class="legend-dot" style="background:var(--danger)"></div>
              Not a Fit — <strong>${poorFit}</strong>
            </div>
            <div class="legend-item" style="margin-top:4px;border-top:1px solid var(--border);padding-top:6px">
              <div class="legend-dot" style="background:var(--text-muted)"></div>
              Total — <strong>${apps.length}</strong>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- Stage detail table -->
    <div class="chart-card">
      <h4><i class="ti ti-table" style="color:var(--brand-dark);margin-right:6px"></i>Stage Breakdown</h4>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:2px solid var(--border)">
            <th style="text-align:left;padding:8px 0;color:var(--text-muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Stage</th>
            <th style="text-align:right;padding:8px 0;color:var(--text-muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Candidates</th>
            <th style="text-align:right;padding:8px 0;color:var(--text-muted);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px">% of Total</th>
          </tr>
        </thead>
        <tbody>
          ${stageKeys.map((k,i) => `
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:9px 0;color:var(--text-primary);display:flex;align-items:center;gap:8px">
                <div style="width:10px;height:10px;border-radius:50%;background:${barColors[i]};flex-shrink:0"></div>
                ${stageLabels[i]}
              </td>
              <td style="text-align:right;font-weight:600;color:var(--text-primary)">${stageCounts[k] || 0}</td>
              <td style="text-align:right;color:var(--text-muted)">${candidates.length > 0 ? Math.round(((stageCounts[k]||0)/candidates.length)*100) : 0}%</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ── DONUT SVG helper ── */
function buildDonutPaths(good, moderate, poor) {
  const total = good + moderate + poor;
  if (total === 0) {
    return `<circle cx="55" cy="55" r="40" fill="none" stroke="var(--border)" stroke-width="18"/>
            <text x="55" y="60" text-anchor="middle" font-size="12" fill="var(--text-muted)">0</text>`;
  }

  const cx = 55, cy = 55, r = 40;
  const circumference = 2 * Math.PI * r;

  const segments = [
    { count: good,     color: 'var(--success)' },
    { count: moderate, color: 'var(--accent-yellow)' },
    { count: poor,     color: 'var(--danger)' }
  ].filter(s => s.count > 0);

  let offset = 0;
  const paths = segments.map(seg => {
    const pct  = seg.count / total;
    const dash = pct * circumference;
    const gap  = circumference - dash;
    const path = `<circle cx="${cx}" cy="${cy}" r="${r}"
      fill="none" stroke="${seg.color}" stroke-width="18"
      stroke-dasharray="${dash} ${gap}"
      stroke-dashoffset="${-offset}"
      style="transform-origin:${cx}px ${cy}px;transform:rotate(-90deg)"
    />`;
    offset += dash;
    return path;
  }).join('');

  return paths + `<text x="${cx}" y="${cy+5}" text-anchor="middle"
    font-size="14" font-weight="700" fill="var(--text-primary)">${total}</text>`;
}

/* ── DOWNLOAD STATS AS IMAGE ── */
async function downloadStatsImage() {
  const el = document.getElementById('statsDownloadTarget') || document.getElementById('statsPanel');
  if (!el) return;

  try {
    // Use html2canvas if available, otherwise prompt
    if (typeof html2canvas !== 'undefined') {
      const canvas = await html2canvas(el, { backgroundColor: '#f4f8fc', scale: 2 });
      const link   = document.createElement('a');
      link.download = `Communicare_Stats_${new Date().toISOString().slice(0,10)}.png`;
      link.href    = canvas.toDataURL('image/png');
      link.click();
    } else {
      alert('To enable image download, add this to your index.html <head>:\n\n<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>');
    }
  } catch (err) {
    alert('Download failed: ' + err.message);
  }
}

/* ═══════════════════════════════════════════
   MODALS
═══════════════════════════════════════════ */
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
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
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', { day:'numeric', month:'short', year:'numeric' });
}

function showAuthMessage(msg, type) {
  const el = document.getElementById('authMessage');
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

/* ═══════════════════════════════════════════
   SUPABASE — NEW TABLES TO ADD
   Run these in your Supabase SQL editor
   in addition to the previous tables
   ─────────────────────────────────────────

   CREATE TABLE vacancies (
     id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     title               text NOT NULL,
     department          text,
     location            text,
     type                text DEFAULT 'Full-time',
     description         text,
     closing_date        date,
     posted              boolean DEFAULT false,
     screening_questions text,
     created_by          uuid REFERENCES auth.users(id),
     created_at          timestamptz DEFAULT now()
   );

   CREATE TABLE applications (
     id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     vacancy_id       text,
     vacancy_title    text,
     user_id          uuid REFERENCES auth.users(id),
     candidate_name   text,
     candidate_email  text,
     answers          text,
     score            int DEFAULT 0,
     submitted_at     timestamptz DEFAULT now()
   );

   CREATE TABLE assessment_results (
     id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id          uuid REFERENCES auth.users(id),
     candidate_name   text,
     assessment_name  text,
     score            int,
     correct          int,
     total            int,
     answers          text,
     submitted_at     timestamptz DEFAULT now()
   );

   CREATE TABLE uploaded_assessments (
     id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name         text,
     uploaded_by  uuid REFERENCES auth.users(id),
     uploaded_at  timestamptz DEFAULT now()
   );

   -- Enable RLS
   ALTER TABLE vacancies           ENABLE ROW LEVEL SECURITY;
   ALTER TABLE applications        ENABLE ROW LEVEL SECURITY;
   ALTER TABLE assessment_results  ENABLE ROW LEVEL SECURITY;
   ALTER TABLE uploaded_assessments ENABLE ROW LEVEL SECURITY;

   -- Vacancies: everyone can read posted ones
   CREATE POLICY "Read vacancies" ON vacancies
     FOR SELECT USING (true);
   CREATE POLICY "Manage vacancies" ON vacancies
     FOR ALL USING (auth.uid() IS NOT NULL);

   -- Applications: users see their own, admins see all
   CREATE POLICY "Own applications" ON applications
     FOR ALL USING (auth.uid() = user_id OR auth.uid() IS NOT NULL);

   -- Assessment results: own only for candidate, all for admin
   CREATE POLICY "Assessment results" ON assessment_results
     FOR ALL USING (auth.uid() IS NOT NULL);

   -- Also add to index.html <head> for stats download:
   -- <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>

═══════════════════════════════════════════ */