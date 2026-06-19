// scorer.js — 5-component weighted scorer for CipherRanker
// Pure JS, no API calls. Designed for the Redrob candidate schema.

// ─── CONSTANTS ────────────────────────────────────────────────────────────
const MUST_HAVE = [
  'sentence-transformers', 'embeddings', 'vector search', 'faiss',
  'pinecone', 'weaviate', 'qdrant', 'milvus', 'opensearch',
  'elasticsearch', 'chroma', 'pgvector', 'semantic search',
  'dense retrieval', 'ndcg', 'mrr', 'map', 'learning to rank',
  'information retrieval', 'python', 'nlp', 'llm',
  'large language models', 'transformers', 'bert', 'gpt', 'rag',
  'retrieval augmented generation', 're-ranking', 'cross-encoder',
  'bi-encoder', 'fine-tuning', 'lora', 'qlora', 'peft',
  'vector database', 'hybrid search', 'bm25', 'hnsw', 'ann',
]

const NICE_TO_HAVE = [
  'xgboost', 'lightgbm', 'ltr', 'kubernetes', 'docker', 'mlflow',
  'wandb', 'weights & biases', 'recommendation system', 'a/b testing',
  'hugging face', 'distributed systems', 'open source',
]

const IT_SERVICES = [
  'tcs', 'infosys', 'wipro', 'accenture', 'cognizant',
  'capgemini', 'hcl', 'mphasis', 'tech mahindra',
]

const GOOD_TITLES = [
  'ai engineer', 'ml engineer', 'machine learning engineer',
  'applied scientist', 'nlp engineer', 'search engineer',
  'ranking engineer', 'research engineer', 'data scientist',
  'applied ml', 'applied ai', 'senior engineer',
]

const BAD_TITLES = [
  'hr manager', 'marketing manager', 'operations manager',
  'content writer', 'graphic designer', 'business analyst',
  'project manager', 'scrum master', 'product manager',
]

const PREFERRED_CITIES = [
  'pune', 'noida', 'delhi', 'gurugram', 'gurgaon',
  'hyderabad', 'mumbai', 'bangalore', 'bengaluru', 'new delhi',
]

const PRODUCT_KEYWORDS = [
  'shipped', 'deployed', 'production', 'users', 'a/b test',
  'vector', 'embedding', 'retrieval', 'ranking', 'recommendation',
  'launched', 'real users', 'scale',
]

// ─── HELPERS ──────────────────────────────────────────────────────────────
function tokenOverlap(a, b) {
  const tokensA = a.toLowerCase().split(/[\s\-_\/]+/)
  const tokensB = b.toLowerCase().split(/[\s\-_\/]+/)
  return tokensA.some(t => tokensB.includes(t) && t.length > 2)
}

function matchesSkillList(skillName, list) {
  const name = skillName.toLowerCase()
  return list.some(term =>
    name.includes(term) || term.includes(name) || tokenOverlap(name, term)
  )
}

export function daysSince(dateStr) {
  if (!dateStr) return 999
  try {
    const d = new Date(dateStr)
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  } catch { return 999 }
}

// ─── COMPONENT 1: CAREER TRACK (weight 0.30) ──────────────────────────────
function careerScore(candidate) {
  const title = (candidate.profile?.current_title || '').toLowerCase()
  const history = candidate.career_history || []

  const itServicesCount = history.filter(h =>
    IT_SERVICES.some(c => (h.company || '').toLowerCase().includes(c))
  ).length
  const allItServices = history.length > 0 && itServicesCount / history.length > 0.7

  let titleScore = 0.2
  if (GOOD_TITLES.some(t => title.includes(t))) titleScore = 0.9
  else if (title.includes('engineer') || title.includes('developer')) titleScore = 0.5
  else if (title.includes('data')) titleScore = 0.45
  if (BAD_TITLES.some(t => title.includes(t))) titleScore = 0.1

  const allDescriptions = history.map(h => h.description || '').join(' ').toLowerCase()
  const productSignals = PRODUCT_KEYWORDS.filter(kw => allDescriptions.includes(kw)).length
  const productBoost = Math.min(0.15, productSignals * 0.025)

  let score = Math.min(1.0, titleScore + productBoost)
  if (allItServices) score *= 0.6
  return score
}

