"""
LeadSync Role Suitability Analysis & Succession Planning Engine
Evaluates employee suitability across the 5 Leadership Succession Roles:
1. Senior Software Engineer
2. AI/ML Engineer
3. DevOps Engineer
4. Database Administrator
5. Project Team Leader (Project Manager)
"""

from typing import Dict, List, Any, Optional

# Keywords that give bonus relevance to projects for each role
ROLE_PROJECT_KEYWORDS = {
    "ROLE-SSE": ["architecture", "microservices", "scalable", "concurrency", "backend", "full stack", "api", "systems", "refactor", "optimization"],
    "ROLE-AIML": ["machine learning", "ml", "ai", "model", "predictor", "pytorch", "neural", "scoring", "embeddings", "stats", "data science"],
    "ROLE-DEVOPS": ["kubernetes", "docker", "ci/cd", "pipeline", "cloud", "aws", "terraform", "monitoring", "prometheus", "canary", "infrastructure", "gitops"],
    "ROLE-DBA": ["database", "sql", "sharding", "postgresql", "oracle", "partitioning", "indexing", "failover", "replication", "deadlock", "backup", "rto"],
    "ROLE-PM": ["sprint", "agile", "coordination", "stakeholder", "roadmap", "timeline", "scrum", "cross-functional", "delivery", "client", "leadership"]
}

def calculate_skills_match(candidate_skills: Dict[str, int], benchmark_skills: Dict[str, int]) -> Dict[str, Any]:
    """
    Computes percentage match between candidate skills and benchmark requirements.
    """
    total_benchmark = 0
    total_achieved = 0
    skill_breakdown = {}

    for skill, bench_val in benchmark_skills.items():
        cand_val = candidate_skills.get(skill, 0)
        # Cap at 100 for ratio, but can credit high performance
        ratio = min(1.1, cand_val / max(1, bench_val))
        total_benchmark += bench_val
        total_achieved += (cand_val * (bench_val / 100.0))
        skill_breakdown[skill] = {
            "candidate": cand_val,
            "benchmark": bench_val,
            "gap": cand_val - bench_val
        }

    match_pct = int(round((total_achieved / max(1, total_benchmark)) * 100))
    return {
        "score": min(100, max(0, match_pct)),
        "breakdown": skill_breakdown
    }

def calculate_project_relevance(projects: List[Dict[str, Any]], role_id: str) -> int:
    """
    Evaluates project count, tech stack, and keyword relevance to the target role.
    """
    if not projects:
        return 0

    keywords = ROLE_PROJECT_KEYWORDS.get(role_id, [])
    relevance_hits = 0
    total_projects = len(projects)

    for p in projects:
        text = f"{p.get('title', '')} {p.get('description', '')} {p.get('impact', '')} {' '.join(p.get('tech_stack', []))}".lower()
        hits = sum(1 for kw in keywords if kw in text)
        relevance_hits += hits

    # Score base: 50 + hits*12 + project_count*10 capped at 100
    score = 50 + (relevance_hits * 10) + (total_projects * 8)
    return min(100, max(0, score))

def calculate_experience_score(candidate_years: float, target_years: float) -> int:
    """
    Calculates seniority and experience fit ratio.
    """
    if candidate_years <= 0:
        return 0
    ratio = candidate_years / max(1.0, target_years)
    if ratio >= 1.2:
        return 100
    elif ratio >= 1.0:
        return int(round(90 + (ratio - 1.0) * 50))
    elif ratio >= 0.75:
        return int(round(75 + (ratio - 0.75) * 60))
    elif ratio >= 0.5:
        return int(round(55 + (ratio - 0.5) * 80))
    else:
        return int(round(ratio * 100))

def calculate_assessment_fit(emp: Dict[str, Any], role_id: str) -> int:
    """
    Weighs assessment scores according to role priority.
    """
    asm = emp.get("assessment_scores", {})
    if not asm or not asm.get("completed", False):
        return 0  # 0% if pending or uncompleted

    base_pct = asm.get("score_pct", 0)
    cat_scores = asm.get("category_scores", {})

    # Role specific assessment adjustments
    if role_id == "ROLE-SSE":
        tech_avg = (cat_scores.get("Java", base_pct) + cat_scores.get("Python", base_pct) + cat_scores.get("Other Tech", base_pct)) / 3
        return int(round(base_pct * 0.5 + tech_avg * 0.5))
    elif role_id == "ROLE-AIML":
        py = cat_scores.get("Python", base_pct)
        apt = cat_scores.get("Aptitude", base_pct)
        return int(round(py * 0.5 + apt * 0.3 + base_pct * 0.2))
    elif role_id == "ROLE-DEVOPS":
        tech = cat_scores.get("Other Tech", base_pct)
        apt = cat_scores.get("Aptitude", base_pct)
        return int(round(tech * 0.6 + apt * 0.2 + base_pct * 0.2))
    elif role_id == "ROLE-DBA":
        dbms = cat_scores.get("DBMS", base_pct)
        tech = cat_scores.get("Other Tech", base_pct)
        return int(round(dbms * 0.7 + tech * 0.15 + base_pct * 0.15))
    elif role_id == "ROLE-PM":
        comm = cat_scores.get("Communication", base_pct)
        apt = cat_scores.get("Aptitude", base_pct)
        return int(round(comm * 0.6 + apt * 0.25 + base_pct * 0.15))
    
    return base_pct

