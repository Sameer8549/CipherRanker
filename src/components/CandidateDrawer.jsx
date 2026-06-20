// CandidateDrawer.jsx — Full-profile slide-over for a selected candidate

import { motion, AnimatePresence } from 'framer-motion'
import ScoreRadar from './ScoreRadar.jsx'
import ScoreBar   from './ScoreBar.jsx'

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <p className="text-[10px] font-mono text-[#444] uppercase tracking-[0.18em] mb-3">
        {title}
      </p>
      {children}
    </div>
  )
}

function Row({ label, value, accent }) {
  return (
    <div className="flex items-baseline justify-between py-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
      <span className="text-[#888] text-xs">{label}</span>
      <span
        className="font-mono text-xs font-semibold"
        style={{ color: accent ? '#CCFF00' : '#ffffff' }}
      >
        {value ?? '—'}
      </span>
    </div>
  )
}

function SkillPill({ skill }) {
  const colors = {
    expert:       { bg: 'rgba(204,255,0,0.12)',  color: '#CCFF00' },
    advanced:     { bg: 'rgba(0,255,136,0.10)',  color: '#00FF88' },
    intermediate: { bg: 'rgba(255,136,0,0.10)',  color: '#F0883E' },
    beginner:     { bg: 'rgba(255,255,255,0.05)', color: '#888888' },
  }
  const s = colors[skill.proficiency] || colors.beginner
  return (
    <div
      style={{
        background: s.bg,
        border: `1px solid ${s.color}30`,
        borderRadius: 4,
        padding: '4px 8px',
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <span style={{ color: '#ffffff', fontSize: 11, fontWeight: 600 }}>{skill.name}</span>
      <span style={{ color: s.color, fontSize: 9, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
        {skill.proficiency?.toUpperCase()} · {skill.duration_months ?? 0}mo · {skill.endorsements ?? 0} ✦
      </span>
    </div>
  )
}

function ComponentBar({ label, value, weight }) {
  const color = value >= 0.7 ? '#CCFF00' : value >= 0.4 ? '#99cc00' : '#444444'
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-[#888] text-xs w-20 shrink-0">{label}</span>
      <div style={{ flex: 1, height: 3, background: '#1f1f1f', borderRadius: 2, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${value * 100}%`,
            background: color,
            transition: 'width 0.7s ease-out',
          }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums" style={{ color, minWidth: 36 }}>
        {value.toFixed(3)}
      </span>
      <span className="text-[#444] text-[10px] font-mono w-10 text-right">
        ×{(weight * 100).toFixed0 ? (weight * 100).toFixed(0) : Math.round(weight * 100)}%
      </span>
    </div>
  )
}

const WEIGHT_LABELS = {
  career: 'Career', skills: 'Skills',
  experience: 'Exp.', location: 'Location', education: 'Education',
}
const DEFAULT_WEIGHTS = { career: 0.30, skills: 0.25, experience: 0.15, location: 0.15, education: 0.05 }

export default function CandidateDrawer({ result, onClose, onCompare, compareList }) {
  if (!result) return null

  const { candidate, score, rank, components, bm, reasoning, isHoneypot, honeypot, evidence = [], stability, ai, baselineRank, rankDelta } = result
  const profile  = candidate.profile  || {}
  const signals  = candidate.redrob_signals || {}
  const skills   = candidate.skills   || []
  const history  = candidate.career_history || []
  const education = candidate.education || []

  const inCompare = compareList?.some(r => r.candidate.candidate_id === candidate.candidate_id)

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.65)',
          zIndex: 300,
          backdropFilter: 'blur(6px)',
        }}
      />

      {/* Drawer */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(520px, 100vw)',
          background: '#111111',
          borderLeft: '1px solid #1f1f1f',
          zIndex: 301,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Sticky header */}
        <div
          style={{
            position: 'sticky', top: 0,
            background: '#111111',
            borderBottom: '1px solid #1f1f1f',
            padding: '16px 24px',
            zIndex: 10,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-mono text-accent text-xs font-bold">#{rank}</span>
                {isHoneypot && (
                  <span className="badge badge-red text-[9px]">HONEYPOT</span>
                )}
              </div>
              <h3 className="text-white font-bold text-base leading-tight">
                {profile.anonymized_name || profile.current_title || 'Unknown Candidate'}
              </h3>
              <p className="text-[#888] text-xs mt-0.5 font-mono">
                {String(candidate.candidate_id).toUpperCase()} · {profile.current_title || 'Unknown Title'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onCompare(result)}
                style={{
                  background: inCompare ? 'rgba(204,255,0,0.15)' : 'transparent',
                  border: `1px solid ${inCompare ? '#CCFF00' : '#1f1f1f'}`,
                  color: inCompare ? '#CCFF00' : '#888',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {inCompare ? '✓ Compare' : '+ Compare'}
              </button>
              <button
                onClick={onClose}
                className="text-[#444] hover:text-white transition-colors text-lg"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', flex: 1 }}>

          {/* Score + Radar side by side */}
          <div className="flex gap-6 items-start mb-8">
            <div style={{ flex: 1 }}>
              <div className="mb-1">
                <span className="text-[10px] font-mono text-[#444] uppercase tracking-widest">
                  Final Score
                </span>
              </div>
              <div
                className="font-mono font-black tabular-nums"
                style={{
                  fontSize: 42,
                  color: score >= 0.7 ? '#CCFF00' : score >= 0.5 ? '#99cc00' : '#888',
                  lineHeight: 1,
                }}
              >
                {score.toFixed(4)}
              </div>
              <div className="mt-3">
                <ScoreBar score={score} />
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">
                <span className="text-[#888] text-xs">BM: <span className="text-white font-mono">{bm?.toFixed(3)}</span></span>
                <span className="text-[#444]">·</span>
                <span className="text-[#888] text-xs">{profile.years_of_experience} yrs</span>
                <span className="text-[#444]">·</span>
                <span className="text-[#888] text-xs">{profile.location}</span>
              </div>
            </div>
            <ScoreRadar components={components} size={180} />
          </div>

          {/* Component breakdown */}
          <Section title="Component Breakdown">
            {Object.entries(WEIGHT_LABELS).map(([key, label]) => (
              <ComponentBar
                key={key}
                label={label}
                value={components?.[key] ?? 0}
                weight={DEFAULT_WEIGHTS[key]}
              />
            ))}
          </Section>

          {/* Reasoning */}
          <Section title="Recruiter Reasoning">
            <p className="text-[#888] text-xs leading-relaxed">{reasoning}</p>
          </Section>

          <Section title="Rank Confidence">
            <Row label="Baseline Rank" value={baselineRank ? `#${baselineRank}` : '—'} />
            <Row label="Consensus Movement" value={`${rankDelta > 0 ? '+' : ''}${rankDelta || 0}`} accent={rankDelta > 0} />
            <Row label="Stability" value={`${Math.round((stability?.stability || 0) * 100)}%`} accent={(stability?.stability || 0) >= 0.9} />
            <Row label="Top-100 Probability" value={`${Math.round((stability?.inclusionProbability || 0) * 100)}%`} />
            <Row label="AI Consensus Fit" value={ai?.consensusFit != null ? `${ai.consensusFit}/100` : 'Not individually audited'} />
            <Row label="Provider Disagreement" value={ai?.disagreement != null ? `${ai.disagreement} points` : '—'} />
          </Section>

          <Section title="Evidence Graph">
            <div className="evidence-list">
              {evidence.map(item => <div className="evidence-item" key={item.component}>
                <div><strong>{item.label}</strong><span>{item.source}</span></div>
                <p>{item.fact}</p><code>{Math.round(item.score * 100)}%</code>
              </div>)}
            </div>
          </Section>

          {honeypot?.findings?.length > 0 && <Section title={`Risk Evidence · ${Math.round((honeypot.risk || 0) * 100)}%`}>
            <div className="risk-list">{honeypot.findings.map((finding, index) => <div key={`${finding.code}-${index}`}>
              <strong>{finding.code.replaceAll('_', ' ')}</strong><p>{finding.message}</p>
            </div>)}</div>
          </Section>}

          {/* Profile */}
          <Section title="Profile">
            <Row label="Title"    value={profile.current_title} />
            <Row label="Location" value={`${profile.location}, ${profile.country}`} />
            <Row label="YOE"      value={`${profile.years_of_experience} years`} />
            <Row label="Country"  value={profile.country} />
          </Section>

          {/* Behavioral signals */}
          <Section title="Behavioral Signals">
            <Row label="Last Active"          value={signals.last_active_date} />
            <Row label="Open to Work"         value={signals.open_to_work_flag ? 'Yes ✓' : 'No'} accent={signals.open_to_work_flag} />
            <Row label="Notice Period"        value={`${signals.notice_period_days ?? '—'} days`} />
            <Row label="GitHub Score"         value={signals.github_activity_score === -1 ? 'N/A' : signals.github_activity_score} accent={(signals.github_activity_score ?? 0) > 50} />
            <Row label="Response Rate"        value={`${((signals.recruiter_response_rate ?? 0) * 100).toFixed(0)}%`} accent={(signals.recruiter_response_rate ?? 0) >= 0.5} />
            <Row label="Interview Completion" value={`${((signals.interview_completion_rate ?? 0) * 100).toFixed(0)}%`} />
            <Row label="Offer Acceptance"     value={`${((signals.offer_acceptance_rate ?? 0) * 100).toFixed(0)}%`} />
            <Row label="Salary Range"         value={signals.expected_salary_range_inr_lpa ? `₹${signals.expected_salary_range_inr_lpa.min}–${signals.expected_salary_range_inr_lpa.max}L` : '—'} />
            <Row label="Verified"             value={[signals.verified_email && 'Email', signals.verified_phone && 'Phone'].filter(Boolean).join(' · ') || 'None'} />
            <Row label="Willing to Relocate"  value={signals.willing_to_relocate ? 'Yes' : 'No'} />
          </Section>

          {/* Skills */}
          {skills.length > 0 && (
            <Section title={`Skills (${skills.length})`}>
              <div className="flex flex-wrap gap-2">
                {skills.map((s, i) => <SkillPill key={i} skill={s} />)}
              </div>
            </Section>
          )}

          {/* Career history */}
          {history.length > 0 && (
            <Section title="Career History">
              {history.map((h, i) => (
                <div
                  key={i}
                  style={{ borderLeft: '2px solid #1f1f1f', paddingLeft: 14, marginBottom: 16 }}
                >
                  <p className="text-white text-xs font-semibold">{h.title}</p>
                  <p className="text-accent text-xs font-mono">{h.company}</p>
                  <p className="text-[#444] text-[10px] mt-0.5">{h.duration_months} months</p>
                  {h.description && (
                    <p className="text-[#888] text-[10px] mt-1 leading-relaxed">{h.description}</p>
                  )}
                </div>
              ))}
            </Section>
          )}

          {/* Education */}
          {education.length > 0 && (
            <Section title="Education">
              {education.map((e, i) => (
                <div key={i} className="py-2" style={{ borderBottom: '1px solid #1a1a1a' }}>
                  <p className="text-white text-xs font-semibold">{e.degree} · {e.field_of_study}</p>
                  <p className="text-[#888] text-[10px] mt-0.5">
                    {e.institution}
                    {e.tier && <span className="text-accent font-mono ml-2">[{e.tier?.replace('_', ' ').toUpperCase()}]</span>}
                  </p>
                </div>
              ))}
            </Section>
          )}

        </div>
      </motion.div>
    </>
  )
}