// ─── COMPONENT 2: SKILL MATCH (weight 0.25) ───────────────────────────────
function skillScore(candidate) {
  const skills = candidate.skills || []
  const assessments = candidate.redrob_signals?.skill_assessment_scores || {}

  if (skills.length === 0) return 0

  const proficiencyMap = { beginner: 0.3, intermediate: 0.6, advanced: 0.85, expert: 1.0 }

  let mustHaveTotal = 0, niceToHaveTotal = 0
  let mustHaveCount = 0, niceToHaveCount = 0

  for (const skill of skills) {
    const name = skill.name || ''
    const proficiency = proficiencyMap[skill.proficiency] || 0.3
    const durationWeight = Math.min(1.0, (skill.duration_months || 0) / 24)
    const endorsementBoost = Math.min(1.2, 1.0 + (skill.endorsements || 0) / 100)

    if (
      (skill.proficiency === 'expert' || skill.proficiency === 'advanced') &&
      (skill.duration_months || 0) < 3
    ) continue

    let assessmentMultiplier = 1.0
    const assessmentScore = assessments[name]
    if (assessmentScore !== undefined && skill.proficiency === 'advanced' && assessmentScore < 40) {
      assessmentMultiplier = 0.5
    }

    const skillVal = proficiency * durationWeight * endorsementBoost * assessmentMultiplier

    if (matchesSkillList(name, MUST_HAVE)) {
      mustHaveTotal += skillVal; mustHaveCount++
    } else if (matchesSkillList(name, NICE_TO_HAVE)) {
      niceToHaveTotal += skillVal; niceToHaveCount++
    }
  }

  const mustHaveScore  = mustHaveCount  > 0 ? Math.min(1.0, mustHaveTotal  / Math.max(mustHaveCount,  3)) * 0.7 : 0
  const niceToHaveScore = niceToHaveCount > 0 ? Math.min(1.0, niceToHaveTotal / Math.max(niceToHaveCount, 2)) * 0.3 : 0
  return Math.min(1.0, mustHaveScore + niceToHaveScore)
}

// ─── COMPONENT 3: EXPERIENCE (weight 0.15) ────────────────────────────────
function experienceScore(candidate) {
  const yoe = candidate.profile?.years_of_experience || 0
  if (yoe >= 5 && yoe <= 9)  return 1.0
  if (yoe >= 4 && yoe < 5)   return 0.85
  if (yoe > 9 && yoe <= 12)  return 0.75
  if (yoe >= 3 && yoe < 4)   return 0.65
  if (yoe > 12)               return 0.60
  return 0.3
}

// ─── COMPONENT 4: LOCATION (weight 0.15) ──────────────────────────────────
function locationScore(candidate) {
  const location = (candidate.profile?.location || '').toLowerCase()
  const country  = (candidate.profile?.country  || '').toLowerCase()
  const willing  = candidate.redrob_signals?.willing_to_relocate || false

  const inPreferred = PREFERRED_CITIES.some(city => location.includes(city))
  const inIndia = country === 'india'

  if (inPreferred && inIndia)   return 1.0
  if (inIndia && willing)        return 0.8
  if (inIndia && !willing)       return 0.5
  if (!inIndia && willing)       return 0.4
  return 0.1
}

