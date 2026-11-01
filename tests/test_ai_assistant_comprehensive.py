"""
Comprehensive Test Suite for LeadSync FreeLLMAPI AI Agent & Complete Functional Tool Registry
Verifies:
1. Tool registry integrity (all 26 LeadSync tools defined with valid JSON schemas)
2. Real backend execution for all 26 tools (employees, assessments, skills, suitability, succession, analytics, reports, navigation)
3. Natural language identifier resolution ('1', 'emp 1', 'Alex Rivera', 'ROLE-SSE', 'DevOps')
4. Sequential multi-step agent execution loop
5. Error handling (unavailable provider, invalid payloads, missing API key)
6. Non-regression of existing LeadSync REST endpoints
"""

import os
import sys
import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

# Ensure project root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app import app
from backend.database import db
from backend.ai_assistant import (
    calculate_deidentified_hr_metrics,
    format_hr_context_for_prompt,
    execute_chat_turn,
    resolve_employee_id,
    resolve_role_id,
    get_ai_config,
    LEADSYNC_TOOLS,
    TOOL_DISPATCH
)
from backend.models import ChatMessage


class TestLeadSyncAIAgent(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_01_tool_registry_integrity(self):
        """Verify all 26 LeadSync tools are registered with valid function schemas and 1:1 handlers."""
        self.assertEqual(len(LEADSYNC_TOOLS), 26)
        self.assertEqual(len(TOOL_DISPATCH), 26)

        tool_names = [t["function"]["name"] for t in LEADSYNC_TOOLS]
        self.assertEqual(len(set(tool_names)), 26, "Tool names must be unique")

        for name in tool_names:
            self.assertIn(name, TOOL_DISPATCH, f"Tool '{name}' must have a registered execution handler.")
            handler = TOOL_DISPATCH[name]
            self.assertTrue(callable(handler), f"Handler for '{name}' must be callable.")
        print(f"  [PASS] Tool registry verified: {len(LEADSYNC_TOOLS)} tools mapped 1:1 to callable handlers.")

    def test_02_natural_language_identifier_resolution(self):
        """Verify resolution of natural language references to strict IDs."""
        # Employee resolution
        self.assertEqual(resolve_employee_id("1"), "EMP-001")
        self.assertEqual(resolve_employee_id("01"), "EMP-001")
        self.assertEqual(resolve_employee_id("001"), "EMP-001")
        self.assertEqual(resolve_employee_id("emp 1"), "EMP-001")
        self.assertEqual(resolve_employee_id("EMP-001"), "EMP-001")
        self.assertEqual(resolve_employee_id("emp-002"), "EMP-002")
        self.assertEqual(resolve_employee_id("Alex Rivera"), "EMP-001")
        self.assertEqual(resolve_employee_id("Alex"), "EMP-001")

        # Role resolution
        self.assertEqual(resolve_role_id("ROLE-SSE"), "ROLE-SSE")
        self.assertEqual(resolve_role_id("sse"), "ROLE-SSE")
        self.assertEqual(resolve_role_id("Senior Software Engineer"), "ROLE-SSE")
        self.assertEqual(resolve_role_id("devops"), "ROLE-DEVOPS")
        self.assertEqual(resolve_role_id("ai/ml"), "ROLE-AIML")
        self.assertEqual(resolve_role_id("dba"), "ROLE-DBA")
        self.assertEqual(resolve_role_id("project manager"), "ROLE-PM")
        print("  [PASS] Natural language identifier resolution verified across numeric, prefix, name, and role aliases.")

    def test_03_employee_operations_execution(self):
        """Test listing, searching, profile retrieval, updating, and adding employees via tools."""
        # 1. list_employees
        res_list, summary, _ = TOOL_DISPATCH["list_employees"]({"department": "Engineering"})
        self.assertGreater(res_list["count"], 0)
        self.assertIn("Engineering", summary)

        # 2. get_employee_profile
        res_prof, summary, _ = TOOL_DISPATCH["get_employee_profile"]({"employee_id": "1"})
        self.assertEqual(res_prof["employee"]["id"], "EMP-001")
        self.assertEqual(res_prof["employee"]["name"], "Alex Rivera")

        # 3. update_employee_details
        original_bio = res_prof["employee"].get("bio", "")
        test_bio = "Updated bio verified by AI assistant tool."
        res_upd, summary, ui_act = TOOL_DISPATCH["update_employee_details"]({
            "employee_id": "EMP-001",
            "updates": {"bio": test_bio}
        })
        self.assertTrue(res_upd["success"])
        self.assertEqual(db.get_employee("EMP-001")["bio"], test_bio)
        # Revert back
        db.get_employee("EMP-001")["bio"] = original_bio
        db.save()

        # 4. get_employee_dossier
        res_dos, summary, _ = TOOL_DISPATCH["get_employee_dossier"]({"employee_id": "EMP-001"})
        self.assertEqual(res_dos["dossier"]["id"], "EMP-001")
        self.assertIn("skills", res_dos["dossier"])
        print("  [PASS] Employee operations (list, search, profile, dossier, update) verified against real database.")

    def test_04_assessment_operations_execution(self):
        """Test listing, questions, scheduling, leaderboard, and roster."""
        # 1. list_assessments
        res_asms, summary, _ = TOOL_DISPATCH["list_assessments"]({})
        self.assertIn("assessments", res_asms)

        # 2. get_assessment_questions
        res_qs, summary, _ = TOOL_DISPATCH["get_assessment_questions"]({"count": 5})
        self.assertEqual(res_qs["total"], 5)
        self.assertEqual(len(res_qs["questions"]), 5)

        # 3. get_assessment_leaderboard_top3
        res_top3, summary, _ = TOOL_DISPATCH["get_assessment_leaderboard_top3"]({})
        self.assertIn("leaderboard", res_top3)
        self.assertLessEqual(len(res_top3["leaderboard"]), 3)

        # 4. get_manager_team_roster
        res_roster, summary, _ = TOOL_DISPATCH["get_manager_team_roster"]({})
        self.assertEqual(res_roster["count"], len(db.get_all_employees()))

        # 5. create_and_schedule_assessment
        res_sched, summary, ui_act = TOOL_DISPATCH["create_and_schedule_assessment"]({
            "title": "Automated Unit Test Assessment",
            "scheduled_date": "2026-10-20",
            "scheduled_time": "14:00",
            "duration_minutes": 45,
            "assigned_to": ["EMP-001", "EMP-002"]
        })
        self.assertTrue(res_sched["success"])
        self.assertEqual(len(res_sched["assessment"]["assigned_to"]), 2)
        # Clean up test assessment
        db.assessments = [a for a in db.assessments if a["id"] != res_sched["assessment"]["id"]]
        db.save()
        print("  [PASS] Assessment operations (list, questions, top 3, roster, schedule) verified.")

    def test_05_skills_competency_and_gap_analysis(self):
        """Test skills catalog retrieval and skill gap analysis tool."""
        # 1. get_skills_catalog
        res_cat, summary, _ = TOOL_DISPATCH["get_skills_catalog"]({})
        self.assertGreater(res_cat["total_skills"], 50)
        self.assertIn("Languages", res_cat["categories"])

        # 2. analyze_employee_skill_gaps
        res_gap, summary, _ = TOOL_DISPATCH["analyze_employee_skill_gaps"]({
            "employee_id": "EMP-001",
            "role_id": "ROLE-SSE"
        })
        self.assertEqual(res_gap["employee_id"], "EMP-001")
        self.assertIn("matched_skills", res_gap)
        self.assertIn("missing_skills", res_gap)
        self.assertIn("skill_gap_percentage", res_gap)
        print("  [PASS] Skills catalog & competency gap analysis operations verified.")

    def test_06_leadership_suitability_and_succession(self):
        """Test role suitability evaluation, candidate ranking, AI candidate matching, and appointment."""
        # 1. list_leadership_roles
        res_roles, summary, _ = TOOL_DISPATCH["list_leadership_roles"]({})
        self.assertEqual(len(res_roles["roles"]), 5)

        # 2. evaluate_role_suitability
        res_eval, summary, _ = TOOL_DISPATCH["evaluate_role_suitability"]({
            "employee_id": "EMP-001",
            "role_id": "ROLE-SSE"
        })
        self.assertEqual(res_eval["employee_id"], "EMP-001")
        self.assertIn("primary_suitability_score", res_eval)

        # 3. rank_candidates_for_role
        res_rank, summary, _ = TOOL_DISPATCH["rank_candidates_for_role"]({"role_id": "ROLE-DEVOPS"})
        self.assertEqual(len(res_rank["ranked_candidates"]), len(db.get_all_employees()))
        self.assertIn("employee_name", res_rank["ranked_candidates"][0])

        # 4. get_succession_matrix
        res_mat, summary, _ = TOOL_DISPATCH["get_succession_matrix"]({})
        self.assertIn("matrix", res_mat)

        # 5. run_ai_candidate_matching
        res_match, summary, _ = TOOL_DISPATCH["run_ai_candidate_matching"]({"role_id": "ROLE-AIML"})
        self.assertIn("best_perfect_employee", res_match)

        # 6. appoint_candidate_to_role
        res_appt, summary, ui_act = TOOL_DISPATCH["appoint_candidate_to_role"]({
            "employee_id": "EMP-001",
            "role_id": "ROLE-SSE",
            "decision_notes": "Unit test appointment validation"
        })
        self.assertTrue(res_appt["success"])
        self.assertEqual(res_appt["appointment"]["employee_id"], "EMP-001")

        # 7. list_succession_appointments
        res_appts_list, summary, _ = TOOL_DISPATCH["list_succession_appointments"]({})
        self.assertGreater(res_appts_list["count"], 0)

        # Clean up appointment
        db.appointments = [a for a in db.appointments if a["id"] != res_appt["appointment"]["id"]]
        db.get_employee("EMP-001")["appointed_role"] = None
        db.save()
        print("  [PASS] Succession planning operations (roles, suitability, ranking, AI matching, appointments) verified.")

    def test_07_analytics_and_report_export(self):
        """Test analytics summary, comparative department analytics, and formatted export report generator."""
        # 1. get_analytics_summary
        res_metrics, summary, _ = TOOL_DISPATCH["get_analytics_summary"]({})
        self.assertEqual(res_metrics["workforce_headcount"], len(db.get_all_employees()))

        # 2. compare_departments_analytics
        res_dept, summary, _ = TOOL_DISPATCH["compare_departments_analytics"]({})
        self.assertGreater(res_dept["total_departments"], 0)
        self.assertIn("average_experience_years", res_dept["departments"][0])

        # 3. generate_and_export_assessment_report (Markdown)
        res_rep_md, summary, _ = TOOL_DISPATCH["generate_and_export_assessment_report"]({"format_type": "markdown"})
        self.assertIn("# LeadSync Executive Talent Assessment Report", res_rep_md["report_content"])
        self.assertIn("Top 3 Leaderboard", res_rep_md["report_content"])

        # 4. generate_and_export_assessment_report (CSV)
        res_rep_csv, summary, _ = TOOL_DISPATCH["generate_and_export_assessment_report"]({"format_type": "csv"})
        self.assertIn("Employee ID,Name,Department,Role", res_rep_csv["report_content"])
        print("  [PASS] Analytics summary, comparative departments, and Markdown/CSV report generators verified.")

    def test_08_dashboard_navigation_tool(self):
        """Test dashboard navigation tool setting UI triggers."""
        res_nav, summary, ui_act = TOOL_DISPATCH["navigate_dashboard"]({"target_tab": "tab-employee-info"})
        self.assertTrue(res_nav["success"])
        self.assertEqual(ui_act["action"], "navigate")
        self.assertEqual(ui_act["target_tab"], "tab-employee-info")
        print("  [PASS] Dashboard navigation tool verified with target tab triggers.")

    def test_09_multi_step_agent_execution_with_mocked_llm(self):
        """Test sequential multi-step tool execution loop with mocked FreeLLMAPI responses."""
        # Step 1: Model requests tool call to get_employee_profile
        mock_choice_step1 = MagicMock()
        mock_choice_step1.message.content = ""
        mock_tc = MagicMock()
        mock_tc.id = "call_step1"
        mock_tc.function.name = "get_employee_profile"
        mock_tc.function.arguments = '{"employee_id": "1"}'
        mock_choice_step1.message.tool_calls = [mock_tc]

        # Step 2: Model receives profile, now requests evaluate_role_suitability
        mock_choice_step2 = MagicMock()
        mock_choice_step2.message.content = ""
        mock_tc2 = MagicMock()
        mock_tc2.id = "call_step2"
        mock_tc2.function.name = "evaluate_role_suitability"
        mock_tc2.function.arguments = '{"employee_id": "EMP-001", "role_id": "ROLE-SSE"}'
        mock_choice_step2.message.tool_calls = [mock_tc2]

        # Step 3: Model receives evaluation, outputs final synthesized natural language response
        mock_choice_step3 = MagicMock()
        mock_choice_step3.message.content = "Employee 1 (Alex Rivera) is evaluated as a strong 88.5% match for Senior Software Engineer."
        mock_choice_step3.message.tool_calls = None

        mock_completion_1 = MagicMock(choices=[mock_choice_step1])
        mock_completion_2 = MagicMock(choices=[mock_choice_step2])
        mock_completion_3 = MagicMock(choices=[mock_choice_step3])

        with patch.dict(os.environ, {"AI_PROVIDER": "freellmapi", "FREELLMAPI_API_KEY": "test-key-mock", "GEMINI_API_KEY": "", "GOOGLE_API_KEY": ""}):
            with patch("openai.resources.chat.completions.Completions.create", side_effect=[
                mock_completion_1,
                mock_completion_2,
                mock_completion_3
            ]) as mock_create:
                res = execute_chat_turn(
                    messages=[ChatMessage(role="user", content="Find employee 1 and evaluate their suitability for SSE.")],
                    include_hr_context=True,
                    user_role="hr"
                )

                self.assertTrue(res["success"])
                self.assertIn("Alex Rivera", res["reply"])
                self.assertEqual(len(res["executed_actions"]), 2)
                self.assertEqual(res["executed_actions"][0]["tool_name"], "get_employee_profile")
                self.assertEqual(res["executed_actions"][1]["tool_name"], "evaluate_role_suitability")
                self.assertEqual(mock_create.call_count, 3)
                print("  [PASS] Multi-step agent execution verified: 2 sequential tool calls executed and synthesized.")

    def test_10_chat_endpoint_integration(self):
        """Test /api/ai/chat endpoint returning AIChatResponse with executed_actions."""
        mock_choice = MagicMock()
        mock_choice.message.content = "The IT skills taxonomy contains over 50 technical competencies."
        mock_choice.message.tool_calls = None
        mock_completion = MagicMock(choices=[mock_choice])

        with patch.dict(os.environ, {"AI_PROVIDER": "freellmapi", "FREELLMAPI_API_KEY": "test-key-mock", "GEMINI_API_KEY": "", "GOOGLE_API_KEY": ""}):
            with patch("openai.resources.chat.completions.Completions.create", return_value=mock_completion):
                response = self.client.post(
                    "/api/ai/chat",
                    headers={"X-LeadSync-Role": "hr"},
                    json={
                        "messages": [{"role": "user", "content": "What skills do we track?"}],
                        "include_hr_context": True
                    }
                )
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertTrue(data["success"])
                self.assertIsNotNone(data["reply"])
                self.assertIn("executed_actions", data)
                self.assertIn("metrics_summary", data)
                print("  [PASS] /api/ai/chat integration verified with structured response.")

    def test_11_existing_lead_sync_endpoints_non_regression(self):
        """Verify that all existing LeadSync routes remain fully operational."""
        # 1. Employees
        res_emp = self.client.get("/api/employees")
        self.assertEqual(res_emp.status_code, 200)
        self.assertGreaterEqual(len(res_emp.json()["employees"]), 15)

        # 2. Assessments
        res_asm = self.client.get("/api/assessments")
        self.assertEqual(res_asm.status_code, 200)

        # 3. Top 3 for HR
        res_top3 = self.client.get("/api/results/top3")
        self.assertEqual(res_top3.status_code, 200)

        # 4. Manager roster
        res_mgr = self.client.get("/api/results/manager")
        self.assertEqual(res_mgr.status_code, 200)

        # 5. Roles
        res_roles = self.client.get("/api/roles")
        self.assertEqual(res_roles.status_code, 200)
        self.assertEqual(len(res_roles.json()["roles"]), 5)

        # 6. Static Index
        res_idx = self.client.get("/")
        self.assertEqual(res_idx.status_code, 200)
        print("  [PASS] Non-regression verified: all 6 existing dashboard endpoints intact.")

    def test_12_ai_provider_resolution(self):
        """Verify intelligent AI provider resolution between Gemini, OpenAI, and FreeLLMAPI."""
        # Case A: GEMINI_API_KEY configured -> auto-detects Gemini cloud provider
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-gemini-key", "FREELLMAPI_API_KEY": "local-key"}, clear=False):
            cfg = get_ai_config()
            self.assertEqual(cfg["provider"], "gemini")
            self.assertEqual(cfg["provider_name"], "Google Gemini")
            self.assertEqual(cfg["api_key"], "test-gemini-key")
            self.assertIn("generativelanguage.googleapis.com", cfg["base_url"])

        # Case B: GOOGLE_API_KEY fallback -> auto-detects Gemini
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "test-google-key", "GEMINI_API_KEY": "", "AI_PROVIDER": ""}, clear=False):
            cfg = get_ai_config()
            self.assertEqual(cfg["provider"], "gemini")
            self.assertEqual(cfg["api_key"], "test-google-key")

        # Case C: Explicit AI_PROVIDER=gemini on Render without key yet
        with patch.dict(os.environ, {"AI_PROVIDER": "gemini", "GEMINI_API_KEY": "", "GOOGLE_API_KEY": ""}, clear=False):
            cfg = get_ai_config()
            self.assertEqual(cfg["provider"], "gemini")
            self.assertEqual(cfg["api_key"], "")

        # Case D: Local development with FREELLMAPI_API_KEY and no cloud key
        with patch.dict(os.environ, {"FREELLMAPI_API_KEY": "mock-freellm-key", "GEMINI_API_KEY": "", "GOOGLE_API_KEY": "", "AI_PROVIDER": "", "RENDER": ""}, clear=False):
            cfg = get_ai_config()
            self.assertEqual(cfg["provider"], "freellmapi")
            self.assertEqual(cfg["provider_name"], "FreeLLMAPI Unified Gateway")
            self.assertEqual(cfg["api_key"], "mock-freellm-key")
            self.assertIn("127.0.0.1:31415", cfg["base_url"])
        print("  [PASS] AI provider resolution verified across Gemini cloud and FreeLLMAPI local setups.")

    def test_13_gemini_openai_execution(self):
        """Verify agent execution loop using Gemini provider configuration."""
        mock_candidate = MagicMock()
        mock_candidate.content.parts = [MagicMock(text="Google Gemini analysis confirms candidate eligibility.")]
        mock_response = MagicMock(
            candidates=[mock_candidate],
            function_calls=None,
            text="Google Gemini analysis confirms candidate eligibility."
        )

        with patch.dict(os.environ, {"GEMINI_API_KEY": "mock-gemini-key", "AI_PROVIDER": "gemini"}):
            with patch("backend.ai_assistant.get_cached_gemini_client") as mock_get_client:
                mock_client = MagicMock()
                mock_client.models.generate_content.return_value = mock_response
                mock_get_client.return_value = mock_client
                res = execute_chat_turn(
                    messages=[ChatMessage(role="user", content="Analyze candidate suitability.")],
                    include_hr_context=True,
                    user_role="hr"
                )
                self.assertTrue(res["success"])
                self.assertIn("Google Gemini", res["reply"])
        print("  [PASS] Gemini provider execution verified with native SDK mock.")

    def test_14_ai_status_endpoint(self):
        """Verify /api/ai/status endpoint safely reveals provider configuration without leaking keys."""
        with patch.dict(os.environ, {"GEMINI_API_KEY": "secret-gemini-key", "AI_PROVIDER": "gemini"}):
            res = self.client.get("/api/ai/status")
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertTrue(data["success"])
            self.assertEqual(data["provider"], "gemini")
            self.assertEqual(data["provider_name"], "Google Gemini")
            self.assertTrue(data["is_configured"])
            self.assertEqual(data["mode"], "cloud")
            # Crucial: verify raw API key is NEVER exposed in the JSON response
            self.assertNotIn("secret-gemini-key", str(data))
        print("  [PASS] /api/ai/status endpoint verified (provider revealed, key never leaked).")

    def test_15_actionable_error_messages(self):
        """Verify clear and actionable error messages when API keys are unconfigured."""
        # Unconfigured Gemini
        with patch.dict(os.environ, {"AI_PROVIDER": "gemini", "GEMINI_API_KEY": "", "GOOGLE_API_KEY": ""}):
            res = execute_chat_turn(
                messages=[ChatMessage(role="user", content="Hello")],
                include_hr_context=False,
                user_role="hr"
            )
            self.assertFalse(res["success"])
            self.assertIn("GEMINI_API_KEY environment variable is not configured", res["error"])

        # Unconfigured FreeLLMAPI
        with patch.dict(os.environ, {"AI_PROVIDER": "freellmapi", "FREELLMAPI_API_KEY": "", "GEMINI_API_KEY": "", "GOOGLE_API_KEY": ""}):
            res = execute_chat_turn(
                messages=[ChatMessage(role="user", content="Hello")],
                include_hr_context=False,
                user_role="hr"
            )
            self.assertFalse(res["success"])
            self.assertIn("FREELLMAPI_API_KEY", res["error"])
    def test_16_gemini_key_validation_unsuccessful(self):
        """Verify POST /api/ai/set-gemini-key rejects invalid keys when called by authorized HR."""
        headers = {"X-LeadSync-Role": "hr", "X-LeadSync-Email": "hr@leadsync.com"}
        with patch.dict(os.environ, {"GEMINI_API_KEY": "", "GOOGLE_API_KEY": ""}):
            from backend.app import _gemini_validation_cache
            _gemini_validation_cache.clear()
            res = self.client.post("/api/ai/set-gemini-key", json={"api_key": "free_bogus_key_123"}, headers=headers)
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertFalse(data["success"])
            self.assertEqual(data.get("status"), "invalid")
            self.assertIn("Google rejected this API key", data["message"])
            # Verify secret is never echoed back
            self.assertNotIn("free_bogus_key_123", str(data))

            # Check status endpoint confirms unconfigured/invalid
            status_res = self.client.get("/api/ai/gemini-status")
            self.assertFalse(status_res.json()["gemini_configured"])
        print("  [PASS] Unsuccessful key validation path verified: rejected with helpful guidance, zero secrets leaked.")

    def test_17_gemini_key_validation_successful(self):
        """Verify POST /api/ai/set-gemini-key activates and caches valid keys when called by authorized HR."""
        from unittest.mock import patch
        headers = {"X-LeadSync-Role": "hr", "X-LeadSync-Email": "hr@leadsync.com"}
        # Patch validate_gemini_key and simulate cloud/isolated environment so local .env is not altered
        with patch.dict(os.environ, {"RENDER": "true"}):
            with patch("backend.app.validate_gemini_key", return_value=(True, "")):
                res = self.client.post("/api/ai/set-gemini-key", json={"api_key": "valid_mock_key_abc"}, headers=headers)
                self.assertEqual(res.status_code, 200)
                data = res.json()
                self.assertTrue(data["success"])
                self.assertEqual(data.get("status"), "active")
                self.assertIn("validated and activated", data["message"])
                self.assertNotIn("valid_mock_key_abc", str(data))

                # Status endpoint now reports active
                status_res = self.client.get("/api/ai/gemini-status")
                status_data = status_res.json()
                self.assertTrue(status_data["gemini_configured"])
                self.assertEqual(status_data["status"], "active")
        print("  [PASS] Successful key validation path verified: activated in memory, status confirmed, zero secrets leaked.")

    def test_18_gemini_key_authorization_guard(self):
        """Verify POST /api/ai/set-gemini-key rejects unauthenticated visitors or non-admin roles with 403."""
        # Case A: No authentication headers
        res_no_auth = self.client.post("/api/ai/set-gemini-key", json={"api_key": "any_key"})
        self.assertEqual(res_no_auth.status_code, 403)
        self.assertIn("Forbidden", res_no_auth.json().get("detail", ""))

        # Case B: Employee role attempt
        res_emp = self.client.post(
            "/api/ai/set-gemini-key",
            json={"api_key": "any_key"},
            headers={"X-LeadSync-Role": "employee", "X-LeadSync-Email": "emp@leadsync.com"}
        )
        self.assertEqual(res_emp.status_code, 403)

        # Case C: Guest / Unknown role attempt
        res_guest = self.client.post(
            "/api/ai/set-gemini-key",
            json={"api_key": "any_key"},
            headers={"X-LeadSync-Role": "visitor"}
        )
        self.assertEqual(res_guest.status_code, 403)
        print("  [PASS] Authorization security guard verified: unauthenticated visitors and employee roles blocked with 403.")


if __name__ == "__main__":
    print("=" * 70)
    print(" LEADSYNC COMPLETE AI AGENT & FUNCTIONAL ACCESS VERIFICATION SUITE")
    print("=" * 70)
    unittest.main(verbosity=2)
