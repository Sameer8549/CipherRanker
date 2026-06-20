import { parentPort } from 'node:worker_threads'
import { scoreCandidateFast } from '../src/lib/fast-scorer.js'
import { assessHoneypot } from '../src/lib/honeypot.js'

function compactCandidate(candidate) {
  const profile = candidate.profile || {}
  const signals = candidate.redrob_signals || {}
  const compactSignals = {
    last_active_date: signals.last_active_date || '',
    open_to_work_flag: Boolean(signals.open_to_work_flag),
    recruiter_response_rate: Number(signals.recruiter_response_rate || 0),
    notice_period_days: Number(signals.notice_period_days ?? 90),
    github_activity_score: Number(signals.github_activity_score ?? -1),
    interview_completion_rate: Number(signals.interview_completion_rate || 0),
    offer_acceptance_rate: Number(signals.offer_acceptance_rate || 0),
    verified_email: Boolean(signals.verified_email),
    verified_phone: Boolean(signals.verified_phone),
    willing_to_relocate: Boolean(signals.willing_to_relocate),
    expected_salary_range_inr_lpa: signals.expected_salary_range_inr_lpa || null
  }
  return {
    candidate_id: candidate.candidate_id,
    profile: {
      anonymized_name: profile.anonymized_name || '', headline: profile.headline || '',
      current_title: profile.current_title || '', current_company: profile.current_company || '',
      years_of_experience: Number(profile.years_of_experience || 0), location: profile.location || '', country: profile.country || ''
    },
    skills: (candidate.skills || []).slice(0, 14).map(skill => ({
      name: skill.name || '',
      proficiency: skill.proficiency || '',
      duration_months: Number(skill.duration_months || 0),
      endorsements: Number(skill.endorsements || 0)
    })),
    career_history: (candidate.career_history || []).slice(0, 3).map(role => ({
      title: role.title || '',
      company: role.company || '',
      duration_months: Number(role.duration_months || 0),
      description: String(role.description || '').slice(0, 180)
    })),
    education: (candidate.education || []).slice(0, 2).map(item => ({
      degree: item.degree || '',
      field_of_study: item.field_of_study || '',
      institution: item.institution || '',
      tier: item.tier || ''
    })),
    redrob_signals: compactSignals
  }
}

parentPort.on('message', message => {
  const { batchId, candidates, rubric } = message
  try {
    const results = candidates.map(candidate => {
      const { score, components, behavioralMultiplier: bm } = scoreCandidateFast(candidate, rubric)
      const honeypot = assessHoneypot(candidate)
      return {
        candidate: compactCandidate(candidate),
        score: Number.isFinite(score) ? score : 0,
        components,
        bm: Number.isFinite(bm) ? bm : 0,
        isHoneypot: honeypot.isHoneypot,
        honeypot
      }
    })
    parentPort.postMessage({ batchId, results })
  } catch (error) {
    parentPort.postMessage({ batchId, error: error.message || 'Worker failed' })
  }
})
