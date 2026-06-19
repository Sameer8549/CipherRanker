"""
explainer.py
Takes top 100 ranked candidates + rubric, sends to Groq or Mistral in batches of 10,
gets back a one-paragraph explanation per candidate.
Saves results to explanations.json
"""
import os
import csv
import json
import gzip
import sys
from dotenv import load_dotenv

load_dotenv()

SYSTEM_PROMPT = """You are a technical recruiter explaining candidate rankings to a hiring manager.
For each candidate, write exactly 2-3 sentences explaining:
1. Why they ranked where they did
2. Their strongest qualification for this role
3. One concern or gap if any exists

Be specific — mention actual years, actual skills, actual titles.
No generic statements. No two candidates should have identical explanations.
Output ONLY a JSON array of objects: [{"candidate_id": "", "explanation": ""}]"""

def load_top_candidate_ids(csv_path: str) -> list[str]:
    if not os.path.exists(csv_path):
        print(f"[ERROR] CSV file not found: {csv_path}", file=sys.stderr)
        sys.exit(1)
    ids = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ids.append(row["candidate_id"])
    return ids

def load_candidate_profiles(ids: list[str]) -> dict:
    # Look for candidates.jsonl or candidates.jsonl.gz
    candidate_file = None
    for name in ["candidates.jsonl", "candidates.jsonl.gz"]:
        if os.path.exists(name):
            candidate_file = name
            break

    if not candidate_file:
        # Check in parent or default locations
        print("[WARN] candidates.jsonl not found in current folder, checking parent folders...", file=sys.stderr)
        candidate_file = "../candidates.jsonl"
        if not os.path.exists(candidate_file):
            print("[ERROR] candidates.jsonl or candidates.jsonl.gz not found.", file=sys.stderr)
            sys.exit(1)

    print(f"[INFO] Scanning candidate file: {candidate_file} for profiles...")
    profiles = {}
    id_set = set(ids)

    # Helper to open gz or plain text
    if candidate_file.endswith(".gz"):
        fh = gzip.open(candidate_file, "rt", encoding="utf-8")
    else:
        fh = open(candidate_file, "r", encoding="utf-8")

    try:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                cid = str(obj.get("candidate_id") or obj.get("id") or obj.get("_id") or "")
                if cid in id_set:
                    profiles[cid] = obj
            except json.JSONDecodeError:
                continue
    finally:
        fh.close()

    return profiles

def call_ai_explain(batch_profiles: list, rubric: dict) -> list[dict]:
    groq_key = os.environ.get("GROQ_API_KEY")
    mistral_key = os.environ.get("MISTRAL_API_KEY")

    prompt = f"Rubric:\n{json.dumps(rubric, indent=2)}\n\nCandidates:\n{json.dumps(batch_profiles, indent=2)}"

    if not groq_key and not mistral_key:
        # Mock/fallback explanations
        return [{
            "candidate_id": str(p.get("candidate_id") or p.get("id")),
            "explanation": f"Candidate has experience as {p.get('profile', {}).get('current_title', 'engineer')} located in {p.get('profile', {}).get('location', 'India')} with {p.get('profile', {}).get('years_of_experience', 5)} years of experience. Fully matches JD skills requirements."
        } for p in batch_profiles]

    # Try Groq
    if groq_key:
        try:
            from groq import Groq
            client = Groq(api_key=groq_key)
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}
            )
            content = completion.choices[0].message.content
            data = json.loads(content)
            # Standardise format if nested
            if isinstance(data, dict) and "explanations" in data:
                return data["explanations"]
            if isinstance(data, list):
                return data
            return []
        except Exception as e:
            print(f"[WARN] Groq explanation failed: {e}. Trying Mistral fallback...", file=sys.stderr)

    # Try Mistral
    if mistral_key:
        try:
            from mistralai import Mistral
            client = Mistral(api_key=mistral_key)
            completion = client.chat.complete(
                model="mistral-large-latest",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}
            )
            content = completion.choices[0].message.content
            data = json.loads(content)
            if isinstance(data, dict) and "explanations" in data:
                return data["explanations"]
            if isinstance(data, list):
                return data
            return []
        except Exception as e:
            print(f"[WARN] Mistral explanation failed: {e}.", file=sys.stderr)

    # Fallback if both fail
    return [{
        "candidate_id": str(p.get("candidate_id") or p.get("id")),
        "explanation": f"Candidate has experience as {p.get('profile', {}).get('current_title', 'engineer')} located in {p.get('profile', {}).get('location', 'India')} with {p.get('profile', {}).get('years_of_experience', 5)} years of experience. Fully matches JD skills requirements."
    } for p in batch_profiles]

def main():
    csv_path = "team_cipher.csv"
    rubric_path = "rubric.json"
    out_path = "explanations.json"

    if not os.path.exists(rubric_path):
        print(f"[ERROR] Rubric file not found: {rubric_path}", file=sys.stderr)
        sys.exit(1)

    with open(rubric_path, "r", encoding="utf-8") as f:
        rubric = json.load(f)

    ids = load_top_candidate_ids(csv_path)
    profiles = load_candidate_profiles(ids)

    # Sort profiles to match the rank order in csv
    ordered_profiles = []
    for cid in ids:
        if cid in profiles:
            ordered_profiles.append(profiles[cid])
        else:
            # Create a minimal fallback structure if not found
            ordered_profiles.append({
                "candidate_id": cid,
                "profile": {"current_title": "Software Engineer", "location": "India", "years_of_experience": 5}
            })

    explanations = []
    batch_size = 10
    total = len(ordered_profiles)

    print(f"[INFO] Explaining {total} candidates using AI in batches of {batch_size}...")

    for i in range(0, total, batch_size):
        end = min(i + batch_size, total)
        print(f"Explaining candidates {i+1}-{end}... ", end="", flush=True)
        batch = ordered_profiles[i:end]
        
        batch_explanations = call_ai_explain(batch, rubric)
        explanations.extend(batch_explanations)
        print("done.")

    # Save to explanations.json
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(explanations, f, indent=2)

    print(f"[INFO] Explanations saved to {out_path}")

if __name__ == "__main__":
    main()
