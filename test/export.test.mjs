import test from 'node:test'
import assert from 'node:assert/strict'
import { createOfficialCsv } from '../server/job-engine.mjs'

test('official export contains exact schema, 100 valid rows, and no HP IDs', () => {
  const results = [{ candidate: { candidate_id: 'HP_0000001' }, score: 1, reasoning: 'trap', isHoneypot: true }]
  for (let index = 0; index < 101; index++) {
    results.push({ candidate: { candidate_id: `CAND_${String(index + 1).padStart(7, '0')}` }, score: 0.9 - index / 1000, reasoning: `Evidence for candidate ${index + 1}`, isHoneypot: false })
  }
  const lines = createOfficialCsv(results).trim().split(/\r?\n/)
  assert.equal(lines[0], 'candidate_id,rank,score,reasoning')
  assert.equal(lines.length, 101)
  assert.ok(lines.slice(1).every(line => line.startsWith('CAND_')))
})
