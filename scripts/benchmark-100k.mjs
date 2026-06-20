import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const input = resolve(process.argv[2] || '')
const baseUrl = process.env.CIPHERRANKER_URL || 'http://127.0.0.1:5173'
if (!process.argv[2]) throw new Error('Usage: node scripts/benchmark-100k.mjs <candidates.jsonl>')

const jd = `Senior AI Engineer — Search, Retrieval and Ranking. Build production AI systems for semantic search, retrieval, ranking and recommendations. Require 5–9 years, strong Python, embeddings, vector databases, information retrieval, evaluation metrics, RAG and modern NLP/LLM systems. India preferred.`
async function fetchJsonWithRetry(url, options, attempts = 6) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, options)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      return data
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      await new Promise(resolve => setTimeout(resolve, Math.min(2000, 250 * attempt)))
    }
  }
  throw lastError
}

const started = performance.now()
const response = await fetch(`${baseUrl}/api/jobs/local`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ localPath: input, jobDescription: jd })
})
const created = await response.json()
if (!response.ok) throw new Error(created.error || `Upload returned ${response.status}`)
const uploadMs = performance.now() - started
console.log(`Job ${created.jobId} created after ${(uploadMs / 1000).toFixed(2)}s local hashing`)

let job
let lastPhase = ''
let lastProcessed = -1
for (;;) {
  await new Promise(resolve => setTimeout(resolve, 500))
  job = await fetchJsonWithRetry(`${baseUrl}/api/jobs/${created.jobId}`)
  const processed = Number(job.metrics?.processed || 0)
  if (job.phase !== lastPhase || processed - lastProcessed >= 10000) {
    lastPhase = job.phase
    lastProcessed = processed
    const rps = job.metrics?.recordsPerSecond ? ` @ ${job.metrics.recordsPerSecond}/s` : ''
    console.log(`${job.phase}: ${processed} processed${rps}`)
  }
  if (job.status === 'complete' || job.status === 'failed') break
}
if (job.status === 'failed') throw new Error(job.error || 'Benchmark job failed')

const [audit, manifest, officialResponse] = await Promise.all([
  fetch(`${baseUrl}/api/jobs/${created.jobId}/audit`).then(item => item.json()),
  fetch(`${baseUrl}/api/jobs/${created.jobId}/manifest`).then(item => item.json()),
  fetch(`${baseUrl}/api/jobs/${created.jobId}/export`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'official', participantId: 'benchmark_team' })
  })
])
if (!officialResponse.ok) throw new Error((await officialResponse.json()).error || 'Official export failed')
const official = await officialResponse.text()
await writeFile('benchmark_team.csv', official)

const report = {
  jobId: created.jobId, measuredAt: new Date().toISOString(),
  uploadMs: Math.round(uploadMs), engineMs: job.metrics.totalMs,
  endToEndMs: Math.round(performance.now() - started),
  records: job.metrics.total, recordsPerSecond: job.metrics.recordsPerSecond,
  workerCount: job.metrics.workerCount, cacheHit: Boolean(job.lastEvent?.message?.includes('cache')),
  featureCacheHit: Boolean(job.metrics.featureCacheHit),
  featureBuildMs: job.metrics.featureBuildMs || 0,
  featureBytes: job.metrics.featureBytes || 0,
  explicitHoneypots: audit.honeypots, riskReviews: audit.riskReviews,
  providerAgreement: audit.providerAgreement, outputSha256: manifest.outputSha256,
  datasetSha256: manifest.datasetSha256, officialRows: official.trim().split(/\r?\n/).length - 1
}
await writeFile('benchmark-results.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
