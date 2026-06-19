#!/usr/bin/env python3
"""
rank.py — Team Cipher AI-powered ranking pipeline.

Runs the full 6-step pipeline:
  1. Load JD from jd.txt
  2. Call jd_analyzer.py to generate rubric.json
  3. Stream candidates, score them using the new rubric (scorer.py)
  4. Sort and output top-100 to CSV
  5. Call explainer.py to generate explanations.json
  6. Print execution stats
"""

import argparse
import csv
import gzip
import json
import multiprocessing
import os
import sys
import time
import subprocess
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants & Defaults
# ---------------------------------------------------------------------------
PROGRESS_INTERVAL = 10_000
TOP_N             = 100
CHUNK_SIZE        = 5_000

# ---------------------------------------------------------------------------
# Helper function to load gz or plain text
# ---------------------------------------------------------------------------
def open_input(path: Path):
    name = path.name.lower()
    if name.endswith(".jsonl.gz") or name.endswith(".json.gz"):
        return gzip.open(path, "rt", encoding="utf-8")
    return open(path, "r", encoding="utf-8")

# ---------------------------------------------------------------------------
# Multiprocessing worker functions
# ---------------------------------------------------------------------------
def _pool_init() -> None:
    # Worker process initializer. Scorer will load rubric.json on import.
    pass

def _score_chunk(chunk: list) -> list:
    """Score a list of (lineno, candidate) pairs. Called in worker processes."""
    import scorer
    from honeypot import is_honeypot
    
    results = []
    for lineno, candidate in chunk:
        cid = (
            candidate.get("candidate_id")
            or candidate.get("id")
            or candidate.get("_id")
            or str(lineno)
        )
        hp, hp_reason = is_honeypot(candidate)
        if hp:
            results.append({
                "candidate_id": str(cid),
                "score"       : 0.0,
                "is_honeypot" : True,
                "hp_reason"   : hp_reason,
                "components"  : None,
            })
        else:
            det = scorer.score_candidate(candidate)
            results.append({
                "candidate_id": str(cid),
                "score"       : det["final_score"],
                "is_honeypot" : False,
                "hp_reason"   : "",
                "components"  : det,
            })
    return results

# ---------------------------------------------------------------------------
# CLI Argument parsing
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Team Cipher AI candidate ranking pipeline.")
    p.add_argument("--candidates", required=True, type=Path,
                   help="Path to candidates JSONL or JSONL.GZ file.")
    p.add_argument("--out", required=True, type=Path,
                   help="Output CSV file path.")
    p.add_argument("--top", type=int, default=TOP_N,
                   help=f"Number of top candidates to write (default: {TOP_N}).")
    p.add_argument("--workers", type=int, default=1,
                   help="Number of parallel worker processes (default: 1).")
    p.add_argument("--explain", action="store_true",
                   help="Print explanations from explanations.json after scoring.")
    return p.parse_args()

