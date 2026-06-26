import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ShaderBackground from './components/ShaderBackground.jsx'
import UploadZone from './components/UploadZone.jsx'
import RankingTable from './components/RankingTable.jsx'
import StatCards from './components/StatCards.jsx'
import ExportButton from './components/ExportButton.jsx'
import CandidateDrawer from './components/CandidateDrawer.jsx'
import CompareModal from './components/CompareModal.jsx'
import PipelinePanel from './components/PipelinePanel.jsx'
import AuditPanel from './components/AuditPanel.jsx'
import { apiUrl } from './lib/api.js'

const DEFAULT_JD = `Senior AI Engineer — Search, Retrieval and Ranking

Build production AI systems for semantic search, retrieval, ranking and recommendations. The ideal candidate has 5–9 years of experience, strong Python, embeddings, vector databases, information retrieval, evaluation metrics, RAG and modern NLP/LLM systems. Evidence of shipping production systems is required. Cloud, Docker, Kubernetes and MLOps are valuable. India-based candidates are preferred.`

const encodeHeader = text => btoa(unescape(encodeURIComponent(text)))
const LOCAL_MODE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
const CHUNK_SIZE = 4 * 1024 * 1024
const CHUNKED_UPLOAD_THRESHOLD = 8 * 1024 * 1024
const HOSTED_UPLOAD_LIMIT = 180 * 1024 * 1024

async function readApiJson(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await response.text().catch(() => '')
    const preview = text.replace(/\s+/g, ' ').slice(0, 140)
    throw new Error(`${fallbackMessage}: ${response.status} ${response.statusText || 'non-JSON response'} from ${new URL(response.url).pathname}${preview ? ` — ${preview}` : ''}`)
  }
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || fallbackMessage)
  return data
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function fetchApiJsonWithRetry(url, options, fallbackMessage, attempts = 3) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, options)
      return await readApiJson(response, fallbackMessage)
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      await wait(500 * attempt)
    }
  }
  throw lastError
}

