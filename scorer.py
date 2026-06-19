"""
scorer.py — 5-component weighted scorer for CipherRanker.

Provides:
  - score_candidate(candidate: dict, weights: dict | None, current_year: int | None)
        -> dict  (all component scores + final_score)

Components
----------
  skill      (default 30%) — log-scaled keyword density, stuffing-resistant
  experience (default 25%) — seniority titles + explicit year counts
  education  (default 15%) — highest degree signal
  activity   (default 20%) — recency of year mentions in profile
  diversity  (default 10%) — fraction of 8 domains touched

Behavioral multiplier: ∈ [0.5, 1.5]
  Boosts: GitHub, publications, certifications, open source, portfolio
  Penalises: employment gaps, extremely thin profiles
"""

import math
import re
import time
from typing import Any

# ---------------------------------------------------------------------------
# Default weights (must sum to 1.0)
# ---------------------------------------------------------------------------
DEFAULT_WEIGHTS: dict[str, float] = {
    "skill"      : 0.30,
    "experience" : 0.25,
    "education"  : 0.15,
    "activity"   : 0.20,
    "diversity"  : 0.10,
}

BEH_MIN = 0.5
BEH_MAX = 1.5

# ---------------------------------------------------------------------------
# Keyword dictionaries
# ---------------------------------------------------------------------------

SKILL_KEYWORDS: set[str] = {
    # Languages
    "python", "java", "javascript", "typescript", "c++", "c#", "go", "rust",
    "kotlin", "swift", "scala", "r", "julia", "sql", "bash", "perl", "ruby",
    "php", "elixir", "haskell", "dart", "matlab", "groovy",
    # Frameworks / libraries
    "tensorflow", "pytorch", "keras", "scikit-learn", "sklearn", "pandas",
    "numpy", "spark", "hadoop", "kafka", "airflow", "dbt", "fastapi",
    "django", "flask", "react", "angular", "vue", "node", "spring", "rails",
    "nextjs", "svelte", "express", "graphql", "grpc",
    # Cloud / infra
    "aws", "gcp", "azure", "docker", "kubernetes", "k8s", "terraform",
    "ansible", "jenkins", "ci/cd", "github actions", "gitlab", "helm",
    "prometheus", "grafana", "datadog", "splunk",
    # Data / ML
    "machine learning", "deep learning", "nlp", "computer vision",
    "reinforcement learning", "llm", "transformer", "bert", "gpt",
    "data engineering", "data science", "mlops", "feature engineering",
    "a/b testing", "statistics", "probability", "time series",
    "recommendation system", "data pipeline", "etl",
    # Databases
    "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "cassandra",
    "bigquery", "snowflake", "redshift", "dynamodb", "neo4j", "sqlite",
}

_MAX_SKILL_HITS = 40  # log-scale cap

EXPERIENCE_TITLES: dict[str, float] = {
    "cto": 6, "vp of engineering": 6, "vp engineering": 6,
    "director": 5, "head of": 5, "principal": 4, "staff": 4,
    "architect": 4, "lead": 3, "senior": 3, "manager": 3,
    "mid": 2, "mid-level": 2, "associate": 1, "junior": 1,
    "entry": 1, "intern": 0,
}

_YR_RE = re.compile(
    r"(\d+)\s*(?:\+|-)?\s*(?:\d+\s*)?year[s]?\s*(?:of\s+)?(?:experience)?",
    re.IGNORECASE,
)

EDUCATION_MAP: dict[str, float] = {
    "phd": 1.0, "ph.d": 1.0, "ph.d.": 1.0, "doctorate": 1.0, "doctoral": 1.0,
    "master": 0.75, "msc": 0.75, "m.sc": 0.75, " ms ": 0.75, "mba": 0.70,
    "bachelor": 0.50, "bsc": 0.50, "b.sc": 0.50, "b.e": 0.50, "b.tech": 0.50,
    "b.s.": 0.50, "undergraduate": 0.45,
    "associate": 0.25, "diploma": 0.20, "a.a.": 0.20,
    "bootcamp": 0.15, "self-taught": 0.10, "online course": 0.10,
    "coursera": 0.12, "udemy": 0.10, "edx": 0.12,
}

