"""
jd_analyzer.py
Sends the JD to Groq (llama-3.3-70b-versatile) or Mistral (mistral-large-latest)
and gets back a structured scoring rubric — weights, must-haves, nice-to-haves, red flags.
Runs ONCE before ranking begins.
"""
import os
import json
import sys
from dotenv import load_dotenv

# Load environment variables from .env if present
load_dotenv()

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

SYSTEM_PROMPT = """You are a senior technical recruiter. Read the job description and output ONLY a JSON object with this exact structure:

{
  "weights": {
    "career_track": 0.0,
    "skill_match": 0.0,
    "experience_years": 0.0,
    "location": 0.0,
    "education": 0.0
  },
  "must_have_skills": [],
  "nice_to_have_skills": [],
  "ideal_experience_years": { "min": 0, "max": 0 },
  "preferred_locations": [],
  "red_flag_titles": [],
  "red_flag_skills": [],
  "career_track_keywords": [],
  "notes": ""
}

Weights must sum to 1.0. Be specific. No explanation. JSON only."""

def analyze_jd(jd_text: str) -> dict:
    groq_key = os.environ.get("GROQ_API_KEY")
    mistral_key = os.environ.get("MISTRAL_API_KEY")

    if not groq_key and not mistral_key:
        print("[WARN] No GROQ_API_KEY or MISTRAL_API_KEY found. Falling back to default rubric.", file=sys.stderr)
        return DEFAULT_RUBRIC

    # Try Groq first
    if groq_key:
        try:
            print("[INFO] Contacting Groq (llama-3.3-70b-versatile) for JD analysis...")
            from groq import Groq
            client = Groq(api_key=groq_key)
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": jd_text}
                ],
                response_format={"type": "json_object"}
            )
            content = completion.choices[0].message.content
            return json.loads(content)
        except Exception as e:
            print(f"[WARN] Groq API call failed: {e}. Trying Mistral fallback...", file=sys.stderr)

    # Try Mistral
    if mistral_key:
        try:
            print("[INFO] Contacting Mistral (mistral-large-latest) for JD analysis...")
            from mistralai import Mistral
            client = Mistral(api_key=mistral_key)
            completion = client.chat.complete(
                model="mistral-large-latest",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": jd_text}
                ],
                response_format={"type": "json_object"}
            )
            content = completion.choices[0].message.content
            return json.loads(content)
        except Exception as e:
            print(f"[WARN] Mistral API call failed: {e}.", file=sys.stderr)

    print("[WARN] All AI calls failed. Falling back to default rubric.", file=sys.stderr)
    return DEFAULT_RUBRIC

def main():
    jd_path = "jd.txt"
    if not os.path.exists(jd_path):
        # Create a default jd.txt if not present
        print(f"[INFO] jd.txt not found. Creating default jd.txt.")
        with open(jd_path, "w", encoding="utf-8") as f:
            f.write("Job Description: Senior ML Engineer with 5-9 years of experience. Must know python, pytorch, tensorflow. Preferred locations: bangalore, pune.")
    
    with open(jd_path, "r", encoding="utf-8") as f:
        jd_text = f.read()

    rubric = analyze_jd(jd_text)
    
    # Save rubric to rubric.json
    out_path = "rubric.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(rubric, f, indent=2)
        
    print("\n================== AI EXTRACTED RUBRIC ==================")
    print(json.dumps(rubric, indent=2))
    print("=========================================================\n")

if __name__ == "__main__":
    main()
