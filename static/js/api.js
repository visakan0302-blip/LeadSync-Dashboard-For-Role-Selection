/**
 * LeadSync Dashboard API Client
 * Connects the frontend SPA to Python 3.14 FastAPI backend
 * Pure Cookie-Based HttpOnly Authentication (Same-Origin)
 */

const API_BASE = window.location.origin;

async function apiFetch(url, options = {}) {
  const opt = { ...options };
  opt.credentials = 'same-origin';
  const res = await fetch(url, opt);
  return res;
}

const api = {
  // Google Identity Services & Auth Endpoints
  async getAuthConfig() {
    const res = await fetch(`${API_BASE}/api/auth/config?_t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache, no-store, must-revalidate" }
    });
    if (!res.ok) throw new Error("Failed to load authentication configuration");
    return await res.json();
  },

  async verifyGoogleToken(credential, targetRole) {
    const res = await fetch(`${API_BASE}/api/auth/google/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ credential, target_role: targetRole })
    });
    if (!res.ok) {
      let errDetail = `Authentication failed (${res.status})`;
      try {
        const data = await res.json();
        if (data.detail) errDetail = data.detail;
      } catch (_) {}
      const err = new Error(errDetail);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const user = data.user || (data.email ? {
      role: data.role,
      email: data.email,
      name: data.name,
      picture: data.picture || ''
    } : null);
    if (user) {
      if (!data.user) data.user = user;
      localStorage.setItem('leadsync_auth_role', user.role);
      localStorage.setItem('leadsync_auth_email', user.email);
    }
    return data;
  },

  async checkSession() {
    const res = await apiFetch(`${API_BASE}/api/auth/me`);
    if (!res.ok) return { authenticated: false };
    const data = await res.json();
    if (data.authenticated && !data.user && data.email) {
      data.user = {
        role: data.role,
        email: data.email,
        name: data.name,
        picture: data.picture || ''
      };
    }
    return data;
  },

  async logout() {
    try {
      await apiFetch(`${API_BASE}/api/auth/logout`, { method: "POST" });
    } catch (_) {}
    localStorage.removeItem('leadsync_auth_role');
    localStorage.removeItem('leadsync_auth_email');
    return { success: true };
  },

  // Employee Endpoints
  async getEmployees() {
    const res = await apiFetch(`${API_BASE}/api/employees`);
    if (!res.ok) throw new Error("Failed to load employees");
    return await res.json();
  },

  async getEmployeeProfile(employeeId) {
    const res = await apiFetch(`${API_BASE}/api/employees/${employeeId}`);
    if (!res.ok) throw new Error(`Failed to load profile for ${employeeId}`);
    return await res.json();
  },

  async addEmployee(empData) {
    const res = await apiFetch(`${API_BASE}/api/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(empData)
    });
    if (!res.ok) throw new Error("Failed to add employee");
    return await res.json();
  },

  async updateEmployeeInfo(employeeId, data) {
    const res = await apiFetch(`${API_BASE}/api/employees/${employeeId}/update-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      let errDetail = "Failed to update and persist employee info";
      try {
        const errJson = await res.json();
        if (errJson.detail) errDetail = errJson.detail;
      } catch (_) {}
      throw new Error(errDetail);
    }
    return await res.json();
  },

  async updateEmployee(employeeId, data) {
    return await this.updateEmployeeInfo(employeeId, data);
  },

  // Assessment Endpoints
  async getAssessments() {
    const res = await apiFetch(`${API_BASE}/api/assessments`);
    if (!res.ok) throw new Error("Failed to load assessments");
    return await res.json();
  },

  async createAssessment(asmData) {
    const res = await apiFetch(`${API_BASE}/api/assessments`, {
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
    const res = await apiFetch(url);
    if (!res.ok) throw new Error("Failed to load assessment questions");
    return await res.json();
  },

  async submitAssessment(payload) {
    const res = await apiFetch(`${API_BASE}/api/assessments/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to submit assessment");
    return await res.json();
  },

  // Dashboard Results Endpoints
  async getTop3Results() {
    const res = await apiFetch(`${API_BASE}/api/results/top3`);
    if (!res.ok) throw new Error("Failed to load HR top 3 results");
    return await res.json();
  },

  async getManagerResults() {
    const res = await apiFetch(`${API_BASE}/api/results/manager`);
    if (!res.ok) throw new Error("Failed to load manager results");
    return await res.json();
  },

  // Leadership Succession Roles & Suitability Endpoints
  async getLeadershipRoles() {
    const res = await apiFetch(`${API_BASE}/api/roles`);
    if (!res.ok) throw new Error("Failed to load leadership roles");
    return await res.json();
  },

  async evaluateSuitability(payload) {
    const res = await apiFetch(`${API_BASE}/api/suitability/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to evaluate role suitability");
    return await res.json();
  },

  async getSuccessionMatrix() {
    const res = await apiFetch(`${API_BASE}/api/succession/matrix`);
    if (!res.ok) throw new Error("Failed to load succession matrix");
    return await res.json();
  },

  async resetData() {
    const res = await apiFetch(`${API_BASE}/api/reset`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to reset database");
    return await res.json();
  },

  // --- LeadSync AI Candidate Matching & Role Recommendation ---
  async matchRole(payload) {
    const res = await apiFetch(`${API_BASE}/api/ai/match-role`, {
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
    const res = await apiFetch(url);
    if (!res.ok) throw new Error("Failed to load quick AI match");
    return await res.json();
  },

  async parseJobDescription(jdText) {
    const res = await apiFetch(`${API_BASE}/api/ai/parse-job-description`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_description_text: jdText })
    });
    if (!res.ok) throw new Error("Failed to parse job description");
    return await res.json();
  },

  async appointCandidate(payload) {
    const res = await apiFetch(`${API_BASE}/api/ai/appoint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to appoint candidate");
    return await res.json();
  },

  async getAppointments() {
    const res = await apiFetch(`${API_BASE}/api/ai/appointments`);
    if (!res.ok) throw new Error("Failed to load appointments");
    return await res.json();
  },

  // --- Multi-Modal HR AI Analysing Endpoints ---
  async getITSkillsCatalog() {
    const res = await apiFetch(`${API_BASE}/api/ai/skills-catalog`);
    if (!res.ok) throw new Error("Failed to load IT skills catalog");
    return await res.json();
  },

  async getEmployeeDossier(employeeId) {
    const res = await apiFetch(`${API_BASE}/api/ai/employee-dossier/${employeeId}`);
    if (!res.ok) throw new Error(`Failed to load dossier for ${employeeId}`);
    return await res.json();
  },

  async uploadAsset(payload) {
    const res = await apiFetch(`${API_BASE}/api/ai/upload-asset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to upload image asset");
    return await res.json();
  },

  async verifyCertificate(payload) {
    const res = await apiFetch(`${API_BASE}/api/ai/verify-certificate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to verify certificate authenticity");
    return await res.json();
  },

  async getGeminiStatus() {
    const res = await apiFetch(`${API_BASE}/api/ai/gemini-status`);
    if (!res.ok) return { gemini_configured: false };
    return await res.json();
  },

  async setGeminiKey(apiKey) {
    const res = await apiFetch(`${API_BASE}/api/ai/set-gemini-key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ api_key: apiKey })
    });
    if (!res.ok) {
      let errDetail = `Server error (${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson.detail) errDetail = errJson.detail;
      } catch (_) {}
      throw new Error(errDetail);
    }
    return await res.json();
  },

  async analyzeEligibility(payload) {
    const res = await apiFetch(`${API_BASE}/api/ai/analyze-eligibility`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to run AI eligibility analysis");
    return await res.json();
  },

  // FreeLLMAPI / Gemini AI Assistant Endpoints
  async sendAIChat(messages, includeHrContext = true) {
    const res = await apiFetch(`${API_BASE}/api/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
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
    const res = await apiFetch(`${API_BASE}/api/ai/metrics/summary`);
    if (!res.ok) throw new Error("Failed to load AI metrics summary");
    return await res.json();
  },

  async resetData() {
    const res = await apiFetch(`${API_BASE}/api/reset`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to reset database seeds");
    return await res.json();
  },

  async resetDatabase() {
    return await this.resetData();
  },

  async resetAssessments() {
    const res = await apiFetch(`${API_BASE}/api/assessments/reset`, {
      method: "POST"
    });
    if (!res.ok) throw new Error("Failed to reset assessments");
    return await res.json();
  },

  async analyzeTop3ForRole(payload) {
    const res = await apiFetch(`${API_BASE}/api/ai/analyze-top3-for-role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to analyze top 3 candidates for role");
    return await res.json();
  }
};

window.api = api;
