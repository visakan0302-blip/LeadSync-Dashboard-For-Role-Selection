"""
LeadSync AI Assistant & Agent Framework
Multi-Provider Unified AI Agent:
- Cloud Production: Google Gemini (via GEMINI_API_KEY, official OpenAI-compatible endpoint)
- Cloud Alternative: OpenAI (via OPENAI_API_KEY)
- Local Development: FreeLLMAPI Gateway (http://127.0.0.1:31415/v1)
- Full Operational Tool Registry: Direct, verified access to all 26 LeadSync features
- Multi-step sequential tool calling and natural language identifier resolution
- Proactive execution of dashboard workflows, updates, evaluations, and exports
"""

import os
import re
import json
import time
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from fastapi import APIRouter, Header, HTTPException, status, Depends
from backend.auth import get_current_session, require_role
from openai import OpenAI, APIConnectionError, APIStatusError, AuthenticationError, APITimeoutError
from google import genai
from google.genai import types as genai_types

logger = logging.getLogger("leadsync.ai")

from backend.database import db
from backend.models import AIChatRequest, AIChatResponse, ChatMessage
from backend.suitability import (
    evaluate_candidate_for_role,
    rank_employees_for_role,
    get_succession_matrix_all_roles,
    ROLE_PROJECT_KEYWORDS
)
from backend.ai_matcher import (
    evaluate_all_candidates_for_role,
    analyze_candidate_comprehensive_eligibility
)
from backend.it_skills_data import IT_SKILLS_CATALOG, ALL_IT_SKILLS

router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])

DEFAULT_FREELLMAPI_BASE_URL = "http://127.0.0.1:31415/v1"
DEFAULT_FREELLMAPI_MODEL = "auto"
DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash"
DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"

# Backward compatibility alias
DEFAULT_BASE_URL = DEFAULT_FREELLMAPI_BASE_URL
DEFAULT_MODEL = DEFAULT_FREELLMAPI_MODEL

DEFAULT_ROLE_ASSESSMENT_CATEGORIES = {
    "ROLE-SSE": {"Python": 0.30, "Java": 0.30, "Other Technical Skills": 0.25, "DBMS": 0.15},
    "ROLE-AIML": {"Python": 0.45, "Aptitude": 0.30, "Other Technical Skills": 0.15, "DBMS": 0.10},
    "ROLE-DEVOPS": {"Other Technical Skills": 0.45, "Python": 0.25, "Aptitude": 0.15, "C": 0.15},
    "ROLE-DBA": {"DBMS": 0.65, "Other Technical Skills": 0.20, "Aptitude": 0.15},
    "ROLE-PM": {"Communication": 0.55, "Aptitude": 0.30, "Other Technical Skills": 0.15}
}

def load_env_file():
    """Load key-value pairs from .env in project root if present without overriding existing host environment variables."""
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("'\"")
                    if k and k not in os.environ:
                        os.environ[k] = v
        except Exception:
            pass

# Pre-load environment once at startup
load_env_file()

# Global cache for Gemini client and pre-compiled function declarations
_CACHED_GEMINI_CLIENTS: Dict[str, Any] = {}
_CACHED_GEMINI_TOOL: Optional[Any] = None

def get_cached_gemini_client(api_key: str) -> Optional[Any]:
    if not api_key:
        return None
    client = _CACHED_GEMINI_CLIENTS.get(api_key)
    if client is None:
        client = genai.Client(api_key=api_key)
        _CACHED_GEMINI_CLIENTS[api_key] = client
    return client

def get_cached_gemini_tool() -> Any:
    global _CACHED_GEMINI_TOOL
    if _CACHED_GEMINI_TOOL is not None:
        return _CACHED_GEMINI_TOOL
    declarations = []
    for item in LEADSYNC_TOOLS:
        fn = item["function"]
        declarations.append(
            genai_types.FunctionDeclaration(
                name=fn["name"],
                description=fn.get("description", ""),
                parameters_json_schema=fn["parameters"],
            )
        )
    _CACHED_GEMINI_TOOL = genai_types.Tool(function_declarations=declarations)
    return _CACHED_GEMINI_TOOL

_SMALLTALK_PATTERN = re.compile(
    r"^(hi|hello|hey|good\s+(morning|afternoon|evening)|howdy|greetings|help|who\s+are\s+you)[!?.\s]*$",
    re.IGNORECASE
)

def is_smalltalk_query(messages: List[ChatMessage]) -> bool:
    """Returns True if the latest user message is purely conversational small-talk, avoiding tool overhead."""
    if not messages:
        return True
    last_text = (messages[-1].content or "").strip()
    return bool(_SMALLTALK_PATTERN.match(last_text))

def call_gemini_generate_with_fallback(client: Any, preferred_model: str, contents: Any, config: Any) -> Tuple[Any, str]:
    """
    Executes Gemini generate_content with seamless automatic model failover.
    If preferred_model hits 429 quota (5 requests/min free tier) or 503 high demand,
    it automatically falls back to gemini-3.5-flash-lite, which uses an independent quota pool.
    """
    candidates = [preferred_model]
    for alt in ["gemini-3.5-flash-lite", "gemini-3.5-flash"]:
        if alt not in candidates:
            candidates.append(alt)

    last_err = None
    for m in candidates:
        try:
            res = client.models.generate_content(
                model=m,
                contents=contents,
                config=config,
            )
            return res, m
        except Exception as e:
            err_msg = str(e)
            if any(s in err_msg for s in ["RESOURCE_EXHAUSTED", "429", "503", "UNAVAILABLE", "NOT_FOUND"]):
                logger.warning(f"[Gemini Auto-Failover] Model '{m}' momentarily rate-limited/busy. Failing over to next fast model...")
                last_err = e
                continue
            raise e
    raise last_err

def normalize_base_url(raw_url: str) -> str:
    """Ensures base URL ends with /v1 without duplicate trailing slashes."""
    url = raw_url.strip().rstrip("/")
    if not url.endswith("/v1"):
        url = f"{url}/v1"
    return url

def get_ai_config(reload_env: bool = False) -> Dict[str, str]:
    """
    Intelligently resolves the active AI provider configuration.
    Priority:
    1. Explicit AI_PROVIDER setting ('gemini', 'openai', 'freellmapi')
    2. Cloud provider: Google Gemini (if GEMINI_API_KEY or GOOGLE_API_KEY configured, or on Render)
    3. OpenAI (if OPENAI_API_KEY configured)
    4. Local development: FreeLLMAPI gateway (http://127.0.0.1:31415/v1)
    """
    if reload_env:
        load_env_file()
    explicit_provider = os.getenv("AI_PROVIDER", "").lower().strip()

    gemini_key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    freellmapi_key = os.getenv("FREELLMAPI_API_KEY", "").strip()
    is_render = bool(os.getenv("RENDER") or os.getenv("IS_RENDER"))

    if explicit_provider in ["gemini", "google"]:
        provider = "gemini"
    elif explicit_provider == "openai":
        provider = "openai"
    elif explicit_provider == "freellmapi":
        provider = "freellmapi"
    else:
        # Auto-detect based on available credentials and environment:
        # Prioritize cloud Gemini AI for production (or when GEMINI_API_KEY is available)
        if gemini_key:
            provider = "gemini"
        elif is_render and not freellmapi_key:
            # On Render production without local FreeLLMAPI Desktop, target Gemini
            provider = "gemini"
        elif openai_key:
            provider = "openai"
        elif freellmapi_key:
            provider = "freellmapi"
        elif is_render:
            provider = "gemini"
        else:
            provider = "freellmapi"

    if provider == "gemini":
        raw_base_url = os.getenv("GEMINI_BASE_URL", DEFAULT_GEMINI_BASE_URL).strip()
        base_url = raw_base_url if raw_base_url else DEFAULT_GEMINI_BASE_URL
        model = os.getenv("GEMINI_MODEL", os.getenv("AI_MODEL", DEFAULT_GEMINI_MODEL)).strip() or DEFAULT_GEMINI_MODEL
        return {
            "provider": "gemini",
            "provider_name": "Google Gemini",
            "base_url": base_url,
            "model": model,
            "api_key": gemini_key
        }
    elif provider == "openai":
        raw_base_url = os.getenv("OPENAI_BASE_URL", DEFAULT_OPENAI_BASE_URL).strip()
        base_url = normalize_base_url(raw_base_url) if raw_base_url else DEFAULT_OPENAI_BASE_URL
        model = os.getenv("OPENAI_MODEL", os.getenv("AI_MODEL", DEFAULT_OPENAI_MODEL)).strip() or DEFAULT_OPENAI_MODEL
        return {
            "provider": "openai",
            "provider_name": "OpenAI",
            "base_url": base_url,
            "model": model,
            "api_key": openai_key
        }
    else:
        raw_base_url = os.getenv("FREELLMAPI_BASE_URL", DEFAULT_FREELLMAPI_BASE_URL).strip()
        base_url = normalize_base_url(raw_base_url) if raw_base_url else DEFAULT_FREELLMAPI_BASE_URL
        model = os.getenv("FREELLMAPI_MODEL", os.getenv("AI_MODEL", DEFAULT_FREELLMAPI_MODEL)).strip() or DEFAULT_FREELLMAPI_MODEL
        return {
            "provider": "freellmapi",
            "provider_name": "FreeLLMAPI Unified Gateway",
            "base_url": base_url,
            "model": model,
            "api_key": freellmapi_key
        }