def load_candidates(path: Path) -> tuple[list, int]:
    """Load candidates from a JSONL or JSON array file. Returns (all_pairs, bad_json_count)."""
    # Read the first few non-empty characters to check if it's a JSON array
    content_preview = ""
    with open_input(path) as fh:
        for line in fh:
            line_str = line.strip()
            if line_str:
                content_preview = line_str
                break
                
    if content_preview.startswith("["):
        # Parse as a JSON array
        with open_input(path) as fh:
            try:
                data = json.load(fh)
                if isinstance(data, list):
                    pairs = [(i, obj) for i, obj in enumerate(data, start=1) if isinstance(obj, dict)]
                    return pairs, 0
            except Exception as e:
                print(f"[WARN] Failed to parse as JSON array: {e}. Falling back to line-by-line.")
                
    # Fallback to line-by-line JSONL
    pairs = []
    bad_json = 0
    with open_input(path) as fh:
        for lineno, raw in enumerate(fh, start=1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
                if isinstance(obj, dict):
                    pairs.append((lineno, obj))
                else:
                    bad_json += 1
            except json.JSONDecodeError:
                bad_json += 1
                continue

            if lineno % PROGRESS_INTERVAL == 0:
                print(f"  [PROGRESS] {lineno:>10,} candidates read...")
    return pairs, bad_json

# ---------------------------------------------------------------------------
# Main Execution
# ---------------------------------------------------------------------------
def main() -> None:
    t_start = time.perf_counter()
    args = parse_args()

    if not args.candidates.exists():
        sys.exit(f"[ERROR] Candidates file not found: {args.candidates}")

    n_workers = max(1, args.workers)

    # Step 1: Load JD from jd.txt
    print("[1/6] Loading JD from jd.txt...")
    jd_path = Path("jd.txt")
    if not jd_path.exists():
        with open(jd_path, "w", encoding="utf-8") as f:
            f.write("Job Description: Senior ML Engineer with 5-9 years of experience. Must know python, pytorch, tensorflow. Preferred locations: bangalore, pune.")
    
    # Step 2: Call jd_analyzer.py → generate rubric.json (AI)
    print("[2/6] AI analyzing JD with Groq/Mistral...", end="")
    sys.stdout.flush()
    try:
        subprocess.run([sys.executable, "jd_analyzer.py"], check=True, stdout=subprocess.DEVNULL)
        print(" done (rubric saved to rubric.json)")
    except subprocess.CalledProcessError as e:
        print(f"\n[WARN] jd_analyzer.py execution failed: {e}. Using fallback rubric.")
        # Create a default rubric if missing
        if not os.path.exists("rubric.json"):
            from jd_analyzer import DEFAULT_RUBRIC
            with open("rubric.json", "w", encoding="utf-8") as f:
                json.dump(DEFAULT_RUBRIC, f, indent=2)

    # Step 3: Stream candidates.jsonl → score all 100K using rubric
    print(f"[3/6] Scoring candidates from {args.candidates}...")
    all_pairs, bad_json = load_candidates(args.candidates)
    total_read = len(all_pairs)
    print(f"[INFO] Read {total_read:,} candidates ({bad_json} bad JSON lines skipped)")

    # Score candidates (multiprocessing if workers > 1)
    chunks = [
        all_pairs[i : i + CHUNK_SIZE]
        for i in range(0, len(all_pairs), CHUNK_SIZE)
    ]
    results = []
    honeypots = 0

    t_score = time.perf_counter()
    if n_workers > 1:
        with multiprocessing.Pool(processes=n_workers, initializer=_pool_init) as pool:
            for chunk_results in pool.imap_unordered(_score_chunk, chunks):
                for r in chunk_results:
                    if r["is_honeypot"]:
                        honeypots += 1
                    results.append(r)
    else:
        for chunk in chunks:
            for r in _score_chunk(chunk):
                if r["is_honeypot"]:
                    honeypots += 1
                results.append(r)
                
    score_elapsed = time.perf_counter() - t_score
    print(f"[INFO] Scoring complete in {score_elapsed:.2f}s")

    # Step 4: Sort → write top 100 to team_cipher.csv
    print(f"[4/6] Sorting and writing top {args.top} to {args.out}...")
    # Sort: final_score DESC, candidate_id ASC (tie-break)
    results.sort(key=lambda r: (-r["score"], r["candidate_id"]))
    top = results[:args.top]

    # Write CSV
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=["rank", "candidate_id", "score", "is_honeypot", "hp_reason"],
        )
        writer.writeheader()
        for rank_pos, row in enumerate(top, start=1):
            writer.writerow({
                "rank"         : rank_pos,
                "candidate_id" : row["candidate_id"],
                "score"        : row["score"],
                "is_honeypot"  : row["is_honeypot"],
                "hp_reason"    : row["hp_reason"],
            })

    # Step 5: Call explainer.py → generate explanations.json (AI)
    print("[5/6] AI generating explanations for top candidates...")
    try:
        subprocess.run([sys.executable, "explainer.py"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"[WARN] explainer.py execution failed: {e}. Writing mock explanations.")
        # Write mock explanations if explainer fails
        mock_explanations = []
        for r in top:
            mock_explanations.append({
                "candidate_id": r["candidate_id"],
                "explanation": f"Profile matches scoring requirements with score {r['score']}."
            })
        with open("explanations.json", "w", encoding="utf-8") as f:
            json.dump(mock_explanations, f, indent=2)

    # Step 6: Print final stats
    total_elapsed = time.perf_counter() - t_start
    scores_in_top = [r["score"] for r in top]
    
    print("[6/6] Done.")
    print()
    print("Results:")
    print(f"  Total candidates processed : {total_read:,}")
    print(f"  Honeypots detected         : {honeypots:,}")
    print(f"  Rows written to CSV        : {len(top)}")
    if scores_in_top:
        print(f"  Score range (top-100)      : {min(scores_in_top):.6f} -> {max(scores_in_top):.6f}")
    print(f"  Wall time                  : {total_elapsed:.2f}s")
    print(f"  AI rubric saved to         : rubric.json")
    print(f"  AI explanations saved to   : explanations.json")

    # If --explain is flag, print details
    if args.explain and os.path.exists("explanations.json"):
        with open("explanations.json", "r", encoding="utf-8") as f:
            explanations = json.load(f)
        exp_dict = {x["candidate_id"]: x["explanation"] for x in explanations}
        
        print("\n================== AI GENERATED EXPLANATIONS ==================")
        for i, r in enumerate(top[:10], 1):
            cid = r["candidate_id"]
            explanation = exp_dict.get(cid, "No explanation available.")
            print(f"#{i} Candidate {cid} (Score: {r['score']}):")
            print(f"  {explanation}\n")
        print("===============================================================")

if __name__ == "__main__":
    main()
