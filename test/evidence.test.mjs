import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyExplanation } from '../src/lib/evidence.js'

test('unsupported experience claims are rejected', () => {
  const candidate = { profile: { years_of_experience: 6 } }
  assert.equal(verifyExplanation('Candidate has 12 years of experience.', candidate).valid, false)
  assert.equal(verifyExplanation('Candidate has 6 years of experience.', candidate).valid, true)
})
