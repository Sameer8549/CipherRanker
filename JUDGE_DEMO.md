# Five-Minute Judge Sequence

## 0:00–0:45 — Scale and Privacy
Upload the 100,000-record JSONL file or select the local path. Point out that the file streams to a local Node process, candidate names never enter scoring, and the full dataset is never sent to an AI provider.

## 0:45–1:30 — Independent AI Jury
Show Groq and Mistral model names, latency, confidence and rubric agreement. Explain that neither provider sees the other provider's rubric.

## 1:30–2:30 — Evidence, Not a Black Box
Open a top candidate. Walk through baseline rank, consensus movement, stability range and evidence graph. Show that an unsupported AI claim is rejected before display.

## 2:30–3:15 — Adversarial Profiles
Filter honeypots. Show explicit marker evidence and the separate risk-review queue for suspicious but valid candidates.

## 3:15–4:00 — Stability and Fairness
Show top-100 inclusion probability and weight perturbation stability. Point to the privacy boundary proving anonymized names are excluded and location is used only when required.

## 4:00–5:00 — Reproducible Submission
Export the official CSV, run `python scripts/validate_submission.py <participant>.csv`, then show the dataset, rubric and output checksums in the sealed manifest. Rerun the same input to demonstrate the sealed cache: the measured cache-hit path reopens the 100,000-record run and exports in `0.93s`.