export default function App() {
  const [jdText, setJdText] = useState(DEFAULT_JD)
  const [jobId, setJobId] = useState(null)
  const [jobEvent, setJobEvent] = useState(null)
  const [startedAt, setStartedAt] = useState(null)
  const [results, setResults] = useState([])
  const [audit, setAudit] = useState(null)
  const [manifest, setManifest] = useState(null)
  const [participantId, setParticipantId] = useState('team_cipher')
  const [localPath, setLocalPath] = useState('')
  const [error, setError] = useState('')
  const [selectedResult, setSelectedResult] = useState(null)
  const [compareList, setCompareList] = useState([])
  const [showCompare, setShowCompare] = useState(false)
  const [engineStatus, setEngineStatus] = useState('checking')
  const eventSourceRef = useRef(null)

  const activeRun = Boolean(jobId || jobEvent)
  const failed = jobEvent?.phase === 'failed' || Boolean(error && activeRun)
  const complete = jobEvent?.phase === 'complete' && results.length > 0
  const running = activeRun && !complete && !failed
  const showRankings = results.length > 0
  const metrics = jobEvent?.metrics || {}

  const explanations = useMemo(() => Object.fromEntries(results.map(result => {
    const verified = result.ai?.providers?.filter(item => item.verified && item.explanation) || []
    return [result.candidate.candidate_id, verified.map(item => `${item.provider === 'groq' ? 'Groq' : 'Mistral'}: ${item.explanation}`).join('\n\n') || result.reasoning]
  })), [results])

  useEffect(() => {
    let cancelled = false
    fetch(apiUrl('/api/status'), { cache: 'no-store' })
      .then(response => readApiJson(response, 'Ranking engine is unavailable'))
      .then(() => { if (!cancelled) setEngineStatus('ready') })
      .catch(() => { if (!cancelled) setEngineStatus('unavailable') })
    return () => { cancelled = true }
  }, [])

  const loadCompletedJob = useCallback(async id => {
    const [resultsResponse, auditResponse, manifestResponse] = await Promise.all([
      fetch(apiUrl(`/api/jobs/${id}/results?limit=100`)), fetch(apiUrl(`/api/jobs/${id}/audit`)), fetch(apiUrl(`/api/jobs/${id}/manifest`))
    ])
    if (!resultsResponse.ok) throw new Error('Could not load ranked results')
    const ranked = await resultsResponse.json()
    setResults(ranked.results || [])
    setAudit(await auditResponse.json())
    setManifest(await manifestResponse.json())
  }, [])

  const connectEvents = useCallback(id => {
    eventSourceRef.current?.close()
    const source = new EventSource(apiUrl(`/api/jobs/${id}/events`))
    eventSourceRef.current = source
    source.onmessage = async event => {
      const update = JSON.parse(event.data)
      setJobEvent(update)
      if (update.phase === 'ranked') {
        try {
          const ranked = await fetch(apiUrl(`/api/jobs/${id}/results?limit=100`)).then(response => readApiJson(response, 'Could not load ranked results'))
          setResults(ranked.results || [])
        } catch {}
      } else if (update.phase === 'complete') {
        source.close()
        try { await loadCompletedJob(id) } catch (loadError) { setError(loadError.message) }
      } else if (update.phase === 'failed') {
        source.close(); setError(update.error || 'Ranking failed')
      }
    }
    source.onerror = async () => {
      source.close()
      try {
        const status = await fetch(apiUrl(`/api/jobs/${id}`)).then(response => readApiJson(response, 'Could not reconnect to the ranking engine'))
        setJobEvent(status.lastEvent || status)
        if (status.status === 'complete') await loadCompletedJob(id)
        else if (status.status !== 'failed') setTimeout(() => connectEvents(id), 1000)
      } catch { setError('Lost connection to the local ranking engine.') }
    }
  }, [loadCompletedJob])

  const handleFile = useCallback(async file => {
    if (engineStatus === 'unavailable') {
      setError('The web interface is online, but its ranking backend is not connected. Run locally or configure VITE_API_BASE_URL for the deployed backend.')
      setJobEvent({ phase: 'failed', message: 'Ranking backend is not connected.' })
      return
    }
    if (!LOCAL_MODE && file.size > HOSTED_UPLOAD_LIMIT) {
      setError(`This dataset is ${(file.size / 1024 / 1024).toFixed(0)} MB, which is too large for Catalyst temporary storage. Run the local app and use the local file path for the official 100,000-candidate dataset.`)
      setJobEvent({
        phase: 'failed',
        message: 'Hosted upload stopped before Catalyst storage fills up.',
        metrics: { processed: 0, total: Math.round(file.size / 1024 / 1024), fileName: file.name }
      })
      return
    }
    setError(''); setResults([]); setAudit(null); setManifest(null); setCompareList([])
    setJobId(null)
    setStartedAt(Date.now()); setJobEvent({ phase: 'uploading', message: `Uploading ${file.name}. The ranking engine will start automatically after the file is received.`, metrics: { processed: 0, fileName: file.name } })
    try {
      if (file.size >= CHUNKED_UPLOAD_THRESHOLD) {
        const session = await fetch(apiUrl('/api/uploads'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, size: file.size, jobDescription: jdText })
        }).then(response => readApiJson(response, 'Upload session could not be created'))

        const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
        for (let index = 0; index < totalChunks; index++) {
          const start = index * CHUNK_SIZE
          const end = Math.min(file.size, start + CHUNK_SIZE)
          const chunk = file.slice(start, end)
          await fetchApiJsonWithRetry(apiUrl(`/api/uploads/${session.uploadId}/chunk`), {
            method: 'POST',
            headers: { 'x-chunk-index': String(index), 'content-type': 'application/octet-stream' },
            body: chunk
          }, `Chunk ${index + 1} failed`)
          const uploaded = end
          setJobEvent({
            phase: 'uploading',
            message: `Uploading ${file.name}: ${index + 1}/${totalChunks} chunks received.`,
            metrics: { processed: Math.round(uploaded / 1024 / 1024), total: Math.round(file.size / 1024 / 1024), recordsPerSecond: 0, fileName: file.name }
          })
        }

        const data = await fetch(apiUrl(`/api/uploads/${session.uploadId}/complete`), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}'
        }).then(response => readApiJson(response, 'Upload could not be finalized'))
        setJobId(data.jobId)
        connectEvents(data.jobId)
        return
      }
      const response = await fetch(apiUrl('/api/jobs'), {
        method: 'POST', body: file,
        headers: { 'x-file-name': encodeURIComponent(file.name), 'x-job-description': encodeHeader(jdText) }
      })
      const data = await readApiJson(response, 'Upload failed')
      setJobId(data.jobId)
      connectEvents(data.jobId)
    } catch (uploadError) { setError(uploadError.message); setJobEvent({ phase: 'failed', message: 'Upload failed before the ranking engine could start.' }) }
  }, [connectEvents, engineStatus, jdText])

  const handleLocalPath = useCallback(async () => {
    if (!localPath.trim()) return
    setError(''); setResults([]); setAudit(null); setManifest(null); setCompareList([]); setJobId(null); setStartedAt(Date.now())
    setJobEvent({ phase: 'uploading', message: 'Hashing the local dataset without duplicating it…', metrics: { processed: 0 } })
    try {
      const response = await fetch(apiUrl('/api/jobs/local'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ localPath: localPath.trim(), jobDescription: jdText })
      })
      const data = await readApiJson(response, 'Could not open local dataset')
      setJobId(data.jobId); connectEvents(data.jobId)
    } catch (pathError) { setError(pathError.message); setJobEvent({ phase: 'failed', message: 'Local file could not be opened.' }) }
  }, [connectEvents, jdText, localPath])

  const reset = () => {
    eventSourceRef.current?.close(); setJobId(null); setJobEvent(null); setResults([]); setAudit(null); setManifest(null)
    setError(''); setSelectedResult(null); setCompareList([]); setStartedAt(null)
  }

  const toggleCompare = result => setCompareList(current => {
    const exists = current.some(item => item.candidate.candidate_id === result.candidate.candidate_id)
    if (exists) return current.filter(item => item.candidate.candidate_id !== result.candidate.candidate_id)
    return current.length >= 2 ? [current[1], result] : [...current, result]
  })

  return (
    <>
      <ShaderBackground />
      <header className="app-header">
        <button className="brand" onClick={reset}>CIPHER<span>RANKER</span></button>
        <div className="header-status"><span className={`status-dot ${complete ? 'complete' : running ? 'loading' : engineStatus === 'unavailable' || error ? 'error' : engineStatus === 'ready' ? 'complete' : 'loading'}`} />
          {complete ? `Sealed run · ${Number(metrics.total || 0).toLocaleString()} candidates` : running ? 'Ranking engine running' : engineStatus === 'ready' ? 'Ranking engine ready' : engineStatus === 'unavailable' ? 'Ranking backend offline' : 'Checking ranking engine'}
        </div>
      </header>

      <main className="app-main">
        {!activeRun ? (
          <motion.section className="upload-first" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <p className="eyebrow">EVIDENCE-BOUND RANKING ENGINE</p>
            <h1>Rank every profile.<br />Prove every decision.</h1>
            <p className="intro">Stream 100,000 candidates through deterministic parallel scoring, independent Groq and Mistral review, honeypot detection, stability testing and validator-ready export.</p>
            {engineStatus === 'unavailable' && <div className="backend-warning">
              <strong>Ranking backend is not connected.</strong>
              <span>The static website is loaded, but uploads cannot be processed until a Node backend is configured.</span>
            </div>}
            <div className="upload-layout">
              <div className="upload-panel"><h2>Candidate dataset</h2><UploadZone onFileSelected={handleFile} disabled={running} />
                {!LOCAL_MODE && <p className="field-note">Hosted demo accepts smaller JSONL/JSON files. Run locally for the 487 MB official dataset to avoid Catalyst disk limits and get the fastest result.</p>}
                {LOCAL_MODE && <div className="local-path-row"><input value={localPath} onChange={event => setLocalPath(event.target.value)} placeholder="Or enter a local .jsonl path for the fastest demo" />
                  <button onClick={handleLocalPath} disabled={!localPath.trim()}>Run local</button></div>}
              </div>
              <div className="jd-panel"><label htmlFor="job-description">TARGET JOB DESCRIPTION</label>
                <textarea id="job-description" value={jdText} onChange={event => setJdText(event.target.value)} />
                <p className="field-note">The default challenge rubric is editable. Names and irrelevant personal fields are never scored.</p>
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <PipelinePanel event={jobEvent} startedAt={startedAt} />
            {error && <div className="error-banner">{error}</div>}
            {failed && <div className="run-banner failed-run">
              <div><p className="eyebrow">RUN STOPPED</p><strong>The ranking job did not start successfully.</strong><span>Review the message above, then reconnect the backend or start a new run.</span></div>
              <button className="secondary-button" onClick={reset}>Back to upload</button>
            </div>}
            {running && !showRankings && <div className="run-banner">
              <div>
                <p className="eyebrow">RUN IN PROGRESS</p>
                <strong>The system is actively processing this dataset.</strong>
                <span>{jobId ? 'Live server events are connected.' : 'File upload is still in progress; scoring starts as soon as the server receives it.'}</span>
              </div>
              <button className="secondary-button" onClick={reset}>Cancel / new run</button>
            </div>}
            {showRankings && <>
              <div className="results-toolbar">
                <div><p className="eyebrow">SEALED RANKING RUN</p><h1>{Number(metrics.total || 0).toLocaleString()} candidates analyzed</h1>
                  <p className="result-subtitle">{complete ? 'Top 100 shown · complete audit retained locally' : 'Preview is ready · final audits are still running'} · output {manifest?.outputSha256?.slice(0, 12) || 'pending'}</p></div>
                <div className="toolbar-actions">
                  {compareList.length === 2 && <button className="secondary-button" onClick={() => setShowCompare(true)}>Compare 2</button>}
                  <input aria-label="Participant ID" value={participantId} onChange={event => setParticipantId(event.target.value)} placeholder="team_xxx" className="participant-input" />
                  {complete && <ExportButton jobId={jobId} participantId={participantId} />}
                  {complete && <ExportButton jobId={jobId} participantId={participantId} type="audit-csv" label="Full Audit CSV" secondary />}
                  {complete && <ExportButton jobId={jobId} participantId={participantId} type="audit-json" label="Evidence JSON" secondary />}
                  <button className="danger-button" onClick={reset}>New run</button>
                </div>
              </div>
              {complete && <div className="provider-strip">
                {['groq', 'mistral'].map(name => { const provider = audit?.providers?.[name]; return <div className="provider-item" key={name}>
                  <span className={`provider-light ${provider?.ok ? 'ok' : 'failed'}`} /><strong>{name === 'groq' ? 'Groq' : 'Mistral'}</strong>
                  <span>{provider?.ok ? `${provider.model} · ${(provider.latencyMs / 1000).toFixed(1)}s · ${Math.round((provider.confidence || 0) * 100)}% confidence` : provider?.error || 'Unavailable'}</span>
                </div> })}
                <div className="provider-item consensus"><strong>Consensus</strong><span>{Math.round((audit?.providerAgreement || 0) * 100)}% provider agreement</span></div>
              </div>}
              {complete && <AuditPanel audit={audit} manifest={manifest} metrics={metrics} />}
              <StatCards results={results} />
              <div className="ranking-wrap"><RankingTable results={results} onSelect={setSelectedResult} compareList={compareList} onToggleCompare={toggleCompare} explanations={explanations} /></div>
            </>}
          </motion.section>
        )}
      </main>

      <AnimatePresence>{selectedResult && <CandidateDrawer result={selectedResult} onClose={() => setSelectedResult(null)} onCompare={toggleCompare} compareList={compareList} />}</AnimatePresence>
      {showCompare && <CompareModal compareList={compareList} onClose={() => setShowCompare(false)} onRemove={toggleCompare} />}
    </>
  )
}
