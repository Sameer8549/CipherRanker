"""
reasoning.py — Human-readable reasoning generator for CipherRanker.

Provides:
  - generate_reasoning(score_result: dict) -> str
    Returns a 1–3 sentence plain-English summary explaining why a candidate
    scored the way they did, based on which components drove or dragged the score.
"""

from __future__ import annotations


# ---------------------------------------------------------------------------
# Threshold helpers
# ---------------------------------------------------------------------------

def _tier(score: float) -> str:
    if score >= 0.80:   return "excellent"
    if score >= 0.60:   return "strong"
    if score >= 0.40:   return "moderate"
    if score >= 0.20:   return "weak"
    return "very low"


def _skill_label(score: float) -> str:
    if score >= 0.80: return "a very broad, deep skill set"
    if score >= 0.55: return "a solid skill set"
    if score >= 0.35: return "a narrow skill set"
    return "limited technical skills"


def _exp_label(score: float, yoe) -> str:
    yoe_str = f" ({yoe} yrs)" if yoe and str(yoe) not in ("—", "", "None") else ""
    if score >= 0.80: return f"extensive senior/principal-level experience{yoe_str}"
    if score >= 0.55: return f"solid mid-to-senior experience{yoe_str}"
    if score >= 0.30: return f"early-to-mid career experience{yoe_str}"
    return f"limited experience signals{yoe_str}"


def _edu_label(score: float) -> str:
    if score >= 0.90: return "PhD-level education"
    if score >= 0.70: return "a Master's or MBA"
    if score >= 0.45: return "a Bachelor's degree"
    if score >= 0.15: return "vocational or self-taught credentials"
    return "no clear education signal"


def _act_label(score: float) -> str:
    if score >= 0.90: return "very recently active"
    if score >= 0.70: return "active within the last 1–2 years"
    if score >= 0.40: return "active a few years ago"
    return "showing low recent activity"


def _div_label(score: float) -> str:
    if score >= 0.75: return "spans many domains (frontend, backend, ML, infra, etc.)"
    if score >= 0.50: return "covers several domains"
    if score >= 0.25: return "focused in one or two areas"
    return "domain coverage is very narrow"


def _mult_label(mult: float) -> str | None:
    if mult >= 1.25: return "strong quality signals (GitHub, publications, certifications)"
    if mult >= 1.10: return "good quality signals"
    if mult <= 0.75: return "penalised for a thin or low-quality profile"
    return None


# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------

def generate_reasoning(score_result: dict) -> str:
    """
    Generate a 2–3 sentence plain-English explanation for a candidate's score.

    Parameters
    ----------
    score_result : dict — output from scorer.score_candidate()

    Returns
    -------
    str — human-readable reasoning (no newlines)
    """
    s   = score_result.get("skill",      0.0)
    e   = score_result.get("experience", 0.0)
    edu = score_result.get("education",  0.0)
    a   = score_result.get("activity",   0.0)
    d   = score_result.get("diversity",  0.0)
    m   = score_result.get("beh_mult",   1.0)
    fin = score_result.get("final_score",0.0)
    yoe = score_result.get("years_of_experience", "—")
    title = score_result.get("current_title", "")
    w   = score_result.get("_weights", {})

    # Identify strongest and weakest component (by weighted contribution)
    components = {
        "skill"     : s   * w.get("skill",      0.30),
        "experience": e   * w.get("experience", 0.25),
        "education" : edu * w.get("education",  0.15),
        "activity"  : a   * w.get("activity",   0.20),
        "diversity" : d   * w.get("diversity",  0.10),
    }
    ranked = sorted(components.items(), key=lambda x: x[1], reverse=True)
    top2   = ranked[:2]
    bottom = ranked[-1]

    # ── Sentence 1: overall verdict ────────────────────────────────────────
    if fin >= 0.85:
        verdict = "Top-tier candidate"
    elif fin >= 0.70:
        verdict = "Strong candidate"
    elif fin >= 0.55:
        verdict = "Solid candidate"
    elif fin >= 0.40:
        verdict = "Average candidate"
    elif fin >= 0.25:
        verdict = "Below-average candidate"
    else:
        verdict = "Weak candidate"

    title_clause = f" ({title})" if title and title not in ("—", "") else ""
    sent1 = f"{verdict}{title_clause} with a final score of {fin:.3f}."

    # ── Sentence 2: what drove the score ──────────────────────────────────
    top_name1, _ = top2[0]
    top_name2, _ = top2[1]

    driver_map = {
        "skill"     : _skill_label(s),
        "experience": _exp_label(e, yoe),
        "education" : _edu_label(edu),
        "activity"  : _act_label(a),
        "diversity" : _div_label(d),
    }
    sent2 = (
        f"Score driven primarily by {driver_map[top_name1]}, "
        f"supported by {driver_map[top_name2]}."
    )

    # ── Sentence 3: behavioural / weakness note ────────────────────────────
    mult_note = _mult_label(m)
    bottom_name, bottom_contrib = bottom

    parts = []
    if mult_note:
        parts.append(mult_note.capitalize() + ".")

    if bottom_contrib < 0.05:
        drag_map = {
            "skill"     : "technical skill breadth is limited",
            "experience": "experience signals are weak",
            "education" : "no strong education credential detected",
            "activity"  : "profile shows low recency",
            "diversity" : "domain coverage is very narrow",
        }
        parts.append(f"Main drag: {drag_map[bottom_name]}.")

    sent3 = " ".join(parts) if parts else ""

    sentences = [sent1, sent2]
    if sent3:
        sentences.append(sent3)

    return " ".join(sentences)


# ---------------------------------------------------------------------------
# Batch convenience
# ---------------------------------------------------------------------------

def add_reasoning(score_results: list[dict]) -> list[dict]:
    """
    Add a 'reasoning' key to each result dict in place.
    Returns the same list (mutated).
    """
    for r in score_results:
        r["reasoning"] = generate_reasoning(r)
    return score_results
