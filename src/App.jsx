import { useCallback, useMemo, useRef, useState } from 'react'
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

const DEFAULT_JD = `Senior AI Engineer — Search, Retrieval and Ranking

Build production AI systems for semantic search, retrieval, ranking and recommendations. The ideal candidate has 5–9 years of experience, strong Python, embeddings, vector databases, information retrieval, evaluation metrics, RAG and modern NLP/LLM systems. Evidence of shipping production systems is required. Cloud, Docker, Kubernetes and MLOps are valuable. India-based candidates are preferred.`

const encodeHeader = text => btoa(unescape(encodeURIComponent(text)))

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
  const eventSourceRef = useRef(null)

  const complete = jobEvent?.phase === 'complete' && results.length > 0
  const running = Boolean(jobId) && !complete && jobEvent?.phase !== 'failed'
  const metrics = jobEvent?.metrics || {}

  const explanations = useMemo(() => Object.fromEntries(results.map(result => {
    const verified = result.ai?.providers?.filter(item => item.verified && item.explanation) || []
    return [result.candidate.candidate_id, verified.map(item => `${item.provider === 'groq' ? 'Groq' : 'Mistral'}: ${item.explanation}`).join('\n\n') || result.reasoning]
  })), [results])

  const loadCompletedJob = useCallback(async id => {
    const [resultsResponse, auditResponse, manifestResponse] = await Promise.all([
      fetch(`/api/jobs/${id}/results?limit=100`), fetch(`/api/jobs/${id}/audit`), fetch(`/api/jobs/${id}/manifest`)
    ])
    if (!resultsResponse.ok) throw new Error('Could not load ranked results')
    const ranked = await resultsResponse.json()
    setResults(ranked.results || [])
    setAudit(await auditResponse.json())
    setManifest(await manifestResponse.json())
  }, [])

  const connectEvents = useCallback(id => {
    eventSourceRef.current?.close()
    const source = new EventSource(`/api/jobs/${id}/events`)
    eventSourceRef.current = source
    source.onmessage = async event => {
      const update = JSON.parse(event.data)
      setJobEvent(update)
      if (update.phase === 'ranked') {
        try {
          const ranked = await fetch(`/api/jobs/${id}/results?limit=100`).then(response => response.json())
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
        const status = await fetch(`/api/jobs/${id}`).then(response => response.json())
        setJobEvent(status.lastEvent || status)
        if (status.status === 'complete') await loadCompletedJob(id)
        else if (status.status !== 'failed') setTimeout(() => connectEvents(id), 1000)
      } catch { setError('Lost connection to the local ranking engine.') }
    }
  }, [loadCompletedJob])

  const handleFile = useCallback(async file => {
    setError(''); setResults([]); setAudit(null); setManifest(null); setCompareList([])
    setStartedAt(Date.now()); setJobEvent({ phase: 'uploading', message: `Streaming ${file.name} to the local engine…`, metrics: { processed: 0 } })
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST', body: file,
        headers: { 'x-file-name': encodeURIComponent(file.name), 'x-job-description': encodeHeader(jdText) }
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Upload failed')
      setJobId(data.jobId)
      connectEvents(data.jobId)
    } catch (uploadError) { setError(uploadError.message); setJobEvent({ phase: 'failed' }) }
  }, [connectEvents, jdText])

  const handleLocalPath = useCallback(async () => {
    if (!localPath.trim()) return
    setError(''); setResults([]); setAudit(null); setManifest(null); setCompareList([]); setStartedAt(Date.now())
    setJobEvent({ phase: 'uploading', message: 'Hashing the local dataset without duplicating it…', metrics: { processed: 0 } })
    try {
      const response = await fetch('/api/jobs/local', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ localPath: localPath.trim(), jobDescription: jdText })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not open local dataset')
      setJobId(data.jobId); connectEvents(data.jobId)
    } catch (pathError) { setError(pathError.message); setJobEvent({ phase: 'failed' }) }
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
        <div className="header-status"><span className={`status-dot ${complete ? 'complete' : running ? 'loading' : error ? 'error' : ''}`} />
          {complete ? `Sealed run · ${Number(metrics.total || 0).toLocaleString()} candidates` : running ? 'Flagship engine running' : 'Local-first recruitment intelligence'}
        </div>
      </header>

      <main className="app-main">
        {!jobId ? (
          <motion.section className="upload-first" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <p className="eyebrow">EVIDENCE-BOUND RANKING ENGINE</p>
            <h1>Rank every profile.<br />Prove every decision.</h1>
            <p className="intro">Stream 100,000 candidates through deterministic parallel scoring, independent Groq and Mistral review, honeypot detection, stability testing and validator-ready export.</p>
            <div className="upload-layout">
              <div className="upload-panel"><h2>Candidate dataset</h2><UploadZone onFileSelected={handleFile} />
                <div className="local-path-row"><input value={localPath} onChange={event => setLocalPath(event.target.value)} placeholder="Or enter a local .jsonl path for the fastest demo" />
                  <button onClick={handleLocalPath} disabled={!localPath.trim()}>Run local</button></div>
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
            {complete && <>
              <div className="results-toolbar">
                <div><p className="eyebrow">SEALED RANKING RUN</p><h1>{Number(metrics.total || 0).toLocaleString()} candidates analyzed</h1>
                  <p className="result-subtitle">Top 100 shown · complete audit retained locally · output {manifest?.outputSha256?.slice(0, 12)}</p></div>
                <div className="toolbar-actions">
                  {compareList.length === 2 && <button className="secondary-button" onClick={() => setShowCompare(true)}>Compare 2</button>}
                  <input aria-label="Participant ID" value={participantId} onChange={event => setParticipantId(event.target.value)} placeholder="team_xxx" className="participant-input" />
                  <ExportButton jobId={jobId} participantId={participantId} />
                  <ExportButton jobId={jobId} participantId={participantId} type="audit-csv" label="Full Audit CSV" secondary />
                  <ExportButton jobId={jobId} participantId={participantId} type="audit-json" label="Evidence JSON" secondary />
                  <button className="danger-button" onClick={reset}>New run</button>
                </div>
              </div>
              <div className="provider-strip">
                {['groq', 'mistral'].map(name => { const provider = audit?.providers?.[name]; return <div className="provider-item" key={name}>
                  <span className={`provider-light ${provider?.ok ? 'ok' : 'failed'}`} /><strong>{name === 'groq' ? 'Groq' : 'Mistral'}</strong>
                  <span>{provider?.ok ? `${provider.model} · ${(provider.latencyMs / 1000).toFixed(1)}s · ${Math.round((provider.confidence || 0) * 100)}% confidence` : provider?.error || 'Unavailable'}</span>
                </div> })}
                <div className="provider-item consensus"><strong>Consensus</strong><span>{Math.round((audit?.providerAgreement || 0) * 100)}% provider agreement</span></div>
              </div>
              <AuditPanel audit={audit} manifest={manifest} metrics={metrics} />
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
