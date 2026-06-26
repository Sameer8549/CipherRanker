import { createServer as createHttpServer } from 'node:http'
import { createWriteStream } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { createAiService } from './server/ai-service.mjs'
import { createJobEngine } from './server/job-engine.mjs'

const root = resolve(process.cwd())
const developmentRequested = process.argv.includes('--development')
const mode = process.env.NODE_ENV === 'development' || developmentRequested ? 'development' : 'production'
async function loadLocalEnv(mode) {
  const files = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
  const loaded = {}
  for (const fileName of files) {
    let text = ''
    try { text = await readFile(join(root, fileName), 'utf8') } catch { continue }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)$/)
      if (!match) continue
      const [, key, raw] = match
      loaded[key] = raw.replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return loaded
}

const env = { ...(await loadLocalEnv(mode)), ...process.env }
const portArg = process.argv.find((arg) => arg.startsWith('--port='))?.split('=')[1]
const port = Number(env.X_ZOHO_CATALYST_LISTEN_PORT || env.PORT || portArg || 5173)
const host = String(env.HOST || (mode === 'development' ? '127.0.0.1' : '0.0.0.0'))
const corsOrigin = String(env.CORS_ORIGIN || 'https://rankker.netlify.app')
const cacheRoot = join(root, '.cache', 'cipherranker')
const aiService = createAiService(env, cacheRoot)
const engineVersion = '2.8.0-fast-sealed-cache'
const jobs = createJobEngine({ cacheRoot, aiService, version: engineVersion })
const uploadSessions = new Map()

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(data))
}

async function readJson(req, maxBytes = 2_000_000) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > maxBytes) throw new Error('Request is too large')
  }
  return JSON.parse(body || '{}')
}

function decodeHeader(value) {
  try { return Buffer.from(String(value || ''), 'base64').toString('utf8') }
  catch { return '' }
}

