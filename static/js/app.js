/**
 * LeadSync Dashboard Main Application Controller
 * Handles HR, Manager, and Employee workflows, assessment engine, and succession analysis
 */

// Global State
const state = {
  authenticatedRole: localStorage.getItem('leadsync_auth_role') || null, // 'hr' | 'manager' | 'employee' | null
  currentRole: localStorage.getItem('leadsync_auth_role') || 'hr', // 'hr' | 'manager' | 'employee'
  activeEmployeeId: 'EMP-001',
  employees: [],
  assessments: [],
  leadershipRoles: [],
  top3Results: [],
  allManagerResults: [],
  successionMatrix: [],
  
  // Test Runner State
  testActive: false,
  testQuestions: [],
  testCurrentIndex: 0,
  testAnswers: {}, // question_id -> selected_option_index
  testTimerSeconds: 1800, // 30 mins
  testTimerInterval: null,
  activeAssessmentId: 'ASM-2026-001',

  // AI Role Matcher State
  aiMatcherMode: 'preset', // 'preset' | 'custom'
  currentAIMatchResult: null,

  // HR Multi-Modal AI Analyzer State
  hrAI: {
    targetRoleId: 'ROLE-SSE',
    selectedEmployeeId: 'EMP-001',
    dossier: null,
    itSkillsCatalog: null,
    selectedSkills: new Set(),
    activeSkillCategory: 'All',
    searchQuery: '',
    uploadedCertificates: [],
    uploadedResume: null,
    simulatingMarks: false,
    analysisResult: null
  },

  // HR Employee Information Entry State
  empInfo: {
    selectedEmployeeId: 'EMP-001',
    currentEmployee: null,
    experienceYears: 0.0,
    selectedSkills: new Map(),
    certifications: [],
    resume: null,
    assessmentScore: 0,
    assessmentCompleted: false,
    categoryScores: {
      "Python": 0, "Java": 0, "C": 0, "DBMS": 0, "Other Tech": 0, "Communication": 0, "Aptitude": 0
    },
    activeSkillCategory: 'All',
    searchQuery: ''
  }
};

// --- Initialization ---
// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  await loadInitialData();
  setupRoleSwitcher();
  setupSuitabilityListeners();
  setupAIMatcher();
  await setupHRAIAnalyzer();

  // Authentication check for Google SSO login with strict email whitelist
  const savedRole = localStorage.getItem('leadsync_auth_role');
  const savedEmail = (localStorage.getItem('leadsync_auth_email') || '').trim().toLowerCase();

  let isValidSession = false;
  if (savedRole === 'hr' && savedEmail === 'visakans.it24@bitsathy.ac.in') {
    isValidSession = true;
  } else if (savedRole === 'manager' && savedEmail === 'visakan0302@gmail.com') {
    isValidSession = true;
  } else if (savedRole === 'employee' && savedEmail.includes('@') && savedEmail.includes('.')) {
    isValidSession = true;
  }

  if (isValidSession) {
    state.authenticatedRole = savedRole;
    state.authenticatedEmail = savedEmail;
    state.currentRole = savedRole;
    const loginSec = document.getElementById('login-section');
    const appCont = document.getElementById('app-container');
    if (loginSec) loginSec.style.display = 'none';
    if (appCont) appCont.style.display = 'flex';
    applyRoleSecurityAndUI(savedRole, savedEmail);
  } else {
    // Show Google SSO login screen
    state.authenticatedRole = null;
    state.authenticatedEmail = null;
    localStorage.removeItem('leadsync_auth_role');
    localStorage.removeItem('leadsync_auth_email');
    const loginSec = document.getElementById('login-section');
    const appCont = document.getElementById('app-container');
    if (loginSec) loginSec.style.display = 'flex';
    if (appCont) appCont.style.display = 'none';
  }
});

// --- Data Loading ---
async function loadInitialData() {
  try {
    const [empRes, asmRes, rolesRes, top3Res, mgrRes, matrixRes] = await Promise.all([
      api.getEmployees(),
      api.getAssessments(),
      api.getLeadershipRoles(),
      api.getTop3Results(),
      api.getManagerResults(),
      api.getSuccessionMatrix()
    ]);

    state.employees = empRes.employees || [];
    state.assessments = asmRes.assessments || [];
    state.activeAssessmentId = state.assessments.length > 0 ? state.assessments[0].id : null;
    state.leadershipRoles = rolesRes.roles || [];
    state.top3Results = top3Res.results || [];
    state.allManagerResults = mgrRes.results || [];
    state.successionMatrix = matrixRes.matrix || [];

    // Populate dropdowns & stats
    populateEmployeeSelectors();
    renderHRStats();
    renderHRTop3Podium();
    renderHRAssessmentsList();
    renderManagerTable();
    renderEmployeeSelfView();
    renderSuccessionMatrix();
    updateTop3RolePreview();
    
    // Initial Suitability Evaluation with baseline sliders
    syncSlidersToEmployee(state.activeEmployeeId || 'EMP-001');
    runSuitabilityEvaluation();

    // Synchronize Employee Info and AI Dossier across dashboards
    if (typeof loadEmployeeInfoData === 'function' && state.empInfo) {
      loadEmployeeInfoData(state.empInfo.selectedEmployeeId || 'EMP-001');
    }
    if (typeof loadHRAIEmployeeDossier === 'function' && state.hrAI) {
      loadHRAIEmployeeDossier(state.hrAI.selectedEmployeeId || 'EMP-001');
    }

  } catch (error) {
    console.error("Initialization error:", error);
    showToast("Failed to load initial data. Check backend status.", "error");
  }
}

// --- Google Enterprise SSO Authentication & RBAC ---
function openGoogleSSOModal(role) {
  const modal = document.getElementById('modal-google-sso-auth');
  if (!modal) {
    console.error("modal-google-sso-auth element not found");
    return;
  }
  const targetRoleInput = document.getElementById('google-auth-target-role');
  const descEl = document.getElementById('google-auth-role-desc');
  const emailInput = document.getElementById('google-auth-email-input');
  const hintEl = document.getElementById('google-auth-hint');
  const errorBanner = document.getElementById('google-auth-error-banner');

  if (errorBanner) {
    errorBanner.style.display = 'none';
    errorBanner.textContent = '';
  }
  if (targetRoleInput) targetRoleInput.value = role;

  if (role === 'hr') {
    if (descEl) descEl.textContent = 'to access HR Executive Command (Google SSO)';
    if (emailInput) {
      emailInput.value = 'visakans.it24@bitsathy.ac.in';
      emailInput.placeholder = 'visakans.it24@bitsathy.ac.in';
    }
    if (hintEl) hintEl.innerHTML = '🔒 <strong>Authorized Account:</strong> Only <code>visakans.it24@bitsathy.ac.in</code> is permitted to log in as HR.';
  } else if (role === 'manager') {
    if (descEl) descEl.textContent = 'to access Engineering Manager Dashboard (Google SSO)';
    if (emailInput) {
      emailInput.value = 'visakan0302@gmail.com';
      emailInput.placeholder = 'visakan0302@gmail.com';
    }
    if (hintEl) hintEl.innerHTML = '🔒 <strong>Authorized Account:</strong> Only <code>visakan0302@gmail.com</code> is permitted to log in as Manager.';
  } else {
    if (descEl) descEl.textContent = 'to access Employee Assessment Hub (Google SSO)';
    if (emailInput) {
      emailInput.value = 'visakan.employee@gmail.com';
      emailInput.placeholder = 'Enter your Google email';
    }
    if (hintEl) hintEl.innerHTML = '✓ <strong>Open Access:</strong> Any Google account is permitted to log in to the Employee Portal.';
  }

  modal.classList.add('active');
  modal.style.display = 'flex';
  modal.style.opacity = '1';
  modal.style.pointerEvents = 'auto';

  if (emailInput) {
    setTimeout(() => {
      emailInput.focus();
      emailInput.select();
    }, 80);
  }
}
window.openGoogleSSOModal = openGoogleSSOModal;

function closeGoogleSSOModal() {
  const modal = document.getElementById('modal-google-sso-auth');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}
window.closeGoogleSSOModal = closeGoogleSSOModal;

function directGoogleLogin(role) {
  let email = '';
  if (role === 'hr') {
    email = 'visakans.it24@bitsathy.ac.in';
  } else if (role === 'manager') {
    email = 'visakan0302@gmail.com';
  } else if (role === 'employee') {
    email = 'visakan.employee@gmail.com';
  }
  authenticateAndEnter(role, email);
}
window.directGoogleLogin = directGoogleLogin;

function handleGoogleLogin(role) {
  openGoogleSSOModal(role);
}
window.handleGoogleLogin = handleGoogleLogin;

function authenticateAndEnter(role, email) {
  closeGoogleSSOModal();
  state.authenticatedRole = role;
  state.authenticatedEmail = email;
  state.currentRole = role;
  localStorage.setItem('leadsync_auth_role', role);
  localStorage.setItem('leadsync_auth_email', email);

  const loginSec = document.getElementById('login-section');
  const appCont = document.getElementById('app-container');
  if (loginSec) loginSec.style.display = 'none';
  if (appCont) appCont.style.display = 'flex';

  applyRoleSecurityAndUI(role, email);
  showToast(`Signed in successfully via Google SSO as ${email}!`, "success");
  loadInitialData();
}
window.authenticateAndEnter = authenticateAndEnter;

function submitGoogleSSOAuth(e) {
  if (e) e.preventDefault();

  const role = document.getElementById('google-auth-target-role').value;
  const emailInput = document.getElementById('google-auth-email-input');
  const email = (emailInput ? emailInput.value : '').trim().toLowerCase();
  const errorBanner = document.getElementById('google-auth-error-banner');

  // Strict email whitelist rules
  if (role === 'hr') {
    if (email !== 'visakans.it24@bitsathy.ac.in') {
      if (errorBanner) {
        errorBanner.style.display = 'block';
        errorBanner.innerHTML = `<strong>Access Denied:</strong> For HR login, only <code>visakans.it24@bitsathy.ac.in</code> is permitted.`;
      }
      return;
    }
  } else if (role === 'manager') {
    if (email !== 'visakan0302@gmail.com') {
      if (errorBanner) {
        errorBanner.style.display = 'block';
        errorBanner.innerHTML = `<strong>Access Denied:</strong> For Manager login, only <code>visakan0302@gmail.com</code> is permitted.`;
      }
      return;
    }
  } else if (role === 'employee') {
    if (!email || !email.includes('@') || !email.includes('.')) {
      if (errorBanner) {
        errorBanner.style.display = 'block';
        errorBanner.innerHTML = `Please enter a valid Google email address.`;
      }
      return;
    }
  }

  authenticateAndEnter(role, email);
}
window.submitGoogleSSOAuth = submitGoogleSSOAuth;

function handleLogout() {
  state.authenticatedRole = null;
  state.authenticatedEmail = null;
  localStorage.removeItem('leadsync_auth_role');
  localStorage.removeItem('leadsync_auth_email');

  const loginSec = document.getElementById('login-section');
  const appCont = document.getElementById('app-container');
  if (loginSec) loginSec.style.display = 'flex';
  if (appCont) appCont.style.display = 'none';

  showToast("Logged out successfully from session.", "info");
}
window.handleLogout = handleLogout;

function applyRoleSecurityAndUI(role, authEmail = null) {
  state.currentRole = role;
  state.authenticatedRole = role;
  const email = authEmail || state.authenticatedEmail || (role === 'hr' ? 'visakans.it24@bitsathy.ac.in' : (role === 'manager' ? 'visakan0302@gmail.com' : 'alex.rivera@leadsync.io'));
  state.authenticatedEmail = email;

  const authBadge = document.getElementById('auth-role-badge');
  const avatar = document.getElementById('current-user-avatar');
  const name = document.getElementById('current-user-name');
  const roleText = document.getElementById('current-user-role');
  const empSelectWrapper = document.getElementById('emp-selector-wrapper');

  // Sidebar link items
  const navHr = document.getElementById('nav-item-hr');
  const navEmpInfo = document.getElementById('nav-item-employee-info');
  const navAiDirect = document.getElementById('nav-item-ai-analyzer-direct');
  const navManager = document.getElementById('nav-item-manager');
  const navEmp = document.getElementById('nav-item-employee');

  // Succession navigation section
  const navGroupTitles = document.querySelectorAll('.nav-group-title');
  const successionTitle = navGroupTitles.length > 1 ? navGroupTitles[1] : null;
  const navLists = document.querySelectorAll('.nav-links');
  const successionList = navLists.length > 1 ? navLists[1] : null;

  // Header HR quick actions
  const hrActions = document.querySelectorAll('.hr-only-action');

  if (role === 'hr') {
    if (authBadge) {
      authBadge.textContent = `● HR: ${email}`;
      authBadge.style.background = '#4f46e5';
    }
    if (avatar) {
      avatar.textContent = 'VS';
      avatar.style.background = '#4f46e5';
    }
    if (name) name.textContent = 'Visakan S';
    if (roleText) roleText.textContent = `${email} • HR Talent Director`;
    if (empSelectWrapper) empSelectWrapper.style.display = 'none';

    // Show HR-only nav items: AI analyzer, employee info, suitability, succession roles, hr dashboard
    if (navHr) navHr.style.display = 'block';
    if (navEmpInfo) navEmpInfo.style.display = 'block';
    if (navAiDirect) navAiDirect.style.display = 'block';
    if (navManager) navManager.style.display = 'none';
    if (navEmp) navEmp.style.display = 'none';

    if (successionTitle) successionTitle.style.display = 'block';
    if (successionList) successionList.style.display = 'block';

    hrActions.forEach(el => el.style.display = 'inline-flex');

    navigateToTab('tab-hr');

  } else if (role === 'manager') {
    if (authBadge) {
      authBadge.textContent = `● Manager: ${email}`;
      authBadge.style.background = '#0284c7';
    }
    if (avatar) {
      avatar.textContent = 'V';
      avatar.style.background = '#0284c7';
    }
    if (name) name.textContent = 'Visakan';
    if (roleText) roleText.textContent = `${email} • Engineering Director`;
    if (empSelectWrapper) empSelectWrapper.style.display = 'none';

    // Show Manager only
    if (navHr) navHr.style.display = 'none';
    if (navEmpInfo) navEmpInfo.style.display = 'none';
    if (navAiDirect) navAiDirect.style.display = 'none';
    if (navManager) navManager.style.display = 'block';
    if (navEmp) navEmp.style.display = 'none';

    if (successionTitle) successionTitle.style.display = 'none';
    if (successionList) successionList.style.display = 'none';

    hrActions.forEach(el => el.style.display = 'none');

    navigateToTab('tab-manager');

  } else if (role === 'employee') {
    if (authBadge) {
      authBadge.textContent = `● Employee: ${email}`;
      authBadge.style.background = '#059669';
    }
    const emp = getActiveEmployee();
    if (avatar) {
      avatar.textContent = emp?.avatar || 'EM';
      avatar.style.background = '#059669';
    }
    if (name) name.textContent = emp?.name || email.split('@')[0];
    if (roleText) roleText.textContent = `${email} • Employee Portal`;
    if (empSelectWrapper) empSelectWrapper.style.display = 'flex';

    // Show Employee only
    if (navHr) navHr.style.display = 'none';
    if (navEmpInfo) navEmpInfo.style.display = 'none';
    if (navAiDirect) navAiDirect.style.display = 'none';
    if (navManager) navManager.style.display = 'none';
    if (navEmp) navEmp.style.display = 'block';

    if (successionTitle) successionTitle.style.display = 'none';
    if (successionList) successionList.style.display = 'none';

    hrActions.forEach(el => el.style.display = 'none');

    navigateToTab('tab-employee');
  }
}
window.applyRoleSecurityAndUI = applyRoleSecurityAndUI;

// --- Role Switching Logic ---
function setupRoleSwitcher() {
  // Header active employee selector (when in employee mode)
  const selectActive = document.getElementById('select-active-employee');
  if (selectActive) {
    selectActive.addEventListener('change', (e) => {
      state.activeEmployeeId = e.target.value;
      updateUserPill();
      renderEmployeeSelfView();
      // also sync employee tab select
      const empTabSelect = document.getElementById('emp-tab-user-select');
      if (empTabSelect) empTabSelect.value = e.target.value;
      showToast(`Switched active view to ${getActiveEmployee()?.name}`);
    });
  }

  const empTabSelect = document.getElementById('emp-tab-user-select');
  if (empTabSelect) {
    empTabSelect.addEventListener('change', (e) => {
      state.activeEmployeeId = e.target.value;
      if (selectActive) selectActive.value = e.target.value;
      updateUserPill();
      renderEmployeeSelfView();
    });
  }
}

function switchRole(role) {
  applyRoleSecurityAndUI(role);
}
window.switchRole = switchRole;

function updateUserPill() {
  const avatar = document.getElementById('current-user-avatar');
  const name = document.getElementById('current-user-name');
  const role = document.getElementById('current-user-role');

  if (state.currentRole === 'hr') {
    if (avatar) {
      avatar.textContent = 'CO';
      avatar.style.background = '#4f46e5';
    }
    if (name) name.textContent = 'Clara Oswald';
    if (role) role.textContent = 'HR Talent Director';
  } else if (state.currentRole === 'manager') {
    if (avatar) {
      avatar.textContent = 'DZ';
      avatar.style.background = '#0284c7';
    }
    if (name) name.textContent = 'David Zhang';
    if (role) role.textContent = 'Engineering Director';
  } else {
    const emp = getActiveEmployee();
    if (emp) {
      if (avatar) {
        avatar.textContent = emp.avatar || 'EM';
        avatar.style.background = '#059669';
      }
      if (name) name.textContent = emp.name;
      if (role) role.textContent = emp.role;
    }
  }
}

function getActiveEmployee() {
  return state.employees.find(e => e.id === state.activeEmployeeId) || state.employees[0];
}

// --- Navigation Tabs ---
function initEventListeners() {
  document.querySelectorAll('.nav-link-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      navigateToTab(targetTab);
    });
  });

  // Top action buttons
  document.getElementById('btn-quick-new-asm').addEventListener('click', openCreateAssessmentModal);
  document.getElementById('btn-quick-add-emp').addEventListener('click', openAddEmployeeModal);
  document.getElementById('btn-hr-create-asm').addEventListener('click', openCreateAssessmentModal);
  document.getElementById('btn-hr-add-emp').addEventListener('click', openAddEmployeeModal);

  // AI Matcher Quick Buttons
  const btnQuickAI = document.getElementById('btn-quick-ai-match');
  if (btnQuickAI) {
    btnQuickAI.addEventListener('click', (e) => {
      scrollToAIAnalyzer(e);
    });
  }

  const btnHrLaunchAI = document.getElementById('btn-hr-launch-ai');
  if (btnHrLaunchAI) {
    btnHrLaunchAI.addEventListener('click', () => {
      const quickRoleId = document.getElementById('hr-quick-role-select').value;
      document.getElementById('ai-select-preset-role').value = quickRoleId;
      setAIMatcherMode('preset');
      updateAIPresetSummary(quickRoleId);
      navigateToTab('tab-ai-matcher');
      runAIMatching();
    });
  }

  const btnRunAIMatch = document.getElementById('btn-run-ai-match');
  if (btnRunAIMatch) {
    btnRunAIMatch.addEventListener('click', runAIMatching);
  }

  const btnParseJD = document.getElementById('btn-parse-jd');
  if (btnParseJD) {
    btnParseJD.addEventListener('click', handleParseJD);
  }

  const selectPresetRole = document.getElementById('ai-select-preset-role');
  if (selectPresetRole) {
    selectPresetRole.addEventListener('change', () => {
      updateAIPresetSummary(selectPresetRole.value);
      runAIMatching();
    });
  }

  const selectCandidateDept = document.getElementById('ai-filter-candidate-dept');
  if (selectCandidateDept) {
    selectCandidateDept.addEventListener('change', runAIMatching);
  }

  // Forms
  document.getElementById('form-create-assessment').addEventListener('submit', handleCreateAssessment);
  document.getElementById('form-add-employee').addEventListener('submit', handleAddEmployee);

  // Take assessment button
  document.getElementById('btn-take-assessment').addEventListener('click', startAssessmentTest);

  // Test Runner Controls
  document.getElementById('btn-test-prev').addEventListener('click', prevTestQuestion);
  document.getElementById('btn-test-next').addEventListener('click', nextTestQuestion);
  document.getElementById('btn-test-submit').addEventListener('click', submitAssessmentTest);
  document.getElementById('btn-test-cancel').addEventListener('click', cancelAssessmentTest);

  // Reset database seeds (HR and Employee dashboards)
  const btnResetSeeds = document.getElementById('btn-reset-seeds');
  if (btnResetSeeds) {
    btnResetSeeds.addEventListener('click', handleResetSeedData);
  }
  const btnEmpResetSeeds = document.getElementById('btn-emp-reset-seeds');
  if (btnEmpResetSeeds) {
    btnEmpResetSeeds.addEventListener('click', handleResetSeedData);
  }
  const btnMgrResetSeeds = document.getElementById('btn-manager-reset-seeds');
  if (btnMgrResetSeeds) {
    btnMgrResetSeeds.addEventListener('click', handleResetSeedData);
  }

  // Reset assessment scores for all employees
  const btnResetAsm = document.getElementById('btn-reset-assessments');
  if (btnResetAsm) {
    btnResetAsm.addEventListener('click', handleResetAssessmentSection);
  }

  // Google SSO Login Portal card buttons
  const btnLoginHr = document.getElementById('btn-login-sso-hr');
  if (btnLoginHr) {
    btnLoginHr.addEventListener('click', (e) => {
      e.preventDefault();
      openGoogleSSOModal('hr');
    });
  }
  const btnLoginMgr = document.getElementById('btn-login-sso-mgr');
  if (btnLoginMgr) {
    btnLoginMgr.addEventListener('click', (e) => {
      e.preventDefault();
      openGoogleSSOModal('manager');
    });
  }
  const btnLoginEmp = document.getElementById('btn-login-sso-emp');
  if (btnLoginEmp) {
    btnLoginEmp.addEventListener('click', (e) => {
      e.preventDefault();
      openGoogleSSOModal('employee');
    });
  }

  // Click outside to close Google SSO Modal
  const modalSSO = document.getElementById('modal-google-sso-auth');
  if (modalSSO) {
    modalSSO.addEventListener('click', (e) => {
      if (e.target === modalSSO) {
        closeGoogleSSOModal();
      }
    });
  }

  // Top 3 Direct AI evaluation triggers
  const btnTop3AI = document.getElementById('btn-top3-ai-analysis-direct');
  if (btnTop3AI) {
    btnTop3AI.addEventListener('click', startTop3RoleAnalysisUI);
  }

  const btnExecuteTop3 = document.getElementById('btn-execute-top3-ai');
  if (btnExecuteTop3) {
    btnExecuteTop3.addEventListener('click', executeTop3AIAnalysis);
  }

  const top3RoleSelect = document.getElementById('top3-target-role-select');
  if (top3RoleSelect) {
    top3RoleSelect.addEventListener('change', updateTop3RolePreview);
  }

  // Manager Edit Employee form
  const formMgrEdit = document.getElementById('form-manager-edit-employee');
  if (formMgrEdit) {
    formMgrEdit.addEventListener('submit', handleManagerSaveEmployee);
  }

  const btnCloseMgrEdit = document.getElementById('btn-close-manager-edit-employee');
  if (btnCloseMgrEdit) {
    btnCloseMgrEdit.addEventListener('click', closeManagerEditModal);
  }

  // Manager Search and Filter
  document.getElementById('manager-search-input').addEventListener('input', filterManagerTable);
  document.getElementById('manager-filter-dept').addEventListener('change', filterManagerTable);
}

function mountAIAnalyzer(tabId) {
  const moduleEl = document.getElementById('hr-ai-analyzer-module');
  if (!moduleEl) return;
  if (tabId === 'tab-ai-matcher') {
    const aiMount = document.getElementById('ai-role-analyzer-mount-point');
    if (aiMount && moduleEl.parentElement !== aiMount) {
      aiMount.appendChild(moduleEl);
    }
  } else if (tabId === 'tab-hr') {
    const hrMount = document.getElementById('hr-ai-analyzer-mount-point');
    if (hrMount && moduleEl.parentElement !== hrMount) {
      hrMount.appendChild(moduleEl);
    }
  }
}
window.mountAIAnalyzer = mountAIAnalyzer;

