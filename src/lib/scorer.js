// scorer.js — Rubric-driven weighted scorer for CipherRanker

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

const flattenedCandidates = new WeakMap()

function flatten(candidate) {
  if (candidate && typeof candidate === 'object' && flattenedCandidates.has(candidate)) {
    return flattenedCandidates.get(candidate)
  }
  const parts = []
  function collect(obj) {
    if (typeof obj === 'string') parts.push(obj)
    else if (typeof obj === 'number') parts.push(String(obj))
    else if (Array.isArray(obj)) obj.forEach(collect)
    else if (obj && typeof obj === 'object') {
      Object.entries(obj).forEach(([key, value]) => {
        if (!['name', 'anonymized_name', 'candidate_id'].includes(key)) collect(value)
      })
    }
  }
  collect(candidate)
  const text = parts.join(' ').toLowerCase()
  if (candidate && typeof candidate === 'object') flattenedCandidates.set(candidate, text)
  return text
}

// ─── COMPONENT 1: CAREER TRACK ─────────────────────────────────────────────
function careerScore(candidate, rubric = null) {
  const title = (candidate.profile?.current_title || '').toLowerCase()
  const history = candidate.career_history || []
  const text = flatten(candidate)

  if (rubric) {
    const keywords = rubric.career_track_keywords || PRODUCT_KEYWORDS
    const redFlags = rubric.red_flag_titles || BAD_TITLES
    const allText = title + " " + text
    
    const hits = keywords.filter(kw => allText.includes(kw.toLowerCase())).length
    let score = Math.min(1.0, hits / 5.0)
    
    if (redFlags.some(rf => title.includes(rf.toLowerCase()))) {
      score *= 0.1
    }
    return score
  }

  // Fallback to original
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

// ─── COMPONENT 2: SKILL MATCH ──────────────────────────────────────────────
function skillScore(candidate, rubric = null) {
  const skills = candidate.skills || []
  const assessments = candidate.redrob_signals?.skill_assessment_scores || {}
  const text = flatten(candidate)

  if (skills.length === 0) return 0

  const proficiencyMap = { beginner: 0.3, intermediate: 0.6, advanced: 0.85, expert: 1.0 }

  if (rubric) {
    const mustHaves = rubric.must_have_skills || []
    const niceToHaves = rubric.nice_to_have_skills || []
    const redFlags = rubric.red_flag_skills || []
    
    // Convert candidate skills to lowercase lookup
    const cSkillsDict = {}
    for (const s of skills) {
      if (s.name) cSkillsDict[s.name.toLowerCase().trim()] = s
    }
    
    // Red flags penalty
    if (redFlags.some(rf => cSkillsDict[rf.toLowerCase()] || text.includes(rf.toLowerCase()))) {
      return 0.0
    }

    const evaluateList = (list) => {
      if (!list || list.length === 0) return 1.0
      let total = 0
      for (const sk of list) {
        const skLower = sk.toLowerCase().trim()
        let matched = null
        if (cSkillsDict[skLower]) {
          matched = cSkillsDict[skLower]
        } else {
          for (const name of Object.keys(cSkillsDict)) {
            if (skLower.includes(name) || name.includes(skLower)) {
              matched = cSkillsDict[name]
              break
            }
          }
        }

        if (matched) {
          const prof = matched.proficiency?.toLowerCase() || 'beginner'
          const dur = matched.duration_months || 0
          const endorse = matched.endorsements || 0
          const assessmentScore = assessments[matched.name]
          
          if (prof === 'expert' && dur === 0) {
            total += 0.1
            continue
          }
          
          const profScores = { expert: 0.8, advanced: 0.6, intermediate: 0.4, beginner: 0.2 }
          let val = profScores[prof] || 0.2
          val += Math.min(dur / 36.0, 1.0) * 0.15
          val += Math.min(endorse / 10.0, 1.0) * 0.05
          
          if (assessmentScore !== undefined && assessmentScore < 40) {
            val *= 0.5
          }
          total += Math.min(val, 1.0)
        } else {
          total += text.includes(skLower) ? 0.2 : 0.0
        }
      }
      return total / list.length
    }

    const mustHaveScore = evaluateList(mustHaves)
    const niceToHaveScore = evaluateList(niceToHaves)
    return Math.min(1.0, mustHaveScore * 0.7 + niceToHaveScore * 0.3)
  }

  // Fallback to original
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

// ─── COMPONENT 3: EXPERIENCE ──────────────────────────────────────────────
function experienceScore(candidate, rubric = null) {
  const yoe = candidate.profile?.years_of_experience || 0

  if (rubric && rubric.ideal_experience_years) {
    const minExp = rubric.ideal_experience_years.min || 0
    const maxExp = rubric.ideal_experience_years.max || 0
    
    if (yoe >= minExp && yoe <= maxExp) return 1.0
    if (yoe < minExp) return minExp > 0 ? yoe / minExp : 1.0
    return Math.max(0.5, 1.0 - (yoe - maxExp) * 0.05)
  }

  // Fallback
  if (yoe >= 5 && yoe <= 9)  return 1.0
  if (yoe >= 4 && yoe < 5)   return 0.85
  if (yoe > 9 && yoe <= 12)  return 0.75
  if (yoe >= 3 && yoe < 4)   return 0.65
  if (yoe > 12)               return 0.60
  return 0.3
}

// ─── COMPONENT 4: LOCATION ────────────────────────────────────────────────
function locationScore(candidate, rubric = null) {
  const location = (candidate.profile?.location || '').toLowerCase()
  const country  = (candidate.profile?.country  || '').toLowerCase()
  const willing  = candidate.redrob_signals?.willing_to_relocate || false
  const text = flatten(candidate)

  if (rubric && Array.isArray(rubric.preferred_locations) && rubric.preferred_locations.length > 0) {
    const prefLocs = rubric.preferred_locations
    const matched = prefLocs.some(loc => location.includes(loc.toLowerCase().trim()) || text.includes(loc.toLowerCase().trim()))
    if (matched) return 1.0
    if (willing || text.includes("willing to relocate")) return 0.5
    return 0.1
  }

  if (rubric && (!Array.isArray(rubric.preferred_locations) || rubric.preferred_locations.length === 0)) {
    return 1.0
  }

  // Fallback
  const inPreferred = PREFERRED_CITIES.some(city => location.includes(city))
  const inIndia = country === 'india'

  if (inPreferred && inIndia)   return 1.0
  if (inIndia && willing)        return 0.8
  if (inIndia && !willing)       return 0.5
  if (!inIndia && willing)       return 0.4
  return 0.1
}

// ─── COMPONENT 5: EDUCATION ───────────────────────────────────────────────
function educationScore(candidate, rubric = null) {
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
  
  let score = Math.min(1.0, bestTier + fieldBonus)
  if (rubric) {
    // If degree is not in relevant fields, apply penalty
    const allFields = education.map(edu => (edu.field_of_study || '').toLowerCase()).join(' ')
    const relevant = goodFields.some(f => allFields.includes(f))
    if (!relevant && score > 0.3) {
      score *= 0.8
    }
  }
  return score
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

export function scoreCandidate(candidate, weightOverride = null, rubric = null) {
  let w = weightOverride ?? DEFAULT_WEIGHTS_MAP
  if (rubric && rubric.weights) {
    w = {
      career: rubric.weights.career_track,
      skills: rubric.weights.skill_match,
      experience: rubric.weights.experience_years,
      location: rubric.weights.location,
      education: rubric.weights.education
    }
  }
  
  // Re-normalise just in case
  const wSum = Object.values(w).reduce((a, b) => a + b, 0) || 1

  const components = {
    career:     careerScore(candidate, rubric),
    skills:     skillScore(candidate, rubric),
    experience: experienceScore(candidate, rubric),
    location:   locationScore(candidate, rubric),
    education:  educationScore(candidate, rubric),
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

export function rankCandidates(candidates, weightOverride = null, rubric = null, limit = 100) {
  const scored = candidates.map(c => {
    const { score, components, behavioralMultiplier: bm } = scoreCandidate(c, weightOverride, rubric)
    return {
      candidate: c,
      score: Number.isFinite(score) ? score : 0,
      components,
      bm: Number.isFinite(bm) ? bm : 0
    }
  })

  scored.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 1e-9) return b.score - a.score
    return String(a.candidate.candidate_id).localeCompare(String(b.candidate.candidate_id))
  })

  const selected = Number.isInteger(limit) ? scored.slice(0, limit) : scored
  return selected.map((item, i) => ({ ...item, rank: i + 1 }))
}
