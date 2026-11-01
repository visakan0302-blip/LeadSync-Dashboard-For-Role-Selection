import unittest
from backend.database import Database
from backend.ai_matcher import score_assessment_fit, analyze_candidate_comprehensive_eligibility

class TestAssessmentAssignment(unittest.TestCase):
    def setUp(self):
        self.db = Database()

    def test_separate_assessment_assignment_subset(self):
        # Top 3 employees assigned
        asm_data = {
            "title": "Top 3 Specialized Systems Assessment",
            "description": "Exclusive assessment assigned to Top 3 candidates by skills, resume & certs.",
            "scheduled_date": "2026-10-23",
            "scheduled_time": "14:00",
            "duration_minutes": 30,
            "assigned_to": ["EMP-001", "EMP-002", "EMP-003"]
        }
        new_asm = self.db.create_assessment(asm_data)
        self.assertIsNotNone(new_asm.get("id"))
        self.assertEqual(new_asm.get("assigned_to"), ["EMP-001", "EMP-002", "EMP-003"])
        
        # Verify in all assessments
        all_asms = self.db.get_all_assessments()
        matching = [a for a in all_asms if a["id"] == new_asm["id"]]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]["assigned_to"], ["EMP-001", "EMP-002", "EMP-003"])

    def test_separate_assessment_assignment_single_employee(self):
        # Single employee assigned
        asm_data = {
            "title": "Alex Rivera Dedicated Evaluation",
            "description": "Assessment assigned separately to Alex Rivera.",
            "scheduled_date": "2026-10-24",
            "scheduled_time": "11:00",
            "duration_minutes": 45,
            "assigned_to": ["EMP-001"]
        }
        new_asm = self.db.create_assessment(asm_data)
        self.assertEqual(new_asm.get("assigned_to"), ["EMP-001"])

    def test_unattended_assessment_returns_zero_score(self):
        emp_unattended = {
            "id": "EMP-999",
            "name": "Test Candidate",
            "assessment_scores": {
                "completed": False,
                "score_pct": 0,
                "correct_count": 0,
                "total_questions": 20,
                "category_scores": {}
            }
        }
        fit_res = score_assessment_fit(emp_unattended, {"Python": 0.5, "DBMS": 0.5})
        self.assertEqual(fit_res["score"], 0)
        self.assertFalse(fit_res["completed"])
        self.assertEqual(fit_res["overall_pct"], 0)

    def test_unattended_comprehensive_eligibility_assessment_pillar_zero(self):
        res = analyze_candidate_comprehensive_eligibility(
            all_employees=self.db.get_all_employees(),
            role_id="ROLE-SSE",
            employee_id="EMP-001",
            leadership_roles=self.db.leadership_roles,
            compare_all_employees=True
        )
        target = res["target_candidate"]
        self.assertEqual(target["dimension_scores"]["assessment_marks_fit"], 0)
        self.assertEqual(target["assessment_details"]["score_pct"], 0)
        self.assertEqual(target["assessment_details"]["correct_count"], 0)
        self.assertFalse(target["assessment_details"]["completed"])

        for cand in res.get("all_ranked_candidates", []):
            self.assertEqual(cand["dimension_scores"]["assessment_marks_fit"], 0)
            self.assertEqual(cand["assessment_details"]["score_pct"], 0)
            self.assertEqual(cand["assessment_details"]["correct_count"], 0)
            self.assertFalse(cand["assessment_details"]["completed"])

    def tearDown(self):
        self.db.assessments = []
        self.db.save()

if __name__ == '__main__':
    unittest.main()
