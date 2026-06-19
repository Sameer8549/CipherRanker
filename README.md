# CipherRanker

Candidate ranking engine for the Redrob Hackathon. Ranks 100k profiles in ~30 seconds on CPU.

---

## The Problem With Keyword Rankers

A naive keyword counter will rank an HR manager who listed "AI" and "Python" in their skills
above an ML engineer with 7 years of deployment experience. It will also reward anyone who
copies the job description into their bio. Expert skills with zero months of usage score the
same as skills someone has been using for three years. This approach does not work for
technical hiring.

---

## How It Works

Five components produce a base score. A behavioral multiplier adjusts it downward for
candidates who are effectively unreachable.

**Career track (weight: 0.30)**
Title quality, company type (IT services vs product), and whether the work history
mentions actual deployment signals — shipped, production, real users.

**Skill match (weight: 0.25)**
Skills are weighted by proficiency level, months used, and endorsement count. A skill
marked "expert" with zero duration is skipped. Assessment scores below 40 halve the
contribution.

**Experience years (weight: 0.15)**
5–9 years scores 1.0 for this JD. Under 3 scores 0.3. Over 12 scores 0.6 — the role
needs someone who still writes code.

**Location (weight: 0.15)**
India-first. Pune, Noida, Gurugram, Bangalore preferred. Willing-to-relocate partially
offsets an unfavorable location.

**Education (weight: 0.05)**
Tier-based with a field-of-study bonus. Kept at 5% because a tier-1 degree from someone
who hasn't shipped anything is not useful signal at this weight.

**Behavioral multiplier**
A candidate who hasn't logged in for 6 months and has a 12% recruiter response rate is
not actually hirable. The behavioral multiplier handles this. It factors in last active
date, open-to-work flag, notice period, GitHub activity, interview completion rate, and
salary expectations. Clamped to [0.4, 1.0] so even dead profiles get a floor.

**Honeypot detection**
Duration-weighted scoring handles most synthetic records naturally — an expert skill with
zero months used scores near zero. A separate filter catches literal markers, zero-entropy
text, and implausible experience totals.

---

## Design Decisions

**No embeddings.**
100k candidates times an embedding call won't fit inside a 5-minute CPU budget. Beyond
that, embedding models over-rank buzzword-heavy summaries over real deployment experience.
A candidate who writes "semantic search, dense retrieval, bi-encoder, cross-encoder" in
their bio scores higher than one who quietly built the system. Token overlap resists this.

**No LLM API calls.**
The spec disallows external API calls. Also the correct call regardless — a ranker that
needs GPT-4 per candidate does not scale and introduces non-determinism.

**Behavioral multiplier, not additive.**
Treating behavioral signals as additive lets unreachable candidates rank high if their
skills are good. Multiplicative means 0.9 skill score times 0.5 behavioral multiplier
equals 0.45. Unavailability tanks the final score.

**Career track at highest weight.**
The job description is explicit about the trap: titles, company types, and deployment
language are stronger anti-stuffing signals than keyword density alone.

---

## Scoring Formula

```
final_score  = base_score * behavioral_multiplier

base_score   = (career     * 0.30
              + skills     * 0.25
              + experience * 0.15
              + location   * 0.15
              + education  * 0.05)

behavioral_multiplier → clamped [0.4, 1.0]
```

---

## Results

```
candidates processed : 100,000
honeypots detected   : 500
top-100 score range  : 0.7955 → 0.8792
honeypots in top-100 : 0
wall time            : 29.58s
validation           : PASSED
```

---

## Reproduce

```bash
pip install python-dateutil
python rank.py --candidates ./candidates.jsonl --out ./team_cipher.csv
python validate_submission.py team_cipher.csv
```

Runs in ~30s. No GPU. No internet.

---

## Repo Structure

```
CipherRanker/
├── rank.py
├── scorer.py
├── honeypot.py
├── reasoning.py
├── validate_submission.py
├── submission_metadata.yaml
├── requirements.txt
└── README.md
```

---

## Limitations

- Score range is narrow (0.79–0.88). The JD is niche. Few candidates match all five
  components at once, which compresses the distribution.
- 500 honeypots flagged may include false positives. The duration-zero check is aggressive.
- No semantic understanding. Token overlap catches "Python" but not "wrote the ETL in Go
  that replaced the Python pipeline".
- Non-standard location strings will mislabel candidates. "Bengaluru" and "Bangalore" are
  handled; creative spellings are not.

---

## Built By

Team Cipher — Abdul Sameer — HKBK College of Engineering, Bengaluru
Redrob Hackathon 2026
