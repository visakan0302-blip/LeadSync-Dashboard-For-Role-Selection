import urllib.request
import json
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE_URL = "http://127.0.0.1:8888"

def request(path, method="GET", data=None):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
        body = json.dumps(data).encode("utf-8")
    else:
        body = None
    with urllib.request.urlopen(req, data=body) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))

def run_tests():
    print("==================================================")
    print(" RUNNING LEADSYNC VERIFICATION SUITE")
    print("==================================================")

    # 1. Reset Database to Seeds
    print("\n[Step 1] Calling POST /api/reset...")
    status, res = request("/api/reset", method="POST")
    assert status == 200, f"Reset failed: {res}"
    print("  -> Reset Success:", res["message"])

    # 2. Verify 0 Active Assessments and 0 Highest Assessment Score
    print("\n[Step 2] Verifying Assessments & Top 3 after reset...")
    _, asms = request("/api/assessments")
    active_count = len(asms.get("assessments", []))
    print(f"  -> Active assessments count: {active_count}")
    assert active_count == 0, f"Expected 0 active assessments, got {active_count}"

    _, top3 = request("/api/results/top3")
    top3_count = len(top3.get("results", []))
    print(f"  -> Top 3 results count: {top3_count}")
    assert top3_count == 0, f"Expected 0 top 3 results, got {top3_count}"

    _, mgr = request("/api/results/manager")
    mgr_emps = mgr.get("results", [])
    print(f"  -> Manager total employees count: {len(mgr_emps)}")
    assert len(mgr_emps) == 15, f"Expected 15 employees, got {len(mgr_emps)}"
    for emp in mgr_emps:
        asm_score = emp.get("assessment_scores", {})
        assert asm_score.get("completed") is False, f"Employee {emp['id']} completed flag is not False"
        assert asm_score.get("score_pct") == 0, f"Employee {emp['id']} score_pct is not 0"
        assert asm_score.get("correct_count") == 0, f"Employee {emp['id']} correct_count is not 0"
    print("  -> ALL 15 employees in Manager view confirmed with score 0% and completed=False")

    # 3. HR Assigns New Assessment Test
    print("\n[Step 3] HR creates and assigns a new Assessment Test...")
    status, create_res = request("/api/assessments", method="POST", data={
        "title": "LeadSync 2026 Core Engineering & Leadership Assessment",
        "description": "20 Questions across Python, C, Java, DBMS, and Leadership.",
        "scheduled_date": "2026-10-20",
        "scheduled_time": "10:00",
        "duration_minutes": 30,
        "assigned_to": [e["id"] for e in mgr_emps]
    })
    assert status == 200
    asm_id = create_res["assessment"]["id"]
    print(f"  -> HR created assessment ID: {asm_id}")

    _, asms_after_assign = request("/api/assessments")
    active_after = len(asms_after_assign.get("assessments", []))
    print(f"  -> Active assessments count after HR assignment: {active_after}")
    assert active_after == 1, f"Expected 1 active assessment, got {active_after}"

    # 4. Employee attends and takes the test
    print("\n[Step 4] Employee attends the assessment test and scores...")
    _, q_res = request(f"/api/assessments/{asm_id}/questions?seed=EMP-001")
    questions = q_res.get("questions", [])
    assert len(questions) == 20, f"Expected 20 questions, got {len(questions)}"

    from backend.data_seed import QUESTION_BANK
    ans_map = {q["id"]: q["answer_index"] for q in QUESTION_BANK}

    # Score 19 correct out of 20 = 95%
    answers = {}
    for i, q in enumerate(questions):
        correct_idx = ans_map.get(q["id"], 0)
        answers[q["id"]] = correct_idx if i < 19 else ((correct_idx + 1) % 4)

    status, sub_res = request("/api/assessments/submit", method="POST", data={
        "employee_id": "EMP-001",
        "assessment_id": asm_id,
        "answers": answers
    })
    assert status == 200
    emp_score = sub_res["scores"]["score_pct"]
    print(f"  -> EMP-001 submitted test: score = {emp_score}%, correct = {sub_res['scores']['correct_count']}/20")
    assert emp_score == 95, f"Expected 95%, got {emp_score}%"

    # Check HR Top 3 and Manager View
    _, top3_after = request("/api/results/top3")
    assert len(top3_after["results"]) == 1
    assert top3_after["results"][0]["assessment_scores"]["score_pct"] == 95
    print("  -> HR Top 3 Leaderboard shows EMP-001 with 95%")

    _, mgr_after = request("/api/results/manager")
    emp1_mgr = next(e for e in mgr_after["results"] if e["id"] == "EMP-001")
    assert emp1_mgr["assessment_scores"]["completed"] is True
    assert emp1_mgr["assessment_scores"]["score_pct"] == 95
    print("  -> Manager View shows EMP-001 with 95% and completed=True")

    # 5. Now Reset Seed Data (from HR or Employee Dashboard)
    print("\n[Step 5] Triggering Reset Seed Data (Resetting back to Zero)...")
    status, reset_res = request("/api/reset", method="POST")
    assert status == 200
    print("  -> Reset Seed Data triggered successfully:", reset_res["message"])

    # 6. Verify Active Assessment is 0, Highest Score is 0, and all Dashboards are 0
    print("\n[Step 6] Verifying all values reset to ZERO across all dashboards...")
    _, asms_final = request("/api/assessments")
    assert len(asms_final["assessments"]) == 0, f"Expected 0 assessments, got {len(asms_final['assessments'])}"
    print("  -> Active assessments count is 0")

    _, top3_final = request("/api/results/top3")
    assert len(top3_final["results"]) == 0, f"Expected 0 top 3, got {len(top3_final['results'])}"
    print("  -> HR Top 3 results count is 0 (Highest score becomes 0%)")

    _, mgr_final = request("/api/results/manager")
    for emp in mgr_final["results"]:
        assert emp["assessment_scores"]["completed"] is False
        assert emp["assessment_scores"]["score_pct"] == 0
        assert emp["assessment_scores"]["correct_count"] == 0
    print("  -> ALL 15 employees in Manager view reset to 0% (completed=False)")

    # 7. HR can now assign a new test
    print("\n[Step 7] Verifying HR can now schedule and assign a new test...")
    status, create_res2 = request("/api/assessments", method="POST", data={
        "title": "LeadSync 2026 Round 2 Assessment",
        "description": "Round 2 assessment test.",
        "scheduled_date": "2026-10-25",
        "scheduled_time": "14:00",
        "duration_minutes": 30,
        "assigned_to": [e["id"] for e in mgr_emps]
    })
    assert status == 200
    _, asms_recreated = request("/api/assessments")
    assert len(asms_recreated["assessments"]) == 1
    print("  -> HR successfully assigned a new assessment test!")

    # Reset back to clean initial state
    request("/api/reset", method="POST")
    print("\n==================================================")
    print(" ALL BACKEND REQUIREMENTS PASSED PERFECTLY!")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
