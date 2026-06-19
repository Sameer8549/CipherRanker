"""
scorer.py — Rubric-driven weighted scorer for CipherRanker.

Uses rubric.json to extract weights, skill lists, experience ranges, locations, and red flags.
If rubric.json is not found, falls back to default values.
"""

import os
import json
import re
import time
from typing import Any

# ---------------------------------------------------------------------------
# Default Fallback Rubric
# ---------------------------------------------------------------------------
DEFAULT_RUBRIC = {
  "weights": {
    "career_track": 0.30,
    "skill_match": 0.25,
    "experience_years": 0.15,
    "location": 0.15,
    "education": 0.15
  },
  "must_have_skills": ["python", "pytorch", "tensorflow", "machine learning", "deep learning"],
  "nice_to_have_skills": ["aws", "gcp", "azure", "mlops", "docker", "kubernetes", "fastapi", "flask"],
  "ideal_experience_years": { "min": 5, "max": 9 },
  "preferred_locations": ["bangalore", "pune", "noida", "gurugram", "india"],
  "red_flag_titles": ["recruiter", "hr", "sales", "marketing", "accountant"],
  "red_flag_skills": ["typing", "accounting", "photoshop"],
  "career_track_keywords": ["shipped", "production", "real users", "deployment", "ml engineer", "data scientist", "backend engineer"],
  "notes": "Fallback default rubric"
}

# Load rubric
rubric = DEFAULT_RUBRIC
rubric_path = "rubric.json"
if os.path.exists(rubric_path):
    try:
        with open(rubric_path, "r", encoding="utf-8") as f:
            rubric = json.load(f)
        print(f"[INFO] Loaded AI-generated rubric from {rubric_path}")
    except Exception as e:
        print(f"[WARN] Error loading {rubric_path}: {e}. Using fallback.")

weights = rubric.get("weights", DEFAULT_RUBRIC["weights"])

# Ensure weights sum to 1.0
total_w = sum(weights.values())
if abs(total_w - 1.0) > 1e-9:
    weights = {k: v / total_w for k, v in weights.items()}

# Constants for behavioral multiplier
BEH_MIN = 0.5
BEH_MAX = 1.5

_YR_RE = re.compile(
    r"(\d+)\s*(?:\+|-)?\s*(?:\d+\s*)?year[s]?\s*(?:of\s+)?(?:experience)?",
    re.IGNORECASE,
)

EDUCATION_MAP = {
    "phd": 1.0, "ph.d": 1.0, "ph.d.": 1.0, "doctorate": 1.0, "doctoral": 1.0,
    "master": 0.85, "msc": 0.85, "m.sc": 0.85, " ms ": 0.85, "mba": 0.80,
    "bachelor": 0.65, "bsc": 0.65, "b.sc": 0.65, "b.e": 0.65, "b.tech": 0.65,
    "b.s.": 0.65, "undergraduate": 0.55,
    "associate": 0.35, "diploma": 0.30, "a.a.": 0.30,
    "bootcamp": 0.20, "self-taught": 0.15, "online course": 0.15,
}

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

def score_career_track(text: str, candidate: dict) -> float:
    """
    Score the career track component based on keywords and titles.
    Matches against career_track_keywords and applies penalties for red_flag_titles.
    """
    keywords = rubric.get("career_track_keywords", DEFAULT_RUBRIC["career_track_keywords"])
    red_flags = rubric.get("red_flag_titles", DEFAULT_RUBRIC["red_flag_titles"])
    
    title_raw = str(candidate.get("current_title", "") or candidate.get("title", "") or "").lower()
    profile_text = title_raw + " " + text
    
    # Keyword hits
    hits = sum(1 for kw in keywords if kw.lower() in profile_text)
    score = min(hits / 5.0, 1.0)
    
    # Red flags
    for rf in red_flags:
        if rf.lower() in title_raw:
            score *= 0.1
            break
            
    return round(score, 6)

