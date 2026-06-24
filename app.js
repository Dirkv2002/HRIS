/* ═══════════════════════════════════════════
   COMMUNICARE HRIS — app.js
═══════════════════════════════════════════ */
const SUPABASE_URL  = 'https://llryoespqzykaqawhwob.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxscnlvZXNwcXp5a2FxYXdod29iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0ODg3MTcsImV4cCI6MjA5NjA2NDcxN30.P5tL7TA-VB9EkCSThwE2jIExxya8VYvs2SjU9pCrmQY';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

const ROLE_PREFIXES = { '246810':'admin', '654321':'manager', '123456':'candidate' };
function detectRoleFromPassword(pw) { for (const [p,r] of Object.entries(ROLE_PREFIXES)) { if (pw.startsWith(p)) return r; } return null; }

/* ── STATE ── */
let currentUser=null, currentProfile=null, userRole='candidate';
let slotsData=[], vacanciesData=[], competencyFiles={};
let currentVacancyId=null, currentCompJob=null, pendingOnboardingSlotId=null;
let userAnswers={}, applyAnswers={}, applyCVFile=null;
let allAvailability=[], myAvailability=new Set(), shortlistDraft={};
let pendingUploadDocFileObj=null, pendingAssignDocId=null;
let pendingAdminAssessFile=null, pendingAdminAssessTarget=null;
let currentSignDocId=null, currentSignAssigneeId=null;
let _sigCanvas=null, _sigCtx=null, _sigDrawing=false, _sigLastX=0, _sigLastY=0;
let _usingDrawnSig=true, _currentSigMode='draw';
let currentCalVacancyId=null;
let teamColours=['#00aeef','#9a258f','#b2d33e','#faa61a','#ef4444','#8b5cf6','#06b6d4','#f97316'];

const departmentsData = {
  'Human Capital':['HR Business Partner','Talent Acquisition Specialist','Learning & Development Manager','Compensation & Benefits Analyst','Employee Relations Officer'],
  'Marketing and Communications':['Brand Manager','Digital Marketing Specialist','Content Strategist','PR Coordinator','Social Media Manager'],
  'Information Technology':['Software Engineer','Systems Administrator','Data Analyst','Cybersecurity Specialist','IT Project Manager','DevOps Engineer'],
  'Asset Management':['Portfolio Manager','Asset Analyst','Risk Officer','Investment Associate','Fund Accountant'],
  'Finance':['Financial Accountant','Management Accountant','Treasury Analyst','Accounts Payable Clerk','Finance Manager'],
  'Property Development and Investments':['Property Development Manager','Leasing Consultant','Valuations Analyst','Project Manager','Property Administrator'],
  'Facilities Management':['Facilities Manager','Maintenance Coordinator','Health & Safety Officer','Cleaning Supervisor','Security Manager']
};

/* ══════════════════════════════════════════
   BOOT
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const pwInput = document.getElementById('signupPassword');
  if (pwInput) {
    pwInput.addEventListener('input', () => {
      const role = detectRoleFromPassword(pwInput.value);
      const preview=document.getElementById('signupRolePreview');
      const badge=document.getElementById('signupRoleBadge');
      const mgrDept=document.getElementById('signupDeptGroupManager');
      const adminDept=document.getElementById('signupDeptGroupAdmin');
      if (role) {
        preview.style.display='block';
        badge.textContent=role.toUpperCase(); badge.className='role-badge '+role;
        if (mgrDept)   mgrDept.style.display  =role==='manager'?'block':'none';
        if (adminDept) adminDept.style.display =role==='admin'  ?'block':'none';
      } else {
        preview.style.display='none';
        if (mgrDept)   mgrDept.style.display='none';
        if (adminDept) adminDept.style.display='none';
      }
    });
  }
  db.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) { currentUser=session.user; await loadProfile(currentUser.id); showApp(); }
    else { currentUser=null; currentProfile=null; showAuth(); }
  });
});

/* ══════════════════════════════════════════
   AUTH
══════════════════════════════════════════ */
function showAuth() { document.getElementById('authScreen').classList.remove('hidden'); document.getElementById('appScreen').classList.add('hidden'); document.body.className=''; }
function showApp() {
  document.getElementById('authScreen').classList.add('hidden'); document.getElementById('appScreen').classList.remove('hidden');
  buildSidebar(); populateDashboard(); renderDepts(); renderVacancies(); renderScreeningDepts(); showDefaultTab();
}
function switchAuthTab(tab) { document.getElementById('loginForm').classList.toggle('hidden',tab!=='login'); document.getElementById('signupForm').classList.toggle('hidden',tab!=='signup'); document.getElementById('tabLogin').classList.toggle('active',tab==='login'); document.getElementById('tabSignup').classList.toggle('active',tab==='signup'); clearAuthMessage(); }

async function handleLogin(e) {
  e.preventDefault();
  const btn=document.getElementById('loginBtn'); setButtonLoading(btn,true);
  const {error}=await db.auth.signInWithPassword({email:document.getElementById('loginEmail').value.trim(),password:document.getElementById('loginPassword').value});
  setButtonLoading(btn,false,'<i class="ti ti-login"></i> Sign In');
  if(error) showAuthMessage(error.message,'error');
}

