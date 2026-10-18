from typing import List, Dict, Optional, Any, Literal
from pydantic import BaseModel, Field

class ProjectModel(BaseModel):
    title: str
    role: str
    duration: str
    description: str
    tech_stack: List[str]
    impact: str

class AssessmentScoreModel(BaseModel):
    completed: bool = False
    date: Optional[str] = None
    score_pct: int = 0
    correct_count: int = 0
    total_questions: int = 20
    category_scores: Dict[str, int] = Field(default_factory=dict)

class EmployeeCreate(BaseModel):
    name: str
    role: str
    department: str
    email: str
    experience_years: float
    bio: Optional[str] = ""
    skills: Dict[str, int] = Field(default_factory=dict)
    projects: List[ProjectModel] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)
    education: Optional[str] = ""

class AssessmentCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    scheduled_date: str
    scheduled_time: str
    duration_minutes: int = 30
    assigned_to: List[str] = Field(default_factory=list)

class AssessmentSubmit(BaseModel):
    employee_id: str
    assessment_id: str
    answers: Dict[str, int]  # question_id -> selected option index

class SuitabilityEvaluateRequest(BaseModel):
    employee_id: Optional[str] = None
    role_id: Optional[str] = None
    # Optional override fields for manual HR what-if simulation:
    override_experience: Optional[float] = None
    override_skills: Optional[Dict[str, int]] = None
    override_assessment_score: Optional[int] = None
    override_projects_count: Optional[int] = None

class CustomRoleCriteria(BaseModel):
    role_id: Optional[str] = "CUSTOM"
    title: Optional[str] = "Senior Engineer"
    department: Optional[str] = "Engineering"
    target_experience_years: Optional[float] = 3.5
    benchmark_skills: Optional[Dict[str, int]] = None
    priority_assessment_categories: Optional[Dict[str, float]] = None
    project_keywords: Optional[List[str]] = None
    weights: Optional[Dict[str, float]] = None
    department_filter: Optional[str] = None
    job_description_text: Optional[str] = None

class AIMatchRequest(BaseModel):
    role_id: Optional[str] = "ROLE-SSE"
    custom_role: Optional[CustomRoleCriteria] = None
    department_filter: Optional[str] = None

class JobDescriptionParseRequest(BaseModel):
    job_description_text: str

class AppointCandidateRequest(BaseModel):
    employee_id: str
    role_id: str
    role_title: str
    decision_notes: Optional[str] = ""

class ComprehensiveAIAnalyzeRequest(BaseModel):
    role_id: str = "ROLE-SSE"
    custom_role_title: Optional[str] = None
    target_experience_years: Optional[float] = 4.0
    employee_id: str = "EMP-001"
    selected_skills: Optional[List[str]] = None
    custom_skills_dict: Optional[Dict[str, int]] = None
    certifications: Optional[List[Any]] = None
    certificate_images: Optional[List[Any]] = None
    resume_info: Optional[Dict[str, Any]] = None
    assessment_marks: Optional[Dict[str, Any]] = None
    experience_years: Optional[float] = None
    compare_all_employees: Optional[bool] = False
    candidate_subset_ids: Optional[List[str]] = None
    evaluate_top_3_only: Optional[bool] = False

class CertificateVerifyRequest(BaseModel):
    title: Optional[str] = "Professional Certification"
    filename: Optional[str] = ""
    issuer: Optional[str] = "Accredited Body"
    data: Optional[str] = None

class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(..., min_length=1, max_length=32000, description="Chat message content")

class AIChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_length=1, max_length=50, description="Bounded multi-turn chat message history")
    include_hr_context: Optional[bool] = Field(default=True, description="Whether to include de-identified aggregated HR metrics")

class AIChatResponse(BaseModel):
    success: bool
    reply: Optional[str] = None
    error: Optional[str] = None
    metrics_summary: Optional[Dict[str, Any]] = None
    executed_actions: Optional[List[Dict[str, Any]]] = None
    ui_action: Optional[Dict[str, Any]] = None