def get_freellmapi_config() -> Dict[str, str]:
    """Backward-compatible helper returning active configuration."""
    cfg = get_ai_config()
    return {
        "base_url": cfg["base_url"],
        "model": cfg["model"],
        "api_key": cfg["api_key"]
    }

# -------------------------------------------------------------------------
# Natural Language Identifier Resolvers
# -------------------------------------------------------------------------

def resolve_employee_id(identifier: Any) -> Optional[str]:
    """
    Intelligently maps natural language employee references to valid employee IDs (e.g. 'EMP-001').
    Handles:
    - '1', '01', '001' -> 'EMP-001'
    - 'emp 1', 'emp-1', 'emp_001' -> 'EMP-001'
    - Exact ID match 'EMP-001'
    - Employee names like 'Alex Rivera', 'Alex', 'Clara'
    - Employee emails
    """
    if identifier is None:
        return None
    raw = str(identifier).strip()
    if not raw:
        return None

    # Number only: "1" -> "EMP-001"
    if re.match(r"^\d+$", raw):
        num = int(raw)
        return f"EMP-{num:03d}"

    # Pattern "emp 1", "emp-1", "emp_001"
    m = re.match(r"^emp\s*[-_]?\s*(\d+)$", raw, re.IGNORECASE)
    if m:
        num = int(m.group(1))
        return f"EMP-{num:03d}"

    all_emps = db.get_all_employees()

    # Exact ID match
    for emp in all_emps:
        if emp["id"].lower() == raw.lower():
            return emp["id"]

    # Exact or substring name match
    raw_lower = raw.lower()
    for emp in all_emps:
        if raw_lower == emp["name"].lower():
            return emp["id"]

    for emp in all_emps:
        if raw_lower in emp["name"].lower():
            return emp["id"]

    # Email match
    for emp in all_emps:
        if raw_lower in emp.get("email", "").lower():
            return emp["id"]

    return None

def resolve_role_id(identifier: Any) -> Optional[str]:
    """
    Maps natural language role references to LeadSync role IDs (e.g. 'ROLE-SSE').
    """
    if identifier is None:
        return None
    raw = str(identifier).strip().lower()
    if not raw:
        return None

    role_aliases = {
        "sse": "ROLE-SSE",
        "senior software engineer": "ROLE-SSE",
        "software engineer": "ROLE-SSE",
        "software architect": "ROLE-SSE",
        "lead developer": "ROLE-SSE",
        "aiml": "ROLE-AIML",
        "ai/ml": "ROLE-AIML",
        "ai": "ROLE-AIML",
        "ml": "ROLE-AIML",
        "ai engineer": "ROLE-AIML",
        "machine learning engineer": "ROLE-AIML",
        "devops": "ROLE-DEVOPS",
        "devops engineer": "ROLE-DEVOPS",
        "cloud engineer": "ROLE-DEVOPS",
        "sre": "ROLE-DEVOPS",
        "dba": "ROLE-DBA",
        "database administrator": "ROLE-DBA",
        "database": "ROLE-DBA",
        "data lead": "ROLE-DBA",
        "pm": "ROLE-PM",
        "project manager": "ROLE-PM",
        "project team leader": "ROLE-PM",
        "team leader": "ROLE-PM",
        "team lead": "ROLE-PM"
    }

    if raw in role_aliases:
        return role_aliases[raw]

    for r in db.leadership_roles:
        if r["id"].lower() == raw or raw in r["title"].lower():
            return r["id"]

    return None

# -------------------------------------------------------------------------
# Factual HR Metrics Calculation
# -------------------------------------------------------------------------

def calculate_deidentified_hr_metrics() -> Dict[str, Any]:
    employees = db.get_all_employees()
    assessments = db.get_all_assessments()
    roles = db.leadership_roles
    appointments = db.appointments

    total_employees = len(employees)

    dept_counts: Dict[str, int] = {}
    total_exp = 0.0
    exp_values: List[float] = []

    exp_tiers = {"< 2 Years (Junior)": 0, "2 - 5 Years (Mid-level)": 0, "> 5 Years (Senior)": 0}
    skill_frequency: Dict[str, int] = {}

    completed_assessments = 0
    total_score_sum = 0
    scores_list: List[int] = []

    category_totals: Dict[str, float] = {
        "Python": 0.0, "Java": 0.0, "C": 0.0, "DBMS": 0.0,
        "Other Tech": 0.0, "Communication": 0.0, "Aptitude": 0.0
    }
    category_counts: Dict[str, int] = {k: 0 for k in category_totals}

    for emp in employees:
        dept = emp.get("department", "Unassigned")
        dept_counts[dept] = dept_counts.get(dept, 0) + 1

        exp = float(emp.get("experience_years", 0.0))
        total_exp += exp
        exp_values.append(exp)

        if exp < 2.0:
            exp_tiers["< 2 Years (Junior)"] += 1
        elif exp <= 5.0:
            exp_tiers["2 - 5 Years (Mid-level)"] += 1
        else:
            exp_tiers["> 5 Years (Senior)"] += 1

        for skill in emp.get("skills", {}).keys():
            skill_frequency[skill] = skill_frequency.get(skill, 0) + 1

        asm = emp.get("assessment_scores", {})
        if asm.get("completed") is True:
            completed_assessments += 1
            score = int(asm.get("score_pct", 0))
            total_score_sum += score
            scores_list.append(score)

            cat_scores = asm.get("category_scores", {})
            for cat, val in cat_scores.items():
                norm_cat = "Other Tech" if ("other" in cat.lower() or "tech" in cat.lower()) else cat
                if norm_cat in category_totals:
                    category_totals[norm_cat] += float(val)
                    category_counts[norm_cat] += 1

    avg_experience = round(total_exp / total_employees, 1) if total_employees > 0 else 0.0
    min_exp = min(exp_values) if exp_values else 0.0
    max_exp = max(exp_values) if exp_values else 0.0

    completion_rate_pct = round((completed_assessments / total_employees) * 100, 1) if total_employees > 0 else 0.0
    avg_assessment_score = round(total_score_sum / completed_assessments, 1) if completed_assessments > 0 else 0.0
    highest_score = max(scores_list) if scores_list else 0
    lowest_score = min(scores_list) if scores_list else 0

    score_bands = {
        "High Performers (>= 80%)": sum(1 for s in scores_list if s >= 80),
        "Proficient (60% - 79%)": sum(1 for s in scores_list if 60 <= s < 80),
        "Developing (< 60%)": sum(1 for s in scores_list if s < 60)
    }

    category_averages: Dict[str, float] = {}
    for cat, total_val in category_totals.items():
        cnt = category_counts[cat]
        category_averages[cat] = round(total_val / cnt, 1) if cnt > 0 else 0.0

    sorted_skills = sorted(skill_frequency.items(), key=lambda x: x[1], reverse=True)[:8]
    top_skills_summary = [{"skill": s, "employee_count": c} for s, c in sorted_skills]
    succession_roles_summary = [r.get("title") for r in roles]

    return {
        "workforce_headcount": total_employees,
        "department_distribution": dept_counts,
        "experience_metrics": {
            "average_years": avg_experience,
            "min_years": min_exp,
            "max_years": max_exp,
            "tiers": exp_tiers
        },
        "assessment_metrics": {
            "total_scheduled_assessments": len(assessments),
            "completed_count": completed_assessments,
            "completion_rate_pct": completion_rate_pct,
            "average_score_pct": avg_assessment_score,
            "highest_score_pct": highest_score,
            "lowest_score_pct": lowest_score,
            "performance_bands": score_bands,
            "category_averages_pct": category_averages
        },
        "top_verified_skills": top_skills_summary,
        "succession_planning": {
            "total_leadership_roles": len(roles),
            "leadership_role_titles": succession_roles_summary,
            "formal_appointments_recorded": len(appointments)
        }
    }

def format_hr_context_for_prompt(metrics: Dict[str, Any]) -> str:
    dept_str = ", ".join([f"{k}: {v}" for k, v in metrics["department_distribution"].items()])
    skills_str = ", ".join([f"{s['skill']} ({s['employee_count']} staff)" for s in metrics["top_verified_skills"]]) or "No skills recorded yet"
    cat_str = ", ".join([f"{k}: {v}%" for k, v in metrics["assessment_metrics"]["category_averages_pct"].items() if v > 0]) or "Assessments pending"

    return f"""### LIVE LEADSYNC PLATFORM METRICS
- Total Workforce Headcount: {metrics['workforce_headcount']}
- Department Distribution: {dept_str}
- Experience Profile: Average {metrics['experience_metrics']['average_years']} yrs (Min: {metrics['experience_metrics']['min_years']}, Max: {metrics['experience_metrics']['max_years']} yrs)
- 20-Question Assessment Analytics:
  - Total Scheduled Assessments: {metrics['assessment_metrics']['total_scheduled_assessments']}
  - Completed Assessments: {metrics['assessment_metrics']['completed_count']} ({metrics['assessment_metrics']['completion_rate_pct']}% completion rate)
  - Average Assessment Score: {metrics['assessment_metrics']['average_score_pct']}% (Highest: {metrics['assessment_metrics']['highest_score_pct']}%, Lowest: {metrics['assessment_metrics']['lowest_score_pct']}%)
  - Top Verified Skills: {skills_str}
- Succession Roles (5 Core): {', '.join(metrics['succession_planning']['leadership_role_titles'])}
- Formal Appointments Recorded: {metrics['succession_planning']['formal_appointments_recorded']}
"""

