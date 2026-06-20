function addFinding(findings, code, severity, message, evidence) {
  findings.push({ code, severity, message, evidence })
}

export function assessHoneypot(candidate) {
  const id = String(candidate?.candidate_id || '')
  const profile = candidate?.profile || {}
  const skills = candidate?.skills || []
  const signals = candidate?.redrob_signals || {}
  const history = candidate?.career_history || []
  const findings = []

  if (/^HP_/i.test(id)) {
    addFinding(findings, 'explicit_marker', 1, 'Dataset marks this record as a honeypot.', id)
  }

  const zeroDuration = skills.filter(skill =>
    ['expert', 'advanced'].includes(String(skill.proficiency || '').toLowerCase()) &&
    Number(skill.duration_months || 0) === 0
  )
  if (zeroDuration.length) {
    addFinding(findings, 'zero_duration_expertise', 0.55, 'Advanced expertise has no recorded duration.', zeroDuration.map(skill => skill.name).slice(0, 5))
  }

  const experts = skills.filter(skill => String(skill.proficiency || '').toLowerCase() === 'expert')
  const endorsements = experts.reduce((sum, skill) => sum + Number(skill.endorsements || 0), 0)
  if (experts.length > 3 && endorsements < 5) {
    addFinding(findings, 'unsupported_expertise', 0.45, 'Many expert claims have almost no endorsements.', { experts: experts.length, endorsements })
  }

  const assessments = signals.skill_assessment_scores || {}
  const contradictions = skills.filter(skill =>
    ['expert', 'advanced'].includes(String(skill.proficiency || '').toLowerCase()) &&
    Number(assessments[skill.name] ?? 100) < 40
  )
  if (contradictions.length) {
    addFinding(findings, 'assessment_contradiction', 0.5, 'Claimed proficiency conflicts with assessment evidence.', contradictions.map(skill => skill.name).slice(0, 5))
  }

  const offerRate = Number(signals.offer_acceptance_rate ?? -1)
  const interviewRate = Number(signals.interview_completion_rate ?? 0)
  if (offerRate > 0 && interviewRate === 0) {
    addFinding(findings, 'offer_without_interview', 0.65, 'Offers are recorded without completed interviews.', { offerRate, interviewRate })
  }

  const years = Number(profile.years_of_experience || 0)
  const historyMonths = history.reduce((sum, role) => sum + Number(role.duration_months || 0), 0)
  if (years > 3 && historyMonths > 0 && Math.abs(historyMonths / 12 - years) > Math.max(4, years * 0.6)) {
    addFinding(findings, 'timeline_mismatch', 0.5, 'Career history duration conflicts with stated experience.', { statedYears: years, historyYears: Number((historyMonths / 12).toFixed(1)) })
  }

  const salary = signals.expected_salary_range_inr_lpa || {}
  if (Number(salary.min || 0) > Number(salary.max || Infinity)) {
    addFinding(findings, 'salary_range_invalid', 0.35, 'Expected salary range is internally inconsistent.', salary)
  }

  const descriptions = history.map(role => String(role.description || '').trim().toLowerCase()).filter(Boolean)
  if (descriptions.length >= 3 && new Set(descriptions).size === 1) {
    addFinding(findings, 'repeated_history_text', 0.4, 'Career entries repeat identical descriptions.', descriptions[0].slice(0, 120))
  }

  const risk = Math.min(1, findings.reduce((total, finding) => total + finding.severity, 0))
  return {
    isHoneypot: /^HP_/i.test(id) || risk >= 0.65,
    explicit: /^HP_/i.test(id),
    needsReview: !/^HP_/i.test(id) && risk >= 0.65,
    risk: Number(risk.toFixed(3)),
    confidence: Number((findings.length ? Math.min(0.99, 0.55 + findings.length * 0.1) : 0.85).toFixed(3)),
    findings
  }
}

export function isHoneypot(candidate) {
  return assessHoneypot(candidate).isHoneypot
}
