"""
Unit and Integration Tests for LeadSync Google Identity Services (GIS) Authentication & RBAC
Tests:
1. Public auth config (/api/auth/config)
2. Token verification error when GOOGLE_CLIENT_ID missing
3. Token verification and session issuance for authorized HR (visakans.it24@bitsathy.ac.in)
4. Token verification and session issuance for authorized Manager (visakan0302@gmail.com)
5. Token verification and session issuance for any verified Employee Google account
6. Rejection of unauthorized Google email attempting HR login (403 Forbidden)
7. Rejection of unauthorized Google email attempting Manager login (403 Forbidden)
8. Rejection of unverified Google emails (400 Bad Request)
9. Session validation (/api/auth/me) with cookie and Bearer token
10. Session logout (/api/auth/logout)
11. Immediate token revocation on logout (prevents token reuse)
12. HR account cannot access Manager dashboard (/api/results/manager -> 403 Forbidden)
13. Manager account cannot access HR dashboard (/api/results/top3 -> 403 Forbidden)
14. Employee account cannot access HR or Manager endpoints (403 Forbidden)
15. CORS origin whitelist security (blocks untrusted origins)
16. Protected endpoints reject unauthenticated requests
17. CSRF protection blocks state-changing POST requests from untrusted cross-origins
"""

import os
import sys
import base64
import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app import app
from backend.auth import (
    create_session_token,
    verify_session_token,
    AUTHORIZED_HR_EMAIL,
    AUTHORIZED_MGR_EMAIL,
    REVOKED_SESSION_NONCES
)

