// honeypot.js — Synthetic / honeypot record detection for CipherRanker

export function isHoneypot(candidate) {
  const skills  = candidate.skills  || []
  const signals = candidate.redrob_signals || {}
  const history = candidate.career_history || []

  // Check 1: expert/advanced skill with 0 duration
  const suspiciousSkills = skills.filter(s =>
    (s.proficiency === 'expert' || s.proficiency === 'advanced') &&
    (s.duration_months || 0) === 0
  )
  if (suspiciousSkills.length > 0) return true

  // Check 2: many experts with zero endorsements
  const expertSkills = skills.filter(s => s.proficiency === 'expert')
  const expertEndorsements = expertSkills.reduce((sum, s) => sum + (s.endorsements || 0), 0)
  if (expertSkills.length > 3 && expertEndorsements < 5) return true

  // Check 3: accepted offer but never completed interview
  const oar = signals.offer_acceptance_rate ?? -1
  const icr = signals.interview_completion_rate ?? 0
  if (oar > 0 && icr === 0) return true

  // Check 4: YOE vs career history mismatch
  const yoe = candidate.profile?.years_of_experience || 0
  const totalMonths = history.reduce((sum, h) => sum + (h.duration_months || 0), 0)
  if (yoe > 10 && totalMonths < 60) return true

  return false
}
