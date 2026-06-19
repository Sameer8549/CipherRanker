// reasoning.js — Human-readable reasoning generator for CipherRanker

function daysSince(dateStr) {
  if (!dateStr) return 999
  const d = new Date(dateStr)
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

const MUST_HAVE_KEYWORDS = [
  'embedding', 'vector', 'retrieval', 'nlp', 'rag', 'faiss',
  'pinecone', 'elasticsearch', 'transformers', 'bert', 'lora',
  'fine-tuning', 'ranking', 'python', 'milvus', 'qdrant',
]

function getTopMatchedSkill(candidate) {
  const skills = candidate.skills || []
  let best = null, bestScore = 0

  for (const skill of skills) {
    const name = (skill.name || '').toLowerCase()
    const matches = MUST_HAVE_KEYWORDS.filter(kw => name.includes(kw)).length
    const profScore = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 }[skill.proficiency] || 0
    const total = matches * profScore * Math.min(1, (skill.duration_months || 0) / 12)
    if (total > bestScore) { bestScore = total; best = skill.name }
  }
  return best
}

export function generateReasoning(candidate, rank, components) {
  const profile   = candidate.profile || {}
  const signals   = candidate.redrob_signals || {}
  const yoe       = (profile.years_of_experience || 0).toFixed(1)
  const title     = profile.current_title || 'Engineer'
  const location  = profile.location || 'Unknown'
  const notice    = signals.notice_period_days || 0
  const daysInact = daysSince(signals.last_active_date)
  const rr        = signals.recruiter_response_rate || 0
  const topSkill  = getTopMatchedSkill(candidate)

  // Sentence 1 — strengths
  const strengthParts = []
  if (components.career > 0.7) {
    strengthParts.push(`${yoe}-yr ${title} with product-company AI deployment history`)
  } else if (components.career > 0.4) {
    strengthParts.push(`${yoe}-yr ${title} with adjacent ML exposure`)
  } else {
    strengthParts.push(`${yoe}-yr ${title} — career track is a partial fit for this JD`)
  }

  if (topSkill && components.skills > 0.5) {
    strengthParts.push(`strong ${topSkill} background aligns with JD retrieval/ranking requirements`)
  } else if (components.skills < 0.3) {
    strengthParts.push(`limited overlap with JD's must-have skills (embeddings, vector DBs, eval frameworks)`)
  }

  const sentence1 = strengthParts.join('; ') + '.'

  // Sentence 2 — concerns / positives
  const concerns  = []
  const positives = []

  if (notice > 60) concerns.push(`${notice}-day notice period`)
  if (daysInact > 60) concerns.push(`last active ${daysInact} days ago`)
  if (rr < 0.25) concerns.push(`low recruiter response rate (${(rr * 100).toFixed(0)}%)`)
  if (profile.country !== 'India') concerns.push(`based outside India (${location})`)
  if (components.location < 0.5) concerns.push(`location mismatch with Pune/Noida preference`)

  if (signals.open_to_work_flag && daysInact < 30) positives.push('actively job-seeking')
  if (notice <= 30) positives.push('immediately available')
  if ((signals.github_activity_score ?? -1) > 50) positives.push('strong GitHub activity')
  if (rr >= 0.7) positives.push('highly responsive to recruiters')

  let sentence2 = ''
  if (concerns.length > 0) {
    sentence2 = `Concerns: ${concerns.join(', ')}.`
    if (positives.length > 0) sentence2 += ` Positives: ${positives.join(', ')}.`
  } else if (positives.length > 0) {
    sentence2 = `Strong signals: ${positives.join(', ')}; ${location}-based, relocation-compatible.`
  } else {
    sentence2 = `Based in ${location}; mid-tier behavioral signals.`
  }

  return `${sentence1} ${sentence2}`
}
