import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createJobEngine } from '../server/job-engine.mjs'
import { DEFAULT_RUBRIC } from '../server/ai-service.mjs'

const aiService = {
  async getRubric() {
    return {
      consensusRubric: DEFAULT_RUBRIC,
      providers: {},
      agreement: 0
    }
  },
  async explain() {
    return { providers: {}, byId: {} }
  }
}

async function waitForJob(engine, jobId) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const job = engine.getJob(jobId)
    if (job.status === 'complete' || job.status === 'failed') return job
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Timed out waiting for job')
}

test('uploaded CSV rows are normalized into rankable candidates', async () => {
  const cacheRoot = await mkdtemp(join(tmpdir(), 'cipherranker-upload-'))
  const engine = createJobEngine({ cacheRoot, aiService, version: 'test' })
  try {
    const csv = [
      'candidate_id,current_title,years_of_experience,location,country,skills,open_to_work,response_rate',
      'CAND_0000001,Senior ML Engineer,6,Pune,India,"Python:expert:72,RAG:advanced:24",true,0.8',
      'CAND_0000002,Sales Recruiter,3,Delhi,India,"Recruiting:advanced:36",yes,0.5'
    ].join('\n')
    const job = await engine.acceptUpload(Readable.from([csv]), {
      fileName: 'candidates.csv',
      jobDescription: 'Senior AI engineer with Python, RAG, search, and production ML experience.'
    })
    const finished = await waitForJob(engine, job.id)
    assert.equal(finished.status, 'complete')
    assert.equal(finished.metrics.total, 2)
    assert.equal(engine.getResults(job.id, 0, 10).results.length, 2)
  } finally {
    await engine.close?.()
    await rm(cacheRoot, { recursive: true, force: true })
  }
})