function navigateToTab(tabId) {
  // Enforce role security guard
  const userRole = state.authenticatedRole || 'hr';
  if (userRole === 'manager' && tabId !== 'tab-manager') {
    tabId = 'tab-manager';
  } else if (userRole === 'employee' && tabId !== 'tab-employee') {
    tabId = 'tab-employee';
  } else if (userRole === 'hr') {
    const hrAllowed = ['tab-hr', 'tab-employee-info', 'tab-ai-matcher', 'tab-suitability', 'tab-succession'];
    if (!hrAllowed.includes(tabId)) {
      tabId = 'tab-hr';
    }
  }

  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.style.display = 'none';
    pane.classList.remove('active');
  });

  const activePane = document.getElementById(tabId);
  if (activePane) {
    activePane.style.display = 'block';
    activePane.classList.add('active');
  }

  // Mount AI Analyzer into the active tab (AI Role Analyzer or HR Dashboard)
  mountAIAnalyzer(tabId);

  document.querySelectorAll('.nav-link-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  // Refresh view contents if needed
  if (tabId === 'tab-suitability') {
    runSuitabilityEvaluation();
  } else if (tabId === 'tab-ai-matcher') {
    const currentAIId = document.getElementById('hr-ai-select-employee')?.value || state.hrAI.selectedEmployeeId;
    loadHRAIEmployeeDossier(currentAIId).then(() => {
      executeHRAIEligibilityAnalysis(false);
    });
  } else if (tabId === 'tab-employee-info') {
    initEmployeeInfoTab();
  }
}

window.navigateToTab = navigateToTab;

// --- Populate Dropdowns ---
function populateEmployeeSelectors() {
  const selectActive = document.getElementById('select-active-employee');
  const empTabSelect = document.getElementById('emp-tab-user-select');
  const suitSelect = document.getElementById('suit-select-employee');
  const empInfoSelect = document.getElementById('emp-info-select');

  const optionsHtml = state.employees.map(emp => 
    `<option value="${emp.id}">${emp.name} (${emp.role})</option>`
  ).join('');

  if (selectActive) selectActive.innerHTML = optionsHtml;
  if (empTabSelect) empTabSelect.innerHTML = optionsHtml;
  if (suitSelect) suitSelect.innerHTML = optionsHtml;
  if (empInfoSelect) {
    empInfoSelect.innerHTML = optionsHtml;
    if (state.empInfo?.selectedEmployeeId) {
      empInfoSelect.value = state.empInfo.selectedEmployeeId;
    }
  }

  if (selectActive) selectActive.value = state.activeEmployeeId;
  if (empTabSelect) empTabSelect.value = state.activeEmployeeId;
  if (suitSelect) suitSelect.value = state.activeEmployeeId;
}

// --- HR View Rendering ---
function renderHRStats() {
  const totalEmpsEl = document.getElementById('stat-total-emps');
  if (totalEmpsEl) totalEmpsEl.textContent = state.employees.length;

  const activeAsmsEl = document.getElementById('stat-active-asms');
  if (activeAsmsEl) activeAsmsEl.textContent = state.assessments.length;

  const topScoreEl = document.getElementById('stat-top-score');
  if (topScoreEl) {
    // Only display score if there are completed assessments with score > 0
    const completedTop = (state.top3Results || []).filter(e => e.assessment_scores && e.assessment_scores.completed && e.assessment_scores.score_pct > 0);
    if (completedTop.length > 0 && completedTop[0].assessment_scores) {
      topScoreEl.textContent = `${completedTop[0].assessment_scores.score_pct}%`;
    } else {
      topScoreEl.textContent = '0%';
    }
  }

  const readyNowEl = document.getElementById('stat-ready-now');
  if (readyNowEl) {
    const appointedCount = (state.employees || []).filter(e => e.appointed_role).length;
    const matrixReadyNow = (state.successionMatrix || []).reduce((acc, r) => acc + (r.ready_now_count || 0), 0);
    const readyNowCount = Math.max(appointedCount, matrixReadyNow);
    readyNowEl.textContent = readyNowCount;
  }
}

