import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { rankCandidates } from '../src/lib/scorer.js'
import { isHoneypot } from '../src/lib/honeypot.js'
import { generateReasoning } from '../src/lib/reasoning.js'

const DEFAULT_RUBRIC = {
  weights: { career_track: 0.3, skill_match: 0.3, experience_years: 0.15, location: 0.1, education: 0.15 },
  must_have_skills: ['python', 'machine learning', 'deep learning', 'pytorch', 'tensorflow'],
  nice_to_have_skills: ['cloud', 'docker', 'kubernetes', 'mlops', 'nlp', 'llm'],
  ideal_experience_years: { min: 5, max: 9 },
  preferred_locations: ['india', 'bangalore', 'pune', 'noida', 'gurugram'],
  red_flag_titles: ['recruiter', 'hr', 'sales', 'marketing'], red_flag_skills: [],
  career_track_keywords: ['shipped', 'production', 'deployment', 'ml engineer', 'data scientist'],
  notes: 'Local baseline rubric'
}

const DEFAULT_JD = `Senior Machine Learning Engineer. We need an engineer with 5-9 years of experience who has shipped production machine-learning systems. Strong Python plus PyTorch or TensorFlow is required. Cloud, Docker, Kubernetes, MLOps, NLP, and LLM experience are valuable. India-based candidates are preferred.`

function parseCandidates(text) {
  try {
    const payload = JSON.parse(text)
    const candidates = Array.isArray(payload) ? payload : payload.candidates
    if (!Array.isArray(candidates)) throw new Error('JSON must be an array or contain candidates')
    return candidates
  } catch (jsonError) {
    const lines = text.split(/\r?\n/).filter(line => line.trim())
    if (!lines.length) throw new Error('Candidate file is empty')
    return lines.map((line, index) => {
      try { return JSON.parse(line) }
      catch { throw new Error(`Invalid JSONL on line ${index + 1}`) }
    })
  }
}

function rank(candidates, rubric) {
  return rankCandidates(candidates, null, rubric).map(result => ({
    ...result,
    isHoneypot: isHoneypot(result.candidate),
    reasoning: generateReasoning(result.candidate, result.rank, result.components)
  }))
}

function summarize(results) {
  return results.slice(0, 10).map(result => ({
    candidate_id: result.candidate.candidate_id,
    current_title: result.candidate.profile?.current_title || '',
    years_of_experience: result.candidate.profile?.years_of_experience || 0,
    location: result.candidate.profile?.location || '',
    country: result.candidate.profile?.country || '',
    is_honeypot: Boolean(result.isHoneypot),
    skills: (result.candidate.skills || []).slice(0, 12).map(skill => ({
      name: skill.name, proficiency: skill.proficiency, duration_months: skill.duration_months
    })),
    career_history: (result.candidate.career_history || []).slice(0, 3).map(role => ({
      title: role.title, company: role.company
    })),
    education: (result.candidate.education || []).slice(0, 2).map(item => ({
      degree: item.degree, field_of_study: item.field_of_study, tier: item.tier
    })),
    local_score: Math.round(result.score * 100)
  }))
}

const inputPath = resolve(process.argv[2] || '')
const outputPath = resolve(process.argv[3] || 'ranked_candidates_output.json')
if (!process.argv[2]) throw new Error('Usage: node scripts/rank-file.mjs <candidates.jsonl> [output.json]')

const candidates = parseCandidates(await readFile(inputPath, 'utf8'))
console.log(`Loaded ${candidates.length} candidates from ${inputPath}`)
const localResults = rank(candidates, DEFAULT_RUBRIC)
console.log('Local ranking complete. Requesting Groq and Mistral in parallel...')

const response = await fetch('http://127.0.0.1:5173/api/rank', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jobDescription: DEFAULT_JD, candidates: summarize(localResults) })
})
const ai = await response.json()
if (!response.ok) throw new Error(ai.error || `Ranking API returned ${response.status}`)

const shortlist = localResults.map(result => result.candidate)
const finalResults = rank(shortlist, ai.consensusRubric || DEFAULT_RUBRIC)
const assessments = {}
for (const [provider, output] of Object.entries(ai.providers || {})) {
  for (const item of output.assessments || []) {
    assessments[item.candidate_id] ||= {}
    assessments[item.candidate_id][provider] = item
  }
}

const output = {
  generated_at: new Date().toISOString(), input_file: inputPath,
  candidate_count: candidates.length, rubric: ai.consensusRubric || DEFAULT_RUBRIC,
  providers: Object.fromEntries(Object.entries(ai.providers || {}).map(([key, value]) => [key, {
    ok: value.ok, model: value.model, latencyMs: value.latencyMs, error: value.error
  }])),
  rankings: finalResults.map(result => ({
    rank: result.rank, candidate_id: result.candidate.candidate_id,
    name: result.candidate.profile?.name || result.candidate.name || '',
    title: result.candidate.profile?.current_title || '',
    score: Number((result.score * 100).toFixed(2)),
    components: result.components, behavioral_multiplier: result.bm,
    honeypot: result.isHoneypot, local_reasoning: result.reasoning,
    ai_assessments: assessments[result.candidate.candidate_id] || {}
  }))
}

await writeFile(outputPath, JSON.stringify(output, null, 2))
console.table(output.rankings.slice(0, 10).map(item => ({
  rank: item.rank, candidate_id: item.candidate_id, title: item.title,
  score: item.score, groq: item.ai_assessments.groq?.fit_score ?? '-',
  mistral: item.ai_assessments.mistral?.fit_score ?? '-'
})))
for (const [provider, details] of Object.entries(output.providers)) {
  console.log(`${provider}: ${details.ok ? `OK (${(details.latencyMs / 1000).toFixed(1)}s, ${details.model})` : `FAILED (${details.error})`}`)
}
console.log(`Full output written to ${outputPath}`)
