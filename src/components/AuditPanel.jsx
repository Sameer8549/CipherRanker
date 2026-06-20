function Metric({ label, value, tone }) {
  return <div className="audit-metric"><span>{label}</span><strong style={{ color: tone || '#fff' }}>{value}</strong></div>
}

export default function AuditPanel({ audit, manifest, metrics }) {
  if (!audit) return null
  return (
    <section className="audit-panel">
      <div className="audit-grid">
        <Metric label="Provider agreement" value={`${Math.round((audit.providerAgreement || 0) * 100)}%`} tone="#CCFF00" />
        <Metric label="Explicit honeypots" value={Number(audit.honeypots || 0).toLocaleString()} tone={audit.honeypots ? '#FF6B6B' : '#00D084'} />
        <Metric label="Unstable top 100" value={audit.unstableTop100 || 0} />
        <Metric label="Total runtime" value={`${((metrics?.totalMs || 0) / 1000).toFixed(1)}s`} />
        <Metric label="Worker threads" value={metrics?.workerCount || 1} />
        <Metric label="Risk review queue" value={Number(audit.riskReviews || 0).toLocaleString()} tone={audit.riskReviews ? '#F0B429' : '#00D084'} />
      </div>
      <div className="privacy-strip">
        <strong>Privacy boundary</strong>
        <span>Names excluded from scoring</span><span>Full dataset stays local</span><span>Only {audit.privacy?.individuallyAuditedByAI || 0} shortlisted summaries sent to AI</span>
        <code>{manifest?.outputSha256?.slice(0, 12)}</code>
      </div>
    </section>
  )
}