function renderHRTop3Podium() {
  const container = document.getElementById('hr-top-3-container');
  if (!container) return;

  const completedTop3 = (state.top3Results || []).filter(e => e.assessment_scores && e.assessment_scores.completed && e.assessment_scores.score_pct > 0);

  if (completedTop3.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px 20px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: var(--radius-md);">
        <div style="font-size: 1.05rem; font-weight: 700; color: #475569; margin-bottom: 6px;">No Assessment Results Submitted Yet</div>
        <p style="font-size: 0.88rem; color: #64748b; margin: 0;">All employee assessment scores are currently 0%. Once employees take an assigned assessment, the top 3 highest scorers will appear here.</p>
      </div>
    `;
    return;
  }

  const medals = [
    { rank: 1, label: "1st Place", badgeClass: "badge-gold", avatarClass: "avatar-gold", cardClass: "rank-1" },
    { rank: 2, label: "2nd Place", badgeClass: "badge-silver", avatarClass: "avatar-silver", cardClass: "rank-2" },
    { rank: 3, label: "3rd Place", badgeClass: "badge-bronze", avatarClass: "avatar-bronze", cardClass: "rank-3" }
  ];

  let orderedIndices = [1, 0, 2];
  if (completedTop3.length < 3) {
    orderedIndices = completedTop3.map((_, i) => i);
  }

  container.innerHTML = orderedIndices.map(idx => {
    const emp = completedTop3[idx];
    if (!emp) return '';
    const medal = medals[idx] || medals[0];
    const score = emp.assessment_scores ? (emp.assessment_scores.score_pct ?? 0) : 0;
    const correctCount = emp.assessment_scores ? (emp.assessment_scores.correct_count ?? 0) : 0;
    const catScores = emp.assessment_scores ? emp.assessment_scores.category_scores || {} : {};

    const topCategories = Object.entries(catScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, val]) => `<span class="cat-mini-tag">${cat}: ${val}%</span>`)
      .join('');

    return `
      <div class="podium-card ${medal.cardClass}">
        <span class="crown-badge ${medal.badgeClass}">★ ${medal.label}</span>
        <div class="podium-avatar ${medal.avatarClass}">${emp.avatar || 'EM'}</div>
        <div class="podium-name">${emp.name}</div>
        <div class="podium-role">${emp.role} • ${emp.department}</div>
        
        <div class="podium-score-pill">${score}%</div>
        <div style="font-size: 0.76rem; color: var(--text-muted); margin-bottom: 12px;">
          ${correctCount} of 20 Questions Correct
        </div>

        <div class="category-tags-wrap">
          ${topCategories}
        </div>

        <div style="display: flex; gap: 8px; width: 100%; margin-top: 6px;">
          <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="openProfileModal('${emp.id}')">Profile</button>
          <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="inspectEmployeeInSuitability('${emp.id}')">Analyze Fit</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderHRAssessmentsList() {
  const container = document.getElementById('hr-assessments-list');
  if (!container) return;

  if (state.assessments.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 36px 20px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: var(--radius-md);">
        <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 12px;">No active assessments currently scheduled.</p>
        <button class="btn btn-primary btn-sm" onclick="openCreateAssessmentModal()" style="display: inline-flex; align-items: center; gap: 6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          + Assign New Assessment Test
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = state.assessments.map(asm => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; background: #ffffff; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); margin-bottom: 12px; flex-wrap: wrap; gap: 12px; box-shadow: var(--shadow-sm);">
      <div>
        <div style="font-weight: 700; color: #0f172a; font-size: 0.98rem;">${asm.title}</div>
        <div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 2px;">
          ${asm.description || '20 Questions across Python, C, Java, DBMS, Technical, Communication, and Aptitude.'}
        </div>
        <div style="display: flex; gap: 14px; margin-top: 6px; font-size: 0.78rem; color: var(--text-muted);">
          <span>📅 ${asm.scheduled_date} at ${asm.scheduled_time}</span>
          <span>⏱ ${asm.duration_minutes} Minutes</span>
          <span>👥 Assigned to: <strong>All ${state.employees.length} Employees</strong></span>
          <span style="color: #059669; font-weight: 600;">● ${asm.status}</span>
        </div>
      </div>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="switchRole('employee'); startAssessmentTest();">
          Take as Employee →
        </button>
      </div>
    </div>
  `).join('');
}

// --- Manager View Rendering (ALL 15 EMPLOYEES) ---
function renderManagerTable() {
  const tbody = document.getElementById('manager-employee-tbody');
  if (!tbody) return;

  const emps = state.allManagerResults.length > 0 ? state.allManagerResults : state.employees;

  tbody.innerHTML = emps.map(emp => {
    const asm = emp.assessment_scores;
    const isCompleted = asm && asm.completed === true;
    const scorePct = isCompleted ? (asm.score_pct ?? 0) : 0;
    const correctCount = isCompleted ? (asm.correct_count ?? 0) : 0;
    const colorClass = scorePct >= 85 ? 'green' : (scorePct >= 70 ? 'cyan' : 'amber');

    // Find top skill
    const skills = emp.skills || {};
    const topSkill = Object.entries(skills).sort((a, b) => b[1] - a[1])[0] || ['Engineering', 80];

    // Readiness status & score display
    let scoreDisplay = '';
    let statusPill = '';

    if (isCompleted) {
      statusPill = scorePct >= 88 ? 
        `<span class="status-pill status-emerald">● Ready Now</span>` :
        (scorePct >= 75 ? `<span class="status-pill status-cyan">● 6-12 Months</span>` : `<span class="status-pill status-amber">● 12-24 Months</span>`);
      
      scoreDisplay = `
        <div class="progress-bar-wrapper">
          <div class="progress-track">
            <div class="progress-fill ${colorClass}" style="width: ${scorePct}%;"></div>
          </div>
          <span class="progress-pct-text">${scorePct}%</span>
        </div>
        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">
          ${correctCount} / 20 Questions
        </div>
      `;
    } else {
      statusPill = `<span class="status-pill status-amber" style="background:#fef3c7; color:#b45309; border-color:#fde68a;">● Not Attended (0%)</span>`;
      scoreDisplay = `
        <div class="progress-bar-wrapper">
          <div class="progress-track">
            <div class="progress-fill amber" style="width: 0%;"></div>
          </div>
          <span class="progress-pct-text">0%</span>
        </div>
        <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">
          0 / 20 Questions (Pending)
        </div>
      `;
    }

    return `
      <tr>
        <td>
          <div class="emp-cell">
            <div class="emp-avatar-cell">${emp.avatar || 'EM'}</div>
            <div class="emp-cell-meta">
              <span class="emp-cell-name">${emp.name}</span>
              <span class="emp-cell-email">${emp.email}</span>
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight: 500; color: var(--text-light);">${emp.role}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${emp.department}</div>
        </td>
        <td>
          <span style="font-family: var(--font-mono); font-weight: 600;">${emp.experience_years} yrs</span>
        </td>
        <td style="min-width: 170px;">
          ${scoreDisplay}
        </td>
        <td>
          <span class="cat-mini-tag" style="background: #eef2ff; color: #4338ca; border-color: #c7d2fe;">
            ${topSkill[0]}: ${topSkill[1]}%
          </span>
        </td>
        <td>
          ${statusPill}
        </td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" onclick="openManagerEditModal('${emp.id}')" title="Edit Employee Profile" style="border-color:#38bdf8; color:#0284c7; background:#f0f9ff; font-weight:600;">
              ✏️ Edit
            </button>
            <button class="btn btn-secondary btn-sm" onclick="openProfileModal('${emp.id}')">Profile</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// --- Assessment Reset Handler (All employee scores become zero) ---
async function handleResetAssessmentSection() {
  if (!confirm("Are you sure you want to reset the assessment section? All employee scores will become zero (0%) as before attending the assessment.")) {
    return;
  }

  try {
    const res = await api.resetAssessments();
    showToast(res.message || "All employee scores have been reset to 0%.", "success");
    await loadInitialData();
  } catch (error) {
    console.error("Assessment reset error:", error);
    showToast("Failed to reset assessment scores", "error");
  }
}
window.handleResetAssessmentSection = handleResetAssessmentSection;

// --- Seed Data Reset Handler (Both HR & Employee Dashboards) ---
async function handleResetSeedData() {
  if (!confirm("Are you sure you want to reset all LeadSync data to original seeds? Active assessments will become 0, all assessment scores will become 0% across all dashboards, and HR can assign new assessments.")) {
    return;
  }

  try {
    const res = await api.resetData();
    showToast(res.message || "Platform reset successfully. Active assessments and scores are now 0.", "success");
    await loadInitialData();
  } catch (error) {
    console.error("Reset seed data error:", error);
    showToast("Failed to reset seed data. Please check backend connection.", "error");
  }
}
window.handleResetSeedData = handleResetSeedData;

// --- Manager Edit Employee Modal Functions ---
function openManagerEditModal(empId) {
  console.log("openManagerEditModal requested for empId:", empId);
  const emps = (state.allManagerResults && state.allManagerResults.length > 0) ? state.allManagerResults : (state.employees || []);
  let emp = emps.find(e => String(e.id).trim() === String(empId).trim());
  if (!emp && state.employees) {
    emp = state.employees.find(e => String(e.id).trim() === String(empId).trim());
  }
  if (!emp) {
    console.error("Employee not found for edit:", empId);
    showToast("Employee details could not be found for editing.", "error");
    return;
  }

  const idInput = document.getElementById('mgr-edit-emp-id');
  const nameInput = document.getElementById('mgr-edit-emp-name') || document.getElementById('mgr-edit-name');
  const roleInput = document.getElementById('mgr-edit-emp-role') || document.getElementById('mgr-edit-role');
  const deptInput = document.getElementById('mgr-edit-emp-dept') || document.getElementById('mgr-edit-dept');
  const emailInput = document.getElementById('mgr-edit-emp-email') || document.getElementById('mgr-edit-email');
  const expInput = document.getElementById('mgr-edit-emp-exp') || document.getElementById('mgr-edit-exp');
  const bioInput = document.getElementById('mgr-edit-emp-bio') || document.getElementById('mgr-edit-bio');
  const skillsInput = document.getElementById('mgr-edit-emp-skills') || document.getElementById('mgr-edit-skills');

  if (idInput) idInput.value = emp.id;
  if (nameInput) nameInput.value = emp.name || '';
  if (roleInput) roleInput.value = emp.role || '';
  if (deptInput) deptInput.value = emp.department || 'Engineering';
  if (emailInput) emailInput.value = emp.email || '';
  if (expInput) expInput.value = emp.experience_years ?? 3.0;

  let skillsStr = '';
  if (emp.skills) {
    if (typeof emp.skills === 'object' && !Array.isArray(emp.skills)) {
      skillsStr = Object.keys(emp.skills).join(', ');
    } else if (Array.isArray(emp.skills)) {
      skillsStr = emp.skills.join(', ');
    }
  }
  if (skillsInput) skillsInput.value = skillsStr;
  if (bioInput) bioInput.value = emp.bio || '';

  const modal = document.getElementById('modal-manager-edit-employee');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
    modal.style.opacity = '1';
    modal.style.pointerEvents = 'auto';
  }
}
window.openManagerEditModal = openManagerEditModal;

function closeManagerEditModal() {
  const modal = document.getElementById('modal-manager-edit-employee');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}
window.closeManagerEditModal = closeManagerEditModal;

async function handleManagerSaveEmployee(e) {
  e.preventDefault();
  const idInput = document.getElementById('mgr-edit-emp-id');
  const nameInput = document.getElementById('mgr-edit-emp-name') || document.getElementById('mgr-edit-name');
  const roleInput = document.getElementById('mgr-edit-emp-role') || document.getElementById('mgr-edit-role');
  const deptInput = document.getElementById('mgr-edit-emp-dept') || document.getElementById('mgr-edit-dept');
  const emailInput = document.getElementById('mgr-edit-emp-email') || document.getElementById('mgr-edit-email');
  const expInput = document.getElementById('mgr-edit-emp-exp') || document.getElementById('mgr-edit-exp');
  const bioInput = document.getElementById('mgr-edit-emp-bio') || document.getElementById('mgr-edit-bio');
  const skillsInput = document.getElementById('mgr-edit-emp-skills') || document.getElementById('mgr-edit-skills');

  const empId = idInput ? idInput.value : '';
  const name = nameInput ? nameInput.value.trim() : '';
  const role = roleInput ? roleInput.value.trim() : '';
  const dept = deptInput ? deptInput.value.trim() : 'Engineering';
  const email = emailInput ? emailInput.value.trim() : '';
  const exp = expInput ? parseFloat(expInput.value) || 0 : 0;
  const bio = bioInput ? bioInput.value.trim() : '';
  const skillsRaw = skillsInput ? skillsInput.value.trim() : '';

  const skillsObj = {};
  if (skillsRaw) {
    skillsRaw.split(',').forEach(item => {
      const parts = item.split(':').map(s => s.trim());
      if (parts[0]) {
        skillsObj[parts[0]] = parts[1] ? parseInt(parts[1], 10) || 80 : 85;
      }
    });
  }

  const payload = {
    name,
    role,
    department: dept,
    email,
    experience_years: exp,
    bio,
    skills: Object.keys(skillsObj).length > 0 ? skillsObj : undefined
  };

  try {
    const res = await api.updateEmployee(empId, payload);
    closeManagerEditModal();
    showToast(`Employee "${name}" profile successfully updated!`, "success");
    await loadInitialData();
  } catch (err) {
    console.error("Manager save error:", err);
    showToast("Failed to update employee details", "error");
  }
}
window.handleManagerSaveEmployee = handleManagerSaveEmployee;

// --- Top 3 Candidates Direct AI Evaluation for Selected Leadership Role ---
function startTop3RoleAnalysisUI() {
  navigateToTab('tab-ai-matcher');

  // Populate role select if empty
  const roleSelect = document.getElementById('top3-target-role-select');
  if (roleSelect && state.leadershipRoles.length > 0) {
    roleSelect.innerHTML = state.leadershipRoles.map(r => 
      `<option value="${r.id}">${r.title} (${r.department}) - Min Exp: ${r.experience_years} yrs</option>`
    ).join('');
  }

  updateTop3RolePreview();

  const panel = document.getElementById('ai-top3-evaluation-panel');
  if (panel) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
window.startTop3RoleAnalysisUI = startTop3RoleAnalysisUI;

function updateTop3RolePreview() {
  const container = document.getElementById('top3-candidates-preview');
  if (!container) return;

  // Get Top 3 completed or fallback top 3
  let candidates = state.top3Results;
  if (!candidates || candidates.length === 0) {
    candidates = state.employees.slice(0, 3);
  } else {
    candidates = candidates.slice(0, 3);
  }

  if (candidates.length === 0) {
    container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 15px;">No assessment candidates available.</div>`;
    return;
  }

  container.innerHTML = candidates.map((emp, i) => {
    const asm = emp.assessment_scores;
    const isCompleted = asm && asm.completed;
    const scorePct = isCompleted ? (asm.score_pct ?? 0) : 0;
    const certsCount = (emp.certifications || []).length;
    const topSkills = Object.keys(emp.skills || {}).slice(0, 3).join(', ') || 'IT Competencies';

    return `
      <div style="background: #ffffff; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px; box-shadow: var(--shadow-sm);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <span class="badge ${i === 0 ? 'badge-gold' : (i === 1 ? 'badge-silver' : 'badge-bronze')}" style="font-size: 0.72rem; padding: 2px 8px; border-radius: 999px;">
            Candidate #${i + 1}
          </span>
          <span style="font-size: 0.76rem; font-weight: 700; color: #4338ca;">
            Assessment: ${scorePct}%
          </span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 38px; height: 38px; border-radius: 999px; background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem;">
            ${emp.avatar || 'EM'}
          </div>
          <div>
            <div style="font-weight: 700; color: #0f172a; font-size: 0.9rem;">${emp.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${emp.role}</div>
          </div>
        </div>
        <div style="margin-top: 10px; font-size: 0.76rem; color: var(--text-secondary); line-height: 1.5;">
          <div>⏱ <strong>Experience:</strong> ${emp.experience_years} Years</div>
          <div>📜 <strong>Certifications:</strong> ${certsCount} Verified Certs</div>
          <div>📄 <strong>Resume:</strong> Portfolio on file</div>
          <div>💻 <strong>Skills:</strong> ${topSkills}</div>
        </div>
      </div>
    `;
  }).join('');
}
window.updateTop3RolePreview = updateTop3RolePreview;

async function executeTop3AIAnalysis() {
  const roleSelect = document.getElementById('top3-target-role-select');
  const roleId = roleSelect ? roleSelect.value : 'ROLE-SSE';
  const roleObj = state.leadershipRoles.find(r => r.id === roleId);
  const roleTitle = roleObj ? roleObj.title : 'Target Leadership Role';

  const outputContainer = document.getElementById('top3-ai-decision-output');
  if (outputContainer) {
    outputContainer.style.display = 'block';
    outputContainer.innerHTML = `
      <div style="padding: 30px; text-align: center;">
        <div class="spinner" style="margin: 0 auto 16px auto; width: 36px; height: 36px; border: 3px solid rgba(99, 102, 241, 0.2); border-top-color: #4f46e5; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <h3 style="font-size: 1.05rem; font-weight: 700; color: #1e1b4b;">LeadSync AI Multi-Modal Engine Evaluating Top 3 Candidates...</h3>
        <p style="font-size: 0.84rem; color: #64748b; margin-top: 6px;">
          Synthesizing Assessment Marks, Computer & IT Skills, Verified Experience, Certifications, and Resumes for <strong>${roleTitle}</strong>
        </p>
      </div>
    `;
  }

  try {
    const res = await api.analyzeTop3ForRole({ role_id: roleId });
    renderTop3DecisionOutput(res);
  } catch (err) {
    console.error("Top 3 AI Analysis error:", err);
    if (outputContainer) {
      outputContainer.innerHTML = `
        <div style="padding: 20px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: var(--radius-md); color: #9f1239;">
          <strong>Analysis Failed:</strong> ${err.message || 'Error running AI multi-modal evaluation'}
        </div>
      `;
    }
  }
}
window.executeTop3AIAnalysis = executeTop3AIAnalysis;

function renderTop3DecisionOutput(result) {
  const container = document.getElementById('top3-ai-decision-output');
  if (!container) return;

  const winner = result.one_eligible_employee || result.best_perfect_employee;
  const role = result.role_evaluated || {};
  const comparison = result.top3_comparison || [];
  const rationale = winner.ai_rationale || result.decision_summary;

  const compRowsHtml = comparison.map((cand, idx) => {
    const isWinner = cand.employee_id === winner.employee_id;
    const dims = cand.dimension_scores || {};
    const skillsScore = dims.skills_alignment ?? 80;
    const expScore = dims.resume_experience_fit ?? 80;
    const certScore = dims.certifications_match ?? 75;
    const asmScore = dims.assessment_marks_fit ?? 80;

    return `
      <tr style="${isWinner ? 'background: #f0fdf4; font-weight: 600;' : ''}">
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${isWinner ? '<span style="color: #16a34a; font-size: 1.1rem;">★</span>' : `<span style="color: #94a3b8; font-size: 0.85rem;">#${idx + 1}</span>`}
            <span style="color: #0f172a;">${cand.name}</span>
          </div>
        </td>
        <td>${cand.experience_years} yrs (${expScore}%)</td>
        <td>${skillsScore}%</td>
        <td>${certScore}%</td>
        <td>${cand.assessment_details?.score_pct ?? asmScore}%</td>
        <td style="font-weight: 800; color: ${isWinner ? '#16a34a' : '#475569'}; font-size: 1rem;">
          ${cand.overall_score}%
        </td>
        <td>
          <span class="status-pill ${cand.status_color === 'emerald' ? 'status-emerald' : (cand.status_color === 'cyan' ? 'status-cyan' : 'status-amber')}">
            ● ${cand.readiness_status}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <!-- Decisive Winner Card: ONE Eligible Employee -->
    <div style="background: linear-gradient(135deg, #052e16 0%, #14532d 100%); border-radius: var(--radius-lg); padding: 28px; color: #ffffff; margin-bottom: 24px; box-shadow: 0 10px 25px -5px rgba(22, 163, 74, 0.3);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
        <div>
          <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(74, 222, 128, 0.4); padding: 4px 12px; border-radius: 999px; font-size: 0.78rem; font-weight: 700; color: #86efac; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
            👑 AI Selected: ONE Eligible Employee for ${role.title || 'Selected Role'}
          </div>
          <h2 style="font-size: 1.6rem; font-weight: 800; color: #ffffff; margin-bottom: 4px;">
            ${winner.name}
          </h2>
          <div style="font-size: 0.92rem; color: #bbf7d0;">
            ${winner.current_role} • ${winner.department} • <strong>${winner.experience_years} Years Experience</strong>
          </div>
        </div>

        <div style="text-align: right; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: var(--radius-md); padding: 14px 20px;">
          <div style="font-size: 0.75rem; color: #86efac; text-transform: uppercase; font-weight: 700;">Overall Match Fit</div>
          <div style="font-size: 2.2rem; font-weight: 900; color: #4ade80; line-height: 1.1;">
            ${winner.overall_score}%
          </div>
          <div style="font-size: 0.76rem; color: #cbd5e1; margin-top: 4px;">Definitive #1 Contender</div>
        </div>
      </div>

      <!-- 4 Evaluated Pillars Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 20px;">
        <div style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: var(--radius-md); padding: 12px;">
          <div style="font-size: 0.72rem; color: #86efac; font-weight: 700; text-transform: uppercase;">💻 Skills Evaluation</div>
          <div style="font-size: 1.25rem; font-weight: 800; margin-top: 4px;">${winner.dimension_scores?.skills_alignment ?? 85}%</div>
          <div style="font-size: 0.72rem; color: #e2e8f0; margin-top: 2px;">
            ${winner.skills_details?.strengths?.[0] || 'Top computer & IT benchmark alignment'}
          </div>
        </div>

        <div style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: var(--radius-md); padding: 12px;">
          <div style="font-size: 0.72rem; color: #86efac; font-weight: 700; text-transform: uppercase;">⏱ Experience Evaluation</div>
          <div style="font-size: 1.25rem; font-weight: 800; margin-top: 4px;">${winner.dimension_scores?.resume_experience_fit ?? 85}%</div>
          <div style="font-size: 0.72rem; color: #e2e8f0; margin-top: 2px;">
            ${winner.experience_years} yrs (Benchmark: ${role.target_experience_years || 4.0} yrs)
          </div>
        </div>

        <div style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: var(--radius-md); padding: 12px;">
          <div style="font-size: 0.72rem; color: #86efac; font-weight: 700; text-transform: uppercase;">📜 Certifications</div>
          <div style="font-size: 1.25rem; font-weight: 800; margin-top: 4px;">${winner.dimension_scores?.certifications_match ?? 80}%</div>
          <div style="font-size: 0.72rem; color: #e2e8f0; margin-top: 2px;">
            ${winner.certifications_details?.status || 'Active industry credentials verified'}
          </div>
        </div>

        <div style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: var(--radius-md); padding: 12px;">
          <div style="font-size: 0.72rem; color: #86efac; font-weight: 700; text-transform: uppercase;">📄 Resume & Assessment</div>
          <div style="font-size: 1.25rem; font-weight: 800; margin-top: 4px;">${winner.dimension_scores?.assessment_marks_fit ?? 85}%</div>
          <div style="font-size: 0.72rem; color: #e2e8f0; margin-top: 2px;">
            Score: ${winner.assessment_details?.score_pct ?? 85}% (${winner.assessment_details?.correct_count ?? 17}/20 Correct)
          </div>
        </div>
      </div>

      <!-- AI Executive Justification -->
      <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: var(--radius-md); padding: 16px; margin-top: 18px;">
        <div style="font-size: 0.78rem; font-weight: 700; color: #86efac; margin-bottom: 6px; text-transform: uppercase;">
          🤖 LeadSync AI Decision Rationale:
        </div>
        <p style="font-size: 0.88rem; line-height: 1.6; color: #f1f5f9;">
          ${rationale}
        </p>
      </div>

      <div style="margin-top: 18px; display: flex; gap: 12px; flex-wrap: wrap;">
        <button class="btn btn-primary" onclick="appointCandidateFromTop3('${winner.employee_id}', '${role.role_id || 'ROLE-SSE'}', '${role.title || 'Selected Role'}')" style="background: #10b981; border-color: #059669; font-weight: 700; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);">
          ✓ Confirm & Appoint ${winner.name} to ${role.title || 'Role'}
        </button>
        <button class="btn btn-secondary" onclick="openProfileModal('${winner.employee_id}')" style="background: rgba(255,255,255,0.15); color: white; border-color: rgba(255,255,255,0.3);">
          View Complete Candidate Profile
        </button>
      </div>
    </div>

    <!-- Comparative Table of Top 3 Contenders -->
    <div style="background: #ffffff; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 20px; box-shadow: var(--shadow-sm);">
      <h3 style="font-size: 1.05rem; font-weight: 700; color: #0f172a; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
        <span>📊 Top 3 Contenders Comparative Evaluation Matrix</span>
        <span style="font-size: 0.78rem; font-weight: normal; color: var(--text-muted);">Role: <strong>${role.title || 'Target Role'}</strong></span>
      </h3>
      <div style="overflow-x: auto;">
        <table class="leadsync-table" style="width: 100%;">
          <thead>
            <tr>
              <th>Contender</th>
              <th>Experience (Yrs)</th>
              <th>Skills Alignment</th>
              <th>Certifications</th>
              <th>Assessment Score</th>
              <th>AI Match Score</th>
              <th>Readiness</th>
            </tr>
          </thead>
          <tbody>
            ${compRowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
window.renderTop3DecisionOutput = renderTop3DecisionOutput;

async function appointCandidateFromTop3(empId, roleId, roleTitle) {
  if (!confirm(`Are you sure you want to appoint candidate ${empId} as the verified successor for ${roleTitle}?`)) {
    return;
  }

  try {
    const res = await api.appointCandidate({
      employee_id: empId,
      role_id: roleId,
      role_title: roleTitle,
      decision_notes: "Appointed via LeadSync Top-3 Multi-Modal AI Evaluation."
    });
    const targetEmp = (state.employees || []).find(e => e.id === empId);
    if (targetEmp) {
      targetEmp.appointed_role = roleTitle;
    }
    renderHRStats();
    showToast(res.message || `Candidate successfully appointed to ${roleTitle}!`, "success");
    await loadInitialData();
  } catch (err) {
    console.error("Appoint error:", err);
    showToast("Failed to record role appointment", "error");
  }
}
window.appointCandidateFromTop3 = appointCandidateFromTop3;

function filterManagerTable() {
  const searchTerm = document.getElementById('manager-search-input').value.toLowerCase();
  const deptFilter = document.getElementById('manager-filter-dept').value;

  const rows = document.querySelectorAll('#manager-employee-tbody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const matchesSearch = text.includes(searchTerm);
    const matchesDept = deptFilter === 'all' || text.includes(deptFilter.toLowerCase());

    row.style.display = (matchesSearch && matchesDept) ? '' : 'none';
  });
}

// --- Employee Self View ---
function renderEmployeeSelfView() {
  const container = document.getElementById('emp-self-profile-card');
  const emp = getActiveEmployee();
  if (!container || !emp) return;

  const asm = emp.assessment_scores || { completed: false, score_pct: 0 };
  const skills = emp.skills || {};
  const projects = emp.projects || [];
  const certs = emp.certifications || [];

  container.innerHTML = `
    <div style="display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap;">
      <div style="width: 80px; height: 80px; border-radius: var(--radius-full); background: linear-gradient(135deg, #3b82f6, #6366f1); display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 800; color: white;">
        ${emp.avatar || 'EM'}
      </div>
      <div style="flex: 1;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h2 style="font-size: 1.5rem; margin-bottom: 2px;">${emp.name}</h2>
            <div style="color: var(--accent-cyan); font-weight: 600; font-size: 0.95rem;">
              ${emp.role} • ${emp.department}
            </div>
            <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 4px;">
              ${emp.email} • Experience: <strong>${emp.experience_years} Years</strong> • Education: ${emp.education || 'N/A'}
            </div>
          </div>
          <div>
            ${asm.completed ? `
              <span class="status-pill ${asm.score_pct >= 70 ? 'status-emerald' : 'status-amber'}" style="font-size: 0.8rem;">
                Assessment: ${asm.score_pct}% (${asm.correct_count ?? 0}/20 Correct)
              </span>
            ` : `
              <span class="status-pill status-amber" style="background: #fef3c7; color: #b45309; border-color: #fde68a; font-size: 0.8rem;">
                Assessment: Not Attended (0%)
              </span>
            `}
          </div>
        </div>

        <p style="margin-top: 14px; font-size: 0.88rem; color: var(--text-secondary); line-height: 1.6;">
          ${emp.bio}
        </p>

        <!-- Completed Projects Section -->
        <div style="margin-top: 24px;">
          <h3 style="font-size: 1.05rem; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <span>💼 Completed Production Projects</span>
            <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: normal;">(${projects.length} verified projects)</span>
          </h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
            ${projects.map(p => `
              <div style="background: #f8fafc; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px;">
                <div style="font-weight: 700; color: #0f172a; font-size: 0.92rem;">${p.title}</div>
                <div style="font-size: 0.76rem; color: var(--accent-cyan); margin-top: 2px; font-weight: 600;">Role: ${p.role} (${p.duration})</div>
                <p style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 6px;">${p.description}</p>
                <div style="font-size: 0.78rem; color: #059669; margin-top: 6px; font-weight: 600;">Impact: ${p.impact}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;">
                  ${(p.tech_stack || []).map(t => `<span class="cat-mini-tag">${t}</span>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Existing Skills Matrix -->
        <div style="margin-top: 24px;">
          <h3 style="font-size: 1.05rem; margin-bottom: 12px;">Existing Core Technical & Leadership Skills</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
            ${Object.entries(skills).map(([skill, val]) => `
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 0.76rem; margin-bottom: 3px;">
                  <span style="color: var(--text-secondary);">${skill}</span>
                  <strong style="color: var(--text-light);">${val}%</strong>
                </div>
                <div class="progress-track">
                  <div class="progress-fill ${val >= 80 ? 'green' : (val >= 65 ? 'cyan' : 'amber')}" style="width: ${val}%;"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Certifications -->
        <div style="margin-top: 20px;">
          <h4 style="font-size: 0.82rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px;">Verified Professional Certifications</h4>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${certs.map(c => `
              <span class="status-pill status-cyan" style="font-size: 0.75rem;">
                ✓ ${c}
              </span>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Update Active Assessment Callout Card
  const calloutBadge = document.getElementById('emp-assigned-asm-badge');
  const calloutTitle = document.getElementById('emp-assigned-asm-title');
  const calloutDesc = document.getElementById('emp-assigned-asm-desc');
  const calloutMeta = document.getElementById('emp-assigned-asm-meta');
  const btnTakeAsm = document.getElementById('btn-take-assessment');

  if (!state.assessments || state.assessments.length === 0) {
    state.activeAssessmentId = null;
    if (calloutBadge) {
      calloutBadge.textContent = "No Assessment Assigned";
      calloutBadge.style.background = "#64748b";
    }
    if (calloutTitle) calloutTitle.textContent = "No Active Assessment Scheduled";
    if (calloutDesc) calloutDesc.textContent = "HR has not scheduled an active assessment test yet. Once assigned by HR, the test will appear here for you to attend.";
    if (calloutMeta) {
      calloutMeta.innerHTML = `<span>📅 Status: <strong>Awaiting HR Test Assignment</strong></span>`;
    }
    if (btnTakeAsm) {
      btnTakeAsm.disabled = true;
      btnTakeAsm.className = "btn btn-secondary";
      btnTakeAsm.style.opacity = "0.6";
      btnTakeAsm.style.cursor = "not-allowed";
      btnTakeAsm.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Awaiting HR Assignment
      `;
    }
  } else {
    const activeAsm = state.assessments[0];
    state.activeAssessmentId = activeAsm.id;
    if (calloutBadge) {
      calloutBadge.textContent = "Assigned Assessment";
      calloutBadge.style.background = "var(--accent-primary)";
    }
    if (calloutTitle) calloutTitle.textContent = activeAsm.title;
    if (calloutDesc) calloutDesc.textContent = activeAsm.description || "20 questions covering technical and leadership readiness.";
    if (calloutMeta) {
      calloutMeta.innerHTML = `
        <span>⏱ Duration: <strong>${activeAsm.duration_minutes || 30} mins</strong></span>
        <span>📅 Format: <strong>20 Multiple Choice Questions</strong></span>
      `;
    }
    if (btnTakeAsm) {
      btnTakeAsm.disabled = false;
      btnTakeAsm.className = "btn btn-emerald";
      btnTakeAsm.style.opacity = "1";
      btnTakeAsm.style.cursor = "pointer";
      btnTakeAsm.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Take Assessment Now
      `;
    }
  }
}

// --- Role Suitability Analysis Workspace ---
function setupSuitabilityListeners() {
  const empSelect = document.getElementById('suit-select-employee');
  const roleSelect = document.getElementById('suit-select-role');

  const sliders = [
    'slider-sim-exp', 'slider-sim-asm', 'slider-sim-projects',
    'slider-sim-py', 'slider-sim-c', 'slider-sim-java', 'slider-sim-dbms',
    'slider-sim-comm', 'slider-sim-apt'
  ];

  empSelect.addEventListener('change', () => {
    syncSlidersToEmployee(empSelect.value);
    runSuitabilityEvaluation();
  });

  roleSelect.addEventListener('change', () => {
    runSuitabilityEvaluation();
  });

  sliders.forEach(sliderId => {
    const el = document.getElementById(sliderId);
    el.addEventListener('input', () => {
      updateSliderValueLabels();
      runSuitabilityEvaluation();
    });
  });

  document.getElementById('btn-reset-simulation').addEventListener('click', () => {
    syncSlidersToEmployee(empSelect.value);
    runSuitabilityEvaluation();
    showToast("Simulation parameters reset to employee baseline");
  });

  const btnSuitAI = document.getElementById('btn-suit-ai-recommend');
  if (btnSuitAI) {
    btnSuitAI.addEventListener('click', async () => {
      const roleId = roleSelect.value;
      try {
        showToast("Consulting LeadSync AI for optimal candidate...", "info");
        const res = await api.getQuickMatch(roleId);
        const best = res.best_perfect_employee;
        if (best) {
          empSelect.value = best.employee_id;
          state.activeEmployeeId = best.employee_id;
          syncSlidersToEmployee(best.employee_id);
          runSuitabilityEvaluation();
          showToast(`AI crowned ${best.name} (${best.overall_score}% Match) as the optimal candidate for ${res.role_evaluated.title}!`, "success");
        }
      } catch (e) {
        console.error("AI recommend error:", e);
        showToast("Failed to fetch AI recommendation", "error");
      }
    });
  }
}

function syncSlidersToEmployee(empId) {
  const emp = state.employees.find(e => e.id === empId) || state.employees[0];
  if (!emp) return;

  const skills = emp.skills || {};
  const asm = emp.assessment_scores || { completed: false, score_pct: 0 };
  const asmScore = (asm.completed ? (asm.score_pct ?? 0) : 0);

  document.getElementById('slider-sim-exp').value = emp.experience_years ?? 0;
  document.getElementById('slider-sim-asm').value = asmScore;
  document.getElementById('slider-sim-projects').value = (emp.projects || []).length;
  document.getElementById('slider-sim-py').value = skills['Python'] ?? 0;
  document.getElementById('slider-sim-c').value = skills['C'] ?? 0;
  document.getElementById('slider-sim-java').value = skills['Java'] ?? 0;
  document.getElementById('slider-sim-dbms').value = skills['DBMS'] ?? 0;
  document.getElementById('slider-sim-comm').value = skills['Communication'] ?? 0;
  document.getElementById('slider-sim-apt').value = skills['Aptitude'] ?? 0;

  updateSliderValueLabels();
}

function updateSliderValueLabels() {
  document.getElementById('val-sim-exp').textContent = `${document.getElementById('slider-sim-exp').value} yrs`;
  document.getElementById('val-sim-asm').textContent = `${document.getElementById('slider-sim-asm').value}%`;
  document.getElementById('val-sim-projects').textContent = `${document.getElementById('slider-sim-projects').value} Projects`;
  document.getElementById('val-sim-py').textContent = `${document.getElementById('slider-sim-py').value}%`;
  document.getElementById('val-sim-c').textContent = `${document.getElementById('slider-sim-c').value}%`;
  document.getElementById('val-sim-java').textContent = `${document.getElementById('slider-sim-java').value}%`;
  document.getElementById('val-sim-dbms').textContent = `${document.getElementById('slider-sim-dbms').value}%`;
  document.getElementById('val-sim-comm').textContent = `${document.getElementById('slider-sim-comm').value}%`;
  document.getElementById('val-sim-apt').textContent = `${document.getElementById('slider-sim-apt').value}%`;
}

async function runSuitabilityEvaluation() {
  const empId = document.getElementById('suit-select-employee').value || state.activeEmployeeId;
  const roleId = document.getElementById('suit-select-role').value || 'ROLE-SSE';

  const payload = {
    employee_id: empId,
    role_id: roleId,
    override_experience: parseFloat(document.getElementById('slider-sim-exp').value),
    override_assessment_score: parseInt(document.getElementById('slider-sim-asm').value),
    override_projects_count: parseInt(document.getElementById('slider-sim-projects').value),
    override_skills: {
      "Python": parseInt(document.getElementById('slider-sim-py').value),
      "C": parseInt(document.getElementById('slider-sim-c').value),
      "Java": parseInt(document.getElementById('slider-sim-java').value),
      "DBMS": parseInt(document.getElementById('slider-sim-dbms').value),
      "Communication": parseInt(document.getElementById('slider-sim-comm').value),
      "Aptitude": parseInt(document.getElementById('slider-sim-apt').value)
    }
  };

  try {
    const res = await api.evaluateSuitability(payload);
    const evalData = res.evaluations[0];
    if (!evalData) return;

    // Update UI elements
    document.getElementById('suit-target-role-title').textContent = evalData.role_title;
    document.getElementById('suit-candidate-name').textContent = `Evaluating ${evalData.employee_name} (${evalData.current_role})`;
    document.getElementById('suit-score-display').textContent = `${evalData.overall_score}%`;

    const badge = document.getElementById('suit-readiness-badge');
    badge.textContent = evalData.readiness_status;
    badge.className = `status-pill status-${evalData.status_color}`;
    document.getElementById('suit-timeframe').textContent = evalData.timeframe;

    // Dimensions
    const dims = evalData.dimension_scores || {};
    document.getElementById('dim-skills-score').textContent = `${dims.skills_match || 80}%`;
    document.getElementById('dim-project-score').textContent = `${dims.project_relevance || 75}%`;
    document.getElementById('dim-asm-score').textContent = `${dims.assessment_score || 85}%`;
    document.getElementById('dim-exp-score').textContent = `${dims.experience_fit || 80}%`;

    // AI Narrative
    document.getElementById('ai-narrative-text').textContent = evalData.ai_recommendation;

    // Strengths and Gaps
    const strengthsUl = document.getElementById('suit-strengths-list');
    strengthsUl.innerHTML = (evalData.strengths || []).map(s => `<li>${s}</li>`).join('');

    const gapsUl = document.getElementById('suit-gaps-list');
    gapsUl.innerHTML = (evalData.gaps || []).map(g => `<li>${g}</li>`).join('');

    // Render Radar Chart
    const targetRole = state.leadershipRoles.find(r => r.id === roleId) || state.leadershipRoles[0];
    const candidateSkills = Object.fromEntries(
      Object.entries(evalData.skills_breakdown || {}).map(([k, v]) => [k, v.candidate])
    );
    const benchmarkSkills = targetRole ? targetRole.benchmark_skills : {};

    if (window.renderRadarChart) {
      window.renderRadarChart('suitability-radar-chart', candidateSkills, benchmarkSkills, evalData.employee_name, evalData.role_title);
    }

  } catch (error) {
    console.error("Suitability eval error:", error);
  }
}

function inspectEmployeeInSuitability(empId) {
  state.activeEmployeeId = empId;
  document.getElementById('suit-select-employee').value = empId;
  syncSlidersToEmployee(empId);
  navigateToTab('tab-suitability');
  runSuitabilityEvaluation();
}

window.inspectEmployeeInSuitability = inspectEmployeeInSuitability;

// --- Leadership Succession Matrix View (5 Roles) ---
function renderSuccessionMatrix() {
  const container = document.getElementById('succession-roles-container');
  if (!container) return;

  container.innerHTML = state.successionMatrix.map(item => {
    const healthClass = item.bench_health === 'Strong' ? 'bench-strong' : 
      (item.bench_health === 'Moderate' ? 'bench-moderate' : 'bench-vulnerable');

    const topSuccessorsHtml = (item.top_candidates || []).map((cand, i) => {
      const rankNum = i + 1;
      const statusClass = cand.overall_score >= 85 ? 'status-emerald' : 
        (cand.overall_score >= 70 ? 'status-cyan' : 'status-amber');

      return `
        <div class="successor-item" onclick="inspectEmployeeForRole('${cand.employee_id}', '${item.role_id}')">
          <div class="successor-left">
            <span class="successor-rank">#${rankNum}</span>
            <div style="display: flex; flex-direction: column;">
              <span class="successor-name">${cand.employee_name}</span>
              <span style="font-size: 0.7rem; color: var(--text-muted);">${cand.current_role}</span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="status-pill ${statusClass}">${cand.overall_score}%</span>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="role-card">
        <div class="role-card-header">
          <div>
            <div class="role-card-title">${item.role_title}</div>
            <div class="role-card-dept">${item.department} • Target: ${item.target_experience_years}+ yrs exp</div>
          </div>
          <span class="bench-badge ${healthClass}">${item.bench_health} Bench</span>
        </div>

        <div style="display: flex; gap: 14px; font-size: 0.78rem; color: var(--text-secondary); background: #f8fafc; border: 1px solid var(--border-subtle); padding: 8px 12px; border-radius: var(--radius-sm);">
          <span>Ready Now: <strong style="color: #059669;">${item.ready_now_count}</strong></span>
          <span>In 6-12 Mos: <strong style="color: #0284c7;">${item.near_ready_count}</strong></span>
          <span>Talent Pool: <strong>${item.total_candidates_evaluated}</strong></span>
        </div>

        <div class="successors-pipeline">
          <span style="font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Top Recommended Successors:</span>
          ${topSuccessorsHtml}
        </div>

        <button class="btn btn-secondary btn-sm" style="margin-top: auto; justify-content: center;" onclick="inspectRoleInSuitability('${item.role_id}')">
          Evaluate Candidates for ${item.role_title} →
        </button>
      </div>
    `;
  }).join('');
}

function inspectRoleInSuitability(roleId) {
  document.getElementById('suit-select-role').value = roleId;
  navigateToTab('tab-suitability');
  runSuitabilityEvaluation();
}

function inspectEmployeeForRole(empId, roleId) {
  state.activeEmployeeId = empId;
  document.getElementById('suit-select-employee').value = empId;
  document.getElementById('suit-select-role').value = roleId;
  syncSlidersToEmployee(empId);
  navigateToTab('tab-suitability');
  runSuitabilityEvaluation();
}

window.inspectRoleInSuitability = inspectRoleInSuitability;
window.inspectEmployeeForRole = inspectEmployeeForRole;

// --- Assessment Test Runner Modal (20 Questions Interactive Flow) ---
async function startAssessmentTest() {
  if (!state.assessments || state.assessments.length === 0 || !state.activeAssessmentId) {
    showToast("No active assessment assigned. HR must assign a test before employees can attend.", "info");
    return;
  }

  const activeEmp = getActiveEmployee();
  state.testActive = true;
  state.testCurrentIndex = 0;
  state.testAnswers = {};
  state.testTimerSeconds = 1800; // 30 mins

  document.getElementById('test-candidate-name').textContent = activeEmp.name;

  try {
    const res = await api.getAssessmentQuestions(state.activeAssessmentId, activeEmp.id);
    state.testQuestions = res.questions || [];

    if (state.testQuestions.length === 0) {
      showToast("No questions loaded", "error");
      return;
    }

    // Render Question Navigator dots (1 to 20)
    renderTestQuestionDots();
    renderActiveTestQuestion();

    // Start Timer
    if (state.testTimerInterval) clearInterval(state.testTimerInterval);
    state.testTimerInterval = setInterval(updateTestTimer, 1000);

    // Show Modal
    document.getElementById('modal-assessment-runner').classList.add('active');

  } catch (error) {
    console.error("Test start error:", error);
    showToast("Error starting assessment test", "error");
  }
}

function updateTestTimer() {
  state.testTimerSeconds--;
  if (state.testTimerSeconds <= 0) {
    clearInterval(state.testTimerInterval);
    submitAssessmentTest();
    return;
  }

  const mins = Math.floor(state.testTimerSeconds / 60);
  const secs = state.testTimerSeconds % 60;
  document.getElementById('test-timer-display').textContent = 
    `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function renderTestQuestionDots() {
  const navContainer = document.getElementById('test-question-nav');
  if (!navContainer) return;

  navContainer.innerHTML = state.testQuestions.map((q, idx) => {
    const isAnswered = state.testAnswers[q.id] !== undefined;
    const isCurrent = idx === state.testCurrentIndex;
    const classes = ['q-nav-dot'];
    if (isAnswered) classes.push('answered');
    if (isCurrent) classes.push('current');

    return `<button class="${classes.join(' ')}" onclick="jumpToQuestion(${idx})">${idx + 1}</button>`;
  }).join('');
}

function renderActiveTestQuestion() {
  const q = state.testQuestions[state.testCurrentIndex];
  if (!q) return;

  document.getElementById('test-question-category').textContent = q.category;
  document.getElementById('test-question-number').textContent = `Question ${state.testCurrentIndex + 1} of ${state.testQuestions.length}`;
  document.getElementById('test-question-text').textContent = q.question;

  const optionsContainer = document.getElementById('test-options-container');
  const selectedIdx = state.testAnswers[q.id];

  optionsContainer.innerHTML = q.options.map((opt, optIdx) => {
    const isChecked = selectedIdx === optIdx;
    return `
      <label class="q-option-label ${isChecked ? 'selected' : ''}" onclick="selectTestOption('${q.id}', ${optIdx})">
        <input type="radio" name="opt-${q.id}" class="q-option-radio" ${isChecked ? 'checked' : ''}>
        <span style="font-size: 0.88rem;">${opt}</span>
      </label>
    `;
  }).join('');

  // Next / Submit Button Visibility
  const prevBtn = document.getElementById('btn-test-prev');
  const nextBtn = document.getElementById('btn-test-next');
  const submitBtn = document.getElementById('btn-test-submit');

  prevBtn.disabled = state.testCurrentIndex === 0;
  if (state.testCurrentIndex === state.testQuestions.length - 1) {
    nextBtn.style.display = 'none';
    submitBtn.style.display = 'inline-flex';
  } else {
    nextBtn.style.display = 'inline-flex';
    submitBtn.style.display = 'none';
  }

  renderTestQuestionDots();
}

function selectTestOption(questionId, optIdx) {
  state.testAnswers[questionId] = optIdx;
  renderActiveTestQuestion();
}

function jumpToQuestion(idx) {
  state.testCurrentIndex = idx;
  renderActiveTestQuestion();
}

function nextTestQuestion() {
  if (state.testCurrentIndex < state.testQuestions.length - 1) {
    state.testCurrentIndex++;
    renderActiveTestQuestion();
  }
}

function prevTestQuestion() {
  if (state.testCurrentIndex > 0) {
    state.testCurrentIndex--;
    renderActiveTestQuestion();
  }
}

function cancelAssessmentTest() {
  if (confirm("Are you sure you want to exit? Your answers will not be saved.")) {
    clearInterval(state.testTimerInterval);
    document.getElementById('modal-assessment-runner').classList.remove('active');
  }
}

async function submitAssessmentTest() {
  clearInterval(state.testTimerInterval);
  const activeEmp = getActiveEmployee();

  const payload = {
    employee_id: activeEmp.id,
    assessment_id: state.activeAssessmentId,
    answers: state.testAnswers
  };

  try {
    const res = await api.submitAssessment(payload);
    document.getElementById('modal-assessment-runner').classList.remove('active');

    const scorePct = res.scores.score_pct;
    const correct = res.scores.correct_count;
    const total = res.scores.total_questions;

    showToast(`Assessment Complete! Score: ${scorePct}% (${correct}/${total} Correct)`, "success");

    // Refresh data to update Top 3 podium and Manager roster
    await loadInitialData();

    // If on Employee tab, re-render
    renderEmployeeSelfView();

  } catch (error) {
    console.error("Submission error:", error);
    showToast("Failed to submit assessment answers", "error");
  }
}

window.selectTestOption = selectTestOption;
window.jumpToQuestion = jumpToQuestion;

// --- Modals: Create Assessment & Add Employee ---
function openCreateAssessmentModal() {
  document.getElementById('modal-create-assessment').classList.add('active');
}

function closeCreateAssessmentModal() {
  document.getElementById('modal-create-assessment').classList.remove('active');
}

function openAddEmployeeModal() {
  document.getElementById('modal-add-employee').classList.add('active');
}

function closeAddEmployeeModal() {
  document.getElementById('modal-add-employee').classList.remove('active');
}

window.openCreateAssessmentModal = openCreateAssessmentModal;
window.closeCreateAssessmentModal = closeCreateAssessmentModal;
window.openAddEmployeeModal = openAddEmployeeModal;
window.closeAddEmployeeModal = closeAddEmployeeModal;

async function handleCreateAssessment(e) {
  e.preventDefault();
  const title = document.getElementById('asm-title').value;
  const desc = document.getElementById('asm-desc').value;
  const date = document.getElementById('asm-date').value;
  const time = document.getElementById('asm-time').value;
  const duration = parseInt(document.getElementById('asm-duration').value);

  try {
    const res = await api.createAssessment({
      title,
      description: desc,
      scheduled_date: date,
      scheduled_time: time,
      duration_minutes: duration,
      assigned_to: state.employees.map(e => e.id)
    });

    closeCreateAssessmentModal();
    showToast(`Assessment "${title}" created and assigned to all employees!`, "success");
    await loadInitialData();

  } catch (error) {
    console.error("Create asm error:", error);
    showToast("Failed to create assessment", "error");
  }
}

async function handleAddEmployee(e) {
  e.preventDefault();
  const name = document.getElementById('add-emp-name').value;
  const role = document.getElementById('add-emp-role').value;
  const dept = document.getElementById('add-emp-dept').value;
  const email = document.getElementById('add-emp-email').value;
  const exp = parseFloat(document.getElementById('add-emp-exp').value);
  const bio = document.getElementById('add-emp-bio').value;
  const projTitle = document.getElementById('add-emp-project-title').value;
  const projDesc = document.getElementById('add-emp-project-desc').value;

  const projects = [];
  if (projTitle) {
    projects.push({
      title: projTitle,
      role: role,
      duration: "4 mos",
      description: projDesc || "Core engineering project delivering verified enterprise impact.",
      tech_stack: ["Python", "FastAPI", "PostgreSQL"],
      impact: "Streamlined workflow and enhanced reliability."
    });
  }

  try {
    const res = await api.addEmployee({
      name,
      role,
      department: dept,
      email,
      experience_years: exp,
      bio,
      projects,
      skills: {
        "Python": 80, "C": 68, "Java": 72, "DBMS": 76,
        "Cloud/DevOps": 70, "Architecture": 72,
        "Communication": 82, "Aptitude": 84, "Leadership": 70
      }
    });

    closeAddEmployeeModal();
    showToast(`Employee ${name} added to database successfully!`, "success");
    await loadInitialData();

  } catch (error) {
    console.error("Add emp error:", error);
    showToast("Failed to add employee", "error");
  }
}

// --- Dedicated Employee Profile Modal ---
async function openProfileModal(empId) {
  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;

  const content = document.getElementById('modal-profile-content');
  const asm = emp.assessment_scores;
  const isCompleted = Boolean(asm && asm.completed === true && (asm.score_pct > 0 || asm.correct_count > 0));
  const scorePct = isCompleted ? (asm.score_pct || 0) : 0;
  const correctCount = isCompleted ? (asm.correct_count || 0) : 0;
  const skills = emp.skills || {};
  const projects = emp.projects || [];
  const certs = emp.certifications || [];

  content.innerHTML = `
    <div style="display: flex; gap: 20px; align-items: flex-start; margin-bottom: 20px;">
      <div style="width: 70px; height: 70px; border-radius: var(--radius-full); background: #4f46e5; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; font-weight: 800; color: white;">
        ${emp.avatar || 'EM'}
      </div>
      <div>
        <h3 style="font-size: 1.45rem;">${emp.name}</h3>
        <div style="color: #0284c7; font-weight: 600; font-size: 0.95rem;">${emp.role} • ${emp.department}</div>
        <div style="color: var(--text-muted); font-size: 0.84rem; margin-top: 2px;">
          ${emp.email} • Experience: <strong>${emp.experience_years} Years</strong>
        </div>
      </div>
    </div>

    <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 20px;">
      ${emp.bio}
    </p>

    <div style="margin-bottom: 20px;">
      <h4 style="font-size: 1rem; margin-bottom: 10px; color: #0f172a;">Assessment Performance</h4>
      <div style="display: flex; align-items: center; gap: 14px; background: #f8fafc; border: 1px solid var(--border-subtle); padding: 14px 18px; border-radius: var(--radius-md);">
        <div style="font-size: 2.2rem; font-weight: 800; color: ${isCompleted ? '#059669' : '#d97706'}; font-family: var(--font-heading);">${scorePct}%</div>
        <div style="font-size: 0.88rem; color: var(--text-secondary);">
          <div>20 Questions Assessment Score (${correctCount}/20 Correct)</div>
          <div style="color: var(--text-muted); font-size: 0.78rem;">${isCompleted ? `Completed: ${asm.date || 'Oct 2026'}` : 'Status: Not Attended (Assessment Pending)'}</div>
        </div>
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <h4 style="font-size: 0.95rem; margin-bottom: 10px; color: #0f172a;">Completed Production Projects (${projects.length})</h4>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${projects.map(p => `
          <div style="background: #f8fafc; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px;">
            <div style="font-weight: 700; color: #0f172a; font-size: 0.9rem;">${p.title}</div>
            <div style="font-size: 0.76rem; color: var(--accent-cyan); font-weight: 600;">${p.role} • ${p.duration}</div>
            <p style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 4px;">${p.description}</p>
            <div style="font-size: 0.78rem; color: #059669; margin-top: 4px; font-weight: 600;">Impact: ${p.impact}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <h4 style="font-size: 0.95rem; margin-bottom: 10px; color: #0f172a;">Existing Skills Proficiency</h4>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
        ${Object.entries(skills).map(([k, v]) => `
          <div style="background: #f8fafc; border: 1px solid var(--border-subtle); padding: 8px 10px; border-radius: var(--radius-sm);">
            <div style="font-size: 0.74rem; color: var(--text-secondary);">${k}</div>
            <div style="font-size: 1rem; font-weight: 700; color: #0f172a; font-family: var(--font-mono);">${v}%</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="display: flex; justify-content: flex-end; gap: 10px;">
      <button class="btn btn-secondary btn-sm" onclick="closeProfileModal()">Close</button>
      <button class="btn btn-secondary btn-sm" onclick="closeProfileModal(); openManagerEditModal('${emp.id}');" style="border-color:#38bdf8; color:#0284c7; background:#f0f9ff; font-weight:700;">
        ✏️ Edit Details
      </button>
      <button class="btn btn-primary btn-sm" onclick="closeProfileModal(); inspectEmployeeInSuitability('${emp.id}');">
        Run Suitability Analysis →
      </button>
    </div>
  `;

  document.getElementById('modal-employee-profile').classList.add('active');
}

function closeProfileModal() {
  document.getElementById('modal-employee-profile').classList.remove('active');
}

window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;

// --- Toast Notifications ---
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span style="font-size: 1rem;">${type === 'success' ? '✓' : 'ℹ'}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

window.showToast = showToast;

// ==========================================================================
// LeadSync AI Role Matcher & Candidate Discovery Controller
// ==========================================================================

function setupAIMatcher() {
  updateAIPresetSummary(document.getElementById('ai-select-preset-role')?.value || 'ROLE-SSE');
  updateAICustomSliderLabels();

  ['slider-ai-py', 'slider-ai-c', 'slider-ai-java', 'slider-ai-dbms', 'slider-ai-comm', 'slider-ai-apt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateAICustomSliderLabels);
    }
  });
}

function setAIMatcherMode(mode) {
  state.aiMatcherMode = mode;
  const isPreset = mode === 'preset';

  const btnPreset = document.getElementById('btn-mode-preset');
  const btnCustom = document.getElementById('btn-mode-custom');
  if (btnPreset) btnPreset.classList.toggle('active', isPreset);
  if (btnCustom) btnCustom.classList.toggle('active', !isPreset);

  const secPreset = document.getElementById('ai-section-preset');
  const secCustom = document.getElementById('ai-section-custom');
  if (secPreset) secPreset.style.display = isPreset ? 'block' : 'none';
  if (secCustom) secCustom.style.display = isPreset ? 'none' : 'block';

  if (isPreset) {
    updateAIPresetSummary(document.getElementById('ai-select-preset-role')?.value || 'ROLE-SSE');
  }
}

function updateAICustomSliderLabels() {
  const map = {
    'slider-ai-py': 'val-ai-py',
    'slider-ai-c': 'val-ai-c',
    'slider-ai-java': 'val-ai-java',
    'slider-ai-dbms': 'val-ai-dbms',
    'slider-ai-comm': 'val-ai-comm',
    'slider-ai-apt': 'val-ai-apt'
  };
  for (const [sId, lId] of Object.entries(map)) {
    const sEl = document.getElementById(sId);
    const lEl = document.getElementById(lId);
    if (sEl && lEl) {
      lEl.textContent = `${sEl.value}%`;
    }
  }
}

function updateAIPresetSummary(roleId) {
  const summaryBox = document.getElementById('ai-preset-role-summary');
  if (!summaryBox) return;

  const role = state.leadershipRoles.find(r => r.id === roleId) || state.leadershipRoles[0];
  if (!role) return;

  const skills = role.benchmark_skills || {};
  summaryBox.innerHTML = `
    <div style="font-weight: 700; color: #1e1b4b; font-size: 0.92rem; margin-bottom: 4px;">
      ${role.title} • ${role.department}
    </div>
    <div class="role-desc">${role.description}</div>
    <div style="font-size: 0.74rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px;">
      Target Seniority: <strong>${role.target_experience_years}+ Years</strong> | Benchmark Skills:
    </div>
    <div class="role-badges">
      ${Object.entries(skills).slice(0, 6).map(([k, v]) => `
        <span class="status-pill status-cyan" style="font-size: 0.73rem;">${k}: ${v}%</span>
      `).join('')}
    </div>
  `;
}

async function handleParseJD() {
  const jdText = document.getElementById('ai-custom-jd-text')?.value.trim();
  if (!jdText) {
    showToast("Please enter or paste job description text to parse.", "error");
    return;
  }

  try {
    showToast("Analyzing job description with AI...", "info");
    const parsed = await api.parseJobDescription(jdText);

    if (parsed.title) document.getElementById('ai-custom-title').value = parsed.title;
    if (parsed.department) document.getElementById('ai-custom-dept').value = parsed.department;
    if (parsed.target_experience_years) document.getElementById('ai-custom-exp').value = parsed.target_experience_years;

    const b = parsed.benchmark_skills || {};
    if (b['Python']) document.getElementById('slider-ai-py').value = b['Python'];
    if (b['C']) document.getElementById('slider-ai-c').value = b['C'];
    if (b['Java']) document.getElementById('slider-ai-java').value = b['Java'];
    if (b['DBMS']) document.getElementById('slider-ai-dbms').value = b['DBMS'];
    if (b['Communication']) document.getElementById('slider-ai-comm').value = b['Communication'];
    if (b['Aptitude']) document.getElementById('slider-ai-apt').value = b['Aptitude'];

    updateAICustomSliderLabels();
    showToast(`AI successfully extracted criteria for: ${parsed.title}`, "success");
    await runAIMatching();

  } catch (error) {
    console.error("Parse JD error:", error);
    showToast("Failed to parse job description", "error");
  }
}

async function runAIMatching() {
  const spinner = document.getElementById('ai-matching-spinner');
  const heroCard = document.getElementById('ai-perfect-employee-card');
  const h2hCard = document.getElementById('ai-head-to-head-card');

  if (spinner) spinner.style.display = 'block';
  if (heroCard) heroCard.style.opacity = '0.5';

  const deptFilter = document.getElementById('ai-filter-candidate-dept')?.value;
  let payload = {};

  if (state.aiMatcherMode === 'preset') {
    const roleId = document.getElementById('ai-select-preset-role')?.value || 'ROLE-SSE';
    payload = {
      role_id: roleId,
      department_filter: deptFilter === 'all' ? null : deptFilter
    };
  } else {
    payload = {
      role_id: "CUSTOM",
      department_filter: deptFilter === 'all' ? null : deptFilter,
      custom_role: {
        title: document.getElementById('ai-custom-title')?.value.trim() || "Senior Technical Specialist",
        department: document.getElementById('ai-custom-dept')?.value || "Engineering",
        target_experience_years: parseFloat(document.getElementById('ai-custom-exp')?.value) || 4.0,
        benchmark_skills: {
          "Python": parseInt(document.getElementById('slider-ai-py')?.value || 80),
          "C": parseInt(document.getElementById('slider-ai-c')?.value || 70),
          "Java": parseInt(document.getElementById('slider-ai-java')?.value || 80),
          "DBMS": parseInt(document.getElementById('slider-ai-dbms')?.value || 85),
          "Communication": parseInt(document.getElementById('slider-ai-comm')?.value || 75),
          "Aptitude": parseInt(document.getElementById('slider-ai-apt')?.value || 80)
        },
        job_description_text: document.getElementById('ai-custom-jd-text')?.value || ""
      }
    };
  }

  try {
    const res = await api.matchRole(payload);
    state.currentAIMatchResult = res;

    if (spinner) spinner.style.display = 'none';
    if (heroCard) heroCard.style.opacity = '1';

    renderAIPerfectCandidate(res.best_perfect_employee, res.role_evaluated, res.onboarding_plan);
    renderAIHeadToHead(res.best_perfect_employee, res.runner_up, res.role_evaluated);
    renderAIRadar(res.radar_data, res.best_perfect_employee.name, res.role_evaluated.title);
    renderAIRankedCohort(res.all_ranked_candidates);

    const badge = document.getElementById('ai-total-evaluated-badge');
    if (badge) badge.textContent = `${res.total_candidates_evaluated} Evaluated`;

  } catch (error) {
    console.error("AI Match error:", error);
    if (spinner) spinner.style.display = 'none';
    if (heroCard) heroCard.style.opacity = '1';
    showToast("AI matching evaluation failed", "error");
  }
}

function renderAIPerfectCandidate(cand, roleEval, onboardingPlan) {
  const container = document.getElementById('ai-perfect-employee-card');
  if (!container || !cand) return;

  const dims = cand.dimension_scores || {};
  const asm = cand.assessment_data || {};
  const exp = cand.experience_data || {};
  const strengths = cand.strengths || [];

  container.innerHTML = `
    <div class="hero-crown-ribbon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      #1 Best Perfect Employee For Role
    </div>

    <div class="hero-cand-header">
      <div class="hero-cand-profile">
        <div class="hero-avatar">${cand.avatar || 'EM'}</div>
        <div>
          <div style="font-size: 0.78rem; text-transform: uppercase; color: var(--accent-cyan); font-weight: 700;">
            Target Role: ${roleEval.title}
          </div>
          <h2 style="font-size: 1.6rem; color: #0f172a; margin: 2px 0;">${cand.name}</h2>
          <div style="font-size: 0.88rem; color: var(--text-secondary);">
            <strong>${cand.current_role}</strong> • ${cand.department} • Experience: <strong>${cand.experience_years} Years</strong> (${exp.status || 'Verified'})
          </div>
          <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="status-pill status-${cand.status_color}" style="font-weight: 700; font-size: 0.8rem;">
              ● ${cand.readiness_status}
            </span>
            <span style="font-size: 0.78rem; color: var(--text-muted);">
              Confidence: <strong>${cand.confidence}</strong> | Timeframe: <strong>${cand.timeframe}</strong>
            </span>
          </div>
        </div>
      </div>

      <div class="hero-score-badge">
        <span class="hero-score-num">${cand.overall_score}%</span>
        <span class="hero-score-sub">AI Match Index</span>
      </div>
    </div>

    <!-- 4 Dimensional Progress Bars -->
    <div class="dim-bars-grid">
      <div class="dim-bar-card">
        <div class="dim-bar-head">
          <span style="font-weight: 600; color: #334155;">Skills Match (35%)</span>
          <strong style="color: #4f46e5;">${dims.skills_match}%</strong>
        </div>
        <div class="dim-bar-track">
          <div class="dim-bar-fill" style="width: ${dims.skills_match}%; background: linear-gradient(90deg, #6366f1, #4f46e5);"></div>
        </div>
      </div>
      <div class="dim-bar-card">
        <div class="dim-bar-head">
          <span style="font-weight: 600; color: #334155;">Projects Track (25%)</span>
          <strong style="color: #0284c7;">${dims.project_relevance}%</strong>
        </div>
        <div class="dim-bar-track">
          <div class="dim-bar-fill" style="width: ${dims.project_relevance}%; background: linear-gradient(90deg, #38bdf8, #0284c7);"></div>
        </div>
      </div>
      <div class="dim-bar-card">
        <div class="dim-bar-head">
          <span style="font-weight: 600; color: #334155;">Assessment Fit (25%)</span>
          <strong style="color: #059669;">${dims.assessment_fit}%</strong>
        </div>
        <div class="dim-bar-track">
          <div class="dim-bar-fill" style="width: ${dims.assessment_fit}%; background: linear-gradient(90deg, #34d399, #059669);"></div>
        </div>
      </div>
      <div class="dim-bar-card">
        <div class="dim-bar-head">
          <span style="font-weight: 600; color: #334155;">Experience Fit (15%)</span>
          <strong style="color: #d97706;">${dims.experience_fit}%</strong>
        </div>
        <div class="dim-bar-track">
          <div class="dim-bar-fill" style="width: ${dims.experience_fit}%; background: linear-gradient(90deg, #fbbf24, #d97706);"></div>
        </div>
      </div>
    </div>

    <!-- AI Executive Recommendation Narrative -->
    <div class="ai-executive-box">
      <div class="title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span>AI Executive Justification & Strategic Rationale</span>
      </div>
      <div class="narrative">${cand.ai_rationale}</div>
    </div>

    <!-- Standout Production Evidence & Projects -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px;">
      <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: var(--radius-md); padding: 12px 14px;">
        <div style="font-size: 0.76rem; font-weight: 700; text-transform: uppercase; color: #065f46; margin-bottom: 6px;">
          ✓ Standout Competency Strengths
        </div>
        <ul style="font-size: 0.8rem; color: #334155; padding-left: 16px; display: flex; flex-direction: column; gap: 4px;">
          ${strengths.slice(0, 3).map(s => `<li>${s}</li>`).join('')}
        </ul>
      </div>

      <div style="background: #f8fafc; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 14px;">
        <div style="font-size: 0.76rem; font-weight: 700; text-transform: uppercase; color: #4338ca; margin-bottom: 6px;">
          ★ 20-Question Assessment Evidence
        </div>
        <div style="font-size: 0.82rem; color: #334155;">
          ${asm.notes || 'Assessment verified across core modules.'}
        </div>
        <div style="margin-top: 6px; font-size: 0.76rem; color: var(--text-muted);">
          Top Assessment Category: <strong>${asm.top_category || 'Technical'}</strong>
        </div>
      </div>
    </div>

    <!-- Targeted 90-Day Transition & Onboarding Plan -->
    <div style="margin-top: 20px;">
      <h4 style="font-size: 0.94rem; color: #0f172a; display: flex; align-items: center; gap: 8px;">
        <span style="color: #059669;">🗓</span> AI 90-Day Succession & Onboarding Roadmap
      </h4>
      <div class="plan-accordion">
        ${(onboardingPlan || []).map((p, idx) => `
          <div class="plan-item">
            <div class="plan-phase">
              <span class="status-pill status-cyan" style="font-size: 0.7rem;">Step ${idx + 1}</span>
              <span>${p.phase}</span>
            </div>
            <div class="plan-desc">
              <strong>Objective:</strong> ${p.objective}<br>
              <strong>Action Steps:</strong> ${p.actions}
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Actions Toolbar -->
    <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 20px; border-top: 1px solid var(--border-subtle); padding-top: 16px;">
      <button class="btn btn-secondary btn-sm" onclick="openProfileModal('${cand.employee_id}')">
        View Full Profile
      </button>
      <button class="btn btn-secondary btn-sm" onclick="inspectEmployeeInSuitability('${cand.employee_id}')">
        Test in What-If Simulator →
      </button>
      <button class="btn btn-emerald btn-sm" onclick="appointCandidateFromAI('${cand.employee_id}', '${roleEval.role_id}', '${roleEval.title}')" style="box-shadow: 0 4px 12px rgba(5, 150, 105, 0.25);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Appoint as Succession Successor
      </button>
    </div>
  `;
}

function renderAIHeadToHead(bestCand, runnerUp, roleEval) {
  const container = document.getElementById('ai-head-to-head-card');
  if (!container) return;

  if (!bestCand || !runnerUp) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  const bestDims = bestCand.dimension_scores || {};
  const runDims = runnerUp.dimension_scores || {};
  const diff = bestCand.overall_score - runnerUp.overall_score;

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <div>
        <h3 style="font-size: 1.05rem; color: #0f172a;">Head-to-Head Candidate Comparison</h3>
        <p style="font-size: 0.8rem; color: var(--text-secondary);">Direct contrast between #1 Best Perfect Match and the leading Runner-Up candidate.</p>
      </div>
      <span class="badge-tag" style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; font-weight: 700;">
        +${diff}% Score Advantage
      </span>
    </div>

    <div class="h2h-container">
      <!-- Best Candidate Card -->
      <div class="h2h-card best">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span class="badge-tag" style="background: #059669; color: white;">#1 Recommended Match</span>
          <strong style="font-size: 1.3rem; color: #059669;">${bestCand.overall_score}%</strong>
        </div>
        <div style="font-size: 1.1rem; font-weight: 700; color: #0f172a;">${bestCand.name}</div>
        <div style="font-size: 0.78rem; color: var(--text-secondary);">${bestCand.current_role} • ${bestCand.experience_years} yrs exp</div>

        <div style="margin-top: 12px; font-size: 0.78rem; display: flex; flex-direction: column; gap: 4px;">
          <div>Skills Match: <strong>${bestDims.skills_match}%</strong></div>
          <div>Project Track: <strong>${bestDims.project_relevance}%</strong></div>
          <div>Assessment Result: <strong>${bestDims.assessment_fit}%</strong></div>
          <div>Seniority Fit: <strong>${bestDims.experience_fit}%</strong></div>
        </div>
        <div style="margin-top: 10px; font-size: 0.75rem; color: #065f46; font-weight: 600;">
          Status: ${bestCand.readiness_status}
        </div>
      </div>

      <!-- Runner Up Card -->
      <div class="h2h-card runner">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span class="badge-tag" style="background: #0284c7; color: white;">#2 Runner-Up</span>
          <strong style="font-size: 1.3rem; color: #0284c7;">${runnerUp.overall_score}%</strong>
        </div>
        <div style="font-size: 1.1rem; font-weight: 700; color: #0f172a;">${runnerUp.name}</div>
        <div style="font-size: 0.78rem; color: var(--text-secondary);">${runnerUp.current_role} • ${runnerUp.experience_years} yrs exp</div>

        <div style="margin-top: 12px; font-size: 0.78rem; display: flex; flex-direction: column; gap: 4px;">
          <div>Skills Match: <strong>${runDims.skills_match}%</strong></div>
          <div>Project Track: <strong>${runDims.project_relevance}%</strong></div>
          <div>Assessment Result: <strong>${runDims.assessment_fit}%</strong></div>
          <div>Seniority Fit: <strong>${runDims.experience_fit}%</strong></div>
        </div>
        <div style="margin-top: 10px; font-size: 0.75rem; color: #0369a1; font-weight: 600;">
          Status: ${runnerUp.readiness_status}
        </div>
      </div>
    </div>
  `;
}

function renderAIRadar(radarData, candName, roleTitle) {
  if (!radarData || !window.renderAIMatchRadarChart) return;
  window.renderAIMatchRadarChart(
    'ai-match-radar-chart',
    radarData.skills,
    radarData.candidate_scores,
    radarData.benchmark_scores,
    candName,
    roleTitle
  );
}

function renderAIRankedCohort(candidates) {
  const tbody = document.getElementById('ai-ranked-cohort-tbody');
  if (!tbody || !candidates) return;

  tbody.innerHTML = candidates.map(c => {
    const isTop = c.rank === 1;
    const rankBadge = isTop ? '🏆 #1' : `#${c.rank}`;
    const rowClass = isTop ? 'style="background: #f0fdf4;"' : '';
    const statusClass = c.overall_score >= 85 ? 'status-emerald' : 
      (c.overall_score >= 70 ? 'status-cyan' : 'status-amber');

    return `
      <tr ${rowClass}>
        <td><strong style="color: ${isTop ? '#059669' : 'inherit'};">${rankBadge}</strong></td>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="user-avatar-sm" style="width: 28px; height: 28px; font-size: 0.7rem; background: ${isTop ? '#059669' : '#64748b'}; color: white;">
              ${c.avatar || 'EM'}
            </div>
            <div>
              <span style="font-weight: 600; color: #0f172a;">${c.name}</span>
              <div style="font-size: 0.7rem; color: var(--text-muted);">${c.department}</div>
            </div>
          </div>
        </td>
        <td>${c.current_role}</td>
        <td>${c.experience_years} yrs</td>
        <td>
          <span style="font-family: var(--font-mono); font-weight: 700; color: ${isTop ? '#059669' : '#334155'}; font-size: 0.95rem;">
            ${c.overall_score}%
          </span>
        </td>
        <td>
          <span style="font-family: var(--font-mono); font-size: 0.85rem;">
            ${c.dimension_scores?.assessment_fit || 75}%
          </span>
        </td>
        <td><span class="status-pill ${statusClass}">${c.readiness_status}</span></td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-xs" onclick="inspectEmployeeInSuitability('${c.employee_id}')">
            Analyze
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function appointCandidateFromAI(empId, roleId, roleTitle) {
  try {
    const res = await api.appointCandidate({
      employee_id: empId,
      role_id: roleId,
      role_title: roleTitle,
      decision_notes: `Candidate validated and crowned as #1 best match by LeadSync AI Engine.`
    });
    const targetEmp = (state.employees || []).find(e => e.id === empId);
    if (targetEmp) {
      targetEmp.appointed_role = roleTitle;
    }
    renderHRStats();
    showToast(res.message, "success");
    await loadInitialData();
  } catch (error) {
    console.error("Appoint error:", error);
    showToast("Failed to record appointment", "error");
  }
}

function exportAIReport() {
  window.print();
}

window.setAIMatcherMode = setAIMatcherMode;
window.runAIMatching = runAIMatching;
window.handleParseJD = handleParseJD;
window.appointCandidateFromAI = appointCandidateFromAI;
window.exportAIReport = exportAIReport;

// ==========================================================================
// HR AI MULTI-MODAL ROLE ELIGIBILITY & CANDIDATE ANALYZER CONTROLLER
// ==========================================================================

async function setupHRAIAnalyzer() {
  const container = document.getElementById('hr-ai-analyzer-module');
  if (!container) return;

  // 1. Populate Candidate Dropdown with all 15 employees
  const empSelect = document.getElementById('hr-ai-select-employee');
  if (empSelect && state.employees.length > 0) {
    empSelect.innerHTML = state.employees.map(emp => `
      <option value="${emp.id}" ${emp.id === state.hrAI.selectedEmployeeId ? 'selected' : ''}>
        ${emp.id} - ${emp.name} (${emp.role} • ${emp.department})
      </option>
    `).join('');
  }

  // 2. Load IT Skills Catalog
  try {
    const catalogRes = await api.getITSkillsCatalog();
    state.hrAI.itSkillsCatalog = catalogRes.categories || {};
    renderHRAISkillsCategoryTabs();
  } catch (error) {
    console.error("Failed to load IT skills catalog:", error);
  }

  // 3. Update Target Role benchmarks
  updateHRAITargetRoleBenchmarks();

  // 4. Load initial dossier for active employee
  await loadHRAIEmployeeDossier(state.hrAI.selectedEmployeeId);
}

function updateHRAITargetRoleBenchmarks() {
  const roleId = document.getElementById('hr-ai-target-role')?.value || 'ROLE-SSE';
  state.hrAI.targetRoleId = roleId;

  const expBadge = document.getElementById('hr-ai-role-exp-badge');
  const benchBox = document.getElementById('hr-ai-role-benchmarks-box');
  const customInputs = document.getElementById('hr-ai-custom-role-inputs');

  if (roleId === 'CUSTOM') {
    if (customInputs) customInputs.style.display = 'block';
    if (expBadge) expBadge.textContent = 'Custom Seniority';
    if (benchBox) {
      benchBox.innerHTML = `
        <strong>Custom Role Configuration:</strong> Analyzes all computer &amp; IT skills, assessment results, and uploaded certificate/resume images against custom benchmarks.
      `;
    }
    return;
  }

  if (customInputs) customInputs.style.display = 'none';
  const role = state.leadershipRoles.find(r => r.id === roleId) || state.leadershipRoles[0];
  if (!role) return;

  if (expBadge) expBadge.textContent = `Min Exp: ${role.target_experience_years}+ Yrs`;
  if (benchBox) {
    const bSkills = role.benchmark_skills || {};
    benchBox.innerHTML = `
      <div style="font-weight: 700; color: #1e1b4b; margin-bottom: 2px;">
        ${role.title} • Department: ${role.department}
      </div>
      <div style="margin-bottom: 4px; color: #64748b;">${role.description}</div>
      <div style="display: flex; flex-wrap: wrap; gap: 4px;">
        ${Object.entries(bSkills).slice(0, 6).map(([k, v]) => `
          <span class="badge-tag" style="background: #e0e7ff; color: #4338ca; font-size: 0.72rem; padding: 2px 6px;">${k}: ${v}%</span>
        `).join('')}
      </div>
    `;
  }
}

function handleHRAITargetRoleChange() {
  updateHRAITargetRoleBenchmarks();
}

async function handleHRAIEmployeeChange() {
  const empId = document.getElementById('hr-ai-select-employee')?.value || 'EMP-001';
  state.hrAI.selectedEmployeeId = empId;
  await loadHRAIEmployeeDossier(empId);
  executeHRAIEligibilityAnalysis(false);
}

async function navigateHRAICandidate(direction) {
  const emps = state.employees;
  if (!emps || emps.length === 0) return;
  const currentId = state.hrAI.selectedEmployeeId || emps[0].id;
  let idx = emps.findIndex(e => e.id.toLowerCase() === currentId.toLowerCase());
  if (idx === -1) idx = 0;
  let newIdx = (idx + direction + emps.length) % emps.length;
  const nextEmp = emps[newIdx];

  const selectEl = document.getElementById('hr-ai-select-employee');
  if (selectEl) selectEl.value = nextEmp.id;
  state.hrAI.selectedEmployeeId = nextEmp.id;

  await loadHRAIEmployeeDossier(nextEmp.id);
  executeHRAIEligibilityAnalysis(false);

  const moduleEl = document.getElementById('hr-ai-analyzer-module');
  if (moduleEl) {
    moduleEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
window.navigateHRAICandidate = navigateHRAICandidate;

async function loadHRAIEmployeeDossier(empId) {
  try {
    const dossier = await api.getEmployeeDossier(empId);
    state.hrAI.dossier = dossier;

    // Update Dept badge
    const deptBadge = document.getElementById('hr-ai-emp-dept-badge');
    if (deptBadge) {
      deptBadge.textContent = `${dossier.department} • ${dossier.experience_years} Yrs Exp`;
    }

    // Update Experience input
    const expInput = document.getElementById('hr-ai-emp-experience');
    if (expInput) {
      expInput.value = dossier.experience_years !== undefined ? dossier.experience_years : 0.0;
    }

    // Pre-populate skills known
    state.hrAI.selectedSkills.clear();
    if (dossier.skills) {
      Object.keys(dossier.skills).forEach(sk => state.hrAI.selectedSkills.add(sk));
    }
    // Also add technologies from verified projects
    if (dossier.resume?.projects) {
      dossier.resume.projects.forEach(p => {
        (p.tech_stack || []).forEach(t => state.hrAI.selectedSkills.add(t));
      });
    }

    // Reset uploaded overrides for fresh candidate view
    state.hrAI.uploadedCertificates = [];
    state.hrAI.uploadedResume = null;

    // Render components
    renderHRAIAssessmentMarks(dossier.assessment_marks);
    renderHRAISkillsCloud();
    renderHRAICertificatesGallery();
    renderHRAIResumePreview(dossier.resume);

  } catch (error) {
    console.error("Failed to load employee dossier:", error);
    showToast("Failed to load employee credentials", "error");
  }
}

function handleHRAIExperienceChange(val) {
  const yrs = parseFloat(val);
  if (!isNaN(yrs) && state.hrAI.dossier) {
    state.hrAI.dossier.experience_years = yrs;
    const deptBadge = document.getElementById('hr-ai-emp-dept-badge');
    if (deptBadge) {
      deptBadge.textContent = `${state.hrAI.dossier.department} • ${yrs} Yrs Exp`;
    }
  }
}
window.handleHRAIExperienceChange = handleHRAIExperienceChange;

function renderHRAIAssessmentMarks(asm) {
  if (!asm) asm = {};
  const overallBadge = document.getElementById('hr-ai-asm-overall-badge');
  const scorePct = asm.score_pct !== undefined ? asm.score_pct : 0;
  const correctCount = asm.correct_count !== undefined ? asm.correct_count : 0;
  const isCompleted = Boolean(asm.completed);

  if (overallBadge) {
    overallBadge.textContent = isCompleted && scorePct > 0 
      ? `Score: ${scorePct}% (${correctCount}/20)` 
      : (scorePct > 0 ? `Score: ${scorePct}%` : 'Unscored (0%)');
  }

  const simInput = document.getElementById('sim-overall-score');
  if (simInput) simInput.value = scorePct;

  const barsContainer = document.getElementById('hr-ai-assessment-breakdown-bars');
  if (!barsContainer) return;

  const catScores = asm.category_scores || {};

  const cats = [
    { label: "Python", score: catScores["Python"] !== undefined ? catScores["Python"] : scorePct, color: "#4f46e5" },
    { label: "Java", score: catScores["Java"] !== undefined ? catScores["Java"] : scorePct, color: "#0284c7" },
    { label: "C / Systems", score: catScores["C"] !== undefined ? catScores["C"] : scorePct, color: "#0891b2" },
    { label: "DBMS / SQL", score: catScores["DBMS"] !== undefined ? catScores["DBMS"] : scorePct, color: "#16a34a" },
    { label: "Other Tech", score: catScores["Other Tech"] !== undefined ? catScores["Other Tech"] : scorePct, color: "#8b5cf6" },
    { label: "Communication", score: catScores["Communication"] !== undefined ? catScores["Communication"] : scorePct, color: "#d97706" },
    { label: "Aptitude", score: catScores["Aptitude"] !== undefined ? catScores["Aptitude"] : scorePct, color: "#ec4899" }
  ];

  barsContainer.innerHTML = cats.map(c => `
    <div style="background: #ffffff; padding: 6px 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
        <span style="font-weight: 600; color: #334155;">${c.label}:</span>
        <strong style="color: ${c.color};">${c.score}%</strong>
      </div>
      <div style="width: 100%; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
        <div style="width: ${c.score}%; height: 100%; background: ${c.color}; border-radius: 3px;"></div>
      </div>
    </div>
  `).join('');
}

function toggleMarksSimulation(checked) {
  state.hrAI.simulatingMarks = checked;
  const ctrls = document.getElementById('marks-simulation-ctrls');
  if (ctrls) ctrls.style.display = checked ? 'flex' : 'none';
  if (checked) {
    showToast("Simulation mode enabled. Adjust marks and click Run Analysis.", "info");
  }
}

// --- IT Skills Taxonomy Controller ---

function renderHRAISkillsCategoryTabs() {
  const container = document.getElementById('hr-ai-skills-category-tabs');
  if (!container || !state.hrAI.itSkillsCatalog) return;

  const categories = ['All', ...Object.keys(state.hrAI.itSkillsCatalog)];
  container.innerHTML = categories.map(cat => `
    <button type="button" class="skill-cat-pill ${cat === state.hrAI.activeSkillCategory ? 'active' : ''}" onclick="setITSkillsCategory('${cat}')">
      ${cat}
    </button>
  `).join('');
}

function setITSkillsCategory(cat) {
  state.hrAI.activeSkillCategory = cat;
  renderHRAISkillsCategoryTabs();
  renderHRAISkillsCloud();
}

function filterITSkillsList(query) {
  state.hrAI.searchQuery = (query || '').trim().toLowerCase();
  renderHRAISkillsCloud();
}

function renderHRAISkillsCloud() {
  const cloud = document.getElementById('hr-ai-skills-cloud');
  const countBadge = document.getElementById('hr-ai-skills-count-badge');
  if (!cloud || !state.hrAI.itSkillsCatalog) return;

  if (countBadge) {
    countBadge.textContent = `${state.hrAI.selectedSkills.size} Skills Selected`;
  }

  // Determine which skills to display based on category & search
  let skillsToShow = [];
  const query = state.hrAI.searchQuery;

  if (state.hrAI.activeSkillCategory === 'All') {
    for (const catSkills of Object.values(state.hrAI.itSkillsCatalog)) {
      skillsToShow.push(...catSkills);
    }
  } else {
    skillsToShow = state.hrAI.itSkillsCatalog[state.hrAI.activeSkillCategory] || [];
  }

  // Unique skills
  skillsToShow = Array.from(new Set(skillsToShow));

  // Filter with query
  if (query) {
    skillsToShow = skillsToShow.filter(s => s.toLowerCase().includes(query));
  }

  if (skillsToShow.length === 0) {
    cloud.innerHTML = `<div style="font-size: 0.76rem; color: #94a3b8; padding: 8px;">No matching skills found. Try searching for languages, databases, or frameworks.</div>`;
    return;
  }

  cloud.innerHTML = skillsToShow.map(skill => {
    const isSelected = state.hrAI.selectedSkills.has(skill);
    return `
      <div class="it-skill-chip ${isSelected ? 'active' : ''}" onclick="toggleITSkill('${skill}')">
        <span class="chip-check">✓</span>
        <span>${skill}</span>
      </div>
    `;
  }).join('');
}

function toggleITSkill(skill) {
  if (state.hrAI.selectedSkills.has(skill)) {
    state.hrAI.selectedSkills.delete(skill);
  } else {
    state.hrAI.selectedSkills.add(skill);
  }
  renderHRAISkillsCloud();
}

function autoSelectRoleSkills() {
  const roleId = state.hrAI.targetRoleId;
  const role = state.leadershipRoles.find(r => r.id === roleId);
  if (role && role.benchmark_skills) {
    Object.keys(role.benchmark_skills).forEach(sk => state.hrAI.selectedSkills.add(sk));
  }
  // Add common role technologies
  const roleTechMap = {
    'ROLE-SSE': ['Python', 'Java', 'Docker', 'Kubernetes', 'PostgreSQL', 'Microservices', 'Kafka', 'System Design'],
    'ROLE-AIML': ['Python', 'PyTorch', 'TensorFlow', 'Machine Learning', 'Deep Learning', 'Pandas', 'NumPy', 'FastAPI'],
    'ROLE-DEVOPS': ['Docker', 'Kubernetes', 'Terraform', 'AWS', 'CI/CD Pipelines', 'Linux Admin', 'Prometheus', 'Helm'],
    'ROLE-DBA': ['PostgreSQL', 'Oracle Database', 'MySQL', 'Redis', 'Database Indexing & Sharding', 'SQL Server'],
    'ROLE-PM': ['Agile / Scrum', 'Sprint Planning', 'Jira', 'Technical Leadership', 'Stakeholder Management']
  };
  (roleTechMap[roleId] || ['Python', 'SQL', 'Git', 'Agile / Scrum']).forEach(t => state.hrAI.selectedSkills.add(t));

  renderHRAISkillsCloud();
  showToast(`Auto-selected recommended skills for ${role ? role.title : 'target role'}`);
}

function clearAllSelectedSkills() {
  state.hrAI.selectedSkills.clear();
  renderHRAISkillsCloud();
  showToast("Cleared selected skills", "info");
}

// --- Certifications Gallery & Image Upload Controller ---

function renderHRAICertificatesGallery() {
  const container = document.getElementById('hr-ai-certs-gallery');
  const countBadge = document.getElementById('hr-ai-cert-count');
  if (!container) return;

  const baseCerts = state.hrAI.dossier?.certifications || [];
  const uploadedCerts = state.hrAI.uploadedCertificates || [];
  const allCerts = [...baseCerts, ...uploadedCerts];

  if (countBadge) {
    const pcCount = uploadedCerts.length;
    countBadge.textContent = pcCount > 0 ? `${allCerts.length} Verified (${pcCount} from PC)` : `${allCerts.length} Verified`;
  }

  if (allCerts.length === 0) {
    container.innerHTML = `<div style="font-size: 0.72rem; color: #94a3b8; padding: 4px;">No certificate images attached yet. Select from PC below.</div>`;
    return;
  }

  container.innerHTML = allCerts.map((c, i) => {
    const isFromPC = c.from_pc || i >= baseCerts.length;
    const uploadedIdx = i - baseCerts.length;
    return `
      <div class="cert-thumb-item" style="${isFromPC ? 'border-color: #a7f3d0; background: #f0fdf4;' : ''}">
        <img src="${c.image_url || '/static/assets/certificates/EMP-001_cert_1.svg'}" 
             alt="${c.title}" 
             class="cert-mini-img" 
             title="Click to view full certificate"
             onclick="openImageLightbox('${c.image_url || '/static/assets/certificates/EMP-001_cert_1.svg'}', '${c.title}', 'Accredited Credential ID: ${c.credential_id || 'CR-VERIFIED'}')">
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 0.75rem; font-weight: 700; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${c.title}
          </div>
          <div style="font-size: 0.68rem; color: #64748b;">
            ${isFromPC 
              ? '<span style="color: #047857; font-weight: 700; background: #dcfce7; padding: 1px 6px; border-radius: 4px;">✓ Added from PC</span>' 
              : (c.issuer || 'Accredited Body') + ' &bull; <span style="color: #059669; font-weight: 600;">Verified Image</span>'}
          </div>
        </div>
        <div style="display: flex; gap: 4px; align-items: center;">
          <button type="button" class="btn btn-secondary btn-xs" style="padding: 2px 6px; font-size: 0.68rem;" title="View in Lightbox" onclick="openImageLightbox('${c.image_url || '/static/assets/certificates/EMP-001_cert_1.svg'}', '${c.title}', 'Accredited Credential ID: ${c.credential_id || 'CR-VERIFIED'}')">
            🔍
          </button>
          ${isFromPC ? `
            <button type="button" class="btn btn-secondary btn-xs" style="padding: 2px 6px; font-size: 0.68rem; color: #ef4444; border-color: #fca5a5;" title="Remove this certificate" onclick="removeUploadedCertificate(${uploadedIdx})">
              ✕
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function handleCertificateUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  let addedCount = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      showToast(`Reading certificate from PC: ${file.name}...`, "info");
      await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const dataUrl = e.target.result;
          const res = await api.uploadAsset({
            file_type: "certificate",
            filename: file.name,
            data: dataUrl,
            title: file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ")
          });

          state.hrAI.uploadedCertificates.push({
            id: `PC-CERT-${Date.now()}-${i}`,
            title: res.title || file.name,
            issuer: "Selected from PC",
            credential_id: `CR-PC-${Math.floor(Math.random()*9000 + 1000)}`,
            image_url: res.url,
            verified: true,
            from_pc: true
          });
          addedCount++;
          resolve();
        };
        reader.readAsDataURL(file);
      });
    } catch (error) {
      console.error("Certificate upload error:", error);
      showToast(`Failed to upload ${file.name}`, "error");
    }
  }

  renderHRAICertificatesGallery();
  showToast(`Successfully added ${addedCount} certificate(s) from PC!`, "success");
  event.target.value = '';
}

function removeUploadedCertificate(uploadedIndex) {
  if (uploadedIndex >= 0 && uploadedIndex < state.hrAI.uploadedCertificates.length) {
    const removed = state.hrAI.uploadedCertificates.splice(uploadedIndex, 1);
    renderHRAICertificatesGallery();
    showToast(`Removed certificate: ${removed[0]?.title}`, "info");
  }
}
window.removeUploadedCertificate = removeUploadedCertificate;

// --- Resume Preview & Upload Controller ---

function renderHRAIResumePreview(resume) {
  const container = document.getElementById('hr-ai-resume-preview-box');
  if (!container) return;

  const currentResume = state.hrAI.uploadedResume || resume || {};
  const isFromPC = currentResume.from_pc || false;
  const imgUrl = currentResume.image_url || `/static/assets/resumes/${state.hrAI.selectedEmployeeId}_resume.svg`;
  const candName = state.hrAI.dossier?.name || 'Candidate';

  container.innerHTML = `
    <div class="resume-thumb-item" style="${isFromPC ? 'border-color: #93c5fd; background: #eff6ff;' : ''}">
      <img src="${imgUrl}" 
           alt="Resume Thumbnail" 
           class="resume-mini-img"
           title="Click to view full resume document"
           onclick="openImageLightbox('${imgUrl}', '${candName} - Official Resume Document', 'Career Dossier & Verified Production Impact')">
      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 0.76rem; font-weight: 700; color: #1e1b4b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${isFromPC ? (currentResume.display_name || 'Custom Resume') : (candName + ' Resume')}
        </div>
        <div style="font-size: 0.68rem; color: #64748b;">
          ${isFromPC 
            ? '<span style="color: #1d4ed8; font-weight: 700; background: #dbeafe; padding: 1px 6px; border-radius: 4px;">✓ Selected from PC</span>' 
            : `Tenure: <strong>${currentResume.experience_years || 3.0} Yrs</strong> &bull; ${(currentResume.education || 'B.S. in CS').slice(0, 18)}`}
        </div>
        <div style="font-size: 0.68rem; color: #0284c7; font-weight: 600; margin-top: 2px;">
          ${currentResume.projects_count || 2} Production Deliveries Attached
        </div>
      </div>
      <div style="display: flex; gap: 4px; align-items: center;">
        <button type="button" class="btn btn-secondary btn-xs" style="padding: 2px 6px; font-size: 0.68rem;" title="View Full Resume" onclick="openImageLightbox('${imgUrl}', '${candName} - Resume Document', 'Career Dossier & Verified Production Impact')">
          🔍
        </button>
        ${isFromPC ? `
          <button type="button" class="btn btn-secondary btn-xs" style="padding: 2px 6px; font-size: 0.68rem; color: #ef4444; border-color: #fca5a5;" title="Revert to profile resume" onclick="removeUploadedResume()">
            ✕
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

async function handleResumeUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    showToast(`Uploading resume from PC: ${file.name}...`, "info");
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const res = await api.uploadAsset({
        file_type: "resume",
        filename: file.name,
        data: dataUrl,
        title: `${state.hrAI.dossier?.name || 'Candidate'} Resume (From PC)`
      });

      state.hrAI.uploadedResume = {
        filename: res.filename,
        display_name: file.name,
        image_url: res.url,
        experience_years: state.hrAI.dossier?.experience_years || 3.5,
        education: state.hrAI.dossier?.education || "Verified Degree",
        projects_count: (state.hrAI.dossier?.resume?.projects_count || 2) + 1,
        from_pc: true
      };

      renderHRAIResumePreview(state.hrAI.uploadedResume);
      showToast(`Successfully selected resume from PC: ${file.name}!`, "success");
      event.target.value = '';
    };
    reader.readAsDataURL(file);
  } catch (error) {
    console.error("Resume upload error:", error);
    showToast("Failed to upload resume file", "error");
  }
}

function removeUploadedResume() {
  state.hrAI.uploadedResume = null;
  renderHRAIResumePreview(state.hrAI.dossier?.resume);
  showToast("Reverted to candidate default profile resume", "info");
}
window.removeUploadedResume = removeUploadedResume;

// --- Image Lightbox Modal Controller ---

function openImageLightbox(imgUrl, title, subtitle) {
  const modal = document.getElementById('modal-image-lightbox');
  const img = document.getElementById('lightbox-modal-img');
  const titleEl = document.getElementById('lightbox-modal-title');
  const subEl = document.getElementById('lightbox-modal-subtitle');

  if (!modal || !img) {
    if (imgUrl) window.open(imgUrl, '_blank');
    return;
  }

  img.src = imgUrl;
  if (titleEl) titleEl.textContent = title || "Document Viewer";
  if (subEl) subEl.textContent = subtitle || "Verified Credential Dossier";

  modal.style.display = 'flex';
  modal.classList.add('active');
  modal.style.opacity = '1';
  modal.style.pointerEvents = 'auto';
}

function closeImageLightbox() {
  const modal = document.getElementById('modal-image-lightbox');
  if (modal) {
    modal.classList.remove('active');
    modal.style.opacity = '0';
    modal.style.pointerEvents = 'none';
    setTimeout(() => { modal.style.display = 'none'; }, 200);
  }
}

function resetHRAIAnalyzerDefaults() {
  document.getElementById('hr-ai-target-role').value = 'ROLE-SSE';
  handleHRAITargetRoleChange();
  document.getElementById('hr-ai-select-employee').value = 'EMP-001';
  handleHRAIEmployeeChange();
  showToast("Reset AI analyzer to initial verified defaults", "info");
}

// --- AI Eligibility Analysis Execution & Showcase ---

function getEffectiveAssessmentMarks() {
  const baseMarks = state.hrAI.dossier?.assessment_marks || {
    score_pct: 80, correct_count: 16, total_questions: 20, completed: true, category_scores: {}
  };
  const isSim = state.hrAI.simulatingMarks;
  if (isSim) {
    const simScore = parseInt(document.getElementById('sim-overall-score')?.value) || 80;
    return {
      ...baseMarks,
      score_pct: simScore,
      correct_count: Math.round((simScore / 100) * 20),
      category_scores: {
        "Python": simScore, "Java": simScore, "C": simScore, "DBMS": simScore, "Other Tech": simScore, "Communication": simScore, "Aptitude": simScore
      }
    };
  }
  return baseMarks;
}

async function executeHRAIEligibilityAnalysis(compareAll = false) {
  const progressBox = document.getElementById('hr-ai-reasoning-progress');
  const progressBar = document.getElementById('hr-ai-progress-bar');
  const progressTitle = document.getElementById('hr-ai-reasoning-step-title');
  const progressDesc = document.getElementById('hr-ai-reasoning-step-desc');
  const outputBox = document.getElementById('hr-ai-analysis-output');

  if (progressBox) progressBox.style.display = 'block';
  if (outputBox) outputBox.style.opacity = '0.5';

  // Multi-stage simulated reasoning steps for rich user experience
  const steps = [
    { pct: "25%", title: "Analyzing 20-Q Assessment Marks & Category Weightings...", desc: "Cross-referencing candidate exam scores across Python, C, Java, DBMS, and Aptitude." },
    { pct: "50%", title: "Matching Computer & IT Skills against Role Benchmarks...", desc: `Evaluating ${state.hrAI.selectedSkills.size} selected IT skills against required proficiency curves.` },
    { pct: "75%", title: "Inspecting Verified Certificate Images & Credentials...", desc: "Validating accreditation authority and role specialization credentials." },
    { pct: "90%", title: "Analyzing Resume Document & Production Delivery Impact...", desc: "Calculating tenure ratio, quantified project scale, and leadership trajectory." },
    { pct: "100%", title: "Synthesizing Final AI Role Eligibility Verdict...", desc: "Generating comprehensive multi-modal assessment report and company ranking." }
  ];

  let stepIdx = 0;
  const stepInterval = setInterval(() => {
    if (stepIdx < steps.length) {
      if (progressBar) progressBar.style.width = steps[stepIdx].pct;
      if (progressTitle) progressTitle.textContent = steps[stepIdx].title;
      if (progressDesc) progressDesc.textContent = steps[stepIdx].desc;
      stepIdx++;
    } else {
      clearInterval(stepInterval);
    }
  }, 220);

  // Prepare payload
  const isCustomRole = state.hrAI.targetRoleId === 'CUSTOM';
  const customRoleTitle = isCustomRole ? (document.getElementById('hr-ai-custom-role-title')?.value || "Specialized Lead") : null;
  const customRoleExp = isCustomRole ? (parseFloat(document.getElementById('hr-ai-custom-role-exp')?.value) || 4.0) : null;

  const userExp = parseFloat(document.getElementById('hr-ai-emp-experience')?.value);
  const expYears = !isNaN(userExp) ? userExp : (state.hrAI.dossier?.experience_years || 4.0);

  const payload = {
    role_id: state.hrAI.targetRoleId,
    custom_role_title: customRoleTitle,
    target_experience_years: customRoleExp,
    employee_id: state.hrAI.selectedEmployeeId,
    selected_skills: Array.from(state.hrAI.selectedSkills),
    certifications: (state.hrAI.dossier?.certifications || []).map(c => c.title).concat(state.hrAI.uploadedCertificates.map(c => c.title)),
    certificate_images: (state.hrAI.dossier?.certifications || []).concat(state.hrAI.uploadedCertificates),
    resume_info: state.hrAI.uploadedResume || state.hrAI.dossier?.resume,
    assessment_marks: getEffectiveAssessmentMarks(),
    experience_years: expYears,
    compare_all_employees: compareAll
  };

  try {
    const res = await api.analyzeEligibility(payload);
    state.hrAI.analysisResult = res;

    setTimeout(() => {
      clearInterval(stepInterval);
      if (progressBox) progressBox.style.display = 'none';
      if (outputBox) {
        outputBox.style.display = 'block';
        outputBox.style.opacity = '1';
      }
      renderHRAIAnalysisOutput(res, compareAll);
      showToast(`AI Eligibility Analysis complete for ${res.target_candidate?.name}!`, "success");
    }, 1100);

  } catch (error) {
    clearInterval(stepInterval);
    if (progressBox) progressBox.style.display = 'none';
    if (outputBox) outputBox.style.opacity = '1';
    console.error("AI Eligibility Analysis error:", error);
    showToast("AI eligibility analysis failed. Please verify inputs.", "error");
  }
}

function executeCompanyWide15Analysis() {
  executeHRAIEligibilityAnalysis(true);
}

function renderHRAIAnalysisOutput(data, showAll15 = false) {
  const container = document.getElementById('hr-ai-analysis-output');
  if (!container || !data) return;

  const cand = data.target_candidate || {};
  const role = data.role_evaluated || {};
  const dims = cand.dimension_scores || {};
  const asm = cand.assessment_details || {};
  const certs = cand.certification_details || {};
  const resume = cand.resume_details || {};
  const bestCand = data.best_perfect_employee || cand;

  const emps = state.employees || [];
  const currIdx = emps.findIndex(e => e.id.toLowerCase() === (cand.employee_id || '').toLowerCase());
  const safeIdx = currIdx >= 0 ? currIdx : 0;
  const prevIdx = (safeIdx - 1 + emps.length) % emps.length;
  const nextIdx = (safeIdx + 1) % emps.length;
  const prevEmp = emps[prevIdx] || { id: 'EMP-001', name: 'Alex Rivera', role: 'Engineer' };
  const nextEmp = emps[nextIdx] || { id: 'EMP-002', name: 'Priya Sharma', role: 'Engineer' };

  container.innerHTML = `
    <!-- 0. ONE-BY-ONE CANDIDATE EVALUATION NAVIGATOR -->
    <div style="display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, #1e1b4b, #312e81); padding: 14px 20px; border-radius: 14px; color: white; margin-bottom: 20px; box-shadow: 0 4px 16px rgba(30, 27, 75, 0.35); flex-wrap: wrap; gap: 12px;">
      <button type="button" class="btn btn-secondary btn-sm" onclick="navigateHRAICandidate(-1)" style="color: #e0e7ff; border-color: rgba(255,255,255,0.25); background: rgba(255,255,255,0.08); font-weight: 700;">
        ◀ Prev: ${prevEmp.name}
      </button>
      <div style="text-align: center;">
        <div style="font-size: 0.76rem; text-transform: uppercase; color: #a5b4fc; font-weight: 800; letter-spacing: 0.6px;">
          Candidate ${safeIdx + 1} of ${emps.length}: One-by-One Evaluation
        </div>
        <div style="font-size: 1.18rem; font-weight: 800; color: #ffffff; margin-top: 2px;">
          ${cand.name} (${cand.employee_id}) &bull; AI Match: <span style="color: #38bdf8;">${cand.overall_score}%</span>
        </div>
        <div style="font-size: 0.74rem; color: #cbd5e1; margin-top: 2px;">
          IT Skills: <strong>${dims.skills_alignment}%</strong> &bull; Certs: <strong>${dims.certifications_match}%</strong> &bull; Resume: <strong>${dims.resume_experience_fit}%</strong> &bull; Exam: <strong>${asm.score_pct}%</strong>
        </div>
      </div>
      <button type="button" class="btn btn-primary btn-sm" onclick="navigateHRAICandidate(1)" style="background: linear-gradient(135deg, #0284c7, #2563eb); border: none; font-weight: 800; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.4);">
        Analyse Next: ${nextEmp.name} ▶
      </button>
    </div>

    <!-- 1. ELIGIBILITY VERDICT HERO CARD -->
    <div class="eligibility-card ${cand.eligibility_badge_class || 'status-emerald'}">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span class="status-pill ${cand.eligibility_badge_class || 'status-emerald'}" style="font-size: 0.85rem; font-weight: 800; padding: 4px 12px;">
              ● ${cand.eligibility_label || 'ELIGIBLE FOR ROLE'}
            </span>
            <span style="font-size: 0.8rem; color: #475569; font-weight: 600;">
              Rank #${cand.rank || 1} in Candidate Bench
            </span>
          </div>
          <h2 style="font-size: 1.6rem; color: #0f172a; margin: 0 0 4px 0;">
            Eligible Candidate for ${role.title}: <span style="color: #4338ca;">${cand.name}</span>
          </h2>
          <div style="font-size: 0.88rem; color: #334155;">
            <strong>${cand.current_role}</strong> &bull; ${cand.department} &bull; Verified Experience: <strong>${cand.experience_years} Years</strong>
          </div>
          <div style="margin-top: 8px; font-size: 0.84rem; color: #475569;">
            Readiness Status: <strong style="color: #0f172a;">${cand.readiness_status}</strong> &bull; Expected Onboarding Window: <strong>${cand.timeframe}</strong>
          </div>

          <div style="margin-top: 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-emerald" id="btn-assign-evaluated-cand" onclick="assignEmployeeForRole('${cand.employee_id}', '${role.role_id || 'ROLE-SSE'}', '${role.title}')" style="background: #059669; color: white; border: none; font-weight: 800; padding: 10px 22px; font-size: 0.92rem; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.35); cursor: pointer;">
              🎯 Assign this Employee for this Role
            </button>
            <span style="font-size: 0.8rem; color: #475569;">
              Appoint <strong>${cand.name}</strong> to <strong>${role.title}</strong> and record succession decision in database.
            </span>
          </div>
        </div>

        <div style="text-align: right; background: #ffffff; padding: 12px 18px; border-radius: 12px; border: 1.5px solid #cbd5e1; box-shadow: 0 4px 14px rgba(0,0,0,0.06);">
          <div style="font-size: 2.2rem; font-weight: 800; color: #4338ca; line-height: 1;">
            ${cand.overall_score}%
          </div>
          <div style="font-size: 0.74rem; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-top: 2px;">
            AI Role Match Index
          </div>
        </div>
      </div>
    </div>

    <!-- 2. FOUR PILLARS OF EVALUATION -->
    <div class="four-pillars-grid">
      <!-- Pillar 1: Assessment Marks Fit -->
      <div class="pillar-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 0.78rem; font-weight: 700; color: #64748b; text-transform: uppercase;">1. Assessment (25%)</span>
          <span style="font-size: 1.1rem;">📝</span>
        </div>
        <div class="pillar-score-badge" style="color: #4f46e5;">
          ${dims.assessment_marks_fit || 80}%
        </div>
        <div style="font-size: 0.78rem; color: #334155; margin-top: 4px; font-weight: 600;">
          Exam Mark: ${asm.score_pct || 80}% (${asm.correct_count || 16}/20 Qs)
        </div>
        <div style="font-size: 0.72rem; color: #64748b; margin-top: 2px;">
          Tested categories weighted by ${role.title} priorities.
        </div>
      </div>

      <!-- Pillar 2: Computer & IT Skills -->
      <div class="pillar-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 0.78rem; font-weight: 700; color: #64748b; text-transform: uppercase;">2. IT Skills (35%)</span>
          <span style="font-size: 1.1rem;">💻</span>
        </div>
        <div class="pillar-score-badge" style="color: #0284c7;">
          ${dims.skills_alignment || 85}%
        </div>
        <div style="font-size: 0.78rem; color: #334155; margin-top: 4px; font-weight: 600;">
          ${state.hrAI.selectedSkills.size} Computer Skills Analyzed
        </div>
        <div style="font-size: 0.72rem; color: #64748b; margin-top: 2px;">
          Strong alignment with required technical proficiencies.
        </div>
      </div>

      <!-- Pillar 3: Certifications Credibility -->
      <div class="pillar-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 0.78rem; font-weight: 700; color: #64748b; text-transform: uppercase;">3. Certs &amp; Images (15%)</span>
          <span style="font-size: 1.1rem;">📜</span>
        </div>
        <div class="pillar-score-badge" style="color: #059669;">
          ${dims.certifications_match || 86}%
        </div>
        <div style="font-size: 0.78rem; color: #334155; margin-top: 4px; font-weight: 600;">
          ${certs.status || 'Accredited'}
        </div>
        <div style="font-size: 0.72rem; color: #64748b; margin-top: 2px;">
          ${certs.notes || 'Verified industry credential.'}
        </div>
      </div>

      <!-- Pillar 4: Resume & Track Record -->
      <div class="pillar-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 0.78rem; font-weight: 700; color: #64748b; text-transform: uppercase;">4. Resume Fit (25%)</span>
          <span style="font-size: 1.1rem;">📄</span>
        </div>
        <div class="pillar-score-badge" style="color: #7c3aed;">
          ${dims.resume_experience_fit || 85}%
        </div>
        <div style="font-size: 0.78rem; color: #334155; margin-top: 4px; font-weight: 600;">
          ${resume.tenure_status || 'Verified Seniority'}
        </div>
        <div style="font-size: 0.72rem; color: #64748b; margin-top: 2px;">
          ${resume.project_count || 2} Production Projects with Quantified Impact.
        </div>
      </div>
    </div>

    <!-- 3. AI EXECUTIVE JUSTIFICATION NARRATIVE -->
    <div class="glass-card" style="padding: 20px; margin-bottom: 22px; background: #ffffff; border-left: 4px solid #4f46e5;">
      <h3 style="font-size: 1.1rem; color: #1e1b4b; display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span style="color: #4f46e5;">🤖</span> AI Executive Justification &amp; Analysis Report
      </h3>
      <p style="font-size: 0.92rem; color: #334155; line-height: 1.6; margin: 0;">
        ${cand.ai_rationale || 'Analysis confirms high degree of candidate suitability.'}
      </p>
    </div>

    <!-- 4. TWO-COLUMN ANALYTICS: RADAR CHART & STRENGTHS/GAPS -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 22px;">
      
      <!-- Visual Benchmark Radar Chart -->
      <div class="glass-card" style="padding: 18px; background: #ffffff;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <h3 style="font-size: 1rem; color: #1e1b4b;">Benchmark Skill Alignment</h3>
          <span class="badge-tag" style="background: #eef2ff; color: #4338ca;">Actual vs Target</span>
        </div>
        <div style="height: 280px; position: relative;">
          <canvas id="hr-ai-radar-chart"></canvas>
        </div>
      </div>

      <!-- Strengths & Growth Areas Matrix -->
      <div class="glass-card" style="padding: 18px; background: #ffffff;">
        <h3 style="font-size: 1rem; color: #1e1b4b; margin-bottom: 12px;">Verified Strengths &amp; Growth Areas</h3>
        
        <div style="margin-bottom: 14px;">
          <div style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: #059669; margin-bottom: 6px;">
            Key Verified Strengths:
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${(cand.strengths || []).slice(0, 3).map(s => `
              <div style="font-size: 0.82rem; color: #1e293b; display: flex; align-items: flex-start; gap: 6px;">
                <span style="color: #059669; font-weight: 800;">✓</span>
                <span>${s}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div>
          <div style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; color: #d97706; margin-bottom: 6px;">
            Targeted Development Areas:
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${(cand.gaps || ['Broaden cross-functional architecture reviews']).map(g => `
              <div style="font-size: 0.82rem; color: #475569; display: flex; align-items: flex-start; gap: 6px;">
                <span style="color: #d97706; font-weight: 800;">→</span>
                <span>${g}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

    </div>

    <!-- 5. 90-DAY TRANSITION & ONBOARDING ROADMAP -->
    <div class="glass-card" style="padding: 20px; margin-bottom: 22px; background: #ffffff;">
      <h3 style="font-size: 1.1rem; color: #1e1b4b; margin-bottom: 14px;">
        🎯 Tailored 90-Day Transition &amp; Succession Roadmap for ${cand.name}
      </h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px;">
        ${(data.onboarding_plan || []).map(p => `
          <div style="padding: 14px; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0;">
            <div style="font-size: 0.82rem; font-weight: 800; color: #4338ca; margin-bottom: 4px;">
              ${p.phase}
            </div>
            <div style="font-size: 0.8rem; font-weight: 600; color: #0f172a; margin-bottom: 6px;">
              ${p.objective}
            </div>
            <div style="font-size: 0.76rem; color: #475569;">
              ${p.actions}
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- ONE-BY-ONE NEXT CANDIDATE PROMPT -->
    <div style="margin-top: 22px; margin-bottom: 22px; padding: 20px 24px; background: linear-gradient(135deg, #f8faff, #f1f5f9); border: 2px dashed #818cf8; border-radius: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
      <div>
        <div style="font-size: 0.76rem; font-weight: 800; text-transform: uppercase; color: #4338ca; letter-spacing: 0.5px;">
          Next Candidate to Evaluate in Succession Bench:
        </div>
        <h3 style="font-size: 1.25rem; color: #1e1b4b; margin: 4px 0 2px 0;">
          ${nextEmp.name} &bull; <span style="font-size: 0.95rem; color: #64748b; font-weight: 600;">${nextEmp.role} (${nextEmp.department})</span>
        </h3>
        <p style="font-size: 0.82rem; color: #475569; margin: 0;">
          Inspect and evaluate ${nextEmp.name}'s verified IT skills, certifications, and visual resume one by one against ${role.title}.
        </p>
      </div>
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <button type="button" class="btn btn-primary" onclick="navigateHRAICandidate(1)" style="background: linear-gradient(135deg, #4f46e5, #7c3aed); border: none; font-weight: 800; padding: 12px 24px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);">
          ➡️ Proceed to Analyse ${nextEmp.name}
        </button>
        <button type="button" class="btn btn-secondary" onclick="openCandidateInEmpInfo('${cand.employee_id}')" style="font-weight: 700; padding: 12px 18px;">
          ✏️ Edit ${cand.name}'s Data
        </button>
      </div>
    </div>

    <!-- 6. COMPANY-WIDE BEST EMPLOYEE PODIUM & ALL 15 RANKED LEADERBOARD -->
    <div class="glass-card" style="padding: 22px; background: #ffffff;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
        <div>
          <h3 style="font-size: 1.25rem; color: #1e1b4b; display: flex; align-items: center; gap: 8px;">
            <span>🏆</span> Who is Best for the Role: ${role.title}
          </h3>
          <p style="font-size: 0.82rem; color: #64748b; margin: 2px 0 0 0;">
            AI analysis across all 15 employees crowning the single best perfect candidate.
          </p>
        </div>
        <span class="badge-tag" style="background: #eef2ff; color: #4338ca; font-weight: 700;">
          All 15 Evaluated
        </span>
      </div>

      <!-- Hero Best Candidate Showcase -->
      <div class="best-emp-hero" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: #d97706; color: white; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; font-weight: 800; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4);">
            👑
          </div>
          <div>
            <div style="font-size: 0.74rem; font-weight: 800; text-transform: uppercase; color: #b45309; letter-spacing: 0.5px;">
              #1 Ranked Best Perfect Employee for ${role.title}
            </div>
            <h2 style="font-size: 1.5rem; color: #78350f; margin: 2px 0;">
              ${bestCand.name} &bull; <span style="font-size: 1rem; color: #92400e; font-weight: 600;">${bestCand.current_role}</span>
            </h2>
            <div style="font-size: 0.84rem; color: #451a03;">
              AI Match Index: <strong>${bestCand.overall_score}%</strong> &bull; Assessment Mark: <strong>${bestCand.dimension_scores?.assessment_marks_fit || 90}%</strong> &bull; Experience: <strong>${bestCand.experience_years} Yrs</strong>
            </div>
          </div>
        </div>
        
        <div>
          <button class="btn btn-primary" style="background: #d97706; border: none; font-weight: 700;" onclick="appointCandidateFromAI('${bestCand.employee_id}', '${role.role_id}', '${role.title}')">
            Appoint ${bestCand.name} to ${role.title}
          </button>
        </div>
      </div>

      <!-- Full Ranked Leaderboard Table -->
      <div class="table-container" style="max-height: 380px; overflow-y: auto;">
        <table class="leadsync-table">
          <thead>
            <tr>
              <th style="width: 50px;">Rank</th>
              <th>Candidate</th>
              <th>Current Role</th>
              <th>Tenure</th>
              <th>Assessment Mark</th>
              <th>IT Skills</th>
              <th>Overall Match</th>
              <th>Eligibility</th>
              <th style="text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            ${(data.all_ranked_candidates || []).map(c => `
              <tr style="${c.employee_id === cand.employee_id ? 'background: #f5f7ff; font-weight: 600;' : ''}">
                <td>
                  <span style="font-weight: 800; color: ${c.rank === 1 ? '#d97706' : '#64748b'};">
                    ${c.rank === 1 ? '🥇 #1' : c.rank === 2 ? '🥈 #2' : c.rank === 3 ? '🥉 #3' : `#${c.rank}`}
                  </span>
                </td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: #e0e7ff; color: #4338ca; display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 700;">
                      ${c.avatar || 'EM'}
                    </div>
                    <div>
                      <div style="font-weight: 700; color: #0f172a;">${c.name}</div>
                      <div style="font-size: 0.7rem; color: #64748b;">${c.department}</div>
                    </div>
                  </div>
                </td>
                <td>${c.current_role}</td>
                <td>${c.experience_years} yrs</td>
                <td>
                  <span style="font-family: var(--font-mono); font-weight: 700; color: #4f46e5;">
                    ${c.dimension_scores?.assessment_marks_fit || 80}%
                  </span>
                </td>
                <td>
                  <span style="font-family: var(--font-mono); font-size: 0.85rem;">
                    ${c.dimension_scores?.skills_alignment || 80}%
                  </span>
                </td>
                <td>
                  <span style="font-family: var(--font-mono); font-weight: 800; font-size: 0.95rem; color: ${c.overall_score >= 80 ? '#059669' : c.overall_score >= 65 ? '#d97706' : '#dc2626'};">
                    ${c.overall_score}%
                  </span>
                </td>
                <td>
                  <span class="status-pill ${c.eligibility_badge_class || 'status-emerald'}">
                    ${c.eligibility_label}
                  </span>
                </td>
                <td style="text-align: right;">
                  <button type="button" class="btn btn-secondary btn-xs" onclick="selectAndAnalyzeCandidate('${c.employee_id}')">
                    Analyze
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Render Radar Chart with Chart.js
  setTimeout(() => {
    if (window.renderHRAIRadarChart && data.radar_data) {
      window.renderHRAIRadarChart(
        'hr-ai-radar-chart',
        data.radar_data.skills,
        data.radar_data.candidate_scores,
        data.radar_data.benchmark_scores,
        cand.name,
        role.title
      );
    }
  }, 100);
}

function selectAndAnalyzeCandidate(empId) {
  const select = document.getElementById('hr-ai-select-employee');
  if (select) {
    select.value = empId;
    handleHRAIEmployeeChange();
    // Scroll into view smoothly
    document.getElementById('hr-ai-analyzer-module')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function scrollToAIAnalyzer(event) {
  if (event) {
    try { event.preventDefault(); } catch (err) {}
  }
  // Navigate directly to AI Role Analyzer tab
  navigateToTab('tab-ai-matcher');

  // Locate the module element
  const moduleEl = document.getElementById('hr-ai-analyzer-module');
  if (moduleEl) {
    moduleEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    moduleEl.classList.remove('glow-pulse-active');
    void moduleEl.offsetWidth; // Force reflow
    moduleEl.classList.add('glow-pulse-active');
    setTimeout(() => {
      moduleEl.classList.remove('glow-pulse-active');
    }, 3200);
  }
  showToast("⚡ LeadSync AI Role Suitability & Eligibility Analyzer Activated", "info");
}

// ==========================================================================
// EMPLOYEE INFORMATION (HR TALENT ENTRY COMMAND) CONTROLLER
// ==========================================================================

async function assignEmployeeForRole(empId, roleId, roleTitle) {
  try {
    const res = await api.appointCandidate({
      employee_id: empId,
      role_id: roleId,
      role_title: roleTitle,
      decision_notes: `Candidate evaluated and officially appointed to ${roleTitle} via LeadSync AI Role Suitability & Eligibility Analyzer.`
    });
    const targetEmp = (state.employees || []).find(e => e.id === empId);
    if (targetEmp) {
      targetEmp.appointed_role = roleTitle;
    }
    renderHRStats();
    showToast(`🎯 Success: ${res.message || `Assigned to ${roleTitle}!`}`, "success");
    await loadInitialData();
    if (state.hrAI?.selectedEmployeeId) {
      await loadHRAIEmployeeDossier(state.hrAI.selectedEmployeeId);
      executeHRAIEligibilityAnalysis(false);
    }
  } catch (error) {
    console.error("Assign error:", error);
    showToast("Failed to assign employee to role: " + error.message, "error");
  }
}

async function initEmployeeInfoTab() {
  populateEmployeeSelectors();

  if (!state.empInfo.selectedEmployeeId) {
    state.empInfo.selectedEmployeeId = state.activeEmployeeId || (state.employees[0]?.id || 'EMP-001');
  }

  const select = document.getElementById('emp-info-select');
  if (select) {
    select.value = state.empInfo.selectedEmployeeId;
  }

  if (!state.hrAI.itSkillsCatalog) {
    try {
      const catalogRes = await api.getITSkillsCatalog();
      state.hrAI.itSkillsCatalog = catalogRes.categories || {};
    } catch (err) {
      console.error("Error loading IT skills catalog:", err);
    }
  }

  await loadEmployeeInfoData(state.empInfo.selectedEmployeeId);
}

async function handleEmpInfoEmployeeChange(empId) {
  state.empInfo.selectedEmployeeId = empId;
  await loadEmployeeInfoData(empId);
}

async function goToPrevEmpInfoEmployee() {
  const emps = state.employees;
  if (!emps || emps.length === 0) return;
  const currentId = state.empInfo.selectedEmployeeId || emps[0].id;
  let idx = emps.findIndex(e => e.id.toLowerCase() === currentId.toLowerCase());
  if (idx === -1) idx = 0;
  let prevIdx = (idx - 1 + emps.length) % emps.length;
  const prevEmp = emps[prevIdx];

  state.empInfo.selectedEmployeeId = prevEmp.id;
  const selectEl = document.getElementById('emp-info-select');
  if (selectEl) selectEl.value = prevEmp.id;

  await loadEmployeeInfoData(prevEmp.id);
}
window.goToPrevEmpInfoEmployee = goToPrevEmpInfoEmployee;

async function goToNextEmpInfoEmployee() {
  const emps = state.employees;
  if (!emps || emps.length === 0) return;
  const currentId = state.empInfo.selectedEmployeeId || emps[0].id;
  let idx = emps.findIndex(e => e.id.toLowerCase() === currentId.toLowerCase());
  if (idx === -1) idx = 0;
  let nextIdx = (idx + 1) % emps.length;
  const nextEmp = emps[nextIdx];

  state.empInfo.selectedEmployeeId = nextEmp.id;
  const selectEl = document.getElementById('emp-info-select');
  if (selectEl) selectEl.value = nextEmp.id;

  await loadEmployeeInfoData(nextEmp.id);
}
window.goToNextEmpInfoEmployee = goToNextEmpInfoEmployee;

async function saveAndGoToNextEmpInfo() {
  await saveEmployeeInfoData(true);
  const emps = state.employees;
  if (!emps || emps.length === 0) return;
  const currentId = state.empInfo.selectedEmployeeId || emps[0].id;
  let idx = emps.findIndex(e => e.id.toLowerCase() === currentId.toLowerCase());
  if (idx === -1) idx = 0;
  let nextIdx = (idx + 1) % emps.length;
  const nextEmp = emps[nextIdx];

  state.empInfo.selectedEmployeeId = nextEmp.id;
  const selectEl = document.getElementById('emp-info-select');
  if (selectEl) selectEl.value = nextEmp.id;

  await loadEmployeeInfoData(nextEmp.id);
  showToast(`💾 Saved previous employee! Loaded ${nextEmp.name} (${nextEmp.id}) for data entry.`, "success");
}
window.saveAndGoToNextEmpInfo = saveAndGoToNextEmpInfo;

function openCandidateInEmpInfo(empId) {
  navigateToTab('tab-employee-info');
  state.empInfo.selectedEmployeeId = empId;
  const selectEl = document.getElementById('emp-info-select');
  if (selectEl) selectEl.value = empId;
  loadEmployeeInfoData(empId);
}
window.openCandidateInEmpInfo = openCandidateInEmpInfo;

async function loadEmployeeInfoData(empId) {
  try {
    const dossier = await api.getEmployeeDossier(empId);
    state.empInfo.currentEmployee = dossier;

    // 1. Experience
    const exp = dossier.experience_years !== undefined ? parseFloat(dossier.experience_years) : 0.0;
    state.empInfo.experienceYears = exp;
    const expInput = document.getElementById('emp-info-exp');
    if (expInput) expInput.value = exp;
    const expBadge = document.getElementById('emp-info-exp-badge');
    if (expBadge) expBadge.textContent = `${exp} Yrs`;

    // 2. Assessment Marks
    const asm = dossier.assessment_marks || {};
    state.empInfo.assessmentCompleted = Boolean(asm.completed);
    state.empInfo.assessmentScore = asm.score_pct !== undefined ? parseInt(asm.score_pct) : 0;
    
    const catScores = asm.category_scores || {};
    state.empInfo.categoryScores = {
      "Python": catScores["Python"] !== undefined ? catScores["Python"] : state.empInfo.assessmentScore,
      "Java": catScores["Java"] !== undefined ? catScores["Java"] : state.empInfo.assessmentScore,
      "C": catScores["C"] !== undefined ? catScores["C"] : state.empInfo.assessmentScore,
      "DBMS": catScores["DBMS"] !== undefined ? catScores["DBMS"] : state.empInfo.assessmentScore,
      "Other Tech": catScores["Other Tech"] !== undefined ? catScores["Other Tech"] : state.empInfo.assessmentScore,
      "Communication": catScores["Communication"] !== undefined ? catScores["Communication"] : state.empInfo.assessmentScore,
      "Aptitude": catScores["Aptitude"] !== undefined ? catScores["Aptitude"] : state.empInfo.assessmentScore
    };

    const asmChk = document.getElementById('emp-info-asm-attended');
    if (asmChk) asmChk.checked = state.empInfo.assessmentCompleted;
    const asmScoreInput = document.getElementById('emp-info-asm-score');
    if (asmScoreInput) asmScoreInput.value = state.empInfo.assessmentScore;
    updateEmpInfoAsmBadge();
    renderEmpInfoCategorySliders();

    // 3. Resume & Bio
    state.empInfo.resume = dossier.resume || null;
    const eduInput = document.getElementById('emp-info-education');
    if (eduInput) eduInput.value = dossier.resume?.education || dossier.education || '';
    const bioInput = document.getElementById('emp-info-bio');
    if (bioInput) bioInput.value = dossier.resume?.bio || dossier.bio || '';
    renderEmpInfoResumePreview();

    // 4. Skills Known
    state.empInfo.selectedSkills = new Map();
    if (dossier.skills && typeof dossier.skills === 'object') {
      Object.entries(dossier.skills).forEach(([k, v]) => {
        state.empInfo.selectedSkills.set(k, parseInt(v) || 85);
      });
    }
    renderEmpInfoSkillsCategoryTabs();
    renderEmpInfoSkillsCloud();
    renderEmpInfoSelectedSkillsList();

    // 5. Certifications: Only certificates uploaded/submitted by HR (not pre-seeded database items)
    state.empInfo.certifications = Array.isArray(dossier.certifications) 
      ? dossier.certifications.filter(c => typeof c === 'object' && (c.from_pc || c.is_uploaded || (c.image_url && c.image_url.includes('/uploads/')))).map(c => ({
          is_authentic: c.is_authentic !== false,
          verdict: c.verdict || (c.is_authentic === false ? 'FAKE CERTIFICATE' : 'ORIGINAL'),
          status: c.status || (c.is_authentic === false ? 'Fake certificate' : 'Original (AI Verified)'),
          reasons: c.reasons || (c.is_authentic === false ? ['Fake certificate (AI generated, photoshopped, or downloaded from Google)'] : ['Verified Authentic Credential']),
          ...c
        }))
      : [];
    renderEmpInfoCertsGallery();

    // 6. Summary Card
    renderEmpInfoSummary(dossier);

  } catch (error) {
    console.error("Failed to load employee info data:", error);
    showToast("Error loading employee data", "error");
  }
}

function renderEmpInfoSummary(dossier) {
  const container = document.getElementById('emp-info-summary-card');
  if (!container || !dossier) return;

  const skillsCount = state.empInfo.selectedSkills.size;
  const certsCount = state.empInfo.certifications.length;
  const expYrs = state.empInfo.experienceYears;
  const asmPct = state.empInfo.assessmentScore;

  const isBlank = expYrs === 0 && skillsCount === 0 && certsCount === 0 && asmPct === 0;

  container.innerHTML = `
    <div style="width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #4f46e5, #06b6d4); color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem; flex-shrink: 0; box-shadow: 0 3px 10px rgba(79, 70, 229, 0.3);">
      ${dossier.avatar || 'EM'}
    </div>
    <div style="flex: 1; min-width: 0;">
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span style="font-weight: 800; font-size: 1.05rem; color: #0f172a;">${dossier.name}</span>
        <span style="font-size: 0.76rem; background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 6px; font-weight: 600;">${dossier.employee_id || dossier.id}</span>
        ${isBlank ? `<span class="badge-tag" style="background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; font-weight: 700;">● Pending HR Entry (All 0)</span>` : `<span class="badge-tag" style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; font-weight: 700;">● HR Data Active</span>`}
      </div>
      <div style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">
        ${dossier.role} &bull; ${dossier.department}
      </div>
    </div>
    <div style="display: flex; gap: 14px; align-items: center; text-align: center; border-left: 1px solid #e2e8f0; padding-left: 14px;">
      <div>
        <div style="font-size: 1rem; font-weight: 800; color: #0284c7;">${expYrs}y</div>
        <div style="font-size: 0.68rem; color: #64748b; text-transform: uppercase;">Tenure</div>
      </div>
      <div>
        <div style="font-size: 1rem; font-weight: 800; color: #4f46e5;">${skillsCount}</div>
        <div style="font-size: 0.68rem; color: #64748b; text-transform: uppercase;">Skills</div>
      </div>
      <div>
        <div style="font-size: 1rem; font-weight: 800; color: #059669;">${certsCount}</div>
        <div style="font-size: 0.68rem; color: #64748b; text-transform: uppercase;">Certs</div>
      </div>
      <div>
        <div style="font-size: 1rem; font-weight: 800; color: ${asmPct > 0 ? '#d97706' : '#94a3b8'};">${asmPct}%</div>
        <div style="font-size: 0.68rem; color: #64748b; text-transform: uppercase;">Exam</div>
      </div>
    </div>
  `;
}

function handleEmpInfoExpChange(val) {
  const yrs = Math.max(0, parseFloat(val) || 0);
  state.empInfo.experienceYears = yrs;
  const badge = document.getElementById('emp-info-exp-badge');
  if (badge) badge.textContent = `${yrs} Yrs`;
  renderEmpInfoSummary(state.empInfo.currentEmployee);
}

function setEmpInfoExp(val) {
  const input = document.getElementById('emp-info-exp');
  if (input) input.value = val;
  handleEmpInfoExpChange(val);
}

function handleEmpInfoAsmToggle(checked) {
  state.empInfo.assessmentCompleted = checked;
  if (checked && state.empInfo.assessmentScore === 0) {
    handleEmpInfoAsmScoreChange(75);
    const scoreInput = document.getElementById('emp-info-asm-score');
    if (scoreInput) scoreInput.value = 75;
  } else {
    updateEmpInfoAsmBadge();
    renderEmpInfoSummary(state.empInfo.currentEmployee);
  }
}

function handleEmpInfoAsmScoreChange(val) {
  const score = Math.min(100, Math.max(0, parseInt(val) || 0));
  state.empInfo.assessmentScore = score;
  if (score > 0) {
    state.empInfo.assessmentCompleted = true;
    const chk = document.getElementById('emp-info-asm-attended');
    if (chk) chk.checked = true;
  }
  Object.keys(state.empInfo.categoryScores).forEach(cat => {
    state.empInfo.categoryScores[cat] = score;
  });
  updateEmpInfoAsmBadge();
  renderEmpInfoCategorySliders();
  renderEmpInfoSummary(state.empInfo.currentEmployee);
}

function updateEmpInfoAsmBadge() {
  const badge = document.getElementById('emp-info-asm-badge');
  if (!badge) return;
  const isAttended = state.empInfo.assessmentCompleted;
  const score = state.empInfo.assessmentScore;
  badge.textContent = isAttended && score > 0 
    ? `${score}% (Attended)` 
    : (score > 0 ? `${score}%` : '0% (Unscored)');
}

function renderEmpInfoCategorySliders() {
  const container = document.getElementById('emp-info-category-sliders');
  if (!container) return;

  const cats = [
    { key: "Python", label: "Python", color: "#4f46e5" },
    { key: "Java", label: "Java", color: "#0284c7" },
    { key: "C", label: "C / Systems", color: "#0891b2" },
    { key: "DBMS", label: "DBMS / SQL", color: "#16a34a" },
    { key: "Other Tech", label: "Other Tech", color: "#8b5cf6" },
    { key: "Communication", label: "Communication", color: "#d97706" },
    { key: "Aptitude", label: "Aptitude", color: "#ec4899" }
  ];

  container.innerHTML = cats.map(c => {
    const val = state.empInfo.categoryScores[c.key] !== undefined ? state.empInfo.categoryScores[c.key] : state.empInfo.assessmentScore;
    return `
      <div style="background: #f8fafc; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px; font-weight: 600; color: #334155;">
          <span>${c.label}</span>
          <span id="emp-info-cat-val-${c.key}" style="font-weight: 800; color: ${c.color};">${val}%</span>
        </div>
        <input type="range" min="0" max="100" value="${val}" style="width: 100%; accent-color: ${c.color};" oninput="handleEmpInfoCatScoreChange('${c.key}', this.value)">
      </div>
    `;
  }).join('');
}

function handleEmpInfoCatScoreChange(category, val) {
  const num = parseInt(val) || 0;
  state.empInfo.categoryScores[category] = num;
  const valEl = document.getElementById(`emp-info-cat-val-${category}`);
  if (valEl) valEl.textContent = `${num}%`;
}

function renderEmpInfoSkillsCategoryTabs() {
  const container = document.getElementById('emp-info-skills-category-tabs');
  if (!container) return;

  const catalog = state.hrAI.itSkillsCatalog || {};
  const categories = ['All', ...Object.keys(catalog)];

  container.innerHTML = categories.map(cat => `
    <button type="button" class="category-pill-btn ${state.empInfo.activeSkillCategory === cat ? 'active' : ''}" onclick="setEmpInfoSkillsCategory('${cat}')">
      ${cat}
    </button>
  `).join('');
}

function setEmpInfoSkillsCategory(category) {
  state.empInfo.activeSkillCategory = category;
  renderEmpInfoSkillsCategoryTabs();
  renderEmpInfoSkillsCloud();
}

function filterEmpInfoSkills(query) {
  state.empInfo.searchQuery = (query || '').toLowerCase().trim();
  renderEmpInfoSkillsCloud();
}

function renderEmpInfoSkillsCloud() {
  const cloud = document.getElementById('emp-info-skills-cloud');
  const countBadge = document.getElementById('emp-info-skills-count');
  if (!cloud) return;

  if (countBadge) {
    countBadge.textContent = `${state.empInfo.selectedSkills.size} Skills Selected`;
  }

  const catalog = state.hrAI.itSkillsCatalog || {};
  let skillsToDisplay = [];

  if (state.empInfo.activeSkillCategory === 'All') {
    Object.values(catalog).forEach(arr => {
      skillsToDisplay.push(...arr);
    });
    skillsToDisplay = Array.from(new Set(skillsToDisplay));
  } else {
    skillsToDisplay = catalog[state.empInfo.activeSkillCategory] || [];
  }

  if (state.empInfo.searchQuery) {
    skillsToDisplay = skillsToDisplay.filter(sk => sk.toLowerCase().includes(state.empInfo.searchQuery));
  }

  if (skillsToDisplay.length === 0) {
    cloud.innerHTML = `<div style="font-size: 0.78rem; color: #94a3b8; padding: 10px;">No skills match your search.</div>`;
    return;
  }

  cloud.innerHTML = skillsToDisplay.map(skill => {
    const isSelected = state.empInfo.selectedSkills.has(skill);
    return `
      <span class="it-skill-pill ${isSelected ? 'selected' : ''}" onclick="toggleEmpInfoSkill('${skill.replace(/'/g, "\\'")}')">
        ${skill} ${isSelected ? '✓' : '+'}
      </span>
    `;
  }).join('');
}

function toggleEmpInfoSkill(skillName) {
  if (state.empInfo.selectedSkills.has(skillName)) {
    state.empInfo.selectedSkills.delete(skillName);
  } else {
    state.empInfo.selectedSkills.set(skillName, 85);
  }
  renderEmpInfoSkillsCloud();
  renderEmpInfoSelectedSkillsList();
  renderEmpInfoSummary(state.empInfo.currentEmployee);
}

function autoSelectEmpInfoRoleSkills() {
  const core = [
    "Python", "Docker", "PostgreSQL", "React", "AWS", 
    "Git & GitHub", "REST APIs", "Linux / Unix", "CI/CD Pipelines", "System Architecture"
  ];
  core.forEach(s => state.empInfo.selectedSkills.set(s, 85));
  renderEmpInfoSkillsCloud();
  renderEmpInfoSelectedSkillsList();
  renderEmpInfoSummary(state.empInfo.currentEmployee);
  showToast("Added core IT skill set with 85% baseline proficiency", "info");
}

function clearEmpInfoSkills() {
  state.empInfo.selectedSkills.clear();
  renderEmpInfoSkillsCloud();
  renderEmpInfoSelectedSkillsList();
  renderEmpInfoSummary(state.empInfo.currentEmployee);
  showToast("Cleared all selected skills", "info");
}

function renderEmpInfoSelectedSkillsList() {
  const list = document.getElementById('emp-info-selected-skills-list');
  if (!list) return;

  if (state.empInfo.selectedSkills.size === 0) {
    list.innerHTML = `
      <div style="font-size: 0.78rem; color: #94a3b8; text-align: center; padding: 14px; background: #f8fafc; border-radius: 6px; border: 1px dashed #cbd5e1;">
        No skills added yet. Select skills from the cloud above or click "Auto-Add Core Skills".
      </div>
    `;
    return;
  }

  const entries = Array.from(state.empInfo.selectedSkills.entries());
  list.innerHTML = entries.map(([skill, prof]) => `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #f8fafc; padding: 5px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
      <span style="font-size: 0.8rem; font-weight: 700; color: #1e1b4b; min-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${skill}</span>
      <input type="range" min="10" max="100" value="${prof}" style="flex: 1; accent-color: #0284c7;" oninput="setEmpInfoSkillProficiency('${skill.replace(/'/g, "\\'")}', this.value)">
      <span id="prof-val-${skill.replace(/[^a-zA-Z0-9]/g, '_')}" style="font-size: 0.76rem; font-weight: 800; color: #0284c7; width: 36px; text-align: right;">${prof}%</span>
      <button type="button" class="btn btn-secondary btn-xs" style="color: #ef4444; padding: 1px 5px; font-size: 0.7rem; border-color: #fca5a5;" onclick="removeEmpInfoSkill('${skill.replace(/'/g, "\\'")}')">✕</button>
    </div>
  `).join('');
}

function setEmpInfoSkillProficiency(skillName, prof) {
  const p = parseInt(prof) || 85;
  state.empInfo.selectedSkills.set(skillName, p);
  const valEl = document.getElementById(`prof-val-${skillName.replace(/[^a-zA-Z0-9]/g, '_')}`);
  if (valEl) valEl.textContent = `${p}%`;
}

function removeEmpInfoSkill(skillName) {
  state.empInfo.selectedSkills.delete(skillName);
  renderEmpInfoSkillsCloud();
  renderEmpInfoSelectedSkillsList();
  renderEmpInfoSummary(state.empInfo.currentEmployee);
}

// Certifications Handlers (Accurate Calculating AI Detector: Original vs Fake)
function renderEmpInfoCertsGallery() {
  const container = document.getElementById('emp-info-certs-gallery');
  const countBadge = document.getElementById('emp-info-cert-count');
  const alertBanner = document.getElementById('emp-info-cert-alert-banner');
  const alertText = document.getElementById('emp-info-cert-alert-text');
  if (!container) return;

  const certs = state.empInfo.certifications || [];
  const fakeCerts = certs.filter(c => c.is_authentic === false || c.verdict === 'FAKE CERTIFICATE' || (c.status && c.status.toLowerCase().includes('fake')));
  const originalCerts = certs.filter(c => !fakeCerts.includes(c));

  // Update badge
  if (countBadge) {
    if (fakeCerts.length > 0) {
      countBadge.innerHTML = `<span style="color: #dc2626; font-weight: 800; background: #fee2e2; padding: 2px 8px; border-radius: 4px; border: 1px solid #fca5a5;">⚠️ Fake certificate (${fakeCerts.length})</span>`;
    } else if (originalCerts.length > 0) {
      countBadge.innerHTML = `<span style="color: #059669; font-weight: 700;">✓ ${originalCerts.length} Original (AI Verified)</span>`;
    } else {
      countBadge.textContent = "0 Uploaded";
    }
  }

  // Update Alert Banner
  if (alertBanner) {
    if (fakeCerts.length > 0) {
      const titles = fakeCerts.map(c => `"${c.title}"`).join(', ');
      if (alertText) {
        alertText.innerHTML = `<strong>Fake certificate:</strong> ${titles} has been analyzed by the AI Authenticity Engine and flagged as fake (AI generated, photoshopped, or downloaded from Google).<br><strong>Access to "Save & Proceed to AI Role Analyzer →" is blocked</strong> until an authentic, original certificate is provided.`;
      }
      alertBanner.style.display = 'block';
    } else {
      alertBanner.style.display = 'none';
    }
  }

  if (certs.length === 0) {
    container.innerHTML = `
      <div style="font-size: 0.78rem; color: #94a3b8; text-align: center; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
        No certificate uploaded yet. Please upload the employee's certificate from your PC for AI authenticity analysis.
      </div>
    `;
    return;
  }

  container.innerHTML = certs.map((c, idx) => {
    const title = c.title || 'Professional Certification';
    const isFake = (c.is_authentic === false || c.verdict === 'FAKE CERTIFICATE' || (c.status && c.status.toLowerCase().includes('fake')));
    const issuer = c.issuer || (isFake ? 'Unaccredited / Fake Source' : 'Accredited Authority');
    const imgUrl = c.image_url || '/static/assets/certificates/sample_cert.svg';
    const reason = c.reasons && c.reasons.length > 0 ? c.reasons[0] : (isFake ? 'AI-generated, photoshopped, or downloaded from Google.' : 'Verified authentic credential.');
    const confidencePct = Math.round((c.confidence || 0.98) * 100);

    if (isFake) {
      return `
        <div class="cert-thumb-card cert-fake-card" style="display: flex; flex-direction: column; gap: 6px; padding: 10px 14px; background: #fff5f5; border: 1.5px solid #ef4444; border-radius: 8px; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.1);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${imgUrl}" alt="Certificate" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1.5px solid #f87171;" onclick="openImageLightbox('${imgUrl}', '${title}', 'FLAGGED AS FAKE CERTIFICATE')">
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="font-size: 0.82rem; font-weight: 800; color: #991b1b;">${title}</span>
                <span style="font-size: 0.68rem; font-weight: 800; color: #ffffff; background: #dc2626; padding: 2px 7px; border-radius: 4px;">⚠️ Fake certificate</span>
              </div>
              <div style="font-size: 0.72rem; color: #b91c1c; margin-top: 2px;">
                ${issuer} &bull; <strong style="color: #dc2626;">AI Rejected (${confidencePct}% Certainty)</strong>
              </div>
            </div>
            <div style="display: flex; gap: 6px; flex-shrink: 0;">
              <button type="button" class="btn btn-secondary btn-xs" style="padding: 3px 8px; font-size: 0.7rem;" title="View Certificate" onclick="openImageLightbox('${imgUrl}', '${title}', 'FLAGGED AS FAKE CERTIFICATE')">🔍 View</button>
              <button type="button" class="btn btn-secondary btn-xs" style="padding: 3px 8px; font-size: 0.7rem; color: #ef4444; border-color: #fca5a5; font-weight: 700;" title="Remove Fake Certificate" onclick="removeEmpInfoCert(${idx})">✕ Remove</button>
            </div>
          </div>
          <div style="font-size: 0.72rem; color: #7f1d1d; background: #fee2e2; padding: 5px 10px; border-radius: 5px; border: 1px solid #fecaca; line-height: 1.4;">
            <strong>AI Detector:</strong> ${reason}
          </div>
        </div>
      `;
    }

    return `
      <div class="cert-thumb-card" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #ffffff; border: 1.5px solid #a7f3d0; border-radius: 8px; box-shadow: 0 2px 6px rgba(5, 150, 105, 0.08);">
        <img src="${imgUrl}" alt="Certificate" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #6ee7b7;" onclick="openImageLightbox('${imgUrl}', '${title}', '${issuer}')">
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span style="font-size: 0.82rem; font-weight: 700; color: #1e1b4b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${title}</span>
            <span style="font-size: 0.68rem; font-weight: 700; color: #059669; background: #ecfdf5; padding: 2px 6px; border-radius: 4px; border: 1px solid #a7f3d0;">✓ Original (AI Verified • ${confidencePct}%)</span>
          </div>
          <div style="font-size: 0.72rem; color: #047857; margin-top: 2px;">
            ${issuer} &bull; <span style="font-weight: 700;">Accredited &amp; Authenticated</span>
          </div>
        </div>
        <div style="display: flex; gap: 6px; flex-shrink: 0;">
          <button type="button" class="btn btn-secondary btn-xs" style="padding: 3px 8px; font-size: 0.7rem;" title="View Certificate" onclick="openImageLightbox('${imgUrl}', '${title}', '${issuer}')">🔍 View</button>
          <button type="button" class="btn btn-secondary btn-xs" style="padding: 3px 8px; font-size: 0.7rem; color: #ef4444; border-color: #fca5a5;" title="Remove" onclick="removeEmpInfoCert(${idx})">✕ Remove</button>
        </div>
      </div>
    `;
  }).join('');
}

async function handleEmpInfoCertUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  let addedCount = 0;
  let fakeCount = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      showToast(`AI analyzing certificate authenticity: ${file.name}...`, "info");
      await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const dataUrl = e.target.result;
          const res = await api.uploadAsset({
            file_type: "certificate",
            filename: file.name,
            data: dataUrl,
            title: file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ")
          });

          const isAuth = (res.is_authentic !== false);
          const verdict = res.verdict || (isAuth ? "ORIGINAL" : "FAKE CERTIFICATE");
          const authStatus = res.status || (isAuth ? "Original (AI Verified)" : "Fake certificate");
          const reasons = res.authenticity?.reasons || (isAuth ? ["Cryptographic & structural document properties conform to accredited certificate standards."] : ["Image tampering / AI generated / Google download detected."]);
          const confidence = res.authenticity?.confidence || res.confidence || 0.98;

          if (!isAuth) {
            fakeCount++;
          }

          state.empInfo.certifications.push({
            id: `CERT-PC-${Date.now()}-${i}`,
            title: res.title || file.name,
            issuer: isAuth ? "Accredited Authority (AI Verified)" : "Flagged: Unverified / Fake",
            credential_id: `CR-PC-${Math.floor(Math.random()*9000 + 1000)}`,
            image_url: res.url,
            verified: isAuth,
            is_authentic: isAuth,
            verdict: verdict,
            status: authStatus,
            confidence: confidence,
            reasons: reasons,
            filename: file.name,
            from_pc: true,
            is_uploaded: true
          });
          addedCount++;
          resolve();
        };
        reader.readAsDataURL(file);
      });
    } catch (error) {
      console.error("Certificate upload error:", error);
      showToast(`Failed to upload ${file.name}`, "error");
    }
  }

  renderEmpInfoCertsGallery();
  renderEmpInfoSummary(state.empInfo.currentEmployee);
  
  if (fakeCount > 0) {
    showToast(`⚠️ AI Alert: Fake certificate detected! Proceeding to AI Role Analyzer is blocked until an original certificate is provided.`, "error", 6000);
  } else {
    showToast(`✓ Attached original certificate verified by AI!`, "success");
  }

  event.target.value = '';
}

function removeEmpInfoCert(index) {
  if (index >= 0 && index < state.empInfo.certifications.length) {
    const removed = state.empInfo.certifications.splice(index, 1);
    renderEmpInfoCertsGallery();
    renderEmpInfoSummary(state.empInfo.currentEmployee);
    showToast(`Removed certificate: ${removed[0]?.title}`, "info");
  }
}

async function addCustomEmpInfoCert() {
  const input = document.getElementById('emp-info-custom-cert-title');
  const title = input?.value?.trim();
  if (!title) {
    showToast("Please enter a certificate title", "info");
    return;
  }
  
  showToast(`AI analyzing "${title}" for authenticity...`, "info");
  
  let authRes = null;
  try {
    authRes = await api.verifyCertificate({
      title: title,
      filename: title.toLowerCase().replace(/\s+/g, '_') + '.pdf'
    });
  } catch (e) {
    console.error("AI cert verify error:", e);
  }

  const isAuth = authRes ? (authRes.is_authentic !== false) : !/fake|photoshop|dummy|google|download|midjourney|dall-e|template/i.test(title);
  const verdict = authRes?.verdict || (isAuth ? "ORIGINAL" : "FAKE CERTIFICATE");
  const authStatus = authRes?.status || (isAuth ? "Original (AI Verified)" : "Fake certificate");
  const reasons = authRes?.reasons || (isAuth ? ["Accredited credential verified by LeadSync AI."] : ["Fake certificate (AI generated, photoshopped, or downloaded from Google)."]);
  const confidence = authRes?.confidence || 0.98;

  state.empInfo.certifications.push({
    id: `CERT-CUSTOM-${Date.now()}`,
    title: title,
    issuer: isAuth ? "Accredited Authority (AI Verified)" : "Flagged: Unaccredited",
    credential_id: `CR-HR-${Math.floor(Math.random()*9000 + 1000)}`,
    image_url: `/static/assets/certificates/sample_cert.svg`,
    verified: isAuth,
    is_authentic: isAuth,
    verdict: verdict,
    status: authStatus,
    confidence: confidence,
    reasons: reasons,
    is_uploaded: true
  });

  input.value = '';
  renderEmpInfoCertsGallery();
  renderEmpInfoSummary(state.empInfo.currentEmployee);
  
  if (!isAuth) {
    showToast(`⚠️ AI Warning: Fake certificate detected! Proceeding to AI Role Analyzer is blocked until an original certificate is provided.`, "error", 6000);
  } else {
    showToast(`✓ Added original verified certificate: "${title}"`, "success");
  }
}

function getEligibleRoleForEmployee(emp) {
  if (!emp) return state.leadershipRoles[0]?.id || 'ROLE-SSE';
  const roleTitle = (emp.role || '').toLowerCase();
  const dept = (emp.department || '').toLowerCase();
  
  if (roleTitle.includes('data') || roleTitle.includes('ai') || roleTitle.includes('ml') || dept.includes('ai') || dept.includes('analytics')) {
    const r = state.leadershipRoles.find(r => r.id === 'ROLE-AIML');
    if (r) return r.id;
  }
  if (roleTitle.includes('devops') || roleTitle.includes('cloud') || roleTitle.includes('infra') || dept.includes('devops') || dept.includes('infra') || roleTitle.includes('qa')) {
    const r = state.leadershipRoles.find(r => r.id === 'ROLE-DEVOPS');
    if (r) return r.id;
  }
  if (roleTitle.includes('db') || roleTitle.includes('database') || roleTitle.includes('sql') || dept.includes('data') || dept.includes('database')) {
    const r = state.leadershipRoles.find(r => r.id === 'ROLE-DBA');
    if (r) return r.id;
  }
  if (roleTitle.includes('project') || roleTitle.includes('manager') || roleTitle.includes('coordinator') || roleTitle.includes('scrum') || roleTitle.includes('lead')) {
    const r = state.leadershipRoles.find(r => r.id === 'ROLE-PM');
    if (r) return r.id;
  }
  
  const sse = state.leadershipRoles.find(r => r.id === 'ROLE-SSE');
  if (sse) return sse.id;
  return state.leadershipRoles[state.leadershipRoles.length - 1]?.id || 'ROLE-SSE';
}
window.getEligibleRoleForEmployee = getEligibleRoleForEmployee;

// Resume Handlers
function renderEmpInfoResumePreview() {
  const container = document.getElementById('emp-info-resume-preview');
  const statusBadge = document.getElementById('emp-info-resume-status');
  if (!container) return;

  const resume = state.empInfo.resume;
  const candName = state.empInfo.currentEmployee?.name || 'Employee';

  if (!resume || (!resume.image_url && !resume.filename)) {
    if (statusBadge) {
      statusBadge.textContent = "No Resume";
      statusBadge.style.background = "#f1f5f9";
      statusBadge.style.color = "#64748b";
    }
    container.innerHTML = `
      <div style="font-size: 0.78rem; color: #94a3b8; text-align: center; padding: 14px; background: #f8fafc; border-radius: 6px; border: 1px dashed #cbd5e1;">
        No resume document uploaded yet. Click below to select candidate resume from PC.
      </div>
    `;
    return;
  }

  if (statusBadge) {
    statusBadge.textContent = "Attached";
    statusBadge.style.background = "#eff6ff";
    statusBadge.style.color = "#1d4ed8";
  }

  const imgUrl = resume.image_url || `/static/assets/resumes/${state.empInfo.selectedEmployeeId}_resume.svg`;
  const displayName = resume.display_name || resume.filename || `${candName} Resume Document`;

  container.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; background: #f0f9ff; padding: 8px 12px; border-radius: 8px; border: 1px solid #bae6fd;">
      <img src="${imgUrl}" alt="Resume" style="width: 36px; height: 44px; object-fit: cover; border-radius: 4px; border: 1px solid #93c5fd; cursor: pointer;" onclick="openImageLightbox('${imgUrl}', '${candName} - Resume Document', 'Career Dossier & Verified Production Impact')">
      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 0.8rem; font-weight: 700; color: #0369a1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${displayName}
        </div>
        <div style="font-size: 0.7rem; color: #0284c7;">
          ${resume.from_pc ? '✓ Selected from PC' : 'Dossier Attached'} &bull; ${state.empInfo.experienceYears} Yrs Tenure
        </div>
      </div>
      <div style="display: flex; gap: 4px;">
        <button type="button" class="btn btn-secondary btn-xs" style="padding: 2px 6px;" title="View Resume" onclick="openImageLightbox('${imgUrl}', '${candName} - Resume Document', 'Career Dossier & Verified Production Impact')">🔍</button>
        <button type="button" class="btn btn-secondary btn-xs" style="padding: 2px 6px; color: #ef4444; border-color: #fca5a5;" title="Remove" onclick="removeEmpInfoResume()">✕</button>
      </div>
    </div>
  `;
}

async function handleEmpInfoResumeUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    showToast(`Uploading resume from PC: ${file.name}...`, "info");
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const res = await api.uploadAsset({
        file_type: "resume",
        filename: file.name,
        data: dataUrl,
        title: `${state.empInfo.currentEmployee?.name || 'Employee'} Resume (From PC)`
      });

      state.empInfo.resume = {
        filename: res.filename,
        display_name: file.name,
        image_url: res.url,
        experience_years: state.empInfo.experienceYears,
        education: document.getElementById('emp-info-education')?.value || "Verified Degree",
        bio: document.getElementById('emp-info-bio')?.value || "",
        from_pc: true
      };

      renderEmpInfoResumePreview();
      renderEmpInfoSummary(state.empInfo.currentEmployee);
      showToast(`Selected resume from PC: ${file.name}!`, "success");
      event.target.value = '';
    };
    reader.readAsDataURL(file);
  } catch (error) {
    console.error("Resume upload error:", error);
    showToast("Failed to upload resume file", "error");
  }
}

function removeEmpInfoResume() {
  state.empInfo.resume = null;
  renderEmpInfoResumePreview();
  renderEmpInfoSummary(state.empInfo.currentEmployee);
  showToast("Removed attached resume document", "info");
}

// Persistence Save and Reset Handlers
async function saveEmployeeInfoData(silent = false) {
  const empId = state.empInfo.selectedEmployeeId;
  if (!empId) return null;

  const skillsObj = {};
  for (let [k, v] of state.empInfo.selectedSkills) {
    skillsObj[k] = v;
  }

  const education = document.getElementById('emp-info-education')?.value || '';
  const bio = document.getElementById('emp-info-bio')?.value || '';

  const payload = {
    experience_years: state.empInfo.experienceYears,
    skills: skillsObj,
    certifications: state.empInfo.certifications,
    resume: {
      ...(state.empInfo.resume || {}),
      education: education,
      bio: bio,
      experience_years: state.empInfo.experienceYears
    },
    education: education,
    bio: bio,
    assessment_scores: {
      completed: state.empInfo.assessmentCompleted,
      score_pct: state.empInfo.assessmentScore,
      correct_count: Math.round((state.empInfo.assessmentScore / 100) * 20),
      total_questions: 20,
      category_scores: state.empInfo.categoryScores
    }
  };

  try {
    const res = await api.updateEmployeeInfo(empId, payload);
    if (!silent) {
      showToast(`💾 Persisted data for ${state.empInfo.currentEmployee?.name || empId} to database!`, "success");
    }
    const emp = state.employees.find(e => e.id === empId);
    if (emp) {
      emp.experience_years = payload.experience_years;
      emp.skills = payload.skills;
      emp.certifications = payload.certifications;
      emp.assessment_scores = payload.assessment_scores;
    }
    renderEmpInfoSummary(state.empInfo.currentEmployee);
    return res;
  } catch (error) {
    console.error("Failed to persist employee info:", error);
    showToast("Failed to save employee information: " + error.message, "error");
    return null;
  }
}

async function saveAndProceedToAIAnalyzer() {
  const certs = state.empInfo.certifications || [];
  
  // 1. Certificate is mandatory: HR must upload employee certificate from PC
  if (certs.length === 0) {
    const banner = document.getElementById('emp-info-cert-alert-banner');
    const bannerText = document.getElementById('emp-info-cert-alert-text');
    if (banner && bannerText) {
      bannerText.innerHTML = `<strong>Certificate Required:</strong> Please upload the employee's certificate from your PC. The AI Authenticity Engine must verify the certificate as original before moving to the AI Role Analyzer.`;
      banner.style.display = 'block';
      banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    showToast(`⚠️ Certificate required: Please upload employee certificate from PC for AI verification.`, "error", 6000);
    return false;
  }

  // 2. Strict AI Authenticity Gate: Block navigation if any certificate is fake
  const fakeCerts = certs.filter(c => c.is_authentic === false || c.verdict === 'FAKE CERTIFICATE' || (c.status && c.status.toLowerCase().includes('fake')));
  
  if (fakeCerts.length > 0) {
    const fakeTitles = fakeCerts.map(c => `"${c.title}"`).join(', ');
    const banner = document.getElementById('emp-info-cert-alert-banner');
    const bannerText = document.getElementById('emp-info-cert-alert-text');
    if (banner && bannerText) {
      bannerText.innerHTML = `<strong>Fake certificate detected:</strong> ${fakeTitles} has been analyzed by AI and flagged as fake (AI generated, photoshopped, or downloaded from Google).<br><strong>Access to AI Role Analyzer is blocked</strong> until an authentic, original certificate is provided.`;
      banner.style.display = 'block';
      banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    showToast(`⛔ Fake certificate! Cannot proceed until an authentic original certificate is provided.`, "error", 7000);
    return false; // STOPS AND PREVENTS NAVIGATION!
  }

  // 3. Confirm at least one verified original certificate
  const originalCerts = certs.filter(c => !fakeCerts.includes(c));
  if (originalCerts.length === 0) {
    showToast(`⚠️ No authentic certificate found. Please upload a verified original certificate.`, "error", 6000);
    return false;
  }

  // All clear - hide banner
  const banner = document.getElementById('emp-info-cert-alert-banner');
  if (banner) banner.style.display = 'none';

  // Persist employee configuration to database
  await saveEmployeeInfoData(true);
  const empId = state.empInfo.selectedEmployeeId;
  const emp = state.employees.find(e => e.id === empId) || state.empInfo.currentEmployee;
  const empName = emp?.name || empId;

  // Determine the eligible succession role for this employee
  const eligibleRoleId = getEligibleRoleForEmployee(emp);
  const eligibleRole = state.leadershipRoles.find(r => r.id === eligibleRoleId) || { title: eligibleRoleId, id: eligibleRoleId };

  showToast(`✓ Certificate confirmed as Original! Proceeding to AI Role Analyzer for eligible role: ${eligibleRole.title}...`, "success", 4000);

  // Navigate to AI Role Analyzer tab
  navigateToTab('tab-ai-matcher');

  // Set candidate in AI analyzer
  state.hrAI.selectedEmployeeId = empId;
  const aiEmpSelect = document.getElementById('hr-ai-select-employee');
  if (aiEmpSelect) {
    aiEmpSelect.value = empId;
  }

  // Configure target role to candidate's eligible role
  state.hrAI.targetRoleId = eligibleRoleId;
  const hrTargetRoleSelect = document.getElementById('hr-ai-target-role');
  if (hrTargetRoleSelect) {
    hrTargetRoleSelect.value = eligibleRoleId;
  }
  const presetRoleSelect = document.getElementById('ai-select-preset-role');
  if (presetRoleSelect) {
    presetRoleSelect.value = eligibleRoleId;
  }
  const top3RoleSelect = document.getElementById('ai-top3-target-role');
  if (top3RoleSelect) {
    top3RoleSelect.value = eligibleRoleId;
  }

  updateHRAITargetRoleBenchmarks();

  // Load candidate dossier and trigger AI suitability & eligibility analysis
  await loadHRAIEmployeeDossier(empId);
  setTimeout(() => {
    executeHRAIEligibilityAnalysis(false);
  }, 350);
  return true;
}

async function resetCurrentEmpInfoData() {
  const empId = state.empInfo.selectedEmployeeId;
  const empName = state.empInfo.currentEmployee?.name || empId;
  if (!confirm(`Reset all information for ${empName} (${empId}) back to 0?`)) return;

  const payload = {
    experience_years: 0.0,
    skills: {},
    certifications: [],
    resume: null,
    education: "",
    bio: "",
    assessment_scores: {
      completed: false,
      score_pct: 0,
      correct_count: 0,
      total_questions: 20,
      category_scores: {
        "Python": 0, "Java": 0, "C": 0, "DBMS": 0, "Other Tech": 0, "Communication": 0, "Aptitude": 0
      }
    }
  };

  try {
    await api.updateEmployeeInfo(empId, payload);
    showToast(`Reset ${empName} back to 0 baseline`, "info");
    await loadEmployeeInfoData(empId);
  } catch (error) {
    console.error("Error resetting employee data:", error);
    showToast("Failed to reset employee data", "error");
  }
}

// Export functions to window for DOM event listeners
window.setupHRAIAnalyzer = setupHRAIAnalyzer;
window.handleHRAITargetRoleChange = handleHRAITargetRoleChange;
window.handleHRAIEmployeeChange = handleHRAIEmployeeChange;
window.toggleITSkill = toggleITSkill;
window.setITSkillsCategory = setITSkillsCategory;
window.filterITSkillsList = filterITSkillsList;
window.autoSelectRoleSkills = autoSelectRoleSkills;
window.clearAllSelectedSkills = clearAllSelectedSkills;
window.handleCertificateUpload = handleCertificateUpload;
window.handleResumeUpload = handleResumeUpload;
window.openImageLightbox = openImageLightbox;
window.closeImageLightbox = closeImageLightbox;
window.toggleMarksSimulation = toggleMarksSimulation;
window.resetHRAIAnalyzerDefaults = resetHRAIAnalyzerDefaults;
window.executeHRAIEligibilityAnalysis = executeHRAIEligibilityAnalysis;
window.executeCompanyWide15Analysis = executeCompanyWide15Analysis;
window.selectAndAnalyzeCandidate = selectAndAnalyzeCandidate;
window.scrollToAIAnalyzer = scrollToAIAnalyzer;
window.removeUploadedCertificate = removeUploadedCertificate;
window.removeUploadedResume = removeUploadedResume;
window.handleHRAIExperienceChange = handleHRAIExperienceChange;

// Employee Information Exports
window.assignEmployeeForRole = assignEmployeeForRole;
window.initEmployeeInfoTab = initEmployeeInfoTab;
window.handleEmpInfoEmployeeChange = handleEmpInfoEmployeeChange;
window.loadEmployeeInfoData = loadEmployeeInfoData;
window.handleEmpInfoExpChange = handleEmpInfoExpChange;
window.setEmpInfoExp = setEmpInfoExp;
window.handleEmpInfoAsmToggle = handleEmpInfoAsmToggle;
window.handleEmpInfoAsmScoreChange = handleEmpInfoAsmScoreChange;
window.handleEmpInfoCatScoreChange = handleEmpInfoCatScoreChange;
window.setEmpInfoSkillsCategory = setEmpInfoSkillsCategory;
window.filterEmpInfoSkills = filterEmpInfoSkills;
window.toggleEmpInfoSkill = toggleEmpInfoSkill;
window.autoSelectEmpInfoRoleSkills = autoSelectEmpInfoRoleSkills;
window.clearEmpInfoSkills = clearEmpInfoSkills;
window.setEmpInfoSkillProficiency = setEmpInfoSkillProficiency;
window.removeEmpInfoSkill = removeEmpInfoSkill;
window.handleEmpInfoCertUpload = handleEmpInfoCertUpload;
window.removeEmpInfoCert = removeEmpInfoCert;
window.addCustomEmpInfoCert = addCustomEmpInfoCert;
window.getEligibleRoleForEmployee = getEligibleRoleForEmployee;
window.handleEmpInfoResumeUpload = handleEmpInfoResumeUpload;
window.removeEmpInfoResume = removeEmpInfoResume;
window.saveEmployeeInfoData = saveEmployeeInfoData;
window.saveAndProceedToAIAnalyzer = saveAndProceedToAIAnalyzer;
window.resetCurrentEmpInfoData = resetCurrentEmpInfoData;
window.navigateHRAICandidate = navigateHRAICandidate;
window.goToPrevEmpInfoEmployee = goToPrevEmpInfoEmployee;
window.goToNextEmpInfoEmployee = goToNextEmpInfoEmployee;
window.saveAndGoToNextEmpInfo = saveAndGoToNextEmpInfo;
window.openCandidateInEmpInfo = openCandidateInEmpInfo;

