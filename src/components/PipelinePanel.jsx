import { useEffect, useState } from 'react'

const STAGES = [
  ['uploading', 'Upload'], ['rubric', 'AI rubric'], ['features', 'Feature cache'], ['parsing', 'Parse'], ['scoring', 'Score'],
  ['ranked', 'Ranked'], ['honeypot', 'Risk audit'], ['stability', 'Stability'], ['verification', 'AI verify'], ['complete', 'Validated']
]

export default function PipelinePanel({ event, startedAt }) {
  const [, setTick] = useState(0)
  const phase = event?.phase || 'uploading'
  const current = Math.max(0, STAGES.findIndex(([key]) => key === phase))
  const metrics = event?.metrics || {}
  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0
  const total = Number(metrics.total || metrics.parsed || 0)
  const processed = Number(metrics.processed || metrics.featurePrepared || 0)
  const knownPercent = total ? Math.min(100, processed / total * 100) : null
  const phasePercent = current >= 0 ? Math.min(96, ((current + 0.35) / STAGES.length) * 100) : 8
  const percent = phase === 'complete' ? 100 : knownPercent ?? phasePercent

  useEffect(() => {
    if (phase === 'complete' || phase === 'failed') return undefined
    const timer = setInterval(() => setTick(value => value + 1), 500)
    return () => clearInterval(timer)
  }, [phase])

  return (
    <section className={`pipeline-panel ${phase === 'failed' ? 'failed' : ''}`}>
      <div className="pipeline-head">
        <div><p className="eyebrow">LIVE EXECUTION</p><strong>{event?.message || 'Preparing local ranking engine…'}</strong></div>
        <div className="pipeline-metrics">
          <span>{processed.toLocaleString()} records</span>
          <span>{Number(metrics.recordsPerSecond || metrics.featureRecordsPerSecond || 0).toLocaleString()}/s</span>
          <span>{elapsed.toFixed(1)}s</span>
        </div>
      </div>
      <div className="pipeline-progress"><div style={{ width: `${percent}%` }} /></div>
      <div className="pipeline-stages">
        {STAGES.map(([key, label], index) => <div key={key} className={`pipeline-stage ${index < current ? 'done' : index === current ? 'active' : ''}`}><span />{label}</div>)}
      </div>
    </section>
  )
}
