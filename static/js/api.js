/**
 * LeadSync Dashboard API Client
 * Connects the frontend SPA to Python 3.14 FastAPI backend
 */

const API_BASE = window.location.origin;

const api = {
  // Employee Endpoints
  async getEmployees() {
    const res = await fetch(`${API_BASE}/api/employees`);
    if (!res.ok) throw new Error("Failed to load employees");
    return await res.json();
  },

  async getEmployeeProfile(employeeId) {
    const res = await fetch(`${API_BASE}/api/employees/${employeeId}`);
    if (!res.ok) throw new Error(`Failed to load profile for ${employeeId}`);
    return await res.json();
  },

  async addEmployee(empData) {
    const res = await fetch(`${API_BASE}/api/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(empData)
    });
    if (!res.ok) throw new Error("Failed to add employee");
    return await res.json();
  },

  async updateEmployeeInfo(employeeId, data) {
    const res = await fetch(`${API_BASE}/api/employees/${employeeId}/update-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to update and persist employee info");
    return await res.json();
  },

  async updateEmployee(employeeId, data) {
    return await this.updateEmployeeInfo(employeeId, data);
  },

  // Assessment Endpoints
  async getAssessments() {
    const res = await fetch(`${API_BASE}/api/assessments`);
    if (!res.ok) throw new Error("Failed to load assessments");
    return await res.json();
  },

  async createAssessment(asmData) {
    const res = await fetch(`${API_BASE}/api/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(asmData)
    });
    if (!res.ok) throw new Error("Failed to create assessment");
    return await res.json();
  },

  async getAssessmentQuestions(assessmentId, seed = null) {
    const url = seed 
      ? `${API_BASE}/api/assessments/${assessmentId}/questions?seed=${seed}`
      : `${API_BASE}/api/assessments/${assessmentId}/questions`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load assessment questions");
    return await res.json();
  },

  async submitAssessment(payload) {
    const res = await fetch(`${API_BASE}/api/assessments/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to submit assessment");
    return await res.json();
  },

  // Dashboard Results Endpoints
  async getTop3Results() {
    const res = await fetch(`${API_BASE}/api/results/top3`);
    if (!res.ok) throw new Error("Failed to load HR top 3 results");
    return await res.json();
  },

  async getManagerResults() {
    const res = await fetch(`${API_BASE}/api/results/manager`);
    if (!res.ok) throw new Error("Failed to load manager results");
    return await res.json();
  },

  // Leadership Succession Roles & Suitability Endpoints
  async getLeadershipRoles() {
    const res = await fetch(`${API_BASE}/api/roles`);
    if (!res.ok) throw new Error("Failed to load leadership roles");
    return await res.json();
  },

  async evaluateSuitability(payload) {
    const res = await fetch(`${API_BASE}/api/suitability/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to evaluate role suitability");
    return await res.json();
  },

  async getSuccessionMatrix() {
    const res = await fetch(`${API_BASE}/api/succession/matrix`);
    if (!res.ok) throw new Error("Failed to load succession matrix");
    return await res.json();
  },

  async resetData() {
    const res = await fetch(`${API_BASE}/api/reset`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to reset database");
    return await res.json();
  },

  // --- LeadSync AI Candidate Matching & Role Recommendation ---
  async matchRole(payload) {
    const res = await fetch(`${API_BASE}/api/ai/match-role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to run AI role match");
    return await res.json();
  },

  async getQuickMatch(roleId, dept = null) {
    const url = dept 
      ? `${API_BASE}/api/ai/quick-match/${roleId}?department_filter=${encodeURIComponent(dept)}`
      : `${API_BASE}/api/ai/quick-match/${roleId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load quick AI match");
    return await res.json();
  },

  async parseJobDescription(jdText) {
    const res = await fetch(`${API_BASE}/api/ai/parse-job-description`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_description_text: jdText })
    });
    if (!res.ok) throw new Error("Failed to parse job description");
    return await res.json();
  },

  async appointCandidate(payload) {
    const res = await fetch(`${API_BASE}/api/ai/appoint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to appoint candidate");
    return await res.json();
  },

  async getAppointments() {
    const res = await fetch(`${API_BASE}/api/ai/appointments`);
    if (!res.ok) throw new Error("Failed to load appointments");
    return await res.json();
  },

  // --- Multi-Modal HR AI Analysing Endpoints ---
  async getITSkillsCatalog() {
    const res = await fetch(`${API_BASE}/api/ai/skills-catalog`);
    if (!res.ok) throw new Error("Failed to load IT skills catalog");
    return await res.json();
  },

  async getEmployeeDossier(employeeId) {
    const res = await fetch(`${API_BASE}/api/ai/employee-dossier/${employeeId}`);
    if (!res.ok) throw new Error(`Failed to load dossier for ${employeeId}`);
    return await res.json();
  },

  async uploadAsset(payload) {
    const res = await fetch(`${API_BASE}/api/ai/upload-asset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to upload image asset");
    return await res.json();
  },

  async verifyCertificate(payload) {
    const res = await fetch(`${API_BASE}/api/ai/verify-certificate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to verify certificate authenticity");
    return await res.json();
  },

  async getGeminiStatus() {
    const res = await fetch(`${API_BASE}/api/ai/gemini-status`);
    if (!res.ok) return { gemini_configured: false };
    return await res.json();
  },

  async setGeminiKey(apiKey) {
    const res = await fetch(`${API_BASE}/api/ai/set-gemini-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey })
    });
    if (!res.ok) throw new Error("Failed to configure Gemini API Key");
    return await res.json();
  },

  async analyzeEligibility(payload) {
    const res = await fetch(`${API_BASE}/api/ai/analyze-eligibility`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to run AI eligibility analysis");
    return await res.json();
  },

  // FreeLLMAPI AI Assistant Endpoints
  async sendAIChat(messages, includeHrContext = true) {
    const role = localStorage.getItem('leadsync_auth_role') || 'hr';
    const email = localStorage.getItem('leadsync_auth_email') || '';
    const res = await fetch(`${API_BASE}/api/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-LeadSync-Role": role,
        "X-LeadSync-Email": email
      },
      body: JSON.stringify({
        messages: messages,
        include_hr_context: includeHrContext
      })
    });
    if (!res.ok) {
      let errorMsg = `Server error (${res.status})`;
      try {
        const errData = await res.json();
        if (typeof errData.detail === 'string') {
          errorMsg = errData.detail;
        } else if (Array.isArray(errData.detail)) {
          errorMsg = errData.detail.map(d => {
            if (typeof d === 'string') return d;
            const field = d.loc ? d.loc.filter(x => x !== 'body').join('.') : '';
            return `${field ? field + ': ' : ''}${d.msg || JSON.stringify(d)}`;
          }).join(' | ');
        } else if (errData.detail && typeof errData.detail === 'object') {
          errorMsg = errData.detail.msg || JSON.stringify(errData.detail);
        } else if (typeof errData.error === 'string') {
          errorMsg = errData.error;
        } else if (errData.error && typeof errData.error === 'object') {
          errorMsg = errData.error.message || JSON.stringify(errData.error);
        } else if (typeof errData.message === 'string') {
          errorMsg = errData.message;
        }
      } catch (parseErr) {
        // Fallback to default status string
      }
      throw new Error(errorMsg);
    }
    return await res.json();
  },

  async getAIMetricsSummary() {
    const role = localStorage.getItem('leadsync_auth_role') || 'hr';
    const res = await fetch(`${API_BASE}/api/ai/metrics/summary`, {
      headers: { "X-LeadSync-Role": role }
    });
    if (!res.ok) throw new Error("Failed to load AI metrics summary");
    return await res.json();
  },

  async resetData() {
    const res = await fetch(`${API_BASE}/api/reset`, {
      method: "POST"
    });
    if (!res.ok) throw new Error("Failed to reset database seeds");
    return await res.json();
  },

  async resetDatabase() {
    return await this.resetData();
  },

  async resetAssessments() {
    const res = await fetch(`${API_BASE}/api/assessments/reset`, {
      method: "POST"
    });
    if (!res.ok) throw new Error("Failed to reset assessments");
    return await res.json();
  },

  async analyzeTop3ForRole(payload) {
    const res = await fetch(`${API_BASE}/api/ai/analyze-top3-for-role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to analyze top 3 candidates for role");
    return await res.json();
  }
};

window.api = api;

