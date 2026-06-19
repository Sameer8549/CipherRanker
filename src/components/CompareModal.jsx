// CompareModal.jsx — Side-by-side comparison of 2 candidates

import { motion } from 'framer-motion'
import ScoreRadar from './ScoreRadar.jsx'

const COMPONENTS = [
  { key: 'career',     label: 'Career Track' },
  { key: 'skills',     label: 'Skill Match' },
  { key: 'experience', label: 'Experience' },
  { key: 'location',   label: 'Location' },
  { key: 'education',  label: 'Education' },
]

function CompCol({ result }) {
  if (!result) {
    return (
      <div
        style={{
          flex: 1,
          background: '#111111',
          border: '2px dashed #1f1f1f',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 300,
        }}
      >
        <p className="text-[#444] text-xs">Select a candidate to compare</p>
      </div>
    )
  }

  const { candidate, score, rank, components, bm } = result
  const profile = candidate.profile || {}
  const signals = candidate.redrob_signals || {}

  const scoreColor = score >= 0.7 ? '#CCFF00' : score >= 0.5 ? '#99cc00' : '#888'

  return (
    <div
      style={{
        flex: 1,
        background: '#111111',
        border: '1px solid #1f1f1f',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ background: '#1a1a1a', padding: '16px 20px', borderBottom: '1px solid #1f1f1f' }}>
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="font-mono text-accent text-xs font-bold">#{rank}</span>
          <span className="font-mono text-[#444] text-[10px]">
            {String(candidate.candidate_id).toUpperCase()}
          </span>
        </div>
        <p className="text-white font-bold text-sm">{profile.current_title || '—'}</p>
        <p className="text-[#888] text-xs mt-0.5">{profile.location} · {profile.years_of_experience} yrs</p>
      </div>

      <div style={{ padding: '20px' }}>
        {/* Score */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[10px] font-mono text-[#444] uppercase tracking-widest mb-1">Score</p>
            <span className="font-mono font-black text-3xl" style={{ color: scoreColor }}>
              {score.toFixed(4)}
            </span>
          </div>
          <ScoreRadar components={components} size={130} />
        </div>

        {/* Component bars */}
        <div style={{ borderTop: '1px solid #1f1f1f', paddingTop: 16 }}>
          {COMPONENTS.map(c => {
            const val = components?.[c.key] ?? 0
            const color = val >= 0.7 ? '#CCFF00' : val >= 0.4 ? '#99cc00' : '#444'
            return (
              <div key={c.key} className="flex items-center gap-3 py-1.5">
                <span className="text-[#888] text-[10px] w-20 shrink-0">{c.label}</span>
                <div style={{ flex: 1, height: 3, background: '#1f1f1f', borderRadius: 2 }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${val * 100}%`,
                      background: color,
                      borderRadius: 2,
                      transition: 'width 0.7s ease-out',
                    }}
                  />
                </div>
                <span className="font-mono text-[10px]" style={{ color, minWidth: 36 }}>
                  {val.toFixed(3)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Signals summary */}
        <div style={{ borderTop: '1px solid #1f1f1f', marginTop: 16, paddingTop: 16 }} className="grid grid-cols-2 gap-x-4 gap-y-2">
          {[
            ['BM',       bm?.toFixed(3)],
            ['Notice',   `${signals.notice_period_days ?? '—'}d`],
            ['Response', `${((signals.recruiter_response_rate ?? 0) * 100).toFixed(0)}%`],
            ['GitHub',   signals.github_activity_score === -1 ? 'N/A' : signals.github_activity_score],
            ['Open',     signals.open_to_work_flag ? 'Yes' : 'No'],
            ['Salary',   signals.expected_salary_range_inr_lpa ? `₹${signals.expected_salary_range_inr_lpa.min}L` : '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <span className="text-[#444] text-[9px] uppercase tracking-wider block">{label}</span>
              <span className="text-white text-xs font-mono">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CompareModal({ compareList, onClose, onRemove }) {
  const [a, b] = [compareList[0] ?? null, compareList[1] ?? null]

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 400,
        }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ type: 'spring', damping: 30, stiffness: 350 }}
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(900px, 95vw)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0a0a0a',
          border: '1px solid #1f1f1f',
          borderRadius: 8,
          zIndex: 401,
          padding: 24,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-accent text-xs font-mono tracking-widest uppercase mb-0.5">
              Side-by-Side Comparison
            </p>
            <p className="text-[#888] text-xs">
              {compareList.length}/2 candidates selected
            </p>
          </div>
          <div className="flex items-center gap-3">
            {compareList.map(r => (
              <button
                key={r.candidate.candidate_id}
                onClick={() => onRemove(r)}
                style={{
                  background: 'rgba(255,68,68,0.1)',
                  border: '1px solid rgba(255,68,68,0.2)',
                  color: '#FF4444',
                  borderRadius: 4,
                  padding: '3px 8px',
                  fontSize: 10,
                  cursor: 'pointer',
                }}
              >
                ✕ {String(r.candidate.candidate_id).slice(0, 10)}
              </button>
            ))}
            <button onClick={onClose} className="text-[#444] hover:text-white text-lg ml-2 transition-colors">
              ✕
            </button>
          </div>
        </div>

        {/* Columns */}
        <div className="flex gap-4">
          <CompCol result={a} />
          {/* VS divider */}
          <div className="flex flex-col items-center justify-center gap-2 shrink-0">
            <div style={{ width: 1, flex: 1, background: '#1f1f1f' }} />
            <span className="text-[#333] text-xs font-mono font-black">VS</span>
            <div style={{ width: 1, flex: 1, background: '#1f1f1f' }} />
          </div>
          <CompCol result={b} />
        </div>

        {/* Winner banner */}
        {a && b && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            style={{
              marginTop: 20,
              background: 'rgba(204,255,0,0.06)',
              border: '1px solid rgba(204,255,0,0.2)',
              borderRadius: 6,
              padding: '12px 20px',
              textAlign: 'center',
            }}
          >
            <span className="text-[#888] text-xs">Higher rank: </span>
            <span className="text-accent font-mono font-bold text-sm">
              #{Math.min(a.rank, b.rank)} — {a.rank < b.rank ? (a.candidate.profile?.current_title || a.candidate.candidate_id) : (b.candidate.profile?.current_title || b.candidate.candidate_id)}
            </span>
            <span className="text-[#444] text-xs ml-2">
              (Δ score: {Math.abs(a.score - b.score).toFixed(4)})
            </span>
          </motion.div>
        )}
      </motion.div>
    </>
  )
}
