import json
import os
import random
from typing import List, Dict, Any, Optional
from backend.data_seed import INITIAL_EMPLOYEES, LEADERSHIP_ROLES, QUESTION_BANK, INITIAL_ASSESSMENTS

DATA_FILE = os.path.join(os.path.dirname(__file__), "data_store.json")

class Database:
    def __init__(self):
        self.employees: List[Dict[str, Any]] = []
        self.leadership_roles: List[Dict[str, Any]] = []
        self.question_bank: List[Dict[str, Any]] = []
        self.assessments: List[Dict[str, Any]] = []
        self.appointments: List[Dict[str, Any]] = []
        self.load()

    def load(self):
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.employees = data.get("employees", INITIAL_EMPLOYEES)
                    self.leadership_roles = data.get("leadership_roles", LEADERSHIP_ROLES)
                    self.question_bank = data.get("question_bank", QUESTION_BANK)
                    self.assessments = data.get("assessments", INITIAL_ASSESSMENTS)
                    self.appointments = data.get("appointments", [])
                    return
            except Exception as e:
                print(f"Error loading {DATA_FILE}: {e}. Falling back to seeds.")

        self.employees = [dict(emp) for emp in INITIAL_EMPLOYEES]
        self.leadership_roles = [dict(r) for r in LEADERSHIP_ROLES]
        self.question_bank = [dict(q) for q in QUESTION_BANK]
        self.assessments = [dict(a) for a in INITIAL_ASSESSMENTS]
        self.appointments = []
        self.save()

    def save(self):
        try:
            with open(DATA_FILE, "w", encoding="utf-8") as f:
                json.dump({
                    "employees": self.employees,
                    "leadership_roles": self.leadership_roles,
                    "question_bank": self.question_bank,
                    "assessments": self.assessments,
                    "appointments": self.appointments
                }, f, indent=2)
        except Exception as e:
            print(f"Error saving {DATA_FILE}: {e}")

    def reset_to_seeds(self):
        import copy
        self.employees = copy.deepcopy(INITIAL_EMPLOYEES)
        for emp in self.employees:
            emp["assessment_scores"] = {
                "completed": False,
                "date": None,
                "score_pct": 0,
                "correct_count": 0,
                "total_questions": 20,
                "category_scores": {}
            }
            emp["appointed_role"] = None
        self.leadership_roles = copy.deepcopy(LEADERSHIP_ROLES)
        self.question_bank = copy.deepcopy(QUESTION_BANK)
        self.assessments = []
        self.appointments = []
        self.save()

    # --- Employees ---
    def get_all_employees(self) -> List[Dict[str, Any]]:
        return self.employees

    def get_employee(self, employee_id: str) -> Optional[Dict[str, Any]]:
        for emp in self.employees:
            if emp["id"].lower() == employee_id.lower():
                return emp
        return None

    def add_employee(self, emp_data: Dict[str, Any]) -> Dict[str, Any]:
        new_num = len(self.employees) + 1
        new_id = f"EMP-{new_num:03d}"
        
        # derive avatar initials
        parts = emp_data["name"].strip().split()
        avatar = (parts[0][0] + (parts[-1][0] if len(parts) > 1 else "")).upper()

        new_emp = {
            "id": new_id,
            "name": emp_data["name"],
            "role": emp_data["role"],
            "department": emp_data.get("department", "Engineering"),
            "email": emp_data.get("email", f"{emp_data['name'].lower().replace(' ', '.')}@leadsync.io"),
            "experience_years": float(emp_data.get("experience_years", 0.0)),
            "avatar": avatar,
            "bio": emp_data.get("bio", f"Employee in {emp_data['role']} awaiting HR evaluation."),
            "skills": emp_data.get("skills", {}),
            "projects": emp_data.get("projects", []),
            "certifications": emp_data.get("certifications", []),
            "education": emp_data.get("education", "Credentials on file"),
            "assessment_scores": {
                "completed": False,
                "date": None,
                "score_pct": 0,
                "correct_count": 0,
                "total_questions": 20,
                "category_scores": {}
            }
        }
        self.employees.append(new_emp)
        self.save()
        return new_emp

    def update_employee_info(self, employee_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        emp = self.get_employee(employee_id)
        if not emp:
            raise ValueError(f"Employee {employee_id} not found")

        if "name" in data and data["name"]:
            emp["name"] = str(data["name"]).strip()
            parts = emp["name"].split()
            if parts:
                emp["avatar"] = (parts[0][0] + (parts[-1][0] if len(parts) > 1 else "")).upper()
        if "role" in data and data["role"]:
            emp["role"] = str(data["role"]).strip()
        if "department" in data and data["department"]:
            emp["department"] = str(data["department"]).strip()
        if "email" in data and data["email"]:
            emp["email"] = str(data["email"]).strip()
        if "experience_years" in data:
            emp["experience_years"] = float(data["experience_years"])
        if "skills" in data:
            emp["skills"] = data["skills"]
        if "certifications" in data:
            emp["certifications"] = data["certifications"]
        if "resume" in data:
            emp["resume"] = data["resume"]
        if "assessment_scores" in data:
            emp["assessment_scores"] = data["assessment_scores"]
        if "projects" in data:
            emp["projects"] = data["projects"]
        if "bio" in data:
            emp["bio"] = data["bio"]
        if "education" in data:
            emp["education"] = data["education"]

        self.save()
        return emp

    def reset_assessment_scores(self) -> Dict[str, Any]:
        """
        Resets assessment scores for all employees back to zero (unattended state),
        and clears scheduled assessments so HR can create and assign a new assessment.
        """
        for emp in self.employees:
            emp["assessment_scores"] = {
                "completed": False,
                "date": None,
                "score_pct": 0,
                "correct_count": 0,
                "total_questions": 20,
                "category_scores": {}
            }
            emp["appointed_role"] = None
        self.assessments = []
        self.appointments = []
        self.save()
        return {"success": True, "count": len(self.employees)}

    # --- Assessments ---
    def get_all_assessments(self) -> List[Dict[str, Any]]:
        return self.assessments

    def create_assessment(self, data: Dict[str, Any]) -> Dict[str, Any]:
        count = len(self.assessments) + 1
        new_id = f"ASM-2026-{count:03d}"
        assigned = data.get("assigned_to", [])
        if not assigned or "all" in assigned:
            assigned = [emp["id"] for emp in self.employees]

        new_asm = {
            "id": new_id,
            "title": data["title"],
            "description": data.get("description", "Evaluation of Python, C, Java, DBMS, Technical, Communication, and Aptitude."),
            "scheduled_date": data["scheduled_date"],
            "scheduled_time": data["scheduled_time"],
            "duration_minutes": int(data.get("duration_minutes", 30)),
            "questions_count": 20,
            "created_by": "HR Team (Admin)",
            "created_at": "2026-10-15T21:40:00",
            "assigned_to": assigned,
            "status": "Active"
        }
        self.assessments.append(new_asm)
        self.save()
        return new_asm

    def get_20_questions(self, seed_val: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Dynamically generates exactly 20 questions balancing categories:
        Python (3), C (3), Java (3), DBMS (3), Other Tech (3), Communication (3), Aptitude (2) = 20 questions.
        """
        by_category: Dict[str, List[Dict[str, Any]]] = {}
        for q in self.question_bank:
            cat = q.get("category", "General")
            by_category.setdefault(cat, []).append(q)

        rng = random.Random(seed_val) if seed_val else random.Random()
        
        target_counts = {
            "Python": 3,
            "C": 3,
            "Java": 3,
            "DBMS": 3,
            "Other Technical Skills": 3,
            "Communication": 3,
            "Aptitude": 2
        }

        selected: List[Dict[str, Any]] = []
        for cat, req_count in target_counts.items():
            pool = by_category.get(cat, [])
            if pool:
                chosen = rng.sample(pool, min(len(pool), req_count))
                selected.extend(chosen)

        # In case some category is short, top up to 20 from remaining
        if len(selected) < 20:
            remaining = [q for q in self.question_bank if q not in selected]
            needed = 20 - len(selected)
            selected.extend(rng.sample(remaining, min(len(remaining), needed)))

        rng.shuffle(selected)
        return selected[:20]

    def submit_assessment_answers(self, employee_id: str, answers: Dict[str, int]) -> Dict[str, Any]:
        emp = self.get_employee(employee_id)
        if not emp:
            raise ValueError(f"Employee {employee_id} not found")

        # Map questions
        q_map = {q["id"]: q for q in self.question_bank}
        
        correct_count = 0
        cat_correct: Dict[str, int] = {}
        cat_totals: Dict[str, int] = {}

        for q_id, chosen_idx in answers.items():
            if q_id in q_map:
                q = q_map[q_id]
                cat = q.get("category", "General")
                cat_totals[cat] = cat_totals.get(cat, 0) + 1
                if chosen_idx == q["answer_index"]:
                    correct_count += 1
                    cat_correct[cat] = cat_correct.get(cat, 0) + 1

        total_ans = len(answers) if answers else 20
        score_pct = int(round((correct_count / max(1, total_ans)) * 100))

        cat_scores = {}
        for cat, tot in cat_totals.items():
            c = cat_correct.get(cat, 0)
            cat_scores[cat] = int(round((c / max(1, tot)) * 100))

        emp["assessment_scores"] = {
            "completed": True,
            "date": "2026-10-15",
            "score_pct": score_pct,
            "correct_count": correct_count,
            "total_questions": total_ans,
            "category_scores": cat_scores
        }
        self.save()
        return emp["assessment_scores"]

    # --- Result Filtering for Dashboards ---
    def get_top_3_results(self) -> List[Dict[str, Any]]:
        """
        Requirement: After completion, only the TOP THREE employee results
        should be displayed on the HR dashboard.
        """
        # Filter completed assessments and sort descending by score_pct, then experience
        scored = [e for e in self.employees if e.get("assessment_scores", {}).get("completed", False)]
        scored.sort(key=lambda x: (
            x["assessment_scores"].get("score_pct", 0),
            x.get("experience_years", 0)
        ), reverse=True)
        return scored[:3]

    def get_all_results_for_manager(self) -> List[Dict[str, Any]]:
        """
        Requirement: While the Manager dashboard should display the results
        of ALL 15 employees (and any new additions).
        """
        return self.employees

    # --- Appointments & Succession Decisions ---
    def add_appointment(self, appt_data: Dict[str, Any]) -> Dict[str, Any]:
        from datetime import datetime
        appt_record = {
            "id": f"APPT-{len(self.appointments) + 1:03d}",
            "employee_id": appt_data["employee_id"],
            "role_id": appt_data["role_id"],
            "role_title": appt_data["role_title"],
            "appointed_by": "HR Talent Command (AI Validated)",
            "decision_notes": appt_data.get("decision_notes", "Formally appointed following LeadSync AI multi-dimensional match validation."),
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        self.appointments.append(appt_record)
        
        # Optionally update employee's succession readiness tag
        emp = self.get_employee(appt_data["employee_id"])
        if emp:
            emp["appointed_role"] = appt_data["role_title"]
        self.save()
        return appt_record

    def get_all_appointments(self) -> List[Dict[str, Any]]:
        return self.appointments

db = Database()
