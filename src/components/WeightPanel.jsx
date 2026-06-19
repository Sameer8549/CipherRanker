// WeightPanel.jsx — Live scoring weight sliders with instant re-ranking

import { useState } from 'react'
import { motion } from 'framer-motion'

const COMPONENTS = [
  { key: 'career',     label: 'Career Track',   default: 30, description: 'Title quality + company type + product signals' },
  { key: 'skills',     label: 'Skill Match',     default: 25, description: 'Must-have vs nice-to-have keyword overlap' },
  { key: 'experience', label: 'Experience',      default: 15, description: 'Years in sweet spot (5–9 yrs = 1.0)' },
  { key: 'location',   label: 'Location',        default: 15, description: 'Preferred city / India / willing to relocate' },
  { key: 'education',  label: 'Education',       default: 5,  description: 'Tier of institution + field of study' },
]

export default function WeightPanel({ onRerank, isOpen, onClose }) {
  const [weights, setWeights] = useState(
    Object.fromEntries(COMPONENTS.map(c => [c.key, c.default]))
  )

  const total = Object.values(weights).reduce((a, b) => a + b, 0)

  const setW = (key, val) => setWeights(prev => ({ ...prev, [key]: Number(val) }))

  const handleApply = () => {
    const normalized = {}
    for (const c of COMPONENTS) normalized[c.key] = weights[c.key] / total
    onRerank(normalized)
    onClose()
  }

  const handleReset = () => {
    setWeights(Object.fromEntries(COMPONENTS.map(c => [c.key, c.default])))
  }

  if (!isOpen) return null

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
          background: 'rgba(0,0,0,0.6)',
          zIndex: 200,
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 360,
          background: '#111111',
          borderLeft: '1px solid #1f1f1f',
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #1f1f1f' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-accent text-xs font-mono tracking-widest uppercase">
              Scoring Weights
            </span>
            <button onClick={onClose} className="text-[#444] hover:text-white transition-colors text-lg">
              ✕
            </button>
          </div>
          <p className="text-[#888] text-xs">
            Adjust component weights and re-rank instantly.
          </p>
        </div>

        {/* Sliders */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }} className="flex flex-col gap-6">
          {COMPONENTS.map(c => {
            const pct = total > 0 ? ((weights[c.key] / total) * 100).toFixed(1) : '0'
            return (
              <div key={c.key}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-white text-xs font-semibold">{c.label}</span>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-accent text-sm font-bold">{pct}%</span>
                    <span className="text-[#444] text-xs font-mono">({weights[c.key]})</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0} max={60} step={1}
                  value={weights[c.key]}
                  onChange={e => setW(c.key, e.target.value)}
                  style={{
                    width: '100%',
                    accentColor: '#CCFF00',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                />
                <p className="text-[#444] text-[10px] mt-1">{c.description}</p>
              </div>
            )
          })}

          {/* Total indicator */}
          <div
            style={{
              background: '#1a1a1a',
              border: `1px solid ${total === 100 ? '#CCFF00' : '#1f1f1f'}`,
              borderRadius: 6,
              padding: '10px 14px',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[#888] text-xs font-mono">Total weight</span>
              <span
                className="font-mono text-sm font-bold"
                style={{ color: total === 100 ? '#CCFF00' : '#F0883E' }}
              >
                {total} / 100
              </span>
            </div>
            <div
              style={{
                height: 2,
                background: '#1f1f1f',
                marginTop: 8,
                borderRadius: 1,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(total, 100)}%`,
                  background: total === 100 ? '#CCFF00' : '#F0883E',
                  transition: 'width 0.2s, background 0.2s',
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div
          style={{ padding: '16px 24px', borderTop: '1px solid #1f1f1f' }}
          className="flex gap-3"
        >
          <button
            onClick={handleReset}
            className="flex-1 text-[#888] text-xs border border-[#1f1f1f] py-2 rounded-[6px] hover:text-white hover:border-[#333] transition-colors"
          >
            Reset defaults
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleApply}
            disabled={total === 0}
            className="flex-1 bg-accent text-black text-xs font-bold py-2 rounded-[6px] disabled:opacity-40"
          >
            Apply & Re-rank →
          </motion.button>
        </div>
      </motion.div>
    </>
  )
}
