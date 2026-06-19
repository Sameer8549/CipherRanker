#!/usr/bin/env python3
"""
validate_submission.py — Validates a Team Cipher submission CSV.

Checks:
  1. File exists and is readable.
  2. Has exactly the required header columns.
  3. Has exactly 100 data rows (+ header = 101 lines).
  4. All candidate_ids are non-empty strings.
  5. Scores are floats in [0.0, 1.0].
  6. Ranks are sequential integers 1..100.
  7. Rows are sorted: score DESC, candidate_id ASC (tie-break).
  8. No duplicate candidate_ids.

Usage:
    python validate_submission.py team_cipher.csv
"""

import csv
import sys
from pathlib import Path

REQUIRED_COLUMNS = ["rank", "candidate_id", "score", "is_honeypot", "hp_reason"]
EXPECTED_ROWS    = 100


def fail(msg: str) -> None:
    print(f"[FAIL] {msg}", file=sys.stderr)
    sys.exit(1)


def warn(msg: str) -> None:
    print(f"[WARN] {msg}")


def ok(msg: str) -> None:
    print(f"[ OK ] {msg}")


def validate(csv_path: Path) -> None:
    print(f"\nValidating: {csv_path}\n" + "-" * 50)

    # 1. File existence
    if not csv_path.exists():
        fail(f"File not found: {csv_path}")
    ok("File exists")

    # 2. Read CSV
    with open(csv_path, "r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        actual_cols = reader.fieldnames or []

        # 3. Header check
        missing = [c for c in REQUIRED_COLUMNS if c not in actual_cols]
        extra   = [c for c in actual_cols if c not in REQUIRED_COLUMNS]
        if missing:
            fail(f"Missing columns: {missing}")
        if extra:
            warn(f"Extra columns present (ignored): {extra}")
        ok(f"Header columns present: {REQUIRED_COLUMNS}")

        rows = list(reader)

    # 4. Row count
    if len(rows) != EXPECTED_ROWS:
        fail(f"Expected exactly {EXPECTED_ROWS} data rows, got {len(rows)}")
    ok(f"Exactly {EXPECTED_ROWS} data rows")

    # 5. Per-row validation
    seen_ids  = {}
    prev_score = None
    prev_cid   = None

    for i, row in enumerate(rows, start=1):
        row_label = f"Row {i}"

        # Rank
        try:
            rank_val = int(row["rank"])
        except (ValueError, KeyError):
            fail(f"{row_label}: 'rank' is not an integer — got {row.get('rank')!r}")
        if rank_val != i:
            fail(f"{row_label}: expected rank={i}, got rank={rank_val}")

        # candidate_id
        cid = row.get("candidate_id", "").strip()
        if not cid:
            fail(f"{row_label}: 'candidate_id' is empty")
        if cid in seen_ids:
            fail(f"{row_label}: duplicate candidate_id '{cid}' (first seen at row {seen_ids[cid]})")
        seen_ids[cid] = i

        # Score
        try:
            score = float(row["score"])
        except (ValueError, KeyError):
            fail(f"{row_label}: 'score' is not a float — got {row.get('score')!r}")
        if not (0.0 <= score <= 1.0):
            fail(f"{row_label}: score {score} is outside [0.0, 1.0]")

        # Sort order: score DESC, candidate_id ASC
        if prev_score is not None:
            if score > prev_score:
                fail(
                    f"{row_label}: scores not in descending order — "
                    f"{score} > previous {prev_score}"
                )
            if score == prev_score and prev_cid is not None:
                if cid < prev_cid:
                    fail(
                        f"{row_label}: tie-break violated — "
                        f"candidate_id '{cid}' < previous '{prev_cid}' but same score"
                    )

        # is_honeypot
        hp_val = row.get("is_honeypot", "").strip().lower()
        if hp_val not in ("true", "false"):
            warn(f"{row_label}: 'is_honeypot' is not 'True'/'False' — got {row.get('is_honeypot')!r}")

        prev_score = score
        prev_cid   = cid

    ok("All candidate_ids are unique")
    ok("All scores in [0.0, 1.0]")
    ok("Sort order correct: score DESC, candidate_id ASC (tie-break)")
    ok("Rank sequence correct: 1 to 100")

    # Summary
    scores = [float(r["score"]) for r in rows]
    honeypots_in_top = sum(1 for r in rows if r.get("is_honeypot", "").strip().lower() == "true")
    print()
    print("=" * 50)
    print("  VALIDATION PASSED [OK]")
    print("=" * 50)
    print(f"  Rows         : {len(rows)}")
    print(f"  Score range  : {min(scores):.6f} to {max(scores):.6f}")
    print(f"  Honeypots    : {honeypots_in_top} in top-100")
    print("=" * 50)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: python {Path(__file__).name} <submission.csv>")
        sys.exit(1)
    validate(Path(sys.argv[1]))