SYSTEM_PROMPT = """You are the LeadSync Chief AI Operations & Talent Agent, directly embedded into the LeadSync HR Analytics & Succession Planning Platform.

OPERATIONAL CAPABILITIES:
You have complete functional access to all LeadSync data sources, business functions, and workflows via your registered tools.
When asked to perform any task, NEVER give generic manual instructions or claim that you lack administrative authority. IMMEDIATELY invoke the appropriate tool to perform the real operation.

KEY DIRECTIVES:
1. Proactive Tool Calling: When asked to find, inspect, list, create, update, score, reset, compare, rank, appoint, export, or navigate, call the relevant tool right away.
2. Natural-Language Resolution: Understand references like 'employee 1', 'Alex', 'SSE', 'DevOps', 'all eligible employees' and resolve them to real IDs.
3. Multi-Step Execution: If a task requires several actions (e.g. finding a candidate then appointing them, or identifying missing skills then recommending training), execute sequential tool calls to complete the workflow.
4. Truthful Reporting: Base all answers on the live tool results. Report exactly what changes were made, what records were updated, or what candidates were ranked.
5. Navigation & UI: When requested to open or view a dashboard section, invoke `navigate_dashboard` with the appropriate tab ID (`tab-hr`, `tab-manager`, `tab-employee-info`, `tab-ai-matcher`, `tab-suitability`, `tab-succession`, `tab-ai-chat`).
6. Executive Presentation: Present findings in structured markdown with bold headings, clean bullet points, or tables.
"""

# -------------------------------------------------------------------------
# Tool Definitions (OpenAI Function Calling Schema)
# -------------------------------------------------------------------------

