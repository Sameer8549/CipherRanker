const LABELS = {
  career: 'Career track',
  skills: 'Skill match',
  experience: 'Experience',
  location: 'Location',
  education: 'Education'
}

export function buildEvidence(candidate, components, rubric) {
  const profile = candidate.profile || {}
  const skills = (candidate.skills || []).map(skill => skill.name).filter(Boolean)
  const mustHave = rubric?.must_have_skills || []
  const matchedSkills = mustHave.filter(required =>
    skills.some(skill => skill.toLowerCase().includes(String(required).toLowerCase()) || String(required).toLowerCase().includes(skill.toLowerCase()))
  )
  const preferred = rubric?.preferred_locations || []
  const location = String(profile.location || '')

  return Object.entries(components || {}).map(([component, score]) => {
    let source = 'candidate profile'
    let fact = ''
    if (component === 'skills') {
      source = 'skills'
      fact = matchedSkills.length ? `Matched: ${matchedSkills.join(', ')}` : `No direct must-have match among ${skills.slice(0, 6).join(', ') || 'reported skills'}`
    } else if (component === 'career') {
      source = 'profile.current_title + career_history'
      fact = profile.current_title || 'No current title supplied'
    } else if (component === 'experience') {
      source = 'profile.years_of_experience'
      fact = `${Number(profile.years_of_experience || 0).toFixed(1)} years`
    } else if (component === 'location') {
      source = 'profile.location'
      fact = preferred.length ? `${location || 'Unknown'} vs ${preferred.join(', ')}` : 'JD has no location requirement'
    } else if (component === 'education') {
      source = 'education'
      fact = (candidate.education || []).slice(0, 2).map(item => `${item.degree || ''} ${item.field_of_study || ''}`.trim()).join('; ') || 'No education supplied'
    }
    return { component, label: LABELS[component] || component, source, fact, score: Number(Number(score || 0).toFixed(4)) }
  })
}

export function verifyExplanation(explanation, candidate) {
  const text = String(explanation || '').trim()
  if (!text) return { valid: false, explanation: '', rejectedClaims: ['empty explanation'] }
  const rejectedClaims = []
  const years = text.match(/(\d+(?:\.\d+)?)\s*(?:years?|yr)/i)
  const suppliedYears = Number(candidate.profile?.years_of_experience ?? candidate.years_of_experience ?? 0)
  if (years && Math.abs(Number(years[1]) - suppliedYears) > 0.2) {
    rejectedClaims.push(`unsupported experience claim: ${years[0]}`)
  }
  const safe = rejectedClaims.length ? '' : text.slice(0, 600)
  return { valid: rejectedClaims.length === 0, explanation: safe, rejectedClaims }
}