async function apiHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)
  const path = url.pathname

  if (path === '/api/status' && req.method === 'GET') {
    return sendJson(res, 200, { providers: aiService.status(), engine: { workerThreads: true, streaming: true, version: engineVersion } })
  }

  if (path === '/api/rubrics' && req.method === 'POST') {
    try {
      const body = await readJson(req)
      if (!String(body.jobDescription || '').trim()) return sendJson(res, 400, { error: 'A job description is required' })
      return sendJson(res, 200, await aiService.getRubric(body.jobDescription))
    } catch (error) { return sendJson(res, 500, { error: error.message }) }
  }

  if (path === '/api/jobs' && req.method === 'POST') {
    try {
      const fileName = decodeURIComponent(String(req.headers['x-file-name'] || 'candidates.jsonl'))
      const jobDescription = decodeHeader(req.headers['x-job-description'])
      if (!jobDescription.trim()) return sendJson(res, 400, { error: 'A job description is required' })
      const job = await jobs.acceptUpload(req, { fileName, jobDescription })
      return sendJson(res, 202, { jobId: job.id, datasetSha256: job.datasetHash, status: job.status })
    } catch (error) { return sendJson(res, 500, { error: error.message || 'Upload failed' }) }
  }

  if (path === '/api/uploads' && req.method === 'POST') {
    try {
      const body = await readJson(req)
      const fileName = String(body.fileName || 'candidates.jsonl')
      const jobDescription = String(body.jobDescription || '')
      if (!jobDescription.trim()) return sendJson(res, 400, { error: 'A job description is required' })
      if (!/\.(json|jsonl)$/i.test(fileName)) return sendJson(res, 400, { error: 'Candidate upload must be JSONL or JSON' })
      await mkdir(join(cacheRoot, 'uploads'), { recursive: true })
      const uploadId = randomUUID()
      const filePath = join(cacheRoot, 'uploads', `${uploadId}${extname(fileName) || '.jsonl'}`)
      const stream = createWriteStream(filePath)
      const session = {
        id: uploadId, fileName, filePath, jobDescription, stream,
        hash: createHash('sha256'), bytes: 0, nextChunk: 0, createdAt: Date.now()
      }
      uploadSessions.set(uploadId, session)
      return sendJson(res, 201, { uploadId, nextChunk: 0 })
    } catch (error) { return sendJson(res, 500, { error: error.message || 'Upload session could not be created' }) }
  }

  const uploadMatch = path.match(/^\/api\/uploads\/([^/]+)\/(chunk|complete)$/)
  if (uploadMatch) {
    const [, uploadId, action] = uploadMatch
    const session = uploadSessions.get(uploadId)
    if (!session) return sendJson(res, 404, { error: 'Upload session not found or expired' })
    if (action === 'chunk' && req.method === 'POST') {
      try {
        const chunkIndex = Number(req.headers['x-chunk-index'])
        if (chunkIndex !== session.nextChunk) return sendJson(res, 409, { error: `Expected chunk ${session.nextChunk}, received ${chunkIndex}` })
        let bytes = 0
        for await (const chunk of req) {
          bytes += chunk.length
          session.bytes += chunk.length
          session.hash.update(chunk)
          if (!session.stream.write(chunk)) await new Promise(resolve => session.stream.once('drain', resolve))
        }
        session.nextChunk++
        return sendJson(res, 200, { uploadId, chunkIndex, bytes, receivedBytes: session.bytes, nextChunk: session.nextChunk })
      } catch (error) { return sendJson(res, 500, { error: error.message || 'Chunk upload failed' }) }
    }
    if (action === 'complete' && req.method === 'POST') {
      try {
        await new Promise((resolve, reject) => session.stream.end(error => error ? reject(error) : resolve()))
        uploadSessions.delete(uploadId)
        const job = await jobs.acceptPreparedFile(session.filePath, {
          fileName: session.fileName,
          jobDescription: session.jobDescription,
          datasetHash: session.hash.digest('hex'),
          bytes: session.bytes
        })
        return sendJson(res, 202, { jobId: job.id, datasetSha256: job.datasetHash, status: job.status, receivedBytes: session.bytes })
      } catch (error) {
        uploadSessions.delete(uploadId)
        return sendJson(res, 500, { error: error.message || 'Upload could not be finalized' })
      }
    }
  }

  if (path === '/api/jobs/local' && req.method === 'POST') {
    try {
      const body = await readJson(req)
      if (!String(body.jobDescription || '').trim()) return sendJson(res, 400, { error: 'A job description is required' })
      const job = await jobs.acceptLocal(resolve(String(body.localPath || '')), body.jobDescription)
      return sendJson(res, 202, { jobId: job.id, datasetSha256: job.datasetHash, status: job.status, directLocalPath: true })
    } catch (error) { return sendJson(res, 500, { error: error.message || 'Local dataset could not be opened' }) }
  }

  const match = path.match(/^\/api\/jobs\/([^/]+)(?:\/(events|results|audit|manifest|export))?$/)
  if (match) {
    const [, jobId, action] = match
    const job = jobs.getJob(jobId)
    if (!job) return sendJson(res, 404, { error: 'Job not found' })

    if (!action && req.method === 'GET') {
      return sendJson(res, 200, { jobId, status: job.status, phase: job.phase, error: job.error, metrics: job.metrics, lastEvent: job.lastEvent })
    }
    if (action === 'events' && req.method === 'GET') {
      res.writeHead(200, {
        'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive', 'x-accel-buffering': 'no'
      })
      res.write(`data: ${JSON.stringify(job.lastEvent || { jobId, phase: job.phase, status: job.status, metrics: job.metrics })}\n\n`)
      if (job.status === 'complete' || job.status === 'failed') return res.end()
      const unsubscribe = jobs.subscribe(jobId, event => {
        res.write(`data: ${JSON.stringify(event)}\n\n`)
        if (event.phase === 'complete' || event.phase === 'failed') { unsubscribe?.(); res.end() }
      })
      const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 15000)
      req.on('close', () => { clearInterval(keepAlive); unsubscribe?.() })
      return
    }
    if (action === 'results' && req.method === 'GET') {
      const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0)
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100))
      return sendJson(res, 200, jobs.getResults(jobId, offset, limit))
    }
    if (action === 'audit' && req.method === 'GET') return sendJson(res, 200, job.audit || { pending: true })
    if (action === 'manifest' && req.method === 'GET') return sendJson(res, 200, job.manifest || { pending: true })
    if (action === 'export' && req.method === 'POST') {
      try {
        const body = await readJson(req)
        const type = ['official', 'audit-csv', 'audit-json'].includes(body.type) ? body.type : 'official'
        const participantId = String(body.participantId || 'team_cipher').replace(/[^a-zA-Z0-9_-]/g, '_')
        const exported = jobs.exportJob(jobId, type)
        if (!exported) return sendJson(res, 409, { error: 'Job is not ready for export' })
        const suffix = type === 'official' ? participantId : `${participantId}_${type}`
        res.writeHead(200, {
          'content-type': `${exported.contentType}; charset=utf-8`,
          'content-disposition': `attachment; filename="${suffix}.${exported.extension}"`,
          'cache-control': 'no-store'
        })
        return res.end(exported.body)
      } catch (error) { return sendJson(res, 500, { error: error.message }) }
    }
  }

  // Backwards-compatible compact AI endpoint used by the CLI.
  if (path === '/api/rank' && req.method === 'POST') {
    try {
      const body = await readJson(req)
      const rubric = await aiService.getRubric(body.jobDescription)
      const explanation = await aiService.explain(body.candidates || [], rubric.consensusRubric)
      return sendJson(res, 200, { providers: rubric.providers, consensusRubric: rubric.consensusRubric, agreement: rubric.agreement, explanations: explanation })
    } catch (error) { return sendJson(res, 500, { error: error.message || 'Ranking failed' }) }
  }
  return false
}

const vite = mode === 'development'
  ? await import('vite').then(({ createServer }) => createServer({ root, server: { middlewareMode: true }, appType: 'spa' }))
  : null
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }

const server = createHttpServer(async (req, res) => {
  if (req.url?.startsWith('/api/')) {
    res.setHeader('access-control-allow-origin', corsOrigin)
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
    res.setHeader('access-control-allow-headers', 'content-type,x-file-name,x-job-description,x-chunk-index')
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-max-age': '86400' })
      return res.end()
    }
    const handled = await apiHandler(req, res)
    if (handled !== false) return
    return sendJson(res, 404, { error: 'Not found' })
  }
  if (vite) return vite.middlewares(req, res)
  try {
    const requested = req.url === '/' ? 'index.html' : req.url.split('?')[0].replace(/^\//, '')
    let file = join(root, 'dist', requested)
    try { await stat(file) } catch { file = join(root, 'dist', 'index.html') }
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' })
    res.end(await readFile(file))
  } catch { res.writeHead(404).end('Not found') }
})

server.listen(port, host, () => console.log(`CipherRanker running at http://${host}:${port}`))