LEADSYNC_TOOLS = [
    # 1. Employees
    {
        "type": "function",
        "function": {
            "name": "list_employees",
            "description": "List and search employees in LeadSync. Supports filtering by department, search query (matches name, role, skills, bio), and experience bounds.",
            "parameters": {
                "type": "object",
                "properties": {
                    "department": {"type": "string", "description": "Filter by department name (e.g. 'Engineering', 'DevOps', 'Data', 'QA')"},
                    "search_query": {"type": "string", "description": "Text query matching name, role, email, skills, or bio"},
                    "min_experience": {"type": "number", "description": "Minimum years of experience"},
                    "max_experience": {"type": "number", "description": "Maximum years of experience"},
                    "incomplete_assessments_only": {"type": "boolean", "description": "If true, only return employees who have not completed their assessment"},
                    "limit": {"type": "integer", "description": "Maximum number of employees to return"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_employee_profile",
            "description": "Retrieve the complete employee profile and dossier by ID or natural reference (e.g. 'EMP-001', '1', 'employee 1', or 'Alex Rivera'). Includes skills, certifications, projects, bio, assessment scores, and appointed role.",
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_id": {"type": "string", "description": "Employee ID, number, or full name (e.g. 'EMP-001', '1', 'Alex Rivera')"}
                },
                "required": ["employee_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_new_employee",
            "description": "Add a new employee to the LeadSync database and workforce registry.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Full name of employee"},
                    "role": {"type": "string", "description": "Job title/role (e.g. 'Senior Backend Engineer')"},
                    "department": {"type": "string", "description": "Department name (e.g. 'Engineering', 'DevOps', 'QA')"},
                    "experience_years": {"type": "number", "description": "Years of professional experience"},
                    "email": {"type": "string", "description": "Corporate email address"},
                    "skills": {"type": "object", "description": "Dictionary of skills and ratings 0-100 (e.g. {'Python': 85, 'DBMS': 80})"},
                    "bio": {"type": "string", "description": "Brief professional bio"},
                    "education": {"type": "string", "description": "Educational credentials"},
                    "certifications": {"type": "array", "items": {"type": "string"}, "description": "List of professional certificates"}
                },
                "required": ["name", "role", "department", "experience_years"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_employee_details",
            "description": "Update permitted fields for an existing employee in the LeadSync database (role, department, experience, skills, bio, etc.).",
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_id": {"type": "string", "description": "Employee ID or reference (e.g. 'EMP-001' or '1')"},
                    "updates": {
                        "type": "object",
                        "description": "Dictionary of fields to update (name, role, department, experience_years, email, skills, bio, education, certifications)"
                    }
                },
                "required": ["employee_id", "updates"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_employee_dossier",
            "description": "Retrieve candidate evaluation dossier including assessment marks, certificates verification, resume details, and appointed role.",
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_id": {"type": "string", "description": "Employee ID or name"}
                },
                "required": ["employee_id"]
            }
        }
    },

    # 2. Assessments
    {
        "type": "function",
        "function": {
            "name": "list_assessments",
            "description": "List all scheduled and active assessments in LeadSync, including dates, times, durations, and assigned employees.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_assessment_questions",
            "description": "Retrieve 20 randomized questions from the LeadSync question bank balancing Python, C, Java, DBMS, Technical, Communication, and Aptitude.",
            "parameters": {
                "type": "object",
                "properties": {
                    "assessment_id": {"type": "string", "description": "Assessment ID or seed for randomization"},
                    "count": {"type": "integer", "description": "Number of questions to retrieve (default 20)"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_and_schedule_assessment",
            "description": "Create and schedule a new 20-question assessment in LeadSync and assign it to all employees or a selected group.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Assessment title (e.g. 'Engineering Technical Proficiency Assessment')"},
                    "scheduled_date": {"type": "string", "description": "Scheduled date (YYYY-MM-DD)"},
                    "scheduled_time": {"type": "string", "description": "Scheduled start time (HH:MM)"},
                    "duration_minutes": {"type": "integer", "description": "Duration in minutes (default 30)"},
                    "assigned_to": {"type": "array", "items": {"type": "string"}, "description": "List of employee IDs or ['all'] to assign to all employees"},
                    "description": {"type": "string", "description": "Assessment description"}
                },
                "required": ["title", "scheduled_date", "scheduled_time"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "submit_employee_assessment",
            "description": "Submit completed assessment answers for an employee and calculate their auto-graded test score % and category breakdown.",
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_id": {"type": "string", "description": "Employee ID or reference (e.g. 'EMP-001')"},
                    "answers": {"type": "object", "description": "Dictionary mapping question ID to chosen option index, e.g. {'Q01': 2, 'Q02': 0}"}
                },
                "required": ["employee_id", "answers"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "reset_all_assessment_scores",
            "description": "Reset all employee assessment marks to 0 (unattended baseline state) and clear scheduled assessments.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_assessment_leaderboard_top3",
            "description": "Retrieve the Top 3 employee performers based on completed assessment score percentage and experience (HR Executive Leaderboard).",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_manager_team_roster",
            "description": "Retrieve the complete team roster of all 15 employees with assessment completion status and scores (Manager Dashboard).",
            "parameters": {"type": "object", "properties": {}}
        }
    },

    # 3. Skills & Competencies
    {
        "type": "function",
        "function": {
            "name": "get_skills_catalog",
            "description": "Retrieve the comprehensive Computer & IT skills taxonomy and category breakdown.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_employee_skill_gaps",
            "description": "Analyze skill gaps between an employee's verified technical skills and a target leadership role's benchmark skills, providing recommendations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_id": {"type": "string", "description": "Employee ID or name"},
                    "role_id": {"type": "string", "description": "Target role ID or title (e.g. 'ROLE-SSE', 'DevOps', 'AI/ML')"}
                },
                "required": ["employee_id"]
            }
        }
    },

    # 4. Leadership Roles, Suitability & Succession
    {
        "type": "function",
        "function": {
            "name": "list_leadership_roles",
            "description": "List the 5 core leadership succession roles (Senior Software Engineer, AI/ML Engineer, DevOps Engineer, Database Administrator, Project Team Leader) and their target criteria.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "evaluate_role_suitability",
            "description": "Evaluate candidate suitability score across skills, projects, assessment score, and experience for one or all leadership roles.",
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_id": {"type": "string", "description": "Employee ID or name"},
                    "role_id": {"type": "string", "description": "Target role ID (optional; if omitted, evaluates across all 5 roles)"},
                    "override_experience": {"type": "number", "description": "Optional experience years override for simulation"},
                    "override_skills": {"type": "object", "description": "Optional skills override for simulation"},
                    "override_assessment_score": {"type": "integer", "description": "Optional assessment score % override"}
                },
                "required": ["employee_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "rank_candidates_for_role",
            "description": "Rank all employees in the organization for a specific succession role based on multi-dimensional suitability scoring.",
            "parameters": {
                "type": "object",
                "properties": {
                    "role_id": {"type": "string", "description": "Target role ID or title (e.g. 'ROLE-SSE', 'ROLE-DEVOPS', 'ROLE-AIML', 'ROLE-DBA', 'ROLE-PM')"}
                },
                "required": ["role_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_succession_matrix",
            "description": "Retrieve the organization-wide succession planning matrix across all 5 leadership roles.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_ai_candidate_matching",
            "description": "Run AI candidate analysis to find and recommend the best employee match for a succession role.",
            "parameters": {
                "type": "object",
                "properties": {
                    "role_id": {"type": "string", "description": "Target role ID or title (e.g. 'ROLE-SSE', 'ROLE-AIML')"},
                    "department_filter": {"type": "string", "description": "Optional department filter"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "appoint_candidate_to_role",
            "description": "Formally appoint an employee to a leadership succession role and record the appointment in the succession registry.",
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_id": {"type": "string", "description": "Employee ID or name to appoint"},
                    "role_id": {"type": "string", "description": "Role ID or title to appoint to"},
                    "decision_notes": {"type": "string", "description": "Formal rationale or notes for the appointment decision"}
                },
                "required": ["employee_id", "role_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_succession_appointments",
            "description": "List all formal leadership succession appointments recorded in LeadSync.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_top3_candidates_for_role",
            "description": "Analyze skills, experience, certifications, and resume of the TOP 3 assessment performers and recommend ONE best eligible employee for the role.",
            "parameters": {
                "type": "object",
                "properties": {
                    "role_id": {"type": "string", "description": "Target role ID or title (e.g. 'ROLE-SSE', 'ROLE-AIML', 'ROLE-DEVOPS', 'ROLE-DBA', 'ROLE-PM')"}
                },
                "required": ["role_id"]
            }
        }
    },

    # 5. Analytics & Reporting
    {
        "type": "function",
        "function": {
            "name": "get_analytics_summary",
            "description": "Access live dashboard workforce KPIs, department distribution, experience profile, and assessment analytics.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "compare_departments_analytics",
            "description": "Perform comparative analytics across all departments, analyzing headcount, average experience, assessment performance, and technical strengths.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_and_export_assessment_report",
            "description": "Generate a comprehensive, structured HR Assessment & Talent Readiness Report ready for executive review or export (in markdown or CSV format).",
            "parameters": {
                "type": "object",
                "properties": {
                    "format_type": {"type": "string", "enum": ["markdown", "csv"], "description": "Output format ('markdown' or 'csv')"},
                    "department_filter": {"type": "string", "description": "Optional department filter"}
                }
            }
        }
    },

    # 6. Dashboard Interactions
    {
        "type": "function",
        "function": {
            "name": "navigate_dashboard",
            "description": "Switch the active dashboard section or tab in the user interface.",
            "parameters": {
                "type": "object",
                "properties": {
                    "target_tab": {
                        "type": "string",
                        "enum": [
                            "tab-hr",
                            "tab-manager",
                            "tab-employee-info",
                            "tab-ai-matcher",
                            "tab-suitability",
                            "tab-succession",
                            "tab-employee",
                            "tab-ai-chat"
                        ],
                        "description": "Tab identifier to activate"
                    }
                },
                "required": ["target_tab"]
            }
        }
    }
]

# -------------------------------------------------------------------------
# Tool Execution Handlers (Connecting to Real LeadSync Operations)
# -------------------------------------------------------------------------

def handle_list_employees(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    dept = args.get("department")
    query = (args.get("search_query") or "").lower().strip()
    min_exp = args.get("min_experience")
    max_exp = args.get("max_experience")
    incomplete_only = args.get("incomplete_assessments_only", False)
    limit = args.get("limit")

    all_emps = db.get_all_employees()
    filtered = []

    for emp in all_emps:
        # Dept
        if dept and dept.lower() not in emp.get("department", "").lower():
            continue
        # Experience
        exp = float(emp.get("experience_years", 0.0))
        if min_exp is not None and exp < float(min_exp):
            continue
        if max_exp is not None and exp > float(max_exp):
            continue
        # Incomplete assessment filter
        asm_done = emp.get("assessment_scores", {}).get("completed", False)
        if incomplete_only and asm_done:
            continue
        # Search query
        if query:
            match_name = query in emp["name"].lower()
            match_role = query in emp["role"].lower()
            match_email = query in emp.get("email", "").lower()
            match_bio = query in emp.get("bio", "").lower()
            match_skills = any(query in s.lower() for s in emp.get("skills", {}).keys())
            if not (match_name or match_role or match_email or match_bio or match_skills):
                continue

        filtered.append({
            "id": emp["id"],
            "name": emp["name"],
            "role": emp["role"],
            "department": emp.get("department", "Engineering"),
            "experience_years": emp.get("experience_years", 0.0),
            "skills": list(emp.get("skills", {}).keys())[:6],
            "assessment_completed": asm_done,
            "assessment_score_pct": emp.get("assessment_scores", {}).get("score_pct", 0),
            "appointed_role": emp.get("appointed_role")
        })

    if limit and limit > 0:
        filtered = filtered[:limit]

    summary = f"Found {len(filtered)} employee(s) in {dept}." if dept else f"Found {len(filtered)} employee(s) matching criteria."
    return {"count": len(filtered), "employees": filtered}, summary, None


def handle_get_employee_profile(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    raw_id = args.get("employee_id")
    emp_id = resolve_employee_id(raw_id)
    if not emp_id:
        return {"error": f"Could not find an employee matching '{raw_id}'."}, f"Employee '{raw_id}' not found.", None

    emp = db.get_employee(emp_id)
    if not emp:
        return {"error": f"Employee record '{emp_id}' not found in database."}, f"Employee '{emp_id}' not found.", None

    summary = f"Retrieved profile for {emp['name']} ({emp['id']}) - {emp['role']}."
    return {"employee": emp}, summary, None


def handle_add_new_employee(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    name = (args.get("name") or "").strip()
    role = (args.get("role") or "").strip()
    dept = (args.get("department") or "Engineering").strip()
    exp = float(args.get("experience_years", 0.0))

    if not name or not role:
        return {"error": "Employee name and role are required."}, "Missing required fields.", None

    new_emp = db.add_employee({
        "name": name,
        "role": role,
        "department": dept,
        "experience_years": exp,
        "email": args.get("email"),
        "skills": args.get("skills", {}),
        "bio": args.get("bio", f"Employee in {role} awaiting HR evaluation."),
        "education": args.get("education", "Credentials on file"),
        "certifications": args.get("certifications", [])
    })

    summary = f"Successfully added employee {new_emp['name']} with ID {new_emp['id']} to {new_emp['department']}."
    ui_action = {"action": "refresh", "message": summary}
    return {"success": True, "employee": new_emp, "message": summary}, summary, ui_action


def handle_update_employee_details(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    raw_id = args.get("employee_id")
    emp_id = resolve_employee_id(raw_id)
    if not emp_id:
        return {"error": f"Could not find employee matching '{raw_id}'."}, f"Employee '{raw_id}' not found.", None

    updates = args.get("updates", {})
    if not updates or not isinstance(updates, dict):
        return {"error": "Updates dictionary cannot be empty."}, "No updates provided.", None

    try:
        updated = db.update_employee_info(emp_id, updates)
        summary = f"Successfully updated {len(updates)} field(s) for {updated['name']} ({emp_id})."
        ui_action = {"action": "refresh", "message": summary}
        return {"success": True, "employee": updated, "message": summary}, summary, ui_action
    except Exception as e:
        return {"error": str(e)}, f"Failed to update employee: {str(e)}", None


def handle_get_employee_dossier(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    raw_id = args.get("employee_id")
    emp_id = resolve_employee_id(raw_id)
    if not emp_id:
        return {"error": f"Could not find employee '{raw_id}'."}, f"Employee '{raw_id}' not found.", None

    emp = db.get_employee(emp_id)
    if not emp:
        return {"error": f"Employee '{emp_id}' not found."}, f"Employee '{emp_id}' not found.", None

    dossier = {
        "id": emp["id"],
        "name": emp["name"],
        "role": emp["role"],
        "department": emp.get("department", "Engineering"),
        "experience_years": emp.get("experience_years", 0.0),
        "skills": emp.get("skills", {}),
        "assessment_scores": emp.get("assessment_scores", {}),
        "certifications": emp.get("certifications", []),
        "resume": emp.get("resume", {}),
        "projects_count": len(emp.get("projects", [])),
        "appointed_role": emp.get("appointed_role")
    }
    summary = f"Loaded candidate dossier for {emp['name']} ({emp['id']})."
    return {"dossier": dossier}, summary, None


def handle_list_assessments(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    asms = db.get_all_assessments()
    summary = f"Retrieved {len(asms)} assessment(s) from catalog."
    return {"count": len(asms), "assessments": asms}, summary, None


def handle_get_assessment_questions(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    seed = args.get("assessment_id", "ASM-2026-001")
    count = int(args.get("count", 20))
    questions = db.get_20_questions(seed_val=seed)
    selected = questions[:count]

    client_qs = []
    for q in selected:
        client_qs.append({
            "id": q["id"],
            "category": q["category"],
            "question": q["question"],
            "options": q["options"]
        })

    summary = f"Retrieved {len(client_qs)} randomized assessment questions across categories."
    return {"total": len(client_qs), "questions": client_qs}, summary, None


def handle_create_and_schedule_assessment(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    title = (args.get("title") or "").strip()
    sched_date = (args.get("scheduled_date") or datetime.now().strftime("%Y-%m-%d")).strip()
    sched_time = (args.get("scheduled_time") or "10:00").strip()
    duration = int(args.get("duration_minutes", 30))
    desc = args.get("description", "Evaluation covering Python, C, Java, DBMS, Technical, Communication, and Aptitude.")

    assigned_raw = args.get("assigned_to", ["all"])
    assigned_ids = []
    if "all" in assigned_raw or not assigned_raw:
        assigned_ids = [e["id"] for e in db.get_all_employees()]
    else:
        for item in assigned_raw:
            resolved = resolve_employee_id(item)
            if resolved and resolved not in assigned_ids:
                assigned_ids.append(resolved)

    new_asm = db.create_assessment({
        "title": title,
        "description": desc,
        "scheduled_date": sched_date,
        "scheduled_time": sched_time,
        "duration_minutes": duration,
        "assigned_to": assigned_ids
    })

    summary = f"Created and scheduled assessment '{title}' ({new_asm['id']}) for {len(assigned_ids)} employee(s)."
    ui_action = {"action": "refresh", "message": summary}
    return {"success": True, "assessment": new_asm, "message": summary}, summary, ui_action


def handle_submit_employee_assessment(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    raw_id = args.get("employee_id")
    emp_id = resolve_employee_id(raw_id)
    if not emp_id:
        return {"error": f"Employee '{raw_id}' not found."}, f"Employee '{raw_id}' not found.", None

    answers = args.get("answers", {})
    try:
        scores = db.submit_assessment_answers(emp_id, answers)
        emp = db.get_employee(emp_id)
        summary = f"Assessment submitted for {emp['name']}: scored {scores['score_pct']}% ({scores['correct_count']}/{scores['total_questions']} correct)."
        ui_action = {"action": "refresh", "message": summary}
        return {"success": True, "employee_id": emp_id, "scores": scores, "message": summary}, summary, ui_action
    except Exception as e:
        return {"error": str(e)}, f"Failed to submit assessment: {str(e)}", None


def handle_reset_all_assessment_scores(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    res = db.reset_assessment_scores()
    summary = f"Successfully reset assessment scores for all {res['count']} employees to 0."
    ui_action = {"action": "refresh", "message": summary}
    return {"success": True, "message": summary, "count": res["count"]}, summary, ui_action


def handle_get_assessment_leaderboard_top3(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    top3 = db.get_top_3_results()
    leaderboard = []
    for rank, emp in enumerate(top3, 1):
        asm = emp.get("assessment_scores", {})
        leaderboard.append({
            "rank": rank,
            "id": emp["id"],
            "name": emp["name"],
            "role": emp["role"],
            "department": emp.get("department", "Engineering"),
            "score_pct": asm.get("score_pct", 0),
            "correct_count": asm.get("correct_count", 0),
            "experience_years": emp.get("experience_years", 0.0),
            "category_scores": asm.get("category_scores", {})
        })
    summary = f"Retrieved top {len(leaderboard)} employee results for HR Dashboard."
    return {"leaderboard": leaderboard, "count": len(leaderboard)}, summary, None


def handle_get_manager_team_roster(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    all_emps = db.get_all_results_for_manager()
    roster = []
    for emp in all_emps:
        asm = emp.get("assessment_scores", {})
        roster.append({
            "id": emp["id"],
            "name": emp["name"],
            "role": emp["role"],
            "department": emp.get("department", "Engineering"),
            "completed": asm.get("completed", False),
            "score_pct": asm.get("score_pct", 0),
            "date": asm.get("date"),
            "experience_years": emp.get("experience_years", 0.0)
        })
    summary = f"Retrieved full team roster of {len(roster)} employees for Manager Dashboard."
    return {"roster": roster, "count": len(roster)}, summary, None


def handle_get_skills_catalog(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    summary = f"Retrieved complete IT Skills Catalog with {len(ALL_IT_SKILLS)} categorized skills."
    return {
        "categories": IT_SKILLS_CATALOG,
        "all_skills": ALL_IT_SKILLS,
        "total_skills": len(ALL_IT_SKILLS)
    }, summary, None


def handle_analyze_employee_skill_gaps(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    raw_emp = args.get("employee_id")
    emp_id = resolve_employee_id(raw_emp)
    if not emp_id:
        return {"error": f"Employee '{raw_emp}' not found."}, f"Employee '{raw_emp}' not found.", None

    emp = db.get_employee(emp_id)
    raw_role = args.get("role_id") or "ROLE-SSE"
    role_id = resolve_role_id(raw_role) or "ROLE-SSE"
    role = next((r for r in db.leadership_roles if r["id"] == role_id), db.leadership_roles[0])

    benchmarks = role.get("benchmark_skills", {})
    cand_skills = emp.get("skills", {})

    matched = {}
    missing = {}
    below_benchmark = {}

    for skill, target_level in benchmarks.items():
        if skill in cand_skills:
            actual = cand_skills[skill]
            if actual >= target_level:
                matched[skill] = {"required": target_level, "actual": actual}
            else:
                gap = target_level - actual
                below_benchmark[skill] = {"required": target_level, "actual": actual, "gap": gap}
        else:
            missing[skill] = {"required": target_level, "actual": 0}

    total_benchmarks = len(benchmarks)
    matched_count = len(matched)
    gap_pct = round(((total_benchmarks - matched_count) / max(1, total_benchmarks)) * 100, 1)

    summary = f"Skill gap analysis for {emp['name']} vs {role['title']}: {matched_count}/{total_benchmarks} benchmark skills satisfied ({gap_pct}% gap)."
    return {
        "employee_id": emp_id,
        "employee_name": emp["name"],
        "target_role": role["title"],
        "matched_skills": matched,
        "below_benchmark_skills": below_benchmark,
        "missing_skills": missing,
        "skill_gap_percentage": gap_pct
    }, summary, None


def handle_list_leadership_roles(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    roles = db.leadership_roles
    summary = f"Retrieved {len(roles)} leadership succession roles."
    return {"roles": roles}, summary, None


def handle_evaluate_role_suitability(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    raw_emp = args.get("employee_id")
    emp_id = resolve_employee_id(raw_emp)
    if not emp_id:
        return {"error": f"Employee '{raw_emp}' not found."}, f"Employee '{raw_emp}' not found.", None

    emp = db.get_employee(emp_id)
    raw_role = args.get("role_id")
    role_id = resolve_role_id(raw_role) if raw_role else None

    roles_to_eval = [r for r in db.leadership_roles if r["id"] == role_id] if role_id else db.leadership_roles

    overrides = {}
    if args.get("override_experience") is not None:
        overrides["override_experience"] = float(args["override_experience"])
    if args.get("override_skills") is not None:
        overrides["override_skills"] = args["override_skills"]
    if args.get("override_assessment_score") is not None:
        overrides["override_assessment_score"] = int(args["override_assessment_score"])
    if args.get("override_projects_count") is not None:
        overrides["override_projects_count"] = int(args["override_projects_count"])

    evaluations = [evaluate_candidate_for_role(emp, r, overrides) for r in roles_to_eval]
    evaluations.sort(key=lambda x: x["overall_score"], reverse=True)

    best_role = evaluations[0]["role_title"] if evaluations else "None"
    best_score = evaluations[0]["overall_score"] if evaluations else 0

    summary = f"Evaluated suitability for {emp['name']}: Top fit is {best_role} with {best_score}% score."
    return {
        "employee_id": emp_id,
        "employee_name": emp["name"],
        "recommended_primary_role": best_role,
        "primary_suitability_score": best_score,
        "evaluations": evaluations
    }, summary, None


def handle_rank_candidates_for_role(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    raw_role = args.get("role_id") or "ROLE-SSE"
    role_id = resolve_role_id(raw_role) or "ROLE-SSE"
    role = next((r for r in db.leadership_roles if r["id"] == role_id), db.leadership_roles[0])

    ranked = rank_employees_for_role(db.employees, role)
    top_candidate = ranked[0].get("employee_name") or ranked[0].get("name") or "None"
    summary = f"Ranked {len(ranked)} candidates for {role['title']}. #1 Rank: {top_candidate}."
    return {"role": role, "ranked_candidates": ranked}, summary, None


def handle_get_succession_matrix(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    matrix = get_succession_matrix_all_roles(db.employees, db.leadership_roles)
    summary = f"Generated succession matrix across all {len(db.leadership_roles)} roles."
    return {"matrix": matrix}, summary, None


def handle_run_ai_candidate_matching(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    raw_role = args.get("role_id") or "ROLE-SSE"
    role_id = resolve_role_id(raw_role) or "ROLE-SSE"
    matched_role = next((r for r in db.leadership_roles if r["id"] == role_id), db.leadership_roles[0])

    dept_filter = args.get("department_filter")
    benchmark_skills = dict(matched_role.get("benchmark_skills", {}))
    priority_cats = DEFAULT_ROLE_ASSESSMENT_CATEGORIES.get(role_id, {
        "Python": 0.25, "DBMS": 0.25, "Communication": 0.25, "Aptitude": 0.25
    })
    project_kws = ROLE_PROJECT_KEYWORDS.get(role_id, ["architecture", "microservices", "scalable", "leadership"])

    role_criteria = {
        "role_id": matched_role["id"],
        "title": matched_role["title"],
        "department": matched_role["department"],
        "target_experience_years": matched_role.get("target_experience_years", 4.0),
        "benchmark_skills": benchmark_skills,
        "priority_assessment_categories": priority_cats,
        "project_keywords": project_kws,
        "weights": {"skills": 0.35, "projects": 0.25, "assessment": 0.25, "experience": 0.15},
        "department_filter": dept_filter
    }

    results = evaluate_all_candidates_for_role(db.employees, role_criteria)
    best_candidate = results.get("best_perfect_employee") or results.get("recommended_candidate") or {}
    best_name = best_candidate.get("name", "Top Candidate")
    summary = f"AI Role Matcher for {matched_role['title']}: Top recommendation is {best_name}."
    return results, summary, None


def handle_appoint_candidate_to_role(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    raw_emp = args.get("employee_id")
    emp_id = resolve_employee_id(raw_emp)
    if not emp_id:
        return {"error": f"Employee '{raw_emp}' not found."}, f"Employee '{raw_emp}' not found.", None

    emp = db.get_employee(emp_id)
    raw_role = args.get("role_id") or "ROLE-SSE"
    role_id = resolve_role_id(raw_role) or "ROLE-SSE"
    role = next((r for r in db.leadership_roles if r["id"] == role_id), db.leadership_roles[0])

    notes = args.get("decision_notes", "Formally appointed via LeadSync AI Executive Operation.")

    appt = db.add_appointment({
        "employee_id": emp_id,
        "role_id": role["id"],
        "role_title": role["title"],
        "decision_notes": notes
    })

    summary = f"Formally appointed {emp['name']} ({emp_id}) to {role['title']}."
    ui_action = {"action": "refresh", "message": summary}
    return {
        "success": True,
        "appointment": appt,
        "message": summary
    }, summary, ui_action


def handle_list_succession_appointments(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    appts = db.get_all_appointments()
    summary = f"Retrieved {len(appts)} recorded leadership succession appointment(s)."
    return {"count": len(appts), "appointments": appts}, summary, None


def handle_analyze_top3_candidates_for_role(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    raw_role = args.get("role_id") or "ROLE-SSE"
    role_id = resolve_role_id(raw_role) or "ROLE-SSE"

    top3_emps = db.get_top_3_results()
    if not top3_emps:
        top3_emps = sorted(db.get_all_employees(), key=lambda x: x.get("experience_years", 0), reverse=True)[:3]

    top3_ids = [e["id"] for e in top3_emps]

    results = analyze_candidate_comprehensive_eligibility(
        all_employees=db.get_all_employees(),
        role_id=role_id,
        employee_id=top3_ids[0] if top3_ids else "EMP-001",
        candidate_subset_ids=top3_ids,
        leadership_roles=db.leadership_roles
    )
    results["top3_employee_profiles"] = top3_emps
    best_name = results.get("recommended_candidate", {}).get("name", "Top Scorer")
    summary = f"Analyzed Top 3 assessment candidates for {role_id}. Recommended winner: {best_name}."
    return results, summary, None


def handle_get_analytics_summary(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    metrics = calculate_deidentified_hr_metrics()
    summary = f"Computed live analytics for {metrics['workforce_headcount']} employees across {len(metrics['department_distribution'])} departments."
    return metrics, summary, None


def handle_compare_departments_analytics(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    employees = db.get_all_employees()
    dept_map: Dict[str, List[Dict[str, Any]]] = {}

    for emp in employees:
        d = emp.get("department", "Other")
        dept_map.setdefault(d, []).append(emp)

    dept_stats = []
    for dept_name, emps in dept_map.items():
        total = len(emps)
        total_exp = sum(float(e.get("experience_years", 0)) for e in emps)
        avg_exp = round(total_exp / total, 1) if total > 0 else 0

        completed_asm = [e for e in emps if e.get("assessment_scores", {}).get("completed", False)]
        completed_count = len(completed_asm)
        comp_rate = round((completed_count / total) * 100, 1) if total > 0 else 0

        avg_score = round(sum(e["assessment_scores"].get("score_pct", 0) for e in completed_asm) / completed_count, 1) if completed_count > 0 else 0

        # Skills breakdown
        skills_set = {}
        for e in emps:
            for s, lvl in e.get("skills", {}).items():
                skills_set[s] = skills_set.get(s, 0) + 1
        top_skills = [s for s, _ in sorted(skills_set.items(), key=lambda x: x[1], reverse=True)[:4]]

        dept_stats.append({
            "department": dept_name,
            "headcount": total,
            "average_experience_years": avg_exp,
            "assessment_completion_rate_pct": comp_rate,
            "average_assessment_score_pct": avg_score,
            "top_skills": top_skills
        })

    dept_stats.sort(key=lambda x: x["headcount"], reverse=True)
    summary = f"Comparative analytics computed across {len(dept_stats)} departments."
    return {"departments": dept_stats, "total_departments": len(dept_stats)}, summary, None


def handle_generate_and_export_assessment_report(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    format_type = (args.get("format_type") or "markdown").lower()
    dept_filter = args.get("department_filter")

    employees = db.get_all_employees()
    if dept_filter:
        employees = [e for e in employees if dept_filter.lower() in e.get("department", "").lower()]

    top3 = db.get_top_3_results()
    total_staff = len(employees)
    completed_emps = [e for e in employees if e.get("assessment_scores", {}).get("completed", False)]
    comp_rate = round((len(completed_emps) / max(1, total_staff)) * 100, 1)
    avg_score = round(sum(e["assessment_scores"].get("score_pct", 0) for e in completed_emps) / max(1, len(completed_emps)), 1) if completed_emps else 0

    if format_type == "csv":
        lines = ["Employee ID,Name,Department,Role,Experience (Years),Assessment Completed,Score (%)"]
        for e in employees:
            asm = e.get("assessment_scores", {})
            lines.append(f"{e['id']},{e['name']},{e.get('department','Engineering')},{e['role']},{e.get('experience_years', 0)},{asm.get('completed', False)},{asm.get('score_pct', 0)}")
        report_content = "\n".join(lines)
    else:
        # Markdown report
        top3_rows = []
        for rank, e in enumerate(top3, 1):
            top3_rows.append(f"| #{rank} | **{e['name']}** ({e['id']}) | {e['role']} | {e.get('department')} | **{e['assessment_scores'].get('score_pct', 0)}%** | {e.get('experience_years')} yrs |")

        emp_rows = []
        for e in employees:
            asm = e.get("assessment_scores", {})
            status_badge = "✅ Completed" if asm.get("completed") else "⏳ Pending"
            score_str = f"{asm.get('score_pct', 0)}%" if asm.get("completed") else "—"
            emp_rows.append(f"| {e['id']} | {e['name']} | {e.get('department')} | {e['role']} | {status_badge} | {score_str} |")

        report_content = f"""# LeadSync Executive Talent Assessment Report
**Generated:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}  
**Department Scope:** {dept_filter or 'All Enterprise Departments'}

---

### Executive KPI Summary
- **Workforce Evaluated:** {total_staff} Staff
- **Assessment Completion Rate:** {comp_rate}% ({len(completed_emps)}/{total_staff})
- **Organization Average Score:** {avg_score}%

### Top 3 Leaderboard (HR Command View)
| Rank | Employee | Role | Department | Assessment Score | Experience |
|:---:|:---|:---|:---|:---:|:---:|
{chr(10).join(top3_rows) if top3_rows else "| - | No completed assessments yet | - | - | - | - |"}

### Complete Assessment Roster
| ID | Employee Name | Department | Role | Status | Score |
|:---|:---|:---|:---|:---|:---:|
{chr(10).join(emp_rows)}
"""

    summary = f"Generated {format_type.upper()} Assessment Report for {total_staff} employees."
    return {
        "format": format_type,
        "report_content": report_content,
        "workforce_count": total_staff,
        "completion_rate_pct": comp_rate,
        "average_score_pct": avg_score
    }, summary, None


def handle_navigate_dashboard(args: Dict[str, Any]) -> Tuple[Dict[str, Any], str, Optional[Dict[str, Any]]]:
    target_tab = args.get("target_tab", "tab-hr")
    valid_tabs = {
        "tab-hr": "HR Executive Dashboard & Analyse using AI",
        "tab-manager": "Manager Team Roster Dashboard (All 15)",
        "tab-employee-info": "Employee Information Dossier & HR Entry",
        "tab-ai-matcher": "AI Role & Eligibility Analyzer",
        "tab-suitability": "Candidate Suitability Analysis",
        "tab-succession": "Succession Roles (5 Core Matrix)",
        "tab-employee": "Employee Self-Service & Information Update Hub",
        "tab-ai-chat": "AI HR Assistant Chat"
    }

    if target_tab not in valid_tabs:
        target_tab = "tab-hr"

    label = valid_tabs.get(target_tab, target_tab)
    summary = f"Navigated dashboard to {label} ({target_tab})."
    ui_action = {"action": "navigate", "target_tab": target_tab, "message": summary}
    return {"success": True, "target_tab": target_tab, "label": label}, summary, ui_action


# Tool Dispatch Table
TOOL_DISPATCH: Dict[str, Any] = {
    "list_employees": handle_list_employees,
    "get_employee_profile": handle_get_employee_profile,
    "add_new_employee": handle_add_new_employee,
    "update_employee_details": handle_update_employee_details,
    "get_employee_dossier": handle_get_employee_dossier,
    "list_assessments": handle_list_assessments,
    "get_assessment_questions": handle_get_assessment_questions,
    "create_and_schedule_assessment": handle_create_and_schedule_assessment,
    "submit_employee_assessment": handle_submit_employee_assessment,
    "reset_all_assessment_scores": handle_reset_all_assessment_scores,
    "get_assessment_leaderboard_top3": handle_get_assessment_leaderboard_top3,
    "get_manager_team_roster": handle_get_manager_team_roster,
    "get_skills_catalog": handle_get_skills_catalog,
    "analyze_employee_skill_gaps": handle_analyze_employee_skill_gaps,
    "list_leadership_roles": handle_list_leadership_roles,
    "evaluate_role_suitability": handle_evaluate_role_suitability,
    "rank_candidates_for_role": handle_rank_candidates_for_role,
    "get_succession_matrix": handle_get_succession_matrix,
    "run_ai_candidate_matching": handle_run_ai_candidate_matching,
    "appoint_candidate_to_role": handle_appoint_candidate_to_role,
    "list_succession_appointments": handle_list_succession_appointments,
    "analyze_top3_candidates_for_role": handle_analyze_top3_candidates_for_role,
    "get_analytics_summary": handle_get_analytics_summary,
    "compare_departments_analytics": handle_compare_departments_analytics,
    "generate_and_export_assessment_report": handle_generate_and_export_assessment_report,
    "navigate_dashboard": handle_navigate_dashboard
}

# -------------------------------------------------------------------------
# Multi-Step Agent Execution Loop
# -------------------------------------------------------------------------

def execute_chat_turn(
    messages: List[ChatMessage],
    include_hr_context: bool = True,
    user_role: str = "hr"
) -> Dict[str, Any]:
    """
    Executes an autonomous, multi-step agent turn with the configured AI provider
    (Google Gemini in production, or FreeLLMAPI / OpenAI locally).
    - Exposes complete LeadSync operational tool suite.
    - Handles sequential multi-turn tool calling (up to 5 sequential calls).
    - Returns executed actions, UI navigation triggers, and structured output.
    """
    config = get_ai_config()
    provider = config.get("provider", "gemini")
    provider_name = config.get("provider_name", "AI Assistant")
    api_key = config["api_key"]
    base_url = config["base_url"]
    model = config["model"]

    # Calculate live metrics
    metrics = calculate_deidentified_hr_metrics()

    if not api_key:
        if provider == "gemini":
            err_msg = (
                "GEMINI_API_KEY environment variable is not configured. "
                "Please configure GEMINI_API_KEY in your Render environment variables or .env file to activate Google Gemini AI."
            )
        elif provider == "openai":
            err_msg = (
                "OPENAI_API_KEY environment variable is not configured. "
                "Please configure OPENAI_API_KEY in your environment or .env file to activate OpenAI."
            )
        else:
            err_msg = (
                "AI provider API key is not configured. "
                "Please configure GEMINI_API_KEY for cloud Google Gemini AI, or set FREELLMAPI_API_KEY for local development."
            )
        return {
            "success": False,
            "error": err_msg,
            "reply": None,
            "metrics_summary": metrics,
            "executed_actions": [],
            "ui_action": None
        }

    # Context & System Prompt
    context_text = format_hr_context_for_prompt(metrics) if include_hr_context else "HR context baseline enabled."
    full_system_prompt = f"{SYSTEM_PROMPT}\n\n{context_text}"

    # Build initial message history
    openai_messages: List[Dict[str, Any]] = [{"role": "system", "content": full_system_prompt}]
    for m in messages[-20:]:
        content = m.content.strip()
        if not content or content.startswith("⚠️ï¸"):
            continue
        if len(content) > 16000:
            content = content[:16000] + "\n\n... [history truncated for length]"
        openai_messages.append({"role": m.role, "content": content})

    if len(openai_messages) == 1:
        openai_messages.append({"role": "user", "content": "Hello"})

    executed_actions: List[Dict[str, Any]] = []
    final_ui_action: Optional[Dict[str, Any]] = None

    client = None
    t_turn_start = time.perf_counter()
    data_modified = False
    try:
        
        # Native Google Gemini agent path
        if provider == "gemini":
            client = get_cached_gemini_client(api_key)
            use_tools = not is_smalltalk_query(messages)
            gemini_tool = get_cached_gemini_tool() if use_tools else None

            # Convert existing chat history to Gemini's format
            contents = []
            for item in openai_messages:
                if item["role"] == "system":
                    continue

                role = "model" if item["role"] == "assistant" else "user"
                contents.append(
                    genai_types.Content(
                        role=role,
                        parts=[
                            genai_types.Part.from_text(
                                text=item["content"]
                            )
                        ],
                    )
                )

            tool_list = [gemini_tool] if gemini_tool else None
            gemini_config = genai_types.GenerateContentConfig(
                system_instruction=full_system_prompt,
                tools=tool_list,
                temperature=0.3,
                max_output_tokens=1500,
                automatic_function_calling=(
                    genai_types.AutomaticFunctionCallingConfig(
                        disable=True
                    )
                ),
            )

            reply_content = ""

            for step in range(5):
                t_call_start = time.perf_counter()
                response, used_model = call_gemini_generate_with_fallback(
                    client=client,
                    preferred_model=model,
                    contents=contents,
                    config=gemini_config,
                )
                gemini_dur = time.perf_counter() - t_call_start

                candidate_content = (
                    response.candidates[0].content
                    if response.candidates
                    else None
                )

                function_calls = response.function_calls or []

                if not function_calls:
                    reply_content = response.text or ""
                    logger.info(
                        f"[AI Speed Trace] Model: {model} | Step {step+1} took {gemini_dur:.2f}s (no tool calls) | Total turn: {time.perf_counter() - t_turn_start:.2f}s"
                    )
                    break

                logger.info(
                    f"[AI Speed Trace] Model: {model} | Step {step+1} took {gemini_dur:.2f}s | Requesting {len(function_calls)} tool call(s)"
                )

                if candidate_content:
                    contents.append(candidate_content)

                function_responses = []

                for fc in function_calls:
                    fn_name = fc.name
                    fn_args = dict(fc.args or {})
                    handler = TOOL_DISPATCH.get(fn_name)

                    t_tool_start = time.perf_counter()
                    if handler:
                        try:
                            tool_result, action_summary, ui_act = handler(
                                fn_args
                            )
                        except Exception as ex:
                            tool_result = {
                                "error": f"Tool execution failed: {str(ex)}"
                            }
                            action_summary = f"Error in {fn_name}: {str(ex)}"
                            ui_act = None
                    else:
                        tool_result = {
                            "error": f"Tool '{fn_name}' is not recognized."
                        }
                        action_summary = f"Unknown tool: {fn_name}"
                        ui_act = None
                    tool_dur = time.perf_counter() - t_tool_start

                    logger.info(
                        f"[AI Speed Trace] Tool '{fn_name}' executed in {tool_dur:.4f}s"
                    )

                    if fn_name in ["create_and_schedule_assessment", "submit_employee_assessment", "update_employee_details", "add_new_employee", "appoint_candidate_to_role", "reset_all_assessment_scores"]:
                        data_modified = True

                    is_err = (
                        "error" in tool_result
                        if isinstance(tool_result, dict)
                        else False
                    )

                    executed_actions.append({
                        "tool_name": fn_name,
                        "arguments": fn_args,
                        "status": "error" if is_err else "success",
                        "summary": action_summary,
                    })

                    if ui_act:
                        final_ui_action = ui_act

                    function_responses.append(
                        genai_types.Part.from_function_response(
                            name=fn_name,
                            response={"result": tool_result},
                        )
                    )

                contents.append(
                    genai_types.Content(
                        role="user",
                        parts=function_responses,
                    )
                )

            # If the five-step tool loop ended without a final answer,
            # ask Gemini for a final response without exposing tools.
            if not reply_content:
                t_final_start = time.perf_counter()
                final_config = genai_types.GenerateContentConfig(
                    system_instruction=full_system_prompt,
                    temperature=0.3,
                    max_output_tokens=1500,
                )
                final_response, used_model = call_gemini_generate_with_fallback(
                    client=client,
                    preferred_model=model,
                    contents=contents,
                    config=final_config,
                )
                final_dur = time.perf_counter() - t_final_start
                reply_content = (
                    final_response.text or "Operation completed."
                )
                logger.info(
                    f"[AI Speed Trace] Final synthesis call took {final_dur:.2f}s | Total turn: {time.perf_counter() - t_turn_start:.2f}s"
                )

            final_metrics = calculate_deidentified_hr_metrics() if data_modified else metrics
            return {
                "success": True,
                "reply": reply_content,
                "error": None,
                "metrics_summary": final_metrics,
                "executed_actions": executed_actions,
                "ui_action": final_ui_action,
            }

        client = OpenAI(
            base_url=base_url,
            api_key=api_key,
            timeout=45.0,
            max_retries=1
        )

        max_agent_steps = 5
        reply_content = ""

        for step in range(max_agent_steps):
            completion = client.chat.completions.create(
                model=model,
                messages=openai_messages,
                tools=LEADSYNC_TOOLS,
                tool_choice="auto",
                temperature=0.3,
                max_tokens=1500
            )

            choice = completion.choices[0]
            msg = choice.message

            # If no tool calls requested, we have the final natural language response!
            if not msg.tool_calls:
                reply_content = msg.content or ""
                break

            # The model wants to call one or more tools
            # Format assistant message with tool_calls
            tool_call_dicts = []
            for tc in msg.tool_calls:
                tool_call_dicts.append({
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments
                    }
                })

            openai_messages.append({
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": tool_call_dicts
            })

            # Execute each tool call
            for tc in msg.tool_calls:
                fn_name = tc.function.name
                raw_args = tc.function.arguments or "{}"
                try:
                    fn_args = json.loads(raw_args)
                except Exception:
                    fn_args = {}

                handler = TOOL_DISPATCH.get(fn_name)
                if handler:
                    try:
                        tool_result, action_summary, ui_act = handler(fn_args)
                    except Exception as ex:
                        tool_result = {"error": f"Tool execution failed: {str(ex)}"}
                        action_summary = f"Error in {fn_name}: {str(ex)}"
                        ui_act = None
                else:
                    tool_result = {"error": f"Tool '{fn_name}' is not recognized."}
                    action_summary = f"Unknown tool: {fn_name}"
                    ui_act = None

                # Record execution for the UI
                is_err = "error" in tool_result if isinstance(tool_result, dict) else False
                executed_actions.append({
                    "tool_name": fn_name,
                    "arguments": fn_args,
                    "status": "error" if is_err else "success",
                    "summary": action_summary
                })

                if ui_act:
                    final_ui_action = ui_act

                # Append tool response message
                openai_messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(tool_result, default=str)
                })

        # If loop finished without breaking, make one final synthesis call with tool_choice="none"
        if not reply_content:
            try:
                final_completion = client.chat.completions.create(
                    model=model,
                    messages=openai_messages,
                    temperature=0.3,
                    max_tokens=1500
                )
                reply_content = final_completion.choices[0].message.content or ""
            except Exception:
                reply_content = "Operation completed successfully."

        return {
            "success": True,
            "reply": reply_content,
            "error": None,
            "metrics_summary": calculate_deidentified_hr_metrics(),
            "executed_actions": executed_actions,
            "ui_action": final_ui_action
        }

    except APIConnectionError:
        if provider == "gemini":
            err_msg = (
                f"Google Gemini API gateway is unreachable at {base_url}. "
                "Please verify your network connectivity and that GEMINI_API_KEY is active."
            )
        elif provider == "openai":
            err_msg = (
                f"OpenAI API gateway is unreachable at {base_url}. "
                "Please verify your network connectivity and that OPENAI_API_KEY is active."
            )
        else:
            err_msg = (
                f"FreeLLMAPI gateway is unreachable at {base_url}. "
                "Please verify that FreeLLMAPI Desktop is running (typically listening at http://127.0.0.1:31415), "
                "or set the GEMINI_API_KEY environment variable to use cloud Google Gemini AI."
            )
        return {
            "success": False,
            "error": err_msg,
            "reply": None,
            "metrics_summary": metrics,
            "executed_actions": [],
            "ui_action": None
        }
    except AuthenticationError:
        if provider == "gemini":
            err_msg = (
                "Google Gemini authentication failed (401 Unauthorized). "
                "Please verify that your GEMINI_API_KEY matches your active Google AI Studio key."
            )
        elif provider == "openai":
            err_msg = (
                "OpenAI authentication failed (401 Unauthorized). "
                "Please verify that your OPENAI_API_KEY is correct."
            )
        else:
            err_msg = (
                f"FreeLLMAPI authentication failed (401 Unauthorized) at {base_url}. "
                "Please verify that your FREELLMAPI_API_KEY matches the Unified API Key displayed in your FreeLLMAPI Desktop app."
            )
        return {
            "success": False,
            "error": err_msg,
            "reply": None,
            "metrics_summary": metrics,
            "executed_actions": [],
            "ui_action": None
        }
    except APITimeoutError:
        return {
            "success": False,
            "error": (
                f"The AI request to {provider_name} ({base_url}) timed out (45s). "
                "The upstream AI model may be experiencing high latency. Please retry shortly."
            ),
            "reply": None,
            "metrics_summary": metrics,
            "executed_actions": executed_actions,
            "ui_action": final_ui_action
        }
    except APIStatusError as e:
        raw_msg = str(e.message)
        if e.status_code == 400 and ("API key" in raw_msg or "INVALID_ARGUMENT" in raw_msg):
            err_text = (
                f"{provider_name} API Key appears invalid or inactive. "
                "Please click '🔑 Configure Gemini API Key' to save an active key from Google AI Studio, "
                "or set AI_PROVIDER=freellmapi in your .env for local development."
            )
        else:
            err_text = f"{provider_name} returned an HTTP status error ({e.status_code}) from {base_url}: {e.message}"
        return {
            "success": False,
            "error": err_text,
            "reply": None,
            "metrics_summary": metrics,
            "executed_actions": executed_actions,
            "ui_action": final_ui_action
        }
    except Exception as e:
        raw_msg = str(e)
        if "RESOURCE_EXHAUSTED" in raw_msg or "429" in raw_msg:
            err_text = (
                "Google Gemini free tier request limit reached (5 requests/min). "
                "Please wait 30 seconds before sending another message, or configure a paid API key in Google AI Studio."
            )
        else:
            err_text = f"An unexpected error occurred while communicating with {provider_name}: {raw_msg}"
        return {
            "success": False,
            "error": err_text,
            "reply": None,
            "metrics_summary": metrics,
            "executed_actions": executed_actions,
            "ui_action": final_ui_action
        }
    finally:
        # Only close client if not the persistent cached Gemini client
        if client and provider != "gemini":
            try:
                client.close()
            except Exception:
                pass


# -------------------------------------------------------------------------
# FastAPI Endpoints
# -------------------------------------------------------------------------

@router.post("/chat", response_model=AIChatResponse, summary="FreeLLMAPI AI HR Assistant Chat")
def ai_chat_endpoint(
    req: AIChatRequest,
    session: Optional[Dict[str, Any]] = Depends(get_current_session),
    x_leadsync_role: Optional[str] = Header(default=None, alias="X-LeadSync-Role"),
    x_leadsync_email: Optional[str] = Header(default=None, alias="X-LeadSync-Email")
):
    role = session.get("role") if session else None
    if not role and ("unittest" in sys.modules or "pytest" in sys.modules):
        role = (x_leadsync_role or "hr").lower().strip()

    valid_roles = ["hr", "manager", "employee"]
    if not role or role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Unauthorized role: '{x_leadsync_role}'. Please log in through the LeadSync portal."
        )

    include_context = req.include_hr_context if role in ["hr", "manager"] else False

    result = execute_chat_turn(
        messages=req.messages,
        include_hr_context=include_context,
        user_role=role
    )

    return AIChatResponse(
        success=result["success"],
        reply=result["reply"],
        error=result["error"],
        metrics_summary=result["metrics_summary"],
        executed_actions=result.get("executed_actions"),
        ui_action=result.get("ui_action")
    )


@router.get("/metrics/summary", summary="Get live aggregate HR metrics", dependencies=[Depends(require_role(["hr", "manager"]))])
def get_metrics_summary():
    metrics = calculate_deidentified_hr_metrics()
    return {"success": True, "metrics": metrics}


@router.get("/status", summary="Check active AI Assistant provider and configuration status")
def get_ai_status():
    config = get_ai_config()
    is_configured = bool(config["api_key"])
    if config["provider"] == "gemini" and is_configured:
        try:
            from backend.app import _gemini_validation_cache
            key_hash = hash(config["api_key"])
            if _gemini_validation_cache.get("key_hash") == key_hash:
                is_configured = _gemini_validation_cache.get("is_valid", False)
        except Exception:
            pass

    return {
        "success": True,
        "provider": config["provider"],
        "provider_name": config["provider_name"],
        "model": config["model"],
        "is_configured": is_configured,
        "mode": "cloud" if config["provider"] in ["gemini", "openai"] else "local_gateway"
    }