def score_skill_match(text: str, candidate: dict) -> float:
    """
    Score the skills match component by checking both must-have and nice-to-have skills.
    Skill weightings are based on proficiency level, duration of use, and endorsements.
    Penalizes for any red_flag_skills.
    """
    must_haves = rubric.get("must_have_skills", DEFAULT_RUBRIC["must_have_skills"])
    nice_to_haves = rubric.get("nice_to_have_skills", DEFAULT_RUBRIC["nice_to_have_skills"])
    red_flags = rubric.get("red_flag_skills", DEFAULT_RUBRIC["red_flag_skills"])
    
    candidate_skills = candidate.get("skills", [])
    if not isinstance(candidate_skills, list):
        candidate_skills = []
        
    # Build a lookup of candidate skills
    c_skills_dict = {}
    for cs in candidate_skills:
        if isinstance(cs, dict) and "name" in cs:
            c_skills_dict[cs["name"].lower().strip()] = cs
            
    # Check red flags in candidate skills
    for rf in red_flags:
        if rf.lower() in c_skills_dict or rf.lower() in text:
            return 0.0

    def score_skill_list(skill_list):
        if not skill_list:
            return 1.0
        scores = []
        for sk in skill_list:
            sk_lower = sk.lower().strip()
            # Direct match or partial string match
            matched_cs = None
            if sk_lower in c_skills_dict:
                matched_cs = c_skills_dict[sk_lower]
            else:
                for name, cs in c_skills_dict.items():
                    if sk_lower in name or name in sk_lower:
                        matched_cs = cs
                        break
            
            if matched_cs:
                prof = str(matched_cs.get("proficiency", "beginner")).lower()
                dur = float(matched_cs.get("duration_months") or 0)
                endorse = float(matched_cs.get("endorsements") or 0)
                assessment = float(matched_cs.get("assessment_score") or 100)
                
                # Zero duration expert bypass
                if prof == "expert" and dur == 0:
                    scores.append(0.1)
                    continue
                    
                # Proficiency base score
                prof_scores = {"expert": 0.8, "advanced": 0.6, "intermediate": 0.4, "beginner": 0.2}
                base = prof_scores.get(prof, 0.2)
                
                # Duration and endorsement boosts
                dur_boost = min(dur / 36.0, 1.0) * 0.15
                endorse_boost = min(endorse / 10.0, 1.0) * 0.05
                
                s_score = base + dur_boost + endorse_boost
                
                # Assessment penalty
                if assessment < 40:
                    s_score *= 0.5
                    
                scores.append(min(s_score, 1.0))
            else:
                # Fallback to simple keyword search in flattened profile text
                if sk_lower in text:
                    scores.append(0.2)
                else:
                    scores.append(0.0)
        return sum(scores) / len(skill_list)

    must_have_score = score_skill_list(must_haves)
    nice_to_have_score = score_skill_list(nice_to_haves)
    
    final_score = must_have_score * 0.7 + nice_to_have_score * 0.3
    return round(final_score, 6)

def score_experience_years(text: str, candidate: dict) -> float:
    """
    Score candidate experience years against the ideal range.
    Ideal range scores 1.0, with linear penalties applied for under or over-seniority.
    """
    ideal = rubric.get("ideal_experience_years", DEFAULT_RUBRIC["ideal_experience_years"])
    min_exp = ideal.get("min", 5)
    max_exp = ideal.get("max", 9)
    
    explicit_years = None
    for field in ("years_of_experience", "years_experience", "experience_years", "years"):
        val = candidate.get(field)
        if val is not None:
            try:
                explicit_years = float(str(val).replace("+", "").strip())
                break
            except ValueError:
                pass
                
    if explicit_years is None:
        years = [int(m) for m in _YR_RE.findall(text)]
        explicit_years = min(max(years), 25) if years else 0.0
    else:
        explicit_years = min(explicit_years, 25)
        
    yoe = explicit_years
    
    if min_exp <= yoe <= max_exp:
        score = 1.0
    elif yoe < min_exp:
        # Linear scale up to min
        score = yoe / float(min_exp) if min_exp > 0 else 1.0
    else:
        # Gradual penalty for overexperience
        score = max(0.5, 1.0 - (yoe - max_exp) * 0.05)
        
    return round(score, 6)

