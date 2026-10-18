"""
LeadSync IT & Computer Skills Taxonomy
Covers all primary IT and computer science skill domains for HR candidate evaluation.
"""

IT_SKILLS_CATALOG = {
    "Languages": [
        "Python", "Java", "C", "C++", "C#", "JavaScript", "TypeScript", 
        "Go", "Rust", "PHP", "Ruby", "Swift", "Kotlin", "SQL", 
        "Bash/Shell", "R", "Scala", "Dart", "Perl", "Assembly", "Lua"
    ],
    "Frontend & Web": [
        "React", "Next.js", "Vue.js", "Angular", "Node.js", "HTML5", 
        "CSS3", "Tailwind CSS", "SASS/SCSS", "Redux", "Svelte", 
        "Vite", "Webpack", "REST APIs", "GraphQL", "WebSockets"
    ],
    "Backend & Frameworks": [
        "FastAPI", "Django", "Flask", "Spring Boot", "ASP.NET Core", 
        "Express.js", "NestJS", "Ruby on Rails", "Laravel", "Microservices", 
        "gRPC", "Apache Kafka", "RabbitMQ", "Celery", "Event-Driven Architecture"
    ],
    "Cloud & DevOps": [
        "AWS", "Microsoft Azure", "Google Cloud (GCP)", "Docker", 
        "Kubernetes", "Terraform", "Ansible", "CI/CD Pipelines", 
        "GitHub Actions", "Jenkins", "Linux Admin", "Helm", 
        "Prometheus", "Grafana", "Nginx", "SRE"
    ],
    "Databases & Big Data": [
        "PostgreSQL", "MySQL", "MongoDB", "Redis", "Oracle Database", 
        "SQL Server", "Cassandra", "Elasticsearch", "DynamoDB", "Neo4j", 
        "Apache Spark", "Apache Hadoop", "Snowflake", "Databricks", "ETL Pipelines"
    ],
    "AI & Data Science": [
        "Machine Learning", "Deep Learning", "PyTorch", "TensorFlow", 
        "Scikit-learn", "Pandas", "NumPy", "NLP", "Computer Vision", 
        "LLMs & Generative AI", "RAG Systems", "Hugging Face", "MLOps", "Prompt Engineering"
    ],
    "Cybersecurity & Networks": [
        "Network Security", "Penetration Testing", "IAM", "OWASP Top 10", 
        "Cryptography", "Firewalls & VPNs", "SOC Analysis", "Zero Trust Architecture", 
        "SSL/TLS", "SIEM"
    ],
    "Systems & Architecture": [
        "System Design", "Distributed Systems", "Concurrency & Multithreading", 
        "Operating Systems", "Embedded Systems", "High Availability", "Database Indexing & Sharding"
    ],
    "Leadership & Practices": [
        "Agile / Scrum", "Sprint Planning", "Jira", "Technical Leadership", 
        "Engineering Mentorship", "Code Review", "Stakeholder Management", "Incident Response"
    ]
}

# Flat list of all skill names
ALL_IT_SKILLS = []
for category, skills in IT_SKILLS_CATALOG.items():
    for sk in skills:
        if sk not in ALL_IT_SKILLS:
            ALL_IT_SKILLS.append(sk)
