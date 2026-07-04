import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { verifyExplanation } from '../src/lib/evidence.js'

export const DEFAULT_RUBRIC = {
  weights: { career_track: 0.30, skill_match: 0.30, experience_years: 0.15, location: 0.10, education: 0.15 },
  must_have_skills: ['python', 'machine learning', 'deep learning', 'pytorch', 'tensorflow'],
  nice_to_have_skills: ['cloud', 'docker', 'kubernetes', 'mlops', 'nlp', 'llm'],
  ideal_experience_years: { min: 5, max: 9 },
  preferred_locations: ['india'],
  red_flag_titles: ['recruiter', 'hr', 'sales', 'marketing'],
  red_flag_skills: [],
  career_track_keywords: ['shipped', 'production', 'deployment', 'ml engineer', 'data scientist'],
  notes: 'Deterministic fallback rubric'
}

const RUBRIC_PROMPT = `You are an independent technical recruiting rubric designer. Read the job description and return only JSON:
{"rubric":{"weights":{"career_track":0,"skill_match":0,"experience_years":0,"location":0,"education":0},"must_have_skills":[],"nice_to_have_skills":[],"ideal_experience_years":{"min":0,"max":0},"preferred_locations":[],"red_flag_titles":[],"red_flag_skills":[],"career_track_keywords":[],"notes":""},"confidence":0}
Weights must sum to 1. Use location only when explicitly required. confidence is 0-1. Do not infer protected characteristics.`

const EXPLAIN_PROMPT = `You are an evidence-bound recruiting auditor. Return only JSON:
{"assessments":[{"candidate_id":"","fit_score":0,"explanation":"","strengths":[],"concerns":[]}]}
Assess every supplied candidate exactly once. Use only supplied evidence. If is_honeypot is true, mention the profile-risk evidence. Keep explanations under 45 words.`

const hash = value => createHash('sha256').update(String(value)).digest('hex')
const DEFAULT_AI_PROXY_BASE_URL = 'https://cipherranker-50043309761.development.catalystappsail.in'

export function normalizeRubric(value) {
  const rubric = value && typeof value === 'object' ? value : {}
  const raw = { ...DEFAULT_RUBRIC.weights, ...(rubric.weights || {}) }
  const safe = Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, Math.max(0, Number(item) || 0)]))
  const sum = Object.values(safe).reduce((total, item) => total + item, 0) || 1
  return {
    ...DEFAULT_RUBRIC,
    ...rubric,
    weights: Object.fromEntries(Object.entries(safe).map(([key, item]) => [key, item / sum])),
    ideal_experience_years: { ...DEFAULT_RUBRIC.ideal_experience_years, ...(rubric.ideal_experience_years || {}) },
    must_have_skills: Array.isArray(rubric.must_have_skills) ? rubric.must_have_skills.slice(0, 30) : DEFAULT_RUBRIC.must_have_skills,
    nice_to_have_skills: Array.isArray(rubric.nice_to_have_skills) ? rubric.nice_to_have_skills.slice(0, 30) : DEFAULT_RUBRIC.nice_to_have_skills,
    preferred_locations: Array.isArray(rubric.preferred_locations) ? rubric.preferred_locations.slice(0, 20) : []
  }
}

function schemaConfidence(parsed) {
  if (!parsed?.rubric || typeof parsed.rubric !== 'object') return 0
  const weights = parsed.rubric.weights || {}
  const finite = Object.values(weights).filter(value => Number.isFinite(Number(value))).length
  const supplied = Math.min(1, finite / 5)
  const modelConfidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.7))
  return Number((supplied * 0.55 + modelConfidence * 0.45).toFixed(3))
}

