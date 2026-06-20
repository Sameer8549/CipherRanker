import test from 'node:test'
import assert from 'node:assert/strict'
import { rankCandidates, scoreCandidate } from '../src/lib/scorer.js'
import { DEFAULT_RUBRIC } from '../server/ai-service.mjs'

function candidate(id, name = 'Anonymous') {
  return {
    candidate_id: id,
    profile: { anonymized_name: name, current_title: 'Senior ML Engineer', years_of_experience: 6, location: 'Pune', country: 'India' },
    skills: [{ name: 'Python', proficiency: 'expert', duration_months: 60, endorsements: 10 }],
    career_history: [{ title: 'ML Engineer', company: 'Product Co', duration_months: 72, description: 'Shipped production machine learning systems.' }],
    education: [{ degree: 'B.Tech', field_of_study: 'Computer Science', tier: 'tier_2' }],
    redrob_signals: { last_active_date: new Date().toISOString(), open_to_work_flag: true, recruiter_response_rate: 0.8, notice_period_days: 30, interview_completion_rate: 0.9 }
  }
}

test('candidate names never affect scoring', () => {
  const a = scoreCandidate(candidate('CAND_0000001', 'Name One'), null, DEFAULT_RUBRIC)
  const b = scoreCandidate(candidate('CAND_0000002', 'Completely Different'), null, DEFAULT_RUBRIC)
  assert.equal(a.score, b.score)
  assert.deepEqual(a.components, b.components)
})

test('location is neutral when JD has no location requirement', () => {
  const rubric = { ...DEFAULT_RUBRIC, preferred_locations: [] }
  assert.equal(scoreCandidate(candidate('CAND_0000001'), null, rubric).components.location, 1)
})

test('ranking is deterministic and candidate ID breaks score ties', () => {
  const ranked = rankCandidates([candidate('CAND_0000002'), candidate('CAND_0000001')], null, DEFAULT_RUBRIC, null)
  assert.deepEqual(ranked.map(item => item.candidate.candidate_id), ['CAND_0000001', 'CAND_0000002'])
})