def evaluate_candidate_for_role(emp: Dict[str, Any], role: Dict[str, Any], overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Evaluates one candidate against a specific role with optional what-if overrides.
    """
    overrides = overrides or {}

    # Experience
    exp_years = float(overrides.get("override_experience", emp.get("experience_years", 3.0)))
    target_exp = float(role.get("target_experience_years", 4.0))
    exp_score = calculate_experience_score(exp_years, target_exp)

    # Skills
    skills = dict(emp.get("skills", {}))
    if overrides.get("override_skills"):
        skills.update(overrides["override_skills"])
    skills_match = calculate_skills_match(skills, role.get("benchmark_skills", {}))

    # Projects
    projects = list(emp.get("projects", []))
    if overrides.get("override_projects_count") is not None:
        p_count = int(overrides["override_projects_count"])
        # adjust simulated projects
        if p_count > len(projects):
            projects = projects + [{"title": f"Simulated Project {i}", "tech_stack": list(role.get("benchmark_skills", {}).keys())} for i in range(p_count - len(projects))]
        elif p_count < len(projects):
            projects = projects[:p_count]
    project_score = calculate_project_relevance(projects, role["id"])

    # Assessment
    if overrides.get("override_assessment_score") is not None:
        asm_score = int(overrides["override_assessment_score"])
    else:
        asm_score = calculate_assessment_fit(emp, role["id"])

    # Weighted Overall Calculation
    # Skills: 35%, Projects: 25%, Assessment: 25%, Experience: 15%
    overall_score = int(round(
        (skills_match["score"] * 0.35) +
        (project_score * 0.25) +
        (asm_score * 0.25) +
        (exp_score * 0.15)
    ))
    overall_score = min(100, max(0, overall_score))

    # Determine Readiness Tier
    if overall_score >= 88:
        readiness_status = "Ready Now"
        status_color = "emerald"
        timeframe = "Immediate / 0-3 Months"
    elif overall_score >= 75:
        readiness_status = "Ready in 6-12 Months"
        status_color = "cyan"
        timeframe = "6-12 Months with Mentor"
    elif overall_score >= 60:
        readiness_status = "Ready in 12-24 Months"
        status_color = "amber"
        timeframe = "12-24 Months with Targeted Upskilling"
    else:
        readiness_status = "High Potential / Foundational"
        status_color = "slate"
        timeframe = "Long-Term Growth Pipeline"

    # Analyze Strengths and Gaps
    strengths = []
    gaps = []
    for skill, data in skills_match["breakdown"].items():
        if data["gap"] >= 0:
            strengths.append(f"Exceeds/Meets {skill} benchmark ({data['candidate']}% vs {data['benchmark']}%)")
        elif data["gap"] <= -10:
            gaps.append(f"{skill} proficiency gap of {abs(data['gap'])} points ({data['candidate']}% vs {data['benchmark']}%)")

    if exp_years >= target_exp:
        strengths.append(f"Tenure seniority ({exp_years} yrs) meets target requirement ({target_exp} yrs)")
    else:
        gaps.append(f"Experience ({exp_years} yrs) is below target seniority ({target_exp} yrs)")

    if project_score >= 80:
        strengths.append("High project alignment with verified production impact")
    elif project_score < 65:
        gaps.append("Needs more demonstrated leadership in domain-specific projects")

    # Generate AI Recommendation Narrative
    top_strength = strengths[0] if strengths else "Consistent technical foundation"
    primary_gap = gaps[0] if gaps else "Continue current high-impact trajectory"

    ai_recommendation = (
        f"{emp.get('name')} shows an overall suitability score of {overall_score}% for {role['title']}. "
        f"Key strength: {top_strength}. "
        f"Development priority: {primary_gap}. "
        f"Recommended trajectory: {readiness_status} ({timeframe})."
    )

    return {
        "employee_id": emp["id"],
        "employee_name": emp.get("name"),
        "current_role": emp.get("role"),
        "role_id": role["id"],
        "role_title": role["title"],
        "overall_score": overall_score,
        "readiness_status": readiness_status,
        "status_color": status_color,
        "timeframe": timeframe,
        "dimension_scores": {
            "skills_match": skills_match["score"],
            "project_relevance": project_score,
            "assessment_score": asm_score,
            "experience_fit": exp_score
        },
        "skills_breakdown": skills_match["breakdown"],
        "strengths": strengths[:3],
        "gaps": gaps[:3],
        "ai_recommendation": ai_recommendation
    }

def rank_employees_for_role(employees: List[Dict[str, Any]], role: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Ranks all employees for a specific role and orders by suitability score.
    """
    results = [evaluate_candidate_for_role(emp, role) for emp in employees]
    results.sort(key=lambda r: r["overall_score"], reverse=True)
    return results

def get_succession_matrix_all_roles(employees: List[Dict[str, Any]], roles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generates succession planning overview for the 5 leadership roles.
    """
    matrix = []
    for role in roles:
        ranked = rank_employees_for_role(employees, role)
        appointed_count_for_role = sum(
            1 for e in employees 
            if e.get("appointed_role") and (e.get("appointed_role") == role["title"] or e.get("appointed_role") == role["id"])
        )
        ready_now_count = max(appointed_count_for_role, sum(1 for r in ranked if r["overall_score"] >= 85))
        near_ready_count = sum(1 for r in ranked if 70 <= r["overall_score"] < 85)

        bench_health = "Strong" if ready_now_count >= 1 and near_ready_count >= 2 else ("Moderate" if ready_now_count >= 1 or near_ready_count >= 2 else "Vulnerable")

        matrix.append({
            "role_id": role["id"],
            "role_title": role["title"],
            "department": role["department"],
            "target_experience_years": role["target_experience_years"],
            "bench_health": bench_health,
            "ready_now_count": ready_now_count,
            "near_ready_count": near_ready_count,
            "top_candidates": ranked[:3],  # Top 3 successors
            "total_candidates_evaluated": len(employees)
        })
    return matrix
