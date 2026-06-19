// StatCards.jsx — Advanced stat cards with count-up + histogram + extra metrics

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import ScoreHistogram from './ScoreHistogram.jsx'

function useCountUp(target, duration = 1000) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!target) return
    const steps    = 40
    const interval = duration / steps
    let step = 0
    const timer = setInterval(() => {
      step++
      setVal(Math.round((step / steps) * target))
      if (step >= steps) { clearInterval(timer); setVal(target) }
    }, interval)
    return () => clearInterval(timer)
  }, [target, duration])
  return val
}

function Card({ label, value, display, accent, delay, sub }) {
  const animated = useCountUp(typeof value === 'number' ? value : 0)
  const shown = display ?? animated

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="bg-surface border border-[#1f1f1f] p-4 rounded-[6px] flex flex-col gap-1"
    >
      <span className="text-[10px] font-mono text-[#444] uppercase tracking-[0.18em]">
        {label}
      </span>
      <span
        className="font-mono font-black text-xl tabular-nums"
        style={{ color: accent ?? '#CCFF00' }}
      >
        {shown}
      </span>
      {sub && <span className="text-[#444] text-[10px] font-mono">{sub}</span>}
    </motion.div>
  )
}

export default function StatCards({ results }) {
  if (!results?.length) return null

  const total      = results.length
  const honeypots  = results.filter(r => r.isHoneypot).length
  const clean      = results.filter(r => !r.isHoneypot)
  const topScore   = results[0]?.score ?? 0
  const scores     = clean.map(r => r.score).sort((a, b) => a - b)
  const median     = scores[Math.floor(scores.length / 2)] ?? 0
  const avg        = scores.reduce((a, b) => a + b, 0) / (scores.length || 1)
  const top10      = results.slice(0, 10)
  const avgRR      = top10.reduce((s, r) => s + (r.candidate.redrob_signals?.recruiter_response_rate ?? 0), 0) / (top10.length || 1)
  const openCount  = results.filter(r => r.candidate.redrob_signals?.open_to_work_flag).length
  const p90score   = scores[Math.floor(scores.length * 0.9)] ?? 0

  return (
    <div className="mb-6">
      {/* Top row of cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 mb-4">
        <Card label="Candidates"   value={total}    delay={0}     />
        <Card label="Top Score"    display={topScore.toFixed(4)}   delay={0.06}  />
        <Card label="Honeypots"    value={honeypots} accent={honeypots > 0 ? '#FF4444' : '#CCFF00'} delay={0.12} />
        <Card label="Open to Work" value={openCount} accent="#00FF88" delay={0.18} />
        <Card label="Median Score" display={median.toFixed(4)}     delay={0.24}  />
        <Card label="Avg Score"    display={avg.toFixed(4)}        delay={0.30}  />
        <Card label="P90 Score"    display={p90score.toFixed(4)}   delay={0.36}  />
        <Card label="Avg Response" display={`${(avgRR * 100).toFixed(0)}%`} delay={0.42} />
      </div>

      {/* Score histogram */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        style={{
          background: '#111111',
          border: '1px solid #1f1f1f',
          borderRadius: 6,
          padding: '14px 18px',
        }}
      >
        <ScoreHistogram results={results} />
      </motion.div>
    </div>
  )
}
