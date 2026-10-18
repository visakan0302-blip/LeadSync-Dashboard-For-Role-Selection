"""
Asset generator for LeadSync: creates official SVG certificate and resume image assets for all 15 employees.
"""
import os
import sys

# Ensure root is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.data_seed import INITIAL_EMPLOYEES

def generate_all_assets():
    cert_dir = os.path.join(BASE_DIR, 'static', 'assets', 'certificates')
    resume_dir = os.path.join(BASE_DIR, 'static', 'assets', 'resumes')
    os.makedirs(cert_dir, exist_ok=True)
    os.makedirs(resume_dir, exist_ok=True)

    for emp in INITIAL_EMPLOYEES:
        emp_id = emp['id']
        name = emp['name']
        role = emp['role']
        certs = emp.get('certifications', ['Certified Professional'])

        # 1. Generate Certificates SVG
        for idx, cert in enumerate(certs):
            cert_filename = f"{emp_id}_cert_{idx+1}.svg"
            cert_path = os.path.join(cert_dir, cert_filename)
            cred_id = f"CR-{emp_id}-{(idx+1)*1089}"

            svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560" width="800" height="560">
  <defs>
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f46e5"/>
      <stop offset="50%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
    <linearGradient id="sealGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <pattern id="bgGrid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" stroke-width="1"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="800" height="560" fill="#ffffff" rx="12"/>
  <rect width="800" height="560" fill="url(#bgGrid)" rx="12"/>

  <!-- Borders -->
  <rect x="24" y="24" width="752" height="512" rx="8" fill="none" stroke="url(#borderGrad)" stroke-width="6"/>
  <rect x="36" y="36" width="728" height="488" rx="6" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="6 4"/>

  <!-- Header Banner -->
  <text x="400" y="85" font-family="'Segoe UI', Inter, Arial, sans-serif" font-size="14" font-weight="700" fill="#6366f1" text-anchor="middle" letter-spacing="4">OFFICIAL ACCREDITATION CERTIFICATE</text>
  <text x="400" y="125" font-family="'Georgia', serif" font-size="28" font-weight="bold" fill="#0f172a" text-anchor="middle">CERTIFICATE OF ACHIEVEMENT</text>
  <line x1="280" y1="140" x2="520" y2="140" stroke="url(#borderGrad)" stroke-width="2" stroke-linecap="round"/>

  <!-- Recipient -->
  <text x="400" y="180" font-family="'Segoe UI', Arial, sans-serif" font-size="14" fill="#64748b" text-anchor="middle">This credential is formally granted to</text>
  <text x="400" y="225" font-family="'Georgia', serif" font-size="30" font-weight="bold" fill="#1e1b4b" text-anchor="middle">{name}</text>
  <text x="400" y="255" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#475569" text-anchor="middle">{role} &bull; LeadSync Talent Network &bull; ID: {emp_id}</text>

  <!-- Certification Name -->
  <text x="400" y="300" font-family="'Segoe UI', Arial, sans-serif" font-size="13" fill="#64748b" text-anchor="middle">in professional mastery and successful completion of</text>
  <rect x="100" y="315" width="600" height="60" rx="8" fill="#f8fafc" stroke="#c7d2fe" stroke-width="1.5"/>
  <text x="400" y="352" font-family="'Segoe UI', Inter, Arial, sans-serif" font-size="19" font-weight="800" fill="#4338ca" text-anchor="middle">{cert}</text>

  <!-- Seal / Stamp -->
  <g transform="translate(100, 400)">
    <circle cx="45" cy="45" r="40" fill="url(#sealGrad)" opacity="0.15"/>
    <circle cx="45" cy="45" r="34" fill="none" stroke="#d97706" stroke-width="2.5" stroke-dasharray="4 2"/>
    <circle cx="45" cy="45" r="26" fill="none" stroke="#d97706" stroke-width="1.5"/>
    <polygon points="45,26 49,38 61,38 51,46 55,58 45,50 35,58 39,46 29,38 41,38" fill="#d97706"/>
    <text x="45" y="72" font-family="sans-serif" font-size="8" font-weight="bold" fill="#b45309" text-anchor="middle" letter-spacing="1">VERIFIED</text>
  </g>

  <!-- Signatures -->
  <g transform="translate(250, 425)">
    <line x1="0" y1="40" x2="160" y2="40" stroke="#94a3b8" stroke-width="1.5"/>
    <path d="M 10 35 Q 40 10 70 30 T 130 25" fill="none" stroke="#334155" stroke-width="2"/>
    <text x="80" y="58" font-family="sans-serif" font-size="11" font-weight="600" fill="#1e293b" text-anchor="middle">Director of Accreditation</text>
    <text x="80" y="72" font-family="sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Certification Board</text>
  </g>

  <g transform="translate(490, 425)">
    <line x1="0" y1="40" x2="160" y2="40" stroke="#94a3b8" stroke-width="1.5"/>
    <path d="M 15 32 Q 50 15 85 35 T 145 28" fill="none" stroke="#334155" stroke-width="2"/>
    <text x="80" y="58" font-family="sans-serif" font-size="11" font-weight="600" fill="#1e293b" text-anchor="middle">Technical Examiner</text>
    <text x="80" y="72" font-family="sans-serif" font-size="10" fill="#64748b" text-anchor="middle">Issue Date: Oct 2026</text>
  </g>

  <!-- Bottom Details -->
  <text x="400" y="525" font-family="sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">Credential ID: {cred_id} &bull; Authenticity Hash: 8f9b4c &bull; LeadSync AI Talent Registry</text>
