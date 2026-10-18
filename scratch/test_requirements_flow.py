import urllib.request
import json
import os

BASE_URL = "http://127.0.0.1:8888"

def req(endpoint, data=None, method="GET"):
    url = f"{BASE_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode("utf-8") if data is not None else None
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request) as resp:
        return json.loads(resp.read().decode("utf-8"))

print("=== 1. Testing Assessment Reset ===")
reset_res = req("/api/assessments/reset", data={}, method="POST")
print("Reset response:", reset_res["message"])
assert reset_res["success"] == True

mgr_res = req("/api/results/manager")
all_zero = all(
    (e["assessment_scores"]["score_pct"] == 0 and e["assessment_scores"]["completed"] == False)
    for e in mgr_res["results"]
)
print(f"All 15 employee scores zeroed: {all_zero} (Count: {len(mgr_res['results'])})")
assert all_zero == True

top3_res = req("/api/results/top3")
print(f"Top 3 completed after reset: {len(top3_res['results'])} (Expected 0)")
assert len(top3_res["results"]) == 0

print("\n=== 2. Testing Manager Edit Employee ===")
update_payload = {
    "name": "Alex Rivera",
    "role": "Lead Systems Engineer",
    "department": "Engineering",
    "email": "alex.rivera.lead@leadsync.io",
    "experience_years": 4.5,
    "skills": {"Python": 95, "Architecture": 90, "Cloud/DevOps": 85, "DBMS": 88}
}
edit_res = req("/api/employees/EMP-001/update-info", data=update_payload, method="POST")
print("Manager edit employee response:", edit_res["employee"]["name"], "->", edit_res["employee"]["role"])
assert edit_res["employee"]["name"] == "Alex Rivera"
assert edit_res["employee"]["experience_years"] == 4.5

print("\n=== 3. Submitting Realistic Assessments for Candidates ===")
# Fetch questions for EMP-001
q_res = req("/api/assessments/ASM-2026-001/questions?seed=EMP-001")
questions = q_res["questions"]

# Look up questions in data_store to know answer_index
store_path = os.path.join(os.path.dirname(__file__), "..", "backend", "data_store.json")
with open(store_path, "r", encoding="utf-8") as f:
    store = json.load(f)
q_map = {q["id"]: q.get("answer_index", 0) for q in store.get("question_bank", [])}

# EMP-001 gets 19 correct (95%)
ans_001 = {q["id"]: q_map.get(q["id"], 0) for q in questions[:19]}
ans_001[questions[19]["id"]] = (q_map.get(questions[19]["id"], 0) + 1) % 4
sub_001 = req("/api/assessments/submit", data={"employee_id": "EMP-001", "assessment_id": "ASM-2026-001", "answers": ans_001}, method="POST")
print(f"EMP-001 score: {sub_001['scores']['score_pct']}% ({sub_001['scores']['correct_count']}/20 correct)")

# EMP-002 gets 17 correct (85%)
q_res_002 = req("/api/assessments/ASM-2026-001/questions?seed=EMP-002")
ans_002 = {q["id"]: q_map.get(q["id"], 0) for q in q_res_002["questions"][:17]}
for q in q_res_002["questions"][17:]:
    ans_002[q["id"]] = (q_map.get(q["id"], 0) + 1) % 4
sub_002 = req("/api/assessments/submit", data={"employee_id": "EMP-002", "assessment_id": "ASM-2026-001", "answers": ans_002}, method="POST")
print(f"EMP-002 score: {sub_002['scores']['score_pct']}% ({sub_002['scores']['correct_count']}/20 correct)")

# EMP-003 gets 15 correct (75%)
q_res_003 = req("/api/assessments/ASM-2026-001/questions?seed=EMP-003")
ans_003 = {q["id"]: q_map.get(q["id"], 0) for q in q_res_003["questions"][:15]}
for q in q_res_003["questions"][15:]:
    ans_003[q["id"]] = (q_map.get(q["id"], 0) + 1) % 4
sub_003 = req("/api/assessments/submit", data={"employee_id": "EMP-003", "assessment_id": "ASM-2026-001", "answers": ans_003}, method="POST")
print(f"EMP-003 score: {sub_003['scores']['score_pct']}% ({sub_003['scores']['correct_count']}/20 correct)")

print("\n=== 4. Verifying Manager Results & HR Top 3 Routing ===")
mgr_after = req("/api/results/manager")
print("Manager sees total employees:", len(mgr_after["results"]))
assert len(mgr_after["results"]) >= 15

top3_after = req("/api/results/top3")
print("HR Top 3 count:", len(top3_after["results"]))
assert len(top3_after["results"]) == 3
for r, emp in enumerate(top3_after["results"], 1):
    print(f"  Rank #{r}: {emp['name']} - Score: {emp['assessment_scores']['score_pct']}% ({emp['assessment_scores']['correct_count']}/20)")

print("\n=== 5. Testing HR AI Analysis of Top 3 -> Output ONE Eligible Employee ===")
ai_req = {"role_id": "ROLE-SSE"}
ai_res = req("/api/ai/analyze-top3-for-role", data=ai_req, method="POST")

winner = ai_res.get("one_eligible_employee") or ai_res.get("best_perfect_employee")
print("\n[WINNER] AI Selected ONE Eligible Employee:")
print(f"  Name: {winner['name']}")
print(f"  Employee ID: {winner['employee_id']}")
print(f"  Overall Match Fit: {winner['overall_score']}%")
print(f"  Skills Fit: {winner['dimension_scores']['skills_alignment']}%")
print(f"  Experience Fit: {winner['dimension_scores']['resume_experience_fit']}% ({winner['experience_years']} yrs)")
print(f"  Certifications Fit: {winner['dimension_scores']['certifications_match']}%")
print(f"  Assessment Marks Fit: {winner['dimension_scores']['assessment_marks_fit']}%")
print(f"  Readiness: {winner['readiness_status']}")
print(f"\nAI Decision Summary:\n  {ai_res.get('decision_summary')}")

print(f"\nTop 3 Contenders Evaluated in Matrix: {len(ai_res.get('top3_comparison', []))}")
for c in ai_res.get("top3_comparison", []):
    print(f"  - {c['name']}: {c['overall_score']}% ({c['readiness_status']})")

assert winner is not None
assert winner["name"] == "Alex Rivera"
assert len(ai_res.get("top3_comparison", [])) == 3
print("\n>>> ALL TEST VERIFICATIONS PASSED WITH FLYING COLORS! <<<")