function parseJson(text) {
  const clean = String(text || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
  return JSON.parse(clean)
}

async function callProvider(provider, system, payload, maxTokens = 2500) {
  if (!provider.key) throw new Error(`${provider.label} key is not configured`)
  let lastError
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const started = Date.now()
    try {
      const response = await fetch(provider.url, {
        method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.key}` },
        body: JSON.stringify({
          model: provider.model, temperature: 0.05, max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(payload) }]
        })
      })
      if (!response.ok) throw new Error(`${provider.label} returned ${response.status}: ${(await response.text()).slice(0, 180)}`)
      const data = await response.json()
      return { parsed: parseJson(data.choices?.[0]?.message?.content), latencyMs: Date.now() - started }
    } catch (error) {
      lastError = error
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 250))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

function buildConsensus(outputs) {
  const successful = Object.values(outputs).filter(output => output.ok && output.rubric)
  if (!successful.length) return { rubric: DEFAULT_RUBRIC, agreement: 0, fallback: true }
  const totalConfidence = successful.reduce((sum, output) => sum + output.confidence, 0) || successful.length
  const weights = {}
  for (const key of Object.keys(DEFAULT_RUBRIC.weights)) {
    weights[key] = successful.reduce((sum, output) => sum + Number(output.rubric.weights[key] || 0) * output.confidence, 0) / totalConfidence
  }
  const union = key => [...new Set(successful.flatMap(output => output.rubric[key] || []).map(value => String(value).trim()).filter(Boolean))].slice(0, 30)
  let agreement = 1
  if (successful.length > 1) {
    const [a, b] = successful
    const distance = Object.keys(DEFAULT_RUBRIC.weights).reduce((sum, key) => sum + Math.abs(a.rubric.weights[key] - b.rubric.weights[key]), 0) / 2
    agreement = Math.max(0, 1 - distance)
  }
  return {
    rubric: normalizeRubric({
      ...successful[0].rubric, weights,
      must_have_skills: union('must_have_skills'), nice_to_have_skills: union('nice_to_have_skills'),
      preferred_locations: union('preferred_locations'), red_flag_titles: union('red_flag_titles'),
      red_flag_skills: union('red_flag_skills'), career_track_keywords: union('career_track_keywords'),
      notes: `Confidence-weighted consensus from ${successful.length} provider(s)`
    }),
    agreement: Number(agreement.toFixed(3)), fallback: false
  }
}

export function createAiService(env, cacheRoot) {
  const providers = {
    groq: { label: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', key: env.GROQ_API_KEY },
    mistral: { label: 'Mistral', url: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest', key: env.MISTRAL_API_KEY }
  }
  const hasLocalKeys = Object.values(providers).every(provider => Boolean(provider.key))
  const proxyBaseUrl = String(env.AI_PROXY_BASE_URL || DEFAULT_AI_PROXY_BASE_URL).replace(/\/$/, '')
  const memory = new Map()
  const rubricDir = join(cacheRoot, 'rubrics')

  async function callProxy(path, payload) {
    const response = await fetch(`${proxyBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data) throw new Error(`AI proxy ${path} returned ${response.status}`)
    return data
  }

  async function getRubric(jobDescription) {
    const providerSignature = hasLocalKeys ? Object.values(providers).map(item => item.model).join('|') : `proxy:${proxyBaseUrl}`
    const cacheKey = hash(`${jobDescription}|${providerSignature}`)
    if (memory.has(cacheKey)) return { ...memory.get(cacheKey), cacheHit: true }
    const file = join(rubricDir, `${cacheKey}.json`)
    try {
      const cached = JSON.parse(await readFile(file, 'utf8'))
      memory.set(cacheKey, cached)
      return { ...cached, cacheHit: true }
    } catch {}

    if (!hasLocalKeys) {
      const proxied = await callProxy('/api/rubrics', { jobDescription })
      const result = { ...proxied, cacheKey, proxied: true, cacheHit: false }
      await mkdir(rubricDir, { recursive: true })
      await writeFile(file, JSON.stringify(result, null, 2))
      memory.set(cacheKey, result)
      return result
    }

    const settled = await Promise.allSettled(Object.entries(providers).map(async ([key, provider]) => {
      const response = await callProvider(provider, RUBRIC_PROMPT, { jobDescription }, 1800)
      return [key, {
        ok: true, model: provider.model, latencyMs: response.latencyMs,
        confidence: schemaConfidence(response.parsed), rubric: normalizeRubric(response.parsed.rubric)
      }]
    }))
    const outputs = {}
    settled.forEach((item, index) => {
      const key = Object.keys(providers)[index]
      outputs[key] = item.status === 'fulfilled' ? item.value[1] : { ok: false, model: providers[key].model, error: item.reason?.message || 'Provider failed' }
    })
    const consensus = buildConsensus(outputs)
    const result = { cacheKey, providers: outputs, consensusRubric: consensus.rubric, agreement: consensus.agreement, fallback: consensus.fallback, cacheHit: false }
    await mkdir(rubricDir, { recursive: true })
    await writeFile(file, JSON.stringify(result, null, 2))
    memory.set(cacheKey, result)
    return result
  }

  async function explain(candidates, rubric) {
    if (!hasLocalKeys) return callProxy('/api/explain', { candidates, rubric })

    const settled = await Promise.allSettled(Object.entries(providers).map(async ([key, provider]) => {
      const response = await callProvider(provider, EXPLAIN_PROMPT, { rubric, candidates }, 2400)
      return [key, { ok: true, model: provider.model, latencyMs: response.latencyMs, assessments: response.parsed.assessments || [] }]
    }))
    const outputs = {}
    settled.forEach((item, index) => {
      const key = Object.keys(providers)[index]
      outputs[key] = item.status === 'fulfilled' ? item.value[1] : { ok: false, model: providers[key].model, error: item.reason?.message || 'Provider failed', assessments: [] }
    })

    const byId = {}
    for (const candidate of candidates) {
      const entries = []
      for (const [provider, output] of Object.entries(outputs)) {
        const assessment = output.assessments?.find(item => item.candidate_id === candidate.candidate_id)
        if (!assessment) continue
        const verified = verifyExplanation(assessment.explanation, candidate)
        entries.push({ provider, ...assessment, explanation: verified.explanation, verified: verified.valid, rejectedClaims: verified.rejectedClaims })
      }
      entries.forEach(item => {
        const value = Number(item.fit_score)
        item.fit_score = Number.isFinite(value) ? Number((value <= 1 ? value * 100 : value).toFixed(1)) : null
      })
      const scores = entries.map(item => Number(item.fit_score)).filter(Number.isFinite)
      byId[candidate.candidate_id] = {
        providers: entries,
        consensusFit: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : null,
        disagreement: scores.length > 1 ? Number(Math.abs(scores[0] - scores[1]).toFixed(1)) : null
      }
    }
    return { providers: outputs, byId }
  }

  return {
    getRubric, explain,
    status: () => Object.fromEntries(Object.entries(providers).map(([key, provider]) => [key, { configured: Boolean(provider.key) || !hasLocalKeys, model: provider.model, source: hasLocalKeys ? 'local' : 'proxy' }]))
  }
}
