// ResultsView.jsx — Advanced results layout with drawer, compare, weight panel

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import StatCards       from './StatCards.jsx'
import RankingTable    from './RankingTable.jsx'
import ExportButton    from './ExportButton.jsx'
import CandidateDrawer from './CandidateDrawer.jsx'
import CompareModal    from './CompareModal.jsx'
import WeightPanel     from './WeightPanel.jsx'

const sectionVariant = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4 } },
  exit:    { opacity: 0, transition: { duration: 0.2 } },
}

export default function ResultsView({ results, onReset, onRerank }) {
  const [selected,    setSelected]    = useState(null)   // CandidateDrawer
  const [compareList, setCompareList] = useState([])      // up to 2 for CompareModal
  const [showCompare, setShowCompare] = useState(false)
  const [showWeights, setShowWeights] = useState(false)

  const handleToggleCompare = (result) => {
    setCompareList(prev => {
      const exists = prev.some(r => r.candidate.candidate_id === result.candidate.candidate_id)
      if (exists) return prev.filter(r => r.candidate.candidate_id !== result.candidate.candidate_id)
      if (prev.length >= 2) return [prev[1], result]  // replace oldest
      return [...prev, result]
    })
  }

  const handleRemoveCompare = (result) => {
    setCompareList(prev => prev.filter(r => r.candidate.candidate_id !== result.candidate.candidate_id))
  }

  return (
    <>
      <motion.section
        variants={sectionVariant}
        initial="hidden" animate="visible" exit="exit"
        className="relative z-10 px-6 pt-20 pb-24 max-w-[1500px] mx-auto"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <p className="text-accent text-[10px] font-mono tracking-[0.22em] uppercase mb-1">
              RESULTS — SENIOR AI ENGINEER JD
            </p>
            <h2 className="text-white text-xl font-black tracking-tight">
              {results.length} candidates ranked
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Compare button (shown when 2 selected) */}
            {compareList.length === 2 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowCompare(true)}
                style={{
                  background: 'rgba(204,255,0,0.1)',
                  border: '1px solid #CCFF00',
                  color: '#CCFF00',
                  borderRadius: 6,
                  padding: '7px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ⇄ Compare ({compareList.length})
              </motion.button>
            )}

            {compareList.length === 1 && (
              <span className="text-[#888] text-xs border border-[#1f1f1f] px-3 py-2 rounded-[6px]">
                Select 1 more to compare
              </span>
            )}

            {/* Weight panel trigger */}
            <button
              onClick={() => setShowWeights(true)}
              style={{
                background: 'transparent',
                border: '1px solid #1f1f1f',
                color: '#888',
                borderRadius: 6,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.target.style.borderColor = '#333'; e.target.style.color = '#fff' }}
              onMouseLeave={e => { e.target.style.borderColor = '#1f1f1f'; e.target.style.color = '#888' }}
            >
              ⚖ Weights
            </button>

            {/* Export */}
            <ExportButton results={results} />

            <button
              onClick={onReset}
              style={{
                background: 'transparent',
                border: '1px solid #1f1f1f',
                color: '#888',
                borderRadius: 6,
                padding: '7px 14px',
                fontSize: 12,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.target.style.color = '#fff' }}
              onMouseLeave={e => { e.target.style.color = '#888' }}
            >
              ← Upload new
            </button>
          </div>
        </div>

        {/* Stat cards + histogram */}
        <StatCards results={results} />

        {/* Divider */}
        <div className="border-t border-[#1f1f1f] mb-5" />

        {/* Table hint */}
        <p className="text-[#444] text-[10px] font-mono mb-3">
          ✦ Click any row to inspect full profile &nbsp;·&nbsp; ☐ Check boxes to compare two candidates
        </p>

        {/* Table */}
        <RankingTable
          results={results}
          onSelect={setSelected}
          compareList={compareList}
          onToggleCompare={handleToggleCompare}
        />
      </motion.section>

      {/* ── Overlays ── */}
      <AnimatePresence>
        {selected && (
          <CandidateDrawer
            key="drawer"
            result={selected}
            onClose={() => setSelected(null)}
            onCompare={handleToggleCompare}
            compareList={compareList}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCompare && compareList.length === 2 && (
          <CompareModal
            key="compare"
            compareList={compareList}
            onClose={() => setShowCompare(false)}
            onRemove={handleRemoveCompare}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWeights && (
          <WeightPanel
            key="weights"
            isOpen={showWeights}
            onClose={() => setShowWeights(false)}
            onRerank={onRerank}
          />
        )}
      </AnimatePresence>
    </>
  )
}
