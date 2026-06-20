export async function enrichRankings(jobDescription, rankedResults) {
  const candidates = rankedResults.slice(0, 10).map(result => ({
    candidate_id: result.candidate.candidate_id,
    current_title: result.candidate.profile?.current_title || '',
    years_of_experience: result.candidate.profile?.years_of_experience || 0,
    location: result.candidate.profile?.location || '',
    country: result.candidate.profile?.country || '',
    is_honeypot: Boolean(result.isHoneypot),
    skills: (result.candidate.skills || []).slice(0, 12).map(skill => ({
      name: skill.name, proficiency: skill.proficiency, duration_months: skill.duration_months
    })),
    career_history: (result.candidate.career_history || []).slice(0, 3).map(role => ({ title: role.title, company: role.company })),
    education: (result.candidate.education || []).slice(0, 2).map(item => ({ degree: item.degree, field_of_study: item.field_of_study, tier: item.tier })),
    local_score: Math.round(result.score * 100)
  }))
  const response = await fetch('/api/rank', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jobDescription, candidates })
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || `Server returned ${response.status}`)
  return data
}