ACTIVITY_RECENCY: dict[int, float] = {
    0: 1.00,  # current year
    1: 0.90,
    2: 0.75,
    3: 0.55,
    4: 0.35,
    5: 0.20,
}
_ACTIVITY_FALLBACK = 0.10

DIVERSITY_DOMAINS: list[set[str]] = [
    {"frontend", "ui", "ux", "css", "html", "design", "figma", "tailwind"},
    {"backend", "server", "api", "rest", "graphql", "microservice", "grpc"},
    {"data", "analytics", "bi", "reporting", "dashboard", "warehouse"},
    {"machine learning", "ml", "ai", "model", "training", "inference", "nlp"},
    {"devops", "sre", "infra", "infrastructure", "cloud", "deployment", "ci/cd"},
    {"mobile", "android", "ios", "flutter", "react native", "swift", "kotlin"},
    {"security", "cybersecurity", "pentest", "soc", "devsecops", "compliance"},
    {"blockchain", "web3", "smart contract", "defi", "solidity"},
]


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

def _flatten(candidate: dict) -> str:
    """Flatten all string values in a candidate dict into one lowercase blob."""
    parts: list[str] = []

    def _collect(obj: Any) -> None:
        if isinstance(obj, str):
            parts.append(obj)
        elif isinstance(obj, (int, float)):
            parts.append(str(obj))
        elif isinstance(obj, list):
            for item in obj:
                _collect(item)
        elif isinstance(obj, dict):
            for v in obj.values():
                _collect(v)

    _collect(candidate)
    return " ".join(parts).lower()


# ---------------------------------------------------------------------------
# Component scorers
# ---------------------------------------------------------------------------

def score_skill(text: str) -> float:
    """Log-scaled keyword density — diminishing returns past ~20 hits."""
    hits = sum(1 for kw in SKILL_KEYWORDS if kw in text)
    return round(min(math.log1p(hits) / math.log1p(_MAX_SKILL_HITS), 1.0), 6)


def score_experience(text: str, candidate: dict) -> float:
    """Combines seniority title signal with explicit year-count extraction."""
    # Check structured fields first
    explicit_years = None
    for field in ("years_of_experience", "years_experience", "experience_years", "years"):
        val = candidate.get(field)
        if val is not None:
            try:
                explicit_years = float(str(val).replace("+", "").strip())
                break
            except ValueError:
                pass

    # Title signal from structured field or text
    title_raw = candidate.get("current_title", "") or candidate.get("title", "") or ""
    title_text = (title_raw + " " + text).lower()
    title_score = 0.0
    for kw, weight in EXPERIENCE_TITLES.items():
        if kw in title_text:
            title_score = max(title_score, weight / 6.0)

    # Year count from text if not in structured field
    if explicit_years is None:
        years = [int(m) for m in _YR_RE.findall(text)]
        explicit_years = min(max(years), 25) if years else 0.0
    else:
        explicit_years = min(explicit_years, 25)

    yr_score = explicit_years / 25.0
    combined = min(title_score * 0.4 + yr_score * 0.6, 1.0)
    return round(combined, 6)


def score_education(text: str, candidate: dict) -> float:
    """Highest education level found."""
    # Prefer structured field
    edu_field = str(candidate.get("education", "") or candidate.get("highest_education", "") or "").lower()
    search_text = edu_field + " " + text
    best = 0.0
    for kw, val in EDUCATION_MAP.items():
        if kw in search_text:
            best = max(best, val)
    return round(best, 6)


def score_activity(text: str, current_year: int) -> float:
    """Recency score based on the most recent 4-digit year found in profile."""
    year_mentions = [
        int(y) for y in re.findall(r"\b(20[0-2]\d|19[89]\d)\b", text)
    ]
    if not year_mentions:
        return 0.30  # neutral default
    most_recent = max(year_mentions)
    age = max(current_year - most_recent, 0)
    return round(ACTIVITY_RECENCY.get(age, _ACTIVITY_FALLBACK), 6)


def score_diversity(text: str) -> float:
    """Fraction of 8 industry domains touched."""
    touched = sum(
        1 for domain in DIVERSITY_DOMAINS
        if any(kw in text for kw in domain)
    )
    return round(touched / len(DIVERSITY_DOMAINS), 6)


