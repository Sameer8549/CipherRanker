"""
generate_redrob_sample.py
Generates sample_candidates.json matching the Redrob schema used by CipherRanker.
Run: python generate_redrob_sample.py
"""
import json, random, datetime

random.seed(42)

TITLES = [
    "Senior ML Engineer", "NLP Engineer", "Applied Scientist",
    "Search Engineer", "ML Research Engineer", "AI Engineer",
    "Data Scientist", "Backend Engineer", "Software Engineer",
    "DevOps Engineer", "Ranking Engineer", "Applied ML Engineer",
]
COMPANIES = [
    "Flipkart", "Google", "Microsoft", "Amazon", "Meesho", "PhonePe",
    "Razorpay", "Zomato", "TCS", "Infosys", "Wipro", "Swiggy",
    "CRED", "BrowserStack", "HashedIn",
]
CITIES = [
    "Bangalore", "Pune", "Hyderabad", "Noida", "Mumbai", "Gurugram",
    "Chennai", "Delhi", "Bengaluru", "New Delhi",
]
SKILLS_POOL = [
    {"name": "Python",                  "proficiency": "expert",       "duration_months": 60, "endorsements": 45},
    {"name": "sentence-transformers",  "proficiency": "advanced",     "duration_months": 24, "endorsements": 12},
    {"name": "FAISS",                   "proficiency": "advanced",     "duration_months": 18, "endorsements": 8},
    {"name": "Elasticsearch",          "proficiency": "advanced",     "duration_months": 30, "endorsements": 15},
    {"name": "PyTorch",                 "proficiency": "advanced",     "duration_months": 36, "endorsements": 20},
    {"name": "Transformers (HF)",       "proficiency": "expert",       "duration_months": 24, "endorsements": 18},
    {"name": "RAG",                     "proficiency": "intermediate", "duration_months": 12, "endorsements": 5},
    {"name": "LLM fine-tuning",         "proficiency": "advanced",     "duration_months": 12, "endorsements": 9},
    {"name": "BM25",                    "proficiency": "intermediate", "duration_months": 8,  "endorsements": 3},
    {"name": "Kubernetes",              "proficiency": "intermediate", "duration_months": 18, "endorsements": 6},
    {"name": "MLflow",                  "proficiency": "intermediate", "duration_months": 14, "endorsements": 4},
    {"name": "XGBoost",                 "proficiency": "advanced",     "duration_months": 24, "endorsements": 11},
    {"name": "Docker",                  "proficiency": "advanced",     "duration_months": 30, "endorsements": 10},
    {"name": "Pinecone",                "proficiency": "intermediate", "duration_months": 10, "endorsements": 4},
    {"name": "Qdrant",                  "proficiency": "intermediate", "duration_months": 8,  "endorsements": 3},
    {"name": "Java",                    "proficiency": "intermediate", "duration_months": 36, "endorsements": 7},
    {"name": "Spark",                   "proficiency": "intermediate", "duration_months": 24, "endorsements": 8},
    {"name": "A/B Testing",             "proficiency": "intermediate", "duration_months": 18, "endorsements": 6},
]
EDUCATIONS = [
    {"degree": "B.Tech", "field_of_study": "Computer Science", "institution": "IIT Bombay",   "tier": "tier_1"},
    {"degree": "M.Tech", "field_of_study": "Data Science",     "institution": "IIT Delhi",    "tier": "tier_1"},
    {"degree": "B.E",    "field_of_study": "Computer Science", "institution": "NIT Trichy",   "tier": "tier_2"},
    {"degree": "B.Tech", "field_of_study": "Information Technology", "institution": "BITS",   "tier": "tier_2"},
    {"degree": "M.Sc",   "field_of_study": "Machine Learning", "institution": "IISc",        "tier": "tier_1"},
    {"degree": "B.Tech", "field_of_study": "Electronics",      "institution": "VIT",          "tier": "tier_3"},
    {"degree": "MBA",    "field_of_study": "Information Systems","institution": "IIM Ahmedabad","tier": "tier_1"},
]

now = datetime.datetime.now()

def make_candidate(i):
    title       = random.choice(TITLES)
    company     = random.choice(COMPANIES)
    city        = random.choice(CITIES)
    yoe         = round(random.uniform(2, 14), 1)
    skills      = random.sample(SKILLS_POOL, k=random.randint(4, 10))
    edu         = random.choice(EDUCATIONS)
    notice      = random.choice([15, 30, 45, 60, 90, 120])
    github_score = random.choice([-1, -1, 20, 45, 62, 78, 90])
    days_ago    = random.randint(1, 200)
    last_active = (now - datetime.timedelta(days=days_ago)).strftime("%Y-%m-%d")
    rr          = round(random.uniform(0.1, 0.95), 2)
    icr         = round(random.uniform(0.4, 1.0),  2)
    sal_min     = random.choice([18, 22, 28, 35, 42, 50])
    sal_max     = sal_min + random.randint(5, 20)

    history_months = max(int(yoe * 12) - random.randint(0, 6), 12)

    return {
        "candidate_id": f"CAND_{i:07d}",
        "profile": {
            "current_title"       : title,
            "location"            : city,
            "country"             : "India",
            "years_of_experience" : yoe,
            "headline"            : f"{title} at {company}",
        },
        "skills": skills,
        "education": [edu],
        "career_history": [
            {
                "company"         : company,
                "title"           : title,
                "duration_months" : history_months,
                "description"     : f"Built retrieval and ranking systems using embeddings, vector search, and production ML pipelines. Shipped features to millions of users.",
            }
        ],
        "redrob_signals": {
            "last_active_date"            : last_active,
            "open_to_work_flag"           : random.choice([True, True, False]),
            "notice_period_days"          : notice,
            "github_activity_score"       : github_score,
            "recruiter_response_rate"     : rr,
            "interview_completion_rate"   : icr,
            "offer_acceptance_rate"       : round(random.uniform(0.3, 0.9), 2),
            "verified_email"              : True,
            "verified_phone"              : random.choice([True, False]),
            "willing_to_relocate"         : random.choice([True, False]),
            "expected_salary_range_inr_lpa": {"min": sal_min, "max": sal_max},
            "skill_assessment_scores"     : {
                s["name"]: random.randint(40, 100) for s in skills
            },
        },
    }

# 5 honeypots
def make_honeypot(i):
    c = make_candidate(i)
    hp_type = i % 3
    if hp_type == 0:
        # Expert skill with 0 duration
        c["skills"][0]["proficiency"]    = "expert"
        c["skills"][0]["duration_months"] = 0
    elif hp_type == 1:
        # Many experts, zero endorsements
        for s in c["skills"]:
            s["proficiency"]  = "expert"
            s["endorsements"] = 0
    else:
        # Offer accepted, zero interview completion
        c["redrob_signals"]["offer_acceptance_rate"]       = 0.8
        c["redrob_signals"]["interview_completion_rate"]   = 0.0
    c["candidate_id"] = f"HP_{i:07d}"
    return c

candidates = [make_candidate(i) for i in range(1, 51)]
honeypots  = [make_honeypot(i) for i in range(51, 56)]
all_cands  = candidates + honeypots
random.shuffle(all_cands)

with open("sample_candidates.json", "w") as f:
    json.dump(all_cands, f, indent=2)

print(f"Written {len(all_cands)} candidates to sample_candidates.json")
print(f"  Real: {len(candidates)}, Honeypots: {len(honeypots)}")
