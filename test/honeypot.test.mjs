import test from 'node:test'
import assert from 'node:assert/strict'
import { assessHoneypot } from '../src/lib/honeypot.js'

test('explicit HP records are quarantined with evidence', () => {
  const result = assessHoneypot({ candidate_id: 'HP_0000001', profile: {}, skills: [], career_history: [], redrob_signals: {} })
  assert.equal(result.explicit, true)
  assert.equal(result.isHoneypot, true)
  assert.ok(result.findings.some(item => item.code === 'explicit_marker'))
})

test('suspicious valid IDs enter review without becoming explicit honeypots', () => {
  const result = assessHoneypot({
    candidate_id: 'CAND_0000001', profile: { years_of_experience: 12 },
    skills: [{ name: 'Python', proficiency: 'expert', duration_months: 0 }],
    career_history: [{ duration_months: 12 }], redrob_signals: { offer_acceptance_rate: 1, interview_completion_rate: 0 }
  })
  assert.equal(result.explicit, false)
  assert.equal(result.needsReview, true)
})