def behavioral_multiplier(text: str) -> float:
    """Quality multiplier ∈ [BEH_MIN, BEH_MAX]."""
    mult = 1.0

    # Boosts
    if any(x in text for x in ["github.com", "gitlab.com", "bitbucket.org"]):
        mult += 0.08
    if any(x in text for x in ["publication", "arxiv", "patent", "paper", "conference", "journal"]):
        mult += 0.10
    if any(x in text for x in ["certified", "certification", "aws certified", "gcp certified", "azure certified"]):
        mult += 0.05
    if "open source" in text or "open-source" in text or "contributor" in text:
        mult += 0.05
    if any(x in text for x in ["portfolio", "personal project", "side project", "personal website"]):
        mult += 0.04
    if any(x in text for x in ["award", "scholarship", "fellowship", "prize", "winner"]):
        mult += 0.04

    # Penalties
    if "employment gap" in text or "career break" in text or "career gap" in text:
        mult -= 0.05
    if len(text) < 100:
        mult -= 0.12  # thin/empty profile

    return round(max(BEH_MIN, min(BEH_MAX, mult)), 4)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def normalize_weights(weights: dict[str, float]) -> dict[str, float]:
    """Ensure weights sum to 1.0 — renormalises if they don't."""
    total = sum(weights.values())
    if abs(total - 1.0) < 1e-9:
        return dict(weights)
    return {k: v / total for k, v in weights.items()}


def score_candidate(
    candidate: dict,
    weights: dict[str, float] | None = None,
    current_year: int | None = None,
) -> dict:
    """
    Score a single candidate.

    Parameters
    ----------
    candidate   : dict — raw candidate JSON object
    weights     : component weight override (subset OK; auto-renormalised)
    current_year: override for activity recency (default: system year)

    Returns
    -------
    dict with keys:
      candidate_id, current_title, years_of_experience,
      skill, experience, education, activity, diversity,
      beh_mult, raw_score, final_score
    """
    if current_year is None:
        current_year = time.localtime().tm_year

    # Merge provided weights with defaults, then normalise
    w = dict(DEFAULT_WEIGHTS)
    if weights:
        for k, v in weights.items():
            if k in w:
                w[k] = v
    w = normalize_weights(w)

    text = _flatten(candidate)

    s_skill  = score_skill(text)
    s_exp    = score_experience(text, candidate)
    s_edu    = score_education(text, candidate)
    s_act    = score_activity(text, current_year)
    s_div    = score_diversity(text)
    mult     = behavioral_multiplier(text)

    raw = (
        w["skill"]      * s_skill  +
        w["experience"] * s_exp    +
        w["education"]  * s_edu    +
        w["activity"]   * s_act    +
        w["diversity"]  * s_div
    )
    final = round(min(max(raw * mult, 0.0), 1.0), 6)

    # Extract human-readable structured fields
    cid   = (
        candidate.get("candidate_id")
        or candidate.get("id")
        or candidate.get("_id")
        or "unknown"
    )
    title = (
        candidate.get("current_title")
        or candidate.get("title")
        or candidate.get("role")
        or "—"
    )
    yoe = (
        candidate.get("years_of_experience")
        or candidate.get("years_experience")
        or candidate.get("experience_years")
        or "—"
    )

    return {
        "candidate_id"        : str(cid),
        "current_title"       : str(title),
        "years_of_experience" : yoe,
        # Component scores
        "skill"               : s_skill,
        "experience"          : s_exp,
        "education"           : s_edu,
        "activity"            : s_act,
        "diversity"           : s_div,
        # Multiplier & finals
        "beh_mult"            : mult,
        "raw_score"           : round(raw, 6),
        "final_score"         : final,
        # Active weights (for explain)
        "_weights"            : w,
    }


def score_batch(
    candidates: list[dict],
    weights: dict[str, float] | None = None,
    current_year: int | None = None,
) -> list[dict]:
    """Score a list of candidates and return sorted results (score DESC, id ASC)."""
    results = []
    for c in candidates:
        result = score_candidate(c, weights=weights, current_year=current_year)
        results.append(result)
    results.sort(key=lambda r: (-r["final_score"], r["candidate_id"]))
    return results