class TestGoogleAuthRBAC(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_01_auth_config_endpoint(self):
        """Verify /api/auth/config exposes Client ID and whitelist emails without secrets."""
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "test-client-id-123.apps.googleusercontent.com"}):
            res = self.client.get("/api/auth/config")
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data["client_id"], "test-client-id-123.apps.googleusercontent.com")
            self.assertTrue(data["configured"])
            self.assertEqual(data["authorized_hr"], AUTHORIZED_HR_EMAIL)
            self.assertEqual(data["authorized_manager"], AUTHORIZED_MGR_EMAIL)
            # Ensure no secret keys exist
            self.assertNotIn("secret", str(data).lower())

    def test_02_verify_missing_client_id_error(self):
        """Verify /api/auth/google/verify gracefully errors if GOOGLE_CLIENT_ID is not configured."""
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": ""}):
            res = self.client.post("/api/auth/google/verify", json={
                "credential": "mock_jwt_token",
                "target_role": "hr"
            })
            self.assertEqual(res.status_code, 500)
            self.assertIn("GOOGLE_CLIENT_ID is not configured", res.json()["detail"])

    @patch("backend.auth.id_token.verify_oauth2_token")
    def test_03_hr_login_success(self, mock_verify):
        """Verify authorized HR Google email is granted HR privileges and issued session cookie."""
        mock_verify.return_value = {
            "email": AUTHORIZED_HR_EMAIL,
            "email_verified": True,
            "name": "Visakan HR",
            "picture": "https://lh3.googleusercontent.com/test-hr.jpg"
        }
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "valid-client-id.apps.googleusercontent.com"}):
            res = self.client.post("/api/auth/google/verify", json={
                "credential": "valid_google_id_token_hr",
                "target_role": "hr"
            })
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertTrue(data["success"])
            self.assertEqual(data["role"], "hr")
            self.assertEqual(data["email"], AUTHORIZED_HR_EMAIL)
            self.assertIn("user", data)
            self.assertEqual(data["user"]["role"], "hr")
            self.assertEqual(data["user"]["email"], AUTHORIZED_HR_EMAIL)
            self.assertEqual(data["user"]["name"], "Visakan HR")
            self.assertIn("session_token", data)
            # Check HttpOnly cookie was set
            self.assertIn("leadsync_session", res.cookies)

            # Check that /api/auth/me reports authenticated with complete user object
            me_res = self.client.get("/api/auth/me", cookies=res.cookies)
            self.assertEqual(me_res.status_code, 200)
            me_data = me_res.json()
            self.assertTrue(me_data["authenticated"])
            self.assertEqual(me_data["role"], "hr")
            self.assertIn("user", me_data)
            self.assertEqual(me_data["user"]["role"], "hr")
            self.assertEqual(me_data["user"]["email"], AUTHORIZED_HR_EMAIL)

    @patch("backend.auth.id_token.verify_oauth2_token")
    def test_04_manager_login_success(self, mock_verify):
        """Verify authorized Manager Google email is granted Manager privileges."""
        mock_verify.return_value = {
            "email": AUTHORIZED_MGR_EMAIL,
            "email_verified": True,
            "name": "Visakan Manager",
            "picture": "https://lh3.googleusercontent.com/test-mgr.jpg"
        }
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "valid-client-id.apps.googleusercontent.com"}):
            res = self.client.post("/api/auth/google/verify", json={
                "credential": "valid_google_id_token_mgr",
                "target_role": "manager"
            })
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertTrue(data["success"])
            self.assertEqual(data["role"], "manager")
            self.assertEqual(data["email"], AUTHORIZED_MGR_EMAIL)

    @patch("backend.auth.id_token.verify_oauth2_token")
    def test_05_employee_login_success(self, mock_verify):
        """Verify any verified Google account can access the Employee Portal."""
        mock_verify.return_value = {
            "email": "candidate.alex@gmail.com",
            "email_verified": True,
            "name": "Alex Candidate",
            "picture": "https://lh3.googleusercontent.com/test-emp.jpg"
        }
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "valid-client-id.apps.googleusercontent.com"}):
            res = self.client.post("/api/auth/google/verify", json={
                "credential": "valid_google_id_token_emp",
                "target_role": "employee"
            })
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertTrue(data["success"])
            self.assertEqual(data["role"], "employee")
            self.assertEqual(data["email"], "candidate.alex@gmail.com")

    @patch("backend.auth.id_token.verify_oauth2_token")
    def test_06_unauthorized_email_rejected_for_hr(self, mock_verify):
        """Verify unauthorized Google account is rejected with 403 when trying to log in as HR."""
        mock_verify.return_value = {
            "email": "unauthorized.user@gmail.com",
            "email_verified": True,
            "name": "Intruder",
            "picture": ""
        }
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "valid-client-id.apps.googleusercontent.com"}):
            res = self.client.post("/api/auth/google/verify", json={
                "credential": "unauthorized_google_jwt",
                "target_role": "hr"
            })
            self.assertEqual(res.status_code, 403)
            self.assertIn("not authorized for HR Executive Command", res.json()["detail"])

    @patch("backend.auth.id_token.verify_oauth2_token")
    def test_07_unauthorized_email_rejected_for_manager(self, mock_verify):
        """Verify unauthorized Google account is rejected with 403 when trying to log in as Manager."""
        mock_verify.return_value = {
            "email": AUTHORIZED_HR_EMAIL, # HR account trying to access Manager portal
            "email_verified": True,
            "name": "Visakan HR",
            "picture": ""
        }
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "valid-client-id.apps.googleusercontent.com"}):
            res = self.client.post("/api/auth/google/verify", json={
                "credential": "valid_google_jwt",
                "target_role": "manager"
            })
            self.assertEqual(res.status_code, 403)
            self.assertIn("not authorized for Engineering Manager Dashboard", res.json()["detail"])

    @patch("backend.auth.id_token.verify_oauth2_token")
    def test_08_unverified_google_email_rejected(self, mock_verify):
        """Verify Google accounts with unverified email addresses are rejected with 400."""
        mock_verify.return_value = {
            "email": AUTHORIZED_HR_EMAIL,
            "email_verified": False, # Unverified
            "name": "Visakan",
            "picture": ""
        }
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "valid-client-id.apps.googleusercontent.com"}):
            res = self.client.post("/api/auth/google/verify", json={
                "credential": "unverified_email_jwt",
                "target_role": "hr"
            })
            self.assertEqual(res.status_code, 400)
            self.assertIn("not verified", res.json()["detail"])

    def test_09_session_token_cryptography_tamper_resistance(self):
        """Verify that forged or modified session tokens are immediately detected and rejected."""
        valid_token = create_session_token("hr", AUTHORIZED_HR_EMAIL, "Visakan")
        verified = verify_session_token(valid_token)
        self.assertIsNotNone(verified)
        self.assertEqual(verified["role"], "hr")
        self.assertEqual(verified["email"], AUTHORIZED_HR_EMAIL)

        # Tampered signature
        tampered_token = valid_token[:-4] + "dead"
        self.assertIsNone(verify_session_token(tampered_token))

        # Tampered payload (changing role to hr)
        employee_token = create_session_token("employee", "any@gmail.com", "User")
        parts = employee_token.split(".")
        tampered_payload = base64.urlsafe_b64encode(b'{"role":"hr","email":"visakans.it24@bitsathy.ac.in","exp":9999999999}').decode().rstrip("=")
        forged_token = f"{tampered_payload}.{parts[1]}"
        self.assertIsNone(verify_session_token(forged_token))

    def test_10_logout_clears_cookie(self):
        """Verify /api/auth/logout clears the session cookie."""
        res = self.client.post("/api/auth/logout")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["success"])

    def test_11_logout_revokes_token_preventing_reuse(self):
        """Verify that logging out revokes the session token so it cannot be reused."""
        token = create_session_token("hr", AUTHORIZED_HR_EMAIL, "Visakan HR")
        self.assertIsNotNone(verify_session_token(token))

        # Logout sending the token
        res = self.client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res.status_code, 200)

        # Verify the revoked token is no longer accepted
        self.assertIsNone(verify_session_token(token))

    def test_12_hr_cannot_access_manager_results(self):
        """Verify HR session is rejected with 403 Forbidden when requesting Manager Dashboard results."""
        hr_token = create_session_token("hr", AUTHORIZED_HR_EMAIL, "Visakan HR")
        res = self.client.get(
            "/api/results/manager",
            headers={"Authorization": f"Bearer {hr_token}"}
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("requires MANAGER privileges", res.json()["detail"])

    def test_13_manager_cannot_access_hr_top3(self):
        """Verify Manager session is rejected with 403 Forbidden when requesting HR Dashboard Top 3."""
        mgr_token = create_session_token("manager", AUTHORIZED_MGR_EMAIL, "Visakan Manager")
        res = self.client.get(
            "/api/results/top3",
            headers={"Authorization": f"Bearer {mgr_token}"}
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("requires HR privileges", res.json()["detail"])

    def test_14_employee_cannot_access_hr_or_manager_endpoints(self):
        """Verify Employee session is rejected with 403 Forbidden on privileged HR & Manager endpoints."""
        emp_token = create_session_token("employee", "candidate.alex@gmail.com", "Alex Candidate")
        
        # Cannot access HR Top 3
        res1 = self.client.get("/api/results/top3", headers={"Authorization": f"Bearer {emp_token}"})
        self.assertEqual(res1.status_code, 403)

        # Cannot access Manager Results
        res2 = self.client.get("/api/results/manager", headers={"Authorization": f"Bearer {emp_token}"})
        self.assertEqual(res2.status_code, 403)

        # Cannot reset assessments
        res3 = self.client.post("/api/assessments/reset", headers={"Authorization": f"Bearer {emp_token}"})
        self.assertEqual(res3.status_code, 403)

        # Cannot appoint candidates
        res4 = self.client.post("/api/ai/appoint", json={"employee_id": "EMP-001", "role_id": "ROLE-SSE", "role_title": "Lead"}, headers={"Authorization": f"Bearer {emp_token}"})
        self.assertEqual(res4.status_code, 403)

    def test_15_cors_origin_whitelist(self):
        """Verify CORS allows registered localhost and Render origins, and rejects unknown origins."""
        # Allowed origin: local dev
        res_local = self.client.options(
            "/api/employees",
            headers={
                "Origin": "http://localhost:8888",
                "Access-Control-Request-Method": "GET"
            }
        )
        self.assertEqual(res_local.headers.get("access-control-allow-origin"), "http://localhost:8888")

        # Allowed origin: correct deployed Render URL
        res_render = self.client.options(
            "/api/employees",
            headers={
                "Origin": "https://leadsync-dashboard-for-role-selection-1.onrender.com",
                "Access-Control-Request-Method": "GET"
            }
        )
        self.assertEqual(res_render.headers.get("access-control-allow-origin"), "https://leadsync-dashboard-for-role-selection-1.onrender.com")

        # Disallowed untrusted origin
        res_evil = self.client.options(
            "/api/employees",
            headers={
                "Origin": "https://malicious-site.com",
                "Access-Control-Request-Method": "GET"
            }
        )
        self.assertNotEqual(res_evil.headers.get("access-control-allow-origin"), "https://malicious-site.com")

    def test_16_protected_endpoints_require_authentication(self):
        """Verify unauthenticated requests with invalid or missing tokens are rejected."""
        res = self.client.post(
            "/api/ai/upload-asset",
            json={"data": "invalid_data"},
            headers={"Authorization": "Bearer totally_bogus_token"}
        )
        self.assertEqual(res.status_code, 401)
        self.assertIn("Authentication required", res.json()["detail"])

    def test_17_csrf_protection_rejects_untrusted_cross_origin_post(self):
        """Verify CSRF protection blocks state-changing POST requests from unauthorized cross-origins."""
        res = self.client.post(
            "/api/reset",
            headers={"Origin": "https://malicious-site.com"}
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("CSRF verification failed", res.json()["detail"])

    def test_18_populated_env_results_in_configured_true(self):
        """Verify that a populated GOOGLE_CLIENT_ID in environment or .env results in configured=true."""
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "1234567890-test.apps.googleusercontent.com"}):
            res = self.client.get("/api/auth/config")
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertTrue(data["configured"])
            self.assertEqual(data["client_id"], "1234567890-test.apps.googleusercontent.com")
            # Verify cache control headers prevent stale browser caching
            cache_ctrl = res.headers.get("cache-control", "").lower()
            self.assertIn("no-store", cache_ctrl)
            self.assertIn("no-cache", cache_ctrl)

    @patch("backend.auth.id_token.verify_oauth2_token")
    def test_19_verification_response_contains_complete_user_object(self, mock_verify):
        """Verify that /api/auth/google/verify and /api/auth/me return complete user profiles (email, name, picture, role)."""
        mock_verify.return_value = {
            "email": AUTHORIZED_HR_EMAIL,
            "email_verified": True,
            "name": "Visakan HR Talent Director",
            "picture": "https://lh3.googleusercontent.com/avatar.jpg"
        }
        with patch.dict(os.environ, {"GOOGLE_CLIENT_ID": "test-client-id.apps.googleusercontent.com"}):
            res = self.client.post("/api/auth/google/verify", json={
                "credential": "test_google_token",
                "target_role": "hr"
            })
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertTrue(data["success"])
            self.assertIn("user", data)
            self.assertEqual(data["user"]["email"], AUTHORIZED_HR_EMAIL)
            self.assertEqual(data["user"]["name"], "Visakan HR Talent Director")
            self.assertEqual(data["user"]["picture"], "https://lh3.googleusercontent.com/avatar.jpg")
            self.assertEqual(data["user"]["role"], "hr")

            # Check /api/auth/me session profile
            me_res = self.client.get("/api/auth/me", cookies=res.cookies)
            self.assertEqual(me_res.status_code, 200)
            me_data = me_res.json()
            self.assertTrue(me_data["authenticated"])
            self.assertIn("user", me_data)
            self.assertEqual(me_data["user"]["email"], AUTHORIZED_HR_EMAIL)
            self.assertEqual(me_data["user"]["name"], "Visakan HR Talent Director")
            self.assertEqual(me_data["user"]["role"], "hr")


    def test_20_role_isolated_employee_data_initialization(self):
        """Verify employee list is accessible by all roles, while restricted results endpoints maintain strict RBAC."""
        hr_token = create_session_token("hr", AUTHORIZED_HR_EMAIL, "Visakan HR")
        mgr_token = create_session_token("manager", AUTHORIZED_MGR_EMAIL, "Visakan Manager")
        emp_token = create_session_token("employee", "test.employee@leadsync.io", "Test Employee")

        # 1. HR Role
        hr_emp_res = self.client.get("/api/employees", cookies={"leadsync_session": hr_token})
        self.assertEqual(hr_emp_res.status_code, 200)
        self.assertGreaterEqual(len(hr_emp_res.json()["employees"]), 15)

        hr_top3_res = self.client.get("/api/results/top3", cookies={"leadsync_session": hr_token})
        self.assertEqual(hr_top3_res.status_code, 200)

        hr_mgr_res = self.client.get("/api/results/manager", cookies={"leadsync_session": hr_token})
        self.assertEqual(hr_mgr_res.status_code, 403)

        # 2. Manager Role
        mgr_emp_res = self.client.get("/api/employees", cookies={"leadsync_session": mgr_token})
        self.assertEqual(mgr_emp_res.status_code, 200)
        self.assertGreaterEqual(len(mgr_emp_res.json()["employees"]), 15)

        mgr_mgr_res = self.client.get("/api/results/manager", cookies={"leadsync_session": mgr_token})
        self.assertEqual(mgr_mgr_res.status_code, 200)

        mgr_top3_res = self.client.get("/api/results/top3", cookies={"leadsync_session": mgr_token})
        self.assertEqual(mgr_top3_res.status_code, 403)

        # 3. Employee Role
        emp_emp_res = self.client.get("/api/employees", cookies={"leadsync_session": emp_token})
        self.assertEqual(emp_emp_res.status_code, 200)
        self.assertGreaterEqual(len(emp_emp_res.json()["employees"]), 15)

        emp_top3_res = self.client.get("/api/results/top3", cookies={"leadsync_session": emp_token})
        self.assertEqual(emp_top3_res.status_code, 403)

        emp_mgr_res = self.client.get("/api/results/manager", cookies={"leadsync_session": emp_token})
        self.assertEqual(emp_mgr_res.status_code, 403)


if __name__ == "__main__":
    unittest.main()
