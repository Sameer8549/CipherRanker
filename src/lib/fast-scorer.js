const PROFICIENCY = { beginner: 0.25, intermediate: 0.5, advanced: 0.75, expert: 1 }
const lower = value => String(value || '').toLowerCase()

function candidateFacts(candidate) {
  const profile = candidate.profile || {}
  const text = [profile.current_title, profile.headline, String(profile.summary || '').slice(0, 240),
    ...(candidate.skills || []).slice(0, 24).map(skill => skill.name),
    ...(candidate.career_history || []).slice(0, 3).flatMap(role => [role.title, String(role.description || '').slice(0, 160)]),
    ...(candidate.education || []).flatMap(item => [item.degree, item.field_of_study])
  ].filter(Boolean).join(' ').toLowerCase()
  const skills = (candidate.skills || []).slice(0, 24).map(skill => ({
    name: lower(skill.name),
    proficiency: PROFICIENCY[lower(skill.proficiency)] || 0.25,
    duration: Math.min(1, Number(skill.duration_months || 0) / 36),
    endorsements: Math.min(1, Number(skill.endorsements || 0) / 10)
  }))
  return { text, skills, skillNames: new Set(skills.map(skill => skill.name).filter(Boolean)) }
}

function requirementScore(requirement, facts) {
  const required = lower(requirement)
  if (!required) return 0
  let best = 0
  for (const skill of facts.skills) {
    const name = skill.name
    if (!name || (name !== required && !name.includes(required) && !required.includes(name))) continue
    best = Math.max(best, skill.proficiency * 0.8 + skill.duration * 0.15 + skill.endorsements * 0.05)
  }
  return best || (facts.text.includes(required) ? 0.25 : 0)
}

function componentScores(candidate, rubric, facts) {
  const profile = candidate.profile || {}
  const title = lower(profile.current_title)
  const careerKeywords = (rubric.career_track_keywords || []).slice(0, 12)
  const titleSignals = ['ai engineer', 'ml engineer', 'machine learning', 'data scientist', 'search engineer', 'ranking engineer', 'applied scientist']
  const keywordHits = careerKeywords.reduce((count, keyword) => count + (facts.text.includes(lower(keyword)) ? 1 : 0), 0)
  let career = Math.max(titleSignals.some(signal => title.includes(signal)) ? 0.65 : 0.25, Math.min(1, keywordHits / Math.max(1, Math.min(5, careerKeywords.length))))
  if ((rubric.red_flag_titles || []).some(flag => title.includes(lower(flag)))) career *= 0.2
  const average = (list, cap) => {
    const items = (list || []).slice(0, cap)
    return items.length ? items.reduce((sum, item) => sum + requirementScore(item, facts), 0) / items.length : 1
  }
  let skillMatch = average(rubric.must_have_skills, 12) * 0.75 + average(rubric.nice_to_have_skills, 10) * 0.25
  if ((rubric.red_flag_skills || []).some(flag => facts.skillNames.has(lower(flag)))) skillMatch *= 0.7
  const years = Number(profile.years_of_experience || 0)
  const min = Number(rubric.ideal_experience_years?.min || 0)
  const max = Number(rubric.ideal_experience_years?.max || Math.max(min, 20))
  const experience = years >= min && years <= max ? 1 : years < min ? (min ? years / min : 1) : Math.max(0.5, 1 - (years - max) * 0.05)
  const preferences = rubric.preferred_locations || []
  const locationText = `${lower(profile.location)} ${lower(profile.country)}`
  const location = preferences.length ? (preferences.some(place => locationText.includes(lower(place))) ? 1 : candidate.redrob_signals?.willing_to_relocate ? 0.5 : 0.1) : 1
  let education = 0.5
  for (const item of candidate.education || []) {
    const tier = { tier_1: 1, tier_2: 0.85, tier_3: 0.7, tier_4: 0.55 }[item.tier] || 0.6
    education = Math.max(education, Math.min(1, tier + (/computer|engineering|mathematics|statistics|data science|information/.test(lower(item.field_of_study)) ? 0.1 : 0)))
  }
  return { career, skills: Math.min(1, skillMatch), experience: Math.max(0, experience), location, education }
}

function behavior(candidate, referenceDate) {
  const signals = candidate.redrob_signals || {}
  let multiplier = 1
  const active = signals.last_active_date ? Math.floor((new Date(referenceDate).getTime() - new Date(signals.last_active_date).getTime()) / 86400000) : 999
  if (active > 180) multiplier *= 0.5
  else if (active > 90) multiplier *= 0.7
  else if (active > 30) multiplier *= 0.85
  if (!signals.open_to_work_flag) multiplier *= 0.8
  const response = Number(signals.recruiter_response_rate || 0)
  if (response < 0.15) multiplier *= 0.6
  else if (response < 0.35) multiplier *= 0.8
  else if (response >= 0.7) multiplier *= 1.05
  const notice = Number(signals.notice_period_days ?? 90)
  if (notice > 90) multiplier *= 0.7
  else if (notice > 60) multiplier *= 0.8
  else if (notice > 30) multiplier *= 0.9
  if (Number(signals.github_activity_score ?? -1) === -1) multiplier *= 0.9
  else if (Number(signals.github_activity_score) >= 50) multiplier *= 1.05
  if (Number(signals.interview_completion_rate || 0) < 0.5) multiplier *= 0.85
  return Math.max(0.4, Math.min(1, multiplier))
}

export function scoreCandidateFast(candidate, rubric) {
  const facts = candidateFacts(candidate)
  const components = componentScores(candidate, rubric, facts)
  const weights = { career: Number(rubric.weights?.career_track || 0), skills: Number(rubric.weights?.skill_match || 0), experience: Number(rubric.weights?.experience_years || 0), location: Number(rubric.weights?.location || 0), education: Number(rubric.weights?.education || 0) }
  const sum = Object.values(weights).reduce((total, value) => total + value, 0) || 1
  const base = Object.entries(weights).reduce((total, [key, value]) => total + components[key] * value / sum, 0)
  const bm = behavior(candidate, rubric.reference_date || '2026-06-20T00:00:00Z')
  return { score: Math.min(1, base * bm), components, behavioralMultiplier: bm }
}
