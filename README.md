# LeadSync AI Talent Assessment & Leadership Succession Dashboard

An enterprise-grade talent assessment and succession planning platform built on **Python 3.14**, **FastAPI**, and modern **Vanilla HTML5 / CSS3 / JavaScript** with clean white theme aesthetics, AI candidate matching, and Chart.js analytics.

---

## 🌟 Key Features

### 1. Three Role-Based Dashboards
- **HR Dashboard (`hr_admin`)**:
  - Executive talent command center with **Top 3 Employee Results** on an Olympic podium (Gold, Silver, Bronze) with category score breakdowns.
  - Assessment management and scheduling wizard.
  - Ability to add new employees and expand the database.
  - Integrated **AI Role Matcher Quick Launcher**.
- **Manager Dashboard (`engineering_manager`)**:
  - Comprehensive department roster showing **all 15 employees**.
  - Real-time search, department filtering, assessment score progress bars, and succession readiness badges.
  - Quick action buttons to view full employee profiles and launch role suitability analyses.
- **Employee Self-Service Dashboard (`employee_self`)**:
  - View personal profile, verified production projects, and existing skill proficiencies.
  - Active assessment notification with date, time, and duration.
  - **Interactive 20-Question Test Runner** with a 30-minute countdown timer, question navigator, and instant auto-grading.

### 2. ⚡ AI Role Matcher & Perfect Candidate Discovery
- **Autonomous Candidate Evaluation**:
  - Scans all employee assessment results, verified production project histories, skill proficiencies, and tenure.
  - Calculates a multi-dimensional weighted score across:
    - **Core Skills Match (35%)**
    - **Production Projects Relevance (25%)**
    - **20-Question Assessment Fit (25%)**
    - **Experience & Seniority Fit (15%)**
- **#1 Best Perfect Employee Showcase**:
  - Crowns the top candidate with a gradient hero card, match confidence, readiness status (*Ready Now*, *Ready in 6-12 Months*, etc.).
  - AI Executive Justification narrative explaining why this candidate was chosen over peers.
  - Tailored **90-Day Transition & Onboarding Roadmap** (Days 1-30, Days 31-60, Days 61-90).
- **Head-to-Head Comparison**:
  - Side-by-side contrast between the #1 Best Match and the #2 Runner-Up with score advantage metrics.
- **Custom Job Description AI Auto-Extractor**:
  - Paste any free-text HR job description to automatically extract target experience, skill thresholds, and domain keywords with 1 click.
- **Formal Succession Appointment**:
  - 1-click formal appointment recorded directly into the persistent audit database.

### 3. HR Assessment Management & 20-Question Engine
- **Topics Covered**:
  - **Python** (Deferred evaluation, GIL, data structures, generators)
  - **C Programming** (Pointers, memory management, `volatile`, POSIX system calls)
  - **Java** (Virtual threads, concurrent collections, memory models)
  - **DBMS** (ACID transactions, clustered indexing, isolation levels, deadlocks, WAL)
  - **Other Technical Skills** (Distributed system design, CAP theorem, Docker, reverse proxies)
  - **Communication** (Incident reporting, design reviews, cross-functional alignment)
  - **Aptitude** (Logical deductions, time & work calculations, algorithmic complexity)
- **Automatic 20 Questions Assignment**:
  - Balanced question distribution across categories for every candidate.
  - HR sets date, time, and duration (mins).
  - Results immediately feed into the HR Top 3 Leaderboard and Manager's 15-Employee Roster.

### 4. Employee Database & Profiles (Initial 15 Employees)
- Initial database pre-seeded with 15 realistic engineering profiles (Alex Rivera, Priya Sharma, Marcus Chen, Sarah Jenkins, David Kim, Elena Rostova, etc.) with full career histories.
- Each profile displays verified production projects, tech stack tags, impact metrics, skill proficiencies, certifications, and assessment history.

### 5. Role Suitability Analysis Workspace
- Select any employee and evaluate them against the **5 Leadership Succession Roles**.
- **Interactive Simulation**: Adjust experience (years), project counts, assessment scores, and skill sliders in real time.
- **Visual Analytics**: Interactive Chart.js Radar Chart comparing Candidate vs. Target Role Benchmark.
- **AI Recommendation Engine**: Generates narrative strengths, critical skill gaps, and development timelines.

### 6. 5 Leadership Succession Roles Matrix
1. **Senior Software Engineer** (Architecture, Systems, Full-Stack Mentorship)
2. **AI/ML Engineer** (Machine Learning, PyTorch, Predictive Modeling, DBMS)
3. **DevOps Engineer** (Kubernetes, CI/CD, Terraform, Cloud Infrastructure)
4. **Database Administrator (DBA)** (High-Availability, Sharding, Query Tuning, ACID)
5. **Project Team Leader / Project Manager** (Agile Delivery, Stakeholder Management, Communication)

---

## 🚀 Running the Application with Python 3.14

### Launch Server
```bash
py -3.14 run.py
```

### Access URLs
- **Web Dashboard**: [http://127.0.0.1:8500](http://127.0.0.1:8500) (or current port shown on startup)
- **Interactive API Docs (Swagger UI)**: [http://127.0.0.1:8500/docs](http://127.0.0.1:8500/docs)
