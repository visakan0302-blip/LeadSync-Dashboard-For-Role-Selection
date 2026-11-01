"""
LeadSync IT & Computer Skills Taxonomy
Covers all primary IT and computer science skill domains for HR candidate evaluation.
"""

IT_SKILLS_CATALOG = {
    "Languages": [
        "Python", "Java", "C", "C++", "C#", "JavaScript", "TypeScript", 
        "Go", "Rust", "PHP", "Ruby", "Swift", "Kotlin", "SQL", 
        "Bash/Shell", "R", "Scala", "Dart", "Perl", "Assembly", "Lua", "MATLAB", "Solidity"
    ],
    "Frontend & Web": [
        "React", "Next.js", "Vue.js", "Nuxt.js", "Angular", "Node.js", "HTML5", 
        "CSS3", "Tailwind CSS", "Bootstrap", "SASS/SCSS", "Redux", "Zustand", "Svelte", 
        "Vite", "Webpack", "REST APIs", "GraphQL", "WebSockets", "Progressive Web Apps (PWA)"
    ],
    "Backend & Frameworks": [
        "FastAPI", "Django", "Flask", "Spring Boot", "ASP.NET Core", 
        "Express.js", "NestJS", "Ruby on Rails", "Laravel", "Gin (Go)", "Actix (Rust)",
        "Microservices", "gRPC", "Apache Kafka", "RabbitMQ", "Celery", "Event-Driven Architecture", "GraphQL APIs"
    ],
    "Cloud & DevOps": [
        "AWS", "Microsoft Azure", "Google Cloud (GCP)", "Docker", 
        "Kubernetes", "Terraform", "Ansible", "CI/CD Pipelines", 
        "GitHub Actions", "GitLab CI", "Jenkins", "Linux Admin", "Helm", 
        "Prometheus", "Grafana", "Nginx", "SRE", "CloudFormation", "ArgoCD"
    ],
    "Databases & Big Data": [
        "PostgreSQL", "MySQL", "MongoDB", "Redis", "Oracle Database", 
        "SQL Server", "SQLite", "Cassandra", "Elasticsearch", "DynamoDB", "Neo4j", 
        "Firebase / Firestore", "Supabase", "Apache Spark", "Apache Hadoop", "Snowflake", "Databricks", "ETL Pipelines"
    ],
    "AI & Data Science": [
        "Machine Learning", "Deep Learning", "PyTorch", "TensorFlow", 
        "Scikit-learn", "Pandas", "NumPy", "NLP", "Computer Vision", 
        "LLMs & Generative AI", "RAG Systems", "LangChain", "LlamaIndex", "Hugging Face", "MLOps", "Prompt Engineering", "Data Analysis & BI"
    ],
    "Cybersecurity & Networks": [
        "Network Security", "Penetration Testing", "IAM", "OWASP Top 10", 
        "Cryptography", "Firewalls & VPNs", "SOC Analysis", "Zero Trust Architecture", 
        "SSL/TLS", "SIEM", "Ethical Hacking", "Wireshark", "Vulnerability Assessment"
    ],
    "Systems & Architecture": [
        "System Design", "Distributed Systems", "Concurrency & Multithreading", 
        "Operating Systems", "Embedded Systems", "High Availability", "Database Indexing & Sharding", "Caching Architecture", "Load Balancing"
    ],
    "Mobile Development": [
        "Flutter", "React Native", "Android (Kotlin)", "iOS (Swift/SwiftUI)", "Mobile App Architecture", "Expo"
    ],
    "Testing & QA Automation": [
        "Unit Testing", "Integration Testing", "Selenium", "Cypress", "Playwright", "Jest", "PyTest", "Postman / API Testing", "Performance Testing"
    ],
    "Leadership & Practices": [
        "Agile / Scrum", "Sprint Planning", "Jira", "Technical Leadership", 
        "Engineering Mentorship", "Code Review", "Stakeholder Management", "Incident Response", "DevOps Culture", "Architecture RFCs"
    ]
}

# Flat list of all skill names
ALL_IT_SKILLS = []
for category, skills in IT_SKILLS_CATALOG.items():
    for sk in skills:
        if sk not in ALL_IT_SKILLS:
            ALL_IT_SKILLS.append(sk)