// ─── COMPONENT 5: EDUCATION (weight 0.05) ─────────────────────────────────
function educationScore(candidate) {
  const education = candidate.education || []
  if (education.length === 0) return 0.5

  const tierMap = { tier_1: 1.0, tier_2: 0.85, tier_3: 0.7, tier_4: 0.55, unknown: 0.6 }
  const goodFields = ['computer science', 'cs', 'engineering', 'mathematics', 'statistics', 'data science', 'information technology']

  let bestTier = 0, fieldBonus = 0
  for (const edu of education) {
    const tier = tierMap[edu.tier] || 0.6
    if (tier > bestTier) bestTier = tier
    const field = (edu.field_of_study || '').toLowerCase()
    if (goodFields.some(f => field.includes(f))) fieldBonus = 0.1
  }
  return Math.min(1.0, bestTier + fieldBonus)
}

// ─── BEHAVIORAL MULTIPLIER ────────────────────────────────────────────────
function behavioralMultiplier(candidate) {
  const s = candidate.redrob_signals
  if (!s) return 0.6

  let m = 1.0

  const inactive = daysSince(s.last_active_date)
  if (inactive > 180)      m *= 0.50
  else if (inactive > 90)  m *= 0.70
  else if (inactive > 30)  m *= 0.85

  if (!s.open_to_work_flag) m *= 0.8

  const rr = s.recruiter_response_rate || 0
  if (rr < 0.15)     m *= 0.60
  else if (rr < 0.35) m *= 0.80
  else if (rr >= 0.7) m *= 1.05

  const notice = s.notice_period_days || 90
  if      (notice <= 30)  { /* no penalty */ }
  else if (notice <= 60)  m *= 0.9
  else if (notice <= 90)  m *= 0.8
  else                    m *= 0.7

  const gh = s.github_activity_score ?? -1
  if (gh === -1)     m *= 0.9
  else if (gh >= 50) m *= 1.05

  const icr = s.interview_completion_rate || 0
  if (icr < 0.5) m *= 0.85

  const salMin = s.expected_salary_range_inr_lpa?.min || 0
  const salMax = s.expected_salary_range_inr_lpa?.max || 0
  if (salMin > 60) m *= 0.8
  if (salMax < 10 && salMax > 0) m *= 0.7

  if (s.verified_email && s.verified_phone) m *= 1.02

  return Math.max(0.4, Math.min(1.0, m))
}

// ─── MAIN SCORER ──────────────────────────────────────────────────────────
const DEFAULT_WEIGHTS_MAP = { career: 0.30, skills: 0.25, experience: 0.15, location: 0.15, education: 0.05 }

export function scoreCandidate(candidate, weightOverride = null) {
  const w = weightOverride ?? DEFAULT_WEIGHTS_MAP
  // Re-normalise just in case
  const wSum = Object.values(w).reduce((a, b) => a + b, 0) || 1

  const components = {
    career:     careerScore(candidate),
    skills:     skillScore(candidate),
    experience: experienceScore(candidate),
    location:   locationScore(candidate),
    education:  educationScore(candidate),
  }

  const baseScore = (
    components.career     * (w.career     / wSum) +
    components.skills     * (w.skills     / wSum) +
    components.experience * (w.experience / wSum) +
    components.location   * (w.location   / wSum) +
    components.education  * (w.education  / wSum)
  )

  const bm = behavioralMultiplier(candidate)
  const finalScore = Math.min(1.0, baseScore * bm)

  return { score: finalScore, components, behavioralMultiplier: bm }
}

export function rankCandidates(candidates, weightOverride = null) {
  const scored = candidates.map(c => {
    const { score, components, behavioralMultiplier: bm } = scoreCandidate(c, weightOverride)
    return { candidate: c, score, components, bm }
  })

  scored.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 1e-9) return b.score - a.score
    return String(a.candidate.candidate_id).localeCompare(String(b.candidate.candidate_id))
  })

  console.table(
    scored.slice(0, 10).map((r, i) => ({
      rank: i + 1,
      id: r.candidate.candidate_id,
      score: r.score.toFixed(4),
      bm: r.bm.toFixed(3),
      career: r.components.career.toFixed(3),
      skills: r.components.skills.toFixed(3),
    }))
  )

  return scored.slice(0, 100).map((item, i) => ({ ...item, rank: i + 1 }))
}
