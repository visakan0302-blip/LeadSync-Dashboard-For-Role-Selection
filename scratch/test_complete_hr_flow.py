import urllib.request
import urllib.error
import json
import base64

BASE_URL = "http://127.0.0.1:8888"

def req(endpoint, method="GET", data=None):
    url = f"{BASE_URL}{endpoint}"
    headers = {"Content-Type": "application/json"} if data else {}
    body = json.dumps(data).encode("utf-8") if data else None
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))

print("=== STEP 1: Verify Initial 15 Employees All Initialized to 0 ===")
emps_res = req("/api/employees")
emps = emps_res.get("employees", [])
print(f"Total employees: {len(emps)}")
assert len(emps) == 15, f"Expected 15 employees, found {len(emps)}"

for e in emps:
    exp = e.get("experience_years", 0)
    skills = e.get("skills", {})
    certs = e.get("certifications", [])
    asm = e.get("assessment_scores", {})
    score = asm.get("score_pct", 0)
    assert exp == 0.0, f"Expected 0.0 exp for {e['id']}, got {exp}"
    assert len(skills) == 0, f"Expected 0 skills for {e['id']}, got {len(skills)}"
    assert len(certs) == 0, f"Expected 0 certs for {e['id']}, got {len(certs)}"
    assert score == 0, f"Expected 0 assessment score for {e['id']}, got {score}"
print("[OK] All 15 employees confirmed initialized to 0.0 experience, empty skills, 0 certs, 0% exam.")

print("\n=== STEP 2: HR Updates Employee Information for EMP-001 ===")
hr_update_payload = {
    "experience_years": 4.5,
    "skills": {
        "Python": 92,
        "Docker": 88,
        "PostgreSQL": 85,
        "AWS": 85,
        "Git & GitHub": 90,
        "REST APIs": 88,
        "Linux / Unix": 85,
        "CI/CD Pipelines": 82
    },
    "certifications": [
        {
            "id": "CERT-AWS-001",
            "title": "AWS Certified Solutions Architect",
            "issuer": "Amazon Web Services",
            "image_url": "/static/assets/certificates/sample_cert.svg",
            "verified": True
        }
    ],
    "resume": {
        "experience_years": 4.5,
        "education": "B.S. in Computer Science - University of Washington",
        "bio": "Specialized in microservices architecture and high-throughput systems.",
        "image_url": "/static/assets/resumes/EMP-001_resume.svg",
        "display_name": "Alex_Rivera_Senior_Resume.pdf",
        "from_pc": True
    },
    "education": "B.S. in Computer Science - University of Washington",
    "bio": "Specialized in microservices architecture and high-throughput systems.",
    "assessment_scores": {
        "completed": True,
        "score_pct": 90,
        "correct_count": 18,
        "total_questions": 20,
        "category_scores": {
            "Python": 95,
            "Java": 85,
            "C": 80,
            "DBMS": 95,
            "Other Tech": 90,
            "Communication": 95,
            "Aptitude": 90
        }
    }
}

update_res = req("/api/employees/EMP-001/update-info", method="POST", data=hr_update_payload)
assert update_res.get("success") is True, f"Update failed: {update_res}"
print(f"[OK] HR successfully updated EMP-001: {update_res.get('message')}")

print("\n=== STEP 3: Verify Persistence Across Simulated Page Reload ===")
# Fetch fresh dossier from backend to verify disk persistence
dossier = req("/api/ai/employee-dossier/EMP-001")
assert dossier["experience_years"] == 4.5, f"Expected 4.5 exp, got {dossier['experience_years']}"
assert len(dossier["skills"]) == 8, f"Expected 8 skills, got {len(dossier['skills'])}"
assert len(dossier["certifications"]) == 1, f"Expected 1 cert, got {len(dossier['certifications'])}"
assert dossier["assessment_marks"]["score_pct"] == 90, f"Expected 90% score, got {dossier['assessment_marks']['score_pct']}"
assert dossier["resume"]["education"] == "B.S. in Computer Science - University of Washington"
print("[OK] Data persistence verified! Data is saved in database and persists.")