async function handleSignup(e) {
  e.preventDefault();
  const firstName=document.getElementById('signupFirst').value.trim();
  const lastName=document.getElementById('signupLast').value.trim();
  const email=document.getElementById('signupEmail').value.trim();
  const password=document.getElementById('signupPassword').value;
  const btn=document.getElementById('signupBtn');
  if(password.length<6){showAuthMessage('Password must be at least 6 characters.','error');return;}
  const role=detectRoleFromPassword(password);
  if(!role){showAuthMessage('Password prefix does not match any role. Use 246810=Admin, 654321=Manager, 123456=Candidate.','error');return;}
  const dept=role==='manager'?(document.getElementById('signupDept')?.value||''):role==='admin'?(document.getElementById('signupDeptAdmin')?.value||')':'';
  if((role==='manager'||role==='admin')&&!dept){showAuthMessage('Please select your department.','error');return;}
  setButtonLoading(btn,true);
  const {data,error}=await db.auth.signUp({email,password,options:{data:{first_name:firstName,last_name:lastName,role,department:dept}}});
  if(error){setButtonLoading(btn,false,'<i class="ti ti-user-plus"></i> Create Account');showAuthMessage(error.message,'error');return;}
  if(data.user) await db.from('profiles').upsert({id:data.user.id,email,first_name:firstName,last_name:lastName,role,department:dept,status:'reviewing',created_at:new Date().toISOString()});
  setButtonLoading(btn,false,'<i class="ti ti-user-plus"></i> Create Account');
  showAuthMessage('Account created! You can now sign in.','success');
}

async function handleLogout(){await db.auth.signOut();}
async function showForgotPassword(){const email=prompt('Enter your email:');if(!email)return;const{error}=await db.auth.resetPasswordForEmail(email,{redirectTo:'https://dirkv2002.github.io/HRIS/'});alert(error?'Error: '+error.message:'Reset email sent!');}

/* ══════════════════════════════════════════
   PROFILE
══════════════════════════════════════════ */
async function loadProfile(userId) {
  const{data,error}=await db.from('profiles').select('*').eq('id',userId).single();
  if(error||!data){const meta=currentUser.user_metadata||{};currentProfile={id:userId,email:currentUser.email,first_name:meta.first_name||'',last_name:meta.last_name||'',role:meta.role||'candidate',department:meta.department||'',status:'reviewing'};await db.from('profiles').upsert({...currentProfile,created_at:new Date().toISOString()});}
  else currentProfile=data;
  userRole=currentProfile.role||'candidate';
  document.body.className=userRole+'-mode';
  updateRoleBadge();
}
async function reloadProfile(){const{data}=await db.from('profiles').select('*').eq('id',currentUser.id).single();if(data)currentProfile=data;}

/* ══════════════════════════════════════════
   SIDEBAR / NAV
══════════════════════════════════════════ */
const navConfig={
  admin:[{section:'Main'},{id:'dashboard',icon:'ti-layout-dashboard',label:'Dashboard'},{section:'Recruitment'},{id:'manage',icon:'ti-settings',label:'Manage Vacancies'},{id:'screening',icon:'ti-clipboard-list',label:'Screening'},{id:'competency',icon:'ti-folder-open',label:'Competency'},{id:'assessments',icon:'ti-brain',label:'Assessments'},{id:'progress',icon:'ti-timeline',label:'Progress'},{id:'bookings',icon:'ti-calendar-event',label:'Bookings'},{section:'Documents'},{id:'sign',icon:'ti-signature',label:'Sign'},{section:'Insights'},{id:'stats',icon:'ti-chart-bar',label:'Stats'}],
  manager:[{section:'Main'},{id:'dashboard',icon:'ti-layout-dashboard',label:'Dashboard'},{section:'HR Tools'},{id:'manager-apply',icon:'ti-star',label:'Shortlists'},{id:'screening',icon:'ti-clipboard-list',label:'Screening'},{id:'competency',icon:'ti-folder-open',label:'Competency'},{section:'Bookings'},{id:'bookings',icon:'ti-calendar-event',label:'Bookings'},{section:'Documents'},{id:'sign',icon:'ti-signature',label:'Sign'}],
  candidate:[{section:'Main'},{id:'dashboard',icon:'ti-layout-dashboard',label:'Dashboard'},{section:'Recruitment'},{id:'apply',icon:'ti-send',label:'Apply'},{id:'assessments',icon:'ti-brain',label:'Assessments'},{id:'progress',icon:'ti-timeline',label:'Progress'},{id:'bookings',icon:'ti-calendar-event',label:'Bookings'}]
};

function buildSidebar(){
  const nav=document.getElementById('sidebarNav');
  const items=navConfig[userRole]||navConfig.candidate;
  nav.innerHTML='';
  items.forEach(item=>{
    if(item.section){const sec=document.createElement('div');sec.className='nav-section';sec.textContent=item.section;nav.appendChild(sec);}
    else{const el=document.createElement('div');el.className='nav-item';el.id='nav-'+item.id;el.innerHTML=`<i class="ti ${item.icon}"></i> ${item.label}`;el.addEventListener('click',()=>showTab(item.id,el));nav.appendChild(el);}
  });
}

function showDefaultTab(){const first=(navConfig[userRole]||navConfig.candidate).find(i=>i.id);if(first){const el=document.getElementById('nav-'+first.id);if(el)showTab(first.id,el);}}

function showTab(id,el){
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const tab=document.getElementById('tab-'+id);if(tab)tab.classList.add('active');if(el)el.classList.add('active');
  if(id==='dashboard')    populateDashboard();
  if(id==='bookings')     renderBookingTabs();
  if(id==='competency')   renderDepts();
  if(id==='apply')        renderVacancies();
  if(id==='manager-apply') renderManagerShortlists();
  if(id==='stats')        renderStats();
  if(id==='progress')     renderProgress();
  if(id==='manage')       renderAdminVacancies();
  if(id==='screening')    renderScreeningDepts();
  if(id==='sign')         renderSignTab();
  if(id==='assessments')  renderAssessmentsTab();
}

function updateRoleBadge(){const badge=document.getElementById('roleBadge');const labels={admin:'ADMIN',manager:'MANAGER',candidate:'CANDIDATE'};badge.textContent=labels[userRole]||'CANDIDATE';badge.className='role-badge '+userRole;}

/* ══════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════ */
function populateDashboard(){
  if(!currentProfile)return;
  const fullName=`${currentProfile.first_name} ${currentProfile.last_name}`.trim()||currentProfile.email;
  const initials=getInitials(fullName);
  document.getElementById('sidebarName').textContent=fullName;
  document.getElementById('sidebarEmail').textContent=currentProfile.email||'';
  document.getElementById('profileName').textContent=fullName;
  document.getElementById('profileSub').textContent=`${userRole==='admin'?'HR Administrator':userRole==='manager'?'Manager':'Candidate'} · ${currentProfile.email}`;
  document.getElementById('infoName').textContent=fullName;
  document.getElementById('infoEmail').textContent=currentProfile.email||'—';
  document.getElementById('infoPhone').textContent=currentProfile.phone||'—';
  document.getElementById('infoId').textContent=currentProfile.id_number||'—';
  document.getElementById('infoLocation').textContent=currentProfile.location||'—';
  document.getElementById('infoNationality').textContent=currentProfile.nationality||'—';
  if(currentProfile.avatar_url){setAvatarImage(currentProfile.avatar_url+'?t='+Date.now());}
  else{const c=document.getElementById('avatarCircle');const s=document.getElementById('sidebarAvatarText');if(c)c.textContent=initials;if(s)s.textContent=initials;}
  const statusWrap=document.getElementById('dashStatusBadge');
  if(statusWrap){if(userRole==='candidate'){statusWrap.style.display='';applyStatus(currentProfile.status||'reviewing');checkForStatusChangeNotification(currentProfile.status||'reviewing');}else statusWrap.style.display='none';}
  const cvSection=document.getElementById('cvUploadSection');if(cvSection)cvSection.style.display=userRole==='candidate'?'block':'none';
  const stepDate0=document.getElementById('stepDate0');if(stepDate0&&currentProfile.created_at)stepDate0.textContent=new Date(currentProfile.created_at).toLocaleDateString('en-ZA',{day:'numeric',month:'short'});
  renderDashboardRightCard();
}

async function renderDashboardRightCard(){
  const card=document.getElementById('dashboardRightCard');if(!card)return;
  if(userRole==='candidate'){
    card.innerHTML=`<div class="card-title accent-blue"><i class="ti ti-briefcase"></i> Job Information</div>
      <div class="info-row"><span class="key">Job Title</span><span class="val">${escapeHtml(currentProfile.job_title||'—')}</span></div>
      <div class="info-row"><span class="key">Department</span><span class="val">${escapeHtml(currentProfile.department||'—')}</span></div>
      <div class="info-row"><span class="key">Reference No.</span><span class="val">${escapeHtml(currentProfile.job_ref||'—')}</span></div>
      <div class="info-row"><span class="key">Date Joined</span><span class="val">${currentProfile.created_at?new Date(currentProfile.created_at).toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'}):'—'}</span></div>
      <div style="margin-top:10px"><div class="info-label" style="margin-bottom:6px">Job Description</div><div style="font-size:13px;color:var(--text-secondary);line-height:1.7">${escapeHtml(currentProfile.job_description||'—')}</div></div>`;
  } else {
    const deptJobs=currentProfile.department?(departmentsData[currentProfile.department]||[]):getAllJobTitles();
    card.innerHTML=`<div class="card-title accent-blue"><i class="ti ti-briefcase"></i> Job Information</div>
      <div class="info-row"><span class="key">Job Title</span><span class="val">${escapeHtml(currentProfile.job_title||'—')}</span></div>
      <div class="info-row"><span class="key">Department</span><span class="val">${escapeHtml(currentProfile.department||'—')}</span></div>
      <div class="info-row"><span class="key">Reference No.</span><span class="val">${escapeHtml(currentProfile.job_ref||'—')}</span></div>
      <div class="info-row"><span class="key">Date Joined</span><span class="val">${currentProfile.created_at?new Date(currentProfile.created_at).toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'}):'—'}</span></div>
      <div style="margin-top:10px"><div class="info-label" style="margin-bottom:6px">Job Description</div><div style="font-size:13px;color:var(--text-secondary);line-height:1.7">${escapeHtml(currentProfile.job_description||'—')}</div></div>
      <div style="margin-top:14px">
        <button class="btn btn-secondary" onclick="toggleEditJob()"><i class="ti ti-edit"></i> Edit Job Info</button>
        <div id="editJobForm" class="hidden" style="margin-top:16px">
          <div class="grid-2">
            <div class="form-group"><label>Department</label><select id="editJobDept" onchange="updateJobTitleDropdown()"><option value="">— Select —</option>${Object.keys(departmentsData).map(d=>`<option ${currentProfile.department===d?'selected':''}>${escapeHtml(d)}</option>`).join('')}</select></div>
            <div class="form-group"><label>Job Title</label><select id="editJobTitle"><option value="">— Select —</option>${deptJobs.map(j=>`<option ${currentProfile.job_title===j?'selected':''}>${escapeHtml(j)}</option>`).join('')}</select></div>
            <div class="form-group"><label>Reference No.</label><input type="text" id="editJobRef" value="${escapeHtml(currentProfile.job_ref||'')}"/></div>
          </div>
          <div class="form-group"><label>Job Description</label><textarea id="editJobDesc" rows="3">${escapeHtml(currentProfile.job_description||'')}</textarea></div>
          <button class="btn btn-primary" onclick="saveJobInfo()"><i class="ti ti-check"></i> Save</button>
          <button class="btn btn-secondary" onclick="toggleEditJob()" style="margin-left:8px">Cancel</button>
        </div>
      </div>`;
  }
}

function getAllJobTitles(){const all=[];Object.values(departmentsData).forEach(jobs=>all.push(...jobs));return all;}
function updateJobTitleDropdown(){const dept=document.getElementById('editJobDept')?.value;const sel=document.getElementById('editJobTitle');if(!sel)return;const jobs=dept?(departmentsData[dept]||[]):getAllJobTitles();sel.innerHTML='<option value="">— Select —</option>'+jobs.map(j=>`<option ${currentProfile.job_title===j?'selected':''}>${escapeHtml(j)}</option>`).join('');}

function toggleEditPersonal(){const form=document.getElementById('editPersonalForm');const hidden=form.classList.contains('hidden');form.classList.toggle('hidden');if(hidden){document.getElementById('editPhone').value=currentProfile.phone||'';document.getElementById('editIdNum').value=currentProfile.id_number||'';document.getElementById('editLocation').value=currentProfile.location||'';document.getElementById('editNationality').value=currentProfile.nationality||'';}}
async function savePersonalInfo(){const updates={phone:document.getElementById('editPhone').value.trim(),id_number:document.getElementById('editIdNum').value.trim(),location:document.getElementById('editLocation').value.trim(),nationality:document.getElementById('editNationality').value.trim()};const{error}=await db.from('profiles').update(updates).eq('id',currentUser.id);if(error){alert('Could not save: '+error.message);return;}await reloadProfile();populateDashboard();document.getElementById('editPersonalForm').classList.add('hidden');showToast('Personal information updated.');}
function toggleEditJob(){const form=document.getElementById('editJobForm');if(form)form.classList.toggle('hidden');}
async function saveJobInfo(){const dept=document.getElementById('editJobDept')?.value||'';const title=document.getElementById('editJobTitle')?.value||'';const ref=document.getElementById('editJobRef')?.value.trim()||'';const desc=document.getElementById('editJobDesc')?.value.trim()||'';const{error}=await db.from('profiles').update({department:dept,job_title:title,job_ref:ref,job_description:desc}).eq('id',currentUser.id);if(error){alert('Could not save: '+error.message);return;}await reloadProfile();renderDashboardRightCard();toggleEditJob();showToast('Job information updated.');}

/* ══════════════════════════════════════════
   AVATAR / CV
══════════════════════════════════════════ */
async function uploadAvatar(e){const file=e.target.files[0];if(!file)return;const ext=file.name.split('.').pop();const path=`avatars/${currentUser.id}.${ext}`;const{error}=await db.storage.from('avatars').upload(path,file,{upsert:true});if(error){showToast('Upload failed: '+error.message,'error');return;}const{data}=db.storage.from('avatars').getPublicUrl(path);if(data?.publicUrl){await db.from('profiles').update({avatar_url:data.publicUrl}).eq('id',currentUser.id);currentProfile.avatar_url=data.publicUrl;setAvatarImage(data.publicUrl+'?t='+Date.now());showToast('Profile photo updated.');}}
function setAvatarImage(src){const c=document.getElementById('avatarCircle');const s=document.getElementById('sidebarAvatarText');if(c)c.innerHTML=`<img src="${src}" alt="Profile"/>`;if(s)s.innerHTML=`<img src="${src}" alt="Profile"/>`;}
async function uploadCV(e){const file=e.target.files[0];if(!file)return;const ext=file.name.split('.').pop();const path=`cvs/${currentUser.id}.${ext}`;const{error}=await db.storage.from('cvs').upload(path,file,{upsert:true});if(!error){const{data}=db.storage.from('cvs').getPublicUrl(path);if(data?.publicUrl){await db.from('profiles').update({cv_url:data.publicUrl}).eq('id',currentUser.id);currentProfile.cv_url=data.publicUrl;}}showToast('CV uploaded.');}
function handleApplyCVUpload(e){applyCVFile=e.target.files[0];if(applyCVFile)document.getElementById('applyCVLabel').textContent=`✓ ${applyCVFile.name}`;}

/* ══════════════════════════════════════════
   STATUS CONFIG
══════════════════════════════════════════ */
const statusConfig={received:{label:'Application Received',cls:'received',fill:'0%',stage:0},reviewing:{label:'Reviewing',cls:'reviewing',fill:'16%',stage:1},interview1:{label:'1st Interview',cls:'interview1',fill:'33%',stage:2},assessment:{label:'Assessment',cls:'assessment',fill:'50%',stage:3},interview2:{label:'2nd Interview',cls:'interview2',fill:'66%',stage:4},final:{label:'Final Assessment',cls:'final',fill:'82%',stage:5},offered:{label:'Offer Made',cls:'offered',fill:'100%',stage:6},rejected:{label:'Rejected',cls:'rejected',fill:'0%',stage:0},applied:{label:'Applied',cls:'applied',fill:'5%',stage:0},shortlisted:{label:'Shortlisted',cls:'shortlisted',fill:'40%',stage:1},longlist:{label:'Long List',cls:'longlist',fill:'25%',stage:1}};
const stepIcons=['ti-inbox','ti-eye','ti-video','ti-brain','ti-video','ti-writing','ti-file-check'];
const stageMessages={reviewing:'Your CV has passed the baseline criteria and the HC team is currently reviewing your profile.',interview1:'You have been chosen for a 1st Interview! Please head to the Bookings tab to schedule your slot.',assessment:'You have been selected for the Assessment stage. Please complete your assessment in the Assessments tab.',interview2:'You have progressed to the 2nd Interview stage! The HC team will be in touch.',final:'You have progressed to the Final Assessment stage. You are among the top candidates.',offered:'Your application has reached the Offer stage! The HC team will contact you.',rejected:'Your application status has been updated. Please check your email for further details.'};

function applyStatus(s){const cfg=statusConfig[s]||statusConfig.reviewing;const badge=document.getElementById('dashStatusBadge');if(badge){badge.style.display='';badge.className='status-badge '+cfg.cls;badge.innerHTML=`<i class="ti ti-circle-dot"></i>&nbsp;${cfg.label}`;}const txt=document.getElementById('dashStatusText');if(txt)txt.textContent=cfg.label;const sl=document.getElementById('currentStageLabel');if(sl)sl.textContent=cfg.label;const fill=document.getElementById('progressFill');if(fill)fill.style.width=cfg.fill;document.querySelectorAll('#progressCandidateView .step-node').forEach((node,i)=>{const circle=node.querySelector('.step-circle');const label=node.querySelector('.step-label');if(!circle||!label)return;circle.className='step-circle';label.className='step-label';if(i<cfg.stage){circle.classList.add('done');label.classList.add('done');circle.innerHTML='<i class="ti ti-check"></i>';}else if(i===cfg.stage){circle.classList.add('current');label.classList.add('current');circle.innerHTML=`<i class="ti ${stepIcons[i]||'ti-circle'}"></i>`;}else{circle.classList.add('pending');circle.innerHTML=`<i class="ti ${stepIcons[i]||'ti-circle'}"></i>`;}});}

function checkForStatusChangeNotification(s){try{const key='lastSeenStatus_'+currentUser.id;const last=localStorage.getItem(key);if(last&&last!==s&&stageMessages[s])showCongratsPopup(s);localStorage.setItem(key,s);}catch(e){}}
function showCongratsPopup(s){const msg=stageMessages[s];if(!msg)return;document.getElementById('congratsTitle').textContent=s==='rejected'?'Application Update':'Congratulations!';document.getElementById('congratsText').textContent=msg;document.getElementById('congratsModal').classList.add('open');}

/* ══════════════════════════════════════════
   EMAIL
══════════════════════════════════════════ */
const FROM_EMAIL='dvermeulen@communicare.org.za';
async function sendEmail(toEmail,subject,body){await db.from('email_notifications').insert({to_email:toEmail,subject,body,from_email:FROM_EMAIL,sent:false,created_at:new Date().toISOString()}).catch(()=>{});}
async function sendRejectionEmail(to,name,vac){await sendEmail(to,`Your application for ${vac} — Communicare`,`Dear ${name},\n\nThank you for applying for ${vac} at Communicare. After careful consideration, we will not be moving forward with your application at this time.\n\nWe wish you every success.\n\nWith warm regards,\nCommunicare Human Capital Team\n${FROM_EMAIL}`);}
async function sendStatusUpdateEmail(to,name,vac,status){await sendEmail(to,`Application update — ${vac}`,`Dear ${name},\n\nYour application for ${vac} has been updated to: ${status}.\n\nKind regards,\nCommunicare Human Capital Team\n${FROM_EMAIL}`);}
async function sendInterviewConfirmationEmail(to,name,date,time){await sendEmail(to,'Interview Booking Confirmed — Communicare',`Dear ${name},\n\nYour interview has been booked for ${date} at ${time} (30 minutes).\n\nKind regards,\nCommunicare Human Capital Team\n${FROM_EMAIL}`);}
async function sendInterviewCancellationEmail(to,name,date,time){await sendEmail(to,'Interview Cancelled — Communicare',`Dear ${name},\n\nYour interview for ${date} at ${time} has been cancelled.\n\nKind regards,\nCommunicare Human Capital Team\n${FROM_EMAIL}`);}

/* ══════════════════════════════════════════
   SCREENING
══════════════════════════════════════════ */
async function saveScreening(){const payload={job_title:document.getElementById('sc_title').value.trim(),department:document.getElementById('sc_dept').value,qualifications:document.getElementById('sc_qual').value.trim(),experience:document.getElementById('sc_exp').value.trim(),budget:document.getElementById('sc_budget').value.trim(),job_description:document.getElementById('sc_jd').value.trim(),green_flags:document.getElementById('sc_green').value.trim(),red_flags:document.getElementById('sc_red').value.trim(),created_by:currentUser.id,creator_name:`${currentProfile.first_name} ${currentProfile.last_name}`.trim(),created_at:new Date().toISOString(),updated_at:new Date().toISOString()};if(!payload.job_title){alert('Please enter a job title.');return;}const{error}=await db.from('screening_strategies').insert(payload);if(error){alert('Could not save: '+error.message);return;}['sc_title','sc_qual','sc_exp','sc_budget','sc_jd','sc_green','sc_red'].forEach(id=>{document.getElementById(id).value='';});showToast('Screening strategy saved.');await renderScreeningDepts();}

async function renderScreeningDepts(){const el=document.getElementById('screeningDeptList');if(!el)return;let query=db.from('screening_strategies').select('*').order('created_at',{ascending:false});if(userRole==='manager'&&currentProfile.department)query=query.eq('department',currentProfile.department);const{data}=await query;const strategies=data||[];if(strategies.length===0){el.innerHTML='<p style="font-size:13px;color:var(--text-muted)">No strategies saved yet.</p>';return;}const byDept={};strategies.forEach(s=>{if(!byDept[s.department])byDept[s.department]=[];byDept[s.department].push(s);});el.innerHTML=Object.entries(byDept).map(([dept,items])=>`<div class="screening-dept-block"><div class="screening-dept-header" onclick="toggleScreeningDept(this)"><h4><i class="ti ti-building" style="color:var(--accent-green)"></i>${escapeHtml(dept)}<span class="dept-count">${items.length} strateg${items.length!==1?'ies':'y'}</span></h4><i class="ti ti-chevron-down chevron"></i></div><div class="screening-dept-body">${items.map(s=>`<div class="strategy-item"><div class="strategy-item-header"><div><div class="strategy-item-title">${escapeHtml(s.job_title)}</div><div class="strategy-item-meta">Created by ${escapeHtml(s.creator_name||'HR')} · ${new Date(s.created_at).toLocaleDateString('en-ZA')}</div></div>${(userRole==='admin'||s.created_by===currentUser.id)?`<button class="btn btn-danger btn-sm" onclick="deleteStrategy('${s.id}')"><i class="ti ti-trash"></i></button>`:''}</div><div class="grid-2" style="margin-bottom:12px"><div><div class="report-label">Qualifications</div><div style="font-size:13px">${escapeHtml(s.qualifications||'—')}</div></div><div><div class="report-label">Experience</div><div style="font-size:13px">${escapeHtml(s.experience||'—')}</div></div><div><div class="report-label">Budget</div><div style="font-size:13px;color:var(--success);font-weight:600">${escapeHtml(s.budget||'—')}</div></div></div><div style="margin-bottom:10px"><div class="report-label" style="margin-bottom:4px">Job Description</div><div style="font-size:13px;color:var(--text-secondary);line-height:1.6">${escapeHtml(s.job_description||'—')}</div></div><div class="grid-2"><div><div class="report-label" style="margin-bottom:6px">Green Flags</div>${(s.green_flags||'').split('\n').filter(Boolean).map(g=>`<span class="tag green">✓ ${escapeHtml(g.trim())}</span>`).join('')}</div><div><div class="report-label" style="margin-bottom:6px">Red Flags</div>${(s.red_flags||'').split('\n').filter(Boolean).map(r=>`<span class="tag red">✕ ${escapeHtml(r.trim())}</span>`).join('')}</div></div></div>`).join('')}</div></div>`).join('');}

function toggleScreeningDept(h){const b=h.nextElementSibling;const i=h.querySelector('.chevron');b.classList.toggle('open');if(i)i.classList.toggle('open');}
async function deleteStrategy(id){if(!confirm('Delete this strategy?'))return;await db.from('screening_strategies').delete().eq('id',id);await renderScreeningDepts();showToast('Strategy deleted.');}

/* ══════════════════════════════════════════
   COMPETENCY
══════════════════════════════════════════ */
function renderDepts(){const el=document.getElementById('deptList');if(!el)return;el.innerHTML='';const addBtn=document.getElementById('addJobBtn');if(addBtn)addBtn.style.display=userRole==='admin'?'flex':'none';const depts=userRole==='manager'&&currentProfile.department?{[currentProfile.department]:departmentsData[currentProfile.department]||[]}:departmentsData;for(const[dept,jobs]of Object.entries(depts)){const block=document.createElement('div');block.className='dept-block';const jobRows=(jobs||[]).map(j=>{const key=`${dept}|${j}`;const files=competencyFiles[key]||{};const safeD=dept.replace(/'/g,"\\'");const safeJ=j.replace(/'/g,"\\'");const pdfBadges=[files.framework?`<a class="pdf-badge" href="${files.framework}" target="_blank"><i class="ti ti-file-text"></i> Framework</a>`:''  ,files.jd?`<a class="pdf-badge" href="${files.jd}" target="_blank"><i class="ti ti-file-description"></i> JD</a>`:''].join('');const adminBtns=userRole==='admin'?`<div class="job-actions"><button class="job-btn pdf" onclick="openCompPdfModal('${safeD}','${safeJ}')"><i class="ti ti-upload"></i> Docs</button><button class="job-btn" onclick="editJob('${safeD}','${safeJ}')"><i class="ti ti-edit"></i> Edit</button><button class="job-btn del" onclick="deleteJob('${safeD}','${safeJ}')"><i class="ti ti-trash"></i></button></div>`:'';return `<div class="job-item"><span class="job-name"><i class="ti ti-point-filled"></i>${escapeHtml(j)} ${pdfBadges}</span>${adminBtns}</div>`;}).join('');block.innerHTML=`<div class="dept-header" onclick="toggleDept(this)"><h4><i class="ti ti-building"></i>${escapeHtml(dept)}<span class="dept-count">${(jobs||[]).length} roles</span></h4><i class="ti ti-chevron-down chevron"></i></div><div class="job-list">${jobRows}</div>`;el.appendChild(block);}}
function toggleDept(h){const l=h.nextElementSibling;const i=h.querySelector('.chevron');l.classList.toggle('open');if(i)i.classList.toggle('open');}
function openAddJobModal(){document.getElementById('newJobTitle').value='';document.getElementById('addJobModal').classList.add('open');}
function addJob(){const dept=document.getElementById('newJobDept').value;const title=document.getElementById('newJobTitle').value.trim();if(!title){alert('Please enter a job title.');return;}if(!departmentsData[dept])departmentsData[dept]=[];departmentsData[dept].push(title);renderDepts();closeModal('addJobModal');showToast('Job added.');}
function deleteJob(dept,job){if(!confirm(`Remove "${job}" from ${dept}?`))return;departmentsData[dept]=departmentsData[dept].filter(j=>j!==job);renderDepts();}
function editJob(dept,job){const n=prompt('Edit job title:',job);if(n&&n.trim()){const idx=departmentsData[dept].indexOf(job);if(idx!==-1){departmentsData[dept][idx]=n.trim();renderDepts();}}}
function openCompPdfModal(dept,job){currentCompJob={dept,job};document.getElementById('compPdfJobTitle').textContent=job;document.getElementById('compFrameworkLabel').textContent='Click to upload';document.getElementById('compJdLabel').textContent='Click to upload';const key=`${dept}|${job}`;const files=competencyFiles[key]||{};const wrap=document.getElementById('compUploadedFiles');wrap.innerHTML='';if(files.framework)wrap.innerHTML+=`<a class="pdf-badge" href="${files.framework}" target="_blank"><i class="ti ti-file-text"></i> Framework</a>`;if(files.jd)wrap.innerHTML+=`<a class="pdf-badge" href="${files.jd}" target="_blank"><i class="ti ti-file-description"></i> JD</a>`;document.getElementById('compPdfModal').classList.add('open');}
async function handleCompPdfUpload(e,type){const file=e.target.files[0];if(!file||!currentCompJob)return;const{dept,job}=currentCompJob;const key=`${dept}|${job}`;const safeName=`${dept}_${job}_${type}`.replace(/[^a-zA-Z0-9_]/g,'_');const filePath=`competency/${safeName}.pdf`;const{error}=await db.storage.from('competency').upload(filePath,file,{upsert:true});const url=error?URL.createObjectURL(file):(db.storage.from('competency').getPublicUrl(filePath).data?.publicUrl||'');if(!competencyFiles[key])competencyFiles[key]={};competencyFiles[key][type]=url;document.getElementById(type==='framework'?'compFrameworkLabel':'compJdLabel').textContent=`✓ ${file.name}`;renderDepts();showToast('Document uploaded.');}
/* ══════════════════════════════════════════
   VACANCIES
══════════════════════════════════════════ */
async function renderVacancies() {
  const el = document.getElementById('vacancyList');
  if (!el) return;
  el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">Loading vacancies…</p>';
  const { data: vacs } = await db.from('vacancies').select('*').eq('posted', true).order('created_at', { ascending: false });
  vacanciesData = vacs || [];
  if (!vacanciesData.length) { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No open vacancies at this time.</p>'; return; }
  const { data: myApps } = await db.from('applications').select('vacancy_id').eq('applicant_id', currentUser.id);
  const applied = new Set((myApps || []).map(a => a.vacancy_id));
  el.innerHTML = vacanciesData.map(v => {
    const hasApplied = applied.has(v.id);
    const closing = v.closing_date ? new Date(v.closing_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    return `<div class="vacancy-card">
      <div class="vacancy-title">${escapeHtml(v.title)}</div>
      <div class="vacancy-dept"><i class="ti ti-building"></i> ${escapeHtml(v.department)}</div>
      <div class="vacancy-meta">
        <span><i class="ti ti-map-pin"></i> ${escapeHtml(v.location || '—')}</span>
        <span><i class="ti ti-briefcase"></i> ${escapeHtml(v.type || 'Full-time')}</span>
        <span><i class="ti ti-calendar"></i> Closes ${closing}</span>
      </div>
      <div class="vacancy-desc">${escapeHtml(v.description || '')}</div>
      <div class="vacancy-footer">
        ${hasApplied
          ? `<span class="status-badge applied"><i class="ti ti-check"></i> Applied</span>`
          : `<button class="btn btn-primary btn-sm" onclick="openApplyModal('${v.id}')"><i class="ti ti-send"></i> Apply Now</button>`}
      </div>
    </div>`;
  }).join('');
}

async function renderAdminVacancies() {
  const el = document.getElementById('adminVacancyList');
  if (!el) return;
  const { data: vacs } = await db.from('vacancies').select('*').order('created_at', { ascending: false });
  vacanciesData = vacs || [];
  if (!vacanciesData.length) { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No vacancies yet. Click Add Vacancy to create one.</p>'; return; }
  el.innerHTML = vacanciesData.map(v => {
    const isOn = v.posted;
    return `<div class="admin-vacancy-block">
      <div class="admin-vacancy-header">
        <div>
          <div class="admin-vacancy-title">${escapeHtml(v.title)}</div>
          <div class="admin-vacancy-dept">${escapeHtml(v.department)} · ${escapeHtml(v.type || 'Full-time')} · ${escapeHtml(v.location || '—')}</div>
        </div>
        <div class="admin-vacancy-actions">
          <label class="posted-toggle" title="${isOn ? 'Unpost vacancy' : 'Post vacancy'}">
            <div class="toggle-switch ${isOn ? 'on' : ''}" onclick="toggleVacancyPost('${v.id}',${isOn})"></div>
            <span>${isOn ? 'Posted' : 'Draft'}</span>
          </label>
          <button class="btn btn-secondary btn-sm" onclick="openScreeningQModal('${v.id}','${escapeHtml(v.title).replace(/'/g,"\\'")}')"><i class="ti ti-forms"></i> Questions</button>
          <button class="btn btn-secondary btn-sm" onclick="openApplicantListModal('${v.id}','${escapeHtml(v.title).replace(/'/g,"\\'")}')"><i class="ti ti-users"></i> Applicants</button>
          <button class="btn btn-secondary btn-sm" onclick="openCalendarAccessModal('${v.id}','${escapeHtml(v.title).replace(/'/g,"\\'")}')"><i class="ti ti-calendar"></i> Calendar</button>
          <button class="btn btn-danger btn-sm" onclick="deleteVacancy('${v.id}')"><i class="ti ti-trash"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openAddVacancyModal() {
  ['vacTitle','vacLocation','vacDesc','vacClosing'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('addVacancyModal').classList.add('open');
}

async function addVacancy() {
  const title = document.getElementById('vacTitle').value.trim();
  const dept  = document.getElementById('vacDept').value;
  const loc   = document.getElementById('vacLocation').value.trim();
  const type  = document.getElementById('vacType').value;
  const desc  = document.getElementById('vacDesc').value.trim();
  const closing = document.getElementById('vacClosing').value;
  if (!title) { alert('Please enter a job title.'); return; }
  const { error } = await db.from('vacancies').insert({ title, department: dept, location: loc, type, description: desc, closing_date: closing || null, posted: false, created_by: currentUser.id, created_at: new Date().toISOString() });
  if (error) { alert('Could not save: ' + error.message); return; }
  closeModal('addVacancyModal');
  showToast('Vacancy created.');
  await renderAdminVacancies();
}

async function toggleVacancyPost(id, currentState) {
  await db.from('vacancies').update({ posted: !currentState }).eq('id', id);
  await renderAdminVacancies();
  showToast(!currentState ? 'Vacancy posted.' : 'Vacancy unpublished.');
}

async function deleteVacancy(id) {
  if (!confirm('Delete this vacancy and all its applications?')) return;
  await db.from('applications').delete().eq('vacancy_id', id);
  await db.from('vacancy_slots').delete().eq('vacancy_id', id);
  await db.from('vacancies').delete().eq('id', id);
  await renderAdminVacancies();
  showToast('Vacancy deleted.');
}

/* ══════════════════════════════════════════
   SCREENING QUESTIONS
══════════════════════════════════════════ */
let currentSQVacancyId = null;
function openScreeningQModal(vacId, title) {
  currentSQVacancyId = vacId;
  document.getElementById('sqJobTitle').textContent = title;
  loadScreeningQuestions(vacId);
  document.getElementById('screeningQModal').classList.add('open');
}

async function loadScreeningQuestions(vacId) {
  const { data } = await db.from('screening_questions').select('*').eq('vacancy_id', vacId).order('created_at');
  const list = document.getElementById('sqList');
  list.innerHTML = '';
  (data || []).forEach((q, i) => renderSQItem(q, i));
}

function renderSQItem(q, idx) {
  const list = document.getElementById('sqList');
  const div = document.createElement('div');
  div.className = 'sq-item';
  div.dataset.id = q.id || '';
  const opts = (q.options || ['', '', '', '']).map((opt, oi) => `
    <div class="sq-option-row">
      <input type="text" value="${escapeHtml(opt)}" placeholder="Option ${String.fromCharCode(65 + oi)}" data-oi="${oi}"/>
      <input type="radio" class="sq-correct-radio" name="correct_${idx}" value="${oi}" ${q.correct_index == oi ? 'checked' : ''}/>
      <span class="sq-correct-label">Correct</span>
    </div>`).join('');
  div.innerHTML = `<div class="sq-num">Question ${idx + 1}</div>
    <div class="form-group"><label>Question Text</label><input type="text" class="sq-qtext" value="${escapeHtml(q.question || '')}" placeholder="Enter question…"/></div>
    <div class="sq-options-builder">${opts}</div>
    <div style="margin-top:8px"><button class="btn btn-danger btn-sm" onclick="this.closest('.sq-item').remove()"><i class="ti ti-trash"></i> Remove</button></div>`;
  list.appendChild(div);
}

function addScreeningQuestion() {
  const idx = document.getElementById('sqList').children.length;
  renderSQItem({ question: '', options: ['', '', '', ''], correct_index: 0 }, idx);
}

async function saveScreeningQuestions() {
  if (!currentSQVacancyId) return;
  await db.from('screening_questions').delete().eq('vacancy_id', currentSQVacancyId);
  const items = document.querySelectorAll('#sqList .sq-item');
  const rows = [];
  items.forEach((item, idx) => {
    const question = item.querySelector('.sq-qtext').value.trim();
    if (!question) return;
    const opts = [...item.querySelectorAll('.sq-options-builder input[type="text"]')].map(i => i.value.trim());
    const correctEl = item.querySelector('.sq-correct-radio:checked');
    const correct_index = correctEl ? parseInt(correctEl.value) : 0;
    rows.push({ vacancy_id: currentSQVacancyId, question, options: opts, correct_index, created_at: new Date().toISOString() });
  });
  if (rows.length) await db.from('screening_questions').insert(rows);
  closeModal('screeningQModal');
  showToast('Screening questions saved.');
}

/* ══════════════════════════════════════════
   APPLY MODAL
══════════════════════════════════════════ */
let currentApplyVacancyId = null;
async function openApplyModal(vacId) {
  currentApplyVacancyId = vacId;
  applyAnswers = {};
  applyCVFile = null;
  const vac = vacanciesData.find(v => v.id === vacId);
  document.getElementById('applyJobTitle').textContent = vac ? vac.title : '';
  document.getElementById('applyCVLabel').textContent = 'Click to upload your CV (PDF, Word)';
  const { data: existingApp } = await db.from('applications').select('id').eq('vacancy_id', vacId).eq('applicant_id', currentUser.id).maybeSingle();
  if (existingApp) {
    document.getElementById('replaceAppYes').onclick = () => { closeModal('replaceAppModal'); proceedOpenApplyModal(vacId); };
    document.getElementById('replaceAppModal').classList.add('open');
    return;
  }
  await proceedOpenApplyModal(vacId);
}

async function proceedOpenApplyModal(vacId) {
  const { data: questions } = await db.from('screening_questions').select('*').eq('vacancy_id', vacId).order('created_at');
  const list = document.getElementById('applyQuestionsList');
  list.innerHTML = '';
  (questions || []).forEach((q, i) => {
    const div = document.createElement('div');
    div.className = 'q-card';
    div.innerHTML = `<div class="q-num">Question ${i + 1}</div>
      <div class="q-text">${escapeHtml(q.question)}</div>
      <div class="q-options">${(q.options || []).map((opt, oi) => opt ? `
        <label class="q-opt" onclick="selectApplyAnswer('${q.id}',${oi},this)">
          <input type="radio" name="aq_${q.id}" value="${oi}"/> ${escapeHtml(opt)}
        </label>` : '').join('')}</div>`;
    list.appendChild(div);
  });
  document.getElementById('applyModal').classList.add('open');
}

function selectApplyAnswer(qId, optIdx, el) {
  applyAnswers[qId] = optIdx;
  el.closest('.q-options').querySelectorAll('.q-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}

async function submitApplication() {
  const vac = vacanciesData.find(v => v.id === currentApplyVacancyId);
  let cvUrl = currentProfile.cv_url || null;
  if (applyCVFile) {
    const ext = applyCVFile.name.split('.').pop();
    const path = `cvs/${currentUser.id}_apply_${currentApplyVacancyId}.${ext}`;
    const { error } = await db.storage.from('cvs').upload(path, applyCVFile, { upsert: true });
    if (!error) { const { data } = db.storage.from('cvs').getPublicUrl(path); cvUrl = data?.publicUrl || cvUrl; }
  }

  const { data: questions } = await db.from('screening_questions').select('*').eq('vacancy_id', currentApplyVacancyId);
  let score = 0, total = (questions || []).length;
  (questions || []).forEach(q => { if (applyAnswers[q.id] !== undefined && applyAnswers[q.id] == q.correct_index) score++; });
  const pct = total > 0 ? Math.round((score / total) * 100) : null;

  await db.from('applications').delete().eq('vacancy_id', currentApplyVacancyId).eq('applicant_id', currentUser.id);
  const { error } = await db.from('applications').insert({
    vacancy_id: currentApplyVacancyId,
    applicant_id: currentUser.id,
    applicant_name: `${currentProfile.first_name} ${currentProfile.last_name}`.trim(),
    applicant_email: currentProfile.email,
    cv_url: cvUrl,
    answers: applyAnswers,
    score_pct: pct,
    status: 'pending',
    column_status: 'pending',
    applied_at: new Date().toISOString()
  });
  if (error) { alert('Could not submit: ' + error.message); return; }

  await db.from('profiles').update({ status: 'reviewing', job_title: vac?.title || '', department: vac?.department || '' }).eq('id', currentUser.id);
  await reloadProfile();
  closeModal('applyModal');
  showToast('Application submitted!');
  await renderVacancies();
}

/* ══════════════════════════════════════════
   APPLICANT LIST MODAL (ADMIN)
══════════════════════════════════════════ */
let currentApplicantVacancyId = null;

async function openApplicantListModal(vacId, title) {
  currentApplicantVacancyId = vacId;
  document.getElementById('alJobTitle').textContent = title;
  shortlistDraft = {};
  await loadApplicants(vacId);
  document.getElementById('applicantListModal').classList.add('open');
}

async function loadApplicants(vacId) {
  const { data: apps } = await db.from('applications').select('*').eq('vacancy_id', vacId);
  ['pending', 'shortlist', 'longlist', 'rejected'].forEach(c => { document.getElementById('col' + c.charAt(0).toUpperCase() + c.slice(1)).innerHTML = ''; });
  (apps || []).forEach(app => {
    shortlistDraft[app.applicant_id] = app.column_status || 'pending';
    renderApplicantChip(app);
  });
  renderShortlistAction(vacId);
  await loadManagerApprovals(vacId);
}

function renderApplicantChip(app) {
  const col = app.column_status || 'pending';
  const colEl = document.getElementById('col' + col.charAt(0).toUpperCase() + col.slice(1));
  if (!colEl) return;
  const pct = app.score_pct != null ? app.score_pct : null;
  const scoreClass = pct == null ? '' : pct >= 70 ? 'good' : pct >= 40 ? 'moderate' : 'poor';
  const scoreBadge = pct != null ? `<span class="chip-score-badge ${scoreClass}">${pct}%</span>` : '';
  const chip = document.createElement('div');
  chip.className = 'applicant-chip';
  chip.draggable = true;
  chip.dataset.uid = app.applicant_id;
  chip.innerHTML = `<div style="display:flex;align-items:center;gap:6px;justify-content:space-between">
    <div>
      <div class="applicant-chip-name">${escapeHtml(app.applicant_name || app.applicant_email)}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:1px">${escapeHtml(app.applicant_email || '')}</div>
    </div>
    <div style="display:flex;align-items:center;gap:4px">
      ${scoreBadge}
      <button class="btn btn-secondary btn-sm" style="padding:2px 7px" onclick="openCandidateProfile('${app.applicant_id}')"><i class="ti ti-eye"></i></button>
    </div>
  </div>`;
  chip.addEventListener('dragstart', e => { e.dataTransfer.setData('uid', app.applicant_id); chip.classList.add('dragging'); });
  chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
  colEl.appendChild(chip);
}

function dropApplicant(e, targetCol) {
  e.preventDefault();
  const uid = e.dataTransfer.getData('uid');
  e.currentTarget.classList.remove('drag-over');
  shortlistDraft[uid] = targetCol;
  const chip = document.querySelector(`.applicant-chip[data-uid="${uid}"]`);
  const colEl = document.getElementById('col' + targetCol.charAt(0).toUpperCase() + targetCol.slice(1));
  if (chip && colEl) colEl.appendChild(chip);
}

function renderShortlistAction(vacId) {
  const wrap = document.getElementById('shortlistActionWrap');
  if (!wrap) return;
  wrap.innerHTML = `<button class="btn btn-primary" onclick="saveShortlistDraft('${vacId}')"><i class="ti ti-device-floppy"></i> Save Column Assignments</button>
    <button class="btn btn-secondary" style="margin-left:10px" onclick="sendShortlistToManagers('${vacId}')"><i class="ti ti-send"></i> Send Shortlist to Managers</button>`;
}

async function saveShortlistDraft(vacId) {
  const updates = Object.entries(shortlistDraft).map(([uid, col]) =>
    db.from('applications').update({ column_status: col }).eq('vacancy_id', vacId).eq('applicant_id', uid)
  );
  await Promise.all(updates);
  showToast('Assignments saved.');
}

async function sendShortlistToManagers(vacId) {
  await saveShortlistDraft(vacId);
  const { data: calAccess } = await db.from('vacancy_calendar_access').select('manager_id').eq('vacancy_id', vacId);
  const managerIds = (calAccess || []).map(r => r.manager_id);
  if (!managerIds.length) { showToast('No managers assigned to this vacancy calendar.', 'error'); return; }
  const shortlisted = Object.entries(shortlistDraft).filter(([, c]) => c === 'shortlist').map(([uid]) => uid);
  await db.from('vacancies').update({ shortlist_sent: true, shortlist_manager_ids: managerIds }).eq('id', vacId);
  showToast('Shortlist sent to managers.');
  closeModal('applicantListModal');
}

async function loadManagerApprovals(vacId) {
  const { data } = await db.from('manager_approvals').select('*').eq('vacancy_id', vacId);
  const section = document.getElementById('managerApprovalsSection');
  const list = document.getElementById('managerApprovalsList');
  if (!data || !data.length) { if (section) section.style.display = 'none'; return; }
  if (section) section.style.display = 'block';
  list.innerHTML = data.map(a => `
    <div class="approval-row">
      <div><div style="font-size:13px;font-weight:500">${escapeHtml(a.manager_name || a.manager_id)}</div><div style="font-size:11px;color:var(--text-muted)">${escapeHtml(a.candidate_name || '')}</div></div>
      <span class="approval-decision ${a.decision}"><i class="ti ti-${a.decision === 'continue' ? 'check' : 'x'}"></i> ${a.decision === 'continue' ? 'Continue' : 'No Continue'}</span>
    </div>`).join('');
}

/* ══════════════════════════════════════════
   CANDIDATE PROFILE MODAL
══════════════════════════════════════════ */
async function openCandidateProfile(uid) {
  const { data: profile } = await db.from('profiles').select('*').eq('id', uid).single();
  if (!profile) return;
  const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email;
  document.getElementById('cpModalName').textContent = name;
  const statusOpts = ['reviewing','interview1','assessment','interview2','final','offered','rejected'].map(s =>
    `<option value="${s}" ${profile.status === s ? 'selected' : ''}>${statusConfig[s]?.label || s}</option>`).join('');
  document.getElementById('cpModalContent').innerHTML = `
    <div class="grid-2" style="margin-bottom:16px">
      <div><div class="info-label">Email</div><div style="font-size:13px;margin-top:3px">${escapeHtml(profile.email || '—')}</div></div>
      <div><div class="info-label">Phone</div><div style="font-size:13px;margin-top:3px">${escapeHtml(profile.phone || '—')}</div></div>
      <div><div class="info-label">ID Number</div><div style="font-size:13px;margin-top:3px">${escapeHtml(profile.id_number || '—')}</div></div>
      <div><div class="info-label">Location</div><div style="font-size:13px;margin-top:3px">${escapeHtml(profile.location || '—')}</div></div>
      <div><div class="info-label">Nationality</div><div style="font-size:13px;margin-top:3px">${escapeHtml(profile.nationality || '—')}</div></div>
      <div><div class="info-label">Department</div><div style="font-size:13px;margin-top:3px">${escapeHtml(profile.department || '—')}</div></div>
    </div>
    ${profile.cv_url ? `<div style="margin-bottom:16px"><a href="${profile.cv_url}" target="_blank" class="btn btn-secondary btn-sm"><i class="ti ti-file-cv"></i> View CV</a></div>` : ''}
    <div class="form-group">
      <label>Update Status</label>
      <select id="cpStatusSelect">${statusOpts}</select>
    </div>
    <button class="btn btn-primary btn-sm" onclick="updateCandidateStatus('${uid}','${escapeHtml(profile.email)}','${escapeHtml(name)}')"><i class="ti ti-check"></i> Update Status</button>`;
  document.getElementById('candidateProfileModal').classList.add('open');
}

async function updateCandidateStatus(uid, email, name) {
  const newStatus = document.getElementById('cpStatusSelect').value;
  await db.from('profiles').update({ status: newStatus }).eq('id', uid);
  await sendStatusUpdateEmail(email, name, 'your position', statusConfig[newStatus]?.label || newStatus);
  if (newStatus === 'rejected') await sendRejectionEmail(email, name, 'the position');
  showToast('Status updated.');
  closeModal('candidateProfileModal');
}

/* ══════════════════════════════════════════
   MANAGER SHORTLISTS
══════════════════════════════════════════ */
async function renderManagerShortlists() {
  const el = document.getElementById('managerShortlistView');
  if (!el) return;
  const { data: vacs } = await db.from('vacancies').select('*').order('created_at', { ascending: false });
  const { data: calAccess } = await db.from('vacancy_calendar_access').select('vacancy_id').eq('manager_id', currentUser.id);
  const assignedVacIds = new Set((calAccess || []).map(r => r.vacancy_id));
  const myVacs = (vacs || []).filter(v => v.shortlist_sent && assignedVacIds.has(v.id));
  if (!myVacs.length) { el.innerHTML = '<div class="notice"><i class="ti ti-info-circle"></i> No shortlists have been sent to you yet.</div>'; return; }
  el.innerHTML = myVacs.map(v => `
    <div class="manager-job-block">
      <div class="manager-job-header" onclick="toggleManagerJob(this)">
        <div>
          <div style="font-size:14px;font-weight:600;color:var(--text-primary)">${escapeHtml(v.title)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(v.department)}</div>
        </div>
        <i class="ti ti-chevron-down chevron"></i>
      </div>
      <div class="manager-job-body" id="mjBody_${v.id}"></div>
    </div>`).join('');
}

function toggleManagerJob(h) {
  const body = h.nextElementSibling;
  const i = h.querySelector('.chevron');
  body.classList.toggle('open');
  if (i) i.classList.toggle('open');
  if (body.classList.contains('open') && !body.dataset.loaded) {
    body.dataset.loaded = '1';
    loadManagerJobCandidates(h.closest('.manager-job-block').querySelector('.manager-job-body').id.replace('mjBody_', ''), body);
  }
}

async function loadManagerJobCandidates(vacId, bodyEl) {
  const { data: apps } = await db.from('applications').select('*').eq('vacancy_id', vacId).eq('column_status', 'shortlist');
  if (!apps || !apps.length) { bodyEl.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:12px 0">No shortlisted candidates yet.</p>'; return; }
  bodyEl.innerHTML = apps.map(app => `
    <div class="manager-candidate-row" onclick="openManagerCandidateModal('${app.applicant_id}','${vacId}')">
      <div class="applicant-row-info">
        <div class="applicant-avatar">${getInitials(app.applicant_name || app.applicant_email)}</div>
        <div>
          <div class="applicant-row-name">${escapeHtml(app.applicant_name || app.applicant_email)}</div>
          <div class="applicant-row-email">${escapeHtml(app.applicant_email || '')}</div>
        </div>
      </div>
      ${app.score_pct != null ? `<span class="chip-score-badge ${app.score_pct >= 70 ? 'good' : app.score_pct >= 40 ? 'moderate' : 'poor'}">${app.score_pct}%</span>` : ''}
    </div>`).join('');
}

async function openManagerCandidateModal(uid, vacId) {
  const { data: profile } = await db.from('profiles').select('*').eq('id', uid).single();
  const { data: app } = await db.from('applications').select('*').eq('vacancy_id', vacId).eq('applicant_id', uid).maybeSingle();
  if (!profile) return;
  const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email;
  document.getElementById('mcModalName').textContent = name;
  const { data: existing } = await db.from('manager_approvals').select('*').eq('vacancy_id', vacId).eq('manager_id', currentUser.id).eq('candidate_id', uid).maybeSingle();
  document.getElementById('mcModalContent').innerHTML = `
    <div class="grid-2" style="margin-bottom:16px">
      <div><div class="info-label">Email</div><div style="font-size:13px;margin-top:3px">${escapeHtml(profile.email || '—')}</div></div>
      <div><div class="info-label">Phone</div><div style="font-size:13px;margin-top:3px">${escapeHtml(profile.phone || '—')}</div></div>
      <div><div class="info-label">Location</div><div style="font-size:13px;margin-top:3px">${escapeHtml(profile.location || '—')}</div></div>
      <div><div class="info-label">Nationality</div><div style="font-size:13px;margin-top:3px">${escapeHtml(profile.nationality || '—')}</div></div>
    </div>
    ${app?.score_pct != null ? `<div class="notice" style="margin-bottom:16px"><i class="ti ti-chart-bar"></i> Screening score: <strong>${app.score_pct}%</strong></div>` : ''}
    ${profile.cv_url ? `<div style="margin-bottom:16px"><a href="${profile.cv_url}" target="_blank" class="btn btn-secondary btn-sm"><i class="ti ti-file-cv"></i> View CV</a></div>` : ''}
    <div style="margin-top:16px">
      <div class="info-label" style="margin-bottom:10px">Your Decision</div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-success ${existing?.decision === 'continue' ? 'btn-primary' : ''}" onclick="recordManagerDecision('${vacId}','${uid}','${escapeHtml(name)}','continue')"><i class="ti ti-check"></i> Continue</button>
        <button class="btn btn-danger ${existing?.decision === 'no-continue' ? '' : ''}" onclick="recordManagerDecision('${vacId}','${uid}','${escapeHtml(name)}','no-continue')"><i class="ti ti-x"></i> Don't Continue</button>
      </div>
      ${existing ? `<div style="margin-top:10px;font-size:12px;color:var(--text-muted)">Your current decision: <strong>${existing.decision}</strong></div>` : ''}
    </div>`;
  document.getElementById('managerCandidateModal').classList.add('open');
}

async function recordManagerDecision(vacId, candidateId, candidateName, decision) {
  const managerName = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();
  await db.from('manager_approvals').upsert({
    vacancy_id: vacId, manager_id: currentUser.id, candidate_id: candidateId,
    manager_name: managerName, candidate_name: candidateName, decision,
    created_at: new Date().toISOString()
  }, { onConflict: 'vacancy_id,manager_id,candidate_id' });
  closeModal('managerCandidateModal');
  showToast('Decision recorded.');
}

/* ══════════════════════════════════════════
   ASSESSMENTS TAB
══════════════════════════════════════════ */
async function renderAssessmentsTab() {
  const subtitle = document.getElementById('assessmentsSubtitle');
  const adminView = document.getElementById('adminAssessmentsView');
  const candidateView = document.getElementById('candidateAssessmentsView');
  if (userRole === 'admin') {
    if (subtitle) subtitle.textContent = 'Manage candidate assessments';
    if (adminView) adminView.style.display = '';
    if (candidateView) candidateView.style.display = 'none';
    await renderAdminAssessmentsList();
  } else {
    if (adminView) adminView.style.display = 'none';
    if (candidateView) candidateView.style.display = '';
    await renderCandidateAssessments();
  }
}

async function renderAdminAssessmentsList() {
  const el = document.getElementById('adminCandidateAssessmentList');
  if (!el) return;
  const { data: profiles } = await db.from('profiles').select('*').eq('role', 'candidate').order('first_name');
  if (!profiles || !profiles.length) { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No candidates yet.</p>'; return; }
  el.innerHTML = profiles.map(p => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email;
    return `<div class="candidate-assess-row">
      <div class="applicant-row-info">
        <div class="applicant-avatar">${getInitials(name)}</div>
        <div><div class="applicant-row-name">${escapeHtml(name)}</div><div class="applicant-row-email">${escapeHtml(p.email || '')}</div></div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="openAdminAssessModal('${p.id}','${escapeHtml(name).replace(/'/g,"\\'")}')"><i class="ti ti-upload"></i> Upload Assessment</button>
    </div>`;
  }).join('');
}

function openAdminAssessModal(targetId, targetName) {
  pendingAdminAssessTarget = targetId;
  pendingAdminAssessFile = null;
  document.getElementById('adminAssessTargetName').textContent = targetName;
  document.getElementById('adminAssessTitle').value = '';
  document.getElementById('adminAssessDesc').value = '';
  document.getElementById('adminAssessFileLabel').textContent = 'Click to upload PDF';
  document.getElementById('adminAssessmentModal').classList.add('open');
}

function handleAdminAssessFileUpload(e) {
  pendingAdminAssessFile = e.target.files[0];
  if (pendingAdminAssessFile) document.getElementById('adminAssessFileLabel').textContent = `✓ ${pendingAdminAssessFile.name}`;
}

async function saveAdminAssessment() {
  if (!pendingAdminAssessTarget || !pendingAdminAssessFile) { alert('Please select a file.'); return; }
  const title = document.getElementById('adminAssessTitle').value.trim() || 'Assessment';
  const desc = document.getElementById('adminAssessDesc').value.trim();
  const path = `assessments/${pendingAdminAssessTarget}_${Date.now()}.pdf`;
  const { error } = await db.storage.from('assessments').upload(path, pendingAdminAssessFile, { upsert: true });
  if (error) { showToast('Upload failed: ' + error.message, 'error'); return; }
  const { data } = db.storage.from('assessments').getPublicUrl(path);
  await db.from('candidate_assessments').insert({ candidate_id: pendingAdminAssessTarget, title, description: desc, file_url: data?.publicUrl || '', uploaded_by: currentUser.id, created_at: new Date().toISOString() });
  closeModal('adminAssessmentModal');
  showToast('Assessment uploaded.');
}

async function renderCandidateAssessments() {
  const { data: uploadedAssess } = await db.from('candidate_assessments').select('*').eq('candidate_id', currentUser.id).order('created_at');
  const uploadedSection = document.getElementById('uploadedAssessmentsSection');
  if (uploadedSection) {
    if (uploadedAssess && uploadedAssess.length) {
      uploadedSection.innerHTML = `<div class="card-title" style="margin-bottom:10px"><i class="ti ti-file-text"></i> Uploaded Assessments</div>` +
        uploadedAssess.map(a => `<div class="uploaded-assess-card">
          <div><div class="uploaded-assess-title">${escapeHtml(a.title)}</div><div class="uploaded-assess-desc">${escapeHtml(a.description || '')}</div></div>
          <a href="${a.file_url}" target="_blank" class="btn btn-secondary btn-sm"><i class="ti ti-external-link"></i> Open</a>
        </div>`).join('');
    } else { uploadedSection.innerHTML = ''; }
  }
  const panel = document.getElementById('questionsPanel');
  if (!panel) return;
  const title = document.getElementById('assessTitle');
  const badge = document.getElementById('assessBadge');
  const { data: vac } = currentProfile.department
    ? await db.from('vacancies').select('*').eq('department', currentProfile.department).eq('posted', true).limit(1).maybeSingle()
    : { data: null };
  if (title) title.textContent = vac ? `${vac.title} — Competency Assessment` : 'General Competency Assessment';
  const { data: existingResp } = await db.from('assessment_responses').select('*').eq('candidate_id', currentUser.id).maybeSingle();
  if (existingResp) { if (badge) { badge.textContent = 'Submitted'; badge.className = 'status-pill green'; } panel.innerHTML = '<div class="notice"><i class="ti ti-check"></i> You have already submitted your assessment. Results are being reviewed.</div>'; return; }
  if (badge) { badge.textContent = 'Not Started'; badge.className = 'status-pill brand'; }
  const sampleQs = [
    { id: 'q1', text: 'How do you prioritise tasks when facing multiple deadlines?', opts: ['I work on whatever comes first', 'I assess urgency and importance, then plan accordingly', 'I ask my manager to decide', 'I focus on the easiest tasks first'] },
    { id: 'q2', text: 'Describe your approach to working in a team with diverse opinions.', opts: ['I prefer to work alone to avoid conflict', 'I listen to all views, find common ground and collaborate', 'I push my own ideas until others agree', 'I let the team lead decide without my input'] },
    { id: 'q3', text: 'How do you handle receiving critical feedback?', opts: ['I ignore it if I disagree', 'I take it personally and feel demotivated', 'I reflect on it objectively and use it to improve', 'I argue my case immediately'] },
  ];
  userAnswers = {};
  panel.innerHTML = sampleQs.map((q, i) => `
    <div class="q-card">
      <div class="q-num">Question ${i + 1}</div>
      <div class="q-text">${escapeHtml(q.text)}</div>
      <div class="q-options">${q.opts.map((opt, oi) => `
        <label class="q-opt" onclick="selectAnswer('${q.id}',${oi},this)">
          <input type="radio" name="q_${q.id}" value="${oi}"/> ${escapeHtml(opt)}
        </label>`).join('')}
      </div>
    </div>`).join('') +
    `<div style="text-align:center;margin-top:20px"><button class="btn btn-primary" onclick="submitAssessment()"><i class="ti ti-send"></i> Submit Assessment</button></div>`;
}

function selectAnswer(qId, optIdx, el) {
  userAnswers[qId] = optIdx;
  el.closest('.q-options').querySelectorAll('.q-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}

async function submitAssessment() {
  await db.from('assessment_responses').upsert({ candidate_id: currentUser.id, answers: userAnswers, submitted_at: new Date().toISOString() }, { onConflict: 'candidate_id' });
  showToast('Assessment submitted!');
  await renderCandidateAssessments();
}

/* ══════════════════════════════════════════
   PROGRESS TAB
══════════════════════════════════════════ */
async function renderProgress() {
  const candidateView = document.getElementById('progressCandidateView');
  const adminView = document.getElementById('progressAdminView');
  if (userRole === 'candidate') {
    if (candidateView) candidateView.style.display = '';
    if (adminView) adminView.style.display = 'none';
    await reloadProfile();
    applyStatus(currentProfile.status || 'reviewing');
  } else {
    if (candidateView) candidateView.style.display = 'none';
    if (adminView) adminView.style.display = '';
    await renderAdminProgress();
  }
}

async function renderAdminProgress() {
  const el = document.getElementById('progressVacancyList');
  if (!el) return;
  const { data: vacs } = await db.from('vacancies').select('*').order('created_at', { ascending: false });
  if (!vacs || !vacs.length) { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No vacancies yet.</p>'; return; }
  el.innerHTML = vacs.map(v => `
    <div class="progress-vacancy-block">
      <div class="progress-vacancy-header" onclick="toggleProgressVacancy(this,'${v.id}')">
        <div>
          <div class="progress-vacancy-title">${escapeHtml(v.title)}</div>
          <div class="progress-vacancy-meta">${escapeHtml(v.department)} · ${v.posted ? 'Posted' : 'Draft'}</div>
        </div>
        <i class="ti ti-chevron-down chevron"></i>
      </div>
      <div class="progress-applicant-list" id="pvList_${v.id}"></div>
    </div>`).join('');
}

function toggleProgressVacancy(h, vacId) {
  const list = document.getElementById('pvList_' + vacId);
  const i = h.querySelector('.chevron');
  if (list) list.classList.toggle('open');
  if (i) i.classList.toggle('open');
  if (list && list.classList.contains('open') && !list.dataset.loaded) {
    list.dataset.loaded = '1';
    loadProgressApplicants(vacId, list);
  }
}

async function loadProgressApplicants(vacId, el) {
  const { data: apps } = await db.from('applications').select('*').eq('vacancy_id', vacId);
  if (!apps || !apps.length) { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted);padding:12px 0">No applicants yet.</p>'; return; }
  const profileIds = apps.map(a => a.applicant_id);
  const { data: profiles } = await db.from('profiles').select('id,status').in('id', profileIds);
  const statusMap = Object.fromEntries((profiles || []).map(p => [p.id, p.status]));
  el.innerHTML = apps.map(app => {
    const s = statusMap[app.applicant_id] || 'reviewing';
    const cfg = statusConfig[s] || statusConfig.reviewing;
    return `<div class="applicant-row">
      <div class="applicant-row-info">
        <div class="applicant-avatar">${getInitials(app.applicant_name || app.applicant_email)}</div>
        <div><div class="applicant-row-name">${escapeHtml(app.applicant_name || app.applicant_email)}</div><div class="applicant-row-email">${escapeHtml(app.applicant_email || '')}</div></div>
      </div>
      <div class="applicant-row-actions">
        <span class="status-badge ${cfg.cls}"><i class="ti ti-circle-dot"></i>&nbsp;${cfg.label}</span>
        <button class="btn btn-secondary btn-sm" onclick="openCandidateProfile('${app.applicant_id}')"><i class="ti ti-eye"></i> View</button>
      </div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   VACANCY-SPECIFIC CALENDAR ACCESS MODAL
══════════════════════════════════════════ */
let pendingCalendarVacancyId = null;

async function openCalendarAccessModal(vacId, title) {
  pendingCalendarVacancyId = vacId;
  document.getElementById('calendarAccessVacTitle').textContent = title;
  const { data: managers } = await db.from('profiles').select('id,first_name,last_name,email,department').eq('role', 'manager').order('first_name');
  const { data: existing } = await db.from('vacancy_calendar_access').select('manager_id').eq('vacancy_id', vacId);
  const assigned = new Set((existing || []).map(r => r.manager_id));
  const list = document.getElementById('calendarManagerSelectList');
  list.innerHTML = (managers || []).map(m => {
    const name = `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email;
    const isSelected = assigned.has(m.id);
    return `<label class="manager-select-row ${isSelected ? 'selected' : ''}" onclick="this.classList.toggle('selected');this.querySelector('input').click()">
      <div><div class="manager-select-name">${escapeHtml(name)}</div><div class="manager-select-dept">${escapeHtml(m.department || '')}</div></div>
      <input type="checkbox" value="${m.id}" ${isSelected ? 'checked' : ''} style="pointer-events:none"/>
    </label>`;
  }).join('');
  document.getElementById('calendarAccessModal').classList.add('open');
}

async function saveCalendarAccess() {
  if (!pendingCalendarVacancyId) return;
  const checked = [...document.querySelectorAll('#calendarManagerSelectList input[type="checkbox"]:checked')].map(cb => cb.value);
  await db.from('vacancy_calendar_access').delete().eq('vacancy_id', pendingCalendarVacancyId);
  if (checked.length) {
    await db.from('vacancy_calendar_access').insert(checked.map(mid => ({ vacancy_id: pendingCalendarVacancyId, manager_id: mid, created_at: new Date().toISOString() })));
  }
  closeModal('calendarAccessModal');
  showToast('Calendar access saved.');
}

/* ══════════════════════════════════════════
   BOOKINGS / INTERVIEW CALENDARS
══════════════════════════════════════════ */
async function renderBookingTabs() {
  const bar = document.getElementById('bookingTabBar');
  if (!bar) return;
  const panels = document.querySelectorAll('.booking-panel');
  panels.forEach(p => p.style.display = 'none');

  let tabs = [];
  if (userRole === 'admin') {
    tabs = [
      { id: 'vacancyCalendars', icon: 'ti-calendar-event', label: 'Interview Calendars' },
      { id: 'onboarding',       icon: 'ti-presentation',   label: 'Onboarding' },
    ];
  } else if (userRole === 'manager') {
    tabs = [
      { id: 'vacancyCalendars', icon: 'ti-calendar-event', label: 'Interview Calendars' },
      { id: 'onboarding',       icon: 'ti-presentation',   label: 'Onboarding' },
    ];
  } else {
    tabs = [
      { id: 'myInterview', icon: 'ti-video',        label: 'My Interview' },
      { id: 'onboarding',  icon: 'ti-presentation', label: 'Onboarding' },
    ];
  }

  bar.innerHTML = tabs.map((t, i) => `
    <button class="booking-tab-btn ${i === 0 ? 'active' : ''}" onclick="switchBookingTab('${t.id}',this)">
      <i class="ti ${t.icon}"></i> ${t.label}
    </button>`).join('');

  switchBookingTab(tabs[0].id, bar.querySelector('.booking-tab-btn'));
}

async function switchBookingTab(panelId, btn) {
  document.querySelectorAll('.booking-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.booking-panel').forEach(p => p.style.display = 'none');
  if (btn) btn.classList.add('active');
  const panel = document.getElementById('bookingPanel-' + panelId);
  if (panel) panel.style.display = '';

  if (panelId === 'vacancyCalendars') await renderVacancyCalendars();
  if (panelId === 'onboarding')       await renderOnboardingSlots();
  if (panelId === 'myInterview')      await renderCandidateInterviewSlots();
}

/* ── Vacancy Calendars ── */
async function renderVacancyCalendars() {
  const el = document.getElementById('vacancyCalendarList');
  if (!el) return;
  el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">Loading…</p>';

  let vacs = [];
  if (userRole === 'admin') {
    const { data } = await db.from('vacancies').select('*').order('created_at', { ascending: false });
    vacs = data || [];
  } else if (userRole === 'manager') {
    const { data: access } = await db.from('vacancy_calendar_access').select('vacancy_id').eq('manager_id', currentUser.id);
    const ids = (access || []).map(r => r.vacancy_id);
    if (ids.length) { const { data } = await db.from('vacancies').select('*').in('id', ids); vacs = data || []; }
  }

  if (!vacs.length) { el.innerHTML = '<div class="notice"><i class="ti ti-info-circle"></i> No vacancies assigned to you yet.</div>'; return; }

  el.innerHTML = vacs.map(v => `
    <div class="vacancy-cal-block">
      <div class="vacancy-cal-header" onclick="toggleVacancyCalBody(this,'${v.id}')">
        <div>
          <div class="vacancy-cal-title">${escapeHtml(v.title)}</div>
          <div class="vacancy-cal-meta">${escapeHtml(v.department)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();openAddSlotModal('${v.id}','${escapeHtml(v.title).replace(/'/g,"\\'")}')"><i class="ti ti-plus"></i> Add Slot</button>
          <i class="ti ti-chevron-down chevron"></i>
        </div>
      </div>
      <div class="vacancy-cal-body" id="vcBody_${v.id}"></div>
    </div>`).join('');
}

function toggleVacancyCalBody(h, vacId) {
  const body = h.nextElementSibling;
  const i = h.querySelector('.chevron');
  body.classList.toggle('open');
  if (i) i.classList.toggle('open');
  if (body.classList.contains('open') && !body.dataset.loaded) {
    body.dataset.loaded = '1';
    loadVacancySlots(vacId, body);
  }
}

async function loadVacancySlots(vacId, bodyEl) {
  const { data: slots } = await db.from('vacancy_slots').select('*').eq('vacancy_id', vacId).order('slot_date').order('slot_time');
  if (!slots || !slots.length) { bodyEl.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No slots added yet.</p>'; return; }

  const { data: bookings } = await db.from('slot_bookings').select('*').eq('vacancy_id', vacId);
  const bookingMap = Object.fromEntries((bookings || []).map(b => [b.slot_id, b]));

  bodyEl.innerHTML = `<div class="slots-grid">${slots.map(slot => {
    const booking = bookingMap[slot.id];
    const dt = new Date(`${slot.slot_date}T${slot.slot_time}`);
    const dateLabel = dt.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeLabel = dt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    if (booking) {
      return `<div class="slot-card">
        <div class="slot-date">${dateLabel}</div>
        <div class="slot-time">${timeLabel}</div>
        <div class="slot-duration">30 min</div>
        <div class="slot-status admin-view"><i class="ti ti-user-check"></i> Booked</div>
        <div class="slot-candidate-link" onclick="openCandidateProfile('${booking.candidate_id}')"><i class="ti ti-eye"></i> ${escapeHtml(booking.candidate_name || 'View Candidate')}</div>
        ${userRole === 'admin' ? `<button class="btn btn-danger btn-sm" style="margin-top:8px;width:100%" onclick="deleteSlot('${slot.id}','${vacId}')"><i class="ti ti-trash"></i> Remove</button>` : ''}
      </div>`;
    } else {
      return `<div class="slot-card available">
        <div class="slot-date">${dateLabel}</div>
        <div class="slot-time">${timeLabel}</div>
        <div class="slot-duration">30 min</div>
        <div class="slot-status available">Available</div>
        ${userRole === 'admin' ? `<button class="btn btn-danger btn-sm" style="margin-top:8px;width:100%;justify-content:center" onclick="deleteSlot('${slot.id}','${vacId}')"><i class="ti ti-trash"></i> Remove</button>` : ''}
      </div>`;
    }
  }).join('')}</div>`;
}

let pendingAddSlotVacancyId = null;
function openAddSlotModal(vacId, title) {
  pendingAddSlotVacancyId = vacId;
  document.getElementById('addSlotVacTitle').textContent = title;
  document.getElementById('newSlotDate').value = '';
  document.getElementById('newSlotTime').value = '';
  document.getElementById('addSlotModal').classList.add('open');
}

async function addSlot() {
  const date = document.getElementById('newSlotDate').value;
  const time = document.getElementById('newSlotTime').value;
  if (!date || !time) { alert('Please select both date and time.'); return; }
  if (!pendingAddSlotVacancyId) return;
  const { error } = await db.from('vacancy_slots').insert({ vacancy_id: pendingAddSlotVacancyId, slot_date: date, slot_time: time, added_by: currentUser.id, created_at: new Date().toISOString() });
  if (error) { showToast('Could not add slot: ' + error.message, 'error'); return; }
  closeModal('addSlotModal');
  showToast('Slot added.');
  const body = document.getElementById('vcBody_' + pendingAddSlotVacancyId);
  if (body && body.classList.contains('open')) await loadVacancySlots(pendingAddSlotVacancyId, body);
}

async function deleteSlot(slotId, vacId) {
  if (!confirm('Remove this slot?')) return;
  await db.from('slot_bookings').delete().eq('slot_id', slotId);
  await db.from('vacancy_slots').delete().eq('id', slotId);
  showToast('Slot removed.');
  const body = document.getElementById('vcBody_' + vacId);
  if (body) await loadVacancySlots(vacId, body);
}

/* ── Candidate Interview Slots ── */
async function renderCandidateInterviewSlots() {
  const el = document.getElementById('candidateVacancySlots');
  const myBookingSection = document.getElementById('myCurrentBooking');
  const myBookingDetails = document.getElementById('myBookingDetails');
  if (!el) return;

  const { data: myApps } = await db.from('applications').select('vacancy_id').eq('applicant_id', currentUser.id);
  const myVacIds = (myApps || []).map(a => a.vacancy_id);

  if (!myVacIds.length) { el.innerHTML = '<div class="notice"><i class="ti ti-info-circle"></i> You have not applied to any vacancies yet.</div>'; return; }

  const { data: myBooking } = await db.from('slot_bookings').select('*').eq('candidate_id', currentUser.id).maybeSingle();

  if (myBooking && myBookingSection && myBookingDetails) {
    const dt = new Date(`${myBooking.slot_date}T${myBooking.slot_time}`);
    const dateLabel = dt.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeLabel = dt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    myBookingSection.classList.remove('hidden');
    myBookingDetails.innerHTML = `<div class="my-booking-card">
      <div class="my-booking-info">
        <div class="my-booking-label"><i class="ti ti-check"></i> Interview Booked</div>
        <div class="my-booking-time">${timeLabel}</div>
        <div class="my-booking-date">${dateLabel} · 30 min</div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="cancelInterviewBooking('${myBooking.slot_id}')"><i class="ti ti-x"></i> Cancel</button>
    </div>`;
  } else {
    if (myBookingSection) myBookingSection.classList.add('hidden');
  }

  const { data: slots } = await db.from('vacancy_slots').select('*').in('vacancy_id', myVacIds).order('slot_date').order('slot_time');
  const { data: allBookings } = await db.from('slot_bookings').select('slot_id').in('vacancy_id', myVacIds);
  const bookedSlotIds = new Set((allBookings || []).map(b => b.slot_id));

  const available = (slots || []).filter(s => !bookedSlotIds.has(s.id));
  if (!available.length && !myBooking) { el.innerHTML = '<div class="notice"><i class="ti ti-info-circle"></i> No available interview slots yet. Check back soon.</div>'; return; }
  if (!available.length) { el.innerHTML = ''; return; }

  el.innerHTML = `<div class="card-title" style="margin-bottom:12px"><i class="ti ti-clock"></i> Available Slots</div>
    <div class="slots-grid">${available.map(slot => {
      const dt = new Date(`${slot.slot_date}T${slot.slot_time}`);
      const dateLabel = dt.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
      const timeLabel = dt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
      return `<div class="slot-card available">
        <div class="slot-date">${dateLabel}</div>
        <div class="slot-time">${timeLabel}</div>
        <div class="slot-duration">30 min</div>
        <div class="slot-status available">Available</div>
        <button class="btn btn-primary btn-sm" style="margin-top:10px;width:100%;justify-content:center" onclick="bookInterviewSlot('${slot.id}','${slot.vacancy_id}','${slot.slot_date}','${slot.slot_time}')"><i class="ti ti-calendar-plus"></i> Book</button>
      </div>`;
    }).join('')}</div>`;
}

async function bookInterviewSlot(slotId, vacId, slotDate, slotTime) {
  const existing = await db.from('slot_bookings').select('id').eq('candidate_id', currentUser.id).maybeSingle();
  if (existing.data) { showToast('You already have a booked interview. Cancel it first.', 'error'); return; }
  const name = `${currentProfile.first_name} ${currentProfile.last_name}`.trim();
  const { error } = await db.from('slot_bookings').insert({ slot_id: slotId, vacancy_id: vacId, candidate_id: currentUser.id, candidate_name: name, candidate_email: currentProfile.email, slot_date: slotDate, slot_time: slotTime, booked_at: new Date().toISOString() });
  if (error) { showToast('Could not book: ' + error.message, 'error'); return; }
  const dt = new Date(`${slotDate}T${slotTime}`);
  await sendInterviewConfirmationEmail(currentProfile.email, name, dt.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' }), dt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }));
  showToast('Interview booked! Confirmation email sent.');
  await renderCandidateInterviewSlots();
}

function cancelInterviewBooking(slotId) {
  const cancelText = document.getElementById('cancelInterviewText');
  if (cancelText) cancelText.textContent = 'Are you sure you want to cancel your interview booking? You can re-book another available slot.';
  document.getElementById('cancelInterviewYes').onclick = async () => {
    const { data: booking } = await db.from('slot_bookings').select('*').eq('slot_id', slotId).eq('candidate_id', currentUser.id).maybeSingle();
    await db.from('slot_bookings').delete().eq('slot_id', slotId).eq('candidate_id', currentUser.id);
    if (booking) {
      const dt = new Date(`${booking.slot_date}T${booking.slot_time}`);
      await sendInterviewCancellationEmail(currentProfile.email, `${currentProfile.first_name} ${currentProfile.last_name}`.trim(), dt.toLocaleDateString('en-ZA'), dt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }));
    }
    closeModal('cancelInterviewModal');
    showToast('Interview cancelled.');
    await renderCandidateInterviewSlots();
  };
  document.getElementById('cancelInterviewModal').classList.add('open');
}

/* ── Onboarding ── */
async function renderOnboardingSlots() {
  const grid = document.getElementById('onboardingGrid');
  const addBtn = document.getElementById('addOnboardingSlotBtn');
  if (!grid) return;
  if (addBtn) addBtn.style.display = userRole === 'admin' ? '' : 'none';
  const { data: slots } = await db.from('onboarding_slots').select('*').order('slot_date').order('slot_time');
  if (!slots || !slots.length) { grid.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No onboarding slots yet.</p>'; return; }
  grid.innerHTML = slots.map(slot => {
    const dt = new Date(`${slot.slot_date}T${slot.slot_time}`);
    const dateLabel = dt.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
    const timeLabel = dt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    const isBooked = !!slot.booked_by;
    const isMine = slot.booked_by === currentUser.id;
    return `<div class="slot-card ${isBooked ? (isMine ? 'booked-mine' : '') : 'available'}">
      <div class="slot-date">${dateLabel}</div>
      <div class="slot-time">${timeLabel}</div>
      ${isBooked ? `<div class="slot-presenter">${escapeHtml(slot.presenter_name || '')}</div><div class="slot-topic">${escapeHtml(slot.topic || '')}</div>
        <div class="slot-status ${isMine ? 'mine' : 'booked'}">${isMine ? 'Your Session' : 'Booked'}</div>
        ${isMine ? `<button class="btn btn-danger btn-sm" style="margin-top:8px;width:100%;justify-content:center" onclick="cancelOnboardingSlot('${slot.id}')"><i class="ti ti-x"></i> Cancel</button>` : ''}
        ${userRole === 'admin' ? `<button class="btn btn-danger btn-sm" style="margin-top:6px;width:100%;justify-content:center" onclick="deleteOnboardingSlot('${slot.id}')"><i class="ti ti-trash"></i> Delete</button>` : ''}` :
      `<div class="slot-status available">Available</div>
        ${userRole !== 'candidate' ? `<button class="btn btn-primary btn-sm" style="margin-top:8px;width:100%;justify-content:center" onclick="openOnboardingTopicModal('${slot.id}')"><i class="ti ti-calendar-plus"></i> Book</button>` : ''}
        ${userRole === 'admin' ? `<button class="btn btn-danger btn-sm" style="margin-top:6px;width:100%;justify-content:center" onclick="deleteOnboardingSlot('${slot.id}')"><i class="ti ti-trash"></i> Delete</button>` : ''}`}
    </div>`;
  }).join('');
}

function openAddOnboardingSlotModal() { document.getElementById('newOnboardingDate').value = ''; document.getElementById('newOnboardingTime').value = ''; document.getElementById('addOnboardingSlotModal').classList.add('open'); }

async function addOnboardingSlot() {
  const date = document.getElementById('newOnboardingDate').value;
  const time = document.getElementById('newOnboardingTime').value;
  if (!date || !time) { alert('Please select date and time.'); return; }
  await db.from('onboarding_slots').insert({ slot_date: date, slot_time: time, created_by: currentUser.id, created_at: new Date().toISOString() });
  closeModal('addOnboardingSlotModal');
  showToast('Onboarding slot added.');
  await renderOnboardingSlots();
}

function openOnboardingTopicModal(slotId) { pendingOnboardingSlotId = slotId; document.getElementById('onboardingPresenterName').value = `${currentProfile.first_name} ${currentProfile.last_name}`.trim(); document.getElementById('onboardingTopic').value = ''; document.getElementById('onboardingTopicModal').classList.add('open'); }

async function confirmOnboardingBook() {
  const name = document.getElementById('onboardingPresenterName').value.trim();
  const topic = document.getElementById('onboardingTopic').value.trim();
  if (!name || !topic) { alert('Please fill in both fields.'); return; }
  await db.from('onboarding_slots').update({ booked_by: currentUser.id, presenter_name: name, topic, booked_at: new Date().toISOString() }).eq('id', pendingOnboardingSlotId);
  closeModal('onboardingTopicModal');
  showToast('Onboarding session booked.');
  await renderOnboardingSlots();
}

function cancelOnboardingSlot(slotId) {
  document.getElementById('cancelOnboardingText').textContent = 'Are you sure you want to cancel your onboarding session?';
  document.getElementById('cancelOnboardingYes').onclick = async () => {
    await db.from('onboarding_slots').update({ booked_by: null, presenter_name: null, topic: null, booked_at: null }).eq('id', slotId);
    closeModal('cancelOnboardingModal');
    showToast('Onboarding session cancelled.');
    await renderOnboardingSlots();
  };
  document.getElementById('cancelOnboardingModal').classList.add('open');
}

async function deleteOnboardingSlot(slotId) {
  if (!confirm('Delete this onboarding slot?')) return;
  await db.from('onboarding_slots').delete().eq('id', slotId);
  await renderOnboardingSlots();
  showToast('Slot deleted.');
}

/* ══════════════════════════════════════════
   STATS
══════════════════════════════════════════ */
async function renderStats() {
  const el = document.getElementById('statsPanel');
  if (!el) return;
  const { data: apps } = await db.from('applications').select('*');
  const { data: vacs } = await db.from('vacancies').select('*');
  const { data: candidates } = await db.from('profiles').select('*').eq('role', 'candidate');
  const { data: slots } = await db.from('vacancy_slots').select('*');
  const { data: bookings } = await db.from('slot_bookings').select('*');
  const totalApps = (apps || []).length;
  const totalVacs = (vacs || []).length;
  const totalCandidates = (candidates || []).length;
  const totalBooked = (bookings || []).length;
  const byDept = {};
  (vacs || []).forEach(v => { byDept[v.department] = (byDept[v.department] || 0) + 1; });
  const deptKeys = Object.keys(byDept);
  const maxDept = Math.max(...Object.values(byDept), 1);
  const statusCounts = {};
  (candidates || []).forEach(c => { const s = c.status || 'reviewing'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
  const statusEntries = Object.entries(statusCounts);
  const totalForDonut = statusEntries.reduce((a, [, v]) => a + v, 0) || 1;
  const donutColours = ['#00aeef', '#9a258f', '#b2d33e', '#faa61a', '#ef4444', '#16a34a'];
  let donutOffset = 0;
  const donutParts = statusEntries.map(([s, count], i) => {
    const pct = (count / totalForDonut) * 100;
    const stroke = `stroke-dasharray: ${pct} ${100 - pct}; stroke-dashoffset: ${-donutOffset};`;
    donutOffset += pct;
    return `<circle cx="21" cy="21" r="15.9" fill="none" stroke="${donutColours[i % donutColours.length]}" stroke-width="6" style="${stroke}" transform="rotate(-90 21 21)"/>`;
  }).join('');

  el.innerHTML = `
    <div class="stats-grid" id="statsDownloadTarget">
      <div class="stat-card brand-accent"><i class="ti ti-users s-icon"></i><div class="s-label">Total Candidates</div><div class="s-value">${totalCandidates}</div></div>
      <div class="stat-card purple-accent"><i class="ti ti-briefcase s-icon"></i><div class="s-label">Open Vacancies</div><div class="s-value">${totalVacs}</div></div>
      <div class="stat-card yellow-accent"><i class="ti ti-send s-icon"></i><div class="s-label">Applications</div><div class="s-value">${totalApps}</div></div>
      <div class="stat-card green-accent"><i class="ti ti-calendar-check s-icon"></i><div class="s-label">Interviews Booked</div><div class="s-value">${totalBooked}</div></div>
    </div>
    <div class="stats-chart-row">
      <div class="chart-card"><h4>Vacancies by Department</h4>
        <div class="bar-chart">${deptKeys.map((d, i) => {
          const h = Math.round((byDept[d] / maxDept) * 100);
          return `<div class="bar-col"><div class="bar-val">${byDept[d]}</div><div class="bar" style="height:${h}%;background:${donutColours[i % donutColours.length]}"></div><div class="bar-label">${d.split(' ')[0]}</div></div>`;
        }).join('')}</div>
      </div>
      <div class="chart-card"><h4>Candidate Pipeline</h4>
        <div class="donut-wrap">
          <svg viewBox="0 0 42 42" width="120" height="120">${donutParts}</svg>
          <div class="donut-legend">${statusEntries.map(([s, count], i) => `
            <div class="legend-item"><span class="legend-dot" style="background:${donutColours[i % donutColours.length]}"></span>${statusConfig[s]?.label || s}: <strong>${count}</strong></div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
}

function downloadStatsImage() {
  showToast('To save: right-click the stats panel and choose "Save as image" or take a screenshot.');
}

/* ══════════════════════════════════════════
   DOCUMENT SIGNING (LIVE — ADOBE STYLE)
══════════════════════════════════════════ */
async function renderSignTab() {
  const adminView = document.getElementById('signAdminView');
  const managerView = document.getElementById('signManagerView');
  if (userRole === 'admin') {
    if (adminView) adminView.style.display = '';
    if (managerView) managerView.style.display = 'none';
    await renderAllDocsList();
    await renderManagerSignStatus();
  } else if (userRole === 'manager') {
    if (adminView) adminView.style.display = 'none';
    if (managerView) managerView.style.display = '';
    await renderMyDocsList();
  } else {
    if (adminView) adminView.style.display = 'none';
    if (managerView) managerView.style.display = 'none';
  }
}

async function renderAllDocsList() {
  const el = document.getElementById('signAllDocsList');
  if (!el) return;
  const { data: docs } = await db.from('sign_documents').select('*').order('created_at', { ascending: false });
  if (!docs || !docs.length) { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No documents uploaded yet.</p>'; return; }
  el.innerHTML = docs.map(doc => `
    <div class="sign-doc-card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <div class="sign-doc-title">${escapeHtml(doc.title)}</div>
          <div class="sign-doc-meta">${escapeHtml(doc.description || '')} · Uploaded ${new Date(doc.created_at).toLocaleDateString('en-ZA')}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="openSignDocModal('${doc.id}',false)"><i class="ti ti-eye"></i> View</button>
          <button class="btn btn-secondary btn-sm" onclick="openAssignDocModal('${doc.id}','${escapeHtml(doc.title).replace(/'/g,"\\'")}')"><i class="ti ti-send"></i> Assign</button>
          <button class="btn btn-danger btn-sm" onclick="deleteSignDocument('${doc.id}')"><i class="ti ti-trash"></i></button>
        </div>
      </div>
    </div>`).join('');
}

async function renderManagerSignStatus() {
  const el = document.getElementById('signManagerStatusList');
  if (!el) return;
  const { data: assignments } = await db.from('document_assignments').select('*, sign_documents(title), profiles(first_name,last_name,email)').order('created_at', { ascending: false });
  if (!assignments || !assignments.length) { el.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">No assignments yet.</p>'; return; }
  el.innerHTML = assignments.map(a => {
    const managerName = a.profiles ? `${a.profiles.first_name || ''} ${a.profiles.last_name || ''}`.trim() || a.profiles.email : a.manager_id;
    const docTitle = a.sign_documents?.title || 'Document';
    const isSigned = !!a.signed_at;
    return `<div class="sign-doc-card">
      <div class="sign-doc-title">${escapeHtml(docTitle)}</div>
      <div class="signature-row">
        <span>${escapeHtml(managerName)}</span>
        <span class="${isSigned ? 'sign-status-signed' : 'sign-status-pending'}">
          <i class="ti ti-${isSigned ? 'check' : 'clock'}"></i> ${isSigned ? 'Signed ' + new Date(a.signed_at).toLocaleDateString('en-ZA') : 'Pending'}
        </span>
      </div>
    </div>`;
  }).join('');
}

async function renderMyDocsList() {
  const el = document.getElementById('signMyDocsList');
  if (!el) return;
  const { data: assignments } = await db.from('document_assignments').select('*, sign_documents(id,title,description,file_url)').eq('manager_id', currentUser.id).order('created_at', { ascending: false });
  if (!assignments || !assignments.length) { el.innerHTML = '<div class="notice"><i class="ti ti-info-circle"></i> No documents assigned to you for signing.</div>'; return; }
  el.innerHTML = assignments.map(a => {
    const doc = a.sign_documents || {};
    const isSigned = !!a.signed_at;
    return `<div class="sign-doc-card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <div class="sign-doc-title">${escapeHtml(doc.title || 'Document')}</div>
          <div class="sign-doc-meta">${escapeHtml(doc.description || '')} · Assigned ${new Date(a.created_at).toLocaleDateString('en-ZA')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="${isSigned ? 'sign-status-signed' : 'sign-status-pending'}"><i class="ti ti-${isSigned ? 'check' : 'clock'}"></i> ${isSigned ? 'Signed' : 'Pending'}</span>
          <button class="btn btn-primary btn-sm" onclick="openSignDocModal('${doc.id}',true,'${a.id}')"><i class="ti ti-pen"></i> ${isSigned ? 'View & Re-sign' : 'Open & Sign'}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ── Upload Document ── */
function openUploadDocModal() {
  pendingUploadDocFileObj = null;
  document.getElementById('uploadDocTitle').value = '';
  document.getElementById('uploadDocDesc').value = '';
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
  if (!title) { alert('Please enter a document title.'); return; }
  let fileUrl = '';
  if (pendingUploadDocFileObj) {
    const path = `sign_docs/${Date.now()}_${pendingUploadDocFileObj.name}`;
    const { error } = await db.storage.from('sign_docs').upload(path, pendingUploadDocFileObj, { upsert: true });
    if (!error) { const { data } = db.storage.from('sign_docs').getPublicUrl(path); fileUrl = data?.publicUrl || ''; }
  }
  const { error } = await db.from('sign_documents').insert({ title, description: desc, file_url: fileUrl, uploaded_by: currentUser.id, created_at: new Date().toISOString() });
  if (error) { showToast('Could not save: ' + error.message, 'error'); return; }
  closeModal('uploadDocModal');
  showToast('Document uploaded.');
  await renderAllDocsList();
}

async function deleteSignDocument(docId) {
  if (!confirm('Delete this document and all its assignments?')) return;
  await db.from('document_assignments').delete().eq('document_id', docId);
  await db.from('document_signatures').delete().eq('document_id', docId);
  await db.from('sign_documents').delete().eq('id', docId);
  await renderAllDocsList();
  await renderManagerSignStatus();
  showToast('Document deleted.');
}

/* ── Assign Document ── */
function openAssignDocModal(docId, title) {
  pendingAssignDocId = docId;
  document.getElementById('assignDocTitleLabel').textContent = title;
  loadManagerSelectList();
  document.getElementById('assignDocModal').classList.add('open');
}

async function loadManagerSelectList() {
  const { data: managers } = await db.from('profiles').select('id,first_name,last_name,email,department').eq('role', 'manager').order('first_name');
  const list = document.getElementById('managerSelectList');
  list.innerHTML = (managers || []).map(m => {
    const name = `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email;
    return `<label class="manager-select-row" onclick="this.classList.toggle('selected');this.querySelector('input').click()">
      <div><div class="manager-select-name">${escapeHtml(name)}</div><div class="manager-select-dept">${escapeHtml(m.department || '')}</div></div>
      <input type="checkbox" value="${m.id}" style="pointer-events:none"/>
    </label>`;
  }).join('');
}

async function confirmAssignDocument() {
  if (!pendingAssignDocId) return;
  const checked = [...document.querySelectorAll('#managerSelectList input[type="checkbox"]:checked')].map(cb => cb.value);
  if (!checked.length) { alert('Please select at least one manager.'); return; }
  await db.from('document_assignments').delete().eq('document_id', pendingAssignDocId);
  await db.from('document_assignments').insert(checked.map(mid => ({ document_id: pendingAssignDocId, manager_id: mid, created_at: new Date().toISOString() })));
  closeModal('assignDocModal');
  showToast('Document assigned to managers.');
  await renderManagerSignStatus();
}

/* ══════════════════════════════════════════
   LIVE DOCUMENT SIGNING MODAL
══════════════════════════════════════════ */
async function openSignDocModal(docId, canSign, assignmentId) {
  currentSignDocId = docId;
  currentSignAssigneeId = assignmentId || null;
  _sigCanvas = null; _sigCtx = null; _sigDrawing = false; _currentSigMode = 'draw';

  const { data: doc } = await db.from('sign_documents').select('*').eq('id', docId).single();
  if (!doc) return;

  document.getElementById('signDocTitle').textContent = doc.title;

  // Build signature panel
  const sigPanel = canSign ? `
    <div class="card" style="margin-bottom:20px">
      <div class="card-title"><i class="ti ti-pen"></i> Add Your Signature</div>
      <div class="sig-type-tabs">
        <button class="sig-type-tab active" id="sigTabDraw" onclick="switchSigMode('draw')"><i class="ti ti-pencil"></i> Draw</button>
        <button class="sig-type-tab" id="sigTabType" onclick="switchSigMode('type')"><i class="ti ti-keyboard"></i> Type</button>
      </div>
      <div id="sigDrawPanel">
        <div class="sig-canvas-wrap" id="sigCanvasWrap">
          <canvas id="sigCanvas" width="600" height="140"></canvas>
          <div class="sig-canvas-line"></div>
          <div class="sig-canvas-hint">Sign above this line</div>
        </div>
        <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="clearSigCanvas()"><i class="ti ti-eraser"></i> Clear</button>
      </div>
      <div id="sigTypePanel" style="display:none">
        <div class="form-group"><label>Type your full name</label>
          <input type="text" id="sigTypeInput" placeholder="Your full name" oninput="updateTypedSig(this.value)" value="${escapeHtml(`${currentProfile.first_name || ''} ${currentProfile.last_name || ''}`.trim())}"/>
        </div>
        <div style="margin-top:8px"><span class="typed-sig-preview" id="typedSigPreview">${escapeHtml(`${currentProfile.first_name || ''} ${currentProfile.last_name || ''}`.trim())}</span></div>
      </div>
      <button class="btn btn-primary" style="margin-top:16px;width:100%;justify-content:center" onclick="placeSignature('${docId}','${assignmentId || ''}')">
        <i class="ti ti-pen"></i> Place Signature on Document
      </button>
    </div>` : '';

  // PDF / file viewer
  const viewer = doc.file_url
    ? `<div style="margin-bottom:20px;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden">
        <iframe src="${doc.file_url}" style="width:100%;height:65vh;border:none" title="${escapeHtml(doc.title)}"></iframe>
       </div>`
    : `<div class="notice" style="margin-bottom:20px"><i class="ti ti-file-description"></i> No PDF attached to this document.</div>`;

  document.getElementById('signDocContent').innerHTML = viewer + sigPanel + `<div id="liveSignaturesList"></div>`;

  const signBtn = document.getElementById('signDocBtn');
  if (signBtn) signBtn.style.display = 'none'; // hide old btn, we embed the action

  document.getElementById('signDocModal').classList.add('open');

  // Init canvas after DOM insert
  if (canSign) {
    setTimeout(() => initSigCanvas(), 100);
  }
  await loadLiveSignatures(docId);
}

function switchSigMode(mode) {
  _currentSigMode = mode;
  document.getElementById('sigDrawPanel').style.display = mode === 'draw' ? '' : 'none';
  document.getElementById('sigTypePanel').style.display = mode === 'type' ? '' : 'none';
  document.getElementById('sigTabDraw').classList.toggle('active', mode === 'draw');
  document.getElementById('sigTabType').classList.toggle('active', mode === 'type');
  if (mode === 'draw') setTimeout(() => initSigCanvas(), 50);
}

function updateTypedSig(val) {
  const el = document.getElementById('typedSigPreview');
  if (el) el.textContent = val;
}

function initSigCanvas() {
  const canvas = document.getElementById('sigCanvas');
  if (!canvas) return;
  _sigCanvas = canvas;
  _sigCtx = canvas.getContext('2d');
  _sigCtx.strokeStyle = '#1a237e';
  _sigCtx.lineWidth = 2.5;
  _sigCtx.lineCap = 'round';
  _sigCtx.lineJoin = 'round';
  canvas.addEventListener('mousedown',  sigStart);
  canvas.addEventListener('mousemove',  sigMove);
  canvas.addEventListener('mouseup',    sigEnd);
  canvas.addEventListener('mouseleave', sigEnd);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; const r = canvas.getBoundingClientRect(); sigStart({ offsetX: t.clientX - r.left, offsetY: t.clientY - r.top }); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); const t = e.touches[0]; const r = canvas.getBoundingClientRect(); sigMove({ offsetX: t.clientX - r.left, offsetY: t.clientY - r.top }); }, { passive: false });
  canvas.addEventListener('touchend',   sigEnd);
}

function sigStart(e) { _sigDrawing = true; _sigLastX = e.offsetX; _sigLastY = e.offsetY; }
function sigMove(e)  { if (!_sigDrawing || !_sigCtx) return; _sigCtx.beginPath(); _sigCtx.moveTo(_sigLastX, _sigLastY); _sigCtx.lineTo(e.offsetX, e.offsetY); _sigCtx.stroke(); _sigLastX = e.offsetX; _sigLastY = e.offsetY; }
function sigEnd()    { _sigDrawing = false; }
function clearSigCanvas() { if (_sigCtx && _sigCanvas) _sigCtx.clearRect(0, 0, _sigCanvas.width, _sigCanvas.height); }

async function placeSignature(docId, assignmentId) {
  let sigData = null;
  const sigName = `${currentProfile.first_name || ''} ${currentProfile.last_name || ''}`.trim();
  if (_currentSigMode === 'draw') {
    if (!_sigCanvas) { showToast('Signature canvas not ready.', 'error'); return; }
    // Check if anything was drawn
    const imgData = _sigCtx.getImageData(0, 0, _sigCanvas.width, _sigCanvas.height);
    const hasDrawing = imgData.data.some(v => v !== 0);
    if (!hasDrawing) { showToast('Please draw your signature first.', 'error'); return; }
    sigData = _sigCanvas.toDataURL('image/png');
  } else {
    const typed = document.getElementById('sigTypeInput')?.value.trim();
    if (!typed) { showToast('Please type your name.', 'error'); return; }
    sigData = 'typed:' + typed;
  }

  const { error } = await db.from('document_signatures').insert({
    document_id: docId,
    signer_id: currentUser.id,
    signer_name: sigName,
    sig_data: sigData,
    sig_mode: _currentSigMode,
    signed_at: new Date().toISOString()
  });
  if (error) { showToast('Could not save signature: ' + error.message, 'error'); return; }

  // Mark assignment as signed
  if (assignmentId) {
    await db.from('document_assignments').update({ signed_at: new Date().toISOString() }).eq('id', assignmentId);
  }

  clearSigCanvas();
  showToast('Signature placed!');
  await loadLiveSignatures(docId);
  if (userRole === 'manager') await renderMyDocsList();
  if (userRole === 'admin') await renderManagerSignStatus();
}

async function loadLiveSignatures(docId) {
  const el = document.getElementById('liveSignaturesList');
  if (!el) return;
  const { data: sigs } = await db.from('document_signatures').select('*').eq('document_id', docId).order('signed_at');
  if (!sigs || !sigs.length) { el.innerHTML = ''; return; }

  el.innerHTML = `<div class="card" style="margin-top:20px">
    <div class="card-title"><i class="ti ti-signature"></i> Signatures on this Document (${sigs.length})</div>
    ${sigs.map(sig => {
      const isMine = sig.signer_id === currentUser.id;
      const isTyped = sig.sig_data?.startsWith('typed:');
      const typedName = isTyped ? sig.sig_data.replace('typed:', '') : '';
      const sigDisplay = isTyped
        ? `<span class="typed-sig-preview" style="font-size:22px">${escapeHtml(typedName)}</span>`
        : `<img src="${sig.sig_data}" alt="signature" style="max-height:60px;max-width:200px;border-bottom:1px solid #1a237e"/>`;
      return `<div class="placed-sig-record ${isMine ? 'own' : ''}">
        <div>
          <div class="placed-sig-record-name">${escapeHtml(sig.signer_name)}</div>
          <div class="placed-sig-record-date">${new Date(sig.signed_at).toLocaleString('en-ZA')}</div>
          <div style="margin-top:6px">${sigDisplay}</div>
        </div>
        ${isMine || userRole === 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteSignature('${sig.id}','${docId}')"><i class="ti ti-trash"></i></button>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

async function deleteSignature(sigId, docId) {
  if (!confirm('Remove this signature?')) return;
  await db.from('document_signatures').delete().eq('id', sigId);
  await loadLiveSignatures(docId);
  showToast('Signature removed.');
}

/* ══════════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════════ */
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
document.addEventListener('click', e => { if (e.target.classList.contains('modal-overlay')) { e.target.classList.remove('open'); } });

/* ══════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════ */
function escapeHtml(s) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function getInitials(name) { if (!name) return '?'; const parts = name.trim().split(' '); return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase(); }

function setButtonLoading(btn, loading, restoreHtml) {
  if (loading) { btn.disabled = true; btn.innerHTML = '<span class="loading-spinner"></span> Please wait…'; }
  else { btn.disabled = false; if (restoreHtml) btn.innerHTML = restoreHtml; }
}

function showAuthMessage(msg, type) {
  const el = document.getElementById('authMessage');
  if (!el) return;
  el.textContent = msg; el.className = 'auth-message ' + type; el.classList.remove('hidden');
}
function clearAuthMessage() { const el = document.getElementById('authMessage'); if (el) { el.className = 'auth-message hidden'; el.textContent = ''; } }

let _toastTimeout;
function showToast(msg, type = 'success') {
  let toast = document.getElementById('globalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.style.cssText = `position:fixed;bottom:28px;right:28px;z-index:9999;background:var(--text-primary);color:#fff;padding:12px 22px;border-radius:var(--radius-md);font-size:13px;font-weight:500;box-shadow:var(--shadow-lg);transition:opacity 0.3s;display:flex;align-items:center;gap:8px;max-width:360px;`;
    document.body.appendChild(toast);
  }
  toast.style.background = type === 'error' ? 'var(--danger)' : 'var(--text-primary)';
  toast.innerHTML = `<i class="ti ti-${type === 'error' ? 'alert-circle' : 'check'}"></i> ${escapeHtml(msg)}`;
  toast.style.opacity = '1';
  clearTimeout(_toastTimeout);
  _toastTimeout = setTimeout(() => { toast.style.opacity = '0'; }, 3500);
}