def score_location(text: str, candidate: dict) -> float:
    """
    Score the location component based on preferred locations.
    Willing to relocate earns a partial score.
    """
    pref_locs = rubric.get("preferred_locations", DEFAULT_RUBRIC["preferred_locations"])
    profile_loc = str(candidate.get("location", "")).lower()
    
    # Direct match or partial match
    matched = False
    for loc in pref_locs:
        if loc.lower().strip() in profile_loc or loc.lower().strip() in text:
            matched = True
            break
            
    if matched:
        return 1.0
        
    # Relocation flag
    signals = candidate.get("redrob_signals", {})
    if signals.get("willing_to_relocate_flag") or "willing to relocate" in text:
        return 0.5
        
    return 0.1

def score_education(text: str, candidate: dict) -> float:
    """
    Score the education component by finding the highest degree attained.
    Relevance to job domain adds a bonus or maintains the score.
    """
    edu_field = str(candidate.get("education", "") or candidate.get("highest_education", "") or "").lower()
    search_text = edu_field + " " + text
    
    best = 0.15 # Minimum fallback score for any education
    for kw, val in EDUCATION_MAP.items():
        if kw in search_text:
            best = max(best, val)
            
    # Domain relevance check (CS, IT, engineering)
    relevant = False
    for kw in ["computer science", "software", "information technology", "engineering", "data science", "statistics", "mathematics"]:
        if kw in search_text:
            relevant = True
            break
            
    if not relevant and best > 0.3:
        best *= 0.8 # Apply penalty for unrelated degree field
        
    return round(best, 6)

def behavioral_multiplier(text: str) -> float:
    """
    Compute a behavioral multiplier based on profile completeness, recency of updates,
    and positive/negative professional indicators. Clamps the score between 0.5 and 1.5.
    """
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

def score_candidate(candidate: dict, current_year: int | None = None) -> dict:
    """
    Score a single candidate.

    Parameters
    ----------
    candidate   : dict — raw candidate JSON object
    current_year: unused, kept for compatibility

    Returns
    -------
    dict with keys:
      candidate_id, current_title, years_of_experience,
      skill, experience, education, activity, diversity,
      beh_mult, raw_score, final_score
    """
    text = _flatten(candidate)

    s_career = score_career_track(text, candidate)
    s_skill  = score_skill_match(text, candidate)
    s_exp    = score_experience_years(text, candidate)
    s_loc    = score_location(text, candidate)
    s_edu    = score_education(text, candidate)
    mult     = behavioral_multiplier(text)

    raw = (
        weights.get("career_track", 0.3)      * s_career +
        weights.get("skill_match", 0.25)      * s_skill  +
        weights.get("experience_years", 0.15) * s_exp    +
        weights.get("location", 0.15)         * s_loc    +
        weights.get("education", 0.15)        * s_edu
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
        # Component scores mapping to original front-end labels
        "skill"               : s_skill,
        "experience"          : s_exp,
        "education"           : s_edu,
        "activity"            : s_loc,
        "diversity"           : s_career,
        # Multiplier & finals
        "beh_mult"            : mult,
        "raw_score"           : round(raw, 6),
        "final_score"         : final,
        # Active weights (for explain)
        "_weights"            : weights,
    }

def score_batch(candidates: list[dict]) -> list[dict]:
    """Score a list of candidates and return sorted results (score DESC, id ASC)."""
    results = []
    for c in candidates:
        result = score_candidate(c)
        results.append(result)
    results.sort(key=lambda r: (-r["final_score"], r["candidate_id"]))
    return results