print("\n=== STEP 4: AI Role Analyzer Evaluates EMP-001 Using Retrieved Information ===")
ai_eval_payload = {
    "role_id": "ROLE-SSE",
    "employee_id": "EMP-001",
    "selected_skills": list(dossier["skills"].keys()),
    "certifications": [c["title"] for c in dossier["certifications"]],
    "certificate_images": dossier["certifications"],
    "resume_info": dossier["resume"],
    "assessment_marks": dossier["assessment_marks"],
    "experience_years": dossier["experience_years"],
    "compare_all_employees": True
}

ai_res = req("/api/ai/analyze-eligibility", method="POST", data=ai_eval_payload)
cand = ai_res.get("target_candidate", {})
role = ai_res.get("role_evaluated", {})
print(f"Target Candidate: {cand.get('name')}")
print(f"Role Evaluated: {role.get('title')}")
print(f"AI Overall Match Index: {cand.get('overall_score')}%")
print(f"Eligibility Status: {cand.get('eligibility_label')}")
print(f"Assessment Marks Fit: {cand.get('dimension_scores', {}).get('assessment_marks_fit')}%")
print(f"Skills Alignment: {cand.get('dimension_scores', {}).get('skills_alignment')}%")
print(f"Certifications Match: {cand.get('dimension_scores', {}).get('certifications_match')}%")
print(f"Resume & Experience Fit: {cand.get('dimension_scores', {}).get('resume_experience_fit')}%")

assert cand.get("overall_score") >= 80, f"Expected overall score >= 80%, got {cand.get('overall_score')}"
assert "ELIGIBLE" in cand.get("eligibility_label", "").upper(), f"Expected eligible status, got {cand.get('eligibility_label')}"
print("[OK] Implemented AI successfully evaluated retrieved employee information as Eligible for Senior Software Engineer!")

print("\n=== STEP 5: HR Assigns EMP-001 for this Role ===")
appoint_payload = {
    "employee_id": "EMP-001",
    "role_id": "ROLE-SSE",
    "role_title": "Senior Software Engineer",
    "decision_notes": "Officially assigned following Implemented AI Role Analyzer verdict."
}

appoint_res = req("/api/ai/appoint", method="POST", data=appoint_payload)
assert appoint_res.get("success") is True, f"Appointment failed: {appoint_res}"
print(f"[OK] Appointment successfully recorded: {appoint_res.get('message')}")

# Verify appointment is persisted in list of appointments
appts_res = req("/api/ai/appointments")
appts = appts_res.get("appointments", [])
matching_appt = next((a for a in appts if a["employee_id"] == "EMP-001" and a["role_id"] == "ROLE-SSE"), None)
assert matching_appt is not None, "Appointment was not found in appointment list!"
print(f"[OK] Persisted appointment verified in database: {matching_appt}")

print("\n=== STEP 6: Verify Certificate Upload from PC ===")
sample_svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><text x="20" y="50">Google Cloud Professional Architect</text></svg>'
b64_data = "data:image/svg+xml;base64," + base64.b64encode(sample_svg.encode("utf-8")).decode("utf-8")
upload_res = req("/api/ai/upload-asset", method="POST", data={
    "file_type": "certificate",
    "filename": "gcp_pro_architect.svg",
    "data": b64_data,
    "title": "Google Cloud Professional Architect"
})
assert upload_res.get("success") is True, f"Certificate upload failed: {upload_res}"
assert "url" in upload_res, f"No URL returned: {upload_res}"
print(f"[OK] Certificate upload from PC verified: URL={upload_res['url']}, Title={upload_res['title']}")

print("\n=== ALL HR EMPLOYEE INFORMATION & AI ROLE ANALYZER WORKFLOWS FULLY VALIDATED! ===")
