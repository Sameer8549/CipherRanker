import { availableParallelism } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, writeFile, stat } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { extname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { Worker } from 'node:worker_threads'
import { DEFAULT_RUBRIC } from './ai-service.mjs'
import { generateReasoning } from '../src/lib/reasoning.js'
import { buildEvidence } from '../src/lib/evidence.js'

const hashText = value => createHash('sha256').update(String(value)).digest('hex')
const FEATURE_SCHEMA_VERSION = 'features-v1'
const csvCell = value => {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

class WorkerPool {
  constructor(size) {
    this.queue = []
    this.sequence = 0
    this.workers = Array.from({ length: size }, () => this.createWorker())
  }

  createWorker() {
    const state = { worker: new Worker(new URL('./rank-worker.mjs', import.meta.url)), busy: false, task: null }
    state.worker.on('message', message => {
      const task = state.task
      state.busy = false
      state.task = null
      if (message.error) task.reject(new Error(message.error))
      else task.resolve(message.results)
      this.dispatch()
    })
    state.worker.on('error', error => {
      state.task?.reject(error)
      state.busy = false
      state.task = null
      this.dispatch()
    })
    return state
  }

  run(candidates, rubric) {
    return new Promise((resolve, reject) => {
      this.queue.push({ batchId: ++this.sequence, candidates, rubric, resolve, reject })
      this.dispatch()
    })
  }

  dispatch() {
    for (const state of this.workers) {
      if (state.busy || !this.queue.length) continue
      const task = this.queue.shift()
      state.busy = true
      state.task = task
      state.worker.postMessage({ batchId: task.batchId, candidates: task.candidates, rubric: task.rubric })
    }
  }

  async close() {
    await Promise.all(this.workers.map(state => state.worker.terminate()))
  }
}

async function* iterateCandidates(filePath, fileName) {
  const extension = extname(fileName).toLowerCase()
  if (extension === '.jsonl') {
    const lines = createInterface({ input: createReadStream(filePath, { encoding: 'utf8' }), crlfDelay: Infinity })
    let lineNumber = 0
    for await (const line of lines) {
      lineNumber++
      if (!line.trim()) continue
      try { yield JSON.parse(line) }
      catch { throw new Error(`Invalid JSONL at line ${lineNumber}`) }
    }
    return
  }
  if (['.csv', '.xlsx', '.xls'].includes(extension)) {
    throw new Error('Candidate upload must be JSONL or JSON. CSV/XLSX files are only supported as ranked output exports.')
  }
  const text = await readFile(filePath, 'utf8')
  let payload
  try { payload = JSON.parse(text.replace(/^\uFEFF/, '')) }
  catch { throw new Error('Invalid candidate file. Upload JSONL, JSON, or {"candidates":[...]} data.') }
  const candidates = Array.isArray(payload) ? payload : payload.candidates
  if (!Array.isArray(candidates)) throw new Error('Expected a JSON array, JSONL records, or {"candidates": [...]}')
  for (const candidate of candidates) yield candidate
}

function sortResults(results) {
  results.sort((a, b) => b.score - a.score || String(a.candidate.candidate_id).localeCompare(String(b.candidate.candidate_id)))
  results.forEach((result, index) => { result.rank = index + 1 })
  return results
}

function prepareCandidate(candidate) {
  const profile = candidate.profile || {}
  const signals = candidate.redrob_signals || {}
  const skills = (candidate.skills || []).slice(0, 24).map(skill => ({
    name: skill.name || '',
    proficiency: skill.proficiency || '',
    duration_months: Number(skill.duration_months || 0),
    endorsements: Number(skill.endorsements || 0)
  }))
  const assessmentScores = {}
  const rawScores = signals.skill_assessment_scores || {}
  for (const skill of skills) {
    if (Object.hasOwn(rawScores, skill.name)) assessmentScores[skill.name] = rawScores[skill.name]
  }
  return {
    candidate_id: candidate.candidate_id,
    profile: {
      anonymized_name: profile.anonymized_name || '',
      headline: profile.headline || '',
      summary: String(profile.summary || '').slice(0, 320),
      current_title: profile.current_title || '',
      current_company: profile.current_company || '',
      years_of_experience: Number(profile.years_of_experience || 0),
      location: profile.location || '',
      country: profile.country || ''
    },
    skills,
    career_history: (candidate.career_history || []).slice(0, 4).map(role => ({
      title: role.title || '',
      company: role.company || '',
      duration_months: Number(role.duration_months || 0),
      description: String(role.description || '').slice(0, 240)
    })),
    education: (candidate.education || []).slice(0, 2).map(item => ({
      degree: item.degree || '',
      field_of_study: item.field_of_study || '',
      institution: item.institution || '',
      tier: item.tier || ''
    })),
    redrob_signals: {
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
      expected_salary_range_inr_lpa: signals.expected_salary_range_inr_lpa || null,
      skill_assessment_scores: assessmentScores
    }
  }
}

function applyDuplicateAudit(results) {
  const groups = new Map()
  for (const result of results) {
    const candidate = result.candidate
    const signature = `${candidate.profile?.headline || ''}|${(candidate.skills || []).map(skill => skill.name).sort().join('|')}|${(candidate.career_history || []).map(role => role.description || '').join('|')}`
    if (!groups.has(signature)) groups.set(signature, [])
    groups.get(signature).push(result)
  }
  for (const duplicates of groups.values()) {
    if (duplicates.length < 4) continue
    for (const result of duplicates) {
      result.honeypot.findings.push({ code: 'duplicate_signature', severity: 0.35, message: 'Profile signature is repeated across multiple records.', evidence: { count: duplicates.length } })
      result.honeypot.risk = Math.min(1, Number((result.honeypot.risk + 0.35).toFixed(3)))
      result.honeypot.isHoneypot ||= result.honeypot.risk >= 0.65
      result.isHoneypot = result.honeypot.isHoneypot
    }
  }
}

function weightedScore(result, weights) {
  const components = result.components || {}
  const map = { career: weights.career_track, skills: weights.skill_match, experience: weights.experience_years, location: weights.location, education: weights.education }
  const sum = Object.values(map).reduce((total, value) => total + Number(value || 0), 0) || 1
  const base = Object.entries(map).reduce((total, [key, value]) => total + Number(components[key] || 0) * Number(value || 0) / sum, 0)
  return Math.min(1, base * Number(result.bm || 0))
}

function stabilityAudit(results, rubric) {
  const keys = Object.keys(rubric.weights)
  const scenarios = keys.map(key => {
    const weights = { ...rubric.weights, [key]: rubric.weights[key] * 1.15 }
    return results.map(result => ({ id: result.candidate.candidate_id, score: weightedScore(result, weights) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 250)
  })
  const positions = new Map()
  scenarios.forEach(list => list.forEach((item, index) => {
    if (!positions.has(item.id)) positions.set(item.id, [])
    positions.get(item.id).push(index + 1)
  }))
  return Object.fromEntries(results.slice(0, 250).map(result => {
    const ranks = positions.get(result.candidate.candidate_id) || []
    const minRank = ranks.length ? Math.min(...ranks) : 251
    const maxRank = ranks.length ? Math.max(...ranks) : 251
    const inclusionProbability = ranks.filter(rank => rank <= 100).length / scenarios.length
    return [result.candidate.candidate_id, {
      minRank, maxRank, inclusionProbability: Number(inclusionProbability.toFixed(2)),
      stability: Number(Math.max(0, 1 - (maxRank - minRank) / 250).toFixed(3)),
      unstable: maxRank - minRank > 25
    }]
  }))
}

export function createOfficialCsv(results) {
  const eligible = results.filter(result => /^CAND_\d{7}$/.test(result.candidate.candidate_id)).slice(0, 100)
  if (eligible.length !== 100) throw new Error(`Official export requires 100 eligible candidates; found ${eligible.length}`)
  const rows = ['candidate_id,rank,score,reasoning']
  eligible.forEach((result, index) => rows.push([
    result.candidate.candidate_id, index + 1, Number(result.score).toFixed(6), csvCell(result.reasoning)
  ].join(',')))
  return `${rows.join('\r\n')}\r\n`
}

export function createAuditCsv(results) {
  const rows = ['candidate_id,rank,score,anonymized_name,title,location,honeypot,risk,stability,reasoning']
  results.forEach(result => rows.push([
    csvCell(result.candidate.candidate_id), result.rank, Number(result.score).toFixed(6),
    csvCell(result.candidate.profile?.anonymized_name), csvCell(result.candidate.profile?.current_title),
    csvCell(result.candidate.profile?.location), result.isHoneypot ? 'true' : 'false',
    result.honeypot?.risk ?? 0, result.stability?.stability ?? '', csvCell(result.reasoning)
  ].join(',')))
  return `${rows.join('\r\n')}\r\n`
}

export function createJobEngine({ cacheRoot, aiService, version = '1.0.0' }) {
  const jobs = new Map()
  const events = new EventEmitter()
  events.setMaxListeners(100)
  const uploadsDir = join(cacheRoot, 'uploads')
  const jobsDir = join(cacheRoot, 'jobs')
  const featuresDir = join(cacheRoot, 'features')

  const publish = (job, phase, data = {}) => {
    job.phase = phase
    Object.assign(job.metrics, data.metrics || {})
    const event = { jobId: job.id, phase, status: job.status, timestamp: Date.now(), ...data }
    job.lastEvent = event
    events.emit(job.id, event)
  }

  async function acceptUpload(req, { fileName, jobDescription }) {
    await mkdir(uploadsDir, { recursive: true })
    const id = randomUUID()
    const filePath = join(uploadsDir, `${id}${extname(fileName) || '.jsonl'}`)
    const output = createWriteStream(filePath)
    const datasetHash = createHash('sha256')
    let bytes = 0
    for await (const chunk of req) {
      bytes += chunk.length
      datasetHash.update(chunk)
      if (!output.write(chunk)) await new Promise(resolve => output.once('drain', resolve))
    }
    await new Promise((resolve, reject) => output.end(error => error ? reject(error) : resolve()))
    const job = {
      id, filePath, fileName, jobDescription, datasetHash: datasetHash.digest('hex'),
      status: 'queued', phase: 'queued', createdAt: Date.now(), updatedAt: Date.now(),
      metrics: { bytes, processed: 0, recordsPerSecond: 0 }, results: [], audit: null, manifest: null
    }
    jobs.set(id, job)
    queueMicrotask(() => run(job).catch(error => {
      job.status = 'failed'; job.error = error.message || 'Ranking failed'; publish(job, 'failed', { error: job.error })
    }))
    return job
  }

  async function acceptLocal(localPath, jobDescription) {
    const info = await stat(localPath)
    if (!info.isFile()) throw new Error('Local dataset path is not a file')
    if (!/\.(json|jsonl)$/i.test(localPath)) throw new Error('Local dataset must be JSON or JSONL')
    const hashIndexFile = join(cacheRoot, 'file-hashes.json')
    const fingerprint = hashText(`${localPath}|${info.size}|${info.mtimeMs}`)
    let hashIndex = {}
    try { hashIndex = JSON.parse(await readFile(hashIndexFile, 'utf8')) } catch {}
    let datasetHash = hashIndex[fingerprint]
    if (!datasetHash) {
      const digest = createHash('sha256')
      for await (const chunk of createReadStream(localPath)) digest.update(chunk)
      datasetHash = digest.digest('hex')
      hashIndex[fingerprint] = datasetHash
      await mkdir(cacheRoot, { recursive: true })
      await writeFile(hashIndexFile, JSON.stringify(hashIndex, null, 2))
    }
    const id = randomUUID()
    const job = {
      id, filePath: localPath, fileName: localPath.split(/[\\/]/).pop(), jobDescription,
      datasetHash, status: 'queued', phase: 'queued', createdAt: Date.now(), updatedAt: Date.now(),
      metrics: { bytes: info.size, processed: 0, recordsPerSecond: 0 }, results: [], audit: null, manifest: null, directLocalPath: true
    }
    jobs.set(id, job)
    queueMicrotask(() => run(job).catch(error => {
      job.status = 'failed'; job.error = error.message || 'Ranking failed'; publish(job, 'failed', { error: job.error })
    }))
    return job
  }

  async function ensureFeatureCache(job) {
    await mkdir(featuresDir, { recursive: true })
    const featureFile = join(featuresDir, `${job.datasetHash}.${FEATURE_SCHEMA_VERSION}.jsonl`)
    try {
      const cached = await stat(featureFile)
      if (cached.isFile() && cached.size > 0) {
        job.metrics.featureCacheHit = true
        job.metrics.featureBytes = cached.size
        return { filePath: featureFile, fileName: `${job.datasetHash}.jsonl`, hit: true }
      }
    } catch {}

    const tempFile = join(featuresDir, `${job.datasetHash}.${FEATURE_SCHEMA_VERSION}.${job.id}.tmp`)
    const output = createWriteStream(tempFile, { encoding: 'utf8' })
    let prepared = 0
    const started = Date.now()
    publish(job, 'features', { message: 'Building normalized local feature cache for fast reruns.', metrics: { ...job.metrics, featureCacheHit: false, featurePrepared: 0 } })
    try {
      for await (const candidate of iterateCandidates(job.filePath, job.fileName)) {
        if (!candidate?.candidate_id) continue
        prepared++
        const line = `${JSON.stringify(prepareCandidate(candidate))}\n`
        if (!output.write(line)) await new Promise(resolve => output.once('drain', resolve))
        if (prepared % 10000 === 0) {
          const elapsed = Math.max(0.001, (Date.now() - started) / 1000)
          publish(job, 'features', {
            message: 'Building normalized local feature cache for fast reruns.',
            metrics: { ...job.metrics, featurePrepared: prepared, featureRecordsPerSecond: Math.round(prepared / elapsed) }
          })
        }
      }
      await new Promise((resolve, reject) => output.end(error => error ? reject(error) : resolve()))
      await rename(tempFile, featureFile)
      const cached = await stat(featureFile)
      job.metrics.featureCacheHit = false
      job.metrics.featurePrepared = prepared
      job.metrics.featureBytes = cached.size
      job.metrics.featureBuildMs = Date.now() - started
      return { filePath: featureFile, fileName: `${job.datasetHash}.jsonl`, hit: false }
    } catch (error) {
      output.destroy()
      throw error
    }
  }

  async function run(job) {
    const started = Date.now()
    job.status = 'running'
    publish(job, 'rubric', { message: 'Groq and Mistral are independently designing the rubric.' })
    const ai = await aiService.getRubric(job.jobDescription)
    job.ai = ai
    const runKey = hashText(`${version}|${job.datasetHash}|${ai.cacheKey}`)
    job.runKey = runKey
    const cacheFile = join(jobsDir, `${runKey}.json`)
    const cacheMetaFile = join(jobsDir, `${runKey}.meta.json`)
    try {
      const cachedMeta = JSON.parse(await readFile(cacheMetaFile, 'utf8'))
      Object.assign(job, cachedMeta, {
        id: job.id, filePath: job.filePath, fileName: job.fileName,
        status: 'complete', cacheHit: true, results: cachedMeta.results || [],
        resultsTotal: cachedMeta.metrics?.total || cachedMeta.results?.length || 0
      })
      publish(job, 'complete', { message: 'Loaded a sealed deterministic run from cache.', metrics: job.metrics })
      return
    } catch {}
    try {
      const cached = JSON.parse(await readFile(cacheFile, 'utf8'))
      if (Array.isArray(cached.results) && cached.results.length > 0) {
        Object.assign(job, cached, { id: job.id, filePath: job.filePath, fileName: job.fileName, status: 'complete', cacheHit: true })
        publish(job, 'complete', { message: 'Loaded a sealed deterministic run from cache.', metrics: job.metrics })
        return
      }
    } catch {}

    const featureSource = await ensureFeatureCache(job)
    publish(job, 'parsing', {
      message: featureSource.hit ? 'Loading normalized feature cache.' : 'Loading freshly built normalized feature cache.',
      rubric: ai.consensusRubric, agreement: ai.agreement,
      metrics: { ...job.metrics, featureCacheHit: featureSource.hit }
    })
    const workerCount = Math.max(1, Math.min(8, availableParallelism() - 1))
    const pool = new WorkerPool(workerCount)
    const results = []
    const pending = new Set()
    let batch = []
    let parsed = 0
    const scoringStarted = Date.now()

    const dispatch = candidates => {
      const promise = pool.run(candidates, ai.consensusRubric).then(batchResults => {
        results.push(...batchResults)
        job.metrics.processed += batchResults.length
        const elapsed = Math.max(0.001, (Date.now() - scoringStarted) / 1000)
        job.metrics.recordsPerSecond = Math.round(job.metrics.processed / elapsed)
        if (job.metrics.processed % 5000 === 0) publish(job, 'scoring', { message: 'Parallel deterministic scoring in progress.', metrics: { ...job.metrics, parsed } })
      }).finally(() => pending.delete(promise))
      pending.add(promise)
    }

    const batchSize = featureSource.hit ? 2500 : 1500
    for await (const candidate of iterateCandidates(featureSource.filePath, featureSource.fileName)) {
      if (!candidate?.candidate_id) continue
      parsed++
      batch.push(candidate)
      if (batch.length >= batchSize) {
        dispatch(batch); batch = []
        if (pending.size >= workerCount * 2) await Promise.race(pending)
      }
    }
    if (batch.length) dispatch(batch)
    await Promise.all(pending)
    await pool.close()

    publish(job, 'honeypot', { message: 'Running adversarial and duplicate-profile audits.', metrics: { ...job.metrics, total: parsed } })
    applyDuplicateAudit(results)
    const baselineRanks = new Map(results
      .map(result => ({ id: result.candidate.candidate_id, score: weightedScore(result, DEFAULT_RUBRIC.weights) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .map((item, index) => [item.id, index + 1]))
    sortResults(results)
    results.forEach(result => {
      result.baselineRank = baselineRanks.get(result.candidate.candidate_id)
      result.rankDelta = result.baselineRank - result.rank
    })
    results.slice(0, 500).forEach(result => {
      result.reasoning = generateReasoning(result.candidate, result.rank, result.components)
      result.evidence = buildEvidence(result.candidate, result.components, ai.consensusRubric)
    })
    job.results = results
    publish(job, 'ranked', { message: 'Exact deterministic ranking is ready; audits continue in the background.', metrics: { ...job.metrics, total: parsed } })

    publish(job, 'stability', { message: 'Testing rank stability under rubric perturbations.' })
    const stability = stabilityAudit(results, ai.consensusRubric)
    results.slice(0, 250).forEach(result => { result.stability = stability[result.candidate.candidate_id] })

    publish(job, 'verification', { message: 'Groq and Mistral are auditing the final shortlist.' })
    const shortlist = results.slice(0, 10).map(result => ({
      candidate_id: result.candidate.candidate_id,
      current_title: result.candidate.profile?.current_title,
      years_of_experience: result.candidate.profile?.years_of_experience,
      location: result.candidate.profile?.location,
      skills: (result.candidate.skills || []).slice(0, 12),
      evidence: result.evidence,
      is_honeypot: result.isHoneypot,
      honeypot_findings: result.honeypot?.findings
    }))
    const verification = await aiService.explain(shortlist, ai.consensusRubric)
    results.slice(0, 10).forEach(result => { result.ai = verification.byId[result.candidate.candidate_id] || null })

    let officialCsv = ''
    let officialExportError = null
    try { officialCsv = createOfficialCsv(results) }
    catch (error) { officialExportError = error.message }
    const officialHash = officialCsv ? hashText(officialCsv) : null
    const totalMs = Date.now() - started
    const honeypots = results.filter(result => result.honeypot?.explicit).length
    const riskReviews = results.filter(result => result.honeypot?.needsReview).length
    job.status = 'complete'
    job.cacheHit = false
    job.metrics = { ...job.metrics, total: parsed, totalMs, workerCount, honeypots, riskReviews, eligible: results.filter(result => /^CAND_\d{7}$/.test(result.candidate.candidate_id)).length }
    job.audit = {
      providerAgreement: ai.agreement, providerFallback: ai.fallback,
      providers: { ...ai.providers, explanations: verification.providers },
      honeypots, riskReviews, unstableTop100: results.slice(0, 100).filter(result => result.stability?.unstable).length,
      privacy: { namesUsedForScoring: false, fullDatasetSentToAI: false, individuallyAuditedByAI: shortlist.length }
    }
    job.audit.officialExport = { valid: Boolean(officialCsv), error: officialExportError }
    job.manifest = {
      version, datasetSha256: job.datasetHash, jdSha256: hashText(job.jobDescription),
      rubricSha256: hashText(JSON.stringify(ai.consensusRubric)), outputSha256: officialHash,
      providerModels: Object.fromEntries(Object.entries(ai.providers).map(([key, value]) => [key, value.model])),
      createdAt: new Date().toISOString(), records: parsed, deterministicTieBreak: 'candidate_id ascending',
      featureSchemaVersion: FEATURE_SCHEMA_VERSION, featureCacheHit: Boolean(job.metrics.featureCacheHit)
    }
    publish(job, 'complete', { message: 'Ranking, audit, and export validation complete.', metrics: job.metrics, manifest: job.manifest })
    const shouldPersistFullResults = true
    if (shouldPersistFullResults) {
      await mkdir(jobsDir, { recursive: true })
      const persistedMeta = {
        fileName: job.fileName, jobDescription: job.jobDescription, datasetHash: job.datasetHash,
        runKey, status: job.status, phase: 'complete', metrics: job.metrics,
        results: job.results.slice(0, 1000), resultsTotal: job.results.length,
        audit: job.audit, manifest: job.manifest, ai: job.ai, officialCsv, cacheHit: false
      }
      void writeFile(cacheMetaFile, JSON.stringify(persistedMeta)).catch(error => {
        console.error('Could not persist job cache:', error.message)
      })
    }
  }

  function subscribe(jobId, listener) {
    const job = jobs.get(jobId)
    if (!job) return null
    events.on(jobId, listener)
    return () => events.off(jobId, listener)
  }

  function getJob(jobId) { return jobs.get(jobId) }
  function getResults(jobId, offset = 0, limit = 100) {
    const job = jobs.get(jobId)
    if (!job) return null
    return { total: job.resultsTotal ?? job.results.length, offset, limit, results: job.results.slice(offset, offset + limit) }
  }
  function exportJob(jobId, type) {
    const job = jobs.get(jobId)
    if (!job || job.status !== 'complete') return null
    if (type === 'official' && job.officialCsv) return { contentType: 'text/csv', extension: 'csv', body: job.officialCsv }
    if (type === 'audit-json') return { contentType: 'application/json', extension: 'json', body: JSON.stringify({ manifest: job.manifest, audit: job.audit, rubric: job.ai.consensusRubric, rankings: job.results }, null, 2) }
    if (type === 'audit-csv') return { contentType: 'text/csv', extension: 'csv', body: createAuditCsv(job.results) }
    return { contentType: 'text/csv', extension: 'csv', body: createOfficialCsv(job.results) }
  }

  return { acceptUpload, acceptLocal, subscribe, getJob, getResults, exportJob }
}