</svg>"""
            with open(cert_path, 'w', encoding='utf-8') as f:
                f.write(svg_content)

        # 2. Generate Resume SVG
        resume_filename = f"{emp_id}_resume.svg"
        resume_path = os.path.join(resume_dir, resume_filename)
        projs = emp.get('projects', [])
        p1 = projs[0] if len(projs) > 0 else {'title': 'Core Infrastructure', 'impact': 'Delivered scalable services', 'tech_stack': ['Python', 'SQL'], 'description': 'Managed core services', 'role': 'Lead'}
        p2 = projs[1] if len(projs) > 1 else {'title': 'System Modernization', 'impact': 'Improved efficiency', 'tech_stack': ['FastAPI', 'Docker'], 'description': 'Migrated microservices', 'role': 'Developer'}
        edu = emp.get('education', 'B.S. in Computer Science')
        exp_yrs = emp.get('experience_years', 3.0)

        # Build skill bars
        skill_bars = ""
        for i, (sk, val) in enumerate(list(emp.get('skills', {}).items())[:7]):
            y_pos = 360 + i * 32
            fill_w = int(168 * val / 100)
            skill_bars += f"""
    <text x="16" y="{y_pos}" font-family="sans-serif" font-size="10" font-weight="600" fill="#334155">{sk}</text>
    <rect x="16" y="{y_pos + 8}" width="168" height="6" rx="3" fill="#e2e8f0"/>
    <rect x="16" y="{y_pos + 8}" width="{fill_w}" height="6" rx="3" fill="#4f46e5"/>"""

        # Build cert bullets
        cert_bullets = ""
        for i, c in enumerate(certs[:3]):
            y_c = 160 + i * 46
            cert_bullets += f"""
    <circle cx="22" cy="{y_c}" r="3" fill="#6366f1"/>
    <text x="32" y="{y_c + 4}" font-family="sans-serif" font-size="9.5" font-weight="700" fill="#1e293b">{c[:25]}</text>
    <text x="32" y="{y_c + 18}" font-family="sans-serif" font-size="8.5" fill="#64748b">Verified Credential</text>"""

        bio_p1 = emp.get('bio', '')[:70]
        bio_p2 = emp.get('bio', '')[70:145]
        bio_p3 = emp.get('bio', '')[145:220]

        p1_desc = p1.get('description', '')[:70]
        p1_imp = p1.get('impact', '')[:65]
        p2_desc = p2.get('description', '')[:70]
        p2_imp = p2.get('impact', '')[:65]

        asm = emp.get('assessment_scores', {})
        score_pct = asm.get('score_pct', 80)
        correct_cnt = asm.get('correct_count', 16)

        resume_svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 920" width="700" height="920">
  <defs>
    <linearGradient id="headGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#312e81"/>
    </linearGradient>
  </defs>

  <!-- Resume Sheet -->
  <rect width="700" height="920" fill="#ffffff" rx="8" stroke="#cbd5e1" stroke-width="1.5"/>
  
  <!-- Header Bar -->
  <rect width="700" height="120" fill="url(#headGrad)" rx="8"/>
  <text x="45" y="50" font-family="'Segoe UI', Inter, sans-serif" font-size="26" font-weight="800" fill="#ffffff">{name}</text>
  <text x="45" y="78" font-family="'Segoe UI', sans-serif" font-size="14" font-weight="600" fill="#38bdf8">{role} &bull; {emp.get('department', 'Engineering')}</text>
  <text x="45" y="98" font-family="sans-serif" font-size="11" fill="#cbd5e1">{emp.get('email', '')} | Experience: {exp_yrs} Years | Employee ID: {emp_id}</text>

  <!-- Left Column -->
  <g transform="translate(45, 140)">
    <rect width="200" height="740" fill="#f8fafc" rx="6" stroke="#e2e8f0" stroke-width="1"/>
    
    <!-- Education -->
    <text x="16" y="32" font-family="sans-serif" font-size="12" font-weight="800" fill="#4338ca" letter-spacing="1">EDUCATION</text>
    <line x1="16" y1="38" x2="184" y2="38" stroke="#cbd5e1" stroke-width="1"/>
    <text x="16" y="60" font-family="sans-serif" font-size="10.5" font-weight="700" fill="#0f172a">{edu[:24]}</text>
    <text x="16" y="75" font-family="sans-serif" font-size="10" fill="#64748b">{edu[24:52]}</text>
    <text x="16" y="90" font-family="sans-serif" font-size="9" fill="#94a3b8">Graduated with Honors</text>

    <!-- Certifications -->
    <text x="16" y="130" font-family="sans-serif" font-size="12" font-weight="800" fill="#4338ca" letter-spacing="1">CERTIFICATIONS</text>
    <line x1="16" y1="136" x2="184" y2="136" stroke="#cbd5e1" stroke-width="1"/>
    {cert_bullets}

    <!-- Core Skills -->
    <text x="16" y="330" font-family="sans-serif" font-size="12" font-weight="800" fill="#4338ca" letter-spacing="1">CORE COMPETENCIES</text>
    <line x1="16" y1="336" x2="184" y2="336" stroke="#cbd5e1" stroke-width="1"/>
    {skill_bars}
  </g>

  <!-- Right Column -->
  <g transform="translate(265, 140)">
    <!-- Professional Summary -->
    <text x="0" y="20" font-family="sans-serif" font-size="13" font-weight="800" fill="#1e1b4b" letter-spacing="1">PROFESSIONAL SUMMARY</text>
    <line x1="0" y1="26" x2="390" y2="26" stroke="#6366f1" stroke-width="1.5"/>
    <text x="0" y="46" font-family="sans-serif" font-size="11" fill="#475569">{bio_p1}</text>
    <text x="0" y="62" font-family="sans-serif" font-size="11" fill="#475569">{bio_p2}</text>
    <text x="0" y="78" font-family="sans-serif" font-size="11" fill="#475569">{bio_p3}</text>

    <!-- Experience -->
    <text x="0" y="116" font-family="sans-serif" font-size="13" font-weight="800" fill="#1e1b4b" letter-spacing="1">EXPERIENCE &amp; RECORD</text>
    <line x1="0" y1="122" x2="390" y2="122" stroke="#6366f1" stroke-width="1.5"/>
    
    <text x="0" y="146" font-family="sans-serif" font-size="12" font-weight="700" fill="#0f172a">{role}</text>
    <text x="0" y="162" font-family="sans-serif" font-size="10.5" font-weight="600" fill="#6366f1">LeadSync Technologies &bull; {exp_yrs} Years Tenure</text>
    <text x="0" y="180" font-family="sans-serif" font-size="10.5" fill="#475569">&bull; Actively leads engineering deliverables and microservice subsystems.</text>
    <text x="0" y="196" font-family="sans-serif" font-size="10.5" fill="#475569">&bull; Demonstrated high reliability across quarterly technical releases.</text>

    <!-- Projects -->
    <text x="0" y="238" font-family="sans-serif" font-size="13" font-weight="800" fill="#1e1b4b" letter-spacing="1">VERIFIED PRODUCTION PROJECTS</text>
    <line x1="0" y1="244" x2="390" y2="244" stroke="#6366f1" stroke-width="1.5"/>

    <!-- Project 1 -->
    <text x="0" y="268" font-family="sans-serif" font-size="11.5" font-weight="700" fill="#0f172a">1. {p1.get('title', 'System Core')}</text>
    <text x="0" y="284" font-family="sans-serif" font-size="10" font-weight="600" fill="#0284c7">Role: {p1.get('role', 'Lead')} | Stack: {', '.join(p1.get('tech_stack', [])[:4])}</text>
    <text x="0" y="302" font-family="sans-serif" font-size="10" fill="#475569">Description: {p1_desc}</text>
    <text x="0" y="320" font-family="sans-serif" font-size="10" font-weight="700" fill="#059669">Impact: {p1_imp}</text>

    <!-- Project 2 -->
    <text x="0" y="358" font-family="sans-serif" font-size="11.5" font-weight="700" fill="#0f172a">2. {p2.get('title', 'Platform Service')}</text>
    <text x="0" y="374" font-family="sans-serif" font-size="10" font-weight="600" fill="#0284c7">Role: {p2.get('role', 'Developer')} | Stack: {', '.join(p2.get('tech_stack', [])[:4])}</text>
    <text x="0" y="392" font-family="sans-serif" font-size="10" fill="#475569">Description: {p2_desc}</text>
    <text x="0" y="410" font-family="sans-serif" font-size="10" font-weight="700" fill="#059669">Impact: {p2_imp}</text>

    <!-- Assessment Performance -->
    <text x="0" y="458" font-family="sans-serif" font-size="13" font-weight="800" fill="#1e1b4b" letter-spacing="1">OFFICIAL ASSESSMENT SCORE</text>
    <line x1="0" y1="464" x2="390" y2="464" stroke="#6366f1" stroke-width="1.5"/>
    <rect x="0" y="478" width="390" height="70" rx="6" fill="#f1f5f9" stroke="#cbd5e1"/>
    <text x="16" y="503" font-family="sans-serif" font-size="12" font-weight="800" fill="#1e1b4b">20-Question Technical &amp; Aptitude Exam: {score_pct}%</text>
    <text x="16" y="523" font-family="sans-serif" font-size="10" fill="#475569">Status: Verified Completed &bull; Score: {correct_cnt}/20 Correct</text>
    <text x="16" y="538" font-family="sans-serif" font-size="9.5" fill="#6366f1">Tested: Python, Java, C, DBMS, System Architecture, Aptitude</text>
  </g>
</svg>"""
        with open(resume_path, 'w', encoding='utf-8') as f:
            f.write(resume_svg)

    print(f"Successfully generated certificate and resume SVG image assets for all {len(INITIAL_EMPLOYEES)} employees!")

if __name__ == "__main__":
    generate_all_assets()
